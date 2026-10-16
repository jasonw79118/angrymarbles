import { defineConfig,loadEnv } from 'vite';
const geometryModuleBridge={
  name:'angry-marbles-geometry-commonjs',
  enforce:'pre' as const,
  transform(code:string,id:string){
    if(!id.replaceAll('\\','/').endsWith('/pb_hooks/boardGeometry.cjs'))return null;
    return {code:`const module={exports:{}};\n${code}\nexport default module.exports;`,map:null};
  }
};
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  return {
    base: env.VITE_BASE_PATH || '/angrymarbles/',
    plugins:[geometryModuleBridge],
    server:{proxy:{'/api':{target:'http://127.0.0.1:8787',changeOrigin:true,ws:true}}},
  };
});
