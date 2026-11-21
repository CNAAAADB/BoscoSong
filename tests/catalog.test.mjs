import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
test("shared catalog manifest and all parts are complete",()=>{
 const base=path.join(root,"public","catalog");
 const manifest=JSON.parse(fs.readFileSync(path.join(base,"manifest.json"),"utf8"));
 assert.ok(manifest.total>0);
 assert.ok(Array.isArray(manifest.parts)&&manifest.parts.length>0);
 let total=0;const ids=new Set();
 for(const name of manifest.parts){
   assert.match(name,/^part-\d+\.json$/);
   const songs=JSON.parse(fs.readFileSync(path.join(base,name),"utf8"));
   assert.ok(Array.isArray(songs));
   total+=songs.length;
   for(const s of songs){assert.ok(s.id&&s.title&&Array.isArray(s.lines));assert.ok(!ids.has(s.id),s.id);ids.add(s.id);}
 }
 assert.equal(total,manifest.total);
});
