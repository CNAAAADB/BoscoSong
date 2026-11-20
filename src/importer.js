// Importador geométrico de letras y acordes para PDF e imágenes.
// Conserva cajas originales de palabras: los acordes se anclan a caracteres,
// no a espacios aproximados en un texto OCR plano.
const ES_NOTES="DO|RE|MI|FA|SOL|LA|SI";
const chordRx=new RegExp("^(?:(?:"+ES_NOTES+"|[A-G])(?:#|b|♯|♭)?(?:m|maj|min|sus|dim|aug|add|M|º|°|ø|\\+|\\-|[0-9]|\\/|\\(|\\))*)$","i");
const ambiguous=new Set(["a","la","mi","si","do","re","fa","sol"]);
export const looksLikeChord=(text)=>chordRx.test(String(text).trim())&&text.trim().length<=20;
export const normalizeChord=(text)=>String(text).trim().replace(/♯/g,"#").replace(/♭/g,"b");
const median=(xs)=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:10;};
const strength=(w)=>looksLikeChord(w.text)?(ambiguous.has(w.text.trim().toLowerCase())?0.65:1):0;
function groupRows(words){
 const valid=words.filter(w=>w&&String(w.text||"").trim()&&Number.isFinite(w.x)&&Number.isFinite(w.y)&&Number.isFinite(w.width)&&Number.isFinite(w.height)&&w.height>0).sort((a,b)=>a.y-b.y||a.x-b.x);
 const lineH=median(valid.map(w=>w.height));
 const rows=[];
 for(const w of valid){
  const center=w.y+w.height/2;
  let row=rows.find(r=>Math.abs(r.center-center)<=Math.min(lineH*.48,Math.max(3,w.height*.42)));
  if(!row){row={center,words:[]};rows.push(row);}
  row.words.push(w);row.center=row.words.reduce((t,x)=>t+x.y+x.height/2,0)/row.words.length;
 }
 return rows.sort((a,b)=>a.center-b.center).map(row=>{
  row.words.sort((a,b)=>a.x-b.x);
  row.x=Math.min(...row.words.map(w=>w.x));
  row.maxX=Math.max(...row.words.map(w=>w.x+w.width));
  row.height=median(row.words.map(w=>w.height));
  row.candidates=row.words.filter(w=>looksLikeChord(w.text));
  row.ratio=row.words.reduce((t,w)=>t+strength(w),0)/row.words.length;
  // Require a strong all-chord pattern, with strong chord markers or
  // spacing/position evidence; avoid treating "la mi" within prose as notes.
  row.isChord=row.ratio>=.78&&row.words.length<=16;
  return row;
 });
}
function rowToLyric(row){
 let text="",letters=[];
 const medianChar=median(row.words.map(w=>w.width/Math.max(1,[...w.text].length)));
 for(let i=0;i<row.words.length;i++){
  const w=row.words[i],prev=row.words[i-1];
  if(prev){
   const gap=w.x-(prev.x+prev.width);
   const spaces=Math.max(1,Math.min(5,Math.round(gap/Math.max(medianChar,2))));
   text+=" ".repeat(spaces);
   for(let s=0;s<spaces;s++)letters.push({index:text.length-spaces+s,x:(prev.x+prev.width)+gap*(s+.5)/spaces});
  }
  const chars=[...w.text];const origin=text.length;
  chars.forEach((ch,k)=>letters.push({index:origin+k,x:w.x+w.width*(k+.1)/Math.max(chars.length,1)}));
  text+=w.text;
 }
 return {text,letters};
}
function pairChordRow(chords,lyric){
 const {text,letters}=rowToLyric(lyric);
 const anchors=chords.words.filter(w=>looksLikeChord(w.text)).map(w=>{
  const x=w.x;let nearest=letters[0];
  for(const character of letters)if(nearest&&Math.abs(character.x-x)<Math.abs(nearest.x-x))nearest=character;
  return {index:Math.min(text.length,nearest?.index??0),symbol:normalizeChord(w.text)};
 });
 return {text,chords:anchors.sort((a,b)=>a.index-b.index)};
}
export function extractPositionedSong(words,{preserveColumns=true}={}){
 const all=groupRows(words);if(!all.length)return [];
 // Two-column printed pages require splitting before pairing chord rows.
 const widths=all.map(r=>r.maxX-r.x),fullW=Math.max(...all.map(r=>r.maxX))-Math.min(...all.map(r=>r.x));
 const splitAt=Math.min(...all.map(r=>r.x))+fullW/2;
 const left=all.filter(r=>r.maxX<=splitAt+fullW*.045);
 const right=all.filter(r=>r.x>=splitAt-fullW*.045);
 let sections=[all];
 const isTwoCol=preserveColumns&&left.length>=5&&right.length>=5&&left.length+right.length>=all.length*.83;
 if(isTwoCol)sections=[left,right];
 const result=[];
 for(const part of sections){
  for(let i=0;i<part.length;i++){
   const row=part[i];if(row.isChord){
    const following=part[i+1];
    const dy=following?.center-row.center;
    if(following&&!following.isChord&&dy>0&&dy<row.height*3.7){
     result.push(pairChordRow(row,following));i++;continue;
    }
    // Standalone chord line: no fake lyric row. Flag for user review.
    result.push({text:"",chords:row.candidates.map(w=>({index:0,symbol:normalizeChord(w.text)})),needsReview:true});continue;
   }
   const {text}=rowToLyric(row);
   result.push({text,chords:[]});
  }
 }
 return result;
}
export function parseBracketedText(input){
 const rows=String(input||"").replace(/\r/g,"").split("\n");const result=[];
 for(let i=0;i<rows.length;i++){
  const line=rows[i];
  if(/\[[^\]]+\]/.test(line)){
   let text="",chords=[],last=0,match;const re=/\[([^\]]+)\]/g;
   while((match=re.exec(line))){text+=line.slice(last,match.index);chords.push({index:[...text].length,symbol:normalizeChord(match[1])});last=re.lastIndex;}
   text+=line.slice(last);result.push({text,chords});continue;
  }
  const parts=[...line.matchAll(/\S+/g)];
  const chordOnly=parts.length&&parts.every(m=>looksLikeChord(m[0]));
  if(chordOnly&&i+1<rows.length){
   const lyric=rows[++i];const chars=[...lyric];const chords=parts.map(m=>({index:Math.min(chars.length,m.index||0),symbol:normalizeChord(m[0])}));
   result.push({text:lyric,chords});continue;
  }
  result.push({text:line,chords:[]});
 }
 return result;
}
