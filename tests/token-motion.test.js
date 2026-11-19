import test from 'node:test';
import assert from 'node:assert/strict';
import geometry from '../pb_hooks/boardGeometry.cjs';
import {buildMoveRoute,piecePoint,movementTiming,sampleTokenMotion} from '../src/board/tokenMotion.js';
import {buildActionTimeline} from '../src/board/actionTimeline.js';

const piece=(seat=0,progress=0)=>({id:`${seat}:0`,seat,slot:0,loc:'track',progress,run:-1});
const event=(changes,ops)=>({id:'motion',changes,ops});
const move=(p,steps)=>({kind:'move',piece:p.id,steps});
const samePoint=(a,b)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8);

for(const sides of [4,6,8]){
  test(`${sides} sides: forward and backward hops use every locked space across corners and wraparound`,()=>{
    for(let seat=0;seat<sides;seat++)for(const steps of [1,7,10,-8]){
      const from=piece(seat,steps<0?0:9),to={...from,progress:from.progress+steps};
      const before=JSON.stringify([from,to]);
      const route=buildMoveRoute(from,to,move(from,steps),sides);
      assert.equal(route.length,Math.abs(steps)+1);
      route.forEach((p,i)=>samePoint(p,piecePoint({...from,progress:from.progress+i*Math.sign(steps)},sides)));
      assert.equal(JSON.stringify([from,to]),before);
      samePoint(sampleTokenMotion(route,0),route[0]);
      const end=sampleTokenMotion(route,1);samePoint(end,route.at(-1));
      assert.equal(end.lift,0);assert.ok(Math.abs(end.scaleX-1)<1e-10);assert.ok(Math.abs(end.scaleY-1)<1e-10);
    }
  });
  test(`${sides} sides: entering and finishing home follow the home branch and preserve the final count`,()=>{
    const from=piece(0,geometry.homeEntryProgress(0,sides)-3);
    const to={...from,loc:'run',progress:0,run:2};
    const route=buildMoveRoute(from,to,move(from,5),sides);
    assert.equal(route.length,6);
    route.slice(-3).forEach((p,i)=>samePoint(p,geometry.geometry(sides).sides[0].home[i]));
    const last={...to,run:4},finished={...last,loc:'home',run:5};
    const finishRoute=buildMoveRoute(last,finished,move(last,1),sides);
    assert.equal(finishRoute.length,2);samePoint(finishRoute[0],finishRoute[1]);
    assert.ok(sampleTokenMotion(finishRoute,.3).lift>0,'final scoring step celebrates in its existing hole');
  });
}

test('each hop lifts, lands, pauses, and finishes exactly at the authoritative point',()=>{
  const from=piece(),to={...from,progress:3};
  const route=buildMoveRoute(from,to,move(from,3),4),timing=movementTiming(route);
  for(let hop=0;hop<3;hop++){
    const air=sampleTokenMotion(route,(hop+.38)*timing.hopMs/timing.duration);
    assert.ok(air.lift>=17);assert.ok(air.scaleY>1);assert.ok(air.scaleX<1);
    const landed=sampleTokenMotion(route,(hop+.9)*timing.hopMs/timing.duration);
    samePoint(landed,route[hop+1]);assert.ok(landed.lift<1e-8);assert.ok(landed.scaleX>1);
  }
  const last=sampleTokenMotion(route,1);assert.equal(last.hop,3);assert.equal(last.settle,1);
});

test('split moves animate sequentially and fast mode keeps the same route and ordering',()=>{
  const a=piece(0),b={...piece(0,12),id:'0:1',slot:1};
  const action=event([{from:a,to:{...a,progress:3}},{from:b,to:{...b,progress:16}}],[move(a,3),move(b,4)]);
  const normal=buildActionTimeline(action,4),fast=buildActionTimeline(action,4,{fast:true});
  assert.ok(normal.steps[1].at>=normal.steps[0].at+normal.steps[0].duration+100);
  assert.ok(fast.steps[1].at>=fast.steps[0].at+fast.steps[0].duration);
  assert.ok(fast.duration<normal.duration);
  assert.deepEqual(buildActionTimeline(action,4,{reducedMotion:true}),{steps:[],duration:0});
});

test('a bumped opponent leaves on arrival, after all walking spaces',()=>{
  const from=piece(0),to={...from,progress:10};
  const victim=piece(1,geometry.trackIndex(0,10,4)-geometry.startIndex(1));
  const action=event([{from,to},{from:victim,to:{...victim,loc:'base',progress:0}}],[move(from,10)]);
  const plan=buildActionTimeline(action,4),walk=plan.steps.find(s=>s.name==='track-move'),bump=plan.steps.find(s=>s.name==='opponent-to-inventory');
  assert.equal(walk.at,0);
  assert.equal(bump.at,movementTiming(buildMoveRoute(from,to,action.ops[0],4)).travelMs);
  assert.ok(plan.duration>=bump.at+bump.duration);
});

test('teammate-exit redirects walk to the exit first, then teleport without inventing an extra space',()=>{
  const from=piece(0,33),to={...from,progress:66};
  const action=event([{from,to}],[move(from,3)]),route=buildMoveRoute(from,to,action.ops[0],4);
  assert.equal(route.length,4);samePoint(route.at(-1),piecePoint({...from,progress:36},4));
  const plan=buildActionTimeline(action,4);
  assert.deepEqual(plan.steps.map(s=>s.name),['track-move','teammate-to-red']);
  assert.equal(plan.steps[1].at,plan.steps[0].duration);
});

test('joker uses an inventory flight rather than an invented walk from green START',()=>{
  const from={...piece(),loc:'base'},to={...from,loc:'track',progress:22};
  const action=event([{from,to}],[{kind:'joker',piece:from.id,target:'1:0'}]);
  assert.deepEqual(buildActionTimeline(action,4).steps.map(s=>s.name),['joker-arrival']);
});
