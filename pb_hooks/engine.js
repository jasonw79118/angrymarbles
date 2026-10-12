const boardGeometry = require(__hooks + '/boardGeometry.cjs');

const VERSION = '0.4.2';
const TRACK_PER_SEAT = boardGeometry.TRACK_PER_SIDE;
const TRACK = TRACK_PER_SEAT * 8;
const MARBLES = 5;
const RUN = 5;
const COLORS = ['#329bff','#f04b5c','#17c98c','#ffcf3e','#bb7bff','#fa963b','#21c7e5','#ed74b3','#f368e0','#ff9f43','#1dd1a1','#5f27cd','#ff6b81','#00d2d3','#8395a7','#10ac84','#c8d6e5','#576574','#ff7675','#74b9ff','#ffeaa7','#55efc4','#a29bfe','#fd79a8','#fab1a0','#81ecec','#e17055','#6c5ce7','#00cec9','#d63031','#0984e3','#00b894','#e84393','#fdcb6e','#badc58','#95afc0','#22a6b3','#be2edd','#f0932b','#eb4d4b','#6ab04c','#686de0','#f6e58d','#7ed6df','#ffbe76','#535c68','#130f40','#c7ecee'];

const FACES = ['J', 'Q', 'K'];
const FACE = new Set(FACES);
const MOD = (n, d) => ((n % d) + d) % d;
const clone = v => JSON.parse(JSON.stringify(v));
const boardSidesFor = room => boardGeometry.boardSides(room.mode, room.capacity);
const trackSize = room => boardGeometry.trackLength(boardSidesFor(room));
const exitOf = seat => boardGeometry.startIndex(seat);
const trackPosition = (piece, sideCount = 8) => boardGeometry.trackIndex(piece.seat, piece.progress, sideCount);
const friendly = (room, a, b) => room.mode === 'doubles' && a !== b && boardGeometry.oppositeSeat(a, room.capacity) === b;
function possibleSeats(mode, capacity) {
  if (mode === 'singles' && capacity === 1) return [0];
  if (mode === 'singles' && capacity === 2) return [0, 2];
  if (mode === 'singles' && capacity === 3) return [0, 1, 2];
  if (mode === 'singles' && capacity === 4) return [0, 1, 2, 3];
  if (mode === 'doubles' && capacity === 4) return [0, 2, 1, 3];
  if (mode === 'doubles' && capacity === 6) return [0, 3, 1, 4, 2, 5];
  if (mode === 'doubles' && capacity === 8) return [0, 4, 1, 5, 2, 6, 3, 7];
  throw Error('Invalid mode or player count');
}
function makeDeck() {
  const deck = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of ['♠', '♥', '♦', '♣']) {
      for (const rank of ['A','2','3','4','5','6','7','8','9','10','J','Q','K']) {
        deck.push({rank, suit, id: `${copy}:${suit}:${rank}`});
      }
    }
    deck.push({rank: 'JOKER', suit: '★', id: `${copy}:joker:1`});
    deck.push({rank: 'JOKER', suit: '☆', id: `${copy}:joker:2`});
  }
  return deck; // 108 cards total
}
function shuffle(cards) {
  const arr = [...cards];
  for (let i=arr.length-1;i>0;i--) {
    // Cards are shuffled only on the authoritative game server, never in a client.
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}
function takeCard(room) {
  if (!room.deck.length && room.discards.length > 1) {
    const newest = room.discards.pop();
    room.deck = shuffle(room.discards);
    room.discards = [newest];
    room.dealerIndex = ((room.dealerIndex || 0) + 1) % room.players.length;
    room.log = [`Deal passes to ${owner(room,room.players[room.dealerIndex].seat)}. Discards reshuffled.`, ...(room.log || [])].slice(0, 16);
  }
  return room.deck.pop() || null;
}
function startGame(room) {
  if (room.status !== 'waiting') return room;
  if (room.players.length !== room.capacity) throw Error('Room is not full');
  // Seating invitations may arrive in partner-first order, but actual play
  // proceeds clockwise by physical seat number around the table.
  room.players.sort((a,b) => a.seat - b.seat);
  room.status = 'playing';
  room.startedAt = Date.now();
  room.boardSides = boardSidesFor(room);
  room.deck = shuffle(makeDeck());
  room.discards = [];
  room.pieces = room.players.flatMap(player => Array.from({length:MARBLES},(_,i)=>({id:`${player.seat}:${i}`,seat:player.seat,slot:i,loc:'base',progress:0,run:-1})));
  room.hands = {};
  for (const player of room.players) room.hands[player.seat] = Array.from({length:5},() => takeCard(room));
  room.dealerIndex = 0;
  room.turnIndex = 0;
  room.turnNumber = 1;
  room.log = ['Game started. Everybody received five cards.'];
  drawAtTurnStart(room);
  return room;
}
function drawAtTurnStart(room) {
  const seat = room.players[room.turnIndex].seat;
  const card = takeCard(room);
  if (card) room.hands[seat].push(card);
}
function pieceFor(room, id) { return room.pieces.find(p => p.id === id); }
function setBase(p) { p.loc='base';p.progress=0;p.run=-1; }
function sendHomeOrBase(room, victim, log) {
  const occupied = room.pieces.some(p => p !== victim && p.seat===victim.seat && p.loc==='run' && p.run===0);
  if (occupied) {
    setBase(victim);
    log.push(`${owner(room,victim.seat)}'s home-run entrance was blocked, so their marble returned to base.`);
  } else {
    victim.loc='run'; victim.run=0; victim.progress=0;
    log.push(`${owner(room,victim.seat)}'s marble was bumped to the beginning of home.`);
  }
}
function owner(room, seat) { return room.players.find(p=>p.seat===seat)?.name || 'Player'; }
function recordStat(room, seat, stat) {
  const actor = room.currentActorSeat ?? seat;
  const target = stat === 'assistExit' ? seat : actor;
  const key = stat === 'assistExit' ? 'assists' : stat;
  room.statEvents ||= [];
  room.statEvents.push({seat:target, stat:key});
}
function trackCollision(room, moving, to, log) {
  const victim = room.pieces.find(p => p !== moving && p.loc==='track' && trackPosition(p,room.boardSides)===to);
  if (!victim) return true;
  if (victim.seat===moving.seat) return false;
  if (friendly(room,moving.seat,victim.seat)) { sendHomeOrBase(room,victim,log); recordStat(room,moving.seat,'assists'); }
  else { recordStat(room,moving.seat,'bumps'); setBase(victim); log.push(`${owner(room,victim.seat)} was sent back to base.`); }
  return true;
}
function teammateExit(room, p, log) {
  if (room.mode !== 'doubles' || p.loc!=='track') return;
  const destination=trackPosition(p,room.boardSides);
  const mate=room.players.find(q => friendly(room,p.seat,q.seat) && exitOf(q.seat)===destination);
  if (mate) { log.push(`${owner(room,p.seat)} landed on their teammate's base exit!`); sendHomeOrBase(room,p,log); recordStat(room,mate.seat,'assistExit'); }
}
function release(room, seat, pId, log) {
  const p=pieceFor(room,pId);
  if (!p || p.seat!==seat || p.loc!=='base') return false;
  if (!trackCollision(room,p,exitOf(seat),log)) return false;
  p.loc='track';p.progress=0;
  log.push(`${owner(room,seat)} released a marble onto the exit space.`);
  return true;
}
function moveOne(room, seat, pId, steps, home, log) {
  const p=pieceFor(room,pId);
  if (!p || p.seat!==seat || p.loc==='base') return false;
  if (p.loc==='run') {
    if (steps<=0) return false;
    const next=p.run+steps;
    if (next>RUN) return false;
    for(let index=p.run+1;index<=Math.min(next,RUN-1);index++) {
      if(room.pieces.some(q=>q!==p && q.seat===seat && q.loc==='run' && q.run===index)) return false;
    }
    if (next===RUN) {
      p.loc='home';p.run=RUN;
      log.push(`${owner(room,seat)} brought a marble home.`);
    } else {
      p.run=next;
      log.push(`${owner(room,seat)} advanced a marble in home by ${steps}.`);
    }
    return true;
  }
  const next=p.progress+steps;
  if (steps>0 && home==='enter') {
    let threshold=boardGeometry.homeEntryProgress(seat,room.boardSides);
    while(threshold<=p.progress) threshold+=trackSize(room);
    const slot=next-threshold;
    if (slot<0 || slot>RUN) return false;
    for(let index=0;index<=Math.min(slot,RUN-1);index++) {
      if (room.pieces.some(q => q!==p && q.seat===seat && q.loc==='run' && q.run===index)) return false;
    }
    p.loc=slot===RUN?'home':'run'; p.run=slot; p.progress=0;
    log.push(slot===RUN?`${owner(room,seat)} brought a marble home.`:`${owner(room,seat)} entered home run at position ${slot+1}.`);
    return true;
  }
  const pos=MOD(exitOf(seat)+next,trackSize(room));
  if (!trackCollision(room,p,pos,log)) return false;
  p.progress=next;
  log.push(`${owner(room,seat)} moved ${Math.abs(steps)} ${steps<0?'backward':'forward'}.`);
  teammateExit(room,p,log);
  return true;
}
function swapJoker(room, seat, baseId, targetId, log) {
  const p=pieceFor(room,baseId), target=pieceFor(room,targetId);
  if (!p || !target || p.loc!=='base' || target.loc!=='track' || p.seat!==seat || target.seat===seat) return false;
  const position=trackPosition(target,room.boardSides);
  if (!friendly(room,seat,target.seat)) recordStat(room,seat,'bumps');
  setBase(target);
  p.loc='track';p.progress=MOD(position-exitOf(seat),trackSize(room));
  log.push(`${owner(room,seat)} used a Joker to replace ${owner(room,target.seat)}'s marble.`);
  teammateExit(room,p,log);
  return true;
}
function executeOps(room, seat, ops) {
  const log=[];
  for(const op of ops) {
    let result=false;
    if(op.kind==='release') result=release(room,seat,op.piece,log);
    else if(op.kind==='move') result=moveOne(room,seat,op.piece,op.steps,op.home||'circle',log);
    else if(op.kind==='joker') result=swapJoker(room,seat,op.piece,op.target,log);
    if(!result) return null;
  }
  return log;
}
function choicesForStep(room, seat, piece, steps) {
  if(piece.loc==='base') return [];
  if (piece.loc==='run' && steps<=0) return [];
  const options=[{kind:'move',piece:piece.id,steps,home:'circle'}];
  if (piece.loc==='track' && steps>0) options.push({kind:'move',piece:piece.id,steps,home:'enter'});
  return options.filter(op=>executeOps(clone(room),seat,[op])!==null);
}
const stepLabel = op => op.kind === 'release' ? `release ${op.piece}` : op.kind === 'joker' ? `swap ${op.piece} with ${op.target}` : `${op.piece} ${op.steps>0?'+':''}${op.steps}${op.home==='enter'?' → home':''}`;
function actingSeat(room, seat) {
  const done = room.mode==='doubles' && room.pieces.filter(p=>p.seat===seat).every(p=>p.loc==='home');
  return done ? boardGeometry.oppositeSeat(seat,room.boardSides) : seat;
}
function legalMoves(room, seat) {
  if (room.status!=='playing' || room.players[room.turnIndex].seat!==seat) return [];
  const hand=room.hands[seat]||[];
  const mover=actingSeat(room,seat);
  const pieces=room.pieces.filter(p=>p.seat===mover);
  const options=[];
  function add(cardIndex,ops,tag='') {
    if(executeOps(clone(room),mover,ops)===null) return;
    const id=`${cardIndex}|${ops.map(op=>JSON.stringify(op)).join('|')}`;
    options.push({id,cardIndex,ops,label:(tag?tag+': ':'')+ops.map(stepLabel).join(' + ')});
  }
  for(let ci=0;ci<hand.length;ci++) {
    const rank=hand[ci].rank;
    if(rank==='JOKER') {
      for(const base of pieces.filter(p=>p.loc==='base')) for(const target of room.pieces.filter(p=>p.loc==='track'&&p.seat!==mover)) {
        add(ci,[{kind:'joker',piece:base.id,target:target.id}], 'Joker');
      }
      continue;
    }
    if(rank==='A' || FACE.has(rank)) for(const p of pieces.filter(p=>p.loc==='base')) add(ci,[{kind:'release',piece:p.id}],'Exit');
    const steps=rank==='A'?1:FACE.has(rank)?10:rank==='8'?-8:Number(rank);
    if(!Number.isFinite(steps)) continue;
    for(const p of pieces) for(const op of choicesForStep(room,mover,p,steps)) add(ci,[op]);
    if(rank==='7' || rank==='9') {
      for (let front=1;front<= (rank==='7'?6:8);front++) {
        const back=rank==='7'?7-front:-(9-front);
        for(const a of pieces) for(const first of choicesForStep(room,mover,a,front)) {
          for(const b of pieces) {
            if(a.id===b.id) continue;
            for(const second of choicesForStep(room,mover,b,back)) {
              add(ci,[first,second],rank==='7'?'Split 7':'Split 9');
            }
          }
        }
      }
    }
  }
  return options;
}
function winningTeam(room) {
  const winning=room.players.filter(p=>room.pieces.filter(m=>m.seat===p.seat).every(m=>m.loc==='home'));
  if(room.mode==='singles') return winning.length? [winning[0].seat]:null;
  const finished=winning.map(p=>p.seat);
  const team=room.players.find(p=>finished.includes(p.seat) && finished.includes(boardGeometry.oppositeSeat(p.seat,room.boardSides)));
  return team ? [team.seat,boardGeometry.oppositeSeat(team.seat,room.boardSides)]:null;
}
function endTurn(room, seat, cardIndex, log, discarded) {
  const card=room.hands[seat].splice(cardIndex,1)[0];
  room.discards.push(card);
  room.log=[`${owner(room,seat)} ${discarded?'discarded':'played'} ${card.rank}${card.rank==='JOKER'?'':card.suit}.`,...log,...room.log].slice(0,16);
  const winners=winningTeam(room);
  if(winners) {room.status='finished';room.winners=winners;room.log.unshift(`Winner: ${winners.map(s=>owner(room,s)).join(' and ')}!`);return;}
  room.turnIndex=MOD(room.turnIndex+1,room.players.length);
  room.turnNumber++;
  drawAtTurnStart(room);
}
function play(room, seat, optionId, discardIndex=null) {
  if(room.status!=='playing' || room.players[room.turnIndex].seat!==seat) throw Error('Not your turn.');
  if(discardIndex!==null) {
    if(!Number.isInteger(discardIndex) || discardIndex<0 || discardIndex>=room.hands[seat].length) throw Error('Invalid card.');
    endTurn(room,seat,discardIndex,[],true);
    return room;
  }
  const option=legalMoves(room,seat).find(m=>m.id===optionId);
  if(!option) throw Error('That move is no longer legal.');
  room.currentActorSeat = seat;
  const log=executeOps(room,actingSeat(room,seat),option.ops);
  if (actingSeat(room,seat) !== seat) recordStat(room,seat,'assists');
  delete room.currentActorSeat;
  if(!log) throw Error('Move could not be completed.');
  endTurn(room,seat,option.cardIndex,log,false);
  return room;
}
function botMove(room) {
  if(room.status!=='playing') return false;
  const player=room.players[room.turnIndex];
  if(!player.isBot) return false;
  const options=legalMoves(room,player.seat);
  if(options.length) {
    // Lightweight rules-based opponent, not a production-strength strategy AI.
    const ranked=options.map(option=>{
      let score=0;
      for(const op of option.ops) {
        if(op.kind==='release') score+=30;
        if(op.kind==='joker') score+=20;
        if(op.kind==='move') score+=Math.max(1,op.steps)/2+(op.home==='enter'?45:0);
      }
      const before=room.pieces.filter(p=>p.seat===player.seat&&p.loc==='run').length;
      const sim=clone(room);executeOps(sim,actingSeat(room,player.seat),option.ops);
      const after=sim.pieces.filter(p=>p.seat===player.seat&&p.loc==='run').length;
      score+=(after-before)*50;
      return {option,score};
    }).sort((a,b)=>b.score-a.score);
    const pick=ranked[Math.floor(Math.random()*Math.min(3,ranked.length))].option;
    play(room,player.seat,pick.id);
  } else {
    play(room,player.seat,null,Math.floor(Math.random()*room.hands[player.seat].length));
  }
  return true;
}
function roomView(room, userId) {
  const me=room.players.find(p=>p.id===userId);
  return {
    type:'state', version:VERSION, code:room.code, mode:room.mode,capacity:room.capacity,
    visibility:room.visibility, status:room.status,fillAt:room.fillAt,createdAt:room.createdAt,
    players:room.players.map(p=>({id:p.id,name:p.name,seat:p.seat,isBot:p.isBot,color:p.color, 
      marbleCount:room.pieces?.filter(m=>m.seat===p.seat&&m.loc==='home').length||0,
      baseCount:room.pieces ? room.pieces.filter(m=>m.seat===p.seat&&m.loc==='base').length : MARBLES,
      handCount:room.hands?.[p.seat]?.length||0})),
    pieces:room.pieces||[], mySeat:me?.seat??null,
    myHand:me && room.hands?room.hands[me.seat]:[],
    turnSeat:room.status==='playing'?room.players[room.turnIndex].seat:null,
    myMoves:me?legalMoves(room,me.seat).map(({id,label,cardIndex})=>({id,label,cardIndex})):[],
    discards:room.discards?.length||0, deckCount:room.deck?.length||0,
    topDiscard:(room.discards&&room.discards[room.discards.length-1])||null, log:room.log||[],
    winners:room.winners||null,colors:COLORS,track:trackSize(room),trackPerSeat:TRACK_PER_SEAT,boardSides:room.boardSides||boardSidesFor(room),run:RUN,marbles:MARBLES,
    turnNumber:room.turnNumber||0, dealerSeat:room.players[room.dealerIndex||0]?.seat??null,
    startedCountdown:!!room.startedCountdown, preferredRelation:room.preferredRelation||'against',
    waitSeconds:room.waitSeconds||90, hostId:room.hostId,
    myColor:me?.color||null
  };
}

module.exports = { VERSION, TRACK_PER_SEAT, TRACK, MARBLES, RUN, COLORS, exitOf, trackPosition, friendly, possibleSeats, makeDeck, shuffle, startGame, play, botMove, roomView, legalMoves };
