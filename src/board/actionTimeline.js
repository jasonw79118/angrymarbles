import boardGeometry from '../../pb_hooks/boardGeometry.cjs';
import {buildMoveRoute,movementTiming,piecePoint} from './tokenMotion.js';

// A pure presentation plan derived exclusively from already-confirmed changes.
// Timings follow the scanned v0.6.0 flyBall / showBoardLift demonstration.
export function buildActionTimeline(action,sideCount,{fast=false,reducedMotion=false}={}){
  if(reducedMotion)return {steps:[],duration:0};
  const factor=fast?.28:1,steps=[];
  const add=(name,pieceId,seat,at,duration,trackId)=>steps.push({name,pieceId,seat,at:at*factor,duration:duration*factor,trackId});
  let collisions=0;
  for(const {from,to} of action.changes){
    if(action.ops.some(op=>op.piece===to.id))continue;
    if(from.loc==='track'&&to.loc==='base'){
      add('opponent-to-inventory',to.id,to.seat,0,650);collisions=Math.max(collisions,650);
    }else if(from.loc==='track'&&to.loc==='track'){
      const target=boardGeometry.trackIndex(to.seat,to.progress,sideCount);
      add('teammate-to-red',to.id,to.seat,0,700,target);collisions=Math.max(collisions,700);
    }
  }
  let cursor=0;
  action.ops.forEach((op)=>{
    const change=action.changes.find(c=>c.to.id===op.piece);if(!change)return;
    const {from,to}=change;
    if(op.kind==='release'&&from.loc==='base'&&to.loc==='track'){
      const green=boardGeometry.trackIndex(to.seat,to.progress,sideCount);
      add('inventory-pocket-drop',to.id,to.seat,collisions,420);
      add('green-trapdoor-open',to.id,to.seat,collisions+420,260,green);
      add('green-marble-rise',to.id,to.seat,collisions+680,500,green);
      add('green-trapdoor-close',to.id,to.seat,collisions+1180,180,green);
      cursor=Math.max(cursor,collisions+1360);
    }else if(op.kind==='joker'){
      add('joker-arrival',to.id,to.seat,Math.max(cursor,collisions),950);
      cursor=Math.max(cursor,collisions)+950+120;
    }else{
      const route=buildMoveRoute(from,to,op,sideCount),timing=movementTiming(route);
      add('track-move',to.id,to.seat,cursor,timing.duration);
      cursor+=timing.duration;
      const last=route.at(-1),target=piecePoint(to,sideCount);
      if(to.loc==='track'&&Math.hypot(last.x-target.x,last.y-target.y)>.01){
        add('teammate-to-red',to.id,to.seat,cursor,700,boardGeometry.trackIndex(to.seat,to.progress,sideCount));
        cursor+=700;
      }else if(to.loc==='base'){
        add('opponent-to-inventory',to.id,to.seat,cursor,650);
        cursor+=650;
      }
      cursor+=120;
    }
  });
  // A track occupant reacts when the moving marble arrives, rather than leaving
  // an empty destination before the journey has even begun. Releases retain the
  // existing collision-before-trapdoor ordering.
  for(const step of steps){
    if(action.ops.some(op=>op.piece===step.pieceId))continue;
    const victim=action.changes.find(c=>c.to.id===step.pieceId);
    if(!victim)continue;
    const occupied=piecePoint(victim.from,sideCount);
    for(const op of action.ops.filter(op=>op.kind==='move')){
      const change=action.changes.find(c=>c.to.id===op.piece);if(!change)continue;
      const route=buildMoveRoute(change.from,change.to,op,sideCount),last=route.at(-1);
      if(Math.hypot(last.x-occupied.x,last.y-occupied.y)>.01)continue;
      const walk=steps.find(s=>s.name==='track-move'&&s.pieceId===op.piece);
      if(walk)step.at=walk.at+movementTiming(route).travelMs*factor;
    }
  }
  const end=Math.max(0,...steps.map(step=>step.at+step.duration));
  return {steps,duration:Math.max(1000,end+(fast?250:700))};
}
