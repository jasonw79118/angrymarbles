import {useEffect,useRef} from 'react';
import type {Piece,Player,ConfirmedAction} from './types';

export default function MarbleCloseup({piece,players,action}:{piece?:Piece;players:Player[];action:ConfirmedAction|null}){
  const svgRef=useRef<SVGSVGElement>(null);
  const player=players.find(p=>p.seat===piece?.seat);
  useEffect(()=>{
    const svg=svgRef.current;if(!svg||!piece)return;
    let frame=0,source:Element|null=null,copy:Element|null=null;
    const tick=()=>{
      const current=document.querySelector(`#board [data-piece-id="moving-${piece.id}"]`)
        ||document.querySelector(`#board [data-piece-id="${piece.id}"]`);
      const hit=current?.querySelector('.piece-hit');
      if(current&&hit){
        const x=Number(hit.getAttribute('cx')),y=Number(hit.getAttribute('cy'));
        if(source!==current){
          source=current;copy=current.cloneNode(true) as Element;
          copy.removeAttribute('id');copy.removeAttribute('data-piece-id');copy.removeAttribute('tabindex');copy.removeAttribute('role');
          copy.setAttribute('pointer-events','none');svg.replaceChildren(copy);
          svg.setAttribute('viewBox',`${x-30} ${y-40} 60 60`);
        }
        const matrix=(current as SVGGraphicsElement).getScreenCTM();
        const angle=matrix?Math.atan2(matrix.b,matrix.a)*180/Math.PI:0;
        copy?.setAttribute('transform',`rotate(${angle} ${x} ${y})`);
        // Board flights temporarily hide their SVG source while a screen-space
        // orb travels to inventory; the magnifier must remain visible then.
        copy?.setAttribute('opacity','1');
        for(const selector of ['.marble-body','.marble-glass','.marble-shadow']){
          const from=current.querySelector(selector),to=copy?.querySelector(selector);
          for(const attr of ['transform','opacity']){
            const value=from?.getAttribute(attr);if(value!=null)to?.setAttribute(attr,value);else to?.removeAttribute(attr);
          }
        }
        svg.dataset.visible='true';
      }else{svg.dataset.visible='false';}
      if(action)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[piece?.id,piece?.loc,piece?.progress,piece?.run,action?.id]);
  return <section className="marble-closeup" aria-label="Marble close-up">
    <div className={`closeup-card${action?' in-motion':''}`}>
    <strong>{action?'MARBLE IN MOTION':'MARBLE CLOSE-UP'}</strong>
    <div className="marble-closeup-square" style={{'--focus-color':player?.color||'#329bff'} as React.CSSProperties}>
      <div className="closeup-fallback" aria-hidden="true"/>
      <svg ref={svgRef} aria-hidden="true"/>
      {!piece&&<span>Choose a marble</span>}
    </div>
    <span className="closeup-name">{piece?`${player?.name||'Player'} · ${piece.slot+1}`:'Tap a glowing marble'}</span>
    </div>
  </section>;
}
