import type {ConfirmedAction,Piece,Player} from '../types';
import boardGeometry from '../../pb_hooks/boardGeometry.cjs';

type Point={x:number;y:number};
type Marble=(point:Point,seat:number,id:string,selected?:boolean)=>Element;

export function animateAction(svg:SVGSVGElement,layer:SVGGraphicsElement,sideCount:number,players:Player[],action:ConfirmedAction,marble:Marble,fast:boolean){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return ()=>{};
  const geo=boardGeometry.geometry(sideCount),factor=fast?.28:1;
  const effects:Animation[]=[],nodes:Element[]=[],hidden:Element[]=[];
  const jobs:Array<{delay:number;duration:number;update:(t:number)=>void}>=[];
  const position=(p:Piece):Point=>{
    if(p.loc==='track'){const index=boardGeometry.trackIndex(p.seat,p.progress,sideCount);return geo.sides[Math.floor(index/18)].holes[index%18];}
    if(p.loc==='run'||p.loc==='home')return geo.sides[p.seat].home[Math.min(4,Math.max(0,p.run))];
    return geo.sides[p.seat].green;
  };
  const moving=(p:Piece)=>{
    const final=layer.querySelector(`[data-piece-id="${p.id}"]`);
    if(final){final.setAttribute('opacity','0');hidden.push(final);}
    const group=marble(position(p),p.seat,`moving-${p.id}`);group.setAttribute('pointer-events','none');layer.append(group);nodes.push(group);return group;
  };
  const screen=(point:Point)=>{const matrix=layer.getScreenCTM?.();return matrix?new DOMPoint(point.x,point.y).matrixTransform(matrix):null;};
  const pocket=(seat:number)=>document.querySelector<HTMLElement>(`[data-inventory-pocket="${seat}"]`);
  const color=(seat:number)=>players.find(p=>p.seat===seat)?.color||'#329bff';
  const collision=action.changes.filter(c=>!action.ops.some(op=>op.piece===c.to.id));
  const collisionTime=collision.length?550:0;
  for(const change of collision){
    const {from,to}=change;
    if(to.loc==='base'){
      // Board -> avatar is an ejection; releases themselves teleport through two separate openings.
      const group=moving(from);group.setAttribute('opacity','0');
      const source=screen(position(from)),target=pocket(to.seat)?.getBoundingClientRect();
      if(source&&target){
        const orb=document.createElement('i');orb.className='inventory-flight';orb.style.backgroundColor=color(to.seat);
        orb.style.left=`${source.x}px`;orb.style.top=`${source.y}px`;document.body.append(orb);nodes.push(orb);
        const dx=target.x+target.width/2-source.x,dy=target.y+target.height/2-source.y;
        effects.push(orb.animate([{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:`translate(calc(-50% + ${dx*.5}px),calc(-50% + ${dy*.5-70}px)) scale(1.2)`,opacity:1},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.3)`,opacity:0}],{duration:500*factor,fill:'forwards',easing:'ease-in-out'}));
      }
    }else{
      const group=moving(from),a=position(from),b=position(to);
      jobs.push({delay:0,duration:500,update:t=>group.setAttribute('transform',`translate(${(b.x-a.x)*t} ${(b.y-a.y)*t-35*Math.sin(t*Math.PI)})`)});
    }
  }
  action.ops.forEach((op,opIndex)=>{
    const change=action.changes.find(c=>c.to.id===op.piece);if(!change)return;
    const {from,to}=change;
    if(op.kind==='release'){
      const start=geo.sides[to.seat].green,group=moving({...from,loc:'track',progress:0});
      group.setAttribute('opacity','0');
      const token=document.querySelector<HTMLElement>(`[data-inventory-piece="${to.id}"]`);
      if(token){
        const a=token.getBoundingClientRect(),b=pocket(to.seat)?.getBoundingClientRect();
        const dx=b?b.x+b.width/2-a.x-a.width/2:0,dy=b?b.y+b.height/2-a.y-a.height/2:45;
        effects.push(token.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx*.5}px,${Math.min(-8,dy*.5)}px) scale(.9)`,opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.15)`,opacity:0}],{delay:collisionTime*factor,duration:380*factor,fill:'none',easing:'ease-in'}));
      }
      const pocketNode=pocket(to.seat);
      if(pocketNode)effects.push(pocketNode.animate([{boxShadow:'0 0 0 #61faff00'},{boxShadow:'0 0 22px #61faff'},{boxShadow:'0 0 0 #61faff00'}],{delay:collisionTime*factor,duration:800*factor}));
      // The lid is a visual overlay precisely on the existing green hole, never another hole.
      const lid=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','ellipse');
      for(const [key,value] of Object.entries({cx:start.x,cy:start.y,rx:8,ry:7,fill:'#27c68c',stroke:'#a8ffda','stroke-width':1.4,'pointer-events':'none',class:'trapdoor-lid','data-trap-track':to.seat*18+8}))lid.setAttribute(key,String(value));
      layer.insertBefore(lid,group);nodes.push(lid);
      jobs.push({delay:collisionTime+300,duration:200,update:t=>{lid.setAttribute('ry',String(7*(1-t)+.3));lid.setAttribute('cy',String(start.y-7*t));}});
      jobs.push({delay:collisionTime+520,duration:650,update:t=>{group.setAttribute('opacity',String(Math.min(1,t*3)));group.setAttribute('transform',`translate(${start.x} ${start.y+17*(1-t)}) scale(${.15+.85*t}) translate(${-start.x} ${-start.y})`);}});
      jobs.push({delay:collisionTime+1170,duration:180,update:t=>{lid.setAttribute('opacity',String(1-t));}});
    }else{
      const group=moving(from),origin=position(from),route:Point[]=[origin];
      if(op.kind==='move'&&from.loc==='track'&&to.loc==='track'&&op.steps){
        // Normal movement follows every existing indexed hole, including negative progress.
        for(let step=1;step<=Math.abs(op.steps);step++)route.push(position({...from,progress:from.progress+step*Math.sign(op.steps)}));
        const last=route.at(-1)!;const target=position(to);
        if(Math.hypot(last.x-target.x,last.y-target.y)>.01)route.push(target); // confirmed teammate-red redirect
      }else if(from.loc==='track'&&(to.loc==='run'||to.loc==='home')){
        let entry=boardGeometry.homeEntryProgress(from.seat,sideCount);while(entry<=from.progress)entry+=sideCount*18;
        for(let progress=from.progress+1;progress<entry;progress++)route.push(position({...from,progress}));
        for(let run=0;run<=Math.min(to.run,4);run++)route.push(geo.sides[to.seat].home[run]);
      }else if(from.loc==='run'&&(to.loc==='run'||to.loc==='home')){
        for(let run=from.run+1;run<=Math.min(to.run,4);run++)route.push(geo.sides[to.seat].home[run]);
      }else route.push(position(to));
      const duration=Math.min(2500,Math.max(450,(route.length-1)*140));
      jobs.push({delay:collisionTime+opIndex*100,duration,update:t=>{
        const progress=t*(route.length-1),index=Math.min(route.length-2,Math.floor(progress)),part=progress-index;
        const a=route[Math.max(0,index)]||origin,b=route[index+1]||a;
        group.setAttribute('transform',`translate(${a.x+(b.x-a.x)*part-origin.x} ${a.y+(b.y-a.y)*part-origin.y})`);
      }});
    }
  });
  let frame=0,disposed=false;const started=performance.now();
  const finish=()=>{for(const node of nodes)node.remove();for(const node of hidden)node.setAttribute('opacity','1');};
  const tick=(now:number)=>{
    if(disposed)return;
    let complete=true;
    for(const job of jobs){const t=Math.max(0,Math.min(1,((now-started)/factor-job.delay)/job.duration));job.update(t);if(t<1)complete=false;}
    if(!complete)frame=requestAnimationFrame(tick);else finish();
  };
  frame=requestAnimationFrame(tick);
  return ()=>{disposed=true;cancelAnimationFrame(frame);for(const effect of effects)effect.cancel();finish();};
}
