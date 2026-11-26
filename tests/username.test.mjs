import test from "node:test";
import assert from "node:assert/strict";
import {normalizeUsername,validateUsername} from "../src/username.js";

test("Usernames are case-insensitive and normalized",()=>{
 assert.equal(normalizeUsername(" MaRÍa_21 "),"maría_21");
 assert.equal(normalizeUsername("CORO_SOL"),"coro_sol");
 assert.equal(normalizeUsername("Coro_Sol"),"coro_sol");
});
test("Spanish letters, digits and underscore are accepted",()=>{
 for(const handle of ["maria","ángel","corista_2","niña","laudate_2026"]){
  assert.equal(validateUsername(handle).valid,true,handle);
 }
});
test("Too short, long, symbols, whitespace and reserved handles are rejected",()=>{
 for(const handle of ["ab","q".repeat(25),"1usuario","dos palabras","user@x","pe.pe","admin","BoscoSong","root"]){
  assert.equal(validateUsername(handle).valid,false,handle);
 }
});
test("Validation always returns canonical username",()=>{
 const result=validateUsername(" MARÍA_22 ");
 assert.equal(result.username,"maría_22");
 assert.equal(result.valid,true);
});
