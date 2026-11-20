import React,{useEffect,useMemo,useState} from "react";
import {Plus,Search,Copy,Download,Upload,Share2,Check,ChevronLeft,ArrowUp,ArrowDown,Trash2,BookOpen} from "lucide-react";
function randomCode(){
 const b=new Uint8Array(6);crypto.getRandomValues(b);
 return "BS-"+[...b].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
}
const encode=(data)=>{const raw=new TextEncoder().encode(JSON.stringify(data));let str="";for(const n of raw)str+=String.fromCharCode(n);return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");};
const decode=(data)=>{const raw=atob(data.replace(/-/g,"+").replace(/_/g,"/"));return JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));};
const valid=(s)=>s&&typeof s==="object"&&typeof s.id==="string"&&typeof s.title==="string"&&Array.isArray(s.songIds)&&s.songIds.every(id=>typeof id==="string")&&s.songIds.length<=150;
const sanitize=(s)=>({id:s.id,title:s.title.slice(0,160),songIds:s.songIds.slice(0,150),createdAt:s.createdAt||new Date().toISOString(),published:true});
const downloadJson=(payload,name)=>{const link=document.createElement("a"),url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function sharedLink(s){return location.origin+location.pathname+"#session="+encode(sanitize(s));}
export function takeSharedSession(){
 const hash=location.hash.startsWith("#session=")?location.hash.slice(9):null;
 if(!hash)return null;try{const s=decode(hash);return valid(s)?sanitize(s):null;}catch{return null;}
}
export default function SessionsPanel({songs,sessions,onChange,onOpenSong}){
 const [selected,setSelected]=useState(null);
 const [draft,setDraft]=useState(null);
 const [search,setSearch]=useState("");
 const [join,setJoin]=useState("");
 const [message,setMessage]=useState("");
 const [view,setView]=useState("all");
 const [importedId,setImportedId]=useState(null);
 useEffect(()=>{const s=takeSharedSession();if(s){onChange(prev=>prev.some(x=>x.id===s.id)?prev:[s,...prev]);setSelected(s.id);setView("all");setImportedId(s.id);history.replaceState(null,"",location.pathname+location.search);}},[]);
 const current=sessions.find(s=>s.id===selected);
 const filtered=useMemo(()=>songs.filter(s=>[s.title,...(s.tags||[])].join(" ").toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))).slice(0,60),[songs,search]);
 const newDraft=(source)=>{setDraft({title:source?source.title+" (copia)":"Nueva sesión",songIds:source?[...source.songIds]:[]});setSearch("");setMessage("");setView("create")};
 const create=()=>{if(!draft?.title.trim()){setMessage("Escribe un nombre para la sesión.");return;}if(!draft.songIds.length){setMessage("Añade al menos una canción.");return;}const s={id:randomCode(),title:draft.title.trim(),songIds:[...draft.songIds],createdAt:new Date().toISOString(),published:true};onChange(all=>[s,...all]);setSelected(s.id);setDraft(null);setView("all");setMessage("Sesión publicada. Ya no es editable.");};
 const openCode=()=>{
  const val=join.trim();if(!val){setMessage("Introduce el código o el enlace.");return;}
  let found=sessions.find(s=>s.id.toLowerCase()===val.toLowerCase());
  let remote=null;
  try{
   const h=val.includes("#session=")?val.split("#session=")[1]:val.startsWith("BS1:")?val.slice(4):null;
   if(h){remote=decode(h);if(!valid(remote))remote=null;}
  }catch{}
  if(remote){found=sanitize(remote);onChange(prev=>prev.some(x=>x.id===found.id)?prev:[found,...prev]);}
  if(found){setSelected(found.id);setView("all");setMessage("Sesión abierta.");setJoin("");}
  else setMessage("Ese código no está guardado en este navegador. Pide el enlace completo o importa su JSON. Los códigos cortos requerirán el servicio compartido.");
 };
 const jsonImport=async(file)=>{if(!file)return;try{const body=JSON.parse(await file.text());const candidates=Array.isArray(body)?body:body.sessions||[body];const incoming=candidates.filter(valid).map(sanitize);if(!incoming.length)throw Error("No se encontraron sesiones válidas.");onChange(prev=>{const ids=new Set(prev.map(s=>s.id));return [...incoming.filter(s=>!ids.has(s.id)),...prev]});setSelected(incoming[0].id);setView("all");setMessage("Importadas "+incoming.length+" sesiones.");}catch(e){setMessage("Error importando: "+e.message)}};
 const copyLink=async(s)=>{try{await navigator.clipboard.writeText(sharedLink(s));setMessage("Enlace copiado. Contiene la sesión y puede abrirse en otro dispositivo.");}catch{window.prompt("Copia el enlace:",sharedLink(s));}};
 const updateDraft=(patch)=>setDraft(d=>({...d,...patch}));
 return <main className="sessionsView">
  <div className="sessionsIntro"><div><span className="eyebrow">REPERTORIO DEL CORO</span><h1>Sesiones</h1><p>Prepara las canciones, ordénalas y publica una sesión cerrada. Todas las sesiones que has cargado aquí se consideran activas.</p></div><button className="primary" onClick={()=>newDraft()}><Plus size={17}/>Crear sesión</button></div>
  <div className="sessionUtilGrid">
    <section className="editPanel"><h3><Search size={17}/>Buscar sesión</h3><p className="hint">Introduce un código local o pega el enlace compartido.</p><div className="joinControls"><input value={join} onChange={e=>setJoin(e.target.value)} placeholder="Código BS-… o enlace" onKeyDown={e=>e.key==="Enter"&&openCode()}/><button className="secondary" onClick={openCode}>Buscar</button></div></section>
    <section className="editPanel"><h3><Upload size={17}/>Sesiones en JSON</h3><p className="hint">Las sesiones permanecen en este navegador. Importa o exporta una copia JSON.</p><div className="actions"><label className="secondary fileAction"><Upload size={16}/>Importar JSON<input type="file" accept=".json,application/json" hidden onChange={e=>{jsonImport(e.target.files?.[0]);e.target.value=""}}/></label><button className="subtle" onClick={()=>downloadJson({version:1,sessions}, "boscosong-sesiones.json")} disabled={!sessions.length}><Download size={16}/>Exportar todas</button></div></section>
  </div>
  {message&&<p className="notice">{message}</p>}
  {view==="create"&&draft?<section className="editPanel createSession">
    <div className="sectionHeading"><div><span className="eyebrow">BORRADOR</span><h2>Preparar sesión</h2></div><button className="subtle" onClick={()=>{setView("all");setDraft(null)}}><ChevronLeft size={16}/>Cancelar</button></div>
    <label>Nombre de la sesión<input value={draft.title} maxLength={160} onChange={e=>updateDraft({title:e.target.value})}/></label>
    <div className="sessionBuilder">
      <div><h3>Buscar canciones</h3><label className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Título o etiqueta…"/></label><div className="sessionCandidates">{filtered.map(s=><button key={s.id} className="songItem" onClick={()=>updateDraft({songIds:[...draft.songIds,s.id]})}><Plus size={15}/><span><strong>{s.title}</strong><small>{(s.tags||[]).join(", ")}</small></span></button>)}</div></div>
      <div><h3>Orden de la sesión ({draft.songIds.length})</h3><div className="sessionOrder">{draft.songIds.map((id,i)=>{const s=songs.find(x=>x.id===id);return <div className="sessionRow" key={i}><span><b>{i+1}.</b> {s?.title||"Canción no encontrada"}</span><div><button aria-label="Subir posición" disabled={i===0} onClick={()=>{const ids=[...draft.songIds];[ids[i-1],ids[i]]=[ids[i],ids[i-1]];updateDraft({songIds:ids})}}><ArrowUp size={15}/></button><button aria-label="Bajar posición" disabled={i===draft.songIds.length-1} onClick={()=>{const ids=[...draft.songIds];[ids[i+1],ids[i]]=[ids[i],ids[i+1]];updateDraft({songIds:ids})}}><ArrowDown size={15}/></button><button aria-label="Quitar canción" onClick={()=>updateDraft({songIds:draft.songIds.filter((_,j)=>j!==i)})}><Trash2 size={15}/></button></div></div>})}</div></div>
    </div>
    <div className="sessionPublish"><p>Una vez publicada, esta sesión no podrá modificarse. Puedes duplicarla para crear otra.</p><button className="primary" onClick={create}><Check size={17}/>Publicar sesión</button></div>
  </section>:<div className="sessionsGrid">
    <section className="editPanel sessionListPanel"><div className="sectionHeading"><h2>Todas las sesiones activas</h2><span>{sessions.length}</span></div>{sessions.length? sessions.map(s=><button className={"songItem "+(selected===s.id?"selected":"")} key={s.id} onClick={()=>setSelected(s.id)}><strong>{s.title}</strong><small>{s.id} · {s.songIds.length} canciones</small></button>):<p className="hint">Aún no hay sesiones. Crea una o importa un JSON.</p>}</section>
    <section className="editPanel sessionDetail">{current?<><div className="sectionHeading"><div><span className="eyebrow">SESIÓN PUBLICADA · SOLO LECTURA</span><h2>{current.title}</h2><p className="hint">Código: <strong>{current.id}</strong></p></div><BookOpen size={22}/></div>
      <div className="sessionActions"><button className="secondary" onClick={()=>copyLink(current)}><Share2 size={16}/>Compartir enlace</button><button className="subtle" onClick={()=>downloadJson(current,"sesion-"+current.id+".json")}><Download size={16}/>Descargar JSON</button><button className="subtle" onClick={()=>newDraft(current)}><Copy size={16}/>Duplicar</button></div>
      <h3>Repertorio ({current.songIds.length})</h3><div className="sessionSongList">{current.songIds.map((id,i)=>{const s=songs.find(x=>x.id===id);return <button key={i} className="sessionSongLink" onClick={()=>s&&onOpenSong(s.id)} disabled={!s}><span>{i+1}. <strong>{s?.title||"Canción no disponible en este dispositivo"}</strong></span><span>{s?(s.tags||[])[0]||"Abrir":"Importa el cancionero"}</span></button>})}</div>
      <p className="hint">Al abrir una canción utilizarás exactamente el mismo visor, transporte, piano y control de tempo del cancionero.</p>
    </>:<div className="emptySession"><BookOpen size={32}/><h3>Selecciona una sesión</h3><p className="hint">Consulta las sesiones existentes o crea un nuevo repertorio.</p></div>}</section>
  </div>}
  <p className="sessionsLimit">Modo de pruebas sin servidor: las sesiones de esta instalación quedan en el navegador y se pueden compartir por enlace completo o JSON. La lista global entre todos los dispositivos y la consulta universal por código corto requieren un servicio de almacenamiento compartido.</p>
 </main>;
}
