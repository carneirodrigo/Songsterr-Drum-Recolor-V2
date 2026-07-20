/**
 * Recolor planner: turn an identification result into a set of per-color path
 * segments, ready to replace a single white `_vDrum` path.
 *
 * Pure logic (no DOM) so it can be unit-tested in Node. The content script
 * applies the plan to the live DOM.
 */

/**
 * Split a path `d` into raw subpath substrings, one per `M`/`m` command.
 * Index-aligned 1:1 with identifier.parsePathPieces(d).
 */
function splitRawPieces(d) {
  return d.trim().split(/(?=[Mm])/).map((s) => s.trim()).filter(Boolean);
}

// Group priority for breaking residual ambiguity. Lower rank wins; Drumset is
// highest. Groups not listed share the same (lowest) priority -> "pick any".
const GROUP_RANK = { Drumset: 0 };
function groupRank(group) {
  return GROUP_RANK[group] ?? 1;
}

/**
 * Decide the color for one identified note. When a note is still ambiguous
 * (multiple candidates), prefer the highest-priority group (Drumset first);
 * among same-group candidates just take the first. Returns null when the
 * resolved color is "none" (keep white).
 */
function noteColor(note) {
  if (!note.candidates || !note.candidates.length) return null;
  let best = note.candidates[0];
  for (const c of note.candidates) {
    if (groupRank(c.group) < groupRank(best.group)) best = c;
  }
  return best.color ?? null;
}

/**
 * Build the recolor plan for one `_vDrum` path.
 * @param {string} d                 the original path's `d`
 * @param {object} identifyResult    output of identifier.identifyNotes
 * @returns {{ groups: Array<{color:string|null, d:string, pieceCount:number}>,
 *             changed: boolean }}
 *   `groups` is ordered white-first, then one entry per distinct non-white
 *   color (in first-seen order). White (null) holds unmatched pieces and notes
 *   whose resolved color is "none".
 */
function planRecolor(d, identifyResult) {
  const raws = splitRawPieces(d);
  const colorOf = new Array(raws.length).fill(null); // default: white

  for (const note of identifyResult.notes) {
    const color = noteColor(note);
    if (color == null) continue;
    for (const idx of note.pieceIndices) colorOf[idx] = color;
  }
  // unmatched pieces stay null (white) by construction.

  // Group raw segments by color, white first then colors in first-seen order.
  const order = [];
  const buckets = new Map();
  const ensure = (c) => {
    if (!buckets.has(c)) { buckets.set(c, []); order.push(c); }
    return buckets.get(c);
  };
  ensure(null); // guarantee a white bucket exists and is first
  for (let i = 0; i < raws.length; i += 1) ensure(colorOf[i]).push(raws[i]);

  const groups = order
    .map((c) => ({ color: c, segs: buckets.get(c) }))
    .filter((grp) => grp.segs.length > 0)
    .map((grp) => ({ color: grp.color, d: grp.segs.join(' '), pieceCount: grp.segs.length }));

  const changed = groups.some((grp) => grp.color != null);
  return { groups, changed };
}

const recolorApi = { splitRawPieces, noteColor, planRecolor };
if (typeof module !== 'undefined' && module.exports) module.exports = recolorApi;
if (typeof window !== 'undefined') window.DrumRecolor = recolorApi;
