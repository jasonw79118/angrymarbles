import { GameRoom } from './GameRoom';
import { hashPassword, hashToken, newSessionToken, verifyPassword } from './auth';

export { GameRoom };

interface Env {
  DB: D1Database;
  GAME_ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
}
type Account={id:string;email:string;email_lower:string;display_name:string;password_hash:string;created_at:number};
const encoder=new TextEncoder();
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const json=(body:unknown,status=200)=>Response.json(body,{status});
const error=(message:string,status=400)=>json({message},status);

function cors(response:Response,origin:string|null):Response{
  const headers=new Headers(response.headers);
  if(origin){headers.set('access-control-allow-origin',origin);headers.set('vary','Origin');}
  headers.set('access-control-allow-methods','GET,POST,OPTIONS');
  headers.set('access-control-allow-headers','Content-Type,Authorization');
  headers.set('access-control-max-age','86400');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
async function body(request:Request):Promise<Record<string,unknown>>{
  try{const data=await request.json();return data&&typeof data==='object'?data as Record<string,unknown>:{};}catch{return {};}
}
async function currentAccount(request:Request,env:Env):Promise<Account|null>{
  const authorization=request.headers.get('authorization')||'';
  const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  if(!/^[\da-f]{64}$/i.test(token))return null;
  const now=Date.now(),tokenHash=await hashToken(token);
  return await env.DB.prepare(`SELECT accounts.id,accounts.email,accounts.email_lower,accounts.display_name,accounts.password_hash,accounts.created_at
    FROM sessions JOIN accounts ON accounts.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?`)
    .bind(tokenHash,now).first<Account>();
}
async function createSession(env:Env,account:Account):Promise<string>{
  const token=newSessionToken(),now=Date.now(),expires=now+30*24*60*60*1000;
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
    .bind(await hashToken(token),account.id,expires,now).run();
  return token;
}
async function profile(env:Env,account:Account){
  const stats=await env.DB.prepare('SELECT games,wins,losses,bumps,assists FROM player_stats WHERE user_id=?').bind(account.id).first<{games:number;wins:number;losses:number;bumps:number;assists:number}>();
  return {userId:account.id,displayName:account.display_name,games:stats?.games||0,wins:stats?.wins||0,losses:stats?.losses||0,bumps:stats?.bumps||0,assists:stats?.assists||0};
}
function roomStub(env:Env,code:string):DurableObjectStub{
  return env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code));
}
async function roomRequest(env:Env,code:string,userId:string|null,path:string,method:string,data?:unknown,upgrade?:string|null):Promise<Response>{
  const headers=new Headers();
  if(userId)headers.set('x-am-user-id',userId);
  if(upgrade)headers.set('Upgrade',upgrade);
  if(data!==undefined)headers.set('content-type','application/json');
  return await roomStub(env,code).fetch(new Request(`https://room.internal${path}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}));
}
function newRoomCode():string{
  const bytes=crypto.getRandomValues(new Uint8Array(8));
  let code='';for(const byte of bytes)code+=alphabet[byte%alphabet.length];
  return code.slice(0,6);
}
async function route(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,method=request.method;
  const roomMatch=path.match(/^\/api\/angry-marbles\/room\/([A-HJ-NP-Z2-9]{6})(\/events(?:-ticket)?)?$/i);
  if(path==='/api/health')return json({status:'ok',service:'angry-marbles-api'});
  if(path==='/api/auth/register'&&method==='POST'){
    const data=await body(request),email=String(data.email||'').trim().toLowerCase(),name=String(data.name||'').trim(),password=String(data.password||'');
    if(name.length<2||name.length>24)return error('Choose a player name between 2 and 24 characters.');
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error('Enter a valid email address.');
    if(password.length<10||password.length>128)return error('Password must be between 10 and 128 characters.');
    const account:Account={id:crypto.randomUUID().replaceAll('-','').slice(0,15),email,email_lower:email,display_name:name,password_hash:await hashPassword(password),created_at:Date.now()};
    try{
      await env.DB.batch([
        env.DB.prepare('INSERT INTO accounts(id,email,email_lower,display_name,password_hash,created_at) VALUES(?,?,?,?,?,?)').bind(account.id,account.email,account.email_lower,account.display_name,account.password_hash,account.created_at),
        env.DB.prepare('INSERT INTO player_stats(user_id) VALUES(?)').bind(account.id),
      ]);
    }catch{return error('An account with that email may already exist.',409);}
    const token=await createSession(env,account);
    return json({token,profile:await profile(env,account)},201);
  }
  if(path==='/api/auth/login'&&method==='POST'){
    const data=await body(request),identity=String(data.email||'').trim().toLowerCase(),password=String(data.password||'');
    const account=await env.DB.prepare('SELECT * FROM accounts WHERE email_lower=?').bind(identity).first<Account>();
    if(!account||!await verifyPassword(password,account.password_hash))return error('Email or password is incorrect.',401);
    return json({token:await createSession(env,account),profile:await profile(env,account)});
  }
  if(roomMatch?.[2]==='/events'&&method==='GET'){
    return roomRequest(env,roomMatch[1].toUpperCase(),null,`/events${url.search}`,'GET',undefined,request.headers.get('upgrade')||'websocket');
  }
  const account=await currentAccount(request,env);
  if(!account)return error('Sign in required.',401);
  if(path==='/api/auth/me'&&method==='GET')return json({profile:await profile(env,account)});
  if(path==='/api/auth/logout'&&method==='POST'){
    const token=(request.headers.get('authorization')||'').slice(7);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hashToken(token)).run();
    return json({ok:true});
  }
  if(path==='/api/angry-marbles/profile'&&method==='GET')return json(await profile(env,account));
  if(path==='/api/angry-marbles/name'&&method==='POST'){
    const data=await body(request),name=String(data.displayName||'').trim();
    if(name.length<2||name.length>24)return error('Name must contain 2–24 characters.');
    await env.DB.prepare('UPDATE accounts SET display_name=? WHERE id=?').bind(name,account.id).run();
    account.display_name=name;return json(await profile(env,account));
  }
  if(path==='/api/angry-marbles/public'&&method==='GET'){
    const mode=url.searchParams.get('mode')||'doubles',capacity=Number(url.searchParams.get('capacity')||4);
    if(!['singles','doubles'].includes(mode)||!Number.isInteger(capacity))return error('Invalid game mode or player count.');
    const rooms=await env.DB.prepare(`SELECT code,humans,capacity,fill_at AS countdown FROM rooms
      WHERE status='waiting' AND visibility='public' AND mode=? AND capacity=? AND humans<capacity ORDER BY created_at DESC LIMIT 30`)
      .bind(mode,capacity).all<{code:string;humans:number;capacity:number;countdown:number|null}>();
    return json(rooms.results);
  }
  if(path==='/api/angry-marbles/create'&&method==='POST'){
    const data=await body(request),mode=String(data.mode),capacity=Number(data.capacity),waitSeconds=Number(data.waitSeconds),visibility=String(data.visibility),preferredRelation=String(data.preferredRelation);
    const validCapacity=mode==='singles'?[1,2,3,4].includes(capacity):mode==='doubles'?[4,6,8].includes(capacity):false;
    if(!validCapacity)return error('Invalid mode or player count.');
    if(![15,30,60,90,120,180,300].includes(waitSeconds))return error('Invalid wait duration.');
    if(!['private','public'].includes(visibility)||!['with','against'].includes(preferredRelation))return error('Invalid room options.');
    for(let attempt=0;attempt<12;attempt++){
      const code=newRoomCode();
      const existing=await env.DB.prepare('SELECT code FROM rooms WHERE code=?').bind(code).first();
      if(existing)continue;
      const response=await roomRequest(env,code,account.id,`/create?code=${code}`,'POST',{mode,capacity,waitSeconds,visibility,preferredRelation});
      if(response.status===409)continue;
      return response;
    }
    return error('Could not allocate a room code. Try again.',503);
  }
  const joinPath=path==='/api/angry-marbles/join'&&method==='POST';
  if(joinPath){
    const data=await body(request),code=String(data.code||'').toUpperCase();
    if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))return error('Enter a six-character room code.');
    return roomRequest(env,code,account.id,'/join','POST',{relation:data.relation});
  }
  if(roomMatch){
    const code=roomMatch[1].toUpperCase(),suffix=roomMatch[2]||'';
    if(suffix==='/events-ticket'&&method==='POST'){
      const ticket=newSessionToken(),expires=Date.now()+60_000;
      await env.DB.prepare('INSERT INTO room_event_tickets(token_hash,room_code,user_id,expires_at) VALUES(?,?,?,?)').bind(await hashToken(ticket),code,account.id,expires).run();
      return json({ticket,expiresAt:expires});
    }
    if(suffix==='/events'&&method==='GET')return roomRequest(env,code,account.id,`/events${url.search}`,'GET');
    if(suffix&&suffix!=='/events')return error('Method not allowed.',405);
    return roomRequest(env,code,account.id,'/view',method);
  }
  const actionMatch=path.match(/^\/api\/angry-marbles\/(countdown|fill|fill-now|color|move)$/);
  if(actionMatch&&method==='POST'){
    const data=await body(request),code=String(data.code||'').toUpperCase();
    if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))return error('Enter a six-character room code.');
    return roomRequest(env,code,account.id,`/${actionMatch[1]}`,'POST',data);
  }
  return error('Not found.',404);
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const origin=request.headers.get('origin');
    const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean);
    const permittedOrigin=origin&&allowed.includes(origin)?origin:null;
    if(origin&&!permittedOrigin)return error('Origin not allowed.',403);
    if(request.method==='OPTIONS')return cors(new Response(null,{status:204}),permittedOrigin);
    try{const response=await route(request,env);return response.status===101?response:cors(response,permittedOrigin);}
    catch(error){console.error(error);return cors(json({message:'Internal server error.'},500),permittedOrigin);}
  },
};