// BoscoSong harmony utilities. Spanish case-sensitive notation:
// DO (C major), do (C minor), LA (A major), la (A minor).
// English notation (Am, F#7, Bb) is also supported.
const NOTES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const SPANISH=["DO","DO#","RE","RE#","MI","FA","FA#","SOL","SOL#","LA","LA#","SI"];
const SEMI={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const LATIN={DO:0,RE:2,MI:4,FA:5,SOL:7,LA:9,SI:11};
const ACCIDENTAL={ "#":1,"♯":1,b:-1,"♭":-1 };
const CHORD_ROOT=/^(SOL|DO|RE|MI|FA|LA|SI|[A-G])([#b♯♭]?)(.*)$/i;
function parseOne(symbol){
 const m=CHORD_ROOT.exec(String(symbol).trim());
 if(!m)return null;
 const sourceRoot=m[1],acc=m[2],suffix=m[3],spanish=sourceRoot.length>1;
 const note=spanish?LATIN[sourceRoot.toUpperCase()]:SEMI[sourceRoot.toUpperCase()];
 if(note===undefined)return null;
 const index=(note+(ACCIDENTAL[acc]||0)+12)%12;
 const lowerSpanish=spanish&&sourceRoot===sourceRoot.toLowerCase();
 const minor=lowerSpanish||(/^m(?!aj)/i.test(suffix)&&!/^maj/i.test(suffix))||/^min/i.test(suffix);
 return {sourceRoot,index,suffix,spanish,minor,lowerSpanish,capitalSpanish:spanish&&sourceRoot===sourceRoot.toUpperCase()};
}
export function transposeChord(symbol,steps=0){
 if(!steps)return symbol;
 const text=String(symbol);
 // Progressions separated by hyphens and inversion/bass notes separated by slashes.
 return text.split(/([/\-])/).map(part=>{
  if(part==="/"||part==="-")return part;
  const parsed=parseOne(part);if(!parsed)return part;
  const value=(parsed.index+steps%12+12)%12;
  if(parsed.spanish){
   const newRoot=SPANISH[value];
   return (parsed.lowerSpanish?newRoot.toLowerCase():newRoot)+parsed.suffix;
  }
  return NOTES[value]+parsed.suffix;
 }).join("");
}
export function chordTones(symbol){
 const first=String(symbol).split(/[/\-]/)[0];
 const p=parseOne(first);if(!p)return [];
 const suf=p.suffix.toLowerCase();
 let intervals=p.minor?[0,3,7]:[0,4,7];
 if(suf.includes("dim")||suf.includes("º")||suf.includes("°"))intervals=[0,3,6];
 if(suf.includes("aug")||suf.includes("+5"))intervals=[0,4,8];
 if(suf.includes("sus2"))intervals=[0,2,7];
 if(suf.includes("sus4"))intervals=[0,5,7];
 if(/(?:maj7|7\+|m7\+)/i.test(p.suffix))intervals.push(11);
 else if(/7/.test(suf))intervals.push(10);
 if(/6/.test(suf))intervals.push(9);
 return [...new Set(intervals.map(v=>(p.index+v)%12))];
}
export function normalizeNotation(symbol){return parseOne(symbol);}
