// BoscoSong shared public library, Cognito sign-in and owner-protected API.
const BASE=import.meta.env.BASE_URL;
const AUTH_KEY="boscosong.auth.v2";
const VERIFIER_KEY="boscosong.pkce.verifier";
const STATE_KEY="boscosong.pkce.state";
const utf8=new TextEncoder();

export async function loadConfig(){
 try{
  const r=await fetch(BASE+"config.json",{cache:"no-store"});
  if(!r.ok)return null;
  const v=await r.json();
  return v?.apiBase&&v?.cognitoDomain&&v?.clientId?{
   apiBase:String(v.apiBase).replace(/\/$/,""),
   cognitoDomain:String(v.cognitoDomain).replace(/^https?:\/\//,"").replace(/\/$/,""),
   clientId:String(v.clientId),
  }:null;
 }catch{return null;}
}
const callback=()=>location.origin+location.pathname;
function base64url(input){
 let out="";for(const n of new Uint8Array(input))out+=String.fromCharCode(n);
 return btoa(out).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function randomString(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return base64url(bytes);}
function parseClaims(jwt){
 try{
  const encoded=jwt.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
  const normalized=encoded.padEnd(Math.ceil(encoded.length/4)*4,"=");
  return JSON.parse(atob(normalized));
 }catch{return{};}
}
export function currentAuth(){
 try{
  const a=JSON.parse(sessionStorage.getItem(AUTH_KEY)||"null");
  return a?.sub&&a.expiresAt>Date.now()+15e3?a:null;
 }catch{return null;}
}
export function logout(){sessionStorage.removeItem(AUTH_KEY);return null;}
export async function beginLogin(c,signup=false){
 if(!c)throw Error("El acceso todavía no está configurado.");
 const verifier=randomString(),state=randomString();
 sessionStorage.setItem(VERIFIER_KEY,verifier);
 sessionStorage.setItem(STATE_KEY,state);
 const hash=location.hash;
 if(hash)sessionStorage.setItem("boscosong.login.hash",hash);
 const digest=await crypto.subtle.digest("SHA-256",utf8.encode(verifier));
 const params=new URLSearchParams({
  client_id:c.clientId,response_type:"code",scope:"openid email profile",lang:"es",
  redirect_uri:callback(),state,code_challenge_method:"S256",
  code_challenge:base64url(digest)
 });
 location.assign("https://"+c.cognitoDomain+"/"+
  (signup?"signup":"login")+"?"+params.toString());
}
export async function finishLogin(c){
 const params=new URLSearchParams(location.search);
 const code=params.get("code"),state=params.get("state"),error=params.get("error");
 if(!code&&!error)return currentAuth();
 const hash=sessionStorage.getItem("boscosong.login.hash")||location.hash;
 history.replaceState(null,"",location.pathname+hash);
 sessionStorage.removeItem("boscosong.login.hash");
 if(error)throw Error(params.get("error_description")||error);
 if(!c||!code)throw Error("La autenticación no está configurada");
 if(state!==sessionStorage.getItem(STATE_KEY))throw Error("La sesión de inicio no es válida");
 const verifier=sessionStorage.getItem(VERIFIER_KEY);
 sessionStorage.removeItem(VERIFIER_KEY);sessionStorage.removeItem(STATE_KEY);
 if(!verifier)throw Error("No se encontró el verificador de seguridad");
 const body=new URLSearchParams({
  grant_type:"authorization_code",client_id:c.clientId,
  code,redirect_uri:callback(),code_verifier:verifier
 });
 const response=await fetch("https://"+c.cognitoDomain+"/oauth2/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body
 });
 const data=await response.json();
 if(!response.ok||!data.access_token)throw Error("No se pudo iniciar sesión");
 const id=parseClaims(data.id_token||"");
 const access=parseClaims(data.access_token);
 const groups=access["cognito:groups"]||id["cognito:groups"]||[];
 const list=Array.isArray(groups)?groups:String(groups).split(",");
 const sub=access.sub||id.sub;
 if(!sub)throw Error("No se pudo verificar el usuario");
 const email=id.email||"";
 const auth={
  sub,email,name:id.name||id.preferred_username||email.split("@")[0]||"Usuario",
  displayName:id.name||id.preferred_username||email.split("@")[0]||"Usuario",
  accessToken:data.access_token,
  expiresAt:Date.now()+Math.max(30,Number(data.expires_in)||3600)*1000,
  isAdmin:list.includes("editors"),canEdit:true
 };
 sessionStorage.setItem(AUTH_KEY,JSON.stringify(auth));
 return auth;
}
export function updateAuthProfile(profile){
 const value=currentAuth();if(!value)return null;
 const username=typeof profile==="string"?profile:(profile?.username||null);
 const updated={...value,username,usernameRequired:!username,displayName:username||value.name};
 sessionStorage.setItem(AUTH_KEY,JSON.stringify(updated));
 return updated;
}
async function apiFetch(c,path,options={}){
 if(!c?.apiBase)throw Error("AWS todavía no está configurado");
 const method=options.method||"GET",auth=currentAuth();
 if(method!=="GET"&&!auth)throw Error("Inicia sesión para guardar cambios");
 const response=await fetch(c.apiBase+path,{
  ...options,
  headers:{
   Accept:"application/json",
   ...(options.body?{"Content-Type":"application/json"}:{}),
   ...(auth?{Authorization:"Bearer "+auth.accessToken}:{}),
   ...(options.headers||{})
  },
  cache:method==="GET"?"no-store":"default"
 });
 const raw=await response.text();
 let payload={};try{payload=raw?JSON.parse(raw):{}}catch{payload={message:raw};}
 if(!response.ok)throw Error(payload.message||"Error HTTP "+response.status);
 return payload;
}
export async function loadPublicCatalog(){
 const response=await fetch(BASE+"catalog/manifest.json",{cache:"no-cache"});
 if(!response.ok)throw Error("El cancionero compartido no está disponible");
 const manifest=await response.json();
 if(!Array.isArray(manifest.parts))throw Error("Índice de canciones inválido");
 const chunks=await Promise.all(manifest.parts.map(async part=>{
  if(!/^part-\d+\.json$/.test(part))throw Error("Archivo de canciones inválido");
  const r=await fetch(BASE+"catalog/"+part,{cache:"no-cache"});
  if(!r.ok)throw Error("No se pudo leer "+part);
  return r.json();
 }));
 return chunks.flat();
}
export async function loadChanges(c){
 if(!c)return [];
 const changes=[];let cursor=null;
 for(let page=0;page<40;page++){
  const r=await apiFetch(c,"/changes"+(cursor?"?cursor="+encodeURIComponent(cursor):""));
  changes.push(...(r.items||[]));
  if(!r.cursor)break;
  cursor=r.cursor;
 }
 return changes;
}
export function applyChanges(baseline,changes){
 const items=new Map(baseline.map(s=>[s.id,s]));
 for(const x of changes){
  if(x?.deleted)items.delete(x.id);
  else if(x?.song?.id)items.set(x.song.id,x.song);
 }
 return [...items.values()];
}
export function canManageSong(auth,song){
 return Boolean(auth?.sub&&auth?.username&&song&&(song.ownerSub===auth.sub||auth.isAdmin));
}
export function canManageSession(auth,session){
 return Boolean(auth?.sub&&auth?.username&&session?.ownerSub===auth.sub);
}
export async function loadProfile(c){return apiFetch(c,"/profile");}
export async function setProfile(c,username){
 return apiFetch(c,"/profile",{method:"PUT",body:JSON.stringify({username})});
}
export async function saveSong(c,song){
 if(!song?.id)throw Error("La canción no tiene ID");
 const response=await apiFetch(c,"/songs/"+encodeURIComponent(song.id),{
  method:"PUT",body:JSON.stringify(song)
 });
 return response.song;
}
export async function saveSongBatch(c,songs){
 if(!Array.isArray(songs)||!songs.length)return {count:0,songs:[]};
 const saved=[];
 for(let i=0;i<songs.length;i+=20){
  const r=await apiFetch(c,"/songs/batch",{method:"POST",
   body:JSON.stringify({songs:songs.slice(i,i+20)})});
  saved.push(...(r.songs||[]));
 }
 return {count:saved.length,songs:saved};
}
export async function deleteSong(c,id){
 return apiFetch(c,"/songs/"+encodeURIComponent(id),{method:"DELETE"});
}
export async function listSessions(c){
 if(!c)return [];
 const all=[];let cursor=null;
 for(let page=0;page<40;page++){
  const r=await apiFetch(c,"/sessions"+(cursor?"?cursor="+encodeURIComponent(cursor):""));
  all.push(...(r.items||[]));
  if(!r.cursor)break;
  cursor=r.cursor;
 }
 return all.sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
}
export async function getSession(c,code){
 return apiFetch(c,"/sessions/"+encodeURIComponent(code));
}
export async function saveSession(c,session){
 const method=session.id?"PUT":"POST";
 const path=session.id?"/sessions/"+encodeURIComponent(session.id):"/sessions";
 const response=await apiFetch(c,path,{method,body:JSON.stringify(session)});
 return response.session;
}
