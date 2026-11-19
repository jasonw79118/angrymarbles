// One reusable glass sprite, tinted through luminance so custom player colors
// retain the artwork's reflections, transparent edge and internal swirl.
type Paint=(tag:string,attrs:Record<string,string|number|undefined>,parent:Element)=>Element;
export function addGlassMaterials(defs:Element,colors:string[],el:Paint){
  // Shared sphere lighting: light from the upper left, soft core shadow lower right, bright bounce on the rim.
  const shade=el('radialGradient',{id:'marble-shade',cx:'36%',cy:'30%',r:'78%'},defs);
  for(const [offset,color,opacity] of [['0%','#fff',.0],['55%','#0a1420',.0],['82%','#0a1420',.34],['100%','#050a12',.62]] as const)el('stop',{offset,'stop-color':color,'stop-opacity':opacity},shade);
  const bounce=el('radialGradient',{id:'marble-bounce',cx:'68%',cy:'82%',r:'38%'},defs);
  el('stop',{offset:'0%','stop-color':'#fff','stop-opacity':.42},bounce);el('stop',{offset:'100%','stop-color':'#fff','stop-opacity':0},bounce);
  const spec=el('radialGradient',{id:'marble-spec',cx:'50%',cy:'50%',r:'50%'},defs);
  el('stop',{offset:'0%','stop-color':'#fff','stop-opacity':.95},spec);el('stop',{offset:'100%','stop-color':'#fff','stop-opacity':0},spec);
  const blur=el('filter',{id:'marble-blur',x:'-50%',y:'-50%',width:'200%',height:'200%'},defs);
  el('feGaussianBlur',{stdDeviation:1.6},blur);
  colors.forEach((color,seat)=>{
    const hex=/^#[\da-f]{6}$/i.test(color)?color:'#329bff';
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    const filter=el('filter',{id:`glass-tint-${seat}`,x:0,y:0,width:1,height:1,'color-interpolation-filters':'sRGB'},defs);
    const transfer=el('feComponentTransfer',{},filter);
    rgb.forEach((v,i)=>el(['feFuncR','feFuncG','feFuncB'][i],{type:'table',tableValues:`0 ${v*.75} ${v+(1-v)*.12} ${v+(1-v)*.65} 1`},transfer));
    const symbol=el('symbol',{id:`glass-${seat}`,viewBox:'0 0 128 128'},defs);
    el('image',{href:`${import.meta.env.BASE_URL}assets/art/marble-neutral.png`,x:0,y:0,width:128,height:128,filter:`url(#glass-tint-${seat})`},symbol);
    el('path',{d:'M29 100 C15 68 99 75 99 28 C116 76 41 72 29 100Z',fill:'#d8f9ff',opacity:.32},symbol);
    el('path',{d:'M25 44 Q32 22 50 20 M26 51 L23 60',fill:'none',stroke:'#fff','stroke-width':5,'stroke-linecap':'round',opacity:.8},symbol);
    el('path',{d:'M80 107 Q101 95 105 76',fill:'none',stroke:'#b6efff','stroke-width':2,opacity:.64},symbol);
  });
}
