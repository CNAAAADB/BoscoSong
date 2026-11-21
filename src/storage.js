// IndexedDB is a per-browser cache. The public catalog is on GitHub Pages,
// and authorized edits are persisted on AWS once the backend is configured.
const DB_NAME="boscosong-local";
const VERSION=1;
let writeQueue=Promise.resolve();
function openDb(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,VERSION);
  request.onupgradeneeded=()=>{
   if(!request.result.objectStoreNames.contains("documents"))
     request.result.createObjectStore("documents");
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(new Error("IndexedDB está bloqueado por otra pestaña"));
 });
}
export async function readSongs(){
 const db=await openDb();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction("documents","readonly");
   const r=tx.objectStore("documents").get("songs");
   r.onsuccess=()=>resolve(r.result||null);
   r.onerror=()=>reject(r.error);
  });
 }finally{db.close();}
}
async function writeSnapshot(songs){
 const db=await openDb();
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction("documents","readwrite");
   tx.objectStore("documents").put(songs,"songs");
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error||new Error("No se guardó la copia local"));
   tx.onabort=()=>reject(tx.error||new Error("Almacenamiento local abortado"));
  });
 }finally{db.close();}
}
// Serialize writes so a slow previous IndexedDB transaction never overwrites
// a newer catalog import or shared-data refresh.
export function writeSongs(songs){
 const snapshot=structuredClone(songs);
 writeQueue=writeQueue.catch(()=>{}).then(()=>writeSnapshot(snapshot));
 return writeQueue;
}
