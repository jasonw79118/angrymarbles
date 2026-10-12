import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, possibleSeats, startGame, roomView,legalMoves,play,TRACK, MARBLES, COLORS } from '../src/engine.js';
function room(mode='doubles', capacity=4) {
  const seats=possibleSeats(mode,capacity);
  return {code:'TEST',mode,capacity,status:'waiting',players:seats.map((seat,i)=>({id:`u${i}`,name:`Player ${i}`,seat,isBot:false}))};
}
test('exactly 108 cards, two decks with four jokers',()=>{
 const deck=makeDeck();assert.equal(deck.length,108);assert.equal(deck.filter(c=>c.rank==='JOKER').length,4);
});
test('team seats are opposite even with six players',()=>{
 assert.deepEqual(possibleSeats('doubles',6),[0,3,1,4,2,5]);
});
test('all players start with 5 and turn player draws one',()=>{
 const r=startGame(room()); assert.equal(r.hands[0].length,6);assert.equal(r.hands[2].length,5);assert.equal(r.pieces.length,4*MARBLES);
});
test('hands and moves private to logged-in player',()=>{
 const r=startGame(room());assert.equal(roomView(r,'u1').myHand.length,5);assert.equal(roomView(r,'stranger').myHand.length,0);
});
test('ace or face releases base marble onto exit without extra steps',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'K',suit:'♥',id:'test'}];
 const option=legalMoves(r,0).find(m=>m.ops[0].kind==='release');assert.ok(option);
 play(r,0,option.id);assert.equal(r.pieces.find(p=>p.id==='0:0').loc,'track'); assert.equal(r.pieces.find(p=>p.id==='0:0').progress,0);
});
test('8 moves backwards, never forward',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'8',suit:'♥',id:'test'}];r.pieces.find(p=>p.id==='0:0').loc='track';
 const opts=legalMoves(r,0);assert.ok(opts.length>0);assert.ok(opts.every(m=>m.ops[0].steps===-8));
 play(r,0,opts[0].id);assert.equal(r.pieces.find(p=>p.id==='0:0').progress,-8);
});
test('split 9 combines forward and backward across distinct marbles',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'9',suit:'♠',id:'test'}];
 for(const n of ['0:0','0:1']) {let p=r.pieces.find(p=>p.id===n);p.loc='track';p.progress=n.endsWith('1')?30:10;}
 const splits=legalMoves(r,0).filter(m=>m.ops.length===2);assert.ok(splits.length>0);
 assert.ok(splits.every(m=>m.ops[0].steps>0&&m.ops[1].steps<0&&m.ops[0].steps-m.ops[1].steps===9));
});
test('split 7 allocates exactly seven forward spaces between two marbles',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'7',suit:'♣',id:'test'}];
 for(const [id,progress] of [['0:0',10],['0:1',24]]) Object.assign(r.pieces.find(p=>p.id===id),{loc:'track',progress});
 const splits=legalMoves(r,0).filter(move=>move.ops.length===2);
 assert.ok(splits.length>0);
 assert.ok(splits.every(move=>move.ops[0].steps>0&&move.ops[1].steps>0&&move.ops[0].steps+move.ops[1].steps===7));
});
test('home run cannot be jumped over',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'2',suit:'♠',id:'test'}];
 Object.assign(r.pieces.find(p=>p.id==='0:0'),{loc:'run',run:0});
 Object.assign(r.pieces.find(p=>p.id==='0:1'),{loc:'run',run:1});
 assert.ok(legalMoves(r,0).every(m=>!m.ops.some(op=>op.piece==='0:0')));
});
test('three spaces from the green start cross red and enter home position one',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'3',suit:'♦',id:'test'}];
 const piece=r.pieces.find(p=>p.id==='0:0');Object.assign(piece,{loc:'track',progress:64});
 const option=legalMoves(r,0).find(move=>move.ops[0].piece===piece.id&&move.ops[0].steps===3&&move.ops[0].home==='enter');
 assert.ok(option);play(r,0,option.id);assert.equal(piece.loc,'run');assert.equal(piece.run,0);
});
test('seven spaces from the green start enter home position five',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'7',suit:'♦',id:'test'}];
 const piece=r.pieces.find(p=>p.id==='0:0');Object.assign(piece,{loc:'track',progress:64});
 const option=legalMoves(r,0).find(move=>move.ops.length===1&&move.ops[0].piece===piece.id&&move.ops[0].steps===7&&move.ops[0].home==='enter');
 assert.ok(option);play(r,0,option.id);assert.equal(piece.loc,'run');assert.equal(piece.run,4);
});
test('blocked home entrance remains a legal outer-track route',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'3',suit:'♦',id:'test'}];
 const piece=r.pieces.find(p=>p.id==='0:0');Object.assign(piece,{loc:'track',progress:64});
 Object.assign(r.pieces.find(p=>p.id==='0:1'),{loc:'run',run:0});
 const options=legalMoves(r,0).filter(move=>move.ops[0].piece===piece.id&&move.ops[0].steps===3);
 assert.ok(options.some(move=>move.ops[0].home==='circle'));
 assert.ok(options.every(move=>move.ops[0].home!=='enter'));
});
test('singles supports player counts one through four',()=>{
 for(const n of [1,2,3,4]) assert.equal(possibleSeats('singles',n).length,n);
});
test('teammate collision sends teammate to the beginning of their home run',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'A',suit:'♠',id:'test'}];
 const moving=r.pieces.find(p=>p.id==='0:0');Object.assign(moving,{loc:'track',progress:0});
 const target=r.pieces.find(p=>p.id==='2:0');Object.assign(target,{loc:'track',progress:37});
 const option=legalMoves(r,0).find(m=>m.ops.length===1 && m.ops[0].piece==='0:0' && m.ops[0].steps===1);
 assert.ok(option);play(r,0,option.id);
 assert.equal(target.loc,'run');assert.equal(target.run,0);
 assert.ok(r.statEvents.some(e=>e.stat==='assists'&&e.seat===0));
});
test('blocked teammate home entrance returns the bumped marble to base',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'A',suit:'♠',id:'test'}];
 Object.assign(r.pieces.find(p=>p.id==='0:0'),{loc:'track',progress:0});
 const target=r.pieces.find(p=>p.id==='2:0');Object.assign(target,{loc:'track',progress:37});
 Object.assign(r.pieces.find(p=>p.id==='2:1'),{loc:'run',run:0});
 const option=legalMoves(r,0).find(m=>m.ops[0].piece==='0:0' && m.ops[0].steps===1);
 assert.ok(option);play(r,0,option.id);assert.equal(target.loc,'base');
});
test('landing on teammate exit auto-bumps mover to start of own home',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'A',suit:'♠',id:'test'}];
 const p=r.pieces.find(p=>p.id==='0:0');Object.assign(p,{loc:'track',progress:35});
 const option=legalMoves(r,0).find(m=>m.ops[0].piece==='0:0'&&m.ops[0].steps===1);
 assert.ok(option);play(r,0,option.id);assert.equal(p.loc,'run');assert.equal(p.run,0);
 assert.ok(r.statEvents.some(e=>e.stat==='assists'&&e.seat===2));
});
test('marble cannot finish on own marble',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'A',suit:'♠',id:'test'}];
 Object.assign(r.pieces.find(p=>p.id==='0:0'),{loc:'track',progress:17});
 Object.assign(r.pieces.find(p=>p.id==='0:1'),{loc:'track',progress:18});
 assert.ok(!legalMoves(r,0).some(m=>m.ops[0].piece==='0:0'&&m.ops[0].steps===1));
});
test('opponent collision returns their marble to base and records a bump',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'A',suit:'♠',id:'test'}];
 const moving=r.pieces.find(p=>p.id==='0:0');Object.assign(moving,{loc:'track',progress:0});
 const target=r.pieces.find(p=>p.id==='1:0');Object.assign(target,{loc:'track',progress:55});
 const option=legalMoves(r,0).find(move=>move.ops[0].piece===moving.id&&move.ops[0].steps===1);
 assert.ok(option);play(r,0,option.id);assert.equal(target.loc,'base');
 assert.ok(r.statEvents.some(event=>event.stat==='bumps'&&event.seat===0));
});
test('five unique home holes count as finished only after exact movement',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'2',suit:'♠',id:'test'}];
 const piece=r.pieces.find(p=>p.id==='0:0');Object.assign(piece,{loc:'run',run:3});
 const option=legalMoves(r,0).find(move=>move.ops[0].piece===piece.id&&move.ops[0].steps===2);
 assert.ok(option);play(r,0,option.id);assert.equal(piece.loc,'home');
 assert.equal(roomView(r,'u0').players.find(player=>player.seat===0).marbleCount,1);
});
test('out-of-turn actions are rejected',()=>{
 const r=startGame(room());
 assert.throws(()=>play(r,1,null,0),/Not your turn/);
});
test('marble color presets are unique',()=>{
 assert.equal(COLORS.length,48);assert.equal(new Set(COLORS.map(color=>color.toLowerCase())).size,48);
});
test('reshuffling preserves held cards and passes the dealer marker',()=>{
 const r=startGame(room());r.hands[0]=[{rank:'A',suit:'♠',id:'test'}];
 r.deck=[];r.discards=[{rank:'3',suit:'♥',id:'d1'},{rank:'9',suit:'♥',id:'d2'},{rank:'8',suit:'♥',id:'d3'}];
 const first=r.players[0].seat; assert.equal(r.dealerIndex,0);
 play(r,first,null,0);
 assert.equal(r.dealerIndex,1);
 assert.equal(r.hands[r.players[1].seat].length,6);
 assert.ok(r.log.some(line=>line.includes('Discards reshuffled')));
});

test('turn order follows physical seats clockwise, not invitation order',()=>{
 const r=startGame(room('doubles',6));
 assert.deepEqual(r.players.map(p=>p.seat),[0,1,2,3,4,5]);
});
