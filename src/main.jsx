import React,{useEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {Music2,Search,Plus,Upload,ChevronLeft,Save,Trash2,Play,Pause,Minus,Download,BookOpen,NotebookPen,FileText,Piano,Copy} from "lucide-react";
import "./style.css";
import {readSongs,writeSongs} from "./storage.js";
import {transposeChord,chordTones} from "./music.js";
import {extractPositionedSong,parseBracketedText} from "./importer.js";
import SessionsPanel from "./SessionsPanel.jsx";
import {loadConfig,loadPublicCatalog,loadChanges,applyChanges,currentAuth,finishLogin,beginLogin,logout,saveSong,saveSongBatch,deleteSong} from "./cloud.js";


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
function ChordLine({line,shift,showChords,onAdd,onEdit,editable=false}){const chars=[...line.text];const grouped=new Map();for(const ch of line.chords||[]){const idx=Math.min(Math.max(ch.index,0),chars.length);if(!grouped.has(idx))grouped.set(idx,[]);grouped.get(idx).push(ch);}return <div className={"songLine "+(!line.text?"blankLine":"")}><div className="lineGlyphs">{Array.from({length:chars.length+1},(_,i)=><span className="glyph" key={i}>{showChords&&grouped.has(i)&&<span className="chordColumn">{grouped.get(i).map((ch,n)=><button key={n} className="chord" onClick={()=>editable&&onEdit(ch)} title={editable?"Editar acorde":transposeChord(ch.symbol,shift)}>{transposeChord(ch.symbol,shift)}</button>)}</span>}{i<chars.length?<span className={editable?"editableChar":""} onClick={()=>editable&&onAdd(i)}>{chars[i]===" "?"\u00a0":chars[i]}</span>:editable?<button className="endAnchor" onClick={()=>onAdd(i)}>+</button>:null}</span>)}</div></div>;}
function makeId(){return globalThis.crypto?.randomUUID?.()||Date.now()+"-"+Math.random();}
function App(){const [songs,setSongs]=useState(initial);const [ready,setReady]=useState(false);const [sectionFilter,setSectionFilter]=useState("Todas");const [selected,setSelected]=useState("demo");const [tab,setTab]=useState(()=>location.hash.startsWith("#session=")?"sessions":"songs");const [query,setQuery]=useState("");const [draft,setDraft]=useState(null);const [raw,setRaw]=useState("");const [busy,setBusy]=useState("");const [error,setError]=useState("");const [shift,setShift]=useState(0);const [showChords,setShowChords]=useState(true);const [piano,setPiano]=useState(false);const [playing,setPlaying]=useState(false);const [tempo,setTempo]=useState(76);const [scrollRate,setScrollRate]=useState(2);const scrollRef=useRef(null);const fileRef=useRef(null);const [sessions,setSessions]=useState(()=>{try{return JSON.parse(localStorage.getItem("boscosong.sessions"))||[]}catch{return[]}});const [sessionId,setSessionId]=useState(null);const [cloudConfig,setCloudConfig]=useState(null);const [auth,setAuth]=useState(currentAuth);const [sharedState,setSharedState]=useState("Cargando cancionero compartido…");
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
    try{config=await loadConfig();if(!alive)return;setCloudConfig(config);setAuth(await finishLogin(config));}
    catch(e){if(alive)setError("Inicio de sesión: "+e.message);}
    try{
      const publicSongs=await loadPublicCatalog();
      let changes=[];
      if(config){try{changes=await loadChanges(config)}catch(e){if(alive)setError("No se pudieron cargar los cambios de AWS: "+e.message)}}
      if(!alive)return;
      const shared=applyChanges(publicSongs,changes);
      const known=new Set(shared.map(x=>x.id));
      const extras=local.filter(x=>!known.has(x.id)&&!changes.some(ch=>ch.deleted&&ch.id===x.id));
      setSongs([...shared,...extras]);setSelected(id=>id==="demo"&&shared.length?shared[0].id:id);
      setSharedState("Biblioteca compartida: "+shared.length+" canciones");
    }catch(e){if(alive)setSharedState("Catálogo compartido no disponible; usando copia local.");}
  })();
  return()=>{alive=false;};
 },[]);
 useEffect(()=>{if(ready)writeSongs(songs).catch(e=>setError("Error guardando copia local: "+e.message));},[songs,ready]);
 useEffect(()=>localStorage.setItem("boscosong.sessions",JSON.stringify(sessions)),[sessions]);
 const song=songs.find(s=>s.id===selected);const sections=useMemo(()=>[...new Set(songs.flatMap(s=>s.tags||[]))].sort((a,b)=>a.localeCompare(b,"es")),[songs]);const found=useMemo(()=>songs.filter(s=>(sectionFilter==="Todas"||(s.tags||[]).includes(sectionFilter))&&(s.title+" "+(s.lines||[]).map(l=>l.text).join(" ")+" "+(s.tags||[]).join(" ")).toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))),[songs,query,sectionFilter]);
 useEffect(()=>{if(song)setTempo(song.tempo||76)},[selected]);
 useEffect(()=>{if(!playing)return;let frame,last;const tick=t=>{if(last&&scrollRef.current)scrollRef.current.scrollTop+=(t-last)/1000*(tempo/60)*scrollRate*12;last=t;frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame)},[playing,tempo,scrollRate]);
 async function importCatalog(file){if(!file)return;setBusy("Cargando cancionero…");setError("");try{const data=JSON.parse(await file.text());const incoming=Array.isArray(data)?data:data.songs;if(!Array.isArray(incoming)||!incoming.length)throw new Error("El archivo no contiene una lista de canciones.");const clean=incoming.filter(s=>typeof s.title==="string"&&Array.isArray(s.lines)).map(s=>({...s,id:String(s.id||makeId()),category:s.category||"Misa",tags:Array.isArray(s.tags)?s.tags:[],lines:s.lines.map(l=>({text:String(l.text||""),chords:Array.isArray(l.chords)?l.chords.filter(c=>Number.isFinite(c.index)&&typeof c.symbol==="string").map(c=>({index:Math.max(0,Math.min(c.index,String(l.text||"").length)),symbol:c.symbol})):[]}))}));if(!clean.length)throw new Error("Ninguna canción tiene un formato válido.");setSongs(previous=>{const ids=new Set(clean.map(s=>s.id));return [...clean,...previous.filter(s=>!ids.has(s.id))]});setSelected(clean[0].id);setSectionFilter("Todas");setTab("songs");alert("Importadas "+clean.length+" canciones. Revisa la alineación de los acordes antes de utilizarlas.");}catch(e){setError("No se pudo importar el cancionero: "+e.message);alert("No se pudo importar el cancionero: "+e.message)}finally{setBusy("")}}
 function startNew(){setDraft({id:makeId(),title:"",category:"Misa",tags:[],tempo:76,lines:[]});setRaw("");setError("");setTab("edit");}
 function editSong(s){setDraft(structuredClone(s));setRaw(s.lines.map(l=>{let t=l.text;for(const c of [...l.chords].sort((a,b)=>b.index-a.index))t=t.slice(0,c.index)+"["+c.symbol+"]"+t.slice(c.index);return t}).join("\n"));setTab("edit");}
 function saveDraft(){if(!draft?.title.trim()){setError("Escribe un título para guardar.");return;}const saved={...draft,title:draft.title.trim(),lines:draft.lines||[]};setSongs(prev=>[saved,...prev.filter(s=>s.id!==saved.id)]);setSelected(saved.id);setShift(0);setError("");setTab("songs");}
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
       setDraft(d=>({...d,...payload,id:d?.id||makeId()}));
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

 return <div className="shell"><header><button className="brand" onClick={()=>setTab("songs")}><span className="brandIcon"><Music2 size={24}/></span><span><strong>BoscoSong</strong><small>Tu cancionero, a tu tono</small></span></button><nav><button className={tab==="songs"?"current":""} onClick={()=>setTab("songs")}><BookOpen size={17}/>Canciones</button><button className={tab==="sessions"?"current":""} onClick={()=>setTab("sessions")}><Music2 size={17}/>Sesiones</button><button className={tab==="edit"?"current":""} onClick={startNew}><Plus size={17}/>Nueva canción</button></nav></header>
 {tab==="songs"&&<main className="layout"><aside><div className="asideHead"><h2>Cancionero <span>{songs.length}</span></h2><button className="iconButton" title="Nueva canción" onClick={startNew}><Plus size={19}/></button></div><label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Título, letra o etiqueta…"/></label><label className="search"><BookOpen size={17}/><select aria-label="Filtrar por sección" value={sectionFilter} onChange={e=>setSectionFilter(e.target.value)}><option value="Todas">Todas las secciones</option>{sections.map(c=><option key={c} value={c}>{c}</option>)}</select></label><div className="hint">{found.length} canciones encontradas {found.length>250?"· mostrando 250":""}</div><div className="songList">{found.slice(0,250).map(s=><button key={s.id} className={"songItem "+(selected===s.id?"selected":"")} onClick={()=>{setSelected(s.id);setPlaying(false);setShift(0)}}><strong>{s.title}</strong><small>{s.category} · {s.tags.join(", ")||"Sin etiquetas"}</small></button>)}{!found.length&&<p className="hint">No se encontraron canciones.</p>}</div><label className="primary full importButton"><Upload size={17}/>Importar cancionero JSON<input type="file" accept=".json,application/json" hidden onChange={e=>{importCatalog(e.target.files?.[0]);e.target.value=""}}/></label><button className="subtle full" onClick={exportCatalog}><Download size={17}/>Exportar cancionero JSON</button><button className="secondary full" onClick={startNew}><Plus size={17}/>Añadir canción</button>{busy&&<span className="hint">{busy}</span>}</aside><section className="reader">{song?<><div className="readerHead"><div><span className="eyebrow">{song.category} {song.tags.length?" · "+song.tags.join(" · "):""}</span><h1>{song.title}</h1>{song.reviewStatus&&<p className="reviewNotice">{song.reviewStatus==="sin contenido"?"Esta ficha aparece en el índice, pero no se pudo extraer su letra.":"Extracción automática pendiente de revisión."} {song.sourcePages?.length?" · PDF página "+song.sourcePages.join(", "):""} {song.reviewStatus==="pendiente"?"Comprueba los acordes frente al original.":""}</p>}</div><div className="actions"><button title="Editar letra y acordes" onClick={()=>editSong(song)}><NotebookPen size={17}/>Editar</button><button title="Exportar JSON" onClick={exportSong}><Download size={17}/>Exportar</button></div></div><div className="toolbar"><label className="switch"><input type="checkbox" checked={showChords} onChange={e=>setShowChords(e.target.checked)}/> Acordes</label><label className="switch"><input type="checkbox" checked={piano} onChange={e=>setPiano(e.target.checked)}/> Piano</label><span className="toolbarSeparator"/><div className="transpose"><span>Transportar</span><button onClick={()=>setShift(s=>s-1)} aria-label="Bajar medio tono"><Minus size={17}/></button><strong>{shift>0?"+":""}{shift===0?"Original":shift/2+" tono(s)"}</strong><button onClick={()=>setShift(s=>s+1)} aria-label="Subir medio tono"><Plus size={17}/></button></div><button className="subtle" onClick={()=>setShift(0)}>Restablecer</button></div><div className="songScroll" ref={scrollRef}><div className="lyrics">{song.lines.map((l,i)=><ChordLine key={i} line={l} shift={shift} showChords={showChords}/>)}</div>{piano&&<div className="pianoSection"><h3>Guía de piano</h3><div className="pianoCards">{[...new Set(song.lines.flatMap(l=>l.chords.map(c=>transposeChord(c.symbol,shift))))].slice(0,12).map((ch,i)=><PianoKeys key={i} symbol={ch}/>)}</div></div>}</div><footer className="playback"><button className="play" onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={20}/>:<Play size={20}/>}</button><label>Tempo <strong>{tempo} BPM</strong><input type="range" min="40" max="220" value={tempo} onChange={e=>setTempo(+e.target.value)}/></label><label>Desplazamiento <strong>{scrollRate.toFixed(1)}×</strong><input type="range" min=".5" max="5" step=".5" value={scrollRate} onChange={e=>setScrollRate(+e.target.value)}/></label><span className="hint">Scroll orientativo; no sincroniza sílabas</span></footer></>:<div className="empty">Selecciona una canción</div>}</section></main>}
 {tab==="edit"&&draft&&<main className="editor"><div className="editTitle"><div><span className="eyebrow">Editor de canciones</span><h1>{draft.title||"Nueva canción"}</h1><p>Importa un archivo y revisa los acordes. Pulsa sobre una letra para situar un acorde justo en esa posición.</p></div><button className="subtle" onClick={()=>setTab("songs")}><ChevronLeft size={16}/>Volver</button></div><div className="formGrid"><label>Título<input value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))} placeholder="Título de la canción"/></label><label>Categoría<select value={draft.category} onChange={e=>setDraft(d=>({...d,category:e.target.value}))}><option>Misa</option><option>Otra</option><option>Sin clasificar</option></select></label><label>Etiquetas (separadas por comas)<input value={draft.tags.join(", ")} onChange={e=>setDraft(d=>({...d,tags:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)}))} placeholder="Entrada, Comunión…"/></label><label>BPM<input type="number" min="40" max="240" value={draft.tempo} onChange={e=>setDraft(d=>({...d,tempo:Number(e.target.value)||76}))}/></label></div><div className="importBox"><Upload size={22}/><div><strong>Importar PDF, imagen o texto</strong><p>PDF con texto, PNG/JPG con OCR o TXT con acordes. Revisa el resultado antes de guardar.</p></div><input ref={fileRef} aria-label="Seleccionar archivo" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,text/plain,application/pdf,image/*" onChange={e=>importFile(e.target.files?.[0])}/></div>{busy&&<p className="notice">{busy}</p>}{error&&<p className="error">{error}</p>}<div className="editColumns"><div className="editPanel"><h3>Texto con acordes</h3><p className="hint">Escribe <code>[Am]Aleluya</code> para anclar un acorde. Al pulsar «Aplicar texto», se reconstruye la vista previa.</p><textarea value={raw} onChange={e=>setRaw(e.target.value)} spellCheck={false} placeholder="[C]Cantamos con [G]alegría…" rows="14"/><button className="secondary" onClick={()=>setDraft(d=>({...d,lines:parseBracketedText(raw)}))}>Aplicar texto</button></div><div className="editPanel"><h3>Revisión de sílabas y acordes</h3><p className="hint">Pulsa en cualquier carácter para añadir un acorde. Pulsa sobre un acorde azul para cambiarlo o borrarlo.</p><div className="previewLyrics">{draft.lines.map((l,i)=><ChordLine key={i} line={l} shift={0} showChords editable onAdd={index=>addChord(i,index)} onEdit={ch=>editChord(i,ch)}/>)}</div></div></div><div className="editorActions"><button className="dangerText" onClick={()=>{if(window.confirm("¿Eliminar esta canción del navegador?")){setSongs(p=>p.filter(s=>s.id!==draft.id));setSelected("demo");setTab("songs")}}}><Trash2 size={17}/>Eliminar</button><button className="primary" onClick={saveDraft}><Save size={17}/>Guardar canción</button></div></main>}
 {tab==="sessions"&&<SessionsPanel songs={songs} sessions={sessions} onChange={setSessions} onOpenSong={(id)=>{setSelected(id);setShift(0);setPlaying(false);setTab("songs");}}/>}
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
