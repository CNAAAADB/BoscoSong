import test from "node:test";
import assert from "node:assert/strict";
import {extractPositionedSong,looksLikeChord,parseBracketedText} from "../src/importer.js";
import {transposeChord,chordTones} from "../src/music.js";

test("Spanish major and minor chords transpose by semitone",()=>{
 assert.equal(transposeChord("DO",1),"DO#");
 assert.equal(transposeChord("la",1),"la#");
 assert.equal(transposeChord("MI",-1),"RE#");
 assert.equal(transposeChord("Am",1),"A#m");
 assert.deepEqual(chordTones("la"),[9,0,4]);
});
test("bracketed chords anchor to lyric character index",()=>{
 const [line]=parseBracketedText("[DO]Cantamos [SOL]juntos");
 assert.equal(line.text,"Cantamos juntos");
 assert.deepEqual(line.chords,[{index:0,symbol:"DO"},{index:9,symbol:"SOL"}]);
});
test("chord-only row stays above lyric when geometry is available",()=>{
 const items=[
  {text:"DO",x:12,y:10,width:17,height:10},
  {text:"SOL",x:90,y:10,width:20,height:10},
  {text:"Cantamos",x:12,y:26,width:65,height:10},
  {text:"unidos",x:90,y:26,width:50,height:10}
 ];
 const result=extractPositionedSong(items);
 assert.equal(result.length,1);
 assert.equal(result[0].text.replace(/\s+/g," "),"Cantamos unidos");
 assert.deepEqual(result[0].chords.map(c=>c.symbol),["DO","SOL"]);
 assert.equal(result[0].chords[0].index,0);
 assert.ok(result[0].chords[1].index>0);
});
test("lyrics are not incorrectly classified as chords",()=>{
 assert.equal(looksLikeChord("Cantamos"),false);
 assert.equal(looksLikeChord("SOL7"),true);
});
