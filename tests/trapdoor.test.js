import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import geometry from '../pb_hooks/boardGeometry.cjs';
import {startGame,possibleSeats,legalMoves,play,roomView,trackPosition} from '../src/engine.js';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/geometry-v0.4.2.json',import.meta.url)));
function game(n=4){
  const players=possibleSeats('doubles',n).map(seat=>({id:`test-${seat}`,name:`P${seat+1}`,seat,isBot:false}));
  const r=startGame({code:'TRAP',mode:'doubles',capacity:n,status:'waiting',players});
  r.hands[0]=[{id:'release',rank:'K',suit:'♠'}];return r;
}
function at(r,id,index){const p=r.pieces.find(p=>p.id===id);Object.assign(p,{loc:'track',progress:((index-geometry.startIndex(p.seat))%(r.boardSides*18)+r.boardSides*18)%(r.boardSides*18),run:-1});return p;}
function release(r,id='0:0'){const move=legalMoves(r,0).find(m=>m.ops.length===1&&m.ops[0].kind==='release'&&m.ops[0].piece===id);assert.ok(move);play(r,0,move.id);return r.actions.at(-1);}

for(const n of [4,6,8]){
  test(`${n} sides: every original coordinate, marker, ID and side order matches baseline`,()=>assert.deepEqual(geometry.geometry(n),fixture[n]));
  test(`${n} sides: select a specific inventory marble and release at unchanged green`,()=>{
    const r=game(n),event=release(r,'0:4');const marble=r.pieces.find(p=>p.id==='0:4');
    assert.equal(marble.loc,'track');assert.equal(trackPosition(marble,n),8);
    assert.deepEqual(event.warnings,[]);assert.equal(event.baseCounts[0],4);assert.equal(event.ops[0].piece,'0:4');assert.equal(r.pieces.find(p=>p.id==='0:0').loc,'base');
  });
  test(`${n} sides: own green blocks release without consuming card or event`,()=>{
    const r=game(n);at(r,'0:0',8);const before=JSON.stringify(r);
    assert.ok(!legalMoves(r,0).some(m=>m.ops[0].kind==='release'));
    assert.throws(()=>play(r,0,'not-legal'),/no longer legal/);assert.equal(JSON.stringify(r),before);
  });
  test(`${n} sides: opponent on green is returned to inventory`,()=>{
    const r=game(n),opponent=at(r,'1:0',8);const event=release(r);
    assert.equal(opponent.loc,'base');assert.equal(event.baseCounts[1],5);assert.equal(event.changes.length,2);
    assert.ok(r.statEvents.some(e=>e.stat==='bumps'&&e.seat===0));
  });
  test(`${n} sides: teammate moves to red track and can then be bumped by an opponent`,()=>{
    const r=game(n),mate=n/2,red=mate*18+2;const victim=at(r,`${mate}:0`,8);release(r);
    assert.equal(victim.loc,'track');assert.equal(victim.run,-1);assert.equal(trackPosition(victim,n),red);
    const opponent=at(r,'1:0',red-1);r.turnIndex=r.players.findIndex(p=>p.seat===1);r.hands[1]=[{id:'bump-red',rank:'A',suit:'♥'}];
    const move=legalMoves(r,1).find(m=>m.ops.length===1&&m.ops[0].piece===opponent.id&&m.ops[0].steps===1&&m.ops[0].home==='circle');
    assert.ok(move);play(r,1,move.id);assert.equal(victim.loc,'base');
  });
  test(`${n} sides: occupied teammate red returns teammate to inventory, preserving occupant`,()=>{
    const r=game(n),mate=n/2;const victim=at(r,`${mate}:0`,8),occupant=at(r,'1:0',mate*18+2);const before={...occupant};
    const option=legalMoves(r,0).find(m=>m.ops[0].kind==='release');
    assert.ok(option.warnings.some(text=>text.includes('teammate marble returns to avatar inventory')));
    const event=release(r);assert.equal(victim.loc,'base');assert.deepEqual(occupant,before);
    assert.deepEqual(event.warnings,option.warnings);
  });
  test(`${n} sides: eight goes backward from green but cannot release inventory`,()=>{
    const r=game(n);r.hands[0]=[{id:'eight',rank:'8',suit:'♠'}];const p=at(r,'0:3',8);
    const options=legalMoves(r,0);assert.ok(options.length);assert.ok(options.every(m=>m.ops[0].piece===p.id&&m.ops[0].steps===-8));
    play(r,0,options[0].id);assert.equal(trackPosition(p,n),0);assert.equal(p.progress,-8);
  });
}
test('confirmed public events expose played cards and changed pieces, never private hands/deck',()=>{
  const r=game();release(r);const state=roomView(r,'test-1');
  assert.equal(state.actions[0].card.rank,'K');assert.equal(state.actions[0].id,'TRAP:1');
  assert.ok(!('hands' in state));assert.ok(!('deck' in state));
  assert.deepEqual(Object.keys(state.actions[0]).sort(),['id','seq','gameId','actorSeat','card','discarded','label','ops','warnings','changes','at','turnNumber','turnSeat','baseCounts'].sort());
  assert.equal(state.myHand.length,6);assert.notDeepEqual(state.myHand,r.hands[0]);
});
test('server prevents passing a card with a legal move and accepts a genuine no-move pass',()=>{
  const r=game();assert.throws(()=>play(r,0,null,0),/legal move/);assert.equal(r.actions.length,0);
  r.hands[0]=[{id:'blocked-eight',rank:'8',suit:'♠'}];play(r,0,null,0);
  assert.equal(r.actions[0].discarded,true);assert.equal(r.actions[0].changes.length,0);
});

test('waiting-room avatars start with five inventory marbles before pieces are initialized',()=>{const r=game();r.status='waiting';r.pieces=[];r.hands={};assert.ok(roomView(r,'test-0').players.every(p=>p.baseCount===5));});
