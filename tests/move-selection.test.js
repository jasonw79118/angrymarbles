import test from 'node:test';
import assert from 'node:assert/strict';
import {startGame,possibleSeats,legalMoves,play,roomView} from '../src/engine.js';
import {moveParticipants,selectMarble,nearestMarble} from '../src/moveSelection.js';

function jokerGame(){
  const room=startGame({code:'SELECT',mode:'doubles',capacity:4,status:'waiting',players:possibleSeats('doubles',4).map(seat=>({seat,id:`p${seat}`,name:`P${seat}`}))});
  room.hands[0]=[{id:'joker',rank:'JOKER',suit:'★'}];
  Object.assign(room.pieces.find(p=>p.id==='1:0'),{loc:'track',progress:3});
  Object.assign(room.pieces.find(p=>p.id==='2:0'),{loc:'track',progress:3});
  return room;
}
const empty={sourceId:'',targetId:'',moveId:''};
for(const target of ['1:0','2:0']){
  test(`Joker selects inventory then ${target==='1:0'?'opponent':'partner'} without losing its source and executes the exact server move`,()=>{
    const room=jokerGame(),moves=roomView(room,'p0').myMoves;
    const source=selectMarble(moves,room.pieces,4,empty,'0:4');
    assert.equal(source.sourceId,'0:4');assert.equal(source.moveId,'');
    const selected=selectMarble(moves,room.pieces,4,source,target);
    assert.equal(selected.sourceId,'0:4');assert.equal(selected.targetId,target);assert.ok(selected.moveId);
    const option=legalMoves(room,0).find(m=>m.id===selected.moveId);
    assert.equal(option.ops[0].piece,'0:4');assert.equal(option.ops[0].target,target);
    play(room,0,selected.moveId);
    assert.equal(room.pieces.find(p=>p.id===target).loc,'base');assert.equal(room.pieces.find(p=>p.id==='0:4').loc,'track');
  });
  test(`Joker also accepts ${target} target first and allows choosing another inventory marble`,()=>{
    const room=jokerGame(),moves=roomView(room,'p0').myMoves;
    const selected=selectMarble(moves,room.pieces,4,empty,target);
    assert.equal(selected.targetId,target);assert.ok(selected.moveId);
    const next=selectMarble(moves,room.pieces,4,selected,'0:3');
    assert.equal(next.sourceId,'0:3');assert.equal(next.targetId,target);assert.ok(next.moveId);
    assert.equal(selectMarble(moves,room.pieces,4,next,'0:3').sourceId,'0:3','repeated tap does not deselect');
  });
}
test('ordinary bump target chooses the matching destination rather than replacing the moving marble',()=>{
  const room=jokerGame();room.hands[0]=[{id:'six',rank:'6',suit:'♥'}];
  Object.assign(room.pieces.find(p=>p.id==='0:0'),{loc:'track',progress:0});
  Object.assign(room.pieces.find(p=>p.id==='1:0'),{loc:'track',progress:-12});
  const moves=roomView(room,'p0').myMoves;
  const source=selectMarble(moves,room.pieces,4,empty,'0:0');
  const target=selectMarble(moves,room.pieces,4,source,'1:0');
  assert.ok(target);assert.equal(target.sourceId,'0:0');assert.ok(target.moveId);
  assert.deepEqual(moveParticipants(moves.find(m=>m.id===target.moveId),room.pieces,4).targets,['1:0']);
});
test('nearby taps choose the nearest eligible center and do not select a distant marble',()=>{
  const candidates=[{id:'first',x:10,y:20},{id:'second',x:23,y:20}];
  assert.equal(nearestMarble(candidates,13,30,25),'first');
  assert.equal(nearestMarble(candidates,22,22,25),'second');
  assert.equal(nearestMarble(candidates,100,100,32),null);
});
