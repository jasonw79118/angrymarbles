/* Materials adapted from the scanned v0.6.0 src/preview.js.
   This module defines paint only. It does not create board positions or holes. */
type PaintElement=(tag:string,attrs:Record<string,string|number|undefined>,parent:Element)=>Element;
export function addTableMaterials(defs:Element,el:PaintElement){
  const stop=(parent:Element,offset:string,color:string,opacity?:number)=>el('stop',{offset,'stop-color':color,'stop-opacity':opacity},parent);
  const wood=el('linearGradient',{id:'wood',x1:'10%',y1:'0%',x2:'80%',y2:'100%'},defs);
  for(const [at,color] of [['0%','#ffdb99'],['25%','#d99b4b'],['55%','#a86731'],['78%','#ecae60'],['100%','#8a4c2b']])stop(wood,at,color);
  const felt=el('radialGradient',{id:'felt',cx:'45%',cy:'40%',r:'80%'},defs);
  stop(felt,'0%','#205c76');stop(felt,'70%','#0c344f');stop(felt,'100%','#04182c');
  const lens=el('radialGradient',{id:'lens',cx:'30%',cy:'20%',r:'86%'},defs);
  stop(lens,'0%','#fff',.94);stop(lens,'12%','#fff',.35);stop(lens,'70%','#fff',0);stop(lens,'100%','#111827',.65);
  const pocket=el('radialGradient',{id:'pocketBlack',cx:'45%',cy:'40%',r:'70%'},defs);
  stop(pocket,'0%','#000');stop(pocket,'65%','#2b1010');stop(pocket,'100%','#925921');
  const shadow=el('filter',{id:'shadow',x:'-40%',y:'-40%',width:'180%',height:'180%'},defs);
  el('feGaussianBlur',{stdDeviation:6},shadow);
  const grain=el('pattern',{id:'grain',width:72,height:72,patternUnits:'userSpaceOnUse'},defs);
  for(let i=0;i<9;i++)el('path',{d:`M${i*9-3} 0 q 8 24 0 48 t -3 40`,fill:'none',stroke:i%2?'#6a341b':'#ffdc97','stroke-width':i%3===0?1.25:.7,opacity:.15},grain);
}
