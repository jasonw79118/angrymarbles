// One reusable glass sprite, tinted through luminance so custom player colors
// retain the artwork's reflections, transparent edge and internal swirl.
type Paint=(tag:string,attrs:Record<string,string|number|undefined>,parent:Element)=>Element;
export function addGlassMaterials(defs:Element,colors:string[],el:Paint){
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
