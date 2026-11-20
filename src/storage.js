// Persistent prototype storage. No backend or user accounts.
const DB_NAME="boscosong-local";
const VERSION=1;
function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,VERSION);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("documents"))request.result.createObjectStore("documents")};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function readSongs(){const db=await openDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction("documents","readonly");const r=tx.objectStore("documents").get("songs");r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{db.close();}}
export async function writeSongs(songs){const db=await openDb();try{await new Promise((resolve,reject)=>{const tx=db.transaction("documents","readwrite");tx.objectStore("documents").put(songs,"songs");tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
