// Continuous auto-scroll with a logarithmic speed control.
// Units: pixels per second; rate is a multiplier of the current BPM.
export const MIN_SCROLL_RATE = 0.02;
export const MAX_SCROLL_RATE = 5;
const BASE_PIXELS_PER_BEAT = 12;

export function sliderToScrollRate(value) {
 const position = Math.min(100, Math.max(0, Number(value) || 0));
 return MIN_SCROLL_RATE * (MAX_SCROLL_RATE / MIN_SCROLL_RATE) ** (position / 100);
}

export function scrollRateToSlider(rate) {
 const safe = Math.min(MAX_SCROLL_RATE, Math.max(MIN_SCROLL_RATE, Number(rate) || MIN_SCROLL_RATE));
 return Math.round(100 * Math.log(safe / MIN_SCROLL_RATE) / Math.log(MAX_SCROLL_RATE / MIN_SCROLL_RATE));
}

export function formatScrollRate(rate) {
 const safe = Math.min(MAX_SCROLL_RATE, Math.max(MIN_SCROLL_RATE, Number(rate) || MIN_SCROLL_RATE));
 return safe < 1 ? safe.toFixed(2) : safe.toFixed(1);
}

export function scrollPixelsPerSecond(tempo, rate) {
 const bpm = Number.isFinite(Number(tempo)) ? Math.max(0, Number(tempo)) : 0;
 const speed = Number.isFinite(Number(rate)) ? Math.max(0, Number(rate)) : 0;
 return (bpm / 60) * speed * BASE_PIXELS_PER_BEAT;
}

// Accumulate fractional pixels across animation frames. Some browsers round
// scrollTop to integer pixels, so writing fractions on each frame can stall
// indefinitely when the user selects a very slow rate.
export function advanceScroll(carry, elapsedSeconds, tempo, rate) {
 const time = Math.min(0.12, Math.max(0, Number(elapsedSeconds) || 0));
 const distance = Math.max(0, Number(carry) || 0) + time * scrollPixelsPerSecond(tempo, rate);
 const pixels = Math.floor(distance + 1e-9);
 return { pixels, carry: Math.max(0, distance - pixels) };
}
