// Shared session song presets. Each entry persists the tuning and tempo
// that were visible in the reader when it was added.
export function makeSessionEntry(song,{transpose=0,speed=2,tempo=76}={}){
 if(!song?.id)throw new Error("Selecciona una canción");
 const semitones=Number(transpose);
 const factor=Number(speed);
 const bpm=Number(tempo);
 return {
  songId:song.id,
  transpose:Number.isFinite(semitones)?Math.round(Math.max(-24,Math.min(24,semitones))):0,
  speed:Number.isFinite(factor)?Math.max(0.02,Math.min(5,factor)):2,
  tempo:Number.isFinite(bpm)?Math.round(Math.max(40,Math.min(240,bpm))):76
 };
}
export function getSessionSongs(session){
 if(Array.isArray(session?.songs)&&session.songs.length)return session.songs;
 return (session?.songIds||[]).map(songId=>({songId,transpose:0,speed:2,tempo:76}));
}
export function containsSessionSong(session,songId){
 return getSessionSongs(session).some(entry=>entry.songId===songId);
}
export function sessionWithSong(session,song,settings){
 if(session&&containsSessionSong(session,song.id))throw new Error("Esta canción ya está incluida en la sesión");
 const entry=makeSessionEntry(song,settings);
 return session?{...session,songs:[...getSessionSongs(session),entry]}:{songs:[entry]};
}
