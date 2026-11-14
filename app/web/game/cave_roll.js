/* Unleash the Swarm - the MNR Launcher's hidden game (cave_roll.js).

   Opened from the Debug panel: "Open Bohrok Canister" > Open (tick
   Debug at the top of the launcher). Esc closes it.

   A Chrome-dino style runner, but fast: the little guy waits (b_01),
   hops off (b_02), then rolls (b_03), faster and faster, through six
   places, 1000 points each, then round again:

     Onu-Koro   the cave: stalagmites and stalactites
     Ta-Koro    the fire cave: stalactites and lava pits
     Po-Koro    out of the cave into the desert: rolling hills and stones
     Ga-Koro    over the ocean: jump from leaf to leaf
     Le-Koro    the forest: trees, bushes, hanging branches, and
                stumps you can land on (but not roll into)
     Ko-Koro    the snow: ice spikes, and cracked icicles you smash
                through on the ground (jump into one and you're done),
                then back into the cave

   Tap for a short hop, hold for a big jump. Things hanging from above
   sit where a hop passes under them and a big jump does not.

   Powers (hover a box to read them): black 4 hearts; red 1 heart and a
   fire shield that blocks a hit and comes back every 2 places; green 2
   hearts and a double jump; blue 2 hearts and a tidal wave now and then
   (1 in 8 every 100 points, for 250 points) that rolls past and smashes
   things; brown 2 hearts and smashes through half of what it hits; white
   2 hearts, freezes lava and water to roll across, icy trail.

   Colours: you start black (Onu-Koro). Reaching a place unlocks its
   colour; pick it with Left / Right before a run. The swarm of buddies
   racing on the ledges behind takes each place's colours as they come
   in. Sprites: game/sprites/b_0#_##.png is the green (Le-Koro) one,
   game/sprites/<place>/ the others.

   Hit something and he's knocked out of his ball and tumbles off the
   screen. Fall into lava or water and he drops in, still rolled up.

   Everything runs at a fixed 60 ticks a second and is drawn at the
   sprites' own pixel size (one game pixel = one sprite pixel), then
   scaled up with no filtering so it stays crisp and blocky. Every
   sprite shows for 2 ticks; rolling, it turns 22.5 degrees a tick.
   After a game over the restart plays one idle cycle, the hop, then
   rolls.

   Best score, unlocked colours and the colour picked are kept per
   computer by MNR Launcher (state.json). */

(function () {
  "use strict";

  // -- Tuning ---------------------------------------------------------
  const W = 448, H = 144;            // game size in sprite pixels
  const FLOOR = 124;                 // y of the ground
  const CEIL = 12;                   // y of the cave roof (roughly)
  const BALL_X = 56;                 // x of the ball's centre
  const BALL_R = 20.5;               // ball radius (b_03 is 41 px wide)
  const HIT_R = 13;                  // forgiving: well inside the ball
  // Each colour's power. lives: hearts per run.
  const POWERS = {
    onu: { lives: 4, text: "4 hearts." },
    ta: { lives: 1, shield: true, text: "1 heart and a fire shield that blocks one hit. It comes back every 2 places." },
    po: { lives: 2, text: "2 hearts. Half the time he smashes straight through what he hits (not pits)." },
    ga: { lives: 2, text: "2 hearts. Now and then a tidal wave rolls past him and smashes everything in its way." },
    le: { lives: 2, text: "2 hearts and a double jump." },
    ko: { lives: 2, text: "2 hearts. Freezes lava and water ahead of him and rolls right across, leaving an icy trail." }
  };
  const WAVE_CHANCE = 1 / 8;         // Ga-Koro: chance of a wave every 100 points...
  const WAVE_POINTS = 250;           // ...lasting a quarter of a place
  const SAFE_TICKS = 100;            // flashing white after one
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
  const SPEED_START = 4.0, SPEED_RUSH = 6.8, SPEED_RUSH_TICKS = 900;
  const SPEED_CREEP = 0.0005, SPEED_MAX = 13.5;
  const PLACE_POINTS = 1000;         // a new place every this many points

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
  const PLACES = [
    {
      key: "onu", name: "ONU-KORO", title: "#b8f0c8", look: "cave", cave: true, ground: "solid",
      wall: ["#45414f", "#4b4756", "#504c5c"],
      far: ["#524d5e", "#66607a"], mid: ["#3e3a4a", "#585269"], big: ["#38344a", "#4a4560"],
      roof: ["#4a4658", "#6a6480", "#1c1a22", "#55506a", "#3e3a4a"],
      floor: ["#504a5c", "#78708a", "#5e576e", "#5e576e", "#3e3848"],
      glow: { kind: "pulse", cols: ["#3a9a5e", "#8dffb4"] },
      spike: { light: "#d4c8e0", base: "#9a8eac", dark: "#655a76", line: "#1e1826" },
      rim: "#e0d6ee", dust: ["#8a8298", "#605870"],
      haze: ["#66607a", "#585269"],
      weights: { tall: 26, short: 16, tapUnder: 16, lone: 12, double: 10, row: 5 }
    },
    {
      key: "ta", name: "TA-KORO", title: "#ffb050", look: "cave", cave: true, ground: "solid",
      wall: ["#2e1b17", "#38211b", "#40271f"],
      far: ["#40241d", "#603424"], mid: ["#2e1914", "#50291a"], big: ["#26140f", "#3e2016"],
      roof: ["#341d17", "#6a3220", "#120806", "#44251b", "#2a1611"],
      floor: ["#38221b", "#a65024", "#62301e", "#542d20", "#26150f"],
      glow: { kind: "pulse", cols: ["#a8401a", "#ffb050"] },
      spike: { light: "#c08a70", base: "#8a5442", dark: "#5a3428", line: "#1c0d0a" },
      rim: "#ffb050", dust: ["#c0703a", "#7a3a22"],
      haze: ["#603424", "#50291a"],
      weights: { lava: 30, lavaUnder: 22, lone: 16, row: 12 }
    },
    {
      key: "po", name: "PO-KORO", title: "#fff0b0", look: "desert", cave: false, ground: "solid",
      sky: ["#4f9fe6", "#7cbcf0", "#a8d6f6", "#f2e4bc"],
      far: ["#e4bf86", "#f4d8a2"], mid: ["#cf9a5c", "#e8b878"], hill: "#d9b48c",
      floor: ["#d6a75e", "#f2cc84", "#e2b46c", "#c48c48", "#eec27c"],
      glow: { kind: "sun" },
      rock: { light: "#e8a070", base: "#a8603a", dark: "#6a3820", line: "#24100a" },
      rim: "#ffffff", dust: ["#f2d498", "#d6aa66"],
      haze: ["#f4dcae", "#e8c48c"],
      weights: { stone: 30, pebble: 22, stones: 14 }
    },
    {
      key: "ga", name: "GA-KORO", title: "#a0e8ff", look: "ocean", cave: false, ground: "water",
      sky: ["#4592dc", "#72b4ec", "#a6d6f6", "#dcf2ff"],
      sea: ["#2a72b2", "#3f8ccc"], far: ["#3c9a4c", "#72d27a"], mid: ["#2e8a3c", "#5ec464"],
      floor: ["#1c5690", "#58aee8", "#2d74b4", "#3a88c8", "#1a4c80"],
      leaf: { light: "#9ae878", base: "#46b04c", dark: "#2a7a34", line: "#123a18" },
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
      wood: { hi: "#a07a50", light: "#7e5a36", mid: "#5c3e24", dark: "#3e2814", line: "#1c1008",
        moss: "#5a8c34", mossHi: "#8cbc52", face: "#d4a86a", faceDark: "#b88a50", ring: "#9a6a38", pith: "#6a401e" },
      tree: { trunk: "#7a5430", bark: "#4e321a", root: "#3a2412", crown: "#3c8a32", light: "#74c856",
        shade: "#2a6424", line: "#122a0c", wood: "#d8aa6a", ring: "#9a6a3a" },
      glow: { kind: "firefly", cols: ["#7aa030", "#e8ff80"] },
      rim: "#ffffff", dust: ["#7a5a38", "#5a4028"],
      haze: ["#a8d29a", "#8cbc7e"],
      weights: { logStep: 34, log: 16, stump: 18, stumpRun: 10, branch: 10 }
    },
    {
      key: "ko", name: "KO-KORO", title: "#e8f6ff", look: "snow", cave: false, ground: "solid",
      sky: ["#94bfe6", "#b8d6f0", "#d8eafa", "#f2f8ff"],
      mountains: ["#c2d2e6", "#f4f8ff", "#a8bcd6"], far: ["#dce8f4", "#ffffff"], mid: ["#c4d4e6", "#eef4fc"],
      floor: ["#e2ecf6", "#ffffff", "#f0f6fc", "#c8d4e4", "#d6e0ec"],
      spike: { light: "#ffffff", base: "#9cdcff", dark: "#4a94d0", line: "#1c3c60", shine: "#ffffff" },
      glow: { kind: "snow" },
      rim: "#ffffff", dust: ["#ffffff", "#d6e4f2"],
      haze: ["#e6eef8", "#cfdcec"],
      weights: { iceTall: 20, iceShort: 16, iceDouble: 16, iceTriple: 10, crack: 16 }
    }
  ];

  function placeAt(score) { return Math.floor(score / PLACE_POINTS) % PLACES.length; }
  function placeByKey(k) { for (const P of PLACES) { if (P.key === k) { return P; } } return PLACES[0]; }

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
      if (b > a) { fill(a, down ? h - 1 - row : row, b - a); }
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
      // Far trunks in two depths, with soft shafts of light between.
      for (let i = 0; i < 46; i++) {
        const tx = Math.floor(r() * TILE), tw = 4 + Math.floor(r() * 12);
        x.fillStyle = i < 26 ? "#8ab47e" : P.trunks;
        for (const dx of [-TILE, 0, TILE]) { x.fillRect(tx + dx, 0, tw, H); x.fillStyle = "#5c8a54"; x.fillRect(tx + dx + tw - 1, 0, 1, H); x.fillStyle = i < 26 ? "#8ab47e" : P.trunks; }
      }
      x.globalAlpha = 0.16; x.fillStyle = "#f4ffd8";
      for (let i = 0; i < 7; i++) {
        const sx = Math.floor(r() * TILE), sw = 8 + Math.floor(r() * 14);
        for (let y = 0; y < H; y++) { x.fillRect(sx + Math.round(y * 0.45), y, sw, 1); x.fillRect(sx + Math.round(y * 0.45) - TILE, y, sw, 1); }
      }
      x.globalAlpha = 1;
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
          const tw = 18 + Math.floor(r() * 14);
          x.fillStyle = P.big[0]; x.fillRect(sx, 0, tw, H);
          x.fillStyle = P.big[1]; x.fillRect(sx, 0, 3, H);
          x.fillStyle = "#2e4428"; x.fillRect(sx + tw - 3, 0, 3, H);
        }
      }
    }
    if (P.look === "forest") {
      // Vines hanging from the canopy, with leaves.
      const r = rng(L.seed * 3);
      const n = L.name === "mid" ? 40 : 26, vine = L.name === "mid" ? "#2c5224" : "#4e7a44", leafC = L.name === "mid" ? "#4a8a3a" : "#6a9e5a";
      for (let i = 0; i < n; i++) {
        const vx = Math.floor(r() * TILE), len = 20 + Math.floor(r() * (L.name === "mid" ? 70 : 45)), ph = r() * 6;
        for (let y = 0; y < len; y++) {
          const px = vx + Math.round(Math.sin(y / 7 + ph) * 1.5);
          x.fillStyle = vine; x.fillRect(px, y, 1, 1);
          if (y % 5 === 2) { x.fillStyle = leafC; x.fillRect(px + (y % 10 === 2 ? 1 : -2), y, 2, 1); }
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
    if (P.look === "forest") {
      // Ferns along the ledge.
      const r = rng(L.seed * 5);
      for (let i = 0; i < 60; i++) {
        const fx = Math.floor(r() * TILE), gy = groundY(L, fx), sz = 3 + Math.floor(r() * 4);
        x.fillStyle = L.name === "mid" ? "#4f8a3c" : "#7aa868";
        for (let k = 0; k < sz; k++) { x.fillRect(fx - k, gy - sz + k, 1, 1); x.fillRect(fx + k, gy - sz + k, 1, 1); x.fillRect(fx, gy - sz + k, 1, 1); }
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
      for (let i = 0; i < 30; i++) {
        const vx = Math.floor(r() * TILE), len = 6 + Math.floor(r() * 14);
        for (let y = CEIL; y < CEIL + len && y < 34; y++) {
          x.fillStyle = "#1e3a18"; x.fillRect(vx + (y % 6 < 3 ? 0 : 1), y, 1, 1);
        }
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
    if (P.look === "forest") { forestDirt(x, P); }
    return c;
  }

  function forestDirt(x, P) {
    // Le-Koro's ground: a ragged grass edge, fallen leaves, roots, pebbles,
    // a buried old bone or two and darker soil lower down.
    const r = rng(77), D = H - FLOOR;
    for (let y = 9; y < D; y++) {
      for (let i = 0; i < TILE / 6; i++) {
        if (r() < (y - 8) / D) { x.fillStyle = P.floor[4]; x.fillRect(Math.floor(r() * TILE), y, 2, 1); }
      }
    }
    for (let px = 0; px < TILE; px++) {
      const d = 2 + Math.floor(r() * 3) + (r() < 0.15 ? 2 : 0);
      x.fillStyle = P.floor[1]; x.fillRect(px, 0, 1, 1);
      x.fillStyle = P.floor[2]; x.fillRect(px, 1, 1, d - 1);
      x.fillStyle = "#2c6a28"; x.fillRect(px, d, 1, 1);
    }
    const leaf = ["#c8862a", "#a8641e", "#d8a83a", "#7a8a2a"];
    for (let i = 0; i < TILE / 5; i++) {
      x.fillStyle = leaf[Math.floor(r() * leaf.length)];
      x.fillRect(Math.floor(r() * TILE), 2 + Math.floor(r() * 4), 2, 1);
    }
    for (let i = 0; i < TILE / 40; i++) {
      // A root snaking along under the grass.
      let rx = Math.floor(r() * TILE), ry = 5 + Math.floor(r() * 8);
      const len = 14 + Math.floor(r() * 26);
      for (let k = 0; k < len; k++) {
        x.fillStyle = "#2a1a0c"; x.fillRect(rx % TILE, ry + 1, 1, 1);
        x.fillStyle = "#6a4a2a"; x.fillRect(rx % TILE, ry, 1, 1);
        rx++; if (r() < 0.25) { ry = Math.max(5, Math.min(D - 3, ry + (r() < 0.5 ? -1 : 1))); }
      }
    }
    for (let i = 0; i < TILE / 22; i++) {
      // Pebbles.
      const px = Math.floor(r() * TILE), py = 7 + Math.floor(r() * (D - 10)), w = 2 + Math.floor(r() * 3);
      x.fillStyle = "#3a3632"; x.fillRect(px, py, w + 1, 3);
      x.fillStyle = "#8a847a"; x.fillRect(px, py, w, 2);
      x.fillStyle = "#b4ada0"; x.fillRect(px, py, 1, 1);
    }
    for (let i = 0; i < 2; i++) {
      // An old bone.
      const px = 30 + Math.floor(r() * (TILE - 60)), py = 11 + Math.floor(r() * 4);
      x.fillStyle = "#d8ceb0"; x.fillRect(px, py, 7, 1);
      x.fillRect(px - 1, py - 1, 2, 1); x.fillRect(px - 1, py + 1, 2, 1);
      x.fillRect(px + 6, py - 1, 2, 1); x.fillRect(px + 6, py + 1, 2, 1);
    }
  }

  function makeFringe(P) {
    // Le-Koro: grass tufts, little flowers, mushrooms and fern sprigs that
    // stand on the ground line (bottom row sits on the ground).
    const fh = 9, [c, x] = canvas(TILE, fh);
    const r = rng(91);
    for (let px = 0; px < TILE; px++) {
      if (r() < 0.45) {
        const h = 1 + Math.floor(r() * 3) + (r() < 0.2 ? 2 : 0);
        x.fillStyle = r() < 0.5 ? P.floor[1] : "#74b850"; x.fillRect(px, fh - 1 - h, 1, h);
        x.fillStyle = "#2c6a28"; x.fillRect(px, fh - 1, 1, 1);
      }
    }
    for (let i = 0; i < TILE / 34; i++) {
      // A flower.
      const px = Math.floor(r() * TILE), h = 3 + Math.floor(r() * 3);
      x.fillStyle = "#3f8a34"; x.fillRect(px, fh - 1 - h, 1, h);
      x.fillStyle = ["#ffffff", "#ffe060", "#ff9ad0", "#a8c8ff"][Math.floor(r() * 4)];
      x.fillRect(px - 1, fh - 1 - h, 3, 1); x.fillRect(px, fh - 2 - h, 1, 3);
      x.fillStyle = "#ffcc30"; x.fillRect(px, fh - 1 - h, 1, 1);
    }
    for (let i = 0; i < TILE / 70; i++) {
      // A red mushroom with white spots.
      const px = Math.floor(r() * (TILE - 6));
      x.fillStyle = "#efe4cc"; x.fillRect(px + 2, fh - 4, 2, 3);
      x.fillStyle = "#5a1010"; x.fillRect(px, fh - 6, 6, 2); x.fillRect(px + 1, fh - 7, 4, 1);
      x.fillStyle = "#d02a20"; x.fillRect(px + 1, fh - 6, 4, 1); x.fillRect(px + 2, fh - 7, 2, 1);
      x.fillStyle = "#ffffff"; x.fillRect(px + 1, fh - 6, 1, 1); x.fillRect(px + 4, fh - 6, 1, 1);
    }
    for (let i = 0; i < TILE / 50; i++) {
      // A fern sprig.
      const px = Math.floor(r() * (TILE - 8));
      for (let k = 0; k < 6; k++) {
        x.fillStyle = k % 2 ? "#4a9a3a" : "#62b048";
        x.fillRect(px + k, fh - 2 - Math.floor(k * 0.9), 2, 1);
        x.fillRect(px + k + 1, fh - 1 - Math.floor(k * 0.9), 1, 1);
      }
    }
    return c;
  }

  // -- Obstacle art ---------------------------------------------------------
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
    // A rounded stone, half sunk in the sand, with a dark outline.
    const [c, x] = canvas(w, h);
    for (let y = 0; y < h; y++) {
      const dy = (h - y) / h;
      const half = (w / 2) * Math.sqrt(Math.max(0, 1 - dy * dy * 0.85));
      const a = Math.round(w / 2 - half), b = Math.round(w / 2 + half);
      if (b <= a) { continue; }
      x.fillStyle = C.line; x.fillRect(a, y, b - a, 1);
      if (b - a > 3 && y > 0) {
        x.fillStyle = C.base; x.fillRect(a + 1, y, b - a - 2, 1);
        x.fillStyle = C.light; x.fillRect(a + 1, y, Math.max(1, Math.floor((b - a) / 3)), 1);
        const d = Math.max(1, Math.floor((b - a) / 4));
        x.fillStyle = C.dark; x.fillRect(b - 1 - d, y, d, 1);
      }
    }
    // A crack or two.
    x.fillStyle = C.line;
    x.fillRect(Math.round(w * 0.55), Math.round(h * 0.35), 1, 2); x.fillRect(Math.round(w * 0.55) + 1, Math.round(h * 0.35) + 2, 1, 2);
    return c;
  }

  function crown(x, cx, cy, r, C, seed) {
    // A leafy crown: five overlapping clumps, outlined, shaded from the
    // top left, with flecks of leaves.
    const blobs = [[0, -0.3, 0.66], [-0.4, 0.05, 0.58], [0.4, 0.05, 0.58], [-0.28, 0.35, 0.55], [0.28, 0.35, 0.55]]
      .map(([dx, dy, br]) => [cx + Math.round(dx * r), cy + Math.round(dy * r), Math.max(2, Math.round(br * r))]);
    for (const [bx, by, br] of blobs) { disc(x, bx, by, br + 1, C.line); }
    for (const [bx, by, br] of blobs) { disc(x, bx, by, br, C.shade); }
    for (const [bx, by, br] of blobs) { disc(x, bx - 1, by - 1, Math.max(1, br - 1), C.crown); }
    for (const [bx, by, br] of blobs) {
      disc(x, bx - Math.round(br * 0.35), by - Math.round(br * 0.4), Math.max(1, Math.round(br * 0.38)), C.light);
    }
    const r2 = rng(seed || 1);
    for (let i = 0; i < r * 3; i++) {
      const a = r2() * 6.28, d = r2() * r * 0.85;
      const px = Math.round(cx + Math.cos(a) * d), py = Math.round(cy + Math.sin(a) * d * 0.9);
      x.fillStyle = r2() < 0.5 ? C.light : C.shade; x.fillRect(px, py, 2, 1);
    }
  }

  function barkColumn(t, C) {
    // Round trunk shading across its width: lit left, dark right.
    return t < 0.12 ? C.light : t < 0.3 ? C.hi : t < 0.62 ? C.light : t < 0.85 ? C.mid : C.dark;
  }

  const STUMP_PAD = 12;   // a stump's roots spread this far past its box

  function makeGiantStump(w, h, C) {
    // A giant cut-down tree: big root flare gripping the ground, deep bark
    // fissures with lit ridges, moss and ivy on the shady side, shelf
    // fungus, and a sawn face with growth rings and splinters on top.
    const pad = STUMP_PAD, cw = w + pad * 2;
    const [c, x] = canvas(cw, h);
    const r = rng(w * 13 + h * 7);
    const faceH = Math.max(5, Math.round(w * 0.2));
    const flare = Math.min(16, Math.round(h * 0.32));
    const edge = [];
    for (let y = Math.floor(faceH / 2); y < h; y++) {
      const fromBottom = h - 1 - y;
      const spread = fromBottom < flare ? Math.round(Math.pow((flare - fromBottom) / flare, 2.2) * pad) : 0;
      const a = pad - spread, b = pad + w + spread;
      edge[y] = [a, b];
      for (let px = a; px < b; px++) {
        const t = (px - a) / Math.max(1, b - a - 1);
        x.fillStyle = barkColumn(t, C); x.fillRect(px, y, 1, 1);
      }
      x.fillStyle = C.line; x.fillRect(a, y, 1, 1); x.fillRect(b - 1, y, 1, 1);
    }
    // Root buttresses: dark grooves splitting the flare into roots.
    for (const f of [0.18, 0.5, 0.8]) {
      const gx = pad + Math.round(w * f);
      for (let k = 0; k < flare; k++) {
        const y = h - 1 - k, dx = Math.round((f - 0.5) * (flare - k) * 0.9);
        x.fillStyle = C.line; x.fillRect(gx + dx, y, 1, 1);
        x.fillStyle = C.dark; x.fillRect(gx + dx + 1, y, 1, 1);
      }
    }
    // Fissures running up the bark with a lit ridge beside each.
    for (let fx = pad + 3; fx < pad + w - 2; fx += 3 + Math.floor(r() * 3)) {
      let y = faceH + Math.floor(r() * 6);
      while (y < h - 3) {
        const len = 5 + Math.floor(r() * 12), l = Math.min(len, h - 3 - y);
        x.fillStyle = C.line; x.fillRect(fx, y, 1, l);
        x.fillStyle = C.dark; x.fillRect(fx + 1, y + 1, 1, Math.max(1, l - 2));
        if (fx - pad < w * 0.6) { x.fillStyle = C.hi; x.fillRect(fx - 1, y + 1, 1, Math.max(1, l - 3)); }
        y += len + 2 + Math.floor(r() * 4);
      }
    }
    // Moss up the shady side and around the roots; ivy climbing.
    for (let i = 0; i < w * 1.5; i++) {
      const my = faceH + Math.floor(r() * (h - faceH));
      const [a, b] = edge[my] || [pad, pad + w];
      const mx = Math.round(a + (b - a) * (0.6 + r() * 0.38));
      x.fillStyle = r() < 0.6 ? C.moss : C.mossHi; x.fillRect(mx, my, 1 + Math.floor(r() * 2), 1);
    }
    for (let i = 0; i < cw; i++) {
      const my = h - 1 - Math.floor(r() * 6), [a, b] = edge[my];
      x.fillStyle = r() < 0.5 ? C.moss : C.mossHi;
      x.fillRect(a + 1 + Math.floor(r() * (b - a - 2)), my, 2, 1);
    }
    let vx = pad + Math.round(w * 0.2);
    for (let y = h - 2; y > faceH + 2; y--) {
      vx += Math.round(Math.sin(y * 0.5) * 0.8);
      x.fillStyle = "#2c5a1e"; x.fillRect(vx, y, 1, 1);
      if (y % 4 === 0) { x.fillStyle = y % 8 ? C.mossHi : "#4a9a3a"; x.fillRect(vx + (y % 8 ? 1 : -2), y - 1, 2, 2); }
    }
    // Shelf fungus on the side.
    for (let k = 0; k < 2 + (w > 50 ? 1 : 0); k++) {
      const fy = faceH + 6 + Math.floor(r() * (h - faceH - flare - 8));
      const [, b] = edge[fy] || [pad, pad + w];
      const fw = 5 + Math.floor(r() * 3), fx = b - 3;
      x.fillStyle = C.line; x.fillRect(fx, fy, fw, 3);
      x.fillStyle = "#e8d2a0"; x.fillRect(fx, fy, fw - 1, 1);
      x.fillStyle = "#b08a58"; x.fillRect(fx, fy + 1, fw - 2, 1);
    }
    // The cut face: an oval of pale wood with rings, a crack and splinters.
    const cx = pad + w / 2, rx = w / 2, ry = faceH / 2;
    for (let y = 0; y < faceH + 1; y++) {
      const dy = (y - ry) / (ry + 0.5);
      const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
      const a = Math.round(cx - half), b = Math.round(cx + half);
      x.fillStyle = C.line; x.fillRect(a, y, b - a, 1);
      x.fillStyle = C.face; x.fillRect(a + 1, y, Math.max(0, b - a - 2), 1);
      x.fillStyle = C.faceDark; x.fillRect(Math.round(cx + half * 0.3), y, Math.max(0, Math.round(half * 0.6) - 1), 1);
    }
    x.fillStyle = C.ring;
    for (const f of [0.82, 0.62, 0.42, 0.22]) {
      const hw = Math.round(rx * f), hh = Math.max(1, Math.round(ry * f));
      for (let k = 0; k <= 16; k++) {
        const an = (k / 16) * Math.PI * 2;
        x.fillRect(Math.round(cx + Math.cos(an) * hw), Math.round(ry + Math.sin(an) * hh), 1, 1);
      }
    }
    x.fillStyle = C.pith; x.fillRect(Math.round(cx) - 1, Math.round(ry), 2, 1);
    x.fillStyle = C.line; x.fillRect(Math.round(cx) + 1, Math.round(ry), Math.round(rx * 0.6), 1);
    // Bark lip around the face.
    for (let px = Math.round(cx - rx); px < Math.round(cx + rx); px++) { x.fillStyle = C.dark; x.fillRect(px, faceH, 1, 1); }
    return c;
  }

  function makeLog(w, h, C) {
    // A fallen trunk lying on the ground: round shading top to bottom,
    // bark lines along it, moss on top, the cut end facing you.
    const [c, x] = canvas(w, h);
    const r = rng(w * 17 + h);
    const ew = Math.max(6, Math.round(h * 0.45));
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      x.fillStyle = t < 0.08 ? C.line : t < 0.25 ? C.hi : t < 0.55 ? C.light : t < 0.8 ? C.mid : t < 0.95 ? C.dark : C.line;
      const inset = y === 0 || y === h - 1 ? 2 : y === 1 || y === h - 2 ? 1 : 0;
      x.fillRect(ew / 2 + inset, y, w - ew / 2 - inset, 1);
    }
    for (let i = 0; i < w / 3; i++) {
      const ly = 2 + Math.floor(r() * (h - 4)), lx = ew + Math.floor(r() * (w - ew - 6));
      x.fillStyle = r() < 0.6 ? C.dark : C.line; x.fillRect(lx, ly, 3 + Math.floor(r() * 8), 1);
    }
    for (let i = 0; i < w / 3; i++) {
      x.fillStyle = r() < 0.6 ? C.moss : C.mossHi;
      x.fillRect(ew + Math.floor(r() * (w - ew - 3)), 1 + Math.floor(r() * 3), 2 + Math.floor(r() * 3), 1);
    }
    // Knots and a broken-off branch stub or two.
    for (let k = 0; k < Math.max(1, Math.floor(w / 30)); k++) {
      const kx = ew + 6 + Math.floor(r() * (w - ew - 14)), ky = 4 + Math.floor(r() * (h - 9));
      x.fillStyle = C.line; x.fillRect(kx, ky, 4, 3);
      x.fillStyle = C.dark; x.fillRect(kx + 1, ky + 1, 2, 1);
      x.fillStyle = C.hi; x.fillRect(kx, ky - 1, 4, 1);
    }
    for (let k = 0; k < Math.floor(w / 40); k++) {
      const kx = ew + 8 + Math.floor(r() * (w - ew - 18));
      x.fillStyle = C.line; x.fillRect(kx, 0, 4, 2);
      x.fillStyle = C.face; x.fillRect(kx + 1, 0, 2, 1);
    }
    // Shelf fungus along the lower side.
    for (let k = 0; k < 2; k++) {
      const fx = ew + 4 + Math.floor(r() * (w - ew - 12)), fy = h - 6 - Math.floor(r() * 3);
      x.fillStyle = C.line; x.fillRect(fx, fy, 6, 2);
      x.fillStyle = "#e8d2a0"; x.fillRect(fx, fy, 5, 1);
    }
    // Rough broken far end.
    for (let y = 1; y < h - 1; y++) {
      x.clearRect(w - 1 - Math.floor(r() * 3), y, 3, 1);
      x.fillStyle = C.line; x.fillRect(w - 3 - Math.floor(r() * 2), y, 1, 1);
    }
    // Cut end: an upright oval with rings.
    const cx = ew / 2, cy = (h - 1) / 2;
    for (let y = 0; y < h; y++) {
      const dy = (y - cy) / (cy + 0.5);
      const half = (ew / 2) * Math.sqrt(Math.max(0, 1 - dy * dy));
      const a = Math.round(cx - half), b = Math.round(cx + half);
      x.fillStyle = C.line; x.fillRect(a, y, Math.max(1, b - a), 1);
      x.fillStyle = C.face; x.fillRect(a + 1, y, Math.max(0, b - a - 2), 1);
    }
    x.fillStyle = C.ring;
    x.fillRect(Math.round(cx) - 1, Math.round(cy - h * 0.25), 1, Math.round(h * 0.5));
    x.fillRect(Math.round(cx) + 1, Math.round(cy - h * 0.3), 1, Math.round(h * 0.6));
    x.fillStyle = C.pith; x.fillRect(Math.round(cx), Math.round(cy), 1, 1);
    return c;
  }

  function makeBranch(w, tip, C) {
    // A branch hanging from the canopy with a clump of leaves.
    const [c, x] = canvas(w, tip);
    const r = Math.floor(w / 2) - 1;
    x.fillStyle = C.line; x.fillRect(r - 2, 0, 5, tip - r);
    x.fillStyle = C.trunk; x.fillRect(r - 1, 0, 3, tip - r);
    x.fillStyle = C.bark; x.fillRect(r + 1, 0, 1, tip - r);
    crown(x, r + 1, tip - r - 1, r, C, w * 3 + tip);
    return c;
  }

  function makeLeaf(w, C) {
    // A big floating leaf, rounded at the ends, with a vein and a notch.
    const h = 11;
    const [c, x] = canvas(w, h);
    for (let y = 0; y < h; y++) {
      const inset = [5, 3, 2, 1, 0, 0, 0, 0, 1, 2, 4][y];
      x.fillStyle = y === 0 ? C.line : y <= 2 ? C.light : y < h - 3 ? C.base : C.dark;
      x.fillRect(inset, y, w - inset * 2, 1);
      x.fillStyle = C.line; x.fillRect(inset, y, 1, 1); x.fillRect(w - inset - 1, y, 1, 1);
    }
    x.fillStyle = C.line; x.fillRect(5, h - 1, w - 10, 1);
    x.fillStyle = C.dark; x.fillRect(8, 5, w - 16, 1);
    x.clearRect(Math.round(w * 0.7), 0, 3, 3);
    return c;
  }

  function makeCrack(w, h, C) {
    // A big cracked icicle hanging from an ice ledge. Rolling into it on
    // the ground smashes it.
    const [c, x] = canvas(w + 8, h);
    x.fillStyle = C.line; x.fillRect(0, 0, w + 8, 7);
    x.fillStyle = C.base; x.fillRect(1, 0, w + 6, 6);
    x.fillStyle = C.light; x.fillRect(1, 0, w + 6, 2);
    for (let y = 6; y < h; y++) {
      const t = (y - 6) / (h - 6);
      const half = (w / 2) * (1 - t * 0.55) - (y > h - 6 ? (y - (h - 6)) * 1.6 : 0);
      if (half < 1) { continue; }
      const a = Math.round(4 + w / 2 - half), b = Math.round(4 + w / 2 + half);
      x.fillStyle = C.line; x.fillRect(a, y, b - a, 1);
      x.fillStyle = C.base; x.fillRect(a + 1, y, b - a - 2, 1);
      x.fillStyle = C.light; x.fillRect(a + 1, y, Math.max(1, Math.floor((b - a) / 4)), 1);
      x.fillStyle = C.dark; x.fillRect(b - 2, y, 1, 1);
    }
    // The cracks.
    x.fillStyle = C.line;
    let cx = 4 + Math.round(w * 0.4);
    for (let y = 12; y < h - 10; y += 2) {
      x.fillRect(cx, y, 1, 2);
      cx += (y % 6 === 0 ? 1 : -1);
      if (y % 10 === 0) { x.fillRect(cx + 1, y, 3, 1); }
    }
    cx = 4 + Math.round(w * 0.65);
    for (let y = 30; y < h - 14; y += 2) { x.fillRect(cx, y, 1, 2); cx += (y % 4 === 0 ? -1 : 1); }
    return c;
  }

  // -- Obstacles ----------------------------------------------------------
  // kinds: "up" / "down" (pixel triangles), "box" (stones, trees,
  // branches: hit as a rectangle), "stump" (land on top, die on the
  // side), "crack" (smash on the ground, die in the air), "pit" (lava),
  // "leaf" (Ga-Koro ground).
  function place() { return PLACES[g.place]; }

  function up(x, w, h) {
    return { kind: "up", x, w, h, img: makeSpike(w, h, false, (x * 7 + h) | 0, place().spike) };
  }

  function down(x, w, tip) {
    const top = CEIL - 6;
    return { kind: "down", x, w, h: tip - top, top, img: makeSpike(w, tip - top, true, (x * 3 + tip) | 0, place().spike) };
  }

  function box(x, w, h, top, img, kind) {
    // top: y of its top edge (hanging ones start at 0).
    return { kind: kind || "box", x, w, h, top, img };
  }

  function pit(x, w) { return { kind: "pit", x, w, place: g.place }; }

  function leaf(x, w) {
    return { kind: "leaf", x, w, ph: Math.random() * 6.28, img: makeLeaf(Math.round(w), PLACES[3].leaf) };
  }

  function bob(o) {
    // A leaf riding the waves: 0 to 4 px up.
    return 2 + 2 * Math.sin(clock * 0.06 + o.ph);
  }

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

  // -- Which place is where, and what holds you up ---------------------------
  // While changing place, everything right of g.bx is the new place and
  // everything left of it the old one. g.bx moves left with the ground.
  function placeAtX(x) { return PLACES[x >= g.bx ? g.place : g.prev]; }

  function hillAt(x) {
    // How far the ground rises above the floor at screen x: Po-Koro's big
    // rolling hills, a very slight roll in Onu, Ta, Le and Ko-Koro, flat
    // water in Ga-Koro. Flattens out near pits and over 120 px either side
    // of where one place changes to the next.
    const key = placeAtX(x).key;
    if (key === "ga") { return 0; }
    let ease = 1;
    if (g.bx > -1e8) { ease = Math.min(1, Math.abs(x - g.bx) / 120); }
    if (ease <= 0) { return 0; }
    const wx = x + g.scroll;
    let h;
    if (key === "po") {
      h = 9 * (0.5 - 0.5 * Math.cos((2 * Math.PI * wx) / 300)) + 3 * (0.5 - 0.5 * Math.cos((2 * Math.PI * wx) / 110));
    } else {
      h = 2.2 * (0.5 - 0.5 * Math.cos((2 * Math.PI * wx) / 340)) + 0.8 * (0.5 - 0.5 * Math.cos((2 * Math.PI * wx) / 130));
      for (const o of g.obstacles) {
        if (o.kind !== "pit") { continue; }
        const d = x < o.x ? o.x - x : x > o.x + o.w ? x - o.x - o.w : 0;
        if (d < 24) { ease = Math.min(ease, d / 24); }
      }
    }
    return h * ease;
  }

  function frozen() { return g && g.power === "ko"; }

  function leafAt(x) {
    for (const o of g.obstacles) { if (o.kind === "leaf" && x > o.x && x < o.x + o.w) { return true; } }
    return false;
  }

  function supportAt(x) {
    // Height above the floor that holds the ball up at x: a stump's top,
    // the ground (or a hill), or null over lava or open water.
    let top = hillAt(x), stump = false;
    for (const o of g.obstacles) {
      if (o.kind === "stump" && x > o.x - 3 && x < o.x + o.w + 3) { top = Math.max(top, o.h); stump = true; }
    }
    if (stump) { return top; }
    if (placeAtX(x).ground === "water") {
      for (const o of g.obstacles) {
        if (o.kind === "leaf" && x > o.x - 8 && x < o.x + o.w + 8) { return bob(o); }
      }
      return frozen() ? 0 : null;
    }
    for (const o of g.obstacles) {
      if (o.kind === "pit" && x > o.x + 6 && x < o.x + o.w - 6) { return frozen() ? top : null; }
    }
    return top;
  }

  // -- Saved: best score, unlocked colours, colour picked -------------------
  let save = { best: 0, unlocked: ["onu"], color: "onu" };

  function api() { return window.pywebview && window.pywebview.api; }

  function mergeSave(d) {
    if (!d) { return; }
    save.best = Math.max(save.best, parseInt(d.best, 10) || 0);
    for (const k of d.unlocked || []) { if (save.unlocked.indexOf(k) < 0) { save.unlocked.push(k); } }
    if (d.color && save.unlocked.indexOf(d.color) >= 0) { save.color = d.color; }
  }

  function loadSave() {
    try {
      mergeSave(JSON.parse(localStorage.getItem("mnrCaveRoll") || "null"));
      mergeSave({ best: localStorage.getItem("mnrCaveRollBest") });
    } catch (e) {}
    const a = api();
    if (a && a.game_load) { a.game_load().then(mergeSave).catch(() => {}); }
    else if (a && a.game_get_best) { a.game_get_best().then(mergeSave).catch(() => {}); }
  }

  function storeSave() {
    try { localStorage.setItem("mnrCaveRoll", JSON.stringify(save)); } catch (e) {}
    const a = api();
    if (a && a.game_save) { a.game_save(save).catch(() => {}); }
    else if (a && a.game_save_best) { a.game_save_best(save.best).catch(() => {}); }
  }

  function unlocked() {
    // In place order.
    return PLACES.map(P => P.key).filter(k => save.unlocked.indexOf(k) >= 0);
  }

  function cycleColor(step) {
    const list = unlocked();
    const i = Math.max(0, list.indexOf(save.color));
    pickColor(list[(i + step + list.length) % list.length]);
  }

  function pickColor(key) {
    // Picking a colour also gives that colour's hearts and power (on the
    // title screen now; after a game over, when the next run starts).
    save.color = key;
    storeSave();
    if (g && g.state === "idle") { applyPower(); }
  }

  function applyPower() {
    const P = POWERS[save.color];
    g.power = save.color;
    g.lives = P.lives;
    g.shield = !!P.shield;
  }

  // -- State --------------------------------------------------------------
  let overlay = null, view = null, ctx = null, sprites = {}, loaded = false;
  let art = [];                      // per place: { back, ledges, top, floor, swarm }
  let running = false, raf = 0, lastTime = 0, acc = 0;
  let g = null, keyHeld = false, clock = 0, swarmSpeed = 0;

  function reset(state) {
    g = {
      state,                 // "idle" | "ready" | "hop" | "roll" | "fall" | "dead"
      tick: 0,               // ticks in this state
      rollTicks: 0,          // ticks spent rolling (sets the speed)
      speed: 0,
      scroll: 0,             // how far the world has moved
      y: 0, vy: 0, air: 0,   // height above the floor (up is +), ticks since the jump
      grounded: true,
      angle: 0,
      obstacles: [],
      untilNext: 280,
      leafEnd: 0,            // right end of the last leaf (Ga-Koro)
      score: 0,
      deadTick: 0,
      newBest: false,
      fallInto: "",
      knock: null,           // knocked out of the ball: { x, y, vx, vy, a }
      power: save.color,         // whose power this run has
      lives: POWERS[save.color].lives, invuln: 0,   // invuln: ticks left flashing white
      shield: !!POWERS[save.color].shield, placesPassed: 0,
      doubleUsed: false, wave: null, nextWaveRoll: 100,
      ice: [], iceEnd: -1e9, trail: [],
      dust: [], embers: [], snow: [], shards: [],
      place: 0, prev: 0, bx: -1e9, mouth: false, banner: 0, unlockBanner: 0, unlockKey: ""
    };
  }

  function loadSprites(done) {
    const names = [];
    for (const group of Object.keys(FRAMES)) {
      for (let i = 1; i <= FRAMES[group]; i++) { names.push(group + "_" + String(i).padStart(2, "0")); }
    }
    const paths = [];
    for (const P of PLACES) {
      for (const n of names) { paths.push((P.key === "le" ? "" : P.key + "/") + n); }
    }
    let left = paths.length;
    for (const p of paths) {
      const img = new Image();
      img.onload = img.onerror = () => { if (--left === 0) { loaded = true; done(); } };
      img.src = "game/sprites/" + p + ".png";
      sprites[p] = img;
    }
  }

  function spriteOf(key, name) { return sprites[(key === "le" ? "" : key + "/") + name]; }

  function sprite(group, tick) {
    // The player's colour; each sprite shows for HOLD ticks.
    const i = Math.floor(tick / HOLD) % FRAMES[group];
    return spriteOf(save.color, group + "_" + String(i + 1).padStart(2, "0"));
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
          const [c, x] = canvas(size, size);
          x.filter = "saturate(" + L.sat + ")";
          x.drawImage(spriteOf(P.key, "b_03_0" + i), 0, 0, size, size);
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
        top: makeTop(P), floor: makeFloor(P), swarm,
        fringe: P.look === "forest" ? makeFringe(P) : null
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
  function onSurface() {
    const s = supportAt(BALL_X);
    return s !== null && g.y <= s + 0.5 && g.vy <= 0;
  }

  function jumpPressed() {
    if (!g) { return; }
    if (g.state === "idle") { applyPower(); g.state = "hop"; g.tick = 0; return; }
    if (g.state === "dead") {
      if (g.deadTick > 30) { reset("ready"); }
      return;
    }
    if (g.state !== "roll") { return; }
    if (onSurface()) { g.vy = JUMP_V; g.air = 0; g.y += 0.01; g.grounded = false; return; }
    if (g.power === "le" && !g.doubleUsed) {
      // Le-Koro: a second jump in the air, with a puff of air under him.
      g.vy = JUMP_V * 0.95; g.air = 0; g.doubleUsed = true; g.grounded = false;
      for (let i = 0; i < 16; i++) {
        const side = i % 2 ? 1 : -1;
        g.dust.push({ x: BALL_X + side * (4 + Math.random() * 10), y: FLOOR - g.y + 1, vx: -side * (0.6 + Math.random()) + g.speed * 0.3,
          vy: -0.3 - Math.random() * 0.5, life: 12 + Math.floor(Math.random() * 8), col: "#f4fff4", col2: "#a8e0b4" });
      }
    }
  }

  function addLeaf(first) {
    // Ga-Koro: the next leaf after a gap of water. Either a tiny gap
    // between leaves bunched together (he just rolls over it: he can stand
    // 8 px past a leaf's end) or a proper gap that takes a jump.
    const hard = Math.min(1, (g.speed - SPEED_START) / (SPEED_MAX - SPEED_START));
    const hopReach = HOP_AIR * g.speed, jumpReach = FULL_AIR * g.speed;
    const close = !first && Math.random() < 0.4;
    const gap = first ? 0 : close ?
      3 + Math.random() * 8 :
      hopReach * 0.45 + Math.random() * Math.max(6, jumpReach * 0.4 - hopReach * 0.45);
    const w = first ? 300 : close ? 60 + Math.random() * 60 :
      Math.max(90, (120 + Math.random() * 110) * (1 - hard * 0.25));
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
    const cutTree = (x, w, h, kind) => {
      // Land on top; roll into the side and it hurts.
      const img = kind === "log" ? makeLog(w, h, P.wood) : makeGiantStump(w, h, P.wood);
      const o = box(x, w, h, FLOOR - h, img, "stump");
      o.drawX = kind === "log" ? 0 : -STUMP_PAD;  // stumps' roots spread past the box
      return o;
    };
    const stoneAt = (x, w, h) => {
      // Sunk 2 px into the sand, on the hill where it lands.
      const lift = Math.round(Math.min(hillAt(x + 2), hillAt(x + w / 2), hillAt(x + w - 2))) - 2;
      return box(x, w, h, FLOOR - lift - h, makeStone(w, h, P.rock));
    };

    const PATTERNS = {
      // Onu-Koro (and Ta-Koro's stalactites).
      tall: () => push(up(x0, 16 + R(6), 24 + R(10))),
      short: () => push(up(x0, 14 + R(4), 12 + R(5))),
      tapUnder: () => { push(up(x0, 14 + R(3), 12 + R(4))); push(down(x0 + 4 + R(10), 16 + R(4), tip())); },
      lone: () => push(down(x0, 16 + R(6), tip())),
      double: () => { push(up(x0, 14, 18 + R(6))); push(up(x0 + 24 + R(10), 14, 16 + R(8))); },
      row: () => {
        const n = 2 + R(2), gap = 28 + R(14);
        for (let i = 0; i < n; i++) { push(down(x0 + i * gap, 16 + R(5), tip())); }
        extra = n * gap;
      },
      // Ta-Koro: lava pits, and stalactites over some of them.
      lava: () => {
        const w = Math.round(Math.max(26, Math.min(jumpReach * 0.5, 30 + Math.random() * jumpReach * 0.35)));
        push(pit(x0, w)); extra = w;
      },
      lavaUnder: () => {
        const w = Math.round(Math.max(24, Math.min(hopReach * 0.45, 28 + Math.random() * hopReach * 0.25)));
        push(pit(x0, w)); push(down(x0 + Math.round(w / 2) - 8, 16, tip())); extra = w;
      },
      // Po-Koro: stones.
      stone: () => { const w = 26 + R(12), h = 22 + R(10); push(stoneAt(x0, w, h)); },
      pebble: () => { const w = 18 + R(6), h = 12 + R(4); push(stoneAt(x0, w, h)); },
      stones: () => {
        const w1 = 20 + R(6), h1 = 14 + R(6), w2 = 22 + R(8), h2 = 18 + R(8);
        push(stoneAt(x0, w1, h1));
        push(stoneAt(x0 + w1 + 6 + R(8), w2, h2));
      },
      // Le-Koro: giant cut-down trees. The gimmick: hop onto a fallen
      // log or a low stump, then jump from it over a giant stump too tall
      // to clear from the ground (you can land on any of them).
      logStep: () => {
        let first;
        if (Math.random() < 0.6) { const w = 56 + R(26), h = 18 + R(6); first = cutTree(x0, w, h, "log"); }
        else { const w = 34 + R(8), h = 20 + R(6); first = cutTree(x0, w, h, "stump"); }
        push(first);
        const gap = Math.max(26, Math.round(g.speed * 7) + R(20));
        const gw = 52 + R(16), gh = 54 + R(6);
        push(cutTree(x0 + first.w + gap, gw, gh, "giant"));
        extra = first.w + gap + gw;
      },
      log: () => { const w = 62 + R(34), h = 18 + R(6); push(cutTree(x0, w, h, "log")); extra = w; },
      stump: () => { const w = 36 + R(12), h = 26 + R(8); push(cutTree(x0, w, h, "stump")); },
      stumpRun: () => {
        // Two stumps: hop from one to the next.
        const w1 = 34 + R(6), h1 = 20 + R(6), w2 = 38 + R(10), h2 = 28 + R(8), gap = 24 + R(16);
        push(cutTree(x0, w1, h1, "stump"));
        push(cutTree(x0 + w1 + gap, w2, h2, "stump"));
        extra = w1 + gap + w2;
      },
      branch: () => { const w = 22 + R(6), t = tip(); push(box(x0, w, t, 0, makeBranch(w, t, T))); },
      // Ko-Koro: ice spikes, and cracked icicles to smash through.
      iceTall: () => push(up(x0, 16 + R(6), 24 + R(10))),
      iceShort: () => push(up(x0, 14 + R(4), 12 + R(5))),
      iceDouble: () => { push(up(x0, 14, 16 + R(8))); push(up(x0 + 20 + R(8), 14, 18 + R(8))); },
      iceTriple: () => {
        for (let i = 0; i < 3; i++) { push(up(x0 + i * (16 + R(4)), 13, 12 + R(10))); }
        extra = 36;
      },
      crack: () => {
        const w = 26 + R(8), h = FLOOR - 14;
        const o = box(x0, w + 8, h, 0, makeCrack(w, h, P.spike), "crack");
        push(o);
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
    g.untilNext = jumpReach + 70 + extra + Math.random() * (170 - 70 * hard);
  }

  function changePlace(to) {
    // The new place comes in from the right edge. Out of or into a cave,
    // a cave mouth goes by. Getting here unlocks its colour.
    const from = g.place;
    if (PLACES[from].ground === "water" && g.leafEnd < W + 40) {
      // A last leaf right up to the shore.
      g.obstacles.push(leaf(g.leafEnd - 4, W + 48 - g.leafEnd));
      g.leafEnd = W + 44;
    }
    g.prev = from; g.place = to;
    g.bx = W + 8;
    g.placesPassed++;
    if (POWERS[g.power].shield && g.placesPassed % 2 === 0 && !g.shield) { g.shield = true; popShield(); }
    g.mouth = PLACES[from].cave !== PLACES[to].cave;
    g.banner = 150;
    g.untilNext = Math.max(g.untilNext, 40);
    if (PLACES[to].ground === "water") {
      g.leafEnd = g.bx - 6;
      addLeaf(true);
    }
    const key = PLACES[to].key;
    if (save.unlocked.indexOf(key) < 0) {
      save.unlocked.push(key);
      storeSave();
      g.unlockKey = key; g.unlockBanner = 200;
    }
  }

  function die(how) {
    // how: "hit" (knocked out of the ball) or "drop" (fell in).
    g.state = "dead";
    g.deadTick = 0;
    if (how === "hit") {
      g.knock = { x: BALL_X, y: FLOOR - BALL_R - g.y, vx: -1.4, vy: -5.2, a: 0 };
    }
    const s = Math.floor(g.score);
    if (s > save.best) { save.best = s; g.newBest = true; storeSave(); }
  }

  function burst(o) {
    // Whatever was hit flies apart into its own pixels.
    if (o.img) {
      const top = o.kind === "up" ? FLOOR - o.h : o.top;
      let data = null;
      try { data = o.img.getContext("2d").getImageData(0, 0, o.img.width, o.img.height).data; } catch (e) {}
      if (data) {
        for (let py = 0; py < o.img.height; py += 2) {
          for (let px = 0; px < o.img.width; px += 2) {
            const i = (py * o.img.width + px) * 4;
            if (data[i + 3] < 128) { continue; }
            g.shards.push({ x: o.x + px, y: top + py, vx: Math.random() * 5 - 1, vy: -1 - Math.random() * 3,
              life: 30 + Math.floor(Math.random() * 25), col: "rgb(" + data[i] + "," + data[i + 1] + "," + data[i + 2] + ")" });
          }
        }
      }
    }
    const i = g.obstacles.indexOf(o);
    if (i >= 0) { g.obstacles.splice(i, 1); }
  }

  function smash(o) { if (o.kind === "crack") { shatter(o); } else { burst(o); } }

  function popShield() {
    // A ring of sparks: the shield coming on or breaking.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 6.28;
      g.dust.push({ x: BALL_X + Math.cos(a) * 24, y: FLOOR - BALL_R - g.y + Math.sin(a) * 24,
        vx: -Math.cos(a) * 1.5, vy: -Math.sin(a) * 1.5, life: 14, col: "#ffe080", col2: "#ff8a30" });
    }
  }

  function hurt(o) {
    // Po-Koro smashes through half the time; Ta-Koro's shield takes one
    // hit. Otherwise lose a life and flash white, or with the last one,
    // game over.
    if (g.power === "po" && Math.random() < 0.5) { smash(o); g.score += 10; return false; }
    if (g.shield) { g.shield = false; g.invuln = SAFE_TICKS; smash(o); popShield(); return false; }
    if (g.lives > 1) {
      g.lives--;
      g.invuln = SAFE_TICKS;
      g.rollTicks = 0;               // back to the starting speed
      if (o.kind === "crack") { shatter(o); } else { burst(o); }
      return false;
    }
    die("hit");
    return true;
  }

  function shatter(o) {
    // Ice bits flying everywhere.
    for (let i = 0; i < 40; i++) {
      g.shards.push({ x: o.x + Math.random() * o.w, y: 20 + Math.random() * (FLOOR - 40),
        vx: 1 + Math.random() * 5, vy: -2 - Math.random() * 3, life: 30 + Math.floor(Math.random() * 20),
        col: Math.random() < 0.5 ? "#ffffff" : "#9cdcff" });
    }
    g.obstacles.splice(g.obstacles.indexOf(o), 1);
    g.score += 25;
  }

  function powers() {
    // Ga-Koro: roll for a tidal wave every 100 points; it rolls slowly
    // past from behind and smashes whatever it reaches.
    if (g.power === "ga") {
      while (g.score >= g.nextWaveRoll) {
        g.nextWaveRoll += 100;
        if (!g.wave && Math.random() < WAVE_CHANCE) { g.wave = { until: g.score + WAVE_POINTS }; }
      }
      if (g.wave) {
        const t = 1 - (g.wave.until - g.score) / WAVE_POINTS;
        g.wave.x = -60 + t * (W + 240);
        for (const o of g.obstacles.slice()) {
          if (o.kind === "pit" || o.kind === "leaf") { continue; }
          if (o.x < g.wave.x && o.x + o.w > g.wave.x - 170) { smash(o); g.score += 10; }
        }
        if (g.score >= g.wave.until) { g.wave = null; }
      }
    }
    // Ko-Koro: ice over pits and water a little ahead, and a trail behind.
    if (g.power === "ko") {
      for (const o of g.obstacles) {
        if (o.kind === "pit" && !o.iced && o.x < BALL_X + 110) {
          o.iced = true;
          for (let i = 0; i < 12; i++) {
            g.dust.push({ x: o.x + Math.random() * o.w, y: FLOOR, vx: g.speed * 0.2, vy: 0.5 + Math.random(),
              life: 14, col: "#ffffff", col2: "#9cdcff" });
          }
        }
      }
      for (let x = Math.max(g.iceEnd, BALL_X - 30); x < BALL_X + 110; x += 3) {
        if (placeAtX(x).ground !== "water" || leafAt(x)) { continue; }
        const last = g.ice[g.ice.length - 1];
        if (last && last.x + last.w >= x - 3) { last.w = x + 3 - last.x; } else { g.ice.push({ x, w: 3 }); }
      }
      g.iceEnd = BALL_X + 110;
      if (onSurface()) {
        g.trail.push({ x: BALL_X - 12 + Math.random() * 6, y: FLOOR - g.y, life: 80 });
      }
    }
  }

  function update() {
    clock++;
    g.tick++;
    updateSwarm();
    for (const d of g.dust) { d.x -= d.vx; d.y -= d.vy; d.vy -= 0.05; d.life--; }
    g.dust = g.dust.filter(d => d.life > 0);
    for (const e of g.embers) { e.x -= g.speed; e.y -= e.vy; e.life--; }
    g.embers = g.embers.filter(e => e.life > 0);
    for (const s of g.shards) { s.x += s.vx - g.speed; s.y += s.vy; s.vy += 0.25; s.life--; }
    g.shards = g.shards.filter(s => s.life > 0 && s.y < H);
    // Snow in Ko-Koro.
    for (const f of g.snow) { f.x -= f.vx + g.speed * 0.6; f.y += f.vy; }
    g.snow = g.snow.filter(f => f.y < H && f.x > -4);
    if (place().glow.kind === "snow" && g.snow.length < 70) {
      g.snow.push({ x: Math.random() * (W + 120), y: -2, vx: 0.3 + Math.random() * 0.6, vy: 0.4 + Math.random() * 0.6 });
    }
    if (g.banner > 0) { g.banner--; }
    if (g.invuln > 0 && (g.state === "roll" || g.state === "fall")) { g.invuln--; }
    if (g.unlockBanner > 0) { g.unlockBanner--; }

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
      if (g.knock) {
        // Tumbling off the screen.
        g.knock.x += g.knock.vx; g.knock.y += g.knock.vy; g.knock.vy += 0.32; g.knock.a -= 15;
      }
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
    for (const c of g.ice) { c.x -= g.speed; }
    g.ice = g.ice.filter(c => c.x + c.w > -4);
    g.iceEnd -= g.speed;
    for (const t of g.trail) { t.x -= g.speed; t.life--; }
    g.trail = g.trail.filter(t => t.life > 0 && t.x > -4);
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
      if (g.y < -14 && (g.lives > 1 || g.invuln > 0 || g.shield)) {
        // Bounce back out, flashing white (the shield or a life gone,
        // unless still flashing from the last one).
        if (g.invuln <= 0) {
          if (g.shield) { g.shield = false; popShield(); } else { g.lives--; g.rollTicks = 0; }
          g.invuln = SAFE_TICKS;
        }
        g.state = "roll"; g.vy = 6.8; g.air = BOOST_TICKS; g.grounded = false;
        const hot = g.fallInto !== "water";
        for (let i = 0; i < 16; i++) {
          g.dust.push({ x: BALL_X - 14 + Math.random() * 28, y: FLOOR + 2, vx: Math.random() * 2 - 1 + g.speed * 0.2,
            vy: 1.5 + Math.random() * 2.5, life: 16 + Math.floor(Math.random() * 8), col: hot ? "#ffd060" : "#cfeeff",
            col2: hot ? "#ff7a1a" : "#8cc8f0" });
        }
        return;
      }
      if (g.y < -BALL_R * 2 - 10) { die("drop"); }
      return;
    }

    g.score += g.speed / 10;
    const p = placeAt(g.score);
    if (p !== g.place) { changePlace(p); }
    if (place().ground === "water") { while (g.leafEnd < W + 80) { addLeaf(false); } }
    powers();

    // Moving up and down: in the air unless sitting on something.
    // Holding the key keeps a jump floaty; a tap is a short hop.
    // Rolling down a slope it sticks to the ground instead of flying off.
    const sup = supportAt(BALL_X);
    let dropped = false;
    if (g.vy <= 0 && sup !== null && g.y <= sup + (g.grounded ? 8 : 0.5)) {
      g.y = sup; g.vy = 0; g.grounded = true; g.doubleUsed = false;
    } else {
      g.grounded = false;
      g.y += g.vy;
      g.air++;
      g.vy -= GRAVITY;
      if (keyHeld && g.air <= BOOST_TICKS && g.vy > 0) { g.vy += BOOST; }
      const now = supportAt(BALL_X);
      if (g.vy <= 0 && now !== null && g.y <= now) { g.y = now; g.vy = 0; g.grounded = true; g.doubleUsed = false; }
      else if (now === null && g.y <= 0 && g.vy <= 0) { dropped = true; }
    }
    if (dropped) {
      g.state = "fall";
      g.fallInto = placeAtX(BALL_X).ground === "water" ? "water" : "pit";
      if (g.fallInto === "water") {
        for (let i = 0; i < 12; i++) {
          g.dust.push({ x: BALL_X - 12 + Math.random() * 24, y: FLOOR + 2, vx: Math.random() * 2 - 1 + g.speed * 0.2,
            vy: 1 + Math.random() * 2, life: 14 + Math.floor(Math.random() * 8), col: "#cfeeff" });
        }
      }
      return;
    }

    // Dust kicked up when rolling on something.
    if (onSurface() && g.tick % 2 === 0) {
      const D = placeAtX(BALL_X).dust;
      g.dust.push({ x: BALL_X - 14 + Math.random() * 6, y: FLOOR - g.y - 1, vx: g.speed * 0.35 + Math.random(),
        vy: 0.4 + Math.random() * 0.8, life: 10 + Math.floor(Math.random() * 8), col: D[0], col2: D[1] });
    }

    g.untilNext -= g.speed;
    if (g.untilNext <= 0) {
      if (place().ground === "water") { g.untilNext = 200; } else { spawn(); }
    }

    const cy = FLOOR - BALL_R - g.y;
    for (const o of g.obstacles.slice()) {
      let hit = false;
      if (o.kind === "up" || o.kind === "down") { hit = circleHitsTriangle(BALL_X, cy, HIT_R, triangle(o)); }
      else if (o.kind === "box") { hit = circleHitsBox(BALL_X, cy, HIT_R, o); }
      else if (o.kind === "stump") { hit = g.y < o.h - 4 && circleHitsBox(BALL_X, cy, HIT_R, o); }
      else if (o.kind === "crack" && circleHitsBox(BALL_X, cy, HIT_R, { x: o.x + 4, w: o.w - 8, top: o.top, h: o.h })) {
        if (onSurface()) { shatter(o); } else { hit = true; }
      }
      if (hit && g.invuln <= 0 && hurt(o)) { break; }
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
    if (P.ground === "solid") {
      // The hills: ground rising over the floor (big in Po-Koro, slight
      // elsewhere).
      for (let x = 0; x < W; x++) {
        if (placeAtX(x) !== P) { continue; }
        const hh = Math.round(hillAt(x));
        if (hh <= 0) { continue; }
        ctx.fillStyle = P.key === "po" ? P.floor[0] : P.floor[2]; ctx.fillRect(x, FLOOR - hh + 1, 1, hh);
        ctx.fillStyle = P.floor[1]; ctx.fillRect(x, FLOOR - hh, 1, 1);
        ctx.fillStyle = P.floor[2]; ctx.fillRect(x, FLOOR - hh + 1, 1, 1);
      }
    }
    if (A.fringe) {
      // Le-Koro: grass tufts, flowers and mushrooms along the top of the
      // ground, following the slight hills.
      const o = Math.floor(wrap(s, A.fringe.width)), fh = A.fringe.height;
      for (let x = 0; x < W; x++) {
        if (placeAtX(x) !== P) { continue; }
        const hh = Math.round(hillAt(x));
        ctx.drawImage(A.fringe, (o + x) % A.fringe.width, 0, 1, fh, x, FLOOR - fh + 1 - hh, 1, fh);
      }
    }
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
    if (o.iced) { drawIce(x - 3, w + 6); }
  }

  function drawIce(x, w) {
    // A slab of ice to roll across (Ko-Koro's power).
    ctx.fillStyle = "#1c3c60"; ctx.fillRect(x, FLOOR - 1, w, 6);
    ctx.fillStyle = "#b8e8ff"; ctx.fillRect(x, FLOOR - 1, w, 5);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(x, FLOOR - 1, w, 1);
    ctx.fillStyle = "#7ab8e0";
    for (let px = 5; px < w - 3; px += 9) { ctx.fillRect(x + px, FLOOR + 1, 3, 1); ctx.fillRect(x + px + 2, FLOOR + 2, 2, 1); }
  }

  function drawObstacles() {
    for (const c of g.ice) { drawIce(Math.round(c.x), Math.round(c.w)); }
    for (const t of g.trail) {
      ctx.globalAlpha = t.life / 80;
      ctx.fillStyle = "#dff4ff"; ctx.fillRect(Math.round(t.x), Math.round(t.y) - 1, 3, 1);
      ctx.fillStyle = "#9cdcff"; ctx.fillRect(Math.round(t.x) + 1, Math.round(t.y), 2, 1);
    }
    ctx.globalAlpha = 1;
    for (const o of g.obstacles) {
      const x = Math.round(o.x);
      if (o.kind === "pit") { drawPit(o); }
      else if (o.kind === "leaf") {
        // Only where the water is.
        const water = PLACES[g.place].ground === "water";
        const x0 = g.bx < -1e8 ? 0 : (water ? g.bx : 0), x1 = g.bx < -1e8 ? W : (water ? W : g.bx);
        inside(x0, x1, () => ctx.drawImage(o.img, x, Math.round(FLOOR - 2 - bob(o))));
      }
      else if (o.kind === "up") { ctx.drawImage(o.img, x, FLOOR - o.h); }
      else { ctx.drawImage(o.img, x + (o.drawX || 0), o.top); }
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
    const flash = g.invuln > 0 && Math.floor(g.invuln / 4) % 2 === 0;
    if (flash) { ctx.filter = "brightness(0) invert(1)"; }
    if (g.state === "idle" || g.state === "ready" || g.state === "hop") {
      const group = g.state === "hop" ? "b_02" : "b_01";
      ctx.drawImage(sprite(group, g.tick), Math.round(BALL_X - CENTRE_X[group]), FLOOR - BOTTOM[group]);
    } else if (g.knock) {
      // Knocked out of his ball, tumbling away.
      if (g.knock.y < H + 50) {
        ctx.save();
        ctx.translate(Math.round(g.knock.x), Math.round(g.knock.y));
        ctx.rotate((g.knock.a * Math.PI) / 180);
        ctx.drawImage(sprite("b_01", 0), -32, -34);
        ctx.restore();
      }
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
    ctx.filter = "none";
    drawShield();
    drawWave();

    for (const sh of g.shards) { ctx.fillStyle = sh.col; ctx.fillRect(Math.round(sh.x), Math.round(sh.y), 2, 2); }
    for (const f of g.snow) { ctx.fillStyle = "#ffffff"; ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }

    // Lives, and the colour picker; the words are in the HTML over it.
    drawLives();
    if (g.state === "idle" || (g.state === "dead" && g.deadTick > 30)) { drawPicker(); }
    updateHud();
  }

  // -- Lives and the colour picker (on the canvas) -----------------------------
  const PICK = { y: 88, size: 32, gap: 6 };

  function pickerBoxes() {
    const n = PLACES.length, w = PICK.size + 2;
    const x0 = Math.round((W - (n * w + (n - 1) * PICK.gap)) / 2);
    return PLACES.map((P, i) => ({ key: P.key, x: x0 + i * (w + PICK.gap), y: PICK.y, w, h: w }));
  }

  function drawPicker() {
    // The standing Bohrok in each colour; locked ones are shadows.
    for (const b of pickerBoxes()) {
      const open = save.unlocked.indexOf(b.key) >= 0, chosen = b.key === save.color;
      ctx.fillStyle = "rgba(10,8,14,0.55)"; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = chosen ? "#f0cc6a" : open ? "#8a8296" : "#2e2a36";
      ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
      ctx.fillRect(b.x, b.y, 1, b.h); ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
      if (chosen) {
        ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, 1); ctx.fillRect(b.x - 1, b.y + b.h, b.w + 2, 1);
        ctx.fillRect(b.x - 1, b.y - 1, 1, b.h + 2); ctx.fillRect(b.x + b.w, b.y - 1, 1, b.h + 2);
      }
      const frame = chosen ? Math.floor(clock / HOLD) % FRAMES.b_01 : 0;
      const img = spriteOf(b.key, "b_01_" + String(frame + 1).padStart(2, "0"));
      ctx.save();
      if (!open) { ctx.filter = "brightness(0)"; ctx.globalAlpha = 0.55; }
      ctx.drawImage(img, b.x + 1, b.y + 1, PICK.size, PICK.size);
      ctx.restore();
    }
  }

  const HEART = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];

  function drawLives() {
    // Hearts top left (full or empty), and a shield if Ta-Koro has one.
    const n = POWERS[g.power].lives;
    for (let i = 0; i < n; i++) {
      const full = i < g.lives, x0 = 5 + i * 10, y0 = 5;
      for (let y = 0; y < HEART.length; y++) {
        for (let x = 0; x < 7; x++) {
          if (HEART[y][x] !== "X") { continue; }
          ctx.fillStyle = full ? (x === 1 && y === 1 ? "#ffb0b0" : "#e83a3a") : "#3a2a30";
          ctx.fillRect(x0 + x, y0 + y, 1, 1);
        }
      }
    }
    if (g.shield) {
      const x0 = 7 + n * 10, y0 = 4;
      ctx.fillStyle = "#7a3a10"; ctx.fillRect(x0, y0, 7, 5); ctx.fillRect(x0 + 1, y0 + 5, 5, 2); ctx.fillRect(x0 + 2, y0 + 7, 3, 1);
      ctx.fillStyle = "#ffb040"; ctx.fillRect(x0 + 1, y0 + 1, 5, 4); ctx.fillRect(x0 + 2, y0 + 5, 3, 1);
      ctx.fillStyle = "#ffe8a0"; ctx.fillRect(x0 + 1, y0 + 1, 2, 1);
    }
  }

  function drawShield() {
    // Ta-Koro's fire shield: a shimmering ring around him.
    if (!g.shield || g.state === "dead") { return; }
    const standing = g.state === "idle" || g.state === "ready" || g.state === "hop";
    const cx = BALL_X, cy = standing ? FLOOR - 32 : Math.round(FLOOR - BALL_R - g.y), r = standing ? 30 : 25;
    ctx.globalAlpha = 0.14; disc(ctx, cx, cy, r, "#ff9a30"); ctx.globalAlpha = 0.85;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * 6.28 + clock * 0.03;
      ctx.fillStyle = (i + Math.floor(clock / 4)) % 8 < 4 ? "#ffb040" : "#ffe890";
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawWave() {
    // Ga-Koro's tidal wave rolling past in front of him: a deep blue body
    // with light streaks, a curling lip of foam at the front, foam churning
    // at its foot and spray flying off the crest.
    if (!g.wave || g.wave.x === undefined) { return; }
    const front = g.wave.x, len = 170, top = 56, lip = 18;
    const hash = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
    const height = t => top * Math.pow(t, 1.5);
    for (let x = Math.max(0, Math.floor(front - len)); x < Math.min(W, Math.ceil(front + lip)); x++) {
      if (x < front) {
        const t = (x - (front - len)) / len;
        const h = Math.round(height(t) + 1.5 * Math.sin(x * 0.18 + clock * 0.25));
        if (h <= 0) { continue; }
        const y0 = FLOOR - h;
        // Body, darker at the bottom, glassy lighter near the top.
        ctx.globalAlpha = 0.82;
        for (let y = y0; y < FLOOR + 4; y++) {
          const d = (y - y0) / Math.max(1, h);
          let col = d < 0.18 ? "#5cb8f0" : d < 0.45 ? "#2f8ad8" : d < 0.75 ? "#2068bc" : "#174e98";
          // Diagonal light streaks running up the face.
          if (((x + clock * 1.5 - y * 1.4) % 23 + 23) % 23 < 1.2 && d < 0.8) { col = "#8fd4ff"; }
          // The dark hollow under the curl.
          const k = (t - 0.8) / 0.2;
          if (k > 0 && d > 0.1 && d < 0.1 + 0.5 * Math.sqrt(k)) { col = d < 0.1 + 0.5 * Math.sqrt(k) - 0.06 ? "#123e7c" : "#2068bc"; }
          ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
        }
        // Foam along the crest.
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y0, 1, 1);
        ctx.fillStyle = "#cfeeff"; ctx.fillRect(x, y0 + 1, 1, t > 0.6 ? 2 : 1);
        if (hash(x, Math.floor(clock / 3)) < 0.35 * t) { ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y0 - 1, 1, 1); }
      } else {
        // The lip curling over in front, thinning as it falls.
        const u = (x - front) / lip;
        const y0 = Math.round(FLOOR - top - 1 + u * u * 26);
        const th = Math.max(1, Math.round(7 * (1 - u)));
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#5cb8f0"; ctx.fillRect(x, y0, 1, th + 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y0, 1, Math.max(1, th - 2));
        ctx.fillStyle = "#cfeeff"; ctx.fillRect(x, y0 + Math.max(1, th - 2), 1, 2);
      }
      // Foam churning at the foot.
      const fx = x - front;
      if (fx > -60 && hash(x, Math.floor(clock / 2)) < 0.7) {
        ctx.fillStyle = hash(x + 3, clock) < 0.5 ? "#ffffff" : "#cfeeff";
        ctx.fillRect(x, FLOOR - 1 - Math.floor(hash(x, clock) * 5), 1, 2);
      }
    }
    ctx.globalAlpha = 1;
    if (front > 0 && front < W + lip) {
      for (let k = 0; k < 2; k++) {
        g.dust.push({ x: front + Math.random() * lip, y: FLOOR - top - 2 - Math.random() * 6, vx: -0.5 - Math.random() * 2,
          vy: 0.6 + Math.random() * 1.2, life: 12 + Math.floor(Math.random() * 8), col: "#ffffff", col2: "#bfe6ff" });
      }
    }
  }

  // -- Words: Bionicle-style lettering over the game (HTML) -------------------
  let hud = null, hudKey = "", hoverKey = null;

  function hudHtml() {
    const P = place();
    const out = [];
    const line = (cls, text, top) => out.push('<div class="' + cls + '" style="top:' + top + '%">' + text + "</div>");
    out.push('<div class="cr-score">Best ' + Math.floor(save.best) + '<span>' + Math.floor(g.score) + "</span></div>");
    const pick = () => {
      if (unlocked().length > 1) { line("cr-small", "&#8249;&ensp;" + placeByKey(save.color).name + "&ensp;&#8250;", 54); }
      const k = hoverKey || save.color, open = save.unlocked.indexOf(k) >= 0;
      line("cr-small cr-power", "<span>" + placeByKey(k).name + " &middot; " +
        (open ? POWERS[k].text : "Locked: reach " + placeByKey(k).name + " to unlock. " + POWERS[k].text) + "</span>", 87);
    };
    if (g.state === "idle") {
      line("cr-title cr-long", "Unleash the Swarm", 11);
      line("cr-sub cr-blink", "Press Space to roll", 33);
      line("cr-small", "Tap to hop &middot; hold to jump", 42);
      pick();
    } else if (g.state === "dead") {
      line("cr-title", "Game Over", 8);
      line("cr-sub", (g.newBest ? "New best &middot; " : "") + Math.floor(g.score), 30);
      if (g.deadTick > 30) { line("cr-small", "Space to roll again", 41); pick(); }
    } else {
      if (g.banner > 0) { line("cr-title cr-place", '<span style="--c:' + P.title + '">' + P.name + "</span>", 14); }
      if (g.unlockBanner > 0) { line("cr-small", "New colour unlocked &middot; " + placeByKey(g.unlockKey).name, 34); }
    }
    return out.join("");
  }

  function updateHud() {
    if (!hud) { return; }
    const html = hudHtml();
    if (html !== hudKey) { hud.innerHTML = html; hudKey = html; }
  }

  let frameAvg = TICK_MS;

  function frame(t) {
    if (!running) { return; }
    if (!lastTime) { lastTime = t; }
    const dt = Math.min(250, t - lastTime);
    lastTime = t;
    if (dt > 0) { frameAvg += (dt - frameAvg) * 0.05; }
    if (Math.abs(frameAvg - TICK_MS) < 1.5 && dt > TICK_MS * 0.4 && dt < TICK_MS * 1.6) {
      // 60 Hz screen: exactly one step per frame. Counting time instead
      // sometimes gave two steps in one frame (e.g. when a key press made a
      // frame a little late), which looked like a jitter forward.
      update(); acc = 0;
    } else {
      acc += dt;
      while (acc >= TICK_MS) { update(); acc -= TICK_MS; }
    }
    render();
    raf = requestAnimationFrame(frame);
  }

  // -- Window -------------------------------------------------------------------
  function fit() {
    // The biggest whole-number scale that fits, so pixels stay square.
    const s = Math.max(1, Math.floor(Math.min((window.innerWidth - 60) / W, (window.innerHeight - 100) / H)));
    view.style.width = W * s + "px";
    view.style.height = H * s + "px";
    overlay.style.setProperty("--s", s + "px");
  }

  const STYLE = `
    @font-face { font-family: "MNR Cinzel"; font-weight: 700; src: url("game/fonts/cinzel-latin-700-normal.woff2") format("woff2"); }
    @font-face { font-family: "MNR Cinzel"; font-weight: 900; src: url("game/fonts/cinzel-latin-900-normal.woff2") format("woff2"); }
    #cave-roll .cr-wrap { position: relative; }
    #cave-roll .cr-hud { position: absolute; inset: 0; pointer-events: none; font-family: "MNR Cinzel", "Copperplate Gothic Bold", serif;
      color: #f2ead6; text-align: center; }
    #cave-roll .cr-hud > div { position: absolute; left: 0; right: 0; white-space: nowrap; }
    #cave-roll .cr-title { font-weight: 900; font-size: calc(var(--s) * 17); letter-spacing: 0.06em;
      background: linear-gradient(180deg, #fff6d0 0%, #f0cc6a 42%, #a8782a 58%, #f6dc8c 100%);
      -webkit-background-clip: text; background-clip: text; color: transparent;
      filter: drop-shadow(0 calc(var(--s) * 1) 0 #1a1208) drop-shadow(0 0 calc(var(--s) * 3) rgba(0,0,0,0.55)); }
    #cave-roll .cr-place { background: none; }
    #cave-roll .cr-place span { background: linear-gradient(180deg, #ffffff 0%, var(--c) 55%, #4a3a2a 140%);
      -webkit-background-clip: text; background-clip: text; color: transparent; }
    #cave-roll .cr-sub { font-weight: 700; font-size: calc(var(--s) * 8); letter-spacing: 0.08em;
      text-shadow: 0 calc(var(--s) * 0.7) 0 #000, 0 0 calc(var(--s) * 3) rgba(0,0,0,0.7); }
    #cave-roll .cr-small { font-weight: 700; font-size: calc(var(--s) * 5.5); letter-spacing: 0.1em; color: #e8dcc0;
      text-shadow: 0 calc(var(--s) * 0.6) 0 #000, 0 0 calc(var(--s) * 2) rgba(0,0,0,0.8); }
    #cave-roll .cr-score { top: calc(var(--s) * 3); right: calc(var(--s) * 6) !important; left: auto !important; font-weight: 700;
      font-size: calc(var(--s) * 6); letter-spacing: 0.08em; color: #d8ccb0;
      text-shadow: 0 calc(var(--s) * 0.6) 0 #000, 0 0 calc(var(--s) * 2) rgba(0,0,0,0.8); }
    #cave-roll .cr-score span { color: #fff2c8; margin-left: calc(var(--s) * 8); }
    #cave-roll .cr-long { font-size: calc(var(--s) * 14); }
    #cave-roll .cr-power span { background: rgba(8,6,12,0.6); padding: calc(var(--s) * 1) calc(var(--s) * 4);
      border-radius: calc(var(--s) * 2); font-size: calc(var(--s) * 4.6); white-space: normal; display: inline-block; max-width: 92%; }
    #cave-roll .cr-blink { animation: cr-blink 1s steps(2, start) infinite; }
    @keyframes cr-blink { to { visibility: hidden; } }
  `;

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
    hint.textContent = "Space / Up / click to jump  \u00b7  Left / Right or click a box to change colour  \u00b7  Esc to close";
    hint.style.cssText = "margin-top:10px;font-size:11px;color:#8b8d93";
    const close = document.createElement("button");
    close.textContent = "×";
    close.title = "Close (Esc)";
    close.style.cssText = "position:absolute;top:14px;right:18px;font-size:22px;background:none;" +
      "border:none;color:#8b8d93;cursor:pointer";
    close.onclick = hide;
    const style = document.createElement("style");
    style.textContent = STYLE;
    const wrap = document.createElement("div");
    wrap.className = "cr-wrap";
    hud = document.createElement("div");
    hud.className = "cr-hud";
    wrap.append(view, hud);
    overlay.append(style, wrap, hint, close);
    document.body.appendChild(overlay);
    ctx = view.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    view.addEventListener("pointerdown", e => {
      e.preventDefault();
      if (g && (g.state === "idle" || (g.state === "dead" && g.deadTick > 30))) {
        // Clicking a box picks that colour.
        const r = view.getBoundingClientRect();
        const px = (e.clientX - r.left) / (r.width / W), py = (e.clientY - r.top) / (r.height / H);
        for (const b of pickerBoxes()) {
          if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) {
            if (save.unlocked.indexOf(b.key) >= 0) { pickColor(b.key); }
            return;
          }
        }
      }
      keyHeld = true; jumpPressed();
    });
    view.addEventListener("pointerup", () => { keyHeld = false; });
    view.addEventListener("pointerleave", () => { keyHeld = false; hoverKey = null; });
    view.addEventListener("pointermove", e => {
      // Hovering a box shows that colour's power.
      const r = view.getBoundingClientRect();
      const px = (e.clientX - r.left) / (r.width / W), py = (e.clientY - r.top) / (r.height / H);
      hoverKey = null;
      for (const b of pickerBoxes()) {
        if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) { hoverKey = b.key; }
      }
    });
    window.addEventListener("resize", () => { if (running) { fit(); } });
  }

  function show() {
    // Let go of the Open button, so Space can't press it again.
    if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); }
    if (!overlay) { build(); }
    overlay.style.display = "flex";
    fit();
    loadSave();
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
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && g &&
        (g.state === "idle" || (g.state === "dead" && g.deadTick > 30))) {
      e.preventDefault();
      cycleColor(e.key === "ArrowLeft" ? -1 : 1);
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
  if (window.__caveRollTest) { window.__caveRollTest({ PLACES, makeGiantStump, makeLog, makeBranch, makeStone, makeCrack, makeLeaf, makeSpike }); }
})();
