import React,{useEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {Music2,Search,Plus,Upload,ChevronLeft,ChevronRight,Save,Trash2,Play,Pause,Minus,Download,BookOpen,NotebookPen,FileText,Piano,Copy,Maximize2,Minimize2} from "lucide-react";
import "./style.css";
import {readSongs,writeSongs} from "./storage.js";
import {transposeChord,chordTones} from "./music.js";
import {extractPositionedSong,parseBracketedText} from "./importer.js";
import SessionsPanel from "./SessionsPanel.jsx";
import AddToSession from "./AddToSession.jsx";
import UsernameSetup from "./UsernameSetup.jsx";
import {advanceScroll,sliderToScrollRate,scrollRateToSlider,formatScrollRate} from "./autoscroll.js";
import {lyricRuns} from "./lyricRuns.js";
import {loadConfig,loadPublicCatalog,loadChanges,applyChanges,currentAuth,finishLogin,beginLogin,logout,saveSong,saveSongBatch,deleteSong,loadProfile,setProfile,updateAuthProfile,listSessions,saveSession,canManageSong,canManageSession} from "./cloud.js";


const STORAGE="boscosong.v1";
const initial=[{id:"demo",title:"Canción de ejemplo",category:"Misa",tags:["Entrada","Prueba"],tempo:76,lines:[
{text:"Cantemos juntos con alegría",chords:[{index:0,symbol:"C"},{index:9,symbol:"G"},{index:21,symbol:"Am"}]},
{text:"Que la música nos una hoy",chords:[{index:0,symbol:"F"},{index:13,symbol:"G"},{index:22,symbol:"C"}]},
{text:"",chords:[]},
{text:"Esta letra es solo una demostración original",chords:[{index:0,symbol:"C"}]}]}];
const NOTES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT={Db:"C#",Eb:"D#",Gb:"F#",Ab:"G#",Bb:"A#",Cb:"B",Fb:"E"};
const LATIN={Do:"C",Re:"D",Mi:"E",Fa:"F",Sol:"G",La:"A",Si:"B"};
function normalizeRoot(root){return FLAT[root]||LATIN[root]||root;}
function shiftRoot(root,steps){const n=normalizeRoot(root);const pos=NOTES.indexOf(n);return pos<0?root:NOTES[(pos+steps%12+12)%12];}
function PianoKeys({symbol}){const tones=chordTones(symbol);const white=["C","D","E","F","G","A","B"];const offsets=[0,1,2,3,4,5,6];return <div className="pianoWrap"><div className="pianoLabel">Acorde: <strong>{symbol}</strong> · notas resaltadas en ambas manos</div><div className="keyboard">{Array.from({length:14},(_,i)=>{const note=white[i%7],pos=NOTES.indexOf(note);return <div key={i} className={"whiteKey "+(tones.includes(pos)?"activeKey":"")}><small>{i===0||i===7?"C":""}</small></div>})}{Array.from({length:14},(_,i)=>{const note=white[i%7];if(note==="E"||note==="B")return null;const pos=NOTES.indexOf(note+"#");return <div key={i} className={"blackKey "+(tones.includes(pos)?"activeBlack":"")} style={{left:`calc((100% / 14) * ${i+1} - (100% / 14) * .28)`}}/>})}</div><p className="hint">Visualización orientativa de las notas del acorde, no una digitación obligatoria.</p></div>}
function ChordLine({line,shift,showChords,onAdd,onEdit,editable=false}){
 const text=String(line.text||"");
 const chars=Array.from(text);
 const grouped=new Map();
 for(const chord of line.chords||[]){
  const idx=Math.min(Math.max(Math.trunc(chord.index||0),0),chars.length);
  if(!grouped.has(idx))grouped.set(idx,[]);
  grouped.get(idx).push(chord);
 }
 const runs=lyricRuns(text);
 const renderGlyph=(index,value)=>{
  const chords=showChords?grouped.get(index):null;
  return <span className={"glyph"+(value===" "?" gapGlyph":"")} key={index}>
   {chords?.length>0&&<span className="chordColumn">{chords.map((ch,n)=>
    <button key={n} className="chord" onClick={()=>editable&&onEdit(ch)}
     title={editable?"Editar acorde":transposeChord(ch.symbol,shift)}>{transposeChord(ch.symbol,shift)}</button>
   )}</span>}
   {index<chars.length?<span className={editable?"editableChar":""} onClick={()=>editable&&onAdd(index)}>{value===" "?"\u00a0":value}</span>
    :editable?<button className="endAnchor" onClick={()=>onAdd(index)}>+</button>:null}
  </span>;
 };
 const terminal=showChords&&grouped.has(chars.length)||editable?renderGlyph(chars.length,""):null;
 return <div className={"songLine"+(!text?" blankLine":"")+(showChords?"":" noChords")}>
  <div className="lineGlyphs">
   {runs.map((run,runIndex)=>{
    const last=runIndex===runs.length-1;
    const contents=run.chars.map(({index,value})=>renderGlyph(index,value));
    if(last&&terminal)contents.push(terminal);
    return run.type==="word"
     ?<span className="lyricWord" key={run.start}>{contents}</span>
     :<React.Fragment key={run.start}><span className="lyricGap">{contents}</span><wbr/></React.Fragment>;
   })}
   {!runs.length&&terminal&&<span className="lyricWord">{terminal}</span>}
  </div>
 </div>;
}

function makeId(){return globalThis.crypto?.randomUUID?.()||Date.now()+"-"+Math.random();}
function SpeedControl({rate,onChange,compact=false}){
 return <label className={"speedControl"+(compact?" speedCompact":"")}><span>Velocidad <strong>{formatScrollRate(rate)}×</strong></span><input type="range" min="0" max="100" step="1" value={scrollRateToSlider(rate)} onChange={e=>onChange(sliderToScrollRate(Number(e.target.value)))} aria-label="Velocidad del desplazamiento automático" aria-valuetext={formatScrollRate(rate)+" veces la velocidad base"} title="Permite un desplazamiento muy lento sin detenerse"/></label>;
}
function App(){const [songs,setSongs]=useState(initial);const [ready,setReady]=useState(false);const [sectionFilter,setSectionFilter]=useState("Todas");const [selected,setSelected]=useState("demo");const [tab,setTab]=useState(()=>location.hash.startsWith("#session=")?"sessions":"songs");const [query,setQuery]=useState("");const [draft,setDraft]=useState(null);const [raw,setRaw]=useState("");const [busy,setBusy]=useState("");const [error,setError]=useState("");const [shift,setShift]=useState(0);const [showChords,setShowChords]=useState(true);const [piano,setPiano]=useState(false);const [playing,setPlaying]=useState(false);const [tempo,setTempo]=useState(76);const [scrollRate,setScrollRate]=useState(2);
 const [fontSize,setFontSize]=useState(()=>{try{const saved=Number(localStorage.getItem("boscosong.font-size"));return Number.isFinite(saved)&&saved>=14&&saved<=42?saved:22;}catch{return 22;}});
 const [presentationMode,setPresentationMode]=useState(false);
 const scrollRef=useRef(null);const readerRef=useRef(null);const nativeFullscreenRef=useRef(false);const fileRef=useRef(null);const [sessions,setSessions]=useState(()=>{try{return JSON.parse(localStorage.getItem("boscosong.sessions"))||[]}catch{return[]}});const [sessionId,setSessionId]=useState(null);const [sessionContext,setSessionContext]=useState(null);const sessionSaveTimerRef=useRef(null);const sessionSavePendingRef=useRef(null);const sessionSaveQueueRef=useRef(Promise.resolve());const [sessionSaveState,setSessionSaveState]=useState("");const [cloudConfig,setCloudConfig]=useState(null);const [auth,setAuth]=useState(currentAuth);const [sharedState,setSharedState]=useState("Cargando cancionero compartido…");const [mobileLibraryOpen,setMobileLibraryOpen]=useState(false);const [showSessionPicker,setShowSessionPicker]=useState(false);const [showUsernameSetup,setShowUsernameSetup]=useState(false);const [sessionFocusId,setSessionFocusId]=useState(null);
 useEffect(()=>{
  let alive=true;
  (async()=>{
    let local=initial;
    try{
      const stored=await readSongs();
      if(Array.isArray(stored)&&stored.length)local=stored;
      else {const legacy=JSON.parse(localStorage.getItem(STORAGE)||"null");if(Array.isArray(legacy)&&legacy.length)local=legacy;}
    }catch{}
    if(!alive)return;setSongs(local);setReady(true);
    let config=null;
    try{config=await loadConfig();if(!alive)return;setCloudConfig(config);const logged=await finishLogin(config);if(alive)setAuth(logged);
    if(logged&&alive){
     try{
      const requested=sessionStorage.getItem("boscosong.authReturnSong");
      if(requested){
       sessionStorage.removeItem("boscosong.authReturnSong");
       setSelected(requested);setTab("songs");setShowSessionPicker(true);
      }
     }catch{}
    }if(location.hash.startsWith("#session=")&&alive)setTab("sessions");if(logged){try{const profile=await loadProfile(config);if(alive){setAuth(updateAuthProfile(profile));if(!profile.username)setShowUsernameSetup(true);}}catch(e){if(alive)setError("Perfil: "+e.message);}}}
    catch(e){if(alive)setError("Inicio de sesión: "+e.message);}
    try{
      const publicSongs=await loadPublicCatalog();
      let changes=[];
      if(config){try{changes=await loadChanges(config)}catch(e){if(alive)setError("No se pudieron cargar los cambios de AWS: "+e.message)}}
      if(!alive)return;
      const shared=applyChanges(publicSongs,changes);
      setSongs(shared);setSelected(id=>id==="demo"&&shared.length?shared[0].id:id);
      setSharedState("Biblioteca compartida: "+shared.length+" canciones");
    }catch(e){if(alive)setSharedState("Catálogo compartido no disponible; usando copia local.");}
    if(config){try{const items=await listSessions(config);if(alive)setSessions(items);}catch(e){if(alive)setError("Sesiones: "+e.message);}}
  })();
  return()=>{alive=false;};
 },[]);
 useEffect(()=>{if(ready)writeSongs(songs).catch(e=>setError("Error guardando copia local: "+e.message));},[songs,ready]);
 useEffect(()=>localStorage.setItem("boscosong.sessions",JSON.stringify(sessions)),[sessions]);
 const song=songs.find(s=>s.id===selected);const sections=useMemo(()=>[...new Set(songs.flatMap(s=>s.tags||[]))].sort((a,b)=>a.localeCompare(b,"es")),[songs]);const found=useMemo(()=>songs.filter(s=>(sectionFilter==="Todas"||(s.tags||[]).includes(sectionFilter))&&(s.title+" "+(s.lines||[]).map(l=>l.text).join(" ")+" "+(s.tags||[]).join(" ")).toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))),[songs,query,sectionFilter]);
 useEffect(()=>{if(song&&!sessionContext)setTempo(song.tempo||76)},[selected,sessionContext?.id,sessionContext?.index]);
 useEffect(()=>{
  if(!playing||tab!=="songs")return;
  let frame,lastTime=0,carry=0;
  const tick=now=>{
   if(lastTime&&scrollRef.current){
    const step=advanceScroll(carry,(now-lastTime)/1000,tempo,scrollRate);
    carry=step.carry;
    if(step.pixels>0){
     const el=scrollRef.current;
     el.scrollTop+=step.pixels;
     if(el.scrollHeight>el.clientHeight+1&&el.scrollTop>=el.scrollHeight-el.clientHeight-1){
      setPlaying(false);
      return;
     }
    }
   }
   lastTime=now;
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[playing,tempo,scrollRate,selected,tab]);
 useEffect(()=>{try{localStorage.setItem("boscosong.font-size",String(fontSize));}catch{}},[fontSize]);
 useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=0;},[selected]);
 useEffect(()=>{
  const onFullscreenChange=()=>{
   if(document.fullscreenElement===readerRef.current)nativeFullscreenRef.current=true;
   else if(nativeFullscreenRef.current){nativeFullscreenRef.current=false;setPresentationMode(false);}
  };
  const onKey=e=>{if(e.key==="Escape"&&presentationMode&&!document.fullscreenElement)setPresentationMode(false);};
  document.addEventListener("fullscreenchange",onFullscreenChange);
  document.addEventListener("keydown",onKey);
  return()=>{document.removeEventListener("fullscreenchange",onFullscreenChange);document.removeEventListener("keydown",onKey);};
 },[presentationMode]);
 function openPresentation(){
  setMobileLibraryOpen(false);setPresentationMode(true);
  const node=readerRef.current;
  if(node&&typeof node.requestFullscreen==="function"){
   try{const request=node.requestFullscreen();if(request&&typeof request.catch==="function")request.catch(()=>{});}catch{}
  }
 }
 function closePresentation(){
  setPresentationMode(false);
  if(document.fullscreenElement&&typeof document.exitFullscreen==="function"){
   try{const exit=document.exitFullscreen();if(exit&&typeof exit.catch==="function")exit.catch(()=>{});}catch{}
  }
 }

 const activeSession=sessionContext?sessions.find(x=>x.id===sessionContext.id):null;
 const sessionEntries=activeSession?.songs||[];
 const activeEntry=sessionContext?sessionEntries[sessionContext.index]:null;
 const sessionIsOwner=canManageSession(auth,activeSession);
 function openSessionSong(sessionId,index){
  const source=sessions.find(x=>x.id===sessionId);
  const entries=source?.songs||[];
  const entry=entries[index];
  if(!entry)return;
  setSessionContext({id:sessionId,index});
  setSessionSaveState("");
  setSelected(entry.songId);
  setShift(Number(entry.transpose)||0);
  setScrollRate(Number(entry.speed)||2);
  setTempo(Number(entry.tempo)||songs.find(x=>x.id===entry.songId)?.tempo||76);
  setMobileLibraryOpen(false);
  setPlaying(false);
  setTab("songs");
 }
 function openNeighbor(direction){
  if(!sessionContext||!activeSession)return;
  const target=sessionContext.index+direction;
  if(target>=0&&target<sessionEntries.length)openSessionSong(activeSession.id,target);
 }
 function scheduleSessionSetting(patch){
  if(!sessionContext||!sessionIsOwner||!cloudConfig)return;
  const session=sessionSavePendingRef.current?.id===activeSession?.id?sessionSavePendingRef.current:activeSession;
  if(!session||!Array.isArray(session.songs))return;
  const next={...session,songs:session.songs.map((entry,index)=>index===sessionContext.index?{...entry,...patch}:entry)};
  sessionSavePendingRef.current=next;
  setSessions(prev=>prev.map(item=>item.id===next.id?next:item));
  setSessionSaveState("Guardando ajustes…");
  clearTimeout(sessionSaveTimerRef.current);
  sessionSaveTimerRef.current=setTimeout(()=>{
   const payload=sessionSavePendingRef.current;
   sessionSavePendingRef.current=null;
   if(!payload)return;
   sessionSaveQueueRef.current=sessionSaveQueueRef.current.catch(()=>{}).then(()=>saveSession(cloudConfig,payload));
   sessionSaveQueueRef.current.then(()=>setSessionSaveState("Ajustes guardados")).catch(err=>{
    setSessionSaveState("No se guardaron los ajustes");
    setError("Error al guardar la sesión: "+err.message);
   });
  },850);
 }
 function changeTone(delta){
  const next=Math.max(-24,Math.min(24,shift+delta));
  setShift(next);scheduleSessionSetting({transpose:next});
 }
 function changeSpeed(rate){
  setScrollRate(rate);scheduleSessionSetting({speed:rate});
 }
 function changeTempo(bpm){
  const next=Math.min(240,Math.max(40,bpm));
  setTempo(next);scheduleSessionSetting({tempo:next});
 }
 async function persistFromPicker(session){
  if(session?.id&&sessionSavePendingRef.current?.id===session.id){
   clearTimeout(sessionSaveTimerRef.current);
   sessionSavePendingRef.current=null;
  }
  const task=sessionSaveQueueRef.current.catch(()=>{}).then(()=>saveSession(cloudConfig,session));
  sessionSaveQueueRef.current=task;
  return task;
 }
 async function refreshSessions(){
  if(!cloudConfig)return;
  try{setSessions(await listSessions(cloudConfig));}catch(e){setError("No se pudieron actualizar las sesiones: "+e.message);}
 }
 function authForCurrentSong(signup=false){
  if(!cloudConfig){setError("El acceso todavía no está disponible");return;}
  try{if(song?.id)sessionStorage.setItem("boscosong.authReturnSong",song.id);}catch{}
  beginLogin(cloudConfig,signup).catch(e=>setError(e.message));
 }
 function changeDisplayName(){if(!auth?.username)setShowUsernameSetup(true);}
 async function reserveUsername(username){
  if(!cloudConfig||!auth)throw new Error("Debes iniciar sesión para elegir un nombre.");
  const profile=await setProfile(cloudConfig,username);
  const updated=updateAuthProfile(profile);
  setAuth(updated);
  setShowUsernameSetup(false);
  return profile;
 }
 function requireUsername(){
  if(!auth){setError("Inicia sesión para crear canciones o sesiones.");return false;}
  if(!auth.username){setShowUsernameSetup(true);return false;}
  return true;
 }

 async function importCatalog(file){
  if(!file)return;
  if(!requireUsername()||!cloudConfig)return;
  setBusy("Preparando cancionero…");setError("");
  try{
    const d=JSON.parse(await file.text());
    const incoming=Array.isArray(d)?d:d.songs;
    if(!Array.isArray(incoming)||!incoming.length)throw Error("No hay canciones en el JSON.");
    const clean=incoming.filter(s=>typeof s.title==="string"&&Array.isArray(s.lines)).map(s=>({
      ...s,id:"usr-"+makeId(),category:s.category||"Misa",tags:Array.isArray(s.tags)?s.tags.filter(t=>!String(t).startsWith("@")):[],
      lines:s.lines.map(l=>({text:String(l.text||""),chords:Array.isArray(l.chords)?l.chords.filter(c=>Number.isFinite(c.index)&&typeof c.symbol==="string").map(c=>({index:Math.max(0,Math.min(c.index,String(l.text||"").length)),symbol:c.symbol})):[]}))
    }));
    if(!clean.length)throw Error("Ninguna canción válida.");
    setBusy("Publicando "+clean.length+" canciones en AWS…");
    const result=await saveSongBatch(cloudConfig,clean);
    if(result.count!==clean.length)throw Error("La publicación no se completó.");
    const uploaded=result.songs;
    setSongs(prev=>{const ids=new Set(uploaded.map(x=>x.id));return [...uploaded,...prev.filter(x=>!ids.has(x.id))]});
    setSelected(uploaded[0].id);setSectionFilter("Todas");setTab("songs");
    setSharedState("Publicadas "+clean.length+" canciones en AWS.");
  }catch(e){setError("No se pudo publicar el cancionero: "+e.message);}
  finally{setBusy("");}
 }
 function startNew(){if(!requireUsername())return;setDraft({id:"usr-"+makeId(),title:"",category:"Misa",tags:[],tempo:76,lines:[]});setRaw("");setError("");setTab("edit");}
 function editSong(s){if(!canManageSong(auth,s)){setError("Solo el autor de la canción puede editarla.");return;}setDraft(structuredClone(s));setRaw(s.lines.map(l=>{let t=l.text;for(const c of [...l.chords].sort((a,b)=>b.index-a.index))t=t.slice(0,c.index)+"["+c.symbol+"]"+t.slice(c.index);return t}).join("\n"));setTab("edit");}
 async function saveDraft(){
  if(!requireUsername()||!cloudConfig)return;
  if(!draft?.title.trim()){setError("Escribe un título para guardar.");return;}
  const saved={...draft,title:draft.title.trim(),lines:draft.lines||[]};
  setBusy("Guardando canción en AWS…");setError("");
  try{
    const stored=await saveSong(cloudConfig,saved);
    setSongs(prev=>[stored,...prev.filter(x=>x.id!==stored.id)]);
    setSelected(saved.id);setShift(0);setTab("songs");
    setSharedState("Canción publicada y disponible para todos.");
  }catch(e){setError("No se pudo guardar: "+e.message);}
  finally{setBusy("");}
 }
 function modifyLine(lineIndex,update){setDraft(d=>({...d,lines:d.lines.map((l,i)=>i===lineIndex?update(l):l)}));}
 function addChord(lineIndex,index){const symbol=prompt("Acorde en esta sílaba (por ejemplo: Am7):","C");if(!symbol)return;modifyLine(lineIndex,l=>({...l,chords:[...l.chords,{index,symbol:symbol.trim()}].sort((a,b)=>a.index-b.index)}));}
 function editChord(lineIndex,ch){const symbol=prompt("Editar acorde (vacío para eliminar)",ch.symbol);if(symbol===null)return;modifyLine(lineIndex,l=>({...l,chords:l.chords.flatMap(c=>c===ch?(symbol.trim()?[{...c,symbol:symbol.trim()}]:[]):[c])}));}
 async function importFile(file){
  if(!file)return;
  setError("");setBusy("Leyendo "+file.name+"…");
  try{
   let lines=[];
   if(file.name.toLowerCase().endsWith(".json")){
     const payload=JSON.parse(await file.text());
     if(typeof payload.title==="string"&&Array.isArray(payload.lines)){
       setDraft(d=>({...d,...payload,id:d?.id||"usr-"+makeId(),ownerSub:d?.ownerSub,ownerName:d?.ownerName}));
       lines=payload.lines;
     }else{await importCatalog(file);return;}
   }else if(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")){
     const pdfjs=await import("pdfjs-dist");
     const workerUrl=(await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
     pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
     const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
     const words=[];
     for(let pageIndex=1;pageIndex<=Math.min(pdf.numPages,30);pageIndex++){
       const page=await pdf.getPage(pageIndex),viewport=page.getViewport({scale:1});
       const content=await page.getTextContent();
       for(const item of content.items){
         if(!item.str?.trim())continue;
         const tokens=[...item.str.matchAll(/\S+/g)];
         const charWidth=(item.width||0)/Math.max(1,item.str.length);
         for(const token of tokens)words.push({
           text:token[0],x:item.transform[4]+(token.index||0)*charWidth,
           y:viewport.height-item.transform[5],
           width:Math.max(3,charWidth*token[0].length),
           height:Math.max(6,Math.abs(item.height||item.transform[3]||9)),page:pageIndex
         });
       }
     }
     lines=extractPositionedSong(words,{preserveColumns:true});
     if(!lines.length)throw new Error("El PDF no tiene texto seleccionable. Prueba una imagen de la página.");
   }else if(file.type.startsWith("image/")){
     setBusy("Reconociendo la imagen y localizando acordes…");
     const tesseract=await import("tesseract.js");
     const bitmap=await createImageBitmap(file);
     const widthFactor=Math.max(1,Math.min(2.6,2500/Math.max(bitmap.width,bitmap.height)));
     const canvas=document.createElement("canvas");
     canvas.width=Math.round(bitmap.width*widthFactor);
     canvas.height=Math.round(bitmap.height*widthFactor);
     const ctx=canvas.getContext("2d",{willReadFrequently:true});
     ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);
     ctx.filter="grayscale(1) contrast(145%)";ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
     bitmap.close();
     const worker=await tesseract.createWorker("spa+eng");
     try{
       const recognized=await worker.recognize(canvas,{}, {text:true,blocks:true});
       const toWords=(r)=>{
         const blocks=r.data?.blocks;
         const nested=Array.isArray(blocks)?blocks.flatMap(block=>(block.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(line=>line.words||[]))):[];
         const words=Array.isArray(r.data?.words)?r.data.words:nested;
         return words.filter(w=>w.bbox&&Number(w.confidence??w.conf??100)>25).map(w=>({
           text:w.text||"",x:w.bbox.x0,y:w.bbox.y0,
           width:w.bbox.x1-w.bbox.x0,height:w.bbox.y1-w.bbox.y0
         }));
       };
       lines=extractPositionedSong(toWords(recognized));
       const chordCount=lines.reduce((n,l)=>n+(l.chords||[]).length,0);
       if(chordCount===0){
         setBusy("Comprobando acordes con una segunda lectura OCR…");
         await worker.setParameters({tessedit_pageseg_mode:"6"});
         const second=await worker.recognize(canvas);
         const alternate=extractPositionedSong(toWords(second));
         if(alternate.reduce((n,l)=>n+(l.chords||[]).length,0)>chordCount)lines=alternate;
         if(!lines.length)lines=parseBracketedText(second.data.text||recognized.data.text||"");
       }
     }finally{await worker.terminate();}
   }else lines=parseBracketedText(await file.text());
   setDraft(d=>({...d,title:d.title||file.name.replace(/\.[^.]+$/,""),lines,reviewStatus:"pendiente"}));
   setRaw(lines.map(l=>{let t=l.text;for(const c of [...(l.chords||[])].sort((a,b)=>b.index-a.index))t=t.slice(0,c.index)+"["+c.symbol+"]"+t.slice(c.index);return t}).join("\n"));
   if(!lines.length)setError("No se detectó contenido legible en este archivo.");
  }catch(e){setError("No se pudo importar: "+e.message);}
  finally{setBusy("");if(fileRef.current)fileRef.current.value="";}
 }
 function exportCatalog(){const a=document.createElement("a"),url=URL.createObjectURL(new Blob([JSON.stringify({version:1,songs},null,2)],{type:"application/json"}));a.href=url;a.download="boscosong-cancionero-guardado.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function exportSong(){if(!song)return;const output={...song,exportedAt:new Date().toISOString()};const a=document.createElement("a");const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:"application/json"}));a.href=url;a.download=song.title.replace(/[^\w-]+/g,"_")+".json";a.click();URL.revokeObjectURL(url);}

 return <div className="shell"><header><button className="brand" onClick={()=>setTab("songs")}><span className="brandIcon"><Music2 size={24}/></span><span><strong>BoscoSong</strong><small>Tu cancionero, a tu tono</small></span></button><nav><button className={tab==="songs"?"current":""} onClick={()=>{setTab("songs");setSessionContext(null);}}><BookOpen size={17}/>Canciones</button><button className={tab==="sessions"?"current":""} onClick={()=>setTab("sessions")}><Music2 size={17}/>Sesiones</button><button className={tab==="edit"?"current":""} onClick={startNew} disabled={!auth} title={auth?"Nueva canción":"Requiere iniciar sesión"}><Plus size={17}/>Nueva canción</button></nav><div className="authControls">{auth?<>{auth.username?<span className="authProfile" title="Nombre de usuario único">@{auth.username}</span>:<button className="authProfile" title="Elegir tu nombre de usuario" onClick={changeDisplayName}>Elegir @usuario</button>}<button className="subtle" onClick={()=>setAuth(logout())}>Salir</button></>:cloudConfig?<><button className="subtle" onClick={()=>beginLogin(cloudConfig,true).catch(e=>setError(e.message))}>Crear cuenta</button><button className="primary" onClick={()=>beginLogin(cloudConfig).catch(e=>setError(e.message))}>Entrar</button></>:<span className="authName">Solo lectura</span>}</div></header>
 {tab==="songs"&&<main className="layout"><aside className={mobileLibraryOpen?"libraryOpen":""}><button type="button" className="mobileLibraryToggle" aria-expanded={mobileLibraryOpen} aria-controls="mobile-library-panel" onClick={()=>setMobileLibraryOpen(v=>!v)}><Search size={16}/><span>Buscar canciones</span><span className="mobileLibraryCount">{songs.length}</span><span className="mobileLibraryChevron">{mobileLibraryOpen?"✕":"⌄"}</span></button><div id="mobile-library-panel" className="mobileLibraryPanel"><div className="asideHead"><h2>Cancionero <span>{songs.length}</span></h2><button className="iconButton" disabled={!auth} title={auth?"Nueva canción":"Inicia sesión para crear canciones"} onClick={startNew}><Plus size={19}/></button></div><label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Título, letra o etiqueta…"/></label><label className="search"><BookOpen size={17}/><select aria-label="Filtrar por sección" value={sectionFilter} onChange={e=>setSectionFilter(e.target.value)}><option value="Todas">Todas las secciones</option>{sections.map(c=><option key={c} value={c}>{c}</option>)}</select></label><div className="hint">{found.length} canciones encontradas {found.length>250?"· mostrando 250":""}</div><div className="songList">{found.slice(0,250).map(s=><button key={s.id} className={"songItem "+(selected===s.id?"selected":"")} onClick={()=>{setSelected(s.id);setPlaying(false);setShift(0);setMobileLibraryOpen(false);setSessionContext(null)}}><strong>{s.title}</strong><small>{s.category} · {s.tags.join(", ")||"Sin etiquetas"}</small></button>)}{!found.length&&<p className="hint">No se encontraron canciones.</p>}</div><label className={"primary full importButton "+(!auth?"importDisabled":"")}><Upload size={17}/>Publicar cancionero JSON<input type="file" disabled={!auth} accept=".json,application/json" hidden onChange={e=>{importCatalog(e.target.files?.[0]);e.target.value=""}}/></label><button className="subtle full" onClick={exportCatalog}><Download size={17}/>Exportar cancionero JSON</button><button className="secondary full" disabled={!auth} onClick={startNew}><Plus size={17}/>Añadir canción</button><span className="hint">{sharedState}</span>{busy&&<span className="hint">{busy}</span>}{error&&<span className="error">{error}</span>}</div></aside><section className={"reader"+(presentationMode?" presentationMode":"")} ref={readerRef} style={{"--song-font-size":fontSize+"px"}}>{song?<>{presentationMode&&<div className="presentationControls" role="toolbar" aria-label="Controles de pantalla completa"><div className="transpose"><button type="button" onClick={()=>changeTone(-1)} aria-label="Bajar medio tono"><Minus size={18}/></button><strong>{shift===0?"Tono original":(shift>0?"+":"")+(shift/2)+" tonos"}</strong><button type="button" onClick={()=>changeTone(1)} aria-label="Subir medio tono"><Plus size={18}/></button></div><button type="button" className="presentationPlay" aria-label={playing?"Pausar desplazamiento":"Iniciar desplazamiento"} onClick={()=>setPlaying(v=>!v)}>{playing?<Pause size={19}/>:<Play size={19}/>}</button><SpeedControl rate={scrollRate} onChange={changeSpeed} compact/>{sessionContext&&<div className="presentationSessionNav"><button type="button" disabled={sessionContext.index===0} onClick={()=>openNeighbor(-1)} title="Canción anterior" aria-label="Canción anterior"><ChevronLeft size={19}/></button><span>{sessionContext.index+1}/{sessionEntries.length}</span><button type="button" disabled={sessionContext.index>=sessionEntries.length-1} onClick={()=>openNeighbor(1)} title="Siguiente canción" aria-label="Siguiente canción"><ChevronRight size={19}/></button></div>}<button type="button" className="presentationExit" onClick={closePresentation} aria-label="Salir de pantalla completa" title="Salir de pantalla completa"><Minimize2 size={19}/></button></div>}<div className="readerHead"><div><span className="eyebrow">{song.category} {song.tags.length?" · "+song.tags.join(" · "):""}</span><h1>{song.title}</h1>{song.reviewStatus==="sin contenido"&&<p className="reviewNotice">Esta ficha aparece en el índice, pero todavía no tiene letra completa.</p>}</div><div className="actions"><button className="addToSessionButton" type="button" onClick={()=>setShowSessionPicker(true)} title="Añadir esta canción a una sesión" aria-label="Añadir canción a una sesión"><Plus size={17}/>Añadir a sesión</button><button title={canManageSong(auth,song)?"Editar mi canción":"Solo el autor puede editar esta canción"} disabled={!canManageSong(auth,song)} onClick={()=>editSong(song)}><NotebookPen size={17}/>Editar</button><button title="Exportar JSON" onClick={exportSong}><Download size={17}/>Exportar</button><button type="button" className="fullscreenToggle" title="Ver canción a pantalla completa" aria-label="Ver canción a pantalla completa" onClick={openPresentation}><Maximize2 size={17}/>Pantalla completa</button></div></div>{sessionContext&&activeSession&&<div className="sessionNavigation"><button type="button" className="subtle sessionBack" onClick={()=>{setTab("sessions");setPlaying(false);}}><ChevronLeft size={15}/>Sesión</button><div className="sessionNavigationName"><strong>{activeSession.title}</strong><span> · {sessionContext.index+1} de {sessionEntries.length} · @{activeSession.ownerName||"Usuario"}{sessionIsOwner&&sessionSaveState?" · "+sessionSaveState:""}</span></div><button type="button" disabled={sessionContext.index===0} onClick={()=>openNeighbor(-1)} title="Canción anterior" aria-label="Canción anterior"><ChevronLeft size={17}/></button><button type="button" disabled={sessionContext.index===sessionEntries.length-1} onClick={()=>openNeighbor(1)} title="Siguiente canción" aria-label="Siguiente canción"><ChevronRight size={17}/></button></div>}<div className="toolbar"><label className="switch"><input type="checkbox" checked={showChords} onChange={e=>setShowChords(e.target.checked)}/> Acordes</label><label className="switch"><input type="checkbox" checked={piano} onChange={e=>setPiano(e.target.checked)}/> Piano</label><span className="toolbarSeparator"/><div className="transpose"><span>Transportar</span><button onClick={()=>changeTone(-1)} aria-label="Bajar medio tono"><Minus size={17}/></button><strong>{shift>0?"+":""}{shift===0?"Original":shift/2+" tono(s)"}</strong><button onClick={()=>changeTone(1)} aria-label="Subir medio tono"><Plus size={17}/></button></div><button className="subtle" onClick={()=>{setShift(0);scheduleSessionSetting({transpose:0});}}>Restablecer</button><div className="fontControls" aria-label="Tamaño de letra"><span>Letra</span><button type="button" aria-label="Reducir tamaño de letra" title="Letra más pequeña" disabled={fontSize<=14} onClick={()=>setFontSize(x=>Math.max(14,x-2))}>A−</button><strong>{fontSize}px</strong><button type="button" aria-label="Aumentar tamaño de letra" title="Letra más grande" disabled={fontSize>=42} onClick={()=>setFontSize(x=>Math.min(42,x+2))}>A+</button></div></div><div className="songScroll" ref={scrollRef}><div className="lyrics">{song.lines.map((l,i)=><ChordLine key={i} line={l} shift={shift} showChords={showChords}/>)}</div>{piano&&<div className="pianoSection"><h3>Guía de piano</h3><div className="pianoCards">{[...new Set(song.lines.flatMap(l=>l.chords.map(c=>transposeChord(c.symbol,shift))))].slice(0,12).map((ch,i)=><PianoKeys key={i} symbol={ch}/>)}</div></div>}</div><footer className="playback"><button className="play" onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={20}/>:<Play size={20}/>}</button><label>Tempo <strong>{tempo} BPM</strong><input type="range" min="40" max="220" value={tempo} onChange={e=>changeTempo(+e.target.value)}/></label><SpeedControl rate={scrollRate} onChange={changeSpeed}/><span className="hint">Scroll orientativo; no sincroniza sílabas</span></footer></>:<div className="empty">Selecciona una canción</div>}</section></main>}
 {tab==="edit"&&draft&&<main className="editor"><div className="editTitle"><div><span className="eyebrow">Editor de canciones</span><h1>{draft.title||"Nueva canción"}</h1><p>Importa un archivo y revisa los acordes. Pulsa sobre una letra para situar un acorde justo en esa posición.</p></div><button className="subtle" onClick={()=>setTab("songs")}><ChevronLeft size={16}/>Volver</button></div><div className="formGrid"><label>Título<input value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))} placeholder="Título de la canción"/></label><label>Categoría<select value={draft.category} onChange={e=>setDraft(d=>({...d,category:e.target.value}))}><option>Misa</option><option>Otra</option><option>Sin clasificar</option></select></label><label>Etiquetas (separadas por comas)<input value={draft.tags.join(", ")} onChange={e=>setDraft(d=>({...d,tags:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)}))} placeholder="Entrada, Comunión…"/></label><label>BPM<input type="number" min="40" max="240" value={draft.tempo} onChange={e=>setDraft(d=>({...d,tempo:Number(e.target.value)||76}))}/></label></div><div className="importBox"><Upload size={22}/><div><strong>Importar PDF, imagen o texto</strong><p>PDF con texto, PNG/JPG con OCR o TXT con acordes. Revisa el resultado antes de guardar.</p></div><input ref={fileRef} aria-label="Seleccionar archivo" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,text/plain,application/pdf,image/*" onChange={e=>importFile(e.target.files?.[0])}/></div>{busy&&<p className="notice">{busy}</p>}{error&&<p className="error">{error}</p>}<div className="editColumns"><div className="editPanel"><h3>Texto con acordes</h3><p className="hint">Escribe <code>[Am]Aleluya</code> para anclar un acorde. Al pulsar «Aplicar texto», se reconstruye la vista previa.</p><textarea value={raw} onChange={e=>setRaw(e.target.value)} spellCheck={false} placeholder="[C]Cantamos con [G]alegría…" rows="14"/><button className="secondary" onClick={()=>setDraft(d=>({...d,lines:parseBracketedText(raw)}))}>Aplicar texto</button></div><div className="editPanel"><h3>Revisión de sílabas y acordes</h3><p className="hint">Pulsa en cualquier carácter para añadir un acorde. Pulsa sobre un acorde azul para cambiarlo o borrarlo.</p><div className="previewLyrics">{draft.lines.map((l,i)=><ChordLine key={i} line={l} shift={0} showChords editable onAdd={index=>addChord(i,index)} onEdit={ch=>editChord(i,ch)}/>)}</div></div></div><div className="editorActions"><button className="dangerText" onClick={async()=>{if(!canManageSong(auth,draft)||!cloudConfig){setError("Solo el autor puede borrar esta canción.");return;}if(!window.confirm("¿Eliminar esta canción del catálogo compartido para todos los usuarios?"))return;setBusy("Eliminando canción…");try{await deleteSong(cloudConfig,draft.id);setSongs(p=>p.filter(x=>x.id!==draft.id));setSelected(null);setTab("songs");}catch(e){setError("No se pudo eliminar: "+e.message)}finally{setBusy("")}}}><Trash2 size={17}/>Eliminar</button><button className="primary" disabled={!!busy} onClick={saveDraft}><Save size={17}/>Guardar y publicar</button></div></main>}
 {tab==="sessions"&&<SessionsPanel songs={songs} sessions={sessions} onChange={setSessions} onOpenSong={openSessionSong} auth={auth} config={cloudConfig} onRefresh={refreshSessions} focusSessionId={sessionFocusId} onRequireUsername={()=>setShowUsernameSetup(true)}/>}
 {showUsernameSetup&&auth&&!auth.username&&<UsernameSetup onClose={()=>setShowUsernameSetup(false)} onSubmit={reserveUsername}/>}
 {showSessionPicker&&song&&<AddToSession
  song={song} auth={auth} config={cloudConfig} sessions={sessions}
  transpose={shift} speed={scrollRate} tempo={tempo}
  onClose={()=>setShowSessionPicker(false)}
  onLogin={()=>authForCurrentSong(false)}
  onSignup={()=>authForCurrentSong(true)}
  onRequireUsername={()=>{setShowSessionPicker(false);setShowUsernameSetup(true);}}
  onPersistSession={persistFromPicker}
  onSaved={stored=>setSessions(previous=>[stored,...previous.filter(x=>x.id!==stored.id)])}
  onViewSession={id=>{setShowSessionPicker(false);setSessionFocusId(id);setSessionContext(null);setTab("sessions");setPlaying(false);}}
 />}
 </div>}
class ErrorBoundary extends React.Component {
 constructor(props){super(props);this.state={error:null};}
 static getDerivedStateFromError(error){return {error};}
 componentDidCatch(error,info){console.error("BoscoSong startup error",error,info);}
 render(){return this.state.error
   ? <main style={{maxWidth:680,margin:"10vh auto",padding:24,fontFamily:"Montserrat, sans-serif",color:"#24533e"}}>
       <h1>BoscoSong</h1><h2>No se pudo iniciar el cancionero</h2>
       <p>La aplicación ha encontrado un problema. Vuelve a cargar la página o informa de este error.</p>
       <pre style={{whiteSpace:"pre-wrap",fontSize:13}}>{String(this.state.error?.message||this.state.error)}</pre>
       <button onClick={()=>location.reload()}>Recargar</button>
     </main>
   : this.props.children;}
}
createRoot(document.getElementById("root")).render(<ErrorBoundary><App/></ErrorBoundary>);
