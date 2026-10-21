import test from 'node:test';
import assert from 'node:assert/strict';
import {buildActionTimeline} from '../src/board/actionTimeline.js';
import {startGame,possibleSeats,legalMoves,play} from '../src/engine.js';
import geometry from '../pb_hooks/boardGeometry.cjs';
import reference from './fixtures/geometry-v0.6.0-reference.cjs';

function confirmed(n=4,scenario='empty'){
  const r=startGame({code:'VISUAL',mode:'doubles',capacity:n,status:'waiting',players:possibleSeats('doubles',n).map(seat=>({seat,id:`p${seat}`,name:`P${seat}`}))});
  r.hands[0]=[{id:'king',rank:'K',suit:'♠'}];
  if(scenario!=='empty'){
    const seat=scenario==='opponent'?1:n/2,p=r.pieces.find(p=>p.id===`${seat}:0`);
    Object.assign(p,{loc:'track',progress:((8-geometry.startIndex(seat))%(n*18)+n*18)%(n*18),run:-1});
  }
  const option=legalMoves(r,0).find(m=>m.ops.length===1&&m.ops[0].kind==='release');play(r,0,option.id);return r.actions[0];
}
for(const n of [4,6,8]){
 test(`${n} sides match the scanned v0.6.0 reference without replacing production geometry`,()=>{
  const a=geometry.geometry(n),b=reference.generate(n);
  for(let seat=0;seat<n;seat++){
   const ours=a.sides[seat],theirs=b.sides[seat];
   for(const [actual,expected]of [[ours.track,theirs.track],[ours.home,theirs.home],[ours.base,theirs.inventoryVirtual]])
    actual.forEach((p,i)=>assert.ok(Math.hypot(p.x-expected[i].x,p.y-expected[i].y)<1e-9));
   assert.equal(theirs.red.id,`track-${seat*18+2}`);assert.equal(theirs.green.id,`track-${seat*18+8}`);
  }
 });
 test(`${n} sides: confirmed release drops into avatar before opening and lifting at exact green ID`,()=>{
  const action=confirmed(n),saved=JSON.stringify(action),plan=buildActionTimeline(action,n);
  assert.deepEqual(plan.steps.map(s=>s.name),['inventory-pocket-drop','green-trapdoor-open','green-marble-rise','green-trapdoor-close']);
  plan.steps.slice(1).forEach(s=>assert.equal(s.trackId,8));
  for(let i=1;i<plan.steps.length;i++)assert.ok(plan.steps[i].at>=plan.steps[i-1].at+plan.steps[i-1].duration);
  assert.equal(JSON.stringify(action),saved);assert.ok(plan.duration<4500);
 });
 test(`${n} sides: opponent ejection precedes pocket drop and teammate teleport ends on teammate red`,()=>{
  const opponent=buildActionTimeline(confirmed(n,'opponent'),n),teammate=buildActionTimeline(confirmed(n,'teammate'),n);
  assert.equal(opponent.steps[0].name,'opponent-to-inventory');assert.ok(opponent.steps[1].at>=opponent.steps[0].duration);
  assert.equal(teammate.steps[0].name,'teammate-to-red');assert.equal(teammate.steps[0].trackId,(n/2)*18+2);
  assert.ok(teammate.steps[1].at>=teammate.steps[0].duration);
 });
}
test('reduced motion has no visual jobs; fast animation retains order and targets',()=>{
 const action=confirmed(8,'teammate'),full=buildActionTimeline(action,8),fast=buildActionTimeline(action,8,{fast:true});
 assert.deepEqual(buildActionTimeline(action,8,{reducedMotion:true}),{steps:[],duration:0});
 assert.deepEqual(fast.steps.map(s=>[s.name,s.trackId]),full.steps.map(s=>[s.name,s.trackId]));
 assert.ok(fast.duration<full.duration);
});
test('a denied or no-change action cannot produce a trapdoor or inventory effect',()=>{
 assert.deepEqual(buildActionTimeline({ops:[],changes:[]},4).steps,[]);
});
