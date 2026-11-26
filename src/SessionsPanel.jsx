import React,{useEffect,useMemo,useRef,useState} from "react";
import {Plus,Search,Copy,Download,Share2,Check,ChevronLeft,ArrowUp,ArrowDown,Trash2,BookOpen,RotateCw,Edit3,Music2} from "lucide-react";
import {canManageSession,getSession,saveSession} from "./cloud.js";
import {formatScrollRate} from "./autoscroll.js";

const sessionLink=s=>location.origin+location.pathname+"#session="+encodeURIComponent(s.id);
const downloadJson=(session)=>{
 const url=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:"application/json"}));
 const a=document.createElement("a");a.href=url;a.download="boscosong-"+session.id+".json";a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const rowSettings=(entry,song)=>({
 songId:entry.songId,
 transpose:Number(entry.transpose)||0,
 speed:Number(entry.speed)||2,
 tempo:Number(entry.tempo)||song?.tempo||76
});
const entryFor=s=>rowSettings({songId:s.id},s);
const cloneEntries=(session,songs)=>Array.isArray(session.songs)&&session.songs.length
 ?session.songs.map(entry=>rowSettings(entry,songs.find(s=>s.id===entry.songId)))
 :(session.songIds||[]).map(id=>rowSettings({songId:id},songs.find(s=>s.id===id)));
const speedChoices=[0.02,0.05,0.1,0.2,0.35,0.5,0.75,1,1.5,2,3,5];

export default function SessionsPanel({songs,sessions,onChange,onOpenSong,auth,config,onRefresh}){
 const [selected,setSelected]=useState(null);
 const [draft,setDraft]=useState(null);
 const [search,setSearch]=useState("");
 const [code,setCode]=useState("");
 const [filter,setFilter]=useState("");
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const seenHash=useRef("");
 const current=sessions.find(s=>s.id===selected);
 const owned=canManageSession(auth,current);
 const candidates=useMemo(()=>songs.filter(s=>(s.title+" "+(s.tags||[]).join(" "))
   .toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))).slice(0,100),[songs,search]);
 const visible=useMemo(()=>sessions.filter(s=>(s.title+" "+s.id+" "+(s.ownerName||""))
   .toLocaleLowerCase("es").includes(filter.toLocaleLowerCase("es"))),[sessions,filter]);

 const openByCode=async(raw)=>{
  const match=String(raw||"").match(/BS-[0-9A-F]{12}/i);
  if(!match){setMessage("Introduce un código de sesión válido, como BS-...");return;}
  const id=match[0].toUpperCase();
  const local=sessions.find(s=>s.id===id);
  if(local){setSelected(id);setDraft(null);setCode("");setMessage("");return;}
  if(!config){setMessage("El servidor de sesiones no está disponible");return;}
  setBusy(true);setMessage("");
  try{
   const loaded=await getSession(config,id);
   onChange(prev=>[loaded,...prev.filter(s=>s.id!==loaded.id)]);
   setSelected(loaded.id);setDraft(null);setCode("");
  }catch(e){setMessage("No se encontró esa sesión: "+e.message);}
  finally{setBusy(false);}
 };
 useEffect(()=>{
  const hash=location.hash;
  if(!hash.startsWith("#session=")||seenHash.current===hash||!config)return;
  seenHash.current=hash;
  openByCode(decodeURIComponent(hash.slice(9)));
 },[config]);

 const beginDraft=(source,modify=false)=>{
  if(!auth){setMessage("Inicia sesión para crear sesiones");return;}
  setMessage("");setSearch("");
  setDraft({
   id:modify?source.id:undefined,
   title:source?(modify?source.title:source.title+" (copia)"):"Nueva sesión",
   songs:source?cloneEntries(source,songs):[]
  });
 };
 const updateEntry=(index,patch)=>setDraft(prev=>({
  ...prev,
  songs:prev.songs.map((entry,i)=>i===index?{...entry,...patch}:entry)
 }));
 const moveEntry=(index,delta)=>{
  const at=index+delta;
  if(at<0||at>=draft.songs.length)return;
  const next=[...draft.songs];[next[index],next[at]]=[next[at],next[index]];
  setDraft(d=>({...d,songs:next}));
 };
 const save=async()=>{
  if(!auth||!config){setMessage("Inicia sesión para guardar una sesión");return;}
  if(!draft.title.trim()||!draft.songs.length){setMessage("Escribe un nombre y añade al menos una canción");return;}
  setBusy(true);setMessage("");
  try{
   const stored=await saveSession(config,{...draft,title:draft.title.trim()});
   onChange(prev=>[stored,...prev.filter(s=>s.id!==stored.id)]);
   setSelected(stored.id);setDraft(null);
   setMessage("Sesión guardada. El resto del coro puede consultarla por su código.");
  }catch(e){setMessage("No se pudo guardar: "+e.message);}
  finally{setBusy(false);}
 };
 const copyLink=async(s)=>{
  const link=sessionLink(s);
  try{await navigator.clipboard.writeText(link);setMessage("Enlace copiado al portapapeles.");}
  catch{window.prompt("Copia el enlace:",link);}
 };
 return <main className="sessionsView">
  <div className="sessionsIntro">
   <div><span className="eyebrow">REPERTORIO COMPARTIDO</span><h1>Sesiones</h1>
    <p>Consulta las sesiones del coro y abre las canciones en orden. El creador puede modificar el repertorio, el tono, el tempo y la velocidad; los demás pueden verlo.</p>
   </div>
   <button className="primary" disabled={!auth||busy} onClick={()=>beginDraft()}>
    <Plus size={17}/>Nueva sesión
   </button>
  </div>
  <div className="sessionUtilGrid">
   <section className="editPanel">
    <h3><Search size={17}/>Buscar sesión por código</h3>
    <div className="joinControls">
     <input value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&openByCode(code)} placeholder="BS-... o enlace compartido" aria-label="Código de sesión"/>
     <button className="secondary" disabled={busy} onClick={()=>openByCode(code)}>Abrir</button>
    </div>
   </section>
   <section className="editPanel">
    <h3><Music2 size={17}/>Sesiones disponibles</h3>
    <p className="hint">{sessions.length} sesiones compartidas. Accede desde cualquier dispositivo con su código.</p>
    <button className="subtle" disabled={busy} onClick={onRefresh}><RotateCw size={16}/>Actualizar listado</button>
   </section>
  </div>
  {message&&<p className="notice" role="status">{message}</p>}
  {draft?<section className="editPanel createSession">
   <div className="sectionHeading"><div><span className="eyebrow">{draft.id?"EDITAR MIS SESIONES":"CREAR SESIÓN"}</span><h2>Preparar repertorio</h2></div>
    <button className="subtle" onClick={()=>setDraft(null)}><ChevronLeft size={16}/>Cancelar</button>
   </div>
   <label>Nombre de la sesión<input maxLength={160} value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label>
   <div className="sessionBuilder">
    <div>
     <h3>Buscar canciones</h3>
     <label className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Título o etiqueta…"/></label>
     <div className="sessionCandidates">
      {candidates.map(s=><button className="songItem" key={s.id} onClick={()=>setDraft(d=>({...d,songs:[...d.songs,entryFor(s)]}))}>
       <Plus size={15}/><span><strong>{s.title}</strong><small>{(s.tags||[]).join(", ")}</small></span>
      </button>)}
     </div>
    </div>
    <div>
     <h3>Canciones ordenadas ({draft.songs.length})</h3>
     <div className="sessionOrder">
      {draft.songs.map((entry,index)=>{
       const s=songs.find(x=>x.id===entry.songId);
       return <div className="sessionEditEntry" key={index}>
        <div className="sessionRow"><span><b>{index+1}.</b> {s?.title||"Canción no encontrada"}</span>
         <div>
          <button title="Subir" disabled={!index} onClick={()=>moveEntry(index,-1)}><ArrowUp size={15}/></button>
          <button title="Bajar" disabled={index===draft.songs.length-1} onClick={()=>moveEntry(index,1)}><ArrowDown size={15}/></button>
          <button title="Quitar canción" onClick={()=>setDraft(d=>({...d,songs:d.songs.filter((_,i)=>i!==index)}))}><Trash2 size={15}/></button>
         </div>
        </div>
        <div className="sessionEntrySettings">
         <label>Tono <span><button onClick={()=>updateEntry(index,{transpose:Math.max(-24,entry.transpose-1)})} aria-label="Bajar medio tono">−</button><strong>{entry.transpose>0?"+":""}{entry.transpose/2} tonos</strong><button onClick={()=>updateEntry(index,{transpose:Math.min(24,entry.transpose+1)})} aria-label="Subir medio tono">+</button></span></label>
         <label>Velocidad <select value={speedChoices.includes(Number(entry.speed))?Number(entry.speed):2} onChange={e=>updateEntry(index,{speed:Number(e.target.value)})}>
          {speedChoices.map(v=><option key={v} value={v}>{formatScrollRate(v)}×</option>)}
         </select></label>
         <label>Tempo <input type="number" min="40" max="240" value={entry.tempo} onChange={e=>updateEntry(index,{tempo:Math.min(240,Math.max(40,Number(e.target.value)||76))})}/></label>
        </div>
       </div>;
      })}
     </div>
    </div>
   </div>
   <div className="sessionPublish"><p>Solo tú podrás modificar esta sesión. Cada canción conservará sus ajustes.</p>
    <button className="primary" disabled={busy} onClick={save}><Check size={17}/>{busy?"Guardando…":draft.id?"Guardar cambios":"Publicar sesión"}</button>
   </div>
  </section>:<div className="sessionsGrid">
   <section className="editPanel sessionListPanel">
    <div className="sectionHeading"><h2>Sesiones activas</h2><span>{sessions.length}</span></div>
    <label className="search"><Search size={17}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Buscar título o creador"/></label>
    {visible.map(s=><button key={s.id} className={"songItem "+(s.id===selected?"selected":"")} onClick={()=>setSelected(s.id)}>
     <strong>{s.title}</strong><small>Por @{s.ownerName||"Usuario"} · {s.id} · {(s.songs||s.songIds||[]).length} canciones</small>
    </button>)}
    {!visible.length&&<p className="hint">No hay sesiones que coincidan.</p>}
   </section>
   <section className="editPanel sessionDetail">
    {current?<><div className="sectionHeading"><div><span className="eyebrow">{owned?"MI SESIÓN":"SESIÓN COMPARTIDA · SOLO LECTURA"}</span><h2>{current.title}</h2>
     <p className="hint">Por <strong>@{current.ownerName||"Usuario"}</strong> · Código <strong>{current.id}</strong></p>
    </div><BookOpen size={22}/></div>
    <div className="sessionActions">
     <button className="secondary" onClick={()=>copyLink(current)}><Share2 size={16}/>Compartir enlace</button>
     <button className="subtle" onClick={()=>downloadJson(current)}><Download size={16}/>Exportar JSON</button>
     {owned&&<button className="subtle" onClick={()=>beginDraft(current,true)}><Edit3 size={16}/>Editar mi sesión</button>}
     {auth&&<button className="subtle" onClick={()=>beginDraft(current,false)}><Copy size={16}/>Duplicar</button>}
    </div>
    <h3>Canciones ordenadas</h3>
    <div className="sessionSongList">
     {cloneEntries(current,songs).map((entry,index)=>{
      const s=songs.find(x=>x.id===entry.songId);
      return <button className="sessionSongLink" key={index} disabled={!s} onClick={()=>s&&onOpenSong(current.id,index)}>
       <span>{index+1}. <strong>{s?.title||"Canción no disponible"}</strong></span>
       <span>{entry.transpose>0?"+":""}{entry.transpose/2} tonos · {formatScrollRate(entry.speed)}× · {entry.tempo} BPM</span>
      </button>;
     })}
    </div>
    <p className="hint">{owned?"Puedes cambiar los ajustes y guardarlos desde el visor de canciones.":"Puedes tocar con tus propios ajustes locales sin modificar los del creador."}</p>
   </>:<div className="emptySession"><BookOpen size={32}/><h3>Selecciona una sesión</h3><p className="hint">Elige una sesión o introduce su código para abrirla.</p></div>}
   </section>
  </div>}
 </main>;
}
