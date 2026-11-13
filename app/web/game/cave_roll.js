/* Cave Roll - the MNR Launcher's hidden game.

   Opened from the Debug panel: "Open Bohrok Canister" > Open (tick
   Debug at the top of the launcher). Esc closes it.

   A Chrome-dino style runner, but fast: the little guy waits (b_01),
   hops off (b_02), then rolls (b_03) through a cave that keeps getting
   faster. Jump stalagmites and pits (tap for a short hop, hold for a
   big jump) and don't jump into the stalactites. A swarm of his buddies
   rolls along with him on the ledges further back.

   Everything runs at a fixed 60 ticks a second and is drawn at the
   sprites' own pixel size (one game pixel = one sprite pixel), then
   scaled up with no filtering so it stays crisp and blocky.

   Sprites: game/sprites/b_01_01..14 (idle), b_02_01..03 (hop off),
   b_03_01..03 (roll). Every sprite shows for 2 ticks. While rolling,
   the sprite turns 22.5 degrees every tick. After a game over the
   restart plays one idle cycle, the hop, then rolls.

   Best score is kept per computer by MNR Launcher (state.json). */

(function () {
  "use strict";

  // -- Tuning ---------------------------------------------------------
  const W = 448, H = 144;            // game size in sprite pixels
  const FLOOR = 124;                 // y of the cave floor
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
  // A tap hops 21-31 px, a held jump 44 px. Stalactite tips sit where a
  // hop passes under them and a full jump does not.
  const TIP_MIN = 44, TIP_MAX = 52;

  // Speed (px per tick): picks up fast, then keeps creeping up.
  const SPEED_START = 4.2, SPEED_RUSH = 7.8, SPEED_RUSH_TICKS = 700;
  const SPEED_CREEP = 0.0006, SPEED_MAX = 15;

  function speedAt(t) {
    return Math.min(SPEED_MAX,
      SPEED_START + SPEED_RUSH * (1 - Math.exp(-t / SPEED_RUSH_TICKS)) + SPEED_CREEP * t);
  }

  // Where each sprite group's feet / ball sit in its 64x64 image.
  const BOTTOM = { b_01: 64, b_02: 57, b_03: 53 };
  const CENTRE_X = { b_01: 32, b_02: 33, b_03: 32.5 };
  const FRAMES = { b_01: 14, b_02: 3, b_03: 3 };

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
    size = size || 1;
    ctx.fillStyle = color;
    s = String(s).toUpperCase();
    for (let i = 0; i < s.length; i++) {
      const g = FONT[s[i]] || FONT[" "];
      for (let p = 0; p < 15; p++) {
        if (g[p] === "1") {
          ctx.fillRect(x + i * 4 * size + (p % 3) * size, y + Math.floor(p / 3) * size, size, size);
        }
      }
    }
  }

  function drawTextCentred(ctx, s, y, color, size) {
    drawText(ctx, s, Math.round((W - textWidth(s, size || 1)) / 2), y, color, size);
  }

  // -- Helpers ----------------------------------------------------------
  function rng(seed) {
    // Seeded random, so the cave looks the same every time.
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

  // -- Background ---------------------------------------------------------
  // Far to near: the back wall (with glowing crystals), two ledges the
  // swarm rolls on, then the play layer, then a few dark rocks right in
  // front. Further = hazier: lifted blacks, less colour.
  const TILE = W * 2;

  const LAYERS = [
    { name: "wall", f: 0.08 },
    { name: "far", f: 0.22, ground: 86, parts: [[2, 3, 0.3], [5, 2, 1.1], [9, 1.2, 2.4]],
      rock: "#2d2a36", edge: "#3b3746", haze: "#3b3746", hazeAmt: 0.62, sat: 0.25, scale: 0.5, swarm: 7, seed: 31 },
    { name: "mid", f: 0.45, ground: 104, parts: [[3, 2.5, 0.8], [7, 1.6, 0.2], [13, 0.8, 1.7]],
      rock: "#211f29", edge: "#322e3c", haze: "#322e3c", hazeAmt: 0.38, sat: 0.45, scale: 0.75, swarm: 4, seed: 47 }
  ];

  function groundY(layer, worldX) {
    return Math.round(layer.ground + wave(wrap(worldX, TILE), TILE, layer.parts));
  }

  function makeWall() {
    const [c, x] = canvas(TILE, H);
    const r = rng(7);
    x.fillStyle = "#24212c"; x.fillRect(0, 0, TILE, H);
    for (let i = 0; i < 120; i++) {
      const bx = Math.floor(r() * TILE), by = Math.floor(10 + r() * 100);
      const bw = 6 + Math.floor(r() * 24), bh = 4 + Math.floor(r() * 12);
      x.fillStyle = r() < 0.5 ? "#28252f" : "#2b2833";
      for (const dx of [-TILE, 0, TILE]) { x.fillRect(bx + dx, by, bw, bh); }
    }
    // Very far stalactites hanging from the dark.
    for (let i = 0; i < 26; i++) {
      const sx = Math.floor(r() * TILE), sw = 6 + Math.floor(r() * 10), sh = 10 + Math.floor(r() * 30);
      x.fillStyle = "#2c2934";
      spikeRows(sx, sw, sh, true, (a, y, w) => x.fillRect(a, y, w, 1));
    }
    const crystals = [];
    for (let i = 0; i < 24; i++) {
      crystals.push({ x: Math.floor(r() * TILE), y: Math.floor(30 + r() * 60), ph: r() * 6.28, sp: 0.03 + r() * 0.05 });
    }
    return { img: c, crystals };
  }

  function makeLedge(L) {
    // A rock ledge (the swarm rolls on its top), its own stalagmites and
    // a hanging roof with stalactites. Not part of the play: no hits.
    const [c, x] = canvas(TILE, H);
    const r = rng(L.seed);
    // Roof band and stalactites.
    for (let px = 0; px < TILE; px++) {
      const roof = Math.round(6 + L.ground / 14 + wave(px, TILE, [[4, 2, L.seed], [9, 1.3, 0.5]]));
      x.fillStyle = L.rock; x.fillRect(px, 0, 1, roof);
    }
    for (let i = 0; i < 14; i++) {
      const sx = Math.floor(r() * TILE), sw = 8 + Math.floor(r() * 12), sh = 12 + Math.floor(r() * (L.ground / 3));
      spikeRows(sx, sw, sh, true, (a, y, w) => {
        x.fillStyle = L.rock; x.fillRect(a, y + 4, w, 1);
        x.fillStyle = L.edge; x.fillRect(a, y + 4, 1, 1);
      });
    }
    // Ledge body.
    for (let px = 0; px < TILE; px++) {
      const gy = groundY(L, px);
      x.fillStyle = L.rock; x.fillRect(px, gy, 1, H - gy);
      x.fillStyle = L.edge; x.fillRect(px, gy, 1, 1);
    }
    // Stalagmites standing on it, behind where the swarm rolls.
    for (let i = 0; i < 12; i++) {
      const sx = Math.floor(r() * (TILE - 30)), sw = 8 + Math.floor(r() * 12), sh = 10 + Math.floor(r() * 26);
      const base = groundY(L, sx + sw / 2) + 2;
      spikeRows(sx, sw, sh, false, (a, y, w) => {
        x.fillStyle = L.rock; x.fillRect(a, base - sh + y, w, 1);
        x.fillStyle = L.edge; x.fillRect(a, base - sh + y, 1, 1);
      });
    }
    const crystals = [];
    for (let i = 0; i < 8; i++) {
      const cx = Math.floor(r() * TILE);
      crystals.push({ x: cx, y: groundY(L, cx) + 4 + Math.floor(r() * 10), ph: r() * 6.28, sp: 0.04 + r() * 0.05 });
    }
    return { img: c, crystals };
  }

  function makeRoof() {
    const [c, x] = canvas(TILE, 30);
    const r = rng(11);
    const parts = [[4, 2.2, 0.4], [10, 1.4, 1.3], [22, 0.9, 2.1], [34, 0.6, 0.2]];
    for (let px = 0; px < TILE; px++) {
      const edge = Math.round(CEIL + wave(px, TILE, parts));
      x.fillStyle = "#2b2733"; x.fillRect(px, 0, 1, edge);
      x.fillStyle = "#3a3444"; x.fillRect(px, edge - 2, 1, 1);
      x.fillStyle = "#0f0e13"; x.fillRect(px, edge, 1, 1);
    }
    for (let i = 0; i < 120; i++) {
      x.fillStyle = r() < 0.5 ? "#332e3c" : "#25212c";
      x.fillRect(Math.floor(r() * TILE), Math.floor(r() * (CEIL - 4)), 2, 1);
    }
    return c;
  }

  function makeFloor() {
    const [c, x] = canvas(TILE, H - FLOOR);
    const r = rng(23);
    x.fillStyle = "#2e2935"; x.fillRect(0, 0, TILE, H - FLOOR);
    x.fillStyle = "#4b4354"; x.fillRect(0, 0, TILE, 1);
    x.fillStyle = "#3a3443"; x.fillRect(0, 1, TILE, 1);
    for (let i = 0; i < 180; i++) {
      const px = Math.floor(r() * TILE), py = 3 + Math.floor(r() * (H - FLOOR - 4));
      x.fillStyle = r() < 0.6 ? "#3a3443" : "#221e28";
      x.fillRect(px, py, 1 + Math.floor(r() * 3), 1);
    }
    return c;
  }

  function makeFront() {
    // Dark rocks right in front, passing fast. Only at the very top and
    // bottom, so they never hide anything that matters.
    const [c, x] = canvas(TILE * 2, H);
    const r = rng(59);
    for (let i = 0; i < 7; i++) {
      const sx = Math.floor(r() * (TILE * 2 - 40)), sw = 14 + Math.floor(r() * 18), sh = 10 + Math.floor(r() * 12);
      x.fillStyle = "#09080c";
      spikeRows(sx, sw, sh, true, (a, y, w) => x.fillRect(a, y, w, 1));
    }
    for (let i = 0; i < 6; i++) {
      const sx = Math.floor(r() * (TILE * 2 - 60)), sw = 30 + Math.floor(r() * 30);
      x.fillStyle = "#09080c";
      for (let y = 0; y < 8; y++) {
        const inset = Math.round(Math.abs(y - 8) * 1.5);
        x.fillRect(sx + inset, H - 8 + y, sw - inset * 2, 1);
      }
    }
    return c;
  }

  // -- Obstacles ----------------------------------------------------------
  const ROCK = { light: "#7d7186", base: "#5a5061", dark: "#3b3442", line: "#1a1720" };

  function makeSpike(w, h, down, seed) {
    // A stepped pixel triangle, lit from the left. down = stalactite.
    const [c, x] = canvas(w, h);
    const r = rng(seed);
    for (let row = 0; row < h; row++) {
      const half = ((row + 1) / h) * (w / 2);
      const a = Math.round(w / 2 - half), b = Math.round(w / 2 + half);
      const y = down ? h - 1 - row : row;
      if (b <= a) { continue; }
      x.fillStyle = ROCK.line; x.fillRect(a, y, b - a, 1);
      if (b - a > 2) {
        x.fillStyle = ROCK.base; x.fillRect(a + 1, y, b - a - 2, 1);
        x.fillStyle = ROCK.light; x.fillRect(a + 1, y, Math.max(1, Math.floor((b - a) / 4)), 1);
        const d = Math.max(1, Math.floor((b - a) / 5));
        x.fillStyle = ROCK.dark; x.fillRect(b - 1 - d, y, d, 1);
      }
      if (r() < 0.12 && b - a > 4) {
        x.fillStyle = ROCK.dark; x.fillRect(a + 2 + Math.floor(r() * (b - a - 4)), y, 1, 1);
      }
    }
    return c;
  }

  function stalagmite(x, w, h) {
    return { kind: "up", x, w, h, img: makeSpike(w, h, false, (x * 7 + h) | 0) };
  }

  function stalactite(x, w, tip) {
    const top = CEIL - 6;            // starts inside the roof rock
    return { kind: "down", x, w, h: tip - top, top, img: makeSpike(w, tip - top, true, (x * 3 + tip) | 0) };
  }

  function pit(x, w) {
    return { kind: "pit", x, w };
  }

  function triangle(o) {
    if (o.kind === "up") {
      return [[o.x, FLOOR], [o.x + o.w, FLOOR], [o.x + o.w / 2, FLOOR - o.h]];
    }
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

  function overPit(x) {
    // Is the ball's centre far enough over a pit to drop in?
    for (const o of g.obstacles) {
      if (o.kind === "pit" && x > o.x + 6 && x < o.x + o.w - 6) { return o; }
    }
    return null;
  }

  // -- State --------------------------------------------------------------
  let overlay = null, view = null, ctx = null, sprites = {}, loaded = false;
  let wall, ledges = [], roof, floor, front, swarmImgs = [];
  let running = false, raf = 0, lastTime = 0, acc = 0;
  let g = null, best = 0, keyHeld = false, clock = 0;

  function reset(state) {
    g = {
      state,                 // "idle" | "ready" | "hop" | "roll" | "fall" | "dead"
      tick: 0,               // ticks in this state
      rollTicks: 0,          // ticks spent rolling (sets the speed)
      speed: 0,
      scroll: 0,             // how far the world has moved
      y: 0, vy: 0, air: 0,   // height above the floor (up is +), ticks in the air
      angle: 0,
      obstacles: [],
      untilNext: 260,
      score: 0,
      deadTick: 0,
      newBest: false,
      dust: []
    };
  }

  function loadSprites(done) {
    const names = [];
    for (const group of Object.keys(FRAMES)) {
      for (let i = 1; i <= FRAMES[group]; i++) { names.push(group + "_" + String(i).padStart(2, "0")); }
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

  // -- The swarm ------------------------------------------------------------
  function makeSwarmImgs() {
    // Hazy, smaller copies of the roll sprites for each ledge (no pixel
    // reads, so this works however the page is loaded).
    swarmImgs = LAYERS.map(L => {
      if (!L.swarm) { return null; }
      const size = Math.round(64 * L.scale);
      const out = [];
      for (let i = 1; i <= FRAMES.b_03; i++) {
        const [c, x] = canvas(size, size);
        x.filter = "saturate(" + L.sat + ")";
        x.drawImage(sprites["b_03_0" + i], 0, 0, size, size);
        x.filter = "none";
        x.globalCompositeOperation = "source-atop";
        x.globalAlpha = L.hazeAmt;
        x.fillStyle = L.haze;
        x.fillRect(0, 0, size, size);
        out.push(c);
      }
      return out;
    });
  }

  function makeSwarm() {
    for (const L of LAYERS) {
      if (!L.swarm) { continue; }
      L.balls = [];
      for (let i = 0; i < L.swarm; i++) {
        L.balls.push({
          x: (i + Math.random() * 0.6) * (W / L.swarm),
          drift: 0.1 + Math.random() * 0.5,        // how much faster than you
          target: Math.random(),
          tick: Math.floor(Math.random() * 6),
          angle: Math.floor(Math.random() * 16) * ROLL_STEP,
          hop: 0, hopV: 0
        });
      }
    }
  }

  function updateSwarm() {
    for (const L of LAYERS) {
      if (!L.balls) { continue; }
      for (const b of L.balls) {
        b.tick++;
        b.angle = (b.angle + ROLL_STEP) % 360;
        // Always rolling forward: a touch faster or slower than you,
        // changing their mind now and then. Standing still, they roll on.
        if (Math.random() < 0.01) { b.target = Math.random(); }
        b.drift += ((b.target - 0.35) * 1.2 - b.drift) * 0.02;
        const own = g.speed ? g.speed * (1 + b.drift * 0.25) : 3 + b.drift;
        b.x += (own - g.speed) * L.f * (g.speed ? 1 : 0.4) + (g.speed ? 0 : 0.3);
        if (b.x > W + 30) { b.x = -30 - Math.random() * 40; }
        if (b.x < -80) { b.x = W + 20; }
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

  function spawn() {
    // A pattern just off the right edge. Harder ones come in with speed.
    const x0 = W + 8;
    const r = Math.random();
    const hard = Math.min(1, (g.speed - SPEED_START) / (SPEED_MAX - SPEED_START));
    const R = n => Math.floor(Math.random() * n);
    const tip = () => TIP_MIN + R(TIP_MAX - TIP_MIN + 1);
    // Pits never wider than a jump (or a hop, under a stalactite) clears.
    const hopReach = HOP_AIR * g.speed, jumpReach = FULL_AIR * g.speed;
    if (r < 0.26) {
      g.obstacles.push(stalagmite(x0, 14 + R(6), 22 + R(12)));                  // full jump
    } else if (r < 0.42) {
      g.obstacles.push(stalagmite(x0, 10 + R(4), 9 + R(6)));                    // hop
    } else if (r < 0.58) {
      const w = Math.round(Math.max(26, Math.min(jumpReach * 0.55, 30 + Math.random() * jumpReach * 0.4)));
      g.obstacles.push(pit(x0, w));                                           // pit
    } else if (r < 0.72) {
      g.obstacles.push(stalagmite(x0, 10 + R(3), 9 + R(5)));                    // tap under a stalactite
      g.obstacles.push(stalactite(x0 + 4 + R(10), 12 + R(4), tip()));
    } else if (r < 0.82 - hard * 0.08) {
      g.obstacles.push(stalactite(x0, 12 + R(6), tip()));                       // just keep rolling
    } else if (r < 0.92) {
      // Pit with a stalactite over it: hop, don't jump.
      const w = Math.round(Math.max(24, Math.min(hopReach * 0.5, 28 + Math.random() * hopReach * 0.3)));
      g.obstacles.push(pit(x0, w));
      g.obstacles.push(stalactite(x0 + Math.round(w / 2) - 7, 14, tip()));
    } else {
      g.obstacles.push(stalagmite(x0, 12, 18 + R(6)));                          // two close together
      g.obstacles.push(stalagmite(x0 + 22 + R(10), 12, 16 + R(8)));
    }
    // Room to land before the next one.
    g.untilNext = jumpReach + 50 + Math.random() * (150 - 70 * hard);
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

    // Rolling (or dropping into a pit): the world moves every tick, the
    // ball turns 22.5 degrees.
    g.rollTicks++;
    g.speed = speedAt(g.rollTicks);
    g.scroll += g.speed;
    g.angle = (g.angle + ROLL_STEP) % 360;
    for (const o of g.obstacles) { o.x -= g.speed; }
    g.obstacles = g.obstacles.filter(o => o.x + o.w > -4);

    if (g.state === "fall") {
      g.vy -= GRAVITY;
      g.y += g.vy;
      if (g.y < -BALL_R * 2 - 10) { die(); }
      return;
    }

    g.score += g.speed / 10;

    // Jump: holding the key keeps it floaty, a tap is a short hop.
    if (g.y > 0) {
      g.y += g.vy;
      g.air++;
      g.vy -= GRAVITY;
      if (keyHeld && g.air <= BOOST_TICKS && g.vy > 0) { g.vy += BOOST; }
      if (g.y <= 0) {
        if (overPit(BALL_X)) { g.state = "fall"; } else { g.y = 0; g.vy = 0; }
      }
    } else if (overPit(BALL_X)) {
      g.state = "fall"; g.vy = 0; g.y = 0;
    }

    // Dust kicked up when on the ground.
    if (g.y <= 0 && g.state === "roll" && g.tick % 2 === 0) {
      g.dust.push({ x: BALL_X - 14 + Math.random() * 6, y: FLOOR - 1, vx: g.speed * 0.35 + Math.random(),
        vy: 0.4 + Math.random() * 0.8, life: 10 + Math.floor(Math.random() * 8) });
    }

    g.untilNext -= g.speed;
    if (g.untilNext <= 0) { spawn(); }

    const cy = FLOOR - BALL_R - g.y;
    for (const o of g.obstacles) {
      if (o.kind !== "pit" && circleHitsTriangle(BALL_X, cy, HIT_R, triangle(o))) { die(); break; }
    }
  }

  // -- Drawing ----------------------------------------------------------------
  function tile(img, offset, y) {
    const o = Math.floor(wrap(offset, img.width));
    ctx.drawImage(img, -o, y);
    if (img.width - o < W) { ctx.drawImage(img, img.width - o, y); }
  }

  function glow(crystals, offset) {
    // The green glowing bits, gently pulsing.
    for (const c of crystals) {
      const x = Math.round(wrap(c.x - offset, TILE));
      if (x > W + 2) { continue; }
      const a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(clock * c.sp + c.ph));
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = "#2f8a52";
      ctx.fillRect(x - 1, c.y, 3, 1); ctx.fillRect(x, c.y - 1, 1, 3);
      ctx.globalAlpha = a;
      ctx.fillStyle = "#7dffaa";
      ctx.fillRect(x, c.y, 1, 1);
      ctx.globalAlpha = 1;
    }
  }

  function drawSwarm(i) {
    const L = LAYERS[i], imgs = swarmImgs[i];
    if (!L.balls || !imgs) { return; }
    const half = imgs[0].width / 2, r = BALL_R * L.scale;
    for (const b of L.balls) {
      const x = Math.round(b.x);
      const y = Math.round(groundY(L, x + g.scroll * L.f) - r - b.hop + 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((b.angle * Math.PI) / 180);
      ctx.drawImage(imgs[Math.floor(b.tick / HOLD) % imgs.length], -half, -half);
      ctx.restore();
    }
  }

  function drawPit(o) {
    const x = Math.round(o.x), w = Math.round(o.w);
    ctx.fillStyle = "#050407"; ctx.fillRect(x, FLOOR, w, H - FLOOR);
    ctx.fillStyle = "#1c1922"; ctx.fillRect(x, FLOOR, 2, H - FLOOR);
    ctx.fillStyle = "#26222d"; ctx.fillRect(x + w - 2, FLOOR, 2, H - FLOOR);
    ctx.fillStyle = "#4b4354"; ctx.fillRect(x - 1, FLOOR, 1, 2); ctx.fillRect(x + w, FLOOR, 1, 2);
  }

  function pad(n) { return String(Math.floor(n)).padStart(5, "0"); }

  function render() {
    ctx.imageSmoothingEnabled = false;
    const s = g.scroll;

    // Far to near.
    tile(wall.img, s * LAYERS[0].f, 0);
    glow(wall.crystals, s * LAYERS[0].f);
    for (let i = 1; i < LAYERS.length; i++) {
      tile(ledges[i].img, s * LAYERS[i].f, 0);
      glow(ledges[i].crystals, s * LAYERS[i].f);
      drawSwarm(i);
    }

    tile(roof, s, 0);
    tile(floor, s, FLOOR);
    for (const o of g.obstacles) {
      if (o.kind === "pit") { drawPit(o); continue; }
      ctx.drawImage(o.img, Math.round(o.x), o.kind === "up" ? FLOOR - o.h : o.top);
    }

    for (const d of g.dust) {
      ctx.fillStyle = d.life > 8 ? "#6b6275" : "#4b4354";
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
        // Dropping into a pit: only show it above the floor or in the hole.
        const p = g.obstacles.find(o => o.kind === "pit" && BALL_X > o.x && BALL_X < o.x + o.w);
        ctx.beginPath();
        ctx.rect(0, 0, W, FLOOR);
        if (p) { ctx.rect(Math.round(p.x) + 2, FLOOR, Math.round(p.w) - 4, H - FLOOR); }
        ctx.clip();
      }
      ctx.translate(BALL_X, cy);
      ctx.rotate((g.angle * Math.PI) / 180);
      ctx.drawImage(img, -32, -32);
      ctx.restore();
    }

    tile(front, s * 1.6, 0);

    // Score and speed.
    drawText(ctx, "HI " + pad(best) + "  " + pad(g.score), W - textWidth("HI 00000  00000", 1) - 6, 4, "#d8d4de", 1);
    if (g.speed > 0) { drawText(ctx, "SPEED " + g.speed.toFixed(1), 6, 4, "#8b8496", 1); }

    if (g.state === "idle") {
      drawTextCentred(ctx, "CAVE ROLL", 34, "#7ee0a0", 2);
      if (Math.floor(g.tick / 30) % 2 === 0) { drawTextCentred(ctx, "PRESS SPACE", 52, "#d8d4de", 1); }
      drawTextCentred(ctx, "TAP TO HOP - HOLD TO JUMP", 62, "#8b8496", 1);
    } else if (g.state === "dead") {
      drawTextCentred(ctx, "GAME OVER", 38, "#e07e7e", 2);
      if (g.newBest) { drawTextCentred(ctx, "NEW BEST!", 56, "#e0c27e", 1); }
      if (g.deadTick > 30) { drawTextCentred(ctx, "SPACE TO GO AGAIN", 66, "#d8d4de", 1); }
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
    wall = makeWall();
    ledges = LAYERS.map(L => (L.ground ? makeLedge(L) : null));
    roof = makeRoof(); floor = makeFloor(); front = makeFront();

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
      if (!swarmImgs.length) { makeSwarmImgs(); }
      reset("idle");
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
