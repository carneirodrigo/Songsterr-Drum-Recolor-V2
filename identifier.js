/**
 * Drum note-head identifier.
 *
 * Pure logic (no DOM): given the `d` string of a `path[class$="_vDrum"]` element
 * and the parsed reference.json, it splits the path into individual note heads
 * and identifies each one (group / category / subtype) plus its staff position.
 *
 * Works in Node (for testing) and in the browser (addon content script).
 *
 * Pipeline:
 *   1. parsePathPieces  - command-aware SVG path parse -> contour pieces
 *   2. calibrateOffset  - find vertical offset that aligns notes to the 6px grid
 *   3. column segmentation - group pieces by x (one time-slot / chord per column)
 *   4. greedy matching  - longest full-fingerprint first, against the reference
 *   5. group detection   - infer the sheet's instrument group, constrain ambiguity
 */

const ARGC = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const STAFF_STEP = 6;          // px between adjacent staff positions (line<->space)
const BOTTOM_LINE_Y = 48;      // reference Y of the bottom staff line (staffPosition 0)
const COLUMN_GAP = 12;         // px: x-gap that starts a new time-column

// ---------------------------------------------------------------------------
// 1. Path parsing
// ---------------------------------------------------------------------------

const TOKEN_RE = /[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

function tokenize(d) {
  const raw = d.match(TOKEN_RE) || [];
  const out = [];
  let cur = null;
  let i = 0;
  while (i < raw.length) {
    const t = raw[i];
    if (/[A-Za-z]/.test(t)) {
      cur = t;
      i += 1;
      const n = ARGC[t.toUpperCase()];
      if (n === 0) { out.push([t, []]); continue; }
      out.push([t, raw.slice(i, i + n).map(Number)]);
      i += n;
    } else {
      // implicit repeat of the previous command
      const n = ARGC[cur.toUpperCase()];
      out.push([cur, raw.slice(i, i + n).map(Number)]);
      i += n;
    }
  }
  return out;
}

/**
 * Parse a path `d` into contour pieces. Each `M`/`m` starts a new piece.
 * Returns: [{ cmds:[upperLetters], fp:'M L ..', pts:[[x,y]..], cx, cy, bbox }]
 * Relative commands are converted to absolute; arc flag params are not coords.
 */
function parsePathPieces(d) {
  const toks = tokenize(d);
  const pieces = [];
  let cur = null;
  let cx = 0, cy = 0, sx = 0, sy = 0; // current point, subpath start

  const push = (letter, x, y) => {
    cur.cmds.push(letter);
    if (x !== undefined) { cur.pts.push([x, y]); }
  };

  for (const [cmd, args] of toks) {
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    if (up === 'M') {
      cur = { cmds: [], pts: [] };
      pieces.push(cur);
      let [x, y] = args;
      if (rel) { x += cx; y += cy; }
      cx = x; cy = y; sx = x; sy = y;
      push('M', x, y);
    } else if (up === 'Z') {
      cur.cmds.push('Z');
      cx = sx; cy = sy;
    } else if (up === 'H') {
      const x = args[0] + (rel ? cx : 0);
      cx = x;
      push('H', x, cy);
    } else if (up === 'V') {
      const y = args[0] + (rel ? cy : 0);
      cy = y;
      push('V', cx, y);
    } else if (up === 'L' || up === 'T') {
      let [x, y] = args;
      if (rel) { x += cx; y += cy; }
      cx = x; cy = y;
      push(up, x, y);
    } else if (up === 'C' || up === 'S' || up === 'Q') {
      const a = args.slice();
      if (rel) for (let k = 0; k < a.length; k += 2) { a[k] += cx; a[k + 1] += cy; }
      cx = a[a.length - 2]; cy = a[a.length - 1];
      push(up, cx, cy);
    } else if (up === 'A') {
      let x = args[5], y = args[6];
      if (rel) { x += cx; y += cy; }
      cx = x; cy = y;
      push('A', x, y);
    }
  }

  for (const p of pieces) {
    const xs = p.pts.map((q) => q[0]);
    const ys = p.pts.map((q) => q[1]);
    p.bbox = { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) };
    p.cx = (p.bbox.xmin + p.bbox.xmax) / 2;
    p.cy = (p.bbox.ymin + p.bbox.ymax) / 2;
    p.fp = p.cmds.join(' ');
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// 2. Reference index
// ---------------------------------------------------------------------------

function fullFingerprintFromSvg(svgArr) {
  const letters = [];
  for (const s of svgArr) {
    const m = /d='([^']*)'/.exec(s) || /d="([^"]*)"/.exec(s);
    if (m) for (const c of m[1].match(/[A-Za-z]/g) || []) letters.push(c.toUpperCase());
  }
  return letters.join(' ');
}

/**
 * Build a lookup from reference.json. Uses the stored `fullFingerprint` when
 * present, else derives it from the svg arrays.
 */
function buildReferenceIndex(reference) {
  const notes = [];
  for (const g of reference.groups) {
    for (const cat of g.categories) {
      for (const sub of cat.subtypes) {
        const full = sub.fullFingerprint || fullFingerprintFromSvg(sub.svg);
        // hierarchical color: deepest definition wins (subtype > category > group > none)
        const color = sub.color != null ? sub.color
          : cat.color != null ? cat.color
          : g.color != null ? g.color
          : null;
        notes.push({
          group: g.name,
          category: cat.name,
          subtype: sub.name,
          staffPosition: sub.staffPosition,
          bold: sub.bold,
          color,
          full,
          npieces: (full.match(/M/g) || []).length,
        });
      }
    }
  }
  const byFull = new Map();
  for (const n of notes) {
    if (!byFull.has(n.full)) byFull.set(n.full, []);
    byFull.get(n.full).push(n);
  }
  return { notes, byFull, maxPieces: Math.max(...notes.map((n) => n.npieces)) };
}

// ---------------------------------------------------------------------------
// 3. Vertical calibration + staff position
// ---------------------------------------------------------------------------

/** Find the vertical offset (in [-3,3]) that best snaps note centers to the 6px grid. */
function calibrateOffset(centersY) {
  let best = { err: Infinity, off: 0 };
  for (let o10 = -30; o10 <= 30; o10 += 1) {
    const o = o10 / 10;
    let err = 0;
    for (const y of centersY) {
      const r = ((y - o) % STAFF_STEP + STAFF_STEP) % STAFF_STEP;
      const d = Math.min(r, STAFF_STEP - r);
      err += d * d;
    }
    if (err < best.err) best = { err, off: o };
  }
  return best.off;
}

function staffPosition(cy, offset) {
  const snapped = Math.round((cy - offset) / STAFF_STEP) * STAFF_STEP;
  return (BOTTOM_LINE_Y - snapped) / STAFF_STEP;
}

// "×" cymbal note heads come in thin (arm width ~1.0) and bold (~2.1) variants.
// The arm width is the shortest edge of the 12-vertex cross polygon.
const CROSS_FP = 'M L L L L L L L L L L L Z';
const BOLD_THRESHOLD = 1.5;

function crossArmWidth(pts) {
  let min = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    min = Math.min(min, Math.hypot(x2 - x1, y2 - y1));
  }
  return min;
}

/** Measure the rendered note's bold flag, or null if it isn't a cross. */
function measureBold(pieces, grp) {
  for (const idx of grp) {
    if (pieces[idx].fp === CROSS_FP) {
      return crossArmWidth(pieces[idx].pts) > BOLD_THRESHOLD;
    }
  }
  return null;
}

/** Narrow candidates that differ only by `bold` using the rendered geometry. */
function disambiguateBold(candidates, pieces, grp) {
  if (candidates.length < 2) return candidates;
  const bolds = new Set(candidates.map((c) => c.bold));
  if (bolds.size < 2) return candidates;
  const b = measureBold(pieces, grp);
  if (b === null) return candidates;
  const filtered = candidates.filter((c) => c.bold === b);
  return filtered.length ? filtered : candidates;
}

// ---------------------------------------------------------------------------
// 4 + 5. Identification
// ---------------------------------------------------------------------------

/**
 * Identify all note heads in a `_vDrum` path.
 * @param {string} d         the path's `d` attribute
 * @param {object} refIndex  result of buildReferenceIndex()
 * @param {object} [opts]    { detectGroup=true }
 * @returns {{ notes:Array, unmatched:Array, offset:number, group:?string }}
 *   notes: { x, staffPosition, fingerprint, pieceIndices, candidates:[refNote] }
 */
function identifyNotes(d, refIndex, opts = {}) {
  const { detectGroup = true } = opts;
  const { byFull, maxPieces } = refIndex;
  const pieces = parsePathPieces(d);
  const offset = calibrateOffset(pieces.map((p) => p.cy));

  // --- column segmentation (sort by x, split on gaps) ---
  const order = pieces.map((_, i) => i).sort((a, b) => pieces[a].cx - pieces[b].cx);
  const columns = [];
  let col = [];
  for (const i of order) {
    if (col.length && pieces[i].cx - pieces[col[col.length - 1]].cx > COLUMN_GAP) {
      columns.push(col); col = [];
    }
    col.push(i);
  }
  if (col.length) columns.push(col);

  // --- greedy longest-fingerprint matching within each column ---
  const notes = [];
  const unmatched = [];
  for (let column of columns) {
    column = column.slice().sort((a, b) => a - b); // draw order within column
    let c = 0;
    while (c < column.length) {
      let matched = null;
      const maxK = Math.min(maxPieces, column.length - c);
      for (let k = maxK; k >= 1; k -= 1) {
        const grp = column.slice(c, c + k);
        const fp = grp.map((g) => pieces[g].fp).join(' ');
        if (byFull.has(fp)) { matched = { grp, fp }; break; }
      }
      if (matched) {
        const head = pieces[matched.grp[matched.grp.length - 1]];
        const pos = staffPosition(head.cy, offset);
        const all = byFull.get(matched.fp);
        const byPos = all.filter((n) => n.staffPosition === pos);
        const candidates = disambiguateBold(byPos.length ? byPos : all, pieces, matched.grp);
        notes.push({
          x: Math.round(pieces[matched.grp[0]].cx * 10) / 10,
          staffPosition: pos,
          fingerprint: matched.fp,
          pieceIndices: matched.grp,
          candidates,
        });
        c += matched.grp.length;
      } else {
        const p = pieces[column[c]];
        unmatched.push({ x: Math.round(p.cx * 10) / 10, fingerprint: p.fp, staffPosition: staffPosition(p.cy, offset) });
        c += 1;
      }
    }
  }
  notes.sort((a, b) => a.x - b.x);

  // --- per-sheet group detection: constrain ambiguous notes to the dominant group ---
  let group = null;
  if (detectGroup) {
    const counts = new Map();
    for (const n of notes) {
      if (n.candidates.length === 1) {
        const g = n.candidates[0].group;
        counts.set(g, (counts.get(g) || 0) + 1);
      }
    }
    if (counts.size) {
      group = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      for (const n of notes) {
        if (n.candidates.length > 1) {
          const narrowed = n.candidates.filter((c0) => c0.group === group);
          if (narrowed.length) n.candidates = narrowed;
        }
      }
    }
  }

  return { notes, unmatched, offset, group };
}

const identifierApi = {
  tokenize, parsePathPieces, fullFingerprintFromSvg,
  buildReferenceIndex, calibrateOffset, staffPosition, identifyNotes,
};

if (typeof module !== 'undefined' && module.exports) module.exports = identifierApi;
if (typeof window !== 'undefined') window.DrumIdentifier = identifierApi;
