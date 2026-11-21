// BoscoSong shared catalog + AWS Cognito authorization.
// Public catalog is served as static JSON; new songs and deletions are
// applied through a protected API. No AWS credentials are kept in the site.
const BASE=import.meta.env.BASE_URL;
const AUTH_KEY="boscosong.auth.v1";
const VERIFIER_KEY="boscosong.pkce.verifier";
const STATE_KEY="boscosong.pkce.state";
const utf8=new TextEncoder();
export async function loadConfig(){
 try{
  const r=await fetch(BASE+"config.json",{cache:"no-store"});
  if(!r.ok)return null;
  const v=await r.json();
  return v&&v.apiBase&&v.cognitoDomain&&v.clientId?{
   apiBase:String(v.apiBase).replace(/\/$/,""),
   cognitoDomain:String(v.cognitoDomain).replace(/^https?:\/\//,"").replace(/\/$/,""),
   clientId:String(v.clientId),
  }:null;
 }catch{return null;}
}
const uri=()=>location.origin+location.pathname;
function base64url(bytes){let s="";for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function randomString(){const data=new Uint8Array(32);crypto.getRandomValues(data);return base64url(data);}
function readAuth(){try{return JSON.parse(sessionStorage.getItem(AUTH_KEY)||"null")}catch{return null}}
export function currentAuth(){const a=readAuth();return a&&a.expiresAt>Date.now()+15e3?a:null;}
export function logout(){sessionStorage.removeItem(AUTH_KEY);return null;}
export async function beginLogin(c){
 if(!c)throw Error("La autenticación aún no está configurada.");
 const verifier=randomString(),state=randomString();
 sessionStorage.setItem(VERIFIER_KEY,verifier);sessionStorage.setItem(STATE_KEY,state);
 const digest=await crypto.subtle.digest("SHA-256",utf8.encode(verifier));
 const q=new URLSearchParams({client_id:c.clientId,response_type:"code",scope:"openid email profile",redirect_uri:uri(),state,code_challenge_method:"S256",code_challenge:base64url(digest)});
 location.assign("https://"+c.cognitoDomain+"/oauth2/authorize?"+q.toString());
}
function jwtClaims(jwt){try{return JSON.parse(atob(jwt.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")))}catch{return{}}}
export async function finishLogin(c){
 const p=new URLSearchParams(location.search),code=p.get("code"),state=p.get("state"),error=p.get("error");
 if(!code&&!error)return currentAuth();
 history.replaceState(null,"",location.pathname+location.hash);
 if(error)throw Error("No se pudo iniciar sesión: "+(p.get("error_description")||error));
 if(!c)throw Error("Falta la configuración de Cognito.");
 if(state!==sessionStorage.getItem(STATE_KEY))throw Error("No coincide el estado de seguridad del inicio de sesión.");
 const verifier=sessionStorage.getItem(VERIFIER_KEY);
 sessionStorage.removeItem(VERIFIER_KEY);sessionStorage.removeItem(STATE_KEY);
 const body=new URLSearchParams({grant_type:"authorization_code",client_id:c.clientId,code,redirect_uri:uri(),code_verifier:verifier});
 const response=await fetch("https://"+c.cognitoDomain+"/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
 const token=await response.json();
 if(!response.ok||!token.access_token)throw Error("No se pudo obtener la sesión de Cognito.");
 const id=jwtClaims(token.id_token||"");
 const access=jwtClaims(token.access_token);
 const groupList=access["cognito:groups"]||id["cognito:groups"]||[];
 const groups=Array.isArray(groupList)?groupList:String(groupList).split(",");
 const auth={accessToken:token.access_token,expiresAt:Date.now()+Math.max(30,Number(token.expires_in)||3600)*1000,
  email:id.email||"",name:id.name||id.email||"",canEdit:groups.includes("editors")};
 sessionStorage.setItem(AUTH_KEY,JSON.stringify(auth));
 return auth;
}
async function apiFetch(c,path,opts={}){
 if(!c?.apiBase)throw Error("AWS todavía no está configurado.");
 const auth=currentAuth();
 if(opts.method&&opts.method!=="GET"&&(!auth||!auth.canEdit))throw Error("Necesitas iniciar sesión con permiso de edición.");
 const headers={"Accept":"application/json",...(opts.body?{"Content-Type":"application/json"}:{}),...(auth?{"Authorization":"Bearer "+auth.accessToken}:{})};
 const response=await fetch(c.apiBase+path,{...opts,headers:{...headers,...opts.headers}});
 const txt=await response.text();
 let data;try{data=txt?JSON.parse(txt):{}}catch{data={message:txt}};
 if(!response.ok)throw Error(data.message||"Error HTTP "+response.status);
 return data;
}
export async function loadPublicCatalog(){
 const r=await fetch(BASE+"catalog/manifest.json",{cache:"no-cache"});
 if(!r.ok)throw Error("No se ha podido leer el índice compartido.");
 const manifest=await r.json();if(!Array.isArray(manifest.parts))throw Error("Índice compartido no válido.");
 const chunks=await Promise.all(manifest.parts.map(async part=>{
  if(!/^part-\d+\.json$/.test(part))throw Error("Parte de catálogo no válida.");
  const response=await fetch(BASE+"catalog/"+part,{cache:"no-cache"});
  if(!response.ok)throw Error("No se ha podido leer "+part);
  return response.json();
 }));
 return chunks.flat();
}
export async function loadChanges(c){
 if(!c)return [];
 const all=[];let cursor=null;
 for(let i=0;i<40;i++){
  const q=cursor?"?cursor="+encodeURIComponent(cursor):"";
  const r=await apiFetch(c,"/changes"+q);
  all.push(...(r.items||[]));
  if(!r.cursor)break;
  cursor=r.cursor;
 }
 return all;
}
export function applyChanges(baseline,changes){
 const m=new Map(baseline.map(s=>[s.id,s]));
 for(const item of changes){
  if(item?.deleted)m.delete(item.id);
  else if(item?.song?.id)m.set(item.song.id,item.song);
 }
 return [...m.values()];
}
export async function saveSong(c,song){
 if(!song?.id)throw Error("La canción necesita un identificador.");
 return apiFetch(c,"/songs/"+encodeURIComponent(song.id),{method:"PUT",body:JSON.stringify(song)});
}
export async function saveSongBatch(c,songs){
 if(!Array.isArray(songs)||!songs.length)return {count:0};
 let count=0;
 for(let i=0;i<songs.length;i+=20){
  const res=await apiFetch(c,"/songs/batch",{method:"POST",body:JSON.stringify({songs:songs.slice(i,i+20)})});
  count+=res.count||0;
 }
 return {count};
}
export async function deleteSong(c,id){return apiFetch(c,"/songs/"+encodeURIComponent(id),{method:"DELETE"});}
