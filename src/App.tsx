import {useEffect,useState, type FormEvent} from 'react';
import {authApi,authStore,hasConfiguredBackend,gameApi,setSession,subscribeRoom,type Profile,type PublicGame,type GameMode,type Relation} from './cloudflare';
import {COLORS,possibleSeats,startGame,legalMoves,play,MARBLES} from './engine.js';
import type {RoomState,Player,Card,ConfirmedAction} from './types';
import {useActionPlayback} from './useActionPlayback';
import boardGeometry from '../pb_hooks/boardGeometry.cjs';
import ApprovedBoard from './board/ApprovedBoard';
const VERSION='0.6.0';
const errText=(error:unknown)=>error instanceof Error?error.message:String(error);
const pieceName=(id:string)=>{
  const [seatText,slotText]=id.split(':');
  return `P${Number(seatText)+1} marble ${Number(slotText)+1}`;
};
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
        const session=await authApi.register(name,email,password);
        setSession(session.token);
        onLogin();
        return;
      }
      const session=await authApi.login(email,password);
      setSession(session.token);
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
function Board({room,selectedPieceIds=[],onPieceSelect,action=null,fast=false}:{room:Pick<RoomState,'players'|'pieces'|'boardSides'|'mode'|'capacity'|'mySeat'>;selectedPieceIds?:string[];onPieceSelect:(pieceId:string)=>void;action?:ConfirmedAction|null;fast?:boolean}){
  const sideCount=room.boardSides||boardGeometry.boardSides(room.mode,room.capacity);
  return <ApprovedBoard sideCount={sideCount} players={room.players} pieces={room.pieces} activeSeat={room.mySeat??room.players[0]?.seat??0} selectedPieceIds={selectedPieceIds} onPieceSelect={onPieceSelect} action={action} fast={fast} showIndices={false}/>;
}
function CardChip({card,selected,onClick}:{card:Card,selected:boolean,onClick:()=>void}){
  const red=card.suit==='♥'||card.suit==='♦';
  const portrait=card.rank==='JOKER'?'joker':({J:'jack',Q:'queen',K:'king'} as Record<string,string>)[card.rank]||null;
  const suitName=({'♥':'hearts','♦':'diamonds','♣':'clubs','♠':'spades'} as Record<string,string>)[card.suit];
  const jokerIndex=(Number(card.id.split(':')[0])||0)*2+(card.suit==='☆'?1:0);
  const imageUrl=suitName||card.rank==='JOKER' ? `${import.meta.env.BASE_URL}assets/art/${card.rank==='JOKER'?`joker-${jokerIndex%4}`:suitName+'-'+card.rank}.webp` : null;
  const label=card.rank==='JOKER'?'JOKER':`${card.rank} of ${card.suit}`;
  return <button type="button" aria-label={label} aria-pressed={selected} className={`playing-card ${selected?'selected':''} ${red?'red':''} ${portrait?'royal':''}`} onClick={onClick}>
    {imageUrl?<img src={imageUrl} alt={card.rank==='JOKER'?'Marble jester':`Marble ${card.rank}`} />:<><span className="corner-index">{card.rank}<br/>{card.suit}</span>{card.suit}</>}
  </button>;
}
function PlayerList({room,selectedPieceIds=[],onPieceSelect,action=null,locked=false}:{room:Pick<RoomState,'players'|'turnSeat'|'dealerSeat'|'mode'|'capacity'> & Partial<Pick<RoomState,'pieces'>>;selectedPieceIds?:string[];onPieceSelect?:(id:string)=>void;action?:ConfirmedAction|null;locked?:boolean}){
  const sideCount=boardGeometry.boardSides(room.mode,room.capacity);
  const portraits=['fox','panda','dragon','cat','dog','owl'];
  return <div className="roster">{room.players.map(p=>{
    const partner=room.mode==='doubles'?boardGeometry.oppositeSeat(p.seat,sideCount):p.seat;
    const team=room.mode==='doubles'?Math.min(p.seat,partner)%(sideCount/2)+1:null;
    return <div key={p.seat} data-player-seat={p.seat} className={`player ${room.turnSeat===p.seat?'active':''}`}>
      <div className="avatar-inventory"><img className="player-avatar" src={`${import.meta.env.BASE_URL}assets/v060/avatars/${portraits[p.seat%portraits.length]}.png`} alt={`${portraits[p.seat%portraits.length]} player portrait`}/><div className="inventory-pocket" data-inventory-pocket={p.seat} aria-label={`${p.name}'s inventory pocket`}/></div>
      <div><div className="pname">{p.name} {p.isBot&&<span>(Bot)</span>} · P{p.seat+1}</div><div className="pmeta">{team?`Team ${team}`:'Solo'} · {p.baseCount} in base / {5-p.baseCount} out · {p.marbleCount}/5 home</div><div className="avatar-tokens" aria-label={`${p.baseCount} of 5 marbles in inventory`}>{Array.from({length:5},(_,index)=>{const id=`${p.seat}:${index}`;const piece=room.pieces?.find(m=>m.id===id);const inBase=piece?piece.loc==='base':index<p.baseCount;const departing=action?.changes.some(c=>c.from.id===id&&c.from.loc==='base'&&c.to.loc!=='base');return <button type="button" key={id} data-inventory-piece={id} className={`inventory-token ${inBase?'filled':'empty'} ${selectedPieceIds.includes(id)?'selected':''} ${departing?'departing':''}`} style={{backgroundColor:inBase?p.color:undefined}} disabled={locked||!inBase||!onPieceSelect} aria-label={`Select ${p.name}'s inventory marble ${index+1}`} aria-pressed={selectedPieceIds.includes(id)} onClick={()=>onPieceSelect?.(id)}><span className="sr-only">{index+1}</span></button>;})}</div></div>
    </div>;
  })}</div>;
}

function Room({code,onLeave,profile}:{code:string,onLeave:()=>void,profile:Profile}){
  const [fast,setFast]=useState(()=>localStorage.getItem('angrymarbles_fast_animation')==='true');
  const {room,action,animating,accept:setRoom}=useActionPlayback(fast);
  const [error,setError]=useState('');
  const [visualPhase,setVisualPhase]=useState('');
  useEffect(()=>{
    setVisualPhase('');
    const update=(event:Event)=>{const detail=(event as CustomEvent<{actionId:string;name:string}>).detail;if(detail.actionId===action?.id)setVisualPhase(detail.name);};
    window.addEventListener('angrymarbles:visual-phase',update);return()=>window.removeEventListener('angrymarbles:visual-phase',update);
  },[action?.id]);
  const [cardIndex,setCardIndex]=useState(0),[selectedPieceId,setSelectedPieceId]=useState(''),[selectedMoveId,setSelectedMoveId]=useState(''),[customColor,setCustomColor]=useState('#ffffff');
  const [now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false);
  async function refresh(){try{setRoom(await gameApi.state<RoomState>(code));setError('');}catch(e){setError(errText(e));}}
  useEffect(()=>{
    let active=true;
    const update=async()=>{try{const state=await gameApi.state<RoomState>(code);if(active)setRoom(state);}catch(e){if(active)setError(errText(e));}};
    void update();
    const unsubscribe=subscribeRoom(code,()=>void update(),e=>{if(active)setError('Live updates unavailable: '+errText(e));});
    const periodic=setInterval(()=>void update(),30000);
    const visibility=()=>{if(document.visibilityState==='visible')void update();};
    document.addEventListener('visibilitychange',visibility);
    return ()=>{active=false;unsubscribe();clearInterval(periodic);document.removeEventListener('visibilitychange',visibility);};
  },[code]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{setCardIndex(0);setSelectedPieceId('');setSelectedMoveId('');},[room?.turnNumber]);
  useEffect(()=>{
    if(room?.status==='waiting'&&room.startedCountdown&&room.fillAt&&Date.now()>=room.fillAt){
      gameApi.fill(code).then(()=>refresh()).catch(e=>setError(errText(e)));
    }
  },[code,room?.status,room?.startedCountdown,room?.fillAt,now>= (room?.fillAt||Infinity)]);
  async function call(action:()=>Promise<unknown>){setBusy(true);setError('');try{await action();await refresh();}catch(e){setError(errText(e));}finally{setBusy(false);}}
  if(!room)return <div className="panel"><p>{error||`Loading game room ${code}…`}</p><button onClick={onLeave}>Go back</button></div>;
  const filtered=room.myMoves.filter(m=>m.cardIndex===cardIndex)||[];
  const availableMoves=selectedPieceId?filtered.filter(move=>move.pieceIds?.includes(selectedPieceId)):[];
  const selectedMove=availableMoves.find(move=>move.id===selectedMoveId);
  const warningMessages=selectedMove?.warnings?.length?selectedMove.warnings:(action||room.actions?.at(-1))?.warnings||[];
  const highlightedPieces=selectedMove?.pieceIds||(selectedPieceId?[selectedPieceId]:[...new Set(filtered.flatMap(move=>move.pieceIds||[]))]);
  const me=room.players.find(p=>p.seat===room.mySeat);
  const isHost=room.hostId===profile.userId;
  const isTurn=room.status==='playing'&&room.mySeat===room.turnSeat;
  const choosePiece=(pieceId:string)=>{
    if(animating||busy||!isTurn)return;
    const pieceMoves=filtered.filter(move=>move.pieceIds?.includes(pieceId));
    if(!pieceMoves.length){
      setSelectedPieceId('');setSelectedMoveId('');
      const piece=room.pieces.find(p=>p.id===pieceId);
      setError(room.myHand[cardIndex]?.rank==='8'&&piece?.loc==='base'?'An 8 moves a marble already on the track backward, including one on green START. Use Ace, Jack, Queen, or King to release from inventory.':'That marble cannot play this card. Glowing marbles show legal choices.');return;
    }
    setError('');
    if(selectedPieceId===pieceId){setSelectedPieceId('');setSelectedMoveId('');return;}
    setSelectedPieceId(pieceId);setSelectedMoveId(pieceMoves.length===1?pieceMoves[0].id:'');
  };
  const secondsLeft=room.fillAt?Math.max(0,Math.ceil((room.fillAt-now)/1000)):null;
  const shareUrl=`${window.location.origin}${window.location.pathname}?room=${code}&relation=${room.preferredRelation||'against'}`;
  const playSelected=()=>{
    if(animating)return;
    if(selectedMove){void call(()=>gameApi.move(code,selectedMove.id));return;}
    if(filtered.length===0){void call(()=>gameApi.discard(code,cardIndex));return;}
    setError(selectedPieceId?'Choose the exact split or destination below.':'Tap a glowing marble on the board to choose what this card does.');
  };
  return <div className="approved-page" style={{'--player-count':room.capacity} as React.CSSProperties}>
    <header><div className="brand"><strong>ANGRY</strong> MARBLES<small>{room.mode==='doubles'?'PARTNER GAME':'SINGLES'} · {room.capacity} SIDES · ROOM {room.code}</small></div><div className="hdr-actions"><span className={`pill ${room.status==='playing'?'green':''}`}>● {room.status==='playing'?'LIVE GAME':room.status.toUpperCase()}</span><button className="pill" onClick={()=>navigator.clipboard.writeText(shareUrl).catch(()=>setError('Copy failed; share your room code instead.'))}>Copy invite link</button><button className="pill" onClick={onLeave}>Back to lobby</button><button className="pill" onClick={()=>void authApi.logout()}>Sign out</button></div></header>
    {error&&<div className="status" role="alert">{error}</div>}
    <div className="layout">
      <aside className="panel side left"><div><h3>PLAYERS</h3><div className="sub">{room.mode==='doubles'?`${room.capacity}-player · ${room.capacity/2} teams of 2`:`Singles · ${room.capacity} players`}</div><PlayerList room={room} selectedPieceIds={highlightedPieces} onPieceSelect={choosePiece} action={action} locked={busy||animating||!isTurn}/></div><div className="notes"><strong style={{color:'#ffd45c'}}>BASE = avatar inventory. HOME = five inward holes.</strong><p>Teammates sit directly opposite. {room.players.length} of {room.capacity} seats filled.</p></div></aside>
      <section className="boardcolumn">{warningMessages.length>0&&<div className="collision-warning" role="alert"><strong>{selectedMove?.warnings?.length?'Warning before play':'Teammate returned to inventory'}</strong>{warningMessages.map(message=><p key={message}>{message}</p>)}</div>}<div className="board-wrap"><span className="boardtag">TABLE VIEW · P{(room.mySeat??0)+1} AT THE BOTTOM</span>{(action||room.actions?.at(-1))&&<div className="current-play-banner" aria-live="polite"><span>{room.players.find(p=>p.seat===(action||room.actions!.at(-1)!).actorSeat)?.name}<br/><strong>{(action||room.actions!.at(-1)!).discarded?'Passed':'Played'} {(action||room.actions!.at(-1)!).card.rank}{(action||room.actions!.at(-1)!).card.suit}</strong></span><CardChip card={(action||room.actions!.at(-1)!).card} selected={false} onClick={()=>{}}/></div>}<Board room={room} selectedPieceIds={highlightedPieces} onPieceSelect={choosePiece} action={action} fast={fast}/></div>
        {room.status==='playing'&&<div className="cardbar"><div className="deck-stack" role="img" aria-label={`${room.deckCount} cards in the draw pile`}><span className="deck-card-back"><b>AM</b></span><strong>{room.deckCount}</strong></div><span className="yourhand">YOUR HAND<br/><small>{room.myHand.length} CARDS</small></span>{room.myHand.map((card,index)=><CardChip key={card.id+index} card={card} selected={cardIndex===index} onClick={()=>{if(animating)return;setCardIndex(index);setSelectedPieceId('');setSelectedMoveId('');setError('');}}/>)}<div className="card-note"><b>{isTurn?'YOUR TURN':`Waiting for ${room.players.find(player=>player.seat===room.turnSeat)?.name||'player'}`}</b><br/>{isTurn&&filtered.length>0&&!selectedMove?(selectedPieceId?'Choose a move below':'Tap a glowing marble'):`Dealer: ${room.players.find(player=>player.seat===room.dealerSeat)?.name||'—'}`}<br/>Discard: {room.discards} · Turn {room.turnNumber}</div>{isTurn&&<button className="primary" disabled={busy||animating||!room.myHand.length} onClick={playSelected}>{filtered.length?'Play selected':'Pass turn'}</button>}</div>}
        {room.status==='waiting'&&<div className="cardbar"><span className="yourhand">ROOM<br/><small>{room.code}</small></span><div className="card-note">{room.players.length} of {room.capacity} seats filled · {room.mode==='doubles'?'Teammates sit opposite.':'Singles game.'} Empty seats can be filled by computer players.</div>{room.startedCountdown&&<span className="pill green">Bots join in {secondsLeft}s</span>}{isHost?<><button className="primary" disabled={busy||room.startedCountdown} onClick={()=>call(()=>gameApi.countdown(code))}>Start waiting · {room.waitSeconds}s</button><button disabled={busy} onClick={()=>call(()=>gameApi.fillNow(code))}>Play computers now</button></>:!room.startedCountdown&&<span className="pill">Waiting for host</span>}</div>}
        {room.status==='finished'&&<div className="cardbar"><span className="yourhand">GAME<br/><small>COMPLETE</small></span><div className="card-note"><b>Winner: {room.players.filter(player=>room.winners?.includes(player.seat)).map(player=>player.name).join(' & ')}</b><br/>Wins, losses, bumps, and assists were saved.</div><button className="primary" onClick={onLeave}>New game</button></div>}
        {room.status==='playing'&&<div className="marble-picker"><p>{room.myHand[cardIndex]?.rank==='8'?'8: choose a marble on the track to move backward 8, including one on green START. Inventory marbles need Ace, J, Q, or K.':'Choose a specific marble on the board or in the numbered list. Inventory marbles are beside your avatar.'}</p><div>{room.pieces.filter(p=>p.seat===room.mySeat||highlightedPieces.includes(p.id)).map(p=><button type="button" key={p.id} disabled={busy||animating||!isTurn} aria-pressed={selectedPieceId===p.id} className={highlightedPieces.includes(p.id)?'legal-piece':''} onClick={()=>choosePiece(p.id)}>{pieceName(p.id)} · {p.loc==='base'?'Inventory':p.loc==='track'&&p.progress===0?'Green START':p.loc==='track'?'Track':p.loc==='home'?'Finished':'Home run'}</button>)}</div></div>}
        <div className="playback-tools"><label><input type="checkbox" checked={fast} onChange={event=>{setFast(event.target.checked);localStorage.setItem('angrymarbles_fast_animation',String(event.target.checked));}}/> Fast animations</label><span>Sound off</span>{room.botReadyAt&&!animating&&<span>Computer is considering a card…</span>}</div>
        <section className="played-cards" aria-label="Public played cards"><h3>{action?`${room.players.find(p=>p.seat===action.actorSeat)?.name||'Player'} ${action.discarded?'passes':'plays'} ${action.card.rank}${action.card.suit}`:'PLAYED CARDS'}</h3><div className="played-card-history">{[...(room.actions||[])].filter(e=>!action||e.seq<=action.seq).reverse().slice(0,16).map(event=><div key={event.id} className={`played-card-entry ${action?.id===event.id?'current':''}`}><CardChip card={event.card} selected={action?.id===event.id} onClick={()=>{}}/><small>{room.players.find(p=>p.seat===event.actorSeat)?.name}<br/>{event.discarded?'Passed':'Played'} · #{event.seq}</small></div>)}</div>{action&&<p className="action-caption" role="status">{({
          'inventory-pocket-drop':'Marble drops into its avatar pocket',
          'green-trapdoor-open':'Green START trapdoor opens',
          'green-marble-rise':'Marble rises from beneath green START',
          'green-trapdoor-close':'Green START trapdoor closes',
          'opponent-to-inventory':'Marble returns to its avatar inventory',
          'teammate-to-red':'Teammate teleports to their red outer-track marker',
          'track-move':'Following the confirmed track move'
        } as Record<string,string>)[visualPhase]||action.label}</p>}<details className="card-ledger"><summary>Public card ledger ({room.actions?.length||0})</summary><ol>{[...(room.actions||[])].reverse().map(e=><li key={e.id}>#{e.seq} · {room.players.find(p=>p.seat===e.actorSeat)?.name} {e.discarded?'passed':'played'} {e.card.rank}{e.card.suit}</li>)}</ol></details></section>
        <div className="bottomline">{room.status==='playing'?'Only your hand and your server-validated legal moves are visible to you.':'Your room and seat are managed by Cloudflare.'}</div>
      </section>
      <aside className="panel side right"><div><h3>ROOM DETAILS</h3><div className="sub">ROOM {room.code} · {room.status==='playing'?'LIVE':'WAITING'}</div><table><tbody><tr><td>Game mode</td><td>{room.mode==='doubles'?'Teams of two':'Singles'}</td></tr><tr><td>Players</td><td>{room.players.length} / {room.capacity}</td></tr><tr><td>First to finish</td><td>Yes</td></tr><tr><td>Track spaces</td><td>{room.track}</td></tr><tr><td>Draw pile</td><td>{room.deckCount}</td></tr><tr><td>Turn</td><td>{room.turnNumber}</td></tr></tbody></table>
        {room.status==='waiting'&&<><div className="status">{room.startedCountdown?'The room will fill open seats with computer players when the timer ends.':'Waiting for invited players to join.'}</div><label className="block">Pick a marble color</label><div className="palette">{COLORS.map(color=>{const taken=room.players.some(player=>player.color.toLowerCase()===color.toLowerCase()&&player.seat!==room.mySeat);return <button key={color} title={taken?`${color} (taken)`:color} aria-label={`Marble color ${color}`} disabled={taken||busy} className={`swatch ${me?.color.toLowerCase()===color.toLowerCase()?'chosen':''}`} style={{backgroundColor:color}} onClick={()=>call(()=>gameApi.color(code,color))}/>;})}</div><div className="custom"><label>Custom color <input type="color" value={customColor} onChange={event=>setCustomColor(event.target.value)}/></label><button disabled={busy} onClick={()=>call(()=>gameApi.color(code,customColor))}>Use custom</button></div></>}
        {room.status==='playing'&&<><h3 className="move-heading">CHOOSE A MOVE</h3><div className="moves">{filtered.length?selectedPieceId?availableMoves.length?availableMoves.slice(0,100).map(move=><button type="button" key={move.id} disabled={busy||animating||!isTurn} aria-pressed={selectedMove?.id===move.id} className="move-option" onClick={()=>setSelectedMoveId(move.id)}><span>{move.label}</span>{move.pieceIds?.length?<small>Pieces: {move.pieceIds.map(pieceName).join(' + ')}</small>:null}</button>):<p className="sub">This marble cannot play that card. Tap a highlighted marble or tap it again to clear.</p>:<p className="sub">Tap one of the glowing marbles on the board to see its legal moves.</p>:<p className="sub">{isTurn?'No legal move for this card. Choose Pass turn.':'Waiting for the active player.'}</p>}</div></>}
        {room.status==='finished'&&<p className="status">Match complete.</p>}
        <div className="recent-panel"><h3>RECENT MOVES</h3><ol className="log">{room.log.slice(0,8).map((line,index)=><li key={index}>{line}</li>)}</ol></div></div></aside>
    </div><footer className="foot">Angry Marbles · geometry-locked arcade edition v{VERSION} · Cloudflare Workers</footer>
  </div>;
}
type LocalGame = Omit<RoomState,'discards'> & {turnIndex:number;hands:Record<number,Card[]>;deck:Card[];discards:Card[];boardSides:number};
function LocalDemo(){
  const [mode,setMode]=useState<GameMode>('doubles');
  const [capacity,setCapacity]=useState(6);
  const [room,setRoom]=useState<LocalGame|null>(null);
  const [cardIndex,setCardIndex]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [showIndices,setShowIndices]=useState(false);
  const choices=mode==='singles'?[1,2,3,4]:[4,6,8];
  const start=(gameMode=mode,playerCount=capacity)=>{
    const seats=possibleSeats(gameMode,playerCount);
    const names=['Blue','Red','Green','Gold','Purple','Orange','Cyan','Pink'];
    const approvedColors=['#329bff','#f04b5c','#17c98c','#ffcf3e','#bb7bff','#fa963b','#21c7e5','#ed74b3'];
    const players=seats.map(seat=>({id:`local-${seat}`,name:seat===0?'You':names[seat],seat,isBot:false,color:approvedColors[seat],marbleCount:0,baseCount:5,handCount:5}));
    const initial={code:'LOCAL',mode:gameMode,capacity:playerCount,status:'waiting',visibility:'private',createdAt:Date.now(),hostId:'local-0',fillAt:null,startedCountdown:false,waitSeconds:60,preferredRelation:'against',players,pieces:[],hands:{},turnIndex:0,turnNumber:0,deck:[],discards:[],statEvents:[],log:[]} as unknown as LocalGame;
    const next=startGame(initial);next.turnSeat=next.players[next.turnIndex].seat;next.boardSides=boardGeometry.boardSides(gameMode,playerCount);
    setRoom(next);setCardIndex(0);setError('');
  };
  useEffect(()=>{start('doubles',6);},[]);
  const current=room?.players.find(player=>player.seat===room.players[room.turnIndex]?.seat);
  const hand=current&&room?room.hands[current.seat]||[]:[];
  const moves=room&&current?legalMoves(room,current.seat).filter(move=>move.cardIndex===cardIndex):[];
  const releaseMove=moves.find(move=>move.label.startsWith('Exit:'));
  const oneStepMove=moves.find(move=>/\+1(?:\s|$|→)/.test(move.label));
  function perform(action:()=>void){
    if(!room)return;setBusy(true);setError('');
    try{action();setRoom({...room,turnSeat:room.players[room.turnIndex]?.seat??null,pieces:[...room.pieces],players:[...room.players]});setCardIndex(0);}
    catch(reason){setError(errText(reason));}
    finally{setBusy(false);}
  }
  const seatCount=room?.boardSides||4;
  const localPlayers=room?.players.map(player=>({...player,marbleCount:room.pieces.filter(piece=>piece.seat===player.seat&&piece.loc==='home').length,baseCount:room.pieces.filter(piece=>piece.seat===player.seat&&piece.loc==='base').length,handCount:room.hands[player.seat]?.length||0}))||[];
  const localView=room?{...room,players:localPlayers}:null;
  return <>
    <div className="approved-page">
      <header><div className="brand"><strong>ANGRY</strong> MARBLES<small>THE ORIGINAL RULES · ARCADE EDITION</small></div><div className="hdr-actions"><span className="pill green">● LOCAL DEMO</span><span className="pill">Two full decks · 4 Jokers · 108 cards</span></div></header>
      {error&&<div className="status" role="alert">{error}</div>}
      {room&&<div className="layout">
        <aside className="panel side left"><div><h3>PLAYERS</h3><div className="sub">{room.mode==='doubles'?`${seatCount}-player · ${seatCount/2} teams of 2`:`Singles · ${room.capacity} players`}</div><PlayerList room={{...room,players:localPlayers}}/></div><div className="notes"><strong style={{color:'#ffd45c'}}>BASE = avatar inventory. HOME = five inward holes.</strong><p>Each avatar holds five base marbles; each red HOME branch has five empty holes. Teammates sit directly opposite. This local demo does not connect to an online room.</p></div></aside>
        <section className="boardcolumn"><div className="board-wrap"><span className="boardtag">EXACT SPACES · ARCADE STYLE</span><ApprovedBoard sideCount={seatCount} players={localPlayers} pieces={room.pieces} activeSeat={current?.seat||0} showIndices={showIndices}/></div>
          <div className="board-actions"><button className="primary" disabled={busy||!releaseMove} onClick={()=>releaseMove&&perform(()=>play(room,current!.seat,releaseMove.id))}>▶ Roll marble from base</button><button className="secondary" disabled={busy||!oneStepMove} onClick={()=>oneStepMove&&perform(()=>play(room,current!.seat,oneStepMove.id))}>Move on track +1</button><button className="secondary" onClick={()=>start()} disabled={busy}>Reset marbles</button><label className="switch"><input type="checkbox" checked={showIndices} onChange={event=>setShowIndices(event.target.checked)}/> Show landmark numbers</label></div>
          <div className="cardbar"><span className="yourhand">YOUR HAND<br/><small>{hand.length} CARDS</small></span>{hand.map((card,index)=><CardChip key={card.id} card={card} selected={index===cardIndex} onClick={()=>setCardIndex(index)}/>)}<div className="card-note"><b>{current?.name||'Player'} · Turn {room.turnNumber}</b><br/>Draw pile: {room.deck.length} · Discards: {room.discards.length}<br/>Select a card to see server-rule-validated moves.</div><button className="primary" disabled={busy||!hand.length||room.status!=='playing'} onClick={()=>perform(()=>play(room,current!.seat,null,cardIndex))}>End turn</button></div>
          <div className="bottomline">Local demonstration only. No login, network game, or remote players in this preview.</div>
        </section>
        <aside className="panel side right"><div><h3>BOARD SETTINGS</h3><label className="block" htmlFor="game-mode">Game mode</label><select id="game-mode" value={mode} onChange={event=>{const nextMode=event.target.value as GameMode;const nextCapacity=nextMode==='singles'?4:4;setMode(nextMode);setCapacity(nextCapacity);start(nextMode,nextCapacity);}}><option value="singles">Singles</option><option value="doubles">Teams of two</option></select><label className="block" htmlFor="seats">Number of player sides</label><select id="seats" value={capacity} onChange={event=>{const value=Number(event.target.value);setCapacity(value);start(mode,value);}}>{choices.map(value=><option value={value} key={value}>{value}{mode==='singles'?' players':` · ${value===4?'square':value===6?'regular hexagon':'regular octagon'}`}</option>)}</select>
          <div className="legend"><span><i className="dot" style={{background:'#e43f47'}}/> Red = home turn</span><span><i className="dot" style={{background:'#00ad74'}}/> Green = base exit</span></div><table><tbody><tr><td>Track holes / side*</td><td>18</td></tr><tr><td>Reverse corner</td><td>0</td></tr><tr><td>Red marker</td><td>2</td></tr><tr><td>Green start</td><td>8</td></tr><tr><td>Next corner</td><td>18</td></tr><tr><td>Green → next corner</td><td>10 moves</td></tr><tr><td>Separate home run</td><td>5 holes</td></tr><tr><td>Marbles in base initially</td><td>5</td></tr><tr><td>Total outer-track holes*</td><td>{seatCount*18}</td></tr></tbody></table><div className="status">All {room.capacity*5} marbles start in their avatar inventories. Select a card to see legal moves.</div>
          <h3 style={{marginTop:20}}>LEGAL MOVES</h3><div className="moves">{moves.length?moves.map(move=><button key={move.id} disabled={busy} onClick={()=>perform(()=>play(room,current!.seat,move.id))}>{move.label}</button>):<p className="sub">No legal move for this card. End the turn by discarding it.</p>}</div>{room.status==='finished'&&<p className="status">Winner: {room.players.filter(player=>room.winners?.includes(player.seat)).map(player=>player.name).join(' & ')}</p>}<div className="recent-panel"><h3>RECENT MOVES</h3><ol className="log">{room.log.slice(0,6).map((line,index)=><li key={index}>{line}</li>)}</ol></div><div className="sub" style={{marginTop:9}}>*The corner at 18 is the next side's position 0, so it is counted once.</div></div></aside>
      </div>}
      <footer className="foot">Angry Marbles · geometry-locked arcade preview v{VERSION} · local demonstration · Cloudflare Worker integration available when configured</footer><span className="version-stamp">v{VERSION}</span>
    </div>
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
  if(activeCode&&profile)return <Room code={activeCode} onLeave={leave} profile={profile}/>;
  return <><header className="topbar"><span className="brand">● Angry Marbles</span><div className="toolbar"><span>{profile?.displayName||'Loading player…'}</span><button onClick={()=>void authApi.logout()}>Sign out</button></div></header>
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
    </main><footer>Angry Marbles · v{VERSION} · Cloudflare Workers edition</footer></>;
}
export default function App(){
  const [loggedIn,setLoggedIn]=useState(authStore.isValid);
  useEffect(()=>{
    const mobileQuery=window.matchMedia('(max-width: 1000px), (pointer: coarse)');
    const mobileAgent=/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
    const updateDevice=()=>{document.documentElement.dataset.entryDevice=mobileQuery.matches||mobileAgent?'mobile':'desktop';};
    updateDevice();
    mobileQuery.addEventListener('change',updateDevice);
    window.addEventListener('resize',updateDevice);
    return ()=>{mobileQuery.removeEventListener('change',updateDevice);window.removeEventListener('resize',updateDevice);};
  },[]);
  useEffect(()=>{
    const unsubscribe=authStore.onChange(()=>setLoggedIn(authStore.isValid));
    if(authStore.isValid)authApi.me().catch(()=>authStore.clear());
    return unsubscribe;
  },[]);
  if(!hasConfiguredBackend)return <LocalDemo/>;
  return <><span className="version-stamp">v{VERSION}</span>{loggedIn?<Dashboard/>:<Login onLogin={()=>setLoggedIn(true)}/>}</>;
}
