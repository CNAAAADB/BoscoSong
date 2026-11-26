import test from "node:test";
import assert from "node:assert/strict";
import {lyricRuns} from "../src/lyricRuns.js";

test("Wrapped words preserve every source character and chord index",()=>{
 const lyric="Ven, Espíritu Santo, ven";
 const runs=lyricRuns(lyric);
 assert.deepEqual(runs.map(x=>x.type),["word","gap","word","gap","word","gap","word"]);
 assert.equal(runs.flatMap(r=>r.chars.map(c=>c.value)).join(""),lyric);
 const indexed=runs.flatMap(r=>r.chars.map(c=>c.index));
 assert.deepEqual(indexed,Array.from({length:Array.from(lyric).length},(_,i)=>i));
 assert.equal(runs[2].chars[0].index,5);
 assert.equal(runs[4].chars[0].index,14);
});

test("Multiple spaces and explicit newlines do not shift chords",()=>{
 const lyric="En  mi\ncorazón";
 const runs=lyricRuns(lyric);
 assert.equal(runs.flatMap(r=>r.chars.map(c=>c.value)).join(""),lyric);
 assert.equal(runs.find(r=>r.type==="word"&&r.chars[0].value==="m").start,4);
 const second=runs.find(r=>r.type==="word"&&r.chars[0].value==="c");
 assert.equal(second.start,7);
});

test("One overlong word is one token and can wrap inside its inline box",()=>{
 const value="extraordinariamente";
 const runs=lyricRuns(value);
 assert.equal(runs.length,1);
 assert.equal(runs[0].type,"word");
 assert.equal(runs[0].chars.length,Array.from(value).length);
});

test("Empty lyrics retain no synthetic syllables",()=>{
 assert.deepEqual(lyricRuns(""),[]);
});
