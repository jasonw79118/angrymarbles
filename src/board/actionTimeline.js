import boardGeometry from '../../pb_hooks/boardGeometry.cjs';

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
  action.ops.forEach((op,index)=>{
    const change=action.changes.find(c=>c.to.id===op.piece);if(!change)return;
    const {from,to}=change;
    if(op.kind==='release'&&from.loc==='base'&&to.loc==='track'){
      const green=boardGeometry.trackIndex(to.seat,to.progress,sideCount);
      add('inventory-pocket-drop',to.id,to.seat,collisions,420);
      add('green-trapdoor-open',to.id,to.seat,collisions+420,260,green);
      add('green-marble-rise',to.id,to.seat,collisions+680,500,green);
      add('green-trapdoor-close',to.id,to.seat,collisions+1180,180,green);
    }else add('track-move',to.id,to.seat,collisions+index*100,Math.min(2500,Math.max(450,Math.abs(op.steps||3)*140)));
  });
  const end=Math.max(0,...steps.map(step=>step.at+step.duration));
  return {steps,duration:Math.max(1000,end+(fast?250:700))};
}
