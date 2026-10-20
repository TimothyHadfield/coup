/* ============================================================================
 * art.js: original SVG art for the Coup web game (no publisher art).
 *
 *   CoupArt.COLORS['Duke']            -> '#a47de6'   (one readable colour each)
 *   CoupArt.card('Duke')              -> SVG string, portrait face, 100x140
 *   CoupArt.card('Duke', {small:true})-> same art for a 46x64 slot (no tag)
 *   CoupArt.back({small:true})        -> face-down card back
 *   CoupArt.coin(20)                  -> gold coin, 20 px
 *   CoupArt.icon('Captain', 16)       -> tiny round emblem for lists / bars
 *
 * Character names match the engine ('Duke', 'Assassin', ...), any case.
 * Every SVG gets its own id suffix, so many cards can share one page.
 * Optional opts on card/back: width, height (css px attrs), cls (class).
 * ==========================================================================*/
(function (root) {
  'use strict';

  let uid = 0;
  const next = () => 'ca' + (++uid).toString(36);

  const CHARS = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa', 'Inquisitor'];

  // Readable on #0f1117 (used by the UI for borders, bars, chips).
  const COLORS = {
    Duke: '#a47de6',
    Assassin: '#7d8294',
    Captain: '#5b9cf0',
    Ambassador: '#4cc38a',
    Contessa: '#e5546a',
    Inquisitor: '#4fb3bf',
  };

  // Full palette per character for the card art.
  // bg1/bg2: art backdrop gradient, robe/robe2: clothing, acc: trim / accent.
  const PAL = {
    Duke:       { bg1: '#4a2f7a', bg2: '#1c1430', robe: '#5d3c96', robe2: '#3e2768', acc: '#f0b354', line: '#a47de6' },
    Assassin:   { bg1: '#2f323c', bg2: '#121318', robe: '#2a2c34', robe2: '#1a1b21', acc: '#e0484f', line: '#e0484f' },
    Captain:    { bg1: '#22508f', bg2: '#0f1c33', robe: '#24508e', robe2: '#183766', acc: '#f0b354', line: '#5b9cf0' },
    Ambassador: { bg1: '#1f6b4b', bg2: '#0e2219', robe: '#2a7a57', robe2: '#1b5239', acc: '#e9dcb4', line: '#4cc38a' },
    Contessa:   { bg1: '#8a2436', bg2: '#2a0d14', robe: '#b23246', robe2: '#7c1f2f', acc: '#f0b354', line: '#e5546a' },
    Inquisitor: { bg1: '#2c6670', bg2: '#0f1f24', robe: '#3c6f7d', robe2: '#26505b', acc: '#f0b354', line: '#4fb3bf' },
  };

  const TAGS = {
    Duke: 'Tax +3 · blocks aid',
    Assassin: 'Pay 3: kill',
    Captain: 'Steal 2 · blocks steal',
    Ambassador: 'Swap cards · blocks steal',
    Contessa: 'Blocks assassin',
    Inquisitor: 'Swap 1 / examine · blocks steal',
  };

  const SKIN = '#e6c3a0';
  const SKIN_SH = '#c99f7c';
  const INK = '#0f1117';
  const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

  function norm(c) {
    if (!c) return null;
    const s = String(c).toLowerCase();
    for (const k of CHARS) if (k.toLowerCase() === s) return k;
    return null;
  }

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function svgOpen(vb, w, h, opts, label) {
    const cls = opts && opts.cls ? ' class="' + esc(opts.cls) + '"' : '';
    const lab = label ? ' role="img" aria-label="' + esc(label) + '"' : ' aria-hidden="true"';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="' + w +
      '" height="' + h + '"' + cls + lab + ' style="display:block">';
  }

  // ---------------------------------------------------------------- shared bits
  // A simple head with ears and a soft jaw shadow. cy = head centre.
  function head(cx, cy, opts) {
    const o = opts || {};
    const skin = o.skin || SKIN;
    let s = '';
    s += '<rect x="' + (cx - 4.5) + '" y="' + (cy + 6) + '" width="9" height="12" fill="' + SKIN_SH + '"/>';
    s += '<ellipse cx="' + (cx - 10.5) + '" cy="' + (cy + 1) + '" rx="2.2" ry="3.2" fill="' + SKIN_SH + '"/>';
    s += '<ellipse cx="' + (cx + 10.5) + '" cy="' + (cy + 1) + '" rx="2.2" ry="3.2" fill="' + SKIN_SH + '"/>';
    s += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="10.5" ry="12" fill="' + skin + '"/>';
    if (!o.noFace) {
      // eyes, brows, nose, mouth: small, calm, stylised
      s += '<ellipse cx="' + (cx - 4) + '" cy="' + (cy + 0.5) + '" rx="1.2" ry="1.4" fill="' + INK + '"/>';
      s += '<ellipse cx="' + (cx + 4) + '" cy="' + (cy + 0.5) + '" rx="1.2" ry="1.4" fill="' + INK + '"/>';
      s += '<path d="M' + (cx - 6) + ' ' + (cy - 3) + ' l3.6 -0.8 M' + (cx + 6) + ' ' + (cy - 3) +
        ' l-3.6 -0.8" stroke="' + (o.brow || '#4a3426') + '" stroke-width="1.1" stroke-linecap="round"/>';
      s += '<path d="M' + cx + ' ' + (cy + 1.5) + ' l-1.2 3.4 h2" stroke="' + SKIN_SH +
        '" stroke-width="0.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
      s += '<path d="M' + (cx - 2.8) + ' ' + (cy + 7.4) + ' q2.8 ' + (o.smile ? 1.6 : 0.6) + ' 5.6 0" stroke="#7a4a3a" stroke-width="1" fill="none" stroke-linecap="round"/>';
    }
    return s;
  }

  // Bust/robe silhouette: shoulders from y≈72 down to the band.
  function shoulders(fill, bottom) {
    const b = bottom;
    return '<path d="M10 ' + b + ' C12 ' + (b - 18) + ' 22 74 38 70 L62 70 C78 74 88 ' + (b - 18) +
      ' 90 ' + b + ' Z" fill="' + fill + '"/>';
  }

  // ---------------------------------------------------------------- emblems
  // Small glyphs drawn in a 16x16 box centred at 8,8. Reused by icon().
  const GLYPH = {
    Duke: // tall hat over a coin
      '<path d="M5 9.5 L5.8 3.2 Q8 1.8 10.2 3.2 L11 9.5 Z" fill="#fff"/>' +
      '<rect x="4.6" y="8" width="6.8" height="1.6" fill="#f0b354"/>' +
      '<ellipse cx="8" cy="12.3" rx="3.6" ry="1.6" fill="#f0b354"/>',
    Assassin: // dagger
      '<path d="M8 1.6 L9.3 9 L6.7 9 Z" fill="#fff"/>' +
      '<rect x="4.6" y="9" width="6.8" height="1.4" rx="0.7" fill="#e0484f"/>' +
      '<rect x="7.2" y="10.4" width="1.6" height="3.4" rx="0.6" fill="#e0484f"/>',
    Captain: // anchor
      '<circle cx="8" cy="3.4" r="1.4" fill="none" stroke="#fff" stroke-width="1.2"/>' +
      '<path d="M8 4.8 V13.4 M5.4 7 H10.6 M3.6 10.2 Q4.4 13.6 8 13.6 Q11.6 13.6 12.4 10.2" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>',
    Ambassador: // two swap arrows
      '<path d="M3 6 H11.6 M9.4 3.6 L12 6 L9.4 8.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M13 10.4 H4.4 M6.6 8 L4 10.4 L6.6 12.8" fill="none" stroke="#e9dcb4" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    Contessa: // open fan
      '<path d="M8 12.6 L2.6 6.4 A7 7 0 0 1 13.4 6.4 Z" fill="#fff"/>' +
      '<path d="M8 12.6 L5.2 4.2 M8 12.6 L8 3.4 M8 12.6 L10.8 4.2" stroke="#e5546a" stroke-width="0.8"/>' +
      '<circle cx="8" cy="12.6" r="1.2" fill="#f0b354"/>',
    Inquisitor: // eye
      '<path d="M1.8 8 Q8 1.8 14.2 8 Q8 14.2 1.8 8 Z" fill="#fff"/>' +
      '<circle cx="8" cy="8" r="2.6" fill="#1d5a62"/>' +
      '<circle cx="8.8" cy="7.2" r="0.8" fill="#fff"/>',
  };

  // ---------------------------------------------------------------- figures
  // Each returns the art layer for the 100x140 card (art area y 0..~104).
  const FIG = {
    Duke(p, id, B) {
      let s = '';
      // stacked coins behind the shoulders, both sides (treasury)
      const stack = (x, n) => {
        let t = '';
        for (let i = 0; i < n; i++) {
          const y = B - 6 - i * 4.2;
          t += '<ellipse cx="' + x + '" cy="' + (y + 1.4) + '" rx="8" ry="3" fill="#a8742a"/>';
          t += '<ellipse cx="' + x + '" cy="' + y + '" rx="8" ry="3" fill="#f0b354" stroke="#c88a30" stroke-width="0.6"/>';
        }
        return t;
      };
      // robe with fur-trimmed cape
      s += shoulders(p.robe, B);
      s += '<path d="M38 70 L50 ' + B + ' L62 70 Z" fill="' + p.robe2 + '"/>';
      s += '<path d="M46 70 L50 ' + B + ' L54 70 Z" fill="' + p.acc + '"/>';
      s += '<path d="M31 72 Q50 84 69 72 Q66 79 50 82 Q34 79 31 72 Z" fill="#efe6d4"/>'; // ermine collar
      s += '<circle cx="40" cy="77" r="0.9" fill="' + INK + '"/><circle cx="50" cy="80.5" r="0.9" fill="' + INK + '"/><circle cx="60" cy="77" r="0.9" fill="' + INK + '"/>';
      s += head(50, 52, { brow: '#2d2030' });
      // beard
      s += '<path d="M40 54 Q41 68 50 70 Q59 68 60 54 Q57 62 50 62.5 Q43 62 40 54 Z" fill="#3b2a3e"/>';
      s += '<path d="M46.4 60 q3.6 1.6 7.2 0" stroke="#7a4a3a" stroke-width="1" fill="none" stroke-linecap="round"/>';
      // tall hat
      s += '<path d="M38.5 45 L41 17 Q50 10 59 17 L61.5 45 Z" fill="' + p.robe + '"/>';
      s += '<path d="M41 17 Q50 10 59 17 L58.4 24 Q50 19 41.6 24 Z" fill="' + p.robe2 + '"/>';
      s += '<rect x="38" y="39" width="24" height="6.5" rx="1" fill="' + p.acc + '"/>';
      s += '<path d="M50 23 l3 5 -3 5 -3 -5 Z" fill="' + p.acc + '"/>';
      s += '<circle cx="50" cy="28" r="1.3" fill="#e0484f"/>';
      s += stack(19, 4) + stack(81, 3);
      return s;
    },

    Assassin(p, id, B) {
      let s = '';
      // cloak
      s += shoulders(p.robe, B);
      s += '<path d="M18 ' + B + ' L44 74 L50 ' + B + ' Z" fill="' + p.robe2 + '"/>';
      // red sash
      s += '<path d="M28 80 L76 98 L74 103 L26 85 Z" fill="' + p.acc + '"/>';
      // hood
      s += '<path d="M28 78 Q26 36 50 24 Q74 36 72 78 Q62 72 50 72 Q38 72 28 78 Z" fill="#3a3d47"/>';
      s += '<path d="M50 24 Q64 32 67 50 Q60 34 50 30 Z" fill="#4a4e5a"/>';
      // shadowed face
      s += '<path d="M39 58 Q38 38 50 34 Q62 38 61 58 Q57 68 50 69 Q43 68 39 58 Z" fill="#0b0c10"/>';
      s += '<path d="M42.6 50.6 l5 1.4 M57.4 50.6 l-5 1.4" stroke="' + p.acc + '" stroke-width="1.8" stroke-linecap="round"/>';
      s += '<path d="M43 61 Q50 64 57 61 L57 67 Q50 70 43 67 Z" fill="#20222a"/>'; // face mask
      // dagger, raised
      s += '<g transform="rotate(14 76 90)">' +
        '<path d="M76 52 L80 84 L72 84 Z" fill="#d9dde6"/>' +
        '<path d="M76 52 L76 84 L72 84 Z" fill="#aab0bd"/>' +
        '<rect x="67" y="84" width="18" height="3.2" rx="1.6" fill="' + p.acc + '"/>' +
        '<rect x="74" y="87" width="4" height="10" rx="1.4" fill="#5a2226"/>' +
        '<circle cx="76" cy="98.6" r="2.2" fill="' + p.acc + '"/>' +
        // gloved fist around the grip
        '<rect x="71" y="88" width="10" height="7.5" rx="3" fill="#1a1b21" stroke="#4a4e5a" stroke-width="0.8"/></g>';
      return s;
    },

    Captain(p, id, B) {
      let s = '';
      // anchor emblem behind the figure
      // ship's-wheel halo behind the head
      s += '<g opacity="0.2" stroke="#cfe0ff" fill="none" stroke-linecap="round">' +
        '<circle cx="50" cy="44" r="27" stroke-width="3"/><circle cx="50" cy="44" r="21" stroke-width="1.5"/>';
      for (let a = 0; a < 360; a += 45) {
        const r1 = 27, r2 = 34, c = Math.cos(a * Math.PI / 180), sn = Math.sin(a * Math.PI / 180);
        s += '<path d="M' + (50 + r1 * c).toFixed(1) + ' ' + (44 + r1 * sn).toFixed(1) + ' L' + (50 + r2 * c).toFixed(1) + ' ' + (44 + r2 * sn).toFixed(1) + '" stroke-width="3.4"/>';
      }
      s += '</g>';
      s += shoulders(p.robe, B);
      // lapels and white shirt
      s += '<path d="M40 70 L50 92 L60 70 Z" fill="#e9edf5"/>';
      s += '<path d="M38 70 L46 86 L40 ' + B + ' L33 ' + B + ' Z" fill="' + p.robe2 + '"/>';
      s += '<path d="M62 70 L54 86 L60 ' + B + ' L67 ' + B + ' Z" fill="' + p.robe2 + '"/>';
      // buttons
      for (let i = 0; i < 2; i++) {
        s += '<circle cx="37.5" cy="' + (90 + i * 7) + '" r="1.5" fill="' + p.acc + '"/>';
        s += '<circle cx="62.5" cy="' + (90 + i * 7) + '" r="1.5" fill="' + p.acc + '"/>';
      }
      // epaulettes
      s += '<path d="M16 82 Q22 72 33 72 L33 78 Q24 79 20 86 Z" fill="' + p.acc + '"/>';
      s += '<path d="M84 82 Q78 72 67 72 L67 78 Q76 79 80 86 Z" fill="' + p.acc + '"/>';
      s += '<path d="M18 85 l1 4 M21 82.6 l1 4 M82 85 l-1 4 M79 82.6 l-1 4" stroke="' + p.acc + '" stroke-width="1.2" stroke-linecap="round"/>';
      // gold anchor badge on the coat
      s += '<g transform="translate(19.5 85) scale(0.85)" fill="none" stroke="' + p.acc + '" stroke-width="1.8" stroke-linecap="round">' +
        '<circle cx="8" cy="2.6" r="1.8"/><path d="M8 4.4 V15 M4.6 7.2 H11.4 M2.6 11 Q3.6 15.4 8 15.4 Q12.4 15.4 13.4 11"/></g>';
      s += head(50, 52, { brow: '#3a2a1e', smile: true });
      // moustache
      s += '<path d="M44.6 57.6 Q50 55.2 55.4 57.6 Q52 58.4 50 57.4 Q48 58.4 44.6 57.6 Z" fill="#4a3426"/>';
      // tricorn hat
      s += '<path d="M38 42 Q38 28 50 27 Q62 28 62 42 Z" fill="#14233f"/>';
      s += '<path d="M24 44 Q30 34 38 37 Q50 31 62 37 Q70 34 76 44 Q66 40 58 44 L50 49 L42 44 Q34 40 24 44 Z" fill="#1b2c4f" stroke="' + p.acc + '" stroke-width="1.3" stroke-linejoin="round"/>';
      s += '<circle cx="50" cy="40" r="2.2" fill="' + p.acc + '"/>';
      return s;
    },

    Ambassador(p, id, B) {
      let s = '';
      // swap arrows circling behind the head
      // swap arrows either side of the head: one up, one down
      s += '<g fill="none" stroke="#e9dcb4" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.6">' +
        '<path d="M21 66 V22 M14 29 L21 22 L28 29"/>' +
        '<path d="M79 22 V66 M72 59 L79 66 L86 59"/></g>';
      s += shoulders(p.robe, B);
      // stole
      s += '<path d="M36 70 Q34 88 38 ' + B + ' L45 ' + B + ' Q42 86 44 70 Z" fill="' + p.acc + '"/>';
      s += '<path d="M64 70 Q66 88 62 ' + B + ' L55 ' + B + ' Q58 86 56 70 Z" fill="' + p.acc + '"/>';
      s += '<path d="M44 70 L50 78 L56 70 Z" fill="' + p.robe2 + '"/>';
      s += head(50, 51, { brow: '#2a1e16', smile: true });
      // hair and a soft cap
      s += '<path d="M39.4 50 Q38 37 50 36 Q62 37 60.6 50 Q58 42 50 42 Q42 42 39.4 50 Z" fill="#2a1e16"/>';
      s += '<path d="M39 41 Q40 30 50 29.5 Q60 30 61 41 Q50 37 39 41 Z" fill="' + p.robe2 + '"/>';
      s += '<rect x="38.6" y="39.4" width="22.8" height="3" rx="1.5" fill="' + p.acc + '"/>';
      // scroll held across the chest
      s += '<rect x="30" y="84" width="40" height="11" fill="#efe3c2"/>';
      s += '<path d="M34 87.4 H62 M34 91 H56" stroke="#b9a77a" stroke-width="0.9"/>';
      s += '<ellipse cx="30" cy="89.5" rx="3" ry="6.4" fill="#d8c79c"/><ellipse cx="70" cy="89.5" rx="3" ry="6.4" fill="#d8c79c"/>';
      s += '<circle cx="64" cy="95.6" r="2.6" fill="#c0393f"/>';
      // hands
      s += '<ellipse cx="27" cy="92" rx="3.6" ry="3" fill="' + SKIN + '"/><ellipse cx="73" cy="92" rx="3.6" ry="3" fill="' + SKIN + '"/>';
      return s;
    },

    Contessa(p, id, B) {
      let s = '';
      // long hair behind
      s += '<path d="M36 50 Q34 34 50 32 Q66 34 64 50 Q66 66 70 76 L30 76 Q34 66 36 50 Z" fill="#3a1a14"/>';
      s += shoulders(p.robe, B);
      // neckline
      s += '<path d="M38 70 Q50 86 62 70 Z" fill="' + SKIN + '"/>';
      s += '<path d="M37 70 Q50 88 63 70" fill="none" stroke="' + p.acc + '" stroke-width="1.4"/>';
      // necklace
      s += '<path d="M42 71 Q50 79 58 71" fill="none" stroke="' + p.acc + '" stroke-width="1"/>';
      s += '<circle cx="50" cy="76.6" r="1.8" fill="#9fd3ff"/>';
      s += head(50, 51, { brow: '#3a1a14', smile: true });
      // lips tint
      s += '<path d="M47.4 58.3 q2.6 1.8 5.2 0" stroke="#c0393f" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
      // hair front
      s += '<path d="M39 50 Q38 37 50 37 Q62 37 61 50 Q57 42 50 41.4 Q44 42 39 50 Z" fill="#4a2219"/>';
      // tiara
      s += '<path d="M40 40 L42 32 L45.4 37.4 L50 29 L54.6 37.4 L58 32 L60 40 Q50 37 40 40 Z" fill="' + p.acc + '"/>';
      s += '<circle cx="50" cy="33.4" r="1.4" fill="#e0484f"/>';
      // open fan held in front
      const cx = 62, cy = 100, r = 26;
      let fan = '<path d="M' + cx + ' ' + cy;
      const a0 = 200, a1 = 330;
      const pt = (a, rr) => [cx + rr * Math.cos(a * Math.PI / 180), cy + rr * Math.sin(a * Math.PI / 180)];
      const s0 = pt(a0, r), s1 = pt(a1, r);
      fan += ' L' + s0[0].toFixed(1) + ' ' + s0[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + s1[0].toFixed(1) + ' ' + s1[1].toFixed(1) + ' Z"';
      s += fan + ' fill="#f6ead2" stroke="' + p.acc + '" stroke-width="1.2"/>';
      for (let a = a0 + 13; a < a1; a += 13) {
        const q = pt(a, r - 1);
        s += '<path d="M' + cx + ' ' + cy + ' L' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + '" stroke="' + p.robe2 + '" stroke-width="0.8"/>';
      }
      const inner = pt(a0, 12), inner2 = pt(a1, 12);
      s += '<path d="M' + inner[0].toFixed(1) + ' ' + inner[1].toFixed(1) + ' A12 12 0 0 1 ' + inner2[0].toFixed(1) + ' ' + inner2[1].toFixed(1) + '" fill="none" stroke="' + p.robe + '" stroke-width="2.4"/>';
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="2.4" fill="' + p.acc + '"/>';
      return s;
    },

    Inquisitor(p, id, B) {
      let s = '';
      // all-seeing eye behind
      s += '<g opacity="0.28"><path d="M14 30 Q50 2 86 30 Q50 58 14 30 Z" fill="none" stroke="#d4f1f4" stroke-width="2.4"/>' +
        '<circle cx="50" cy="30" r="9" fill="none" stroke="#d4f1f4" stroke-width="2.4"/></g>';
      s += shoulders(p.robe, B);
      // high cowl collar
      s += '<path d="M30 74 Q28 56 36 50 L40 70 L60 70 L64 50 Q72 56 70 74 Q50 84 30 74 Z" fill="' + p.robe2 + '"/>';
      s += '<path d="M47 76 L50 ' + B + ' L53 76 Z" fill="#1d3f47"/>';
      s += head(50, 52, { brow: '#2a2a2a' });
      // close-cropped cap
      s += '<path d="M39.4 49 Q38.4 37 50 36.4 Q61.6 37 60.6 49 Q58 44 50 43.6 Q42 44 39.4 49 Z" fill="#1d3f47"/>';
      // eye medallion
      s += '<circle cx="50" cy="88" r="6.4" fill="' + p.acc + '"/>';
      s += '<path d="M45 88 Q50 83.6 55 88 Q50 92.4 45 88 Z" fill="' + INK + '"/><circle cx="50" cy="88" r="1.6" fill="' + p.acc + '"/>';
      // lantern held up
      s += '<circle cx="76" cy="76" r="15" fill="url(#' + id + 'l)"/>';
      s += '<path d="M76 58 V62" stroke="#c9ccd6" stroke-width="1.2"/>';
      s += '<path d="M72 60 Q76 55 80 60" fill="none" stroke="#c9ccd6" stroke-width="1.2"/>';
      s += '<path d="M70.6 66 H81.4 L80 64 H72 Z" fill="#2b2f3a"/>';
      s += '<rect x="71" y="66" width="10" height="15" rx="1.5" fill="#ffd27a" stroke="#2b2f3a" stroke-width="1.6"/>';
      s += '<path d="M76 66 V81" stroke="#2b2f3a" stroke-width="1"/>';
      s += '<path d="M76 70.5 q-2 3 0 6 q2 -3 0 -6 Z" fill="#fff6d8"/>';
      s += '<path d="M70 81 H82 L80.6 83.4 H71.4 Z" fill="#2b2f3a"/>';
      s += '<ellipse cx="76" cy="86" rx="4.2" ry="3.4" fill="' + SKIN + '"/>';
      s += '<path d="M72 92 Q73 88 76 88 Q79 88 80 92" fill="none" stroke="' + p.robe + '" stroke-width="4"/>';
      return s;
    },
  };

  // Extra defs a figure needs (gradients), suffixed with the card id.
  function figDefs(c, id) {
    if (c === 'Inquisitor') {
      return '<radialGradient id="' + id + 'l"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.75"/>' +
        '<stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>';
    }
    return '';
  }

  // Rough text width for bold system-ui (em units) so long names can be fit.
  function estWidth(t, size) {
    let w = 0;
    for (const ch of t) w += /[mwMW]/.test(ch) ? 0.9 : /[il1I]/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.7 : 0.57;
    return w * size;
  }

  // ---------------------------------------------------------------- public API
  function card(char, opts) {
    const o = opts || {};
    const c = norm(char);
    if (!c) return back(o);
    const p = PAL[c];
    const id = next();
    const small = !!o.small;
    const w = o.width || (small ? 46 : 100);
    const h = o.height || (small ? 64 : 140);
    const bandTop = small ? 106 : 108; // where the name band starts
    const artBottom = bandTop;

    let s = svgOpen('0 0 100 140', w, h, o, c);
    s += '<defs>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p.bg1 + '"/><stop offset="1" stop-color="' + p.bg2 + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'h" cx="0.5" cy="0.36" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>' +
      '<clipPath id="' + id + 'c"><rect x="4" y="4" width="92" height="' + (artBottom - 4) + '" rx="5"/></clipPath>' +
      figDefs(c, id) + '</defs>';
    // card body
    s += '<rect x="0.75" y="0.75" width="98.5" height="138.5" rx="8" fill="#161a26" stroke="' + p.line + '" stroke-width="1.5"/>';
    // art window
    s += '<g clip-path="url(#' + id + 'c)">';
    s += '<rect x="4" y="4" width="92" height="' + (artBottom - 4) + '" fill="url(#' + id + 'g)"/>';
    s += '<rect x="4" y="4" width="92" height="' + (artBottom - 4) + '" fill="url(#' + id + 'h)"/>';
    // faint diagonal hatching for texture
    s += '<path d="' + (function () {
      let d = '';
      for (let x = -100; x < 100; x += 9) d += 'M' + x + ' 140 L' + (x + 140) + ' 0 ';
      return d;
    })() + '" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>';
    s += FIG[c](p, id, artBottom);
    s += '</g>';
    s += '<rect x="4" y="4" width="92" height="' + (artBottom - 4) + '" rx="5" fill="none" stroke="' + p.line + '" stroke-opacity="0.5" stroke-width="0.8"/>';
    // corner emblem (big card only)
    if (!small) {
      s += '<circle cx="15" cy="15" r="8" fill="' + INK + '" fill-opacity="0.65" stroke="' + p.line + '" stroke-width="0.8"/>';
      s += '<g transform="translate(9.4 9.4) scale(0.7)">' + GLYPH[c] + '</g>';
    }
    // name band
    if (small) {
      const size = 19;
      const ew = estWidth(c, size);
      const fit = ew > 90 ? ' textLength="90" lengthAdjust="spacingAndGlyphs"' : '';
      s += '<text x="50" y="128" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="' + size + '" fill="#e8eaf0"' + fit + '>' + c + '</text>';
    } else {
      const size = 14;
      const fit = estWidth(c, size) > 88 ? ' textLength="88" lengthAdjust="spacingAndGlyphs"' : '';
      s += '<text x="50" y="123.5" text-anchor="middle" font-family="' + FONT + '" font-weight="700" font-size="' + size + '" letter-spacing="0.3" fill="#e8eaf0"' + fit + '>' + c + '</text>';
      const tag = TAGS[c];
      const tfit = estWidth(tag, 6.6) * 0.9 > 90 ? ' textLength="90" lengthAdjust="spacingAndGlyphs"' : '';
      s += '<text x="50" y="133.5" text-anchor="middle" font-family="' + FONT + '" font-weight="600" font-size="6.6" fill="' + p.line + '"' + tfit + '>' + esc(tag) + '</text>';
    }
    s += '</svg>';
    return s;
  }

  function back(opts) {
    const o = opts || {};
    const id = next();
    const small = !!o.small;
    const w = o.width || (small ? 46 : 100);
    const h = o.height || (small ? 64 : 140);
    let s = svgOpen('0 0 100 140', w, h, o, 'Face-down card');
    s += '<defs><pattern id="' + id + 'p" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45 50 70)">' +
      '<rect width="12" height="12" fill="#18213d"/><path d="M0 0 H12 M0 0 V12" stroke="#2b3866" stroke-width="1.2"/>' +
      '<circle cx="6" cy="6" r="1" fill="#f0b354" fill-opacity="0.35"/></pattern></defs>';
    s += '<rect x="0.75" y="0.75" width="98.5" height="138.5" rx="8" fill="#141a30" stroke="#f0b354" stroke-opacity="0.8" stroke-width="1.5"/>';
    s += '<rect x="6" y="6" width="88" height="128" rx="5" fill="url(#' + id + 'p)" stroke="#f0b354" stroke-opacity="0.55" stroke-width="1"/>';
    // central crest: diamond frame, crown, crossed blades
    s += '<path d="M50 34 L80 70 L50 106 L20 70 Z" fill="#141a30" stroke="#f0b354" stroke-width="2"/>';
    s += '<path d="M50 41 L74 70 L50 99 L26 70 Z" fill="none" stroke="#f0b354" stroke-opacity="0.45" stroke-width="1"/>';
    s += '<path d="M37 63 L63 85 M63 63 L37 85" stroke="#9aa6c8" stroke-width="2.2" stroke-linecap="round"/>';
    s += '<path d="M38 78 L39.5 64 L45 70 L50 60 L55 70 L60.5 64 L62 78 Z" fill="#f0b354"/>';
    s += '<rect x="38" y="78" width="24" height="4" rx="1" fill="#f0b354"/>';
    s += '<circle cx="50" cy="59" r="2" fill="#f0b354"/><circle cx="39.5" cy="63" r="1.5" fill="#f0b354"/><circle cx="60.5" cy="63" r="1.5" fill="#f0b354"/>';
    // corner pips
    const pip = (x, y) => '<path d="M' + x + ' ' + (y - 4) + ' l3 4 -3 4 -3 -4 Z" fill="#f0b354" fill-opacity="0.8"/>';
    s += pip(16, 18) + pip(84, 18) + pip(16, 122) + pip(84, 122);
    s += '</svg>';
    return s;
  }

  function coin(size, opts) {
    const n = size || 20;
    let s = svgOpen('0 0 20 20', n, n, opts || {}, null);
    s += '<circle cx="10" cy="10.6" r="9" fill="#a8742a"/>';
    s += '<circle cx="10" cy="9.6" r="9" fill="#f0b354"/>';
    s += '<circle cx="10" cy="9.6" r="6.6" fill="none" stroke="#c88a30" stroke-width="1.1"/>';
    s += '<path d="M6.6 11.8 L7.2 6.8 L8.8 8.6 L10 6 L11.2 8.6 L12.8 6.8 L13.4 11.8 Z" fill="#c88a30"/>';
    s += '<path d="M4.2 6.4 A6.8 6.8 0 0 1 9 2.8" stroke="#fff4d6" stroke-opacity="0.7" stroke-width="1.1" fill="none" stroke-linecap="round"/>';
    s += '</svg>';
    return s;
  }

  function icon(char, size, opts) {
    const c = norm(char);
    const n = size || 16;
    let s = svgOpen('0 0 16 16', n, n, opts || {}, c || null);
    if (!c) {
      s += '<rect x="3" y="1.5" width="10" height="13" rx="2" fill="#18213d" stroke="#f0b354" stroke-width="1"/></svg>';
      return s;
    }
    const bg = c === 'Assassin' ? '#2a2c34' : PAL[c].robe2;
    s += '<circle cx="8" cy="8" r="7.6" fill="' + bg + '" stroke="' + COLORS[c] + '" stroke-width="0.8"/>';
    s += '<g transform="translate(1.6 1.6) scale(0.8)">' + GLYPH[c] + '</g></svg>';
    return s;
  }

  const CoupArt = { COLORS, PALETTE: PAL, TAGS, CHARS, card, back, coin, icon };
  root.CoupArt = CoupArt;
  if (typeof module !== 'undefined' && module.exports) module.exports = CoupArt;
})(typeof window !== 'undefined' ? window : globalThis);
