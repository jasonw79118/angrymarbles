import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {startGame,possibleSeats,COLORS} from '../../src/engine.js';
import geometry from '../../pb_hooks/boardGeometry.cjs';

export async function createHarness(port=0){
  const buildResult=await build({entryPoints:[new URL('./fixture-worker.ts',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')],bundle:true,format:'esm',platform:'browser',write:false});
  const mf=new Miniflare(convertV4MiniflareOptions({port,host:'127.0.0.1',name:'trapdoor-qa',script:buildResult.outputFiles[0].text,modules:true,
    compatibilityDate:'2026-10-12',
    d1Databases:{DB:'trapdoor-test-db'},durableObjects:{GAME_ROOMS:{className:'GameRoom',useSQLite:true}},
    bindings:{ALLOWED_ORIGINS:'http://127.0.0.1:5180,http://127.0.0.1:5179'}}));
  await mf.ready;
  const db=await mf.getD1Database('DB');
  for(const file of (await fs.readdir(new URL('../../worker/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()){
    const sql=await fs.readFile(new URL('../../worker/migrations/'+file,import.meta.url),'utf8');
    for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  }
  const tokens={};
  for(const [id,name] of [['qa-host','Trapdoor Visual Test'],['qa-observer','Trapdoor Observer']]){
    await db.prepare('INSERT INTO accounts(id,email,email_lower,display_name,password_hash,created_at) VALUES(?,?,?,?,?,?)').bind(id,id+'@example.test',id+'@example.test',name,'local-fixture-only',Date.now()).run();
    await db.prepare('INSERT INTO player_stats(user_id) VALUES(?)').bind(id).run();
    const token=crypto.randomBytes(32).toString('hex');tokens[id]=token;
    await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(crypto.createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000,Date.now()).run();
  }
  const ns=await mf.getDurableObjectNamespace('GAME_ROOMS');
  function makeRoom(n=4,code='EMPTY4',bots=false){
    const room={code,hostId:'qa-host',mode:'doubles',capacity:n,status:'waiting',visibility:'private',createdAt:Date.now(),fillAt:null,startedCountdown:false,waitSeconds:120,preferredRelation:'against',statEvents:[],winners:null,
      players:possibleSeats('doubles',n).map(seat=>({id:seat===0?'qa-host':seat===1&&!bots?'qa-observer':`bot-${seat}`,name:seat===0?'Trapdoor Visual Test':seat===1&&!bots?'Trapdoor Observer':`Computer ${seat+1}`,seat,isBot:seat!==0&&(seat!==1||bots),color:COLORS[seat]}))};
    startGame(room);
    for(const p of room.players)room.hands[p.seat]=[{id:'0:♠:K',rank:'K',suit:'♠'},{id:'0:♥:8',rank:'8',suit:'♥'},{id:'0:♣:7',rank:'7',suit:'♣'},{id:'0:♦:A',rank:'A',suit:'♦'},{id:'0:♠:3',rank:'3',suit:'♠'}];
    return room;
  }
  async function seed(room){const stub=ns.get(ns.idFromName(room.code));const r=await stub.fetch('http://internal/__seed',{method:'POST',body:JSON.stringify(room)});if(!r.ok)throw Error('Seed failed');}
  async function request(path,body,user='qa-host'){
    const r=await mf.dispatchFetch('http://test/api'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+tokens[user],'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const payload=await r.json();return {status:r.status,body:payload};
  }
  function at(room,id,index){const p=room.pieces.find(p=>p.id===id);Object.assign(p,{loc:'track',progress:((index-geometry.startIndex(p.seat))%(room.boardSides*18)+room.boardSides*18)%(room.boardSides*18),run:-1});return p;}
  return {mf,ns,tokens,makeRoom,seed,request,at,dispose:()=>mf.dispose()};
}
