/* Angry Marbles PocketBase controller: server-side rules only, no deck/hand exposure. */
const engine = require(__hooks + '/engine.js');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WAIT_CHOICES = [15,30,60,90,120,180,300];

function reject(message){ throw new BadRequestError(message); }
function member(e){ if(!e.auth || e.auth.collection().name !== 'players') throw new UnauthorizedError('Player sign-in required'); return e.auth.id; }
function body(e){return e.requestInfo().body || {};}
function codeOf(value){if(typeof value!=='string'||!/^[A-HJ-NP-Z2-9]{6}$/.test(value.toUpperCase())) reject('Enter a six-character room code');return value.toUpperCase();}
function lookup(app,code){try{return app.findFirstRecordByData('am_rooms','code',codeOf(code));}catch(_){throw new NotFoundError('Room not found');}}
function getState(record){return JSON.parse(record.getString('state'));}
function saveState(app,record,room){record.set('state',JSON.stringify(room));record.set('status',room.status);app.save(record);}
function inRoom(room,userId){if(!room.players.some(p=>p.id===userId && !p.isBot))throw new ForbiddenError('You must join this room');}
function canSeat(mode,capacity){return engine.possibleSeats(mode,capacity);}
function username(app,userId){let player=app.findRecordById('players',userId);return player.getString('name');}
function getStats(app,userId){
  try {return app.findFirstRecordByData('am_stats','userId',userId);} catch (_) {
    let record=new Record(app.findCollectionByNameOrId('am_stats'));record.set('userId',userId);
    app.save(record);return record;
  }
}
function statsView(app,userId){
  let stat=getStats(app,userId);
  return {userId, displayName:username(app,userId), ...Object.fromEntries(['games','wins','losses','bumps','assists'].map(k=>[k,stat.getInt(k)]))};
}
function hex(color){return typeof color==='string'&&/^#[\da-fA-F]{6}$/.test(color)?color.toLowerCase():null;}
function nextColor(room){let taken=new Set(room.players.map(p=>p.color.toLowerCase()));return engine.COLORS.find(c=>!taken.has(c.toLowerCase())) || '#ffffff';}
function chooseSeat(room,relation){
  const seats=canSeat(room.mode,room.capacity);
  const available=seats.filter(s=>!room.players.some(p=>p.seat===s));
  if(!available.length)reject('This game is full');
  if(room.mode==='doubles' && room.players.filter(p=>!p.isBot).length===1){
     const hostSeat=room.players.find(p=>!p.isBot).seat;
     const teammate=boardGeometry.oppositeSeat(hostSeat,room.capacity);
     if(relation==='with' && available.includes(teammate)) return teammate;
     if(relation==='against') return available.find(seat=>seat!==teammate)??available[0];
  }
  return available[0];
}
function updateStats(app,room){
  const events=room.statEvents||[];
  for(const event of events){
    if(!['bumps','assists'].includes(event.stat))continue;
    const player=room.players.find(p=>p.seat===event.seat && !p.isBot);
    if(!player)continue;
    let stats=getStats(app,player.id);stats.set(event.stat,stats.getInt(event.stat)+1);app.save(stats);
  }
  room.statEvents=[];
  if(room.status==='finished' && !room.statsFinalized){
    const winners=new Set(room.winners||[]);
    for(const p of room.players){
      if(p.isBot)continue;
      let stats=getStats(app,p.id);
      stats.set('games',stats.getInt('games')+1);
      let key=winners.has(p.seat)?'wins':'losses';
      stats.set(key,stats.getInt(key)+1);app.save(stats);
    }
    room.statsFinalized=true;
  }
}
function resolveBots(room){
  let max=8;
  while(room.status==='playing'&&room.players[room.turnIndex].isBot&&max-->0){
    engine.botMove(room);
  }
}
function seatOrder(room){return canSeat(room.mode,room.capacity);}
function runFill(room){
  if(room.status!=='waiting'||!room.startedCountdown||!room.fillAt||room.fillAt>Date.now())return false;
  for(const seat of seatOrder(room)){
    if(room.players.some(p=>p.seat===seat))continue;
    room.players.push({id:`bot-${room.code}-${seat}`,name:`Computer ${seat+1}`,seat,isBot:true,color:nextColor(room)});
  }
  engine.startGame(room);resolveBots(room);return true;
}
function notification(room){
  let topic=`angry_marbles:${room.code}`;
  let message=new SubscriptionMessage({name:topic,data:JSON.stringify({changed:true})});
  let allowed=new Set(room.players.filter(p=>!p.isBot).map(p=>p.id));
  let clients=$app.subscriptionsBroker().clients();
  for(let id in clients){
    const client=clients[id];
    // Signals contain NO card/deck data. Check authenticated user before sending.
    let auth=client.get('auth');
    if(client.hasSubscription(topic) && auth && allowed.has(auth.id))client.send(message);
  }
}
function persistAction(e,code,callback){
  const user=member(e);
  let result;
  e.app.runInTransaction((tx)=>{
    let record=lookup(tx,code),room=getState(record);
    inRoom(room,user);
    result=callback(tx,room,user);
    saveState(tx,record,room);
  });
  const updated=getState(lookup(e.app,code));notification(updated);
  return result;
}
function create(e){
  const user=member(e),data=body(e);
  canSeat(data.mode,data.capacity);
  if(!WAIT_CHOICES.includes(data.waitSeconds))reject('Invalid wait duration');
  if(!['public','private'].includes(data.visibility))reject('Invalid room visibility');
  if(!['with','against'].includes(data.preferredRelation))reject('Invalid partner preference');
  let newCode='';
  e.app.runInTransaction((tx)=>{
    for(let tries=0;tries<12;tries++){
      let random=$security.randomString(8),candidate='';
      for(let char of random)candidate+=ALPHABET[char.charCodeAt(0)%ALPHABET.length];
      candidate=candidate.slice(0,6);
      try{tx.findFirstRecordByData('am_rooms','code',candidate);}catch(_){newCode=candidate;break;}
    }
    if(!newCode)reject('Could not allocate a unique code; try again');
    const room={code:newCode,hostId:user,mode:data.mode,capacity:data.capacity,
      visibility:data.visibility,status:'waiting',createdAt:Date.now(),fillAt:null,startedCountdown:false,
      waitSeconds:data.waitSeconds,preferredRelation:data.preferredRelation,
      log:['Room created. Invite players before starting the countdown.'],
      players:[{id:user,name:username(tx,user),seat:0,isBot:false,color:engine.COLORS[0]}],
      pieces:[],hands:{},turnIndex:0,turnNumber:0,deck:[],discards:[],statEvents:[]};
    if(room.capacity===1){engine.startGame(room);resolveBots(room);}
    let record=new Record(tx.findCollectionByNameOrId('am_rooms'));
    for(let field of ['code','hostId','status','visibility','mode','capacity'])record.set(field,room[field]);
    record.set('state',JSON.stringify(room));tx.save(record);
  });
  return {code:newCode};
}
function join(e){
  let user=member(e),data=body(e),code=codeOf(data.code);
  if(!['with','against'].includes(data.relation))reject('Choose with or against');
  e.app.runInTransaction((tx)=>{
    let record=lookup(tx,code),room=getState(record);
    if(room.players.some(p=>p.id===user))return;
    if(room.status!=='waiting')reject('This game has already started');
    const seat=chooseSeat(room,data.relation);
    room.players.push({id:user,name:username(tx,user),seat,isBot:false,color:nextColor(room)});
    if(room.players.length===room.capacity){engine.startGame(room);resolveBots(room);}
    saveState(tx,record,room);
  });
  notification(getState(lookup(e.app,code)));
  return {code};
}
function view(e,code){
  let user=member(e), record=lookup(e.app,code),room=getState(record);
  inRoom(room,user);
  if(room.status==='waiting' && room.startedCountdown && room.fillAt && room.fillAt<=Date.now()){
    persistAction(e,code,(_tx,state)=>{runFill(state);});
    room=getState(lookup(e.app,code));
  }
  return engine.roomView(room,user);
}
function publicRooms(e){
  member(e);
  const query=e.requestInfo().query;
  let mode=query.mode||'doubles',capacity=Number(query.capacity||4);
  canSeat(mode,capacity);
  const records=e.app.findRecordsByFilter('am_rooms',"status = 'waiting' && visibility = 'public'",'-created',30);
  return records.map(r=>getState(r)).filter(r=>r.mode===mode&&r.capacity===capacity&&r.players.length<r.capacity)
    .map(r=>({code:r.code,humans:r.players.filter(p=>!p.isBot).length,capacity:r.capacity,countdown:r.fillAt}));
}
function countdown(e){
  let data=body(e);
  persistAction(e,data.code,(_tx,room,user)=>{
    if(room.hostId!==user)reject('Only the host can start the countdown');
    if(room.status!=='waiting'||room.startedCountdown)reject('The countdown already started');
    room.startedCountdown=true;room.fillAt=Date.now()+room.waitSeconds*1000;
    room.log.unshift(`Waiting ${room.waitSeconds} seconds for players before computer fill.`);
  });
  return {ok:true};
}
function fill(e){
  let data=body(e);
  persistAction(e,data.code,(_tx,room)=>{runFill(room);});return {ok:true};
}
function color(e){
  const data=body(e),value=hex(data.color);
  if(!value)reject('Enter a six-digit hex color');
  persistAction(e,data.code,(_tx,room,user)=>{
    if(room.status!=='waiting')reject('Colors lock after the game starts');
    if(room.players.some(p=>p.id!==user&&p.color.toLowerCase()===value))reject('This color is taken');
    let player=room.players.find(p=>p.id===user);player.color=value;
  });return {ok:true};
}
function move(e){
  let data=body(e),code=codeOf(data.code);
  persistAction(e,code,(tx,room,user)=>{
    if(room.status!=='playing')reject('Game not in progress');
    const acting=room.players[room.turnIndex];
    if(!acting||acting.isBot||acting.id!==user)reject('It is not your turn');
    if(typeof data.moveId==='string' && data.discardIndex!==undefined)reject('Choose move or discard');
    if(typeof data.moveId==='string'){
      if(data.moveId.length>512)reject('Invalid move');engine.play(room,acting.seat,data.moveId);
    }else if(Number.isInteger(data.discardIndex)){
      engine.play(room,acting.seat,null,data.discardIndex);
    }else reject('Choose a move or a discard');
    resolveBots(room);updateStats(tx,room);
  });return {ok:true};
}
function profile(e){let user=member(e),profile;e.app.runInTransaction(tx=>{profile=statsView(tx,user);});return profile;}
function rename(e){let data=body(e),user=member(e),name=String(data.displayName||'').trim();
  if(name.length<2||name.length>24)reject('Name must contain 2–24 characters');
  e.app.runInTransaction(tx=>{const player=tx.findRecordById('players',user);player.set('name',name);tx.save(player);});
  return profile(e);
}
function cronFill(){
  // Cron is a backup for lobbies where all players close their browsers.
  const records=$app.findRecordsByFilter('am_rooms',"status = 'waiting'",'-created',100);
  for(const record of records){
    let room=getState(record);
    if(!room.startedCountdown||!room.fillAt||room.fillAt>Date.now())continue;
    let did=false;
    $app.runInTransaction(tx=>{
      let fresh=tx.findRecordById('am_rooms',record.id),state=getState(fresh);
      did=runFill(state);if(did)saveState(tx,fresh,state);
    });
    if(did)notification(getState($app.findRecordById('am_rooms',record.id)));
  }
}
module.exports={create,join,view,publicRooms,countdown,fill,color,move,profile,rename,cronFill,member};
