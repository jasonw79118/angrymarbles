import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from '../support/worker-harness.js';

test('real Cloudflare Worker routes: release, two private views, public events, paced alarms and stat updates',async()=>{
 const h=await createHarness();
 try{
   const room=h.makeRoom(4,'BUMP44',true);h.at(room,'1:0',8);await h.seed(room);
   let initial=await h.request('/angry-marbles/room/BUMP44');assert.equal(initial.status,200);
   const move=initial.body.myMoves.find(m=>m.label.startsWith('Exit:')&&m.pieceIds.includes('0:4'));assert.ok(move);
   const moved=await h.request('/angry-marbles/move',{code:'BUMP44',moveId:move.id});assert.equal(moved.status,200);
   let state=(await h.request('/angry-marbles/room/BUMP44')).body;
   assert.equal(state.actions.length,1);assert.equal(state.turnSeat,1);assert.equal(state.actions[0].card.rank,'K');
   assert.equal(state.pieces.find(p=>p.id==='1:0').loc,'base');assert.equal(state.players[0].baseCount,4);
   assert.equal((await h.request('/angry-marbles/profile')).body.bumps,1);
   assert.ok(state.botReadyAt>Date.now()+2500); // not a hidden immediate batch
   const replay=await h.request('/angry-marbles/move',{code:'BUMP44',moveId:move.id});assert.equal(replay.status,403);
   await new Promise(r=>setTimeout(r,4800));
   state=(await h.request('/angry-marbles/room/BUMP44')).body;
   assert.equal(state.actions.length,2);assert.equal(state.actions[1].actorSeat,1);assert.equal(state.turnSeat,2);
   assert.ok(state.actions[1].at-state.actions[0].at>=4000);assert.ok(state.botReadyAt>Date.now()+2500);
   const two=h.makeRoom(4,'TEAM44');h.at(two,'2:0',8);await h.seed(two);
   const v=(await h.request('/angry-marbles/room/TEAM44')).body;
   const option=v.myMoves.find(m=>m.label.startsWith('Exit:'));await h.request('/angry-marbles/move',{code:'TEAM44',moveId:option.id});
   const a=(await h.request('/angry-marbles/room/TEAM44')).body,b=(await h.request('/angry-marbles/room/TEAM44',undefined,'qa-observer')).body;
   assert.deepEqual(a.pieces,b.pieces);assert.deepEqual(a.actions,b.actions);assert.equal(b.myMoves.length>0,true);
   assert.equal(a.pieces.find(p=>p.id==='2:0').loc,'track');assert.equal(a.pieces.find(p=>p.id==='2:0').progress,66);
   assert.ok(!('hands' in a));assert.ok(!('deck' in b));
 }finally{await h.dispose();}
});
