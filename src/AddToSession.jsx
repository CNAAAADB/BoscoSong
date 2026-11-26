import React,{useMemo,useState} from "react";
import {BookOpen,Check,ChevronRight,LockKeyhole,Plus,Search,X} from "lucide-react";
import {canManageSession,saveSession} from "./cloud.js";
import {formatScrollRate} from "./autoscroll.js";

function newEntry(song,transpose,speed,tempo){
 return {songId:song.id,transpose:Math.max(-24,Math.min(24,Number(transpose)||0)),
  speed:Number(speed)||2,tempo:Math.max(40,Math.min(240,Number(tempo)||song.tempo||76))};
}

export default function AddToSession({
 song,auth,config,sessions,onClose,onSaved,onViewSession,onLogin,onSignup,
 transpose=0,speed=2,tempo=76
}){
 const [newTitle,setNewTitle]=useState("");
 const [query,setQuery]=useState("");
 const [saving,setSaving]=useState("");
 const [error,setError]=useState("");
 const [success,setSuccess]=useState(null);
 const owned=useMemo(()=>sessions.filter(s=>canManageSession(auth,s))
  .filter(s=>s.title.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")))
  .sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||""))),
  [sessions,auth,query]);

 const save=async(target)=>{
  if(!auth||!config){setError("Inicia sesión para añadir canciones a tus sesiones.");return;}
  const title=target?.title||newTitle.trim();
  if(!title){setError("Escribe el nombre de la nueva sesión.");return;}
  if(target&&!canManageSession(auth,target)){
   setError("Solo puedes añadir canciones a tus propias sesiones.");return;
  }
  const previous=target
   ?Array.isArray(target.songs)&&target.songs.length
    ?target.songs
    :(target.songIds||[]).map(id=>({songId:id,transpose:0,speed:2,tempo:76}))
   :[];
  if(previous.some(e=>e.songId===song.id)){
   setError("Esta canción ya está incluida en la sesión.");return;
  }
  setSaving(target?.id||"new");setError("");
  try{
   const entry=newEntry(song,transpose,speed,tempo);
   const stored=await saveSession(config,target
    ?{...target,songs:[...previous,entry]}
    :{title,songs:[entry]});
   onSaved(stored);
   setSuccess(stored);
  }catch(e){setError("No se pudo guardar la canción: "+e.message);}
  finally{setSaving("");}
 };
 return <div className="sessionPickerBackdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="sessionPickerDialog" role="dialog" aria-modal="true" aria-labelledby="session-picker-title">
   <div className="sessionPickerHead">
    <div className="sessionPickerSymbol"><BookOpen size={20}/></div>
    <div><span className="eyebrow">REPERTORIO</span><h2 id="session-picker-title">Añadir a una sesión</h2></div>
    <button type="button" className="sessionPickerClose" onClick={onClose} aria-label="Cerrar"><X size={19}/></button>
   </div>
   <div className="sessionPickerSelected">
    <span>Canción seleccionada</span><strong>{song.title}</strong>
    <small>{transpose>0?"+":""}{transpose/2} tonos · {formatScrollRate(speed)}× · {tempo} BPM</small>
   </div>
   {success?<div className="sessionPickerSuccess" role="status">
    <span className="sessionPickerCheck"><Check size={28}/></span>
    <h3>Guardado en tu sesión</h3>
    <p>«{song.title}» forma parte de <strong>{success.title}</strong>. Queda disponible para el resto del coro.</p>
    <div className="sessionPickerFoot">
     <button className="subtle" type="button" onClick={onClose}>Seguir con la canción</button>
     <button className="primary" type="button" onClick={()=>onViewSession(success.id)}>Ver sesión <ChevronRight size={16}/></button>
    </div>
   </div>:!auth?<div className="sessionPickerLogin">
    <LockKeyhole size={27}/>
    <h3>Organiza tus canciones</h3>
    <p>Inicia sesión para añadir esta canción a tus sesiones o crear una nueva. La consulta de canciones seguirá siendo pública.</p>
    <div className="sessionPickerFoot"><button className="subtle" type="button" onClick={onSignup}>Crear cuenta</button><button className="primary" type="button" onClick={onLogin}>Iniciar sesión</button></div>
   </div>:<>
    <div className="sessionPickerBody">
     <div className="sessionPickerSectionTitle">MIS SESIONES <span>{owned.length}</span></div>
     <label className="sessionPickerSearch"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar mis sesiones…" aria-label="Buscar sesiones propias"/></label>
     <div className="sessionPickerList">
      {owned.map(session=>{
       const hasSong=(session.songs||[]).some(e=>e.songId===song.id)||(session.songIds||[]).includes(song.id);
       return <button type="button" className="sessionPickerOption" key={session.id}
        disabled={Boolean(saving)||hasSong} onClick={()=>save(session)}>
        <span className="sessionPickerOptionIcon"><BookOpen size={17}/></span>
        <span className="sessionPickerOptionText"><strong>{session.title}</strong><small>{(session.songs||session.songIds||[]).length} canciones · @{session.ownerName||auth.displayName||"Usuario"}</small></span>
        {hasSong?<span className="sessionPickerAlready"><Check size={14}/>Incluida</span>:saving===session.id?<span className="sessionPickerWorking">Guardando…</span>:<Plus size={18}/>}
       </button>;
      })}
      {!owned.length&&<p className="sessionPickerEmpty">{query?"No hay sesiones con ese nombre.":"Todavía no has creado ninguna sesión."}</p>}
     </div>
     <div className="sessionPickerCreate">
      <div className="sessionPickerSectionTitle">CREAR UNA NUEVA SESIÓN</div>
      <div className="sessionPickerNewRow">
       <input value={newTitle} maxLength={160} onChange={e=>setNewTitle(e.target.value)}
        placeholder="Por ejemplo, Misa del domingo" aria-label="Nombre de la nueva sesión"
        onKeyDown={e=>{if(e.key==="Enter")save(null);}} disabled={Boolean(saving)}/>
       <button className="primary" type="button" disabled={Boolean(saving)||!newTitle.trim()} onClick={()=>save(null)}><Plus size={16}/>Crear</button>
      </div>
      <p className="hint">Se guardarán también el tono, el tempo y la velocidad mostrados arriba.</p>
     </div>
    </div>
    {error&&<p className="sessionPickerError" role="alert">{error}</p>}
    <div className="sessionPickerFoot"><button className="subtle" type="button" onClick={onClose}>Cancelar</button></div>
   </>}
  </div>
 </div>;
}
