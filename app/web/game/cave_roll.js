/* Cave Roll - the MNR Launcher's hidden game.

   Opened from the Debug panel: "Open Bohrok Canister" > Open (tick
   Debug at the top of the launcher). Esc closes it.

   A Chrome-dino style runner, but fast: the little guy waits (b_01),
   hops off (b_02), then rolls (b_03), faster and faster, through six
   places, 500 points each, then round again:

     Onu-Koro   the cave: stalagmites and stalactites
     Ta-Koro    the fire cave: stalactites and lava pits
     Po-Koro    out of the cave into the desert: stones
     Ga-Koro    over the ocean: jump from leaf to leaf
     Le-Koro    the forest: trees, bushes and hanging branches
     Ko-Koro    the snow: ice spikes, then back into the cave

   Tap for a short hop, hold for a big jump. Things hanging from above
   sit where a hop passes under them and a big jump does not.

   A swarm of his buddies races along on the ledges further back, some
   passing him, some being passed. Ones that come in after a place
   changes take that place's colours (game/sprites/b_03_0#_<place>.png).

   Everything runs at a fixed 60 ticks a second and is drawn at the
   sprites' own pixel size (one game pixel = one sprite pixel), then
   scaled up with no filtering so it stays crisp and blocky. Every
   sprite shows for 2 ticks; rolling, it turns 22.5 degrees a tick.
   After a game over the restart plays one idle cycle, the hop, then
   rolls.

   Best score is kept per computer by MNR Launcher (state.json). */

(function () {
  "use strict";

  // -- Tuning ---------------------------------------------------------
  const W = 448, H = 144;            // game size in sprite pixels
  const FLOOR = 124;                 // y of the ground
  const CEIL = 12;                   // y of the cave roof (roughly)
  const BALL_X = 56;                 // x of the ball's centre
  const BALL_R = 20.5;               // ball radius (b_03 is 41 px wide)
  const HIT_R = 17;                  // a little forgiving
  const TICK_MS = 1000 / 60;
  const HOLD = 2;                    // ticks each sprite is shown
  const ROLL_STEP = 22.5;            // degrees turned every tick

  const JUMP_V = 4.4;                // jump speed, px per tick
  const GRAVITY = 0.62;              // px per tick per tick
  const BOOST = 0.42;                // lift while the key is held...
  const BOOST_TICKS = 12;            // ...for up to this many ticks
  const FULL_AIR = 28;               // ticks in the air on a full jump
  const HOP_AIR = 17;                // ticks in the air on a tap
  // A tap hops 21-31 px, a held jump 44 px. Hanging things reach down
  // to here, so a hop passes under them and a full jump does not.
  const TIP_MIN = 44, TIP_MAX = 52;

  // Speed (px per tick): picks up fast, then keeps creeping up.
  const SPEED_START = 4.2, SPEED_RUSH = 7.8, SPEED_RUSH_TICKS = 700;
  const SPEED_CREEP = 0.0006, SPEED_MAX = 15;
  const PLACE_POINTS = 500;          // a new place every this many points

  function speedAt(t) {
    return Math.min(SPEED_MAX,
      SPEED_START + SPEED_RUSH * (1 - Math.exp(-t / SPEED_RUSH_TICKS)) + SPEED_CREEP * t);
  }

  // Where each sprite group's feet / ball sit in its 64x64 image.
  const BOTTOM = { b_01: 64, b_02: 57, b_03: 53 };
  const CENTRE_X = { b_01: 32, b_02: 33, b_03: 32.5 };
  const FRAMES = { b_01: 14, b_02: 3, b_03: 3 };

  // -- The places -------------------------------------------------------
  // look: how the background is drawn. ground: "solid" or "water" (only
  // the leaves hold you up). weights: how often each obstacle comes up.
  const ROCK = { light: "#7d7186", base: "#5a5061", dark: "#3b3442", line: "#1a1720" };
  const PLACES = [
    {
      key: "onu", name: "ONU-KORO", title: "#b8f0c8", look: "cave", cave: true, ground: "solid",
      wall: ["#24212c", "#28252f", "#2b2833"],
      far: ["#2d2a36", "#3b3746"], mid: ["#211f29", "#322e3c"], big: ["#1c1a23", "#2a2733"],
      roof: ["#2b2733", "#3a3444", "#0f0e13", "#332e3c", "#25212c"],
      floor: ["#2e2935", "#4b4354", "#3a3443", "#3a3443", "#221e28"],
      glow: { kind: "pulse", cols: ["#2f8a52", "#7dffaa"] },
      spike: ROCK, rim: "#b4a8c4", dust: ["#6b6275", "#4b4354"],
      haze: ["#3b3746", "#322e3c"],
      weights: { tall: 26, short: 16, tapUnder: 16, lone: 12, double: 10, row: 5 }
    },
    {
      key: "ta", name: "TA-KORO", title: "#ffb050", look: "cave", cave: true, ground: "solid",
      wall: ["#2a1916", "#331f1a", "#3a231d"],
      far: ["#3a211b", "#5a3022"], mid: ["#2a1713", "#4a2618"], big: ["#22120f", "#3a1d14"],
      roof: ["#2f1a15", "#5a2a1c", "#120806", "#3e2219", "#26140f"],
      floor: ["#33201a", "#9a4a22", "#5a2c1c", "#4e2a1e", "#22130e"],
      glow: { kind: "pulse", cols: ["#a8401a", "#ffb050"] },
      spike: { light: "#a0705a", base: "#6e4234", dark: "#4a2a22", line: "#1c0d0a" },
      rim: "#ffb050", dust: ["#c0703a", "#7a3a22"],
      haze: ["#5a3022", "#4a2618"],
      weights: { lava: 30, lavaUnder: 22, lone: 16, row: 12 }
    },
    {
      key: "po", name: "PO-KORO", title: "#fff0b0", look: "desert", cave: false, ground: "solid",
      sky: ["#4f9fe6", "#7cbcf0", "#a8d6f6", "#f2e4bc"],
      far: ["#e4bf86", "#f4d8a2"], mid: ["#cf9a5c", "#e8b878"], hill: "#d9b48c",
      floor: ["#d6a75e", "#f2cc84", "#e2b46c", "#c48c48", "#eec27c"],
      glow: { kind: "sun" },
      rock: { light: "#f0cc96", base: "#c08a52", dark: "#8a5a30", line: "#4a3018" },
      rim: "#ffffff", dust: ["#f2d498", "#d6aa66"],
      haze: ["#f4dcae", "#e8c48c"],
      weights: { stone: 30, pebble: 22, stones: 14 }
    },
    {
      key: "ga", name: "GA-KORO", title: "#a0e8ff", look: "ocean", cave: false, ground: "water",
      sky: ["#4592dc", "#72b4ec", "#a6d6f6", "#dcf2ff"],
      sea: ["#2a72b2", "#3f8ccc"], far: ["#3c9a4c", "#72d27a"], mid: ["#2e8a3c", "#5ec464"],
      floor: ["#1c5690", "#58aee8", "#2d74b4", "#3a88c8", "#1a4c80"],
      leaf: { light: "#8ae070", base: "#3fa848", dark: "#2a7a34", line: "#14401c" },
      glow: { kind: "twinkle" },
      rim: "#ffffff", dust: ["#cfeeff", "#8cc8f0"],
      haze: ["#a6d6f6", "#72b4ec"],
      weights: {}
    },
    {
      key: "le", name: "LE-KORO", title: "#c8ff90", look: "forest", cave: false, ground: "solid",
      sky: ["#b4dea4", "#98cc8a", "#7cb870"],
      trunks: "#6c9a64", far: ["#5f8f55", "#80b06a"], mid: ["#3f6a38", "#5a8a48"], big: ["#3a5232", "#4a663e"],
      canopy: ["#2c5426", "#4a8a3a", "#1c3a18"],
      floor: ["#4a3420", "#5aa040", "#3f8a34", "#5a4028", "#3a2816"],
      tree: { trunk: "#6a4a2a", bark: "#4a3018", crown: "#3f8a34", light: "#6ac050", dark: "#2a5a24", line: "#16300f" },
      glow: { kind: "firefly", cols: ["#7aa030", "#e8ff80"] },
      rim: "#ffffff", dust: ["#7a5a38", "#5a4028"],
      haze: ["#a8d29a", "#8cbc7e"],
      weights: { tree: 26, bush: 18, branch: 16, branchOverBush: 14, trees: 8 }
    },
    {
      key: "ko", name: "KO-KORO", title: "#e8f6ff", look: "snow", cave: false, ground: "solid",
      sky: ["#94bfe6", "#b8d6f0", "#d8eafa", "#f2f8ff"],
      mountains: ["#c2d2e6", "#f4f8ff", "#a8bcd6"], far: ["#dce8f4", "#ffffff"], mid: ["#c4d4e6", "#eef4fc"],
      floor: ["#e2ecf6", "#ffffff", "#f0f6fc", "#c8d4e4", "#d6e0ec"],
      spike: { light: "#ffffff", base: "#b8e8ff", dark: "#70b0e0", line: "#305070", shine: "#ffffff" },
      glow: { kind: "snow" },
      rim: "#ffffff", dust: ["#ffffff", "#d6e4f2"],
      haze: ["#e6eef8", "#cfdcec"],
      weights: { iceTall: 24, iceShort: 18, iceDouble: 18, iceTriple: 12 }
    }
  ];

  function placeAt(score) { return Math.floor(score / PLACE_POINTS) % PLACES.length; }

  // -- Pixel font (3 x 5) ---------------------------------------------
  const FONT = {
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111",
    "3": "111001111001111", "4": "101101111001001", "5": "111100111001111",
    "6": "111100111101111", "7": "111001001010010", "8": "111101111101111",
    "9": "111101111001111", "A": "010101111101101", "B": "110101110101110",
    "C": "011100100100011", "D": "110101101101110", "E": "111100110100111",
    "F": "111100110100100", "G": "011100101101011", "H": "101101111101101",
    "I": "111010010010111", "J": "001001001101010", "K": "101101110101101",
    "L": "100100100100111", "M": "101111111101101", "N": "110101101101101",
    "O": "010101101101010", "P": "110101110100100", "Q": "010101101110011",
    "R": "110101110101101", "S": "011100010001110", "T": "111010010010010",
    "U": "101101101101111", "V": "101101101101010", "W": "101101111111101",
    "X": "101101010101101", "Y": "101101010010010", "Z": "111001010100111",
    "-": "000000111000000", ".": "000000000000010", ":": "000010000010000",
    "!": "010010010000010", " ": "000000000000000"
  };

  function textWidth(s, size) { return s.length * 4 * size - size; }

  function drawText(ctx, s, x, y, color, size) {
    // With a dark shadow so it reads on bright skies too.
    size = size || 1;
    s = String(s).toUpperCase();
    for (const [dx, col] of [[size, "rgba(0,0,0,0.55)"], [0, color]]) {
      ctx.fillStyle = col;
      for (let i = 0; i < s.length; i++) {
        const gl = FONT[s[i]] || FONT[" "];
        for (let p = 0; p < 15; p++) {
          if (gl[p] === "1") {
            ctx.fillRect(x + dx + i * 4 * size + (p % 3) * size, y + dx + Math.floor(p / 3) * size, size, size);
          }
        }
      }
    }
  }

  function drawTextCentred(ctx, s, y, color, size) {
    drawText(ctx, s, Math.round((W - textWidth(s, size || 1)) / 2), y, color, size);
  }

  // -- Helpers ----------------------------------------------------------
  function rng(seed) {
    // Seeded random, so each place looks the same every time.
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    return [c, x];
  }

  function wave(x, w, parts) {
    // A wavy line that repeats every w pixels (whole sine periods).
    let v = 0;
    for (const [k, a, ph] of parts) { v += a * Math.sin((2 * Math.PI * k * x) / w + ph); }
    return v;
  }

  function wrap(v, w) { return ((v % w) + w) % w; }

  function spikeRows(x, w, h, down, fill) {
    // A stepped pixel triangle: fill(xStart, y, width) per row.
    for (let row = 0; row < h; row++) {
      const half = ((row + 1) / h) * (w / 2);
      const a = Math.round(x + w / 2 - half), b = Math.round(x + w / 2 + half);
      if (b > a) { fill(a, down ? row : h - 1 - row, b - a); }
    }
  }

  function checker(x, c1, c2) {
    // A 2x2 dither pattern of two colours.
    const [c, cx] = canvas(2, 2);
    cx.fillStyle = c1; cx.fillRect(0, 0, 2, 2);
    cx.fillStyle = c2; cx.fillRect(0, 0, 1, 1); cx.fillRect(1, 1, 1, 1);
    return x.createPattern(c, "repeat");
  }

  function sky(x, w, h, cols) {
    // Bands of colour top to bottom, dithered where they meet.
    for (let y = 0; y < h; y++) {
      const t = (y / (h - 1)) * (cols.length - 1);
      const i = Math.min(cols.length - 2, Math.floor(t)), f = t - i;
      x.fillStyle = f < 0.38 ? cols[i] : f < 0.62 ? checker(x, cols[i], cols[i + 1]) : cols[i + 1];
      x.fillRect(0, y, w, 1);
    }
  }

  function disc(x, cx, cy, r, col) {
    x.fillStyle = col;
    for (let y = -r; y <= r; y++) {
      const half = Math.round(Math.sqrt(r * r - y * y));
      x.fillRect(cx - half, cy + y, half * 2 + 1, 1);
    }
  }

  // -- Background layers ----------------------------------------------------
  // Far to near: the back (sky or cave wall), two ledges the swarm races
  // on, then the play layer (top band and ground). Further = hazier.
  const TILE = W * 2;

  const LAYERS = [
    { f: 0.08 },
    { name: "far", f: 0.22, ground: 86, parts: [[2, 3, 0.3], [5, 2, 1.1], [9, 1.2, 2.4]],
      hazeAmt: 0.5, sat: 0.6, scale: 0.5, swarm: 7, seed: 31 },
    { name: "mid", f: 0.45, ground: 104, parts: [[3, 2.5, 0.8], [7, 1.6, 0.2], [13, 0.8, 1.7]],
      hazeAmt: 0.3, sat: 0.8, scale: 0.75, swarm: 5, seed: 47 }
  ];

  function groundY(layer, worldX) {
    return Math.round(layer.ground + wave(wrap(worldX, TILE), TILE, layer.parts));
  }

  function spots(seed, n, yFn) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const x = Math.floor(r() * TILE);
      out.push({ x, y: yFn(x, r), ph: r() * 6.28, sp: 0.03 + r() * 0.05 });
    }
    return out;
  }

  const BACK_SPOTS = spots(5, 24, (x, r) => Math.floor(30 + r() * 60));
  const SEA_SPOTS = spots(9, 40, (x, r) => Math.floor(74 + r() * 14));
  const LEDGE_SPOTS = LAYERS.map(L => (L.ground ?
    spots(L.seed + 1, 8, (x, r) => groundY(L, x) + 4 + Math.floor(r() * 10)) : []));

  function makeBack(P) {
    const [c, x] = canvas(TILE, H);
    const r = rng(7);
    if (P.look === "cave") {
      x.fillStyle = P.wall[0]; x.fillRect(0, 0, TILE, H);
      for (let i = 0; i < 120; i++) {
        const bx = Math.floor(r() * TILE), by = Math.floor(10 + r() * 100);
        const bw = 6 + Math.floor(r() * 24), bh = 4 + Math.floor(r() * 12);
        x.fillStyle = r() < 0.5 ? P.wall[1] : P.wall[2];
        for (const dx of [-TILE, 0, TILE]) { x.fillRect(bx + dx, by, bw, bh); }
      }
    } else if (P.look === "desert") {
      sky(x, TILE, H, P.sky);
      for (let px = 0; px < TILE; px++) {
        // Flat-topped mesas far away.
        const m = wave(px, TILE, [[3, 1, 0.2], [7, 1, 1.4], [13, 0.6, 0.7]]);
        const top = m > 0.6 ? 54 : m > 0.1 ? 62 : 74;
        x.fillStyle = P.hill; x.fillRect(px, top, 1, H - top);
      }
    } else if (P.look === "ocean") {
      sky(x, TILE, 74, P.sky);
      x.fillStyle = P.sea[0]; x.fillRect(0, 74, TILE, H - 74);
      for (let i = 0; i < 160; i++) {
        x.fillStyle = P.sea[1];
        for (const dx of [-TILE, 0, TILE]) { x.fillRect(Math.floor(r() * TILE) + dx, 75 + Math.floor(r() * 60), 3 + Math.floor(r() * 6), 1); }
      }
      // Little islands on the horizon.
      for (let i = 0; i < 4; i++) {
        const ix = Math.floor(i * (TILE / 4) + r() * 120), iw = 20 + Math.floor(r() * 30);
        spikeRows(ix, iw, 6 + Math.floor(r() * 4), false, (a, y, w) => {
          x.fillStyle = "#3e7e58"; x.fillRect(a, 74 - 8 + y + 2, w, 1);
        });
        x.fillStyle = "#e6d6a6"; x.fillRect(ix + 2, 74, iw - 4, 1);
      }
    } else if (P.look === "forest") {
      sky(x, TILE, H, P.sky);
      for (let i = 0; i < 30; i++) {
        const tx = Math.floor(r() * TILE), tw = 5 + Math.floor(r() * 10);
        x.fillStyle = P.trunks;
        for (const dx of [-TILE, 0, TILE]) { x.fillRect(tx + dx, 0, tw, H); }
      }
    } else if (P.look === "snow") {
      sky(x, TILE, H, P.sky);
      for (let px = 0; px < TILE; px++) {
        // Snowy mountains: pointy peaks with white caps.
        const peak = Math.abs(wave(px, TILE, [[5, 1, 0.3], [11, 0.5, 1.2]]));
        const top = Math.round(78 - peak * 34);
        x.fillStyle = P.mountains[0]; x.fillRect(px, top, 1, H - top);
        if (top < 64) { x.fillStyle = P.mountains[1]; x.fillRect(px, top, 1, Math.min(10, 64 - top)); }
        x.fillStyle = P.mountains[2]; if ((px % 7) === 0 && top < 70) { x.fillRect(px, top + 10, 1, 6); }
      }
    }
    return c;
  }

  function makeLedge(L, P) {
    // The swarm rolls on its top. Nothing here can be hit.
    const [c, x] = canvas(TILE, H);
    const col = P[L.name];
    if (P.look === "cave") {
      for (let px = 0; px < TILE; px++) {
        const roof = Math.round(6 + L.ground / 14 + wave(px, TILE, [[4, 2, L.seed], [9, 1.3, 0.5]]));
        x.fillStyle = col[0]; x.fillRect(px, 0, 1, roof);
      }
    }
    if (L.name === "mid" && (P.look === "cave" || P.look === "forest")) {
      // A few big stalactites (or big tree trunks) behind the play.
      const r = rng(83);
      for (let i = 0; i < 5; i++) {
        const sx = Math.floor(i * (TILE / 5) + r() * 80), sw = 26 + Math.floor(r() * 18), sh = 40 + Math.floor(r() * 22);
        if (P.look === "cave") {
          spikeRows(sx, sw, sh, true, (a, y, w) => {
            x.fillStyle = P.big[0]; x.fillRect(a, y + 6, w, 1);
            x.fillStyle = P.big[1]; x.fillRect(a, y + 6, Math.max(1, Math.floor(w / 5)), 1);
          });
        } else {
          const tw = 14 + Math.floor(r() * 10);
          x.fillStyle = P.big[0]; x.fillRect(sx, 0, tw, H);
          x.fillStyle = P.big[1]; x.fillRect(sx, 0, 2, H);
        }
      }
    }
    for (let px = 0; px < TILE; px++) {
      const gy = groundY(L, px);
      if (P.look === "ocean") {
        // A chain of floating leaves on the water.
        x.fillStyle = col[0]; x.fillRect(px, gy, 1, L.name === "far" ? 4 : 6);
        x.fillStyle = col[1]; x.fillRect(px, gy, 1, 1);
        x.fillStyle = L.name === "far" ? P.sea[0] : "#24649e";
        x.fillRect(px, gy + (L.name === "far" ? 4 : 6), 1, H);
      } else {
        x.fillStyle = col[0]; x.fillRect(px, gy, 1, H - gy);
        x.fillStyle = col[1]; x.fillRect(px, gy, 1, 1);
      }
    }
    return c;
  }

  function makeTop(P) {
    // The roof of a cave or the forest canopy. Outside: nothing.
    if (P.look !== "cave" && P.look !== "forest") { return null; }
    const [c, x] = canvas(TILE, 34);
    const r = rng(11);
    if (P.look === "cave") {
      const parts = [[4, 2.2, 0.4], [10, 1.4, 1.3], [22, 0.9, 2.1], [34, 0.6, 0.2]];
      for (let px = 0; px < TILE; px++) {
        const edge = Math.round(CEIL + wave(px, TILE, parts));
        x.fillStyle = P.roof[0]; x.fillRect(px, 0, 1, edge);
        x.fillStyle = P.roof[1]; x.fillRect(px, edge - 2, 1, 1);
        x.fillStyle = P.roof[2]; x.fillRect(px, edge, 1, 1);
      }
      for (let i = 0; i < 120; i++) {
        x.fillStyle = r() < 0.5 ? P.roof[3] : P.roof[4];
        x.fillRect(Math.floor(r() * TILE), Math.floor(r() * (CEIL - 4)), 2, 1);
      }
    } else {
      // Leafy canopy with a bumpy edge.
      for (let px = 0; px < TILE; px++) {
        const edge = Math.round(CEIL + 2 + Math.abs(wave(px, TILE, [[30, 3, 0.4], [70, 1.5, 1.1]])));
        x.fillStyle = P.canopy[0]; x.fillRect(px, 0, 1, edge);
        x.fillStyle = P.canopy[2]; x.fillRect(px, edge, 1, 1);
      }
      for (let i = 0; i < 220; i++) {
        x.fillStyle = P.canopy[1];
        x.fillRect(Math.floor(r() * TILE), Math.floor(r() * (CEIL + 2)), 2, 1);
      }
    }
    return c;
  }

  function makeFloor(P) {
    const [c, x] = canvas(TILE, H - FLOOR);
    const r = rng(23);
    x.fillStyle = P.floor[0]; x.fillRect(0, 0, TILE, H - FLOOR);
    x.fillStyle = P.floor[1]; x.fillRect(0, P.ground === "water" ? 3 : 0, TILE, 1);
    x.fillStyle = P.floor[2]; x.fillRect(0, P.ground === "water" ? 4 : 1, TILE, 1);
    for (let i = 0; i < 180; i++) {
      const px = Math.floor(r() * TILE), py = 6 + Math.floor(r() * (H - FLOOR - 7));
      x.fillStyle = r() < 0.6 ? P.floor[3] : P.floor[4];
      x.fillRect(px, py, 1 + Math.floor(r() * 3), 1);
    }
    if (P.ground === "water") { x.clearRect(0, 0, TILE, 3); }
    return c;
  }

  // -- Obstacles ----------------------------------------------------------
  // kinds: "up" / "down" (pixel triangles), "box" (stones, trees,
  // branches: hit as a rectangle), "pit" (lava), "leaf" (Ga-Koro ground).
  function makeSpike(w, h, down, seed, C) {
    // A stepped pixel triangle, lit from the left. Ice gets a shine line.
    const [c, x] = canvas(w, h);
    const r = rng(seed);
    for (let row = 0; row < h; row++) {
      const half = ((row + 1) / h) * (w / 2);
      const a = Math.round(w / 2 - half), b = Math.round(w / 2 + half);
      const y = down ? h - 1 - row : row;
      if (b <= a) { continue; }
      x.fillStyle = C.line; x.fillRect(a, y, b - a, 1);
      if (b - a > 2) {
        x.fillStyle = C.base; x.fillRect(a + 1, y, b - a - 2, 1);
        x.fillStyle = C.light; x.fillRect(a + 1, y, Math.max(1, Math.floor((b - a) / 4)), 1);
        const d = Math.max(1, Math.floor((b - a) / 5));
        x.fillStyle = C.dark; x.fillRect(b - 1 - d, y, d, 1);
        if (C.shine && b - a > 5) { x.fillStyle = C.shine; x.fillRect(Math.round(w / 2) - 1, y, 1, 1); }
      }
      if (!C.shine && r() < 0.12 && b - a > 4) {
        x.fillStyle = C.dark; x.fillRect(a + 2 + Math.floor(r() * (b - a - 4)), y, 1, 1);
      }
    }
    return c;
  }

  function makeStone(w, h, C) {
    // A rounded stone, half sunk in the sand.
    const [c, x] = canvas(w, h);
    for (let y = 0; y < h; y++) {
      const dy = (h - y) / h;
      const half = (w / 2) * Math.sqrt(Math.max(0, 1 - dy * dy * 0.85));
      const a = Math.round(w / 2 - half), b = Math.round(w / 2 + half);
      if (b <= a) { continue; }
      x.fillStyle = C.line; x.fillRect(a, y, b - a, 1);
      if (b - a > 2 && y > 0) {
        x.fillStyle = C.base; x.fillRect(a + 1, y, b - a - 2, 1);
        x.fillStyle = C.light; x.fillRect(a + 1, y, Math.max(1, Math.floor((b - a) / 3)), 1);
        x.fillStyle = C.dark; x.fillRect(b - 1 - Math.max(1, Math.floor((b - a) / 5)), y, Math.max(1, Math.floor((b - a) / 5)), 1);
      }
    }
    return c;
  }

  function makeTree(w, h, C) {
    // A small tree or bush: trunk and a round crown.
    const [c, x] = canvas(w, h);
    const tw = Math.max(3, Math.round(w * 0.3)), cr = Math.floor(w / 2);
    const crownY = Math.min(h - cr, cr);
    x.fillStyle = C.bark; x.fillRect(Math.round(w / 2 - tw / 2) - 1, crownY, tw + 2, h - crownY);
    x.fillStyle = C.trunk; x.fillRect(Math.round(w / 2 - tw / 2), crownY, tw, h - crownY);
    disc(x, cr, crownY, cr, C.line);
    disc(x, cr, crownY, cr - 1, C.crown);
    disc(x, cr - 2, crownY - 2, Math.max(1, cr - 4), C.light);
    x.fillStyle = C.dark; x.fillRect(cr + 1, crownY + 2, Math.max(1, cr - 3), 2);
    return c;
  }

  function makeBranch(w, tip, C) {
    // A branch hanging from the canopy with a clump of leaves.
    const [c, x] = canvas(w, tip);
    const cr = Math.floor(w / 2);
    x.fillStyle = C.bark; x.fillRect(cr - 1, 0, 3, tip - cr);
    x.fillStyle = C.trunk; x.fillRect(cr, 0, 1, tip - cr);
    disc(x, cr, tip - cr - 1, cr, C.line);
    disc(x, cr, tip - cr - 1, cr - 1, C.crown);
    disc(x, cr - 2, tip - cr - 3, Math.max(1, cr - 4), C.light);
    return c;
  }

  function makeLeaf(w, C) {
    // A big floating leaf, rounded at the ends, with a vein.
    const h = 7;
    const [c, x] = canvas(w, h);
    for (let y = 0; y < h; y++) {
      const inset = y === 0 ? 4 : y === 1 ? 2 : y === h - 1 ? 3 : y === h - 2 ? 1 : 0;
      x.fillStyle = y === 0 ? C.line : y === 1 ? C.light : y < h - 2 ? C.base : C.dark;
      x.fillRect(inset, y, w - inset * 2, 1);
    }
    x.fillStyle = C.line; x.fillRect(0, 2, 1, 3); x.fillRect(w - 1, 2, 1, 3);
    x.fillStyle = C.dark; x.fillRect(6, 3, w - 12, 1);
    return c;
  }

  function place() { return PLACES[g.place]; }

  function up(x, w, h) {
    const P = place();
    return { kind: "up", x, w, h, img: makeSpike(w, h, false, (x * 7 + h) | 0, P.spike) };
  }

  function down(x, w, tip) {
    const top = CEIL - 6;
    return { kind: "down", x, w, h: tip - top, top, img: makeSpike(w, tip - top, true, (x * 3 + tip) | 0, place().spike) };
  }

  function box(x, w, h, top, img) {
    // top: y of its top edge (hanging ones start at 0).
    return { kind: "box", x, w, h, top, img };
  }

  function pit(x, w) { return { kind: "pit", x, w, place: g.place }; }

  function leaf(x, w) { return { kind: "leaf", x, w, img: makeLeaf(Math.round(w), PLACES[3].leaf) }; }

  function triangle(o) {
    if (o.kind === "up") { return [[o.x, FLOOR], [o.x + o.w, FLOOR], [o.x + o.w / 2, FLOOR - o.h]]; }
    return [[o.x, o.top], [o.x + o.w, o.top], [o.x + o.w / 2, o.top + o.h]];
  }

  function circleHitsTriangle(cx, cy, r, t) {
    // Inside it, or close enough to an edge.
    function side(p, a, b) { return (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]); }
    const p = [cx, cy];
    const d1 = side(p, t[0], t[1]), d2 = side(p, t[1], t[2]), d3 = side(p, t[2], t[0]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) { return true; }
    for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const k = Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cy - a[1]) * dy) / (dx * dx + dy * dy)));
      const ex = a[0] + k * dx - cx, ey = a[1] + k * dy - cy;
      if (ex * ex + ey * ey < r * r) { return true; }
    }
    return false;
  }

  function circleHitsBox(cx, cy, r, o) {
    const nx = Math.max(o.x + 1, Math.min(cx, o.x + o.w - 1));
    const ny = Math.max(o.top + 1, Math.min(cy, o.top + o.h));
    return (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) < r * r;
  }

  // -- Which place is where -----------------------------------------------
  // While changing place, everything right of g.bx is the new place and
  // everything left of it the old one. g.bx moves left with the ground.
  function placeAtX(x) { return PLACES[x >= g.bx ? g.place : g.prev]; }

  function solidAt(x) {
    // Is there ground under x? Lava pits and open water are not.
    if (placeAtX(x).ground === "water") {
      for (const o of g.obstacles) {
        if (o.kind === "leaf" && x > o.x + 4 && x < o.x + o.w - 4) { return true; }
      }
      return false;
    }
    for (const o of g.obstacles) {
      if (o.kind === "pit" && x > o.x + 6 && x < o.x + o.w - 6) { return false; }
    }
    return true;
  }

  // -- State --------------------------------------------------------------
  let overlay = null, view = null, ctx = null, sprites = {}, loaded = false;
  let art = [];                      // per place: { back, ledges, top, floor, swarm }
  let running = false, raf = 0, lastTime = 0, acc = 0;
  let g = null, best = 0, keyHeld = false, clock = 0, swarmSpeed = 0;

  function reset(state) {
    g = {
      state,                 // "idle" | "ready" | "hop" | "roll" | "fall" | "dead"
      tick: 0,               // ticks in this state
      rollTicks: 0,          // ticks spent rolling (sets the speed)
      speed: 0,
      scroll: 0,             // how far the world has moved
      y: 0, vy: 0, air: 0,   // height above the ground (up is +), ticks in the air
      angle: 0,
      obstacles: [],
      untilNext: 260,
      leafEnd: 0,            // right end of the last leaf (Ga-Koro)
      score: 0,
      deadTick: 0,
      newBest: false,
      fallInto: "",
      dust: [], embers: [], snow: [],
      place: 0, prev: 0, bx: -1e9, mouth: false, banner: 0
    };
  }

  function loadSprites(done) {
    const names = [];
    for (const group of Object.keys(FRAMES)) {
      for (let i = 1; i <= FRAMES[group]; i++) { names.push(group + "_" + String(i).padStart(2, "0")); }
    }
    for (const P of PLACES) {
      if (P.key === "le") { continue; }
      for (let i = 1; i <= FRAMES.b_03; i++) { names.push("b_03_0" + i + "_" + P.key); }
    }
    let left = names.length;
    for (const n of names) {
      const img = new Image();
      img.onload = img.onerror = () => { if (--left === 0) { loaded = true; done(); } };
      img.src = "game/sprites/" + n + ".png";
      sprites[n] = img;
    }
  }

  function sprite(group, tick) {
    // Each sprite shows for HOLD ticks.
    const i = Math.floor(tick / HOLD) % FRAMES[group];
    return sprites[group + "_" + String(i + 1).padStart(2, "0")];
  }

  function makeArt() {
    // Every place's layers, plus hazy, smaller copies of that place's
    // coloured roll sprites for the swarm on each ledge.
    art = PLACES.map(P => {
      const swarm = LAYERS.map((L, li) => {
        if (!L.swarm) { return null; }
        const size = Math.round(64 * L.scale);
        const out = [];
        for (let i = 1; i <= FRAMES.b_03; i++) {
          const src = sprites["b_03_0" + i + (P.key === "le" ? "" : "_" + P.key)];
          const [c, x] = canvas(size, size);
          x.filter = "saturate(" + L.sat + ")";
          x.drawImage(src, 0, 0, size, size);
          x.filter = "none";
          x.globalCompositeOperation = "source-atop";
          x.globalAlpha = L.hazeAmt;
          x.fillStyle = P.haze[li - 1];
          x.fillRect(0, 0, size, size);
          out.push(c);
        }
        return out;
      });
      return {
        back: makeBack(P),
        ledges: LAYERS.map(L => (L.ground ? makeLedge(L, P) : null)),
        top: makeTop(P), floor: makeFloor(P), swarm
      };
    });
  }

  // -- The swarm: one big race ------------------------------------------------
  function pickPace(b, side) {
    // Fast ones come from behind and pass you, slow ones come in ahead
    // and get passed, the rest keep pace. Each takes the colours of the
    // place it comes in at.
    b.place = g.place;
    if (side === "behind") { b.pace = 1.3 + Math.random() * 0.5; }
    else if (side === "ahead") { b.pace = 0.5 + Math.random() * 0.3; }
    else {
      const r = Math.random();
      b.pace = r < 0.35 ? 1.3 + Math.random() * 0.5 : r < 0.7 ? 0.5 + Math.random() * 0.3 : 0.92 + Math.random() * 0.16;
    }
  }

  function makeSwarm() {
    for (const L of LAYERS) {
      if (!L.swarm) { continue; }
      L.balls = [];
      for (let i = 0; i < L.swarm; i++) {
        const b = { x: (i + Math.random() * 0.7) * (W / L.swarm), tick: Math.floor(Math.random() * 6),
          angle: Math.floor(Math.random() * 16) * ROLL_STEP, hop: 0, hopV: 0, pace: 1, place: 0 };
        pickPace(b);
        L.balls.push(b);
      }
    }
  }

  function updateSwarm() {
    // They roll at their own pace times the swarm's speed. While you are
    // rolling that is your speed; when you stop they keep the speed you
    // had and roll on past.
    if (g.state === "roll" || g.state === "fall") { swarmSpeed = g.speed; }
    else if (g.state !== "dead") { swarmSpeed += (2.2 - swarmSpeed) * 0.01; }
    for (const L of LAYERS) {
      if (!L.balls) { continue; }
      const k = 0.5 + L.f;           // how much a speed difference shows on screen
      for (const b of L.balls) {
        b.tick++;
        b.angle = (b.angle + ROLL_STEP) % 360;
        b.x += (swarmSpeed * b.pace - g.speed) * k;
        if (b.x > W + 30) { b.x = -30 - Math.random() * 60; pickPace(b, "behind"); }
        if (b.x < -90) { b.x = W + 20 + Math.random() * 60; pickPace(b, "ahead"); }
        // The odd little bounce.
        if (b.hop <= 0 && Math.random() < 0.006) { b.hopV = 1.6 + Math.random() * 1.4; b.hop = 0.01; }
        if (b.hop > 0) { b.hop += b.hopV; b.hopV -= 0.18; if (b.hop <= 0) { b.hop = 0; } }
      }
    }
  }

  // -- Play -----------------------------------------------------------------
  function jumpPressed() {
    if (!g) { return; }
    if (g.state === "idle") { g.state = "hop"; g.tick = 0; return; }
    if (g.state === "dead") {
      if (g.deadTick > 30) { reset("ready"); }
      return;
    }
    if (g.state === "roll" && g.y <= 0) { g.vy = JUMP_V; g.air = 0; g.y = 0.01; }
  }

  function addLeaf(first) {
    // Ga-Koro: the next leaf after a gap of water. Small gaps take a hop,
    // big ones a full jump.
    const hard = Math.min(1, (g.speed - SPEED_START) / (SPEED_MAX - SPEED_START));
    const hopReach = HOP_AIR * g.speed, jumpReach = FULL_AIR * g.speed;
    const gap = first ? 0 : Math.random() < 0.5 ?
      18 + Math.random() * Math.max(4, hopReach * 0.45 - 18) :
      hopReach * 0.45 + Math.random() * Math.max(4, jumpReach * 0.55 - hopReach * 0.45);
    const w = first ? 260 : Math.max(44, (60 + Math.random() * 110) * (1 - hard * 0.35));
    g.obstacles.push(leaf(g.leafEnd + gap, w));
    g.leafEnd += gap + w;
  }

  function spawn() {
    // A pattern just off the right edge, picked by this place's weights.
    const x0 = W + 8;
    const P = place();
    const hard = Math.min(1, (g.speed - SPEED_START) / (SPEED_MAX - SPEED_START));
    const R = n => Math.floor(Math.random() * n);
    const tip = () => TIP_MIN + R(TIP_MAX - TIP_MIN + 1);
    const hopReach = HOP_AIR * g.speed, jumpReach = FULL_AIR * g.speed;
    let extra = 0;
    const T = P.tree, push = o => g.obstacles.push(o);

    const PATTERNS = {
      // Onu-Koro
      tall: () => push(up(x0, 14 + R(6), 22 + R(12))),
      short: () => push(up(x0, 10 + R(4), 9 + R(6))),
      tapUnder: () => { push(up(x0, 10 + R(3), 9 + R(5))); push(down(x0 + 4 + R(10), 12 + R(4), tip())); },
      lone: () => push(down(x0, 12 + R(6), tip())),
      double: () => { push(up(x0, 12, 18 + R(6))); push(up(x0 + 22 + R(10), 12, 16 + R(8))); },
      row: () => {
        const n = 2 + R(2), gap = 26 + R(14);
        for (let i = 0; i < n; i++) { push(down(x0 + i * gap, 12 + R(5), tip())); }
        extra = n * gap;
      },
      // Ta-Koro: lava pits, and stalactites over some of them.
      lava: () => {
        const w = Math.round(Math.max(26, Math.min(jumpReach * 0.55, 30 + Math.random() * jumpReach * 0.4)));
        push(pit(x0, w)); extra = w;
      },
      lavaUnder: () => {
        const w = Math.round(Math.max(24, Math.min(hopReach * 0.5, 28 + Math.random() * hopReach * 0.3)));
        push(pit(x0, w)); push(down(x0 + Math.round(w / 2) - 7, 14, tip())); extra = w;
      },
      // Po-Koro: stones.
      stone: () => { const w = 22 + R(12), h = 20 + R(12); push(box(x0, w, h, FLOOR - h, makeStone(w, h, P.rock))); },
      pebble: () => { const w = 14 + R(6), h = 8 + R(6); push(box(x0, w, h, FLOOR - h, makeStone(w, h, P.rock))); },
      stones: () => {
        const w1 = 16 + R(6), h1 = 12 + R(6), w2 = 18 + R(8), h2 = 16 + R(8);
        push(box(x0, w1, h1, FLOOR - h1, makeStone(w1, h1, P.rock)));
        push(box(x0 + w1 + 6 + R(8), w2, h2, FLOOR - h2, makeStone(w2, h2, P.rock)));
      },
      // Le-Koro: trees, bushes and hanging branches.
      tree: () => { const w = 14 + R(6), h = 24 + R(10); push(box(x0, w, h, FLOOR - h, makeTree(w, h, T))); },
      bush: () => { const w = 12 + R(6), h = 9 + R(5); push(box(x0, w, h, FLOOR - h, makeTree(w, h, T))); },
      branch: () => { const w = 14 + R(6), t = tip(); push(box(x0, w, t, 0, makeBranch(w, t, T))); },
      branchOverBush: () => {
        const w = 12 + R(4), h = 9 + R(4), bw = 14 + R(4), t = tip();
        push(box(x0, w, h, FLOOR - h, makeTree(w, h, T)));
        push(box(x0 + 4 + R(10), bw, t, 0, makeBranch(bw, t, T)));
      },
      trees: () => {
        const h1 = 18 + R(6), h2 = 16 + R(8);
        push(box(x0, 14, h1, FLOOR - h1, makeTree(14, h1, T)));
        push(box(x0 + 24 + R(10), 14, h2, FLOOR - h2, makeTree(14, h2, T)));
      },
      // Ko-Koro: ice spikes, lots of them.
      iceTall: () => push(up(x0, 12 + R(6), 22 + R(12))),
      iceShort: () => push(up(x0, 9 + R(4), 9 + R(6))),
      iceDouble: () => { push(up(x0, 11, 16 + R(8))); push(up(x0 + 16 + R(8), 11, 18 + R(8))); },
      iceTriple: () => {
        for (let i = 0; i < 3; i++) { push(up(x0 + i * (14 + R(4)), 10, 10 + R(10))); }
        extra = 30;
      }
    };

    let total = 0;
    const list = [];
    for (const k of Object.keys(P.weights)) {
      let wgt = P.weights[k];
      if (k === "lone" || k === "row") { wgt *= 1 - hard * 0.3; }
      if (wgt > 0) { list.push([k, wgt]); total += wgt; }
    }
    let pick = Math.random() * total;
    for (const [k, wgt] of list) {
      pick -= wgt;
      if (pick <= 0) { PATTERNS[k](); break; }
    }
    // Room to land before the next one.
    g.untilNext = jumpReach + 50 + extra + Math.random() * (150 - 70 * hard);
  }

  function changePlace(to) {
    // The new place comes in from the right edge. Out of or into a cave,
    // a cave mouth goes by.
    const from = g.place;
    if (PLACES[from].ground === "water" && g.leafEnd < W + 40) {
      // A last leaf right up to the shore.
      g.obstacles.push(leaf(g.leafEnd - 4, W + 48 - g.leafEnd));
      g.leafEnd = W + 44;
    }
    g.prev = from; g.place = to;
    g.bx = W + 8;
    g.mouth = PLACES[from].cave !== PLACES[to].cave;
    g.banner = 150;
    g.untilNext = Math.max(g.untilNext, 40);
    if (PLACES[to].ground === "water") {
      g.leafEnd = g.bx - 6;
      addLeaf(true);
    }
  }

  function die() {
    g.state = "dead";
    g.deadTick = 0;
    const s = Math.floor(g.score);
    if (s > best) { best = s; g.newBest = true; saveBest(s); }
  }

  function update() {
    clock++;
    g.tick++;
    updateSwarm();
    for (const d of g.dust) { d.x -= d.vx; d.y -= d.vy; d.vy -= 0.05; d.life--; }
    g.dust = g.dust.filter(d => d.life > 0);
    for (const e of g.embers) { e.x -= g.speed; e.y -= e.vy; e.life--; }
    g.embers = g.embers.filter(e => e.life > 0);
    // Snow in Ko-Koro.
    for (const f of g.snow) { f.x -= f.vx + g.speed * 0.6; f.y += f.vy; }
    g.snow = g.snow.filter(f => f.y < H && f.x > -4);
    if (place().glow.kind === "snow" && g.snow.length < 70) {
      g.snow.push({ x: Math.random() * (W + 120), y: -2, vx: 0.3 + Math.random() * 0.6, vy: 0.4 + Math.random() * 0.6 });
    }
    if (g.banner > 0) { g.banner--; }

    if (g.state === "idle") { return; }
    if (g.state === "ready") {
      // After a game over: one idle cycle, then the hop.
      if (g.tick >= FRAMES.b_01 * HOLD) { g.state = "hop"; g.tick = 0; }
      return;
    }
    if (g.state === "hop") {
      if (g.tick >= FRAMES.b_02 * HOLD) { g.state = "roll"; g.tick = 0; }
      return;
    }
    if (g.state === "dead") {
      g.deadTick++;
      g.speed = g.speed > 0.2 ? g.speed * 0.9 : 0;
      return;
    }

    // Rolling (or dropping in): the world moves every tick, the ball
    // turns 22.5 degrees.
    g.rollTicks++;
    g.speed = speedAt(g.rollTicks);
    g.scroll += g.speed;
    g.angle = (g.angle + ROLL_STEP) % 360;
    for (const o of g.obstacles) { o.x -= g.speed; }
    g.obstacles = g.obstacles.filter(o => o.x + o.w > -4);
    g.leafEnd -= g.speed;
    if (g.bx > -1e8) {
      g.bx -= g.speed;
      if (g.bx < -80) { g.bx = -1e9; g.prev = g.place; }
    }

    // Embers rising out of lava pits.
    for (const o of g.obstacles) {
      if (o.kind === "pit" && Math.random() < 0.25 && o.x < W) {
        g.embers.push({ x: o.x + 4 + Math.random() * (o.w - 8), y: FLOOR + 6, vy: 0.4 + Math.random() * 0.8,
          life: 14 + Math.floor(Math.random() * 16) });
      }
    }

    if (g.state === "fall") {
      g.vy -= GRAVITY;
      g.y += g.vy;
      if (g.y < -BALL_R * 2 - 10) { die(); }
      return;
    }

    g.score += g.speed / 10;
    const p = placeAt(g.score);
    if (p !== g.place) { changePlace(p); }
    if (place().ground === "water") { while (g.leafEnd < W + 80) { addLeaf(false); } }

    // Jump: holding the key keeps it floaty, a tap is a short hop.
    let dropped = false;
    if (g.y > 0) {
      g.y += g.vy;
      g.air++;
      g.vy -= GRAVITY;
      if (keyHeld && g.air <= BOOST_TICKS && g.vy > 0) { g.vy += BOOST; }
      if (g.y <= 0) {
        if (solidAt(BALL_X)) { g.y = 0; g.vy = 0; } else { dropped = true; }
      }
    } else if (!solidAt(BALL_X)) {
      dropped = true; g.vy = 0; g.y = 0;
    }
    if (dropped) {
      g.state = "fall";
      g.fallInto = placeAtX(BALL_X).ground === "water" ? "water" : "pit";
      if (g.fallInto === "water") {
        for (let i = 0; i < 10; i++) {
          g.dust.push({ x: BALL_X - 12 + Math.random() * 24, y: FLOOR + 2, vx: Math.random() * 2 - 1 + g.speed * 0.2,
            vy: 1 + Math.random() * 2, life: 14 + Math.floor(Math.random() * 8), col: "#cfeeff" });
        }
      }
      return;
    }

    // Dust kicked up when on the ground.
    if (g.y <= 0 && g.tick % 2 === 0) {
      const D = placeAtX(BALL_X).dust;
      g.dust.push({ x: BALL_X - 14 + Math.random() * 6, y: FLOOR - 1, vx: g.speed * 0.35 + Math.random(),
        vy: 0.4 + Math.random() * 0.8, life: 10 + Math.floor(Math.random() * 8), col: D[0], col2: D[1] });
    }

    g.untilNext -= g.speed;
    if (g.untilNext <= 0) {
      if (place().ground === "water") { g.untilNext = 200; } else { spawn(); }
    }

    const cy = FLOOR - BALL_R - g.y;
    for (const o of g.obstacles) {
      if ((o.kind === "up" || o.kind === "down") && circleHitsTriangle(BALL_X, cy, HIT_R, triangle(o))) { die(); break; }
      if (o.kind === "box" && circleHitsBox(BALL_X, cy, HIT_R, o)) { die(); break; }
    }
  }

  // -- Drawing ----------------------------------------------------------------
  function tile(img, offset, y) {
    const o = Math.floor(wrap(offset, img.width));
    ctx.drawImage(img, -o, y);
    if (img.width - o < W) { ctx.drawImage(img, img.width - o, y); }
  }

  function inside(x0, x1, fn) {
    // Draw only between x0 and x1.
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.round(x0), 0, Math.round(x1 - x0), H);
    ctx.clip();
    fn();
    ctx.restore();
  }

  function eachSide(fn, fade) {
    // fn(place index) for the old place left of g.bx and the new place
    // right of it. fade: the new place fades in over the old one
    // instead (far layers when not going through a cave mouth).
    if (g.bx < -1e8) { fn(g.place); return; }
    if (fade && !g.mouth) {
      fn(g.prev);
      ctx.globalAlpha = Math.max(0, Math.min(1, (W + 8 - g.bx) / (W + 8)));
      fn(g.place);
      ctx.globalAlpha = 1;
      return;
    }
    inside(-1, g.bx, () => fn(g.prev));
    inside(g.bx, W + 1, () => fn(g.place));
  }

  function pulse(spotList, offset, cols) {
    // Glowing bits, gently pulsing.
    for (const c of spotList) {
      const x = Math.round(wrap(c.x - offset, TILE));
      if (x > W + 2) { continue; }
      const a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(clock * c.sp + c.ph));
      const was = ctx.globalAlpha;
      ctx.globalAlpha = was * a * 0.5;
      ctx.fillStyle = cols[0];
      ctx.fillRect(x - 1, c.y, 3, 1); ctx.fillRect(x, c.y - 1, 1, 3);
      ctx.globalAlpha = was * a;
      ctx.fillStyle = cols[1];
      ctx.fillRect(x, c.y, 1, 1);
      ctx.globalAlpha = was;
    }
  }

  function drawBack(pi, s) {
    const P = PLACES[pi], A = art[pi];
    tile(A.back, s * LAYERS[0].f, 0);
    const G = P.glow;
    if (G.kind === "pulse") { pulse(BACK_SPOTS, s * LAYERS[0].f, G.cols); }
    if (G.kind === "twinkle") {
      for (const c of SEA_SPOTS) {
        if (Math.sin(clock * c.sp * 2 + c.ph) > 0.85) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(Math.round(wrap(c.x - s * 0.12, TILE)), c.y, 2, 1);
        }
      }
    }
    if (G.kind === "sun") {
      // The sun, fixed in the sky.
      const was = ctx.globalAlpha;
      ctx.globalAlpha = was * 0.35; disc(ctx, W - 64, 28, 15, "#fff2a8");
      ctx.globalAlpha = was; disc(ctx, W - 64, 28, 11, "#fff8c8"); disc(ctx, W - 64, 28, 8, "#fffde8");
    }
  }

  function drawLedge(pi, i, s) {
    const P = PLACES[pi];
    tile(art[pi].ledges[i], s * LAYERS[i].f, 0);
    if (P.glow.kind === "pulse") { pulse(LEDGE_SPOTS[i], s * LAYERS[i].f, P.glow.cols); }
    if (P.glow.kind === "firefly" && i === 2) {
      for (const c of LEDGE_SPOTS[1].concat(LEDGE_SPOTS[2])) {
        const x = Math.round(wrap(c.x - s * 0.5 + Math.sin(clock * 0.02 + c.ph) * 8, TILE));
        const y = Math.round(c.y - 30 + Math.cos(clock * 0.03 + c.ph) * 5);
        if (Math.sin(clock * c.sp + c.ph) > -0.2) {
          ctx.fillStyle = P.glow.cols[1]; ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  function drawSwarm(i) {
    const L = LAYERS[i];
    if (!L.balls) { return; }
    const r = BALL_R * L.scale;
    for (const b of L.balls) {
      const imgs = art[b.place].swarm[i];
      const half = imgs[0].width / 2;
      const x = Math.round(b.x);
      const y = Math.round(groundY(L, x + g.scroll * L.f) - r - b.hop + 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((b.angle * Math.PI) / 180);
      ctx.drawImage(imgs[Math.floor(b.tick / HOLD) % imgs.length], -half, -half);
      ctx.restore();
    }
  }

  function drawGround(pi, s) {
    const P = PLACES[pi], A = art[pi];
    if (A.top) { tile(A.top, s, 0); }
    tile(A.floor, s, FLOOR);
    if (P.ground === "water") {
      // Little moving waves on the water.
      for (let x = 0; x < W; x += 1) {
        const v = Math.sin((x + s * 0.7) * 0.25 + clock * 0.12) + Math.sin((x + s) * 0.09 - clock * 0.05);
        ctx.fillStyle = v > 1.2 ? "#bfe6ff" : v > 0.2 ? P.floor[1] : P.floor[2];
        ctx.fillRect(x, FLOOR + (v > 0.6 ? 2 : 3), 1, 1);
      }
    }
  }

  function drawMouth(x) {
    // The cave's edge going by: a hanging lip of rock and a step of rock
    // on the ground, in the cave's colours.
    const C = PLACES[PLACES[g.prev].cave ? g.prev : g.place];
    const rock = C.roof[0], edge = C.roof[1], dark = C.roof[2];
    for (let px = Math.round(x) - 30; px < Math.round(x) + 10; px++) {
      const d = Math.abs(px - (x - 10));
      const lip = Math.round(CEIL + 46 * Math.max(0, 1 - d / 20) + wave(px, 64, [[3, 2, 0.5]]));
      ctx.fillStyle = rock; ctx.fillRect(px, 0, 1, lip);
      ctx.fillStyle = edge; ctx.fillRect(px, lip - 2, 1, 1);
      ctx.fillStyle = dark; ctx.fillRect(px, lip, 1, 1);
      const step = Math.round(5 * Math.max(0, 1 - d / 16));
      if (step > 0) {
        ctx.fillStyle = rock; ctx.fillRect(px, FLOOR - step, 1, step);
        ctx.fillStyle = edge; ctx.fillRect(px, FLOOR - step, 1, 1);
      }
    }
  }

  function drawPit(o) {
    // Lava: easy to see, glowing and bubbling, with bright lips.
    const x = Math.round(o.x), w = Math.round(o.w);
    ctx.fillStyle = "#1a0703"; ctx.fillRect(x, FLOOR, w, H - FLOOR);
    ctx.fillStyle = "#5a1608"; ctx.fillRect(x, FLOOR + 3, w, H - FLOOR - 3);
    ctx.fillStyle = "#c2361a"; ctx.fillRect(x, FLOOR + 8, w, H - FLOOR - 8);
    for (let px = 0; px < w; px++) {
      const h = Math.round(1.5 + 1.5 * Math.sin((px + clock * 0.6) * 0.45) + Math.sin((px - clock * 0.3) * 0.9));
      ctx.fillStyle = "#ff7a1a"; ctx.fillRect(x + px, FLOOR + 8 - h, 1, h + 1);
      ctx.fillStyle = "#ffd060"; ctx.fillRect(x + px, FLOOR + 8 - h, 1, 1);
    }
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(clock * 0.1);
    ctx.fillStyle = "#ff7a1a"; ctx.fillRect(x - 6, FLOOR - 6, w + 12, 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PLACES[o.place].rim;
    ctx.fillRect(x - 2, FLOOR, 2, 4); ctx.fillRect(x + w, FLOOR, 2, 4);
    ctx.fillRect(x - 4, FLOOR, 2, 1); ctx.fillRect(x + w + 2, FLOOR, 2, 1);
  }

  function drawObstacles() {
    for (const o of g.obstacles) {
      const x = Math.round(o.x);
      if (o.kind === "pit") { drawPit(o); }
      else if (o.kind === "leaf") {
        // Only where the water is.
        const water = PLACES[g.place].ground === "water";
        const x0 = g.bx < -1e8 ? 0 : (water ? g.bx : 0), x1 = g.bx < -1e8 ? W : (water ? W : g.bx);
        inside(x0, x1, () => ctx.drawImage(o.img, x, FLOOR - 1));
      }
      else if (o.kind === "up") { ctx.drawImage(o.img, x, FLOOR - o.h); }
      else { ctx.drawImage(o.img, x, o.top); }
    }
  }

  function pad(n) { return String(Math.floor(n)).padStart(5, "0"); }

  function render() {
    ctx.imageSmoothingEnabled = false;
    const s = g.scroll;

    // Far to near. The swarm is drawn once per ledge, in its own colours.
    eachSide(pi => drawBack(pi, s), true);
    for (let i = 1; i < LAYERS.length; i++) {
      eachSide(pi => drawLedge(pi, i, s), true);
      drawSwarm(i);
    }
    eachSide(pi => drawGround(pi, s), false);
    if (g.mouth && g.bx > -1e8) { drawMouth(g.bx); }

    drawObstacles();

    for (const e of g.embers) {
      ctx.fillStyle = e.life > 10 ? "#ffd060" : "#ff7a1a";
      ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1);
    }
    for (const d of g.dust) {
      ctx.fillStyle = d.col2 && d.life <= 8 ? d.col2 : (d.col || "#ffffff");
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
    }

    // The little guy.
    if (g.state === "idle" || g.state === "ready" || g.state === "hop") {
      const group = g.state === "hop" ? "b_02" : "b_01";
      ctx.drawImage(sprite(group, g.tick), Math.round(BALL_X - CENTRE_X[group]), FLOOR - BOTTOM[group]);
    } else {
      const img = sprite("b_03", g.state === "dead" ? 0 : g.tick);
      const cy = Math.round(FLOOR - BALL_R - g.y);
      ctx.save();
      if (g.y < 0) {
        // Dropping in: hidden below the water, or outside the pit.
        ctx.beginPath();
        if (g.fallInto === "water") { ctx.rect(0, 0, W, FLOOR + 3); }
        else {
          ctx.rect(0, 0, W, FLOOR);
          const p = g.obstacles.find(o => o.kind === "pit" && BALL_X > o.x && BALL_X < o.x + o.w);
          if (p) { ctx.rect(Math.round(p.x), FLOOR, Math.round(p.w), H - FLOOR); }
        }
        ctx.clip();
      }
      ctx.translate(BALL_X, cy);
      ctx.rotate((g.angle * Math.PI) / 180);
      ctx.drawImage(img, -32, -32);
      ctx.restore();
    }

    for (const f of g.snow) { ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }

    // Score, speed and the name of a new place.
    drawText(ctx, "HI " + pad(best) + "  " + pad(g.score), W - textWidth("HI 00000  00000", 1) - 6, 4, "#f0ecf6", 1);
    if (g.speed > 0) { drawText(ctx, "SPEED " + g.speed.toFixed(1), 6, 4, "#d0cad8", 1); }
    if (g.banner > 0 && Math.floor(g.banner / 8) % 2 === 0 && g.state !== "dead") {
      drawTextCentred(ctx, place().name, 30, place().title, 2);
    }

    if (g.state === "idle") {
      drawTextCentred(ctx, "CAVE ROLL", 34, "#7ee0a0", 2);
      if (Math.floor(g.tick / 30) % 2 === 0) { drawTextCentred(ctx, "PRESS SPACE", 52, "#e8e4ee", 1); }
      drawTextCentred(ctx, "TAP TO HOP - HOLD TO JUMP", 62, "#a8a0b4", 1);
    } else if (g.state === "dead") {
      drawTextCentred(ctx, "GAME OVER", 38, "#ff8a8a", 2);
      if (g.newBest) { drawTextCentred(ctx, "NEW BEST!", 56, "#ffd27e", 1); }
      if (g.deadTick > 30) { drawTextCentred(ctx, "SPACE TO GO AGAIN", 66, "#e8e4ee", 1); }
    }
  }

  function frame(t) {
    if (!running) { return; }
    if (!lastTime) { lastTime = t; }
    acc += Math.min(250, t - lastTime);
    lastTime = t;
    while (acc >= TICK_MS) { update(); acc -= TICK_MS; }
    render();
    raf = requestAnimationFrame(frame);
  }

  // -- Best score (MNR Launcher's state.json, else this browser) ------------
  function api() { return window.pywebview && window.pywebview.api; }

  function loadBest() {
    try { best = parseInt(localStorage.getItem("mnrCaveRollBest") || "0", 10) || 0; } catch (e) { best = 0; }
    const a = api();
    if (a && a.game_get_best) {
      a.game_get_best().then(r => { if (r && r.best > best) { best = r.best; } }).catch(() => {});
    }
  }

  function saveBest(s) {
    try { localStorage.setItem("mnrCaveRollBest", String(s)); } catch (e) {}
    const a = api();
    if (a && a.game_save_best) { a.game_save_best(s).catch(() => {}); }
  }

  // -- Window -------------------------------------------------------------------
  function fit() {
    // The biggest whole-number scale that fits, so pixels stay square.
    const s = Math.max(1, Math.floor(Math.min((window.innerWidth - 60) / W, (window.innerHeight - 100) / H)));
    view.style.width = W * s + "px";
    view.style.height = H * s + "px";
  }

  function build() {
    overlay = document.createElement("div");
    overlay.id = "cave-roll";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;display:none;align-items:center;" +
      "justify-content:center;flex-direction:column;background:rgba(8,8,12,0.92)";
    view = document.createElement("canvas");
    view.width = W; view.height = H;
    view.style.cssText = "image-rendering:pixelated;image-rendering:crisp-edges;" +
      "border:2px solid #35363b;border-radius:4px;cursor:pointer;background:#15141b";
    const hint = document.createElement("div");
    hint.textContent = "Space / Up / click to jump  ·  Esc to close";
    hint.style.cssText = "margin-top:10px;font-size:11px;color:#8b8d93";
    const close = document.createElement("button");
    close.textContent = "×";
    close.title = "Close (Esc)";
    close.style.cssText = "position:absolute;top:14px;right:18px;font-size:22px;background:none;" +
      "border:none;color:#8b8d93;cursor:pointer";
    close.onclick = hide;
    overlay.append(view, hint, close);
    document.body.appendChild(overlay);
    ctx = view.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    view.addEventListener("pointerdown", e => { e.preventDefault(); keyHeld = true; jumpPressed(); });
    view.addEventListener("pointerup", () => { keyHeld = false; });
    view.addEventListener("pointerleave", () => { keyHeld = false; });
    window.addEventListener("resize", () => { if (running) { fit(); } });
  }

  function show() {
    if (!overlay) { build(); }
    overlay.style.display = "flex";
    fit();
    loadBest();
    const go = () => {
      if (!art.length) { makeArt(); }
      reset("idle");
      swarmSpeed = 2.2;
      makeSwarm();
      running = true; lastTime = 0; acc = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    if (loaded) { go(); } else { loadSprites(go); }
  }

  function hide() {
    running = false;
    cancelAnimationFrame(raf);
    keyHeld = false;
    if (overlay) { overlay.style.display = "none"; }
  }

  function isOpen() { return running; }

  // -- Keys while playing, and the way in -------------------------------------
  const JUMP_KEYS = [" ", "ArrowUp", "w", "W"];

  document.addEventListener("keydown", e => {
    if (!isOpen()) { return; }
    if (e.key === "Escape") { hide(); e.preventDefault(); return; }
    if (JUMP_KEYS.includes(e.key)) {
      e.preventDefault();
      if (!e.repeat) { keyHeld = true; jumpPressed(); }
    }
    e.stopPropagation();
  }, true);

  document.addEventListener("keyup", e => {
    if (JUMP_KEYS.includes(e.key)) { keyHeld = false; }
  }, true);

  // Debug panel > "Open Bohrok Canister" > Open.
  function hookButton() {
    const b = document.getElementById("bohrok-canister-open");
    if (b) { b.addEventListener("click", show); }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hookButton);
  } else {
    hookButton();
  }

  window.mnrCaveRoll = { show, hide };
})();
