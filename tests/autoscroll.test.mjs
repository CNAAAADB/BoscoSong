import test from "node:test";
import assert from "node:assert/strict";
import {
 MIN_SCROLL_RATE, MAX_SCROLL_RATE, sliderToScrollRate,
 scrollRateToSlider, scrollPixelsPerSecond, advanceScroll,
 formatScrollRate,
} from "../src/autoscroll.js";

test("Speed slider provides slow speeds and reaches both ends", () => {
 assert.equal(sliderToScrollRate(0), MIN_SCROLL_RATE);
 assert.ok(Math.abs(sliderToScrollRate(100) - MAX_SCROLL_RATE) < 1e-10);
 assert.ok(sliderToScrollRate(25) < sliderToScrollRate(50));
 assert.ok(sliderToScrollRate(50) < sliderToScrollRate(75));
 for (const rate of [0.02, 0.05, 0.1, 0.5, 1, 2, 5]) {
  const mapped=sliderToScrollRate(scrollRateToSlider(rate));
  assert.ok(Math.abs(Math.log(mapped/rate))<0.029);
 }
 assert.equal(formatScrollRate(0.02), "0.02");
 assert.equal(formatScrollRate(2), "2.0");
});

test("Sub-pixel increments eventually move the page at minimum speed", () => {
 let carry=0, moved=0;
 for(let i=0;i<60*15;i++) {
  const frame=advanceScroll(carry,1/60,60,MIN_SCROLL_RATE);
  carry=frame.carry;
  moved+=frame.pixels;
 }
 assert.equal(moved,3); // 0.24 px/s for 15 seconds, including rounding tolerance.
 assert.ok(carry>0.5&&carry<0.7);
});

test("Fractional distance survives frames even if scrollTop stores only integers", () => {
 let carry=0, moved=0;
 for(let i=0;i<60*8;i++) {
  const frame=advanceScroll(carry,1/60,76,0.05);
  carry=frame.carry;
  moved+=frame.pixels;
 }
 const expected=scrollPixelsPerSecond(76,0.05)*8;
 assert.ok(Math.abs((moved+carry)-expected)<0.01);
 assert.ok(moved>0);
});

test("Elapsed duration is capped to prevent giant jumps when background tab resumes", () => {
 const frame=advanceScroll(0,12,180,MAX_SCROLL_RATE);
 assert.equal(frame.pixels,Math.floor(scrollPixelsPerSecond(180,MAX_SCROLL_RATE)*0.12));
});
