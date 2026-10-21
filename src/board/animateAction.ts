import type {ConfirmedAction,Piece,Player} from '../types';
import boardGeometry from '../../pb_hooks/boardGeometry.cjs';
import {buildActionTimeline} from './actionTimeline.js';

type Point={x:number;y:number};
type Marble=(position:Point,seat:number,id:string,selected?:boolean)=>Element;
type Job={name:string;pieceId:string;seat:number;at:number;duration:number;start?:()=>void;tick:(t:number)=>void;finish?:()=>void;started?:boolean;done?:boolean};

// Adaptation of v0.6.0 screenPoint, pocketPoint, flyBall and showBoardLift.
// No rule decisions occur here: only confirmed from/to states and locked coordinates.
export function animateAction(svg:SVGSVGElement,layer:SVGGraphicsElement,sideCount:number,players:Player[],action:ConfirmedAction,marble:Marble,fast:boolean){
  const plan=buildActionTimeline(action,sideCount,{fast,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
  if(!plan.steps.length)return ()=>{};
  const geo=boardGeometry.geometry(sideCount),nodes:Element[]=[],restore:Array<()=>void>=[],jobs:Job[]=[];
  const color=(seat:number)=>players.find(p=>p.seat===seat)?.color||'#2499ff';
  const point=(piece:Piece):Point=>{
    if(piece.loc==='base')return geo.sides[piece.seat].green;
    if(piece.loc==='track'){const i=boardGeometry.trackIndex(piece.seat,piece.progress,sideCount);return geo.sides[Math.floor(i/18)].holes[i%18];}
    return geo.sides[piece.seat].home[Math.min(4,Math.max(0,piece.run))];
  };
  const screen=(p:Point)=>{const matrix=layer.getScreenCTM();return matrix?new DOMPoint(p.x,p.y).matrixTransform(matrix):null;};
  const center=(selector:string)=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:null;};
  const pocket=(seat:number)=>center(`[data-inventory-pocket="${seat}"]`);
  const hide=(node:Element|null)=>{if(!node)return;const value=node.getAttribute('opacity');node.setAttribute('opacity','0');restore.push(()=>value===null?node.removeAttribute('opacity'):node.setAttribute('opacity',value));};
  const sElt=(tag:string,attrs:Record<string,string|number>,parent:Element=layer)=>{
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));parent.append(node);return node;
  };
  const moving=new Map<string,{group:Element;origin:Point}>();
  const getMoving=(piece:Piece)=>{
    const old=moving.get(piece.id);if(old)return old;
    const origin=piece.loc==='base'?geo.sides[piece.seat].green:point(piece);
    const group=marble(origin,piece.seat,`moving-${piece.id}`);group.setAttribute('pointer-events','none');layer.append(group);nodes.push(group);
    const entry={group,origin};moving.set(piece.id,entry);return entry;
  };
  for(const change of action.changes)hide(layer.querySelector(`[data-piece-id="${change.to.id}"]`));
  const markPhase=(job:Job)=>{
    svg.dataset.animationAction=action.id;svg.dataset.animationPhase=job.name;
    svg.dispatchEvent(new CustomEvent('angrymarbles:visual-phase',{bubbles:true,detail:{actionId:action.id,name:job.name,seat:job.seat}}));
  };
  const pulse=(seat:number,on:boolean)=>document.querySelector(`[data-inventory-pocket="${seat}"]`)?.classList.toggle('pulse',on);
  const flight=(seat:number)=>{
    const orb=document.createElement('i');orb.className='inventory-flight v060-flight';orb.style.setProperty('--flight-color',color(seat));
    orb.style.left='0';orb.style.top='0';orb.setAttribute('aria-hidden','true');document.body.append(orb);nodes.push(orb);return orb;
  };
  for(const step of plan.steps){
    const change=action.changes.find(c=>c.to.id===step.pieceId);if(!change)continue;
    const {from,to}=change;
    const job:Job={...step,tick:()=>{}};
    if(step.name==='opponent-to-inventory'){
      const old=getMoving(from),token=document.querySelector<HTMLElement>(`[data-inventory-piece="${to.id}"]`);
      if(token){const previous=token.style.visibility;token.style.visibility='hidden';restore.push(()=>{token.style.visibility=previous;});}
      let orb:HTMLElement|null=null;
      job.start=()=>{old.group.setAttribute('opacity','0');orb=flight(to.seat);pulse(to.seat,true);};
      job.tick=t=>{const a=screen(point(from)),b=pocket(to.seat);if(!a||!b||!orb)return;const ease=1-(1-t)**2;
        orb.style.transform=`translate(${a.x+(b.x-a.x)*ease-11}px,${a.y+(b.y-a.y)*ease-55*Math.sin(t*Math.PI)-11}px) scale(${1-.65*t})`;orb.style.opacity=String(1-.4*t);};
      job.finish=()=>{orb?.remove();if(token)token.style.visibility='';pulse(to.seat,false);};
    }else if(step.name==='teammate-to-red'){
      const old=getMoving(from),a=point(from),b=point(to);
      const trail=sElt('path',{d:`M${a.x} ${a.y} Q${(a.x+b.x)/2} ${(a.y+b.y)/2-55} ${b.x} ${b.y}`,fill:'none',stroke:color(to.seat),'stroke-width':3,opacity:0,'pointer-events':'none',class:'teleport-trail'});nodes.push(trail);
      job.tick=t=>{const ease=1-(1-t)**2;old.group.setAttribute('transform',`translate(${(b.x-a.x)*ease} ${(b.y-a.y)*ease-55*Math.sin(t*Math.PI)})`);trail.setAttribute('opacity',String(Math.sin(t*Math.PI)*.8));};
    }else if(step.name==='inventory-pocket-drop'){
      const released=getMoving({...to,loc:'base'});released.group.setAttribute('opacity','0');let orb:HTMLElement|null=null;
      job.start=()=>{orb=flight(to.seat);pulse(to.seat,true);};
      job.tick=t=>{const a=center(`[data-inventory-piece="${to.id}"]`),b=pocket(to.seat);if(!a||!b||!orb)return;
        orb.style.transform=`translate(${a.x+(b.x-a.x)*t-11}px,${a.y+(b.y-a.y)*t-15*Math.sin(t*Math.PI)-11}px) scale(${.8-.65*t})`;orb.style.opacity=String(1-.75*t);};
      job.finish=()=>{orb?.remove();pulse(to.seat,false);};
    }else if(step.name==='green-trapdoor-open'){
      const p=point(to),id=boardGeometry.trackIndex(to.seat,to.progress,sideCount);
      const inner=layer.querySelector(`[data-hole-inner="track-${id}"]`);
      if(inner){const previous=inner.getAttribute('fill')||'#00684f';restore.push(()=>inner.setAttribute('fill',previous));}
      const lid=sElt('g',{class:'trapdoor-lid','data-trap-track':id,'pointer-events':'none'});nodes.push(lid);
      const top=sElt('path',{d:'M-8 0 A8 8 0 0 1 8 0 Z',fill:'#25dca4',stroke:'#f6cf75','stroke-width':1.2},lid);
      const bottom=sElt('path',{d:'M8 0 A8 8 0 0 1 -8 0 Z',fill:'#08765a',stroke:'#f6cf75','stroke-width':1.2},lid);
      lid.setAttribute('transform',`translate(${p.x} ${p.y})`);lid.setAttribute('opacity','0');
      job.start=()=>{inner?.setAttribute('fill','#020406');lid.setAttribute('opacity','1');};
      job.tick=t=>{top.setAttribute('transform',`translate(0 ${-7*t}) scale(1 ${1-.92*t})`);bottom.setAttribute('transform',`translate(0 ${7*t}) scale(1 ${1-.92*t})`);};
      job.finish=()=>lid.setAttribute('opacity','.25');
    }else if(step.name==='green-marble-rise'){
      const p=point(to),released=getMoving({...to,loc:'base'});
      job.tick=t=>{const matrix=layer.getScreenCTM(),inverse=matrix?.inverse();
        const zero=inverse?new DOMPoint(0,0).matrixTransform(inverse):{x:0,y:0};
        const offset=inverse?new DOMPoint(0,18*(1-t)).matrixTransform(inverse):{x:0,y:18*(1-t)};
        const scale=t<.75?.1+1.05*(t/.75):1.15-.15*((t-.75)/.25);
        released.group.setAttribute('opacity',String(Math.min(1,t*4)));
        released.group.setAttribute('transform',`translate(${p.x+offset.x-zero.x} ${p.y+offset.y-zero.y}) scale(${scale}) translate(${-p.x} ${-p.y})`);};
    }else if(step.name==='green-trapdoor-close'){
      job.tick=t=>layer.querySelectorAll('.trapdoor-lid').forEach(node=>node.setAttribute('opacity',String(.25*(1-t))));
      job.finish=()=>layer.querySelectorAll('.trapdoor-lid').forEach(node=>node.remove());
    }else{
      const old=getMoving(from),route:Point[]=[point(from)];
      const op=action.ops.find(op=>op.piece===to.id);
      if(from.loc==='track'&&to.loc==='track'&&op?.steps){
        for(let i=1;i<=Math.abs(op.steps);i++)route.push(point({...from,progress:from.progress+i*Math.sign(op.steps)}));
        const target=point(to),last=route.at(-1)!;if(Math.hypot(target.x-last.x,target.y-last.y)>.01)route.push(target);
      }else if(from.loc==='track'&&(to.loc==='run'||to.loc==='home')){
        let entry=boardGeometry.homeEntryProgress(from.seat,sideCount);while(entry<=from.progress)entry+=sideCount*18;
        for(let progress=from.progress+1;progress<entry;progress++)route.push(point({...from,progress}));
        for(let i=0;i<=Math.min(4,to.run);i++)route.push(geo.sides[to.seat].home[i]);
      }else if(from.loc==='run'&&(to.loc==='run'||to.loc==='home')){
        for(let i=from.run+1;i<=Math.min(4,to.run);i++)route.push(geo.sides[to.seat].home[i]);
      }else route.push(point(to));
      job.tick=t=>{const f=t*(route.length-1),i=Math.min(Math.max(0,route.length-2),Math.floor(f)),part=f-i,a=route[i],b=route[i+1]||a;
        old.group.setAttribute('transform',`translate(${a.x+(b.x-a.x)*part-old.origin.x} ${a.y+(b.y-a.y)*part-old.origin.y})`);};
    }
    jobs.push(job);
  }
  let disposed=false,frame=0;const started=performance.now();
  const cleanup=()=>{
    for(const node of nodes)node.remove();for(const undo of restore)undo();for(const p of players)pulse(p.seat,false);
    delete svg.dataset.animationAction;delete svg.dataset.animationPhase;
  };
  const tick=(now:number)=>{
    if(disposed)return;
    try{
      let complete=true;
      for(const job of jobs){
        if(job.done)continue;const elapsed=now-started-job.at;
        if(elapsed<0){complete=false;continue;}
        if(!job.started){job.started=true;markPhase(job);job.start?.();}
        const t=Math.min(1,elapsed/job.duration);job.tick(t);
        if(t===1){job.done=true;job.finish?.();}else complete=false;
      }
      if(complete){cleanup();return;}
      frame=requestAnimationFrame(tick);
    }catch{cleanup();} // VFX failure restores the confirmed result, never a partial position.
  };
  frame=requestAnimationFrame(tick);
  return ()=>{disposed=true;cancelAnimationFrame(frame);cleanup();};
}
