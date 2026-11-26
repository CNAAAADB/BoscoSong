import React,{useState} from "react";
import {AtSign,CheckCircle2,LockKeyhole,X} from "lucide-react";
import {normalizeUsername,validateUsername} from "./username.js";

export default function UsernameSetup({onSubmit,onClose}){
 const [value,setValue]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const validation=validateUsername(value);
 const save=async(e)=>{
  e.preventDefault();
  if(!validation.valid||busy)return;
  setBusy(true);setError("");
  try{await onSubmit(normalizeUsername(value));}
  catch(err){setError(err.message||"No se pudo guardar el nombre de usuario.");}
  finally{setBusy(false);}
 };
 return <div className="usernameBackdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section className="usernameDialog" role="dialog" aria-modal="true" aria-labelledby="username-dialog-title">
   <div className="usernameDialogHeader"><span className="usernameAvatar"><AtSign size={23}/></span><button type="button" className="usernameClose" onClick={onClose} aria-label="Cerrar"><X size={19}/></button></div>
   <span className="eyebrow">TU IDENTIDAD EN BOSCOSONG</span>
   <h2 id="username-dialog-title">Elige tu nombre de usuario</h2>
   <p>Será tu etiqueta en las canciones y sesiones que crees. Cada nombre es único y quedará vinculado a tu cuenta.</p>
   <form onSubmit={save}>
    <label htmlFor="unique-username-input">Nombre de usuario</label>
    <div className="usernameInputGroup"><span>@</span><input id="unique-username-input" autoFocus autoCapitalize="none" autoComplete="off" spellCheck={false}
      maxLength={24} value={value} onChange={e=>{setValue(e.target.value);setError("");}} placeholder="p. ej. coromaria" aria-invalid={Boolean(error)||Boolean(value&&!validation.valid)}/></div>
    <p className={"usernameHint"+(value&&!validation.valid?" usernameHintError":"")}>{value?validation.message:"3 a 24 caracteres · letras, números y guion bajo · se admiten ñ y tildes"}</p>
    {error&&<p className="usernameError" role="alert">{error}</p>}
    <div className="usernameExample"><CheckCircle2 size={17}/><span>Las canciones nuevas llevarán la etiqueta <strong>@{validation.username||"tuusuario"}</strong>.</span></div>
    <p className="usernamePermanent"><LockKeyhole size={15}/>Una vez elegido, el nombre no se podrá cambiar para mantener las etiquetas de autor.</p>
    <button type="submit" className="primary usernameSubmit" disabled={!validation.valid||busy}>{busy?"Comprobando y guardando…":"Guardar mi nombre"}</button>
   </form>
   <button className="usernameLater" onClick={onClose}>Ahora no, solo quiero consultar canciones</button>
  </section>
 </div>;
}
