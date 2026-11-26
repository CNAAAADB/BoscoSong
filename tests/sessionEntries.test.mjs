import test from "node:test";
import assert from "node:assert/strict";
import {makeSessionEntry,getSessionSongs,containsSessionSong,sessionWithSong} from "../src/sessionEntries.js";

test("New session contains the selected song and keeps current half-tone, speed and BPM",()=>{
 const song={id:"canto-entrada",title:"Entrada"};
 const result=sessionWithSong(null,song,{transpose:-3,speed:.05,tempo:72});
 assert.deepEqual(result.songs,[{songId:"canto-entrada",transpose:-3,speed:.05,tempo:72}]);
 assert.equal(result.id,undefined);
});
test("Adding to existing session keeps order and existing musical presets",()=>{
 const original={id:"BS-AABBCCDDEEFF",title:"Misa",ownerSub:"abc",songs:[{songId:"x",transpose:2,speed:.25,tempo:88}]};
 const added=sessionWithSong(original,{id:"y"},{transpose:1,speed:2.5,tempo:100});
 assert.equal(added.songs.length,2);
 assert.deepEqual(added.songs[0],original.songs[0]);
 assert.deepEqual(added.songs[1],{songId:"y",transpose:1,speed:2.5,tempo:100});
 assert.equal(original.songs.length,1);
 assert.equal(added.ownerSub,"abc");
});
test("Duplicate song cannot be added again",()=>{
 const existing={songIds:["a","b"]};
 assert.equal(containsSessionSong(existing,"b"),true);
 assert.throws(()=>sessionWithSong(existing,{id:"b"}),/ya está incluida/);
});
test("Legacy session songIds remain editable without losing their songs",()=>{
 const session={id:"BS-AABBCCDDEEFF",songIds:["x","y"]};
 const next=sessionWithSong(session,{id:"z"},{});
 assert.equal(next.songs.length,3);
 assert.deepEqual(getSessionSongs(next).map(s=>s.songId),["x","y","z"]);
});
test("Music settings stay inside supported API limits",()=>{
 assert.deepEqual(makeSessionEntry({id:"z"},{transpose:999,speed:-4,tempo:2000}),
 {songId:"z",transpose:24,speed:.02,tempo:240});
});
