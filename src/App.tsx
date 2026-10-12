import {useEffect,useState, type FormEvent} from 'react';
import {pb,hasConfiguredBackend,gameApi,type Profile,type PublicGame,type GameMode,type Relation} from './pb';
import {COLORS,trackPosition,possibleSeats,startGame,legalMoves,play,MARBLES} from './engine.js';
import type {RoomState,Player,Piece,Card} from './types';
import boardGeometry from '../pb_hooks/boardGeometry.cjs';
const VERSION='0.4.2';
const errText=(error:unknown)=>error instanceof Error?error.message:String(error);
function Login({onLogin}:{onLogin:()=>void}){
  const [flow,setFlow]=useState<'signIn'|'signUp'>('signIn');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    const data=new FormData(e.currentTarget),email=String(data.get('email')||'').trim().toLowerCase();
    const password=String(data.get('password')||'');
    try{
      if(flow==='signUp'){
        const name=String(data.get('name')||'').trim();
        if(name.length<2||name.length>24)throw Error('Choose a player name between 2 and 24 characters.');
        await pb.collection('players').create({email,password,passwordConfirm:password,name});
      }
      await pb.collection('players').authWithPassword(email,password);
      onLogin();
    }catch(e){setError(errText(e));}finally{setBusy(false);}
  }
  return <section className="auth-page">
    <div className="logo-orbit"><span>●</span><span>●</span><span>●</span><span>●</span></div>
    <h1>ANGRY <em>MARBLES</em></h1><p className="tagline">Partner up. Bump out. Race home.</p>
    <form className="panel auth-form" onSubmit={submit}>
      <h2>{flow==='signUp'?'Create your player account':'Welcome back'}</h2>
      {flow==='signUp'&&<label>Player name<input name="name" minLength={2} maxLength={24} required placeholder="How others see you"/></label>}
      <label>Email<input type="email" name="email" required placeholder="you@example.com" autoComplete="email"/></label>
      <label>Password<input type="password" name="password" required minLength={10} placeholder="At least 10 characters" autoComplete={flow==='signUp'?'new-password':'current-password'}/></label>
      {error&&<div role="alert" className="error">{error}</div>}
      <button className="primary" disabled={busy} type="submit">{busy?'Working…':flow==='signUp'?'Create account':'Log in'}</button>
      <button type="button" className="text-button" onClick={()=>{setFlow(flow==='signIn'?'signUp':'signIn');setError('');}}>
        {flow==='signUp'?'Already registered? Log in':'New player? Create an account'}
      </button>
      <p className="small">Your hands stay private. Email verification and password-reset mail require an SMTP provider before a public launch.</p>
    </form>
  </section>;
}
const polar=(index:number,count:number,r:number)=>{
  const angle=2*Math.PI*index/count - Math.PI/2;
  return {x:430+r*Math.cos(angle),y:430+r*Math.sin(angle)};
};
function Board({room}:{room:Pick<RoomState,'players'|'pieces'|'boardSides'|'mode'|'capacity'>}){
  const sideCount=room.boardSides||boardGeometry.boardSides(room.mode,room.capacity);
  const board=boardGeometry.geometry(sideCount);
  const seatByIndex=new Map(room.players.map(p=>[p.seat,p]));
  const colorFor=(seat:number)=>seatByIndex.get(seat)?.color||'#bdc3c7';
  const polygon=(radius:number)=>board.corners.map(point=>`${board.center.x+(point.x-board.center.x)*radius/board.radius},${board.center.y+(point.y-board.center.y)*radius/board.radius}`).join(' ');
  const piecesAt=(seat:number,loc:Piece['loc'],position:number)=>room.pieces.find(piece=>piece.seat===seat&&piece.loc===loc&&(loc==='base'?piece.slot===position:piece.run===position));
  return <svg viewBox="0 0 1040 970" role="img" aria-label={`${sideCount}-sided board with indexed track, base racks, and home runs`} className="board">
    <defs>
      <linearGradient id="boardWood" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f6c77e"/><stop offset=".28" stopColor="#bd6e31"/><stop offset=".62" stopColor="#e7a452"/><stop offset="1" stopColor="#80441f"/></linearGradient>
      <radialGradient id="boardFelt" cx="48%" cy="43%" r="78%"><stop stopColor="#23647f"/><stop offset=".78" stopColor="#0b304c"/><stop offset="1" stopColor="#082237"/></radialGradient>
      {Array.from({length:sideCount},(_,seat)=><radialGradient key={seat} id={`marble-${seat}`} cx="27%" cy="21%" r="86%"><stop stopColor="#fff" stopOpacity=".9"/><stop offset=".2" stopColor={colorFor(seat)}/><stop offset=".72" stopColor={colorFor(seat)}/><stop offset="1" stopColor="#16243d"/></radialGradient>)}
      <filter id="marbleShadow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.3"/></filter>
    </defs>
    <polygon points={polygon(board.radius+44)} fill="url(#boardWood)" stroke="#59351e" strokeWidth="8" strokeLinejoin="round"/>
    <polygon points={polygon(board.radius-40)} fill="url(#boardFelt)" stroke="#94571e" strokeWidth="8" strokeLinejoin="round"/>
    {board.sides.map(side=><g key={`lane-${side.seat}`}>
      <line x1={side.red.x+side.inward.x*12} y1={side.red.y+side.inward.y*12} x2={side.red.x+side.inward.x*126} y2={side.red.y+side.inward.y*126} stroke="#8c4835" strokeWidth="29" strokeLinecap="round"/>
      <line x1={side.green.x+side.inward.x*33} y1={side.green.y+side.inward.y*33} x2={side.green.x+side.inward.x*151} y2={side.green.y+side.inward.y*151} stroke="#306e54" strokeWidth="34" strokeLinecap="round"/>
      {side.home.map(hole=><circle key={`home-hole-${hole.id}`} cx={hole.x} cy={hole.y} r="8" fill="#482212" stroke="#daab62" strokeWidth="2" data-hole-type="home" data-hole-id={hole.id}/>)}
      {side.base.map(hole=><circle key={`base-hole-${hole.id}`} cx={hole.x} cy={hole.y} r="11" fill="#402314" stroke="#b98d5b" strokeWidth="2" data-hole-type="base" data-hole-id={hole.id}/>)}
      <text x={side.red.x-side.inward.x*28} y={side.red.y-side.inward.y*28} fill="#fa7777" fontSize="12" fontWeight="800" textAnchor="middle">HOME</text>
      <text x={side.green.x-side.inward.x*28} y={side.green.y-side.inward.y*28} fill="#65e1af" fontSize="12" fontWeight="800" textAnchor="middle">BASE</text>
      {side.track.map(hole=><circle key={`track-hole-${hole.id}`} cx={hole.x} cy={hole.y} r={hole.marker?10:8} fill={hole.marker==='red'?'#c82e3c':hole.marker==='green'?'#0a976b':'#422012'} stroke={hole.marker==='red'?'#ff9d98':hole.marker==='green'?'#9ee4b4':'#d59b53'} strokeWidth="2" data-hole-type="track" data-hole-id={hole.id} data-marker={hole.marker||undefined}/>)}
      {side.home.map(hole=>{const piece=room.pieces.find(item=>item.seat===side.seat&&((item.loc==='run'&&item.run===hole.position)||(item.loc==='home'&&hole.position===4)));return piece?<g key={piece.id} className="marble-piece"><circle cx={hole.x+2} cy={hole.y+3} r="11" fill="#050c0e" opacity=".7"/><circle cx={hole.x} cy={hole.y} r="9" fill={`url(#marble-${piece.seat%8})`} stroke="#fff" strokeWidth="1.2"/></g>:null;})}
      {side.base.map(hole=>{const piece=piecesAt(side.seat,'base',hole.position);return piece?<g key={piece.id}><circle cx={hole.x+2} cy={hole.y+3} r="11" fill="#050c0e" opacity=".7"/><circle cx={hole.x} cy={hole.y} r="9" fill={`url(#marble-${piece.seat%8})`} stroke="#fff" strokeWidth="1.2"/></g>:null;})}
      {seatByIndex.get(side.seat)&&<text x={side.from.x+side.along.x*side.length*.5+side.inward.x*82} y={side.from.y+side.along.y*side.length*.5+side.inward.y*82} fill={colorFor(side.seat)} fontSize="15" fontWeight="900" textAnchor="middle">{seatByIndex.get(side.seat)?.name.slice(0,12)}</text>}
    </g>)}
    {board.sides.flatMap(side=>side.track).map(hole=>{const piece=room.pieces.find(item=>item.loc==='track'&&trackPosition(item,sideCount)===hole.id);return piece?<g key={piece.id} className="marble-piece"><circle cx={hole.x+2} cy={hole.y+4} r="12" fill="#020b11" opacity=".72" filter="url(#marbleShadow)"/><circle cx={hole.x} cy={hole.y} r="10.5" fill={`url(#marble-${piece.seat%8})`} stroke="#fff" strokeWidth="1.4"/><ellipse cx={hole.x-3} cy={hole.y-3.5} rx="3.1" ry="2" fill="#fff" opacity=".72"/></g>:null;})}
    {board.sides.slice(0,1).flatMap(side=>[0,2,8,18].map(position=>({side,position,point:side.holes[position]}))).map(({side,position,point})=><text key={`index-${position}`} x={point.x+side.inward.x*-26} y={point.y+side.inward.y*-26+4} fill="#ffe0a2" fontSize="13" fontWeight="900" textAnchor="middle">{position}</text>)}
    <text x={board.center.x} y={board.center.y-9} fill="#ffba3f" textAnchor="middle" fontSize="46" fontWeight="1000" stroke="#6e251c" strokeWidth="5" paintOrder="stroke">ANGRY</text>
    <text x={board.center.x} y={board.center.y+34} fill="#85caff" textAnchor="middle" fontSize="42" fontWeight="1000" stroke="#142e65" strokeWidth="5" paintOrder="stroke">MARBLES</text>
    <text x={board.center.x} y={board.center.y+65} fill="#a5d3df" textAnchor="middle" fontSize="12">{sideCount} SIDES · {sideCount*18} TRACK SPACES</text>
  </svg>;
}
function CardChip({card,selected,onClick}:{card:Card,selected:boolean,onClick:()=>void}){
  const red=card.suit==='♥'||card.suit==='♦';
  const portrait=card.rank==='JOKER'?'joker':({J:'jack',Q:'queen',K:'king'} as Record<string,string>)[card.rank]||null;
  const imageUrl=portrait?`${import.meta.env.BASE_URL}assets/cards/card-${portrait}.svg`:null;
  return <button type="button" className={`card-chip ${selected?'selected':''} ${red?'red':''}`} onClick={onClick}>
    <span>{card.rank==='JOKER'?'JOKER':card.rank}</span>{imageUrl&&<img src={imageUrl} alt=""/>}<strong>{card.rank==='JOKER'?'★':card.suit}</strong>
  </button>;
}
function PlayerList({room}:{room:Pick<RoomState,'players'|'turnSeat'|'dealerSeat'>}){
  return <div className="players-grid">{room.players.map(p=><div key={p.seat} className={`player ${room.turnSeat===p.seat?'active':''}`}>
    <span className="marble-icon" style={{background:p.color}}/>
    <div><strong>{p.name} {p.isBot&&<span className="muted">(Bot)</span>}</strong><small>Seat {p.seat+1} · {5-p.baseCount}/5 home · {p.baseCount} base{room.dealerSeat===p.seat?' · Dealer':''}</small></div>
    {room.turnSeat===p.seat&&<span className="turn-dot" title="Current turn"/>}
  </div>)}</div>;
}

function Room({code,onLeave,profile}:{code:string,onLeave:()=>void,profile:Profile}){
  const [room,setRoom]=useState<RoomState|null>(null),[error,setError]=useState('');
  const [cardIndex,setCardIndex]=useState(0),[customColor,setCustomColor]=useState('#ffffff');
  const [now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false);
  async function refresh(){try{setRoom(await gameApi.state<RoomState>(code));setError('');}catch(e){setError(errText(e));}}
  useEffect(()=>{
    let active=true;
    const update=async()=>{try{const state=await gameApi.state<RoomState>(code);if(active)setRoom(state);}catch(e){if(active)setError(errText(e));}};
    void update();
    const topic=`angry_marbles:${code}`;
    pb.realtime.subscribe(topic,()=>void update()).catch(e=>{if(active)setError('Live updates unavailable: '+errText(e));});
    const periodic=setInterval(()=>void update(),30000);
    const visibility=()=>{if(document.visibilityState==='visible')void update();};
    document.addEventListener('visibilitychange',visibility);
    return ()=>{active=false;void pb.realtime.unsubscribe(topic);clearInterval(periodic);document.removeEventListener('visibilitychange',visibility);};
  },[code]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>setCardIndex(0),[room?.turnNumber]);
  useEffect(()=>{
    if(room?.status==='waiting'&&room.startedCountdown&&room.fillAt&&Date.now()>=room.fillAt){
      gameApi.fill(code).then(()=>refresh()).catch(e=>setError(errText(e)));
    }
  },[code,room?.status,room?.startedCountdown,room?.fillAt,now>= (room?.fillAt||Infinity)]);
  async function call(action:()=>Promise<unknown>){setBusy(true);setError('');try{await action();await refresh();}catch(e){setError(errText(e));}finally{setBusy(false);}}
  if(!room)return <div className="panel"><p>{error||`Loading game room ${code}…`}</p><button onClick={onLeave}>Go back</button></div>;
  const filtered=room.myMoves.filter(m=>m.cardIndex===cardIndex)||[];
  const me=room.players.find(p=>p.seat===room.mySeat);
  const isHost=room.hostId===profile.userId;
  const isTurn=room.status==='playing'&&room.mySeat===room.turnSeat;
  const secondsLeft=room.fillAt?Math.max(0,Math.ceil((room.fillAt-now)/1000)):null;
  const shareUrl=`${window.location.origin}${window.location.pathname}?room=${code}&relation=${room.preferredRelation||'against'}`;
  return <div className="room-layout">
    <div className="room-header"><div><small className="eyebrow">{room.mode==='doubles'?'PARTNERS':'SINGLES'} · {room.capacity} SEATS</small><h2>Room <span>{room.code}</span></h2></div>
      <div className="toolbar"><button onClick={()=>navigator.clipboard.writeText(shareUrl).catch(()=>setError('Copy failed; share your room code instead.'))}>Copy invite link</button><button onClick={onLeave}>Back to lobby</button></div>
    </div>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="layout-2"><div className="panel game-board-wrap"><Board room={room}/><p className="small centered">{room.boardSides} sides · {room.track} indexed track holes · five visible base marbles per player</p></div>
      <aside className="sidebar">
        {room.status==='waiting'&&<div className="panel stack">
          <h3>Waiting for players</h3><p>{room.players.length} of {room.capacity} seats filled. Invite family and friends first.</p>
          {room.startedCountdown?<p className="countdown">Bots join in <strong>{secondsLeft}s</strong></p>:isHost?
            <button className="primary" disabled={busy} onClick={()=>call(()=>gameApi.countdown(code))}>Start waiting · {room.waitSeconds}s</button>:<p className="small">Waiting for the host to start the countdown.</p>}
          <p className="small">{room.mode==='doubles'?'Partners are seated opposite one another.':'Everybody plays individually.'} Empty spots become computer seats.</p>
          <h4>Pick a marble color</h4><div className="palette">{COLORS.map(color=>{
            const taken=room.players.some(p=>p.color.toLowerCase()===color.toLowerCase()&&p.seat!==room.mySeat);
            return <button key={color} title={taken?`${color} (taken)`:color} aria-label={`Marble color ${color}`} disabled={taken||busy} className={`swatch ${me?.color.toLowerCase()===color.toLowerCase()?'chosen':''}`} style={{background:color}} onClick={()=>call(()=>gameApi.color(code,color))}/>;
          })}</div>
          <div className="custom"><label>Custom color <input type="color" value={customColor} onChange={e=>setCustomColor(e.target.value)}/></label><button disabled={busy} onClick={()=>call(()=>gameApi.color(code,customColor))}>Use custom</button></div>
        </div>}
        <div className="panel stack"><h3>Players</h3><PlayerList room={room}/></div>
        {room.status==='playing'&&<div className="panel stack">
          <h3>{isTurn?'Your turn':'Waiting for '+(room.players.find(p=>p.seat===room.turnSeat)?.name||'player')}</h3>
          <p className="small">Dealer: {room.players.find(p=>p.seat===room.dealerSeat)?.name}. Deal rotates upon reshuffle without advantage.</p>
          <p className="small">Cards left: {room.deckCount} · Discards: {room.discards} · Turn {room.turnNumber}</p>
          <h4>Your hand</h4><div className="hand">{room.myHand.map((card,i)=><CardChip key={card.id+i} card={card} selected={cardIndex===i} onClick={()=>setCardIndex(i)}/>)}</div>
          {isTurn?<><h4>Legal moves</h4><div className="moves">{filtered.length?filtered.slice(0,100).map(m=><button key={m.id} disabled={busy} onClick={()=>call(()=>gameApi.move(code,m.id))}>{m.label}</button>):<p className="small">No legal move for this card; discard it.</p>}</div>
            <button className="danger" disabled={busy||!room.myHand.length} onClick={()=>call(()=>gameApi.discard(code,cardIndex))}>Discard selected card</button></>
            :<p className="small">Only you can see your hand.</p>}
        </div>}
        {room.status==='finished'&&<div className="panel stack"><h3>Round finished!</h3><p className="winner">Winner: {room.players.filter(p=>room.winners?.includes(p.seat)).map(p=>p.name).join(' & ')}</p><p>Wins, losses, bumps, and assists were saved.</p><button className="primary" onClick={onLeave}>New round</button></div>}
        <div className="panel stack"><h3>Match activity</h3><ol className="log">{room.log.slice(0,12).map((line,i)=><li key={i}>{line}</li>)}</ol></div>
      </aside></div>
  </div>;
}
type LocalGame = Omit<RoomState,'discards'> & {turnIndex:number;hands:Record<number,Card[]>;deck:Card[];discards:Card[];boardSides:number};
function LocalDemo(){
  const [mode,setMode]=useState<GameMode>('singles');
  const [capacity,setCapacity]=useState(4);
  const [room,setRoom]=useState<LocalGame|null>(null);
  const [cardIndex,setCardIndex]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const choices=mode==='singles'?[1,2,3,4]:[4,6,8];
  const start=(gameMode=mode,playerCount=capacity)=>{
    const seats=possibleSeats(gameMode,playerCount);
    const players=seats.map((seat,index)=>({id:`local-${seat}`,name:index===0?'You':`Player ${index+1}`,seat,isBot:false,color:COLORS[index],marbleCount:0,baseCount:5,handCount:5}));
    const initial={code:'LOCAL',mode:gameMode,capacity:playerCount,status:'waiting',visibility:'private',createdAt:Date.now(),hostId:'local-0',fillAt:null,startedCountdown:false,waitSeconds:60,preferredRelation:'against',players,pieces:[],hands:{},turnIndex:0,turnNumber:0,deck:[],discards:[],statEvents:[],log:[]} as unknown as LocalGame;
    setRoom(startGame(initial));setCardIndex(0);setError('');
  };
  const current=room?.players.find(player=>player.seat===room.players[room.turnIndex]?.seat);
  const hand=current&&room?room.hands[current.seat]||[]:[];
  const moves=room&&current?legalMoves(room,current.seat).filter(move=>move.cardIndex===cardIndex):[];
  function perform(action:()=>void){
    if(!room)return;setBusy(true);setError('');
    try{action();setRoom({...room,pieces:[...room.pieces],players:[...room.players]});setCardIndex(0);}
    catch(reason){setError(errText(reason));}
    finally{setBusy(false);}
  }
  return <>
    <header className="topbar"><span className="brand">● Angry Marbles</span><span className="small">Local demonstration</span></header>
    <main className={`container demo-container ${room?'in-match':''}`}>
      {!room&&<div className="hero"><small className="eyebrow">BOARD GEOMETRY v0.4.2 · LOCAL ONLY</small><h1>ROLL OUT.<br/><span>RACE HOME.</span></h1><p>Try the approved square, hexagon, or octagon board and play cards against the table. Moves stay in this browser; online games need a configured PocketBase server.</p></div>}
      {!room&&<section className="panel stack demo-setup">
        <div><h2>Choose a game</h2><p className="small">Simulated local play · no account or network connection</p></div>
        <div className="toggle"><button className={mode==='singles'?'on':''} onClick={()=>{setMode('singles');setCapacity(4);setRoom(null);}}>Singles</button><button className={mode==='doubles'?'on':''} onClick={()=>{setMode('doubles');setCapacity(4);setRoom(null);}}>Teams of two</button></div>
        <div className="toggle">{choices.map(count=><button key={count} className={capacity===count?'on':''} onClick={()=>{setCapacity(count);setRoom(null);}}>{count} players</button>)}</div>
        <button className="primary" onClick={()=>start()}>Start local game</button>
      </section>}
      {error&&<p className="error" role="alert">{error}</p>}
      {room&&<><div className="demo-status match-status"><strong>LOCAL DEMO</strong><span>{room.mode==='singles'?'Singles':'Team game'} · {room.capacity} players · {room.track} indexed holes</span><button onClick={()=>setRoom(null)}>Lobby</button><button onClick={()=>start()}>Restart</button></div>
        <div className="match-grid">
          <aside className="panel stack match-players"><h3>Players</h3><PlayerList room={{...room,players:room.players.map(player=>({...player,marbleCount:room.pieces.filter(piece=>piece.seat===player.seat&&piece.loc==='home').length,baseCount:room.pieces.filter(piece=>piece.seat===player.seat&&piece.loc==='base').length,handCount:room.hands[player.seat]?.length||0}))}}/></aside>
          <section className="match-center"><div className="game-board-wrap"><Board room={room}/></div>
            <div className="hand-dock"><div className="deck-stack" aria-label={`${room.deck.length} cards in draw pile`}><div className="deck-back">AM</div><strong>{room.deck.length}</strong><small>DRAW PILE</small></div><div className="local-hand" aria-label="Your cards">{hand.map((card,index)=><CardChip key={card.id} card={card} selected={cardIndex===index} onClick={()=>setCardIndex(index)}/>)}</div><button className="end-turn" disabled={busy||!hand.length||room.status!=='playing'} onClick={()=>perform(()=>play(room,current!.seat,null,cardIndex))}>End turn<br/><small>discard selected</small></button></div>
          </section>
          <aside className="panel stack match-aside"><div className="turn-summary"><small>ROOM {room.code}</small><h3>{room.status==='finished'?'Game over':`${current?.name||'Player'} · turn ${room.turnNumber}`}</h3><p>{room.mode==='doubles'?'Partners sit opposite.':'Every seat is competing solo.'}</p><div className="pile-counts"><span><strong>{room.deck.length}</strong> draw</span><span><strong>{room.discards.length}</strong> discard</span></div></div>
            {room.status==='playing'&&<div className="legal-panel"><h4>Selected card · legal plays</h4><div className="moves">{moves.length?moves.map(move=><button key={move.id} disabled={busy} onClick={()=>perform(()=>play(room,current!.seat,move.id))}>{move.label}</button>):<p className="small">No legal move. End your turn by discarding this card.</p>}</div></div>}
            {room.status==='finished'&&<div className="stack"><p className="winner">Winner: {room.players.filter(player=>room.winners?.includes(player.seat)).map(player=>player.name).join(' & ')}</p><button className="primary" onClick={()=>start()}>Play again</button></div>}
            <div className="recent-panel"><h4>Recent moves</h4><ol className="log">{room.log.slice(0,10).map((line,index)=><li key={index}>{line}</li>)}</ol></div>
          </aside>
        </div></>}
    </main><footer>Angry Marbles · Local demonstration · v{VERSION}</footer><span className="version-stamp">v{VERSION}</span>
  </>;
}
function Dashboard(){
  const [profile,setProfile]=useState<Profile|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [nickname,setNickname]=useState('');
  const [mode,setMode]=useState<GameMode>('doubles'),[capacity,setCapacity]=useState(4);
  const [relation,setRelation]=useState<Relation>(()=>new URLSearchParams(window.location.search).get('relation')==='with'?'with':'against');
  const [waitSeconds,setWaitSeconds]=useState(90),[visibility,setVisibility]=useState<'private'|'public'>('private');
  const [codeInput,setCodeInput]=useState(()=>new URLSearchParams(window.location.search).get('room')||'');
  const [activeCode,setActiveCode]=useState(''),[matches,setMatches]=useState<PublicGame[]>([]);
  const choices=mode==='singles'?[1,2,3,4]:[4,6,8];
  const rate=profile?.games?Math.round(profile.wins/profile.games*100):0;
  useEffect(()=>{gameApi.profile().then(setProfile).catch(e=>setError(errText(e)));},[]);
  useEffect(()=>{gameApi.publicRooms(mode,capacity).then(setMatches).catch(()=>setMatches([]));},[mode,capacity,activeCode]);
  async function work(f:()=>Promise<void>){setBusy(true);setError('');try{await f();}catch(e){setError(errText(e));}finally{setBusy(false);}}
  function navigate(code:string,rel:Relation){setActiveCode(code);history.replaceState(null,'',`?room=${code}&relation=${rel}`);}
  async function enter(code:string,rel=relation){
    await work(async()=>{const room=await gameApi.join(code.trim().toUpperCase(),rel);navigate(room.code,rel);});
  }
  function leave(){setActiveCode('');history.replaceState(null,'',window.location.pathname);gameApi.profile().then(setProfile).catch(()=>{});}
  if(activeCode&&profile)return <><header className="topbar"><span className="brand">● Angry Marbles</span><button onClick={()=>pb.authStore.clear()}>Sign out</button></header><Room code={activeCode} onLeave={leave} profile={profile}/><footer>Angry Marbles · v{VERSION} · PocketBase</footer></>;
  return <><header className="topbar"><span className="brand">● Angry Marbles</span><div className="toolbar"><span>{profile?.displayName||'Loading player…'}</span><button onClick={()=>pb.authStore.clear()}>Sign out</button></div></header>
    <main className="container"><div className="hero"><small className="eyebrow">CARD-POWERED MARBLE MAYHEM</small><h1>GOOD FRIENDS.<br/><span>FIERCE RIVALS.</span></h1><p>Create a round, invite your wife or friends, and let computer players take the open seats when the wait ends.</p></div>
      {error&&<div className="error" role="alert">{error}</div>}
      {profile?<div className="score-strip">{([['Games',profile.games],['Wins',profile.wins],['Losses',profile.losses],['Win rate',rate+'%'],['Bumps',profile.bumps],['Assists',profile.assists]] as const).map(([label,val])=><div key={label}><strong>{val}</strong><small>{label}</small></div>)}</div>:<p className="small">Loading player account…</p>}
      <div className="dashboard-grid"><section className="panel stack"><h2>Start a new game</h2><h4>Game style</h4>
        <div className="toggle"><button className={mode==='singles'?'on':''} onClick={()=>{setMode('singles');setCapacity(4);setRelation('against');}}>Singles · no partner</button><button className={mode==='doubles'?'on':''} onClick={()=>{setMode('doubles');setCapacity(4);}}>Two-player teams</button></div>
        <h4>Players this round</h4><div className="toggle">{choices.map(n=><button key={n} className={capacity===n?'on':''} onClick={()=>setCapacity(n)}>{n}</button>)}</div>
        {mode==='doubles'&&<><h4>Play with your wife</h4><div className="toggle"><button className={relation==='with'?'on':''} onClick={()=>setRelation('with')}>Same team</button><button className={relation==='against'?'on':''} onClick={()=>setRelation('against')}>Against each other</button></div><p className="small">Invite the second player to pick whether they join as a teammate or an opponent.</p></>}
        <div className="fields"><label>Room type<select value={visibility} onChange={e=>setVisibility(e.target.value as 'private'|'public')}><option value="private">Private · invite code</option><option value="public">Public · discoverable</option></select></label>
          <label>Wait before computer fill<select value={waitSeconds} onChange={e=>setWaitSeconds(Number(e.target.value))}>{[15,30,60,90,120,180,300].map(s=><option value={s} key={s}>{s<60?`${s} seconds`:`${s/60} minutes`}</option>)}</select></label></div>
        <p className="small">The host starts the timer after guests join.</p>
        <button className="primary" disabled={busy||!profile} onClick={()=>work(async()=>{const room=await gameApi.create({mode,capacity,waitSeconds,visibility,preferredRelation:relation});navigate(room.code,relation);})}>Create game room →</button>
        </section><section className="panel stack"><h2>Join a game</h2><p>Enter the six-character invite code.</p>
          <label>Room code<input value={codeInput} maxLength={6} placeholder="AB23CD" onChange={e=>setCodeInput(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,''))}/></label>
          <label>Join as<select value={relation} onChange={e=>setRelation(e.target.value as Relation)}><option value="with">Their teammate (team game)</option><option value="against">An opponent</option></select></label>
          <button className="primary" disabled={busy||codeInput.length!==6||!profile} onClick={()=>enter(codeInput)}>Join by code →</button><hr/><h3>Open public tables</h3>
          {matches.length?matches.map(m=><div className="public-room" key={m.code}><span>{m.code} · {m.humans}/{m.capacity} people</span><button disabled={busy} onClick={()=>enter(m.code)}>Join</button></div>):<p className="small">No matching open tables right now.</p>}
          <hr/><h3>Your player name</h3><div className="custom"><input value={nickname} maxLength={24} onChange={e=>setNickname(e.target.value)} placeholder={profile?.displayName||'Player name'}/><button disabled={busy||nickname.trim().length<2} onClick={()=>work(async()=>{const value=await gameApi.updateName(nickname);setProfile(value);setNickname('');})}>Update</button></div>
        </section></div><section className="footnote"><h3>Your house rules</h3><p>Two decks and all four jokers. Five starting cards and a draw every turn. Splittable sevens and nines, backward eights, teammate bumps, exact home-run movement, and automatic reshuffles. No duplicate marble colors.</p></section>
    </main><footer>Angry Marbles · v{VERSION} · PocketBase edition · Provisional board geometry</footer></>;
}
export default function App(){
  const [loggedIn,setLoggedIn]=useState(pb.authStore.isValid);
  useEffect(()=>pb.authStore.onChange(()=>setLoggedIn(pb.authStore.isValid)),[]);
  if(!hasConfiguredBackend)return <LocalDemo/>;
  return <><span className="version-stamp">v0.4.2</span>{loggedIn?<Dashboard/>:<Login onLogin={()=>setLoggedIn(true)}/>}</>;
}
