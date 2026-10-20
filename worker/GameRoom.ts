import { botMove, COLORS, play, possibleSeats, roomView, startGame } from '../src/engine.js';
import { hashToken } from './auth';
import boardGeometry from '../pb_hooks/boardGeometry.cjs';

type GameMode = 'singles' | 'doubles';
type Relation = 'with' | 'against';
type Player = { id:string; name:string; seat:number; isBot:boolean; color:string };
type Room = {
  code:string; hostId:string; mode:GameMode; capacity:number; visibility:'private'|'public';
  status:'waiting'|'playing'|'finished'; createdAt:number; fillAt:number|null;
  startedCountdown:boolean; waitSeconds:number; preferredRelation:Relation;
  players:Player[]; pieces:any[]; hands:Record<number,any[]>; turnIndex:number; turnNumber:number;
  deck:any[]; discards:any[]; dealerIndex:number; log:string[]; statEvents:any[];
  winners:number[]|null; statsFinalized?:boolean; boardSides?:number; botReadyAt?:number|null;
};

type Env = { DB:D1Database };
const WAIT_CHOICES=[15,30,60,90,120,180,300];

export class GameRoom {
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private readonly state:DurableObjectState,private readonly env:Env){}

  private serialized<T>(operation:()=>Promise<T>):Promise<T>{
    const result=this.tail.then(operation,operation);
    this.tail=result.then(()=>undefined,()=>undefined);
    return result;
  }
  private async load():Promise<Room|null>{return await this.state.storage.get<Room>('room')||null;}
  private async save(room:Room):Promise<void>{await this.state.storage.put('room',room);}
  private json(data:unknown,status=200):Response{return Response.json(data,{status});}
  private failure(message:string,status=400):Response{return this.json({message},status);}
  private actor(request:Request):string|null{return request.headers.get('x-am-user-id');}
  private isMember(room:Room,userId:string):boolean{return room.players.some(player=>player.id===userId&&!player.isBot);}
  private async syncDirectory(room:Room):Promise<void>{
    await this.env.DB.prepare(`INSERT INTO rooms(code,host_id,mode,capacity,visibility,status,humans,created_at,fill_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET status=excluded.status,humans=excluded.humans,fill_at=excluded.fill_at`)
      .bind(room.code,room.hostId,room.mode,room.capacity,room.visibility,room.status,room.players.filter(player=>!player.isBot).length,room.createdAt,room.fillAt).run();
  }
  private async flushStats(room:Room):Promise<void>{
    for(const event of room.statEvents||[]){
      if(!['bumps','assists'].includes(event.stat))continue;
      const player=room.players.find(item=>item.seat===event.seat&&!item.isBot);
      if(player)await this.env.DB.prepare(`UPDATE player_stats SET ${event.stat}=${event.stat}+1 WHERE user_id=?`).bind(player.id).run();
    }
    room.statEvents=[];
    if(room.status==='finished'&&!room.statsFinalized){
      const winners=new Set(room.winners||[]);
      for(const player of room.players){
        if(player.isBot)continue;
        await this.env.DB.prepare('UPDATE player_stats SET games=games+1,wins=wins+?,losses=losses+? WHERE user_id=?')
          .bind(winners.has(player.seat)?1:0,winners.has(player.seat)?0:1,player.id).run();
      }
      room.statsFinalized=true;
    }
  }
  private async runBots(room:Room):Promise<void>{
    // One persisted alarm per bot turn; never hide an entire bot round in one response.
    if(room.status==='playing'&&room.players[room.turnIndex]?.isBot){
      room.botReadyAt ||= Date.now()+4500;
      await this.state.storage.setAlarm(room.botReadyAt);
    }else room.botReadyAt=null;
    await this.flushStats(room);
  }
  private async notify():Promise<void>{
    for(const socket of this.state.getWebSockets()){
      try{socket.send(JSON.stringify({changed:true}));}catch{try{socket.close(1011,'Notification failed.');}catch{}}
    }
  }
  private async memberRoom(request:Request):Promise<{room:Room;userId:string}|Response>{
    const userId=this.actor(request);
    if(!userId)return this.failure('Sign in required.',401);
    const room=await this.load();
    if(!room)return this.failure('Room not found.',404);
    if(!this.isMember(room,userId))return this.failure('You must join this room.',403);
    return {room,userId};
  }
  private async events(request:Request):Promise<Response>{
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return this.failure('WebSocket upgrade required.',426);
    const ticket=new URL(request.url).searchParams.get('ticket')||'';
    if(!/^[\da-f]{64}$/i.test(ticket))return this.failure('Invalid or expired room ticket.',401);
    const grant=await this.env.DB.prepare('DELETE FROM room_event_tickets WHERE token_hash=? AND expires_at>? RETURNING user_id,room_code')
      .bind(await hashToken(ticket),Date.now()).first<{user_id:string;room_code:string}>();
    if(!grant)return this.failure('Invalid or expired room ticket.',401);
    const room=await this.load();
    if(!room||grant.room_code!==room.code||!this.isMember(room,grant.user_id))return this.failure('You must join this room.',403);
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({userId:grant.user_id,roomCode:room.code});
    server.send(JSON.stringify({ready:true}));
    return new Response(null,{status:101,webSocket:client});
  }
  webSocketMessage(_socket:WebSocket,_message:string|ArrayBuffer):void{}
  webSocketClose(socket:WebSocket,code:number,reason:string,_wasClean:boolean):void{try{socket.close(code,reason);}catch{}}
  webSocketError(socket:WebSocket):void{try{socket.close(1011,'Socket error.');}catch{}}
  async fetch(request:Request):Promise<Response>{
    const url=new URL(request.url),path=url.pathname;
    if(path==='/events'&&request.method==='GET')return this.events(request);
    return this.serialized(async()=>{
      const method=request.method;
      let data:any={};
      if(method==='POST'){
        try{data=await request.json();}catch{return this.failure('Invalid JSON body.');}
      }
      const userId=this.actor(request);
      if(path==='/create'&&method==='POST'){
        if(!userId)return this.failure('Sign in required.',401);
        const {mode,capacity,waitSeconds,visibility,preferredRelation}=data;
        try{possibleSeats(mode,capacity);}catch{return this.failure('Invalid game mode or player count.');}
        if(!WAIT_CHOICES.includes(waitSeconds))return this.failure('Invalid wait duration.');
        if(!['private','public'].includes(visibility))return this.failure('Invalid room visibility.');
        if(!['with','against'].includes(preferredRelation))return this.failure('Invalid partner preference.');
        if(await this.load())return this.failure('Room already exists.',409);
        const account=await this.env.DB.prepare('SELECT display_name FROM accounts WHERE id=?').bind(userId).first<{display_name:string}>();
        if(!account)return this.failure('Account not found.',401);
        const room:Room={code:url.searchParams.get('code')||'',hostId:userId,mode,capacity,visibility,status:'waiting',createdAt:Date.now(),fillAt:null,startedCountdown:false,waitSeconds,preferredRelation,players:[{id:userId,name:account.display_name,seat:0,isBot:false,color:'#329bff'}],pieces:[],hands:{},turnIndex:0,turnNumber:0,deck:[],discards:[],dealerIndex:0,log:['Room created. Invite players before starting the countdown.'],statEvents:[],winners:null};
        if(!room.code)return this.failure('Room code missing.',400);
        if(room.mode==='singles'&&room.capacity===1)startGame(room);
        await this.save(room);await this.syncDirectory(room);
        return this.json({code:room.code});
      }
      if(path==='/join'&&method==='POST'){
        if(!userId)return this.failure('Sign in required.',401);
        const room=await this.load();if(!room)return this.failure('Room not found.',404);
        const relation=data.relation as Relation;
        if(!['with','against'].includes(relation))return this.failure('Choose with or against.');
        if(room.players.some(player=>player.id===userId))return this.json({code:room.code});
        if(room.status!=='waiting')return this.failure('This game has already started.',409);
        const seats=possibleSeats(room.mode,room.capacity),available=seats.filter(seat=>!room.players.some(player=>player.seat===seat));
        if(!available.length)return this.failure('This game is full.',409);
        let seat=available[0];
        if(room.mode==='doubles'&&room.players.filter(player=>!player.isBot).length===1){
          const hostSeat=room.players.find(player=>!player.isBot)!.seat,partner=boardGeometry.oppositeSeat(hostSeat,room.capacity);
          if(relation==='with'&&available.includes(partner))seat=partner;
          else if(relation==='against')seat=available.find(value=>value!==partner)??available[0];
        }
        const account=await this.env.DB.prepare('SELECT display_name FROM accounts WHERE id=?').bind(userId).first<{display_name:string}>();
        if(!account)return this.failure('Account not found.',401);
        const taken=new Set(room.players.map(player=>player.color.toLowerCase()));
        room.players.push({id:userId,name:account.display_name,seat,isBot:false,color:COLORS.find(color=>!taken.has(color.toLowerCase()))||'#ffffff'});
        if(room.players.length===room.capacity){startGame(room);await this.runBots(room);}
        await this.save(room);await this.syncDirectory(room);await this.notify();
        return this.json({code:room.code});
      }
      const membership=await this.memberRoom(request);
      if(membership instanceof Response)return membership;
      const {room}=membership;
      if(path==='/view'&&method==='GET'){
        // Recover a pre-v0.5.0 bot turn with no scheduled alarm.
        if(room.status==='playing'&&room.players[room.turnIndex]?.isBot&&!room.botReadyAt){await this.runBots(room);await this.save(room);}
        return this.json(roomView(room,userId!));
      }
      if(path==='/countdown'&&method==='POST'){
        if(room.hostId!==userId)return this.failure('Only the host can start the countdown.',403);
        if(room.status!=='waiting'||room.startedCountdown)return this.failure('The countdown already started.',409);
        room.startedCountdown=true;room.fillAt=Date.now()+room.waitSeconds*1000;room.log.unshift(`Waiting ${room.waitSeconds} seconds for players before computer fill.`);
        await this.state.storage.setAlarm(room.fillAt);await this.save(room);await this.notify();return this.json({ok:true});
      }
      if(path==='/fill'&&method==='POST'){
        await this.fillRoom(room);await this.save(room);await this.syncDirectory(room);await this.notify();return this.json({ok:true});
      }
      if(path==='/fill-now'&&method==='POST'){
        if(room.hostId!==userId)return this.failure('Only the host can start computer play.',403);
        if(room.status!=='waiting')return this.failure('This game has already started.',409);
        room.startedCountdown=true;room.fillAt=Date.now();
        await this.fillRoom(room);await this.save(room);await this.syncDirectory(room);await this.notify();
        return this.json({ok:true});
      }
      if(path==='/color'&&method==='POST'){
        const color=typeof data.color==='string'&&/^#[\da-fA-F]{6}$/.test(data.color)?data.color.toLowerCase():null;
        if(!color)return this.failure('Enter a six-digit hex color.');
        if(room.status!=='waiting')return this.failure('Colors lock after the game starts.',409);
        if(room.players.some(player=>player.id!==userId&&player.color.toLowerCase()===color))return this.failure('This color is taken.',409);
        const player=room.players.find(item=>item.id===userId)!;player.color=color;
        await this.save(room);await this.notify();return this.json({ok:true});
      }
      if(path==='/move'&&method==='POST'){
        if(room.status!=='playing')return this.failure('Game not in progress.',409);
        const acting=room.players[room.turnIndex];
        if(!acting||acting.isBot||acting.id!==userId)return this.failure('It is not your turn.',403);
        if(typeof data.moveId==='string'&&data.discardIndex!==undefined)return this.failure('Choose move or discard.');
        try{
          if(typeof data.moveId==='string')play(room,acting.seat,data.moveId);
          else if(Number.isInteger(data.discardIndex))play(room,acting.seat,null,data.discardIndex);
          else return this.failure('Choose a move or discard.');
        }catch(error){return this.failure(error instanceof Error?error.message:'Move rejected.',400);}
        await this.runBots(room);await this.save(room);await this.syncDirectory(room);await this.notify();return this.json({ok:true});
      }
      return this.failure('Route not found.',404);
    });
  }
  private async fillRoom(room:Room):Promise<void>{
    if(room.status!=='waiting'||!room.startedCountdown||!room.fillAt||room.fillAt>Date.now())return;
    const seats=possibleSeats(room.mode,room.capacity),taken=new Set(room.players.map(player=>player.seat));
    for(const seat of seats){
      if(taken.has(seat))continue;
      const used=new Set(room.players.map(player=>player.color.toLowerCase()));
      room.players.push({id:`bot-${room.code}-${seat}`,name:`Computer ${seat+1}`,seat,isBot:true,color:COLORS.find(color=>!used.has(color.toLowerCase()))||'#ffffff'});
    }
    startGame(room);await this.runBots(room);
  }
  async alarm():Promise<void>{
    await this.serialized(async()=>{
      const room=await this.load();if(!room)return;
      if(room.status==='waiting')await this.fillRoom(room);
      else if(room.status==='playing'&&room.players[room.turnIndex]?.isBot){
        if(room.botReadyAt&&Date.now()<room.botReadyAt){await this.state.storage.setAlarm(room.botReadyAt);return;}
        botMove(room);room.botReadyAt=null;await this.runBots(room);
      }
      await this.save(room);await this.syncDirectory(room);await this.notify();
    });
  }
}
