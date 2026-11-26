// Split a lyric into word runs without losing the exact character indices
// used by chord anchors and the manual chord editor.
export function lyricRuns(text) {
  const chars = Array.from(String(text ?? ""));
  const runs = [];
  let i = 0;
  while (i < chars.length) {
    const start = i;
    const space = /\s/u.test(chars[i]);
    while (i < chars.length && /\s/u.test(chars[i]) === space) i += 1;
    runs.push({
      type: space ? "gap" : "word",
      start,
      chars: chars.slice(start, i).map((value, offset) => ({
        value,
        index: start + offset,
      })),
    });
  }
  return runs;
}
