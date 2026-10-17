const encoder=new TextEncoder();
const ITERATIONS=100_000;

function hex(bytes:Uint8Array):string{return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');}
function equal(a:string,b:string):boolean{
  if(a.length!==b.length)return false;
  let mismatch=0;
  for(let index=0;index<a.length;index++)mismatch|=a.charCodeAt(index)^b.charCodeAt(index);
  return mismatch===0;
}
async function derive(password:string,salt:Uint8Array):Promise<string>{
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,256);
  return hex(new Uint8Array(bits));
}

export async function hashPassword(password:string):Promise<string>{
  const salt=crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${hex(salt)}$${await derive(password,salt)}`;
}
export async function verifyPassword(password:string,stored:string):Promise<boolean>{
  const [algorithm,iterationsText,saltHex,digest]=stored.split('$');
  const iterations=Number(iterationsText);
  if(algorithm!=='pbkdf2-sha256'||!Number.isInteger(iterations)||iterations<100_000||iterations>500_000||!saltHex||!digest)return false;
  const salt=Uint8Array.from(saltHex.match(/.{2}/g)||[],value=>parseInt(value,16));
  return equal(await derive(password,salt),digest);
}
export function newSessionToken():string{return hex(crypto.getRandomValues(new Uint8Array(32)));}
export async function hashToken(token:string):Promise<string>{return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))));}
