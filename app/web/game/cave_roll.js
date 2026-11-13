/* Cave Roll - the MNR Launcher's hidden game.

   Opened from the Debug panel: "Open Bohrok Canister" > Open (tick
   Debug at the top of the launcher). Esc closes it.

   A Chrome-dino style runner: the little guy waits (b_01), hops off
   (b_02), then rolls (b_03) through a cave. Jump over stalagmites
   (tap for a short hop, hold for a big jump), and don't jump into the
   stalactites.

   Everything runs at a fixed 60 ticks a second and is drawn at the
   sprites' own pixel size (one game pixel = one sprite pixel), then
   scaled up with no filtering so it stays crisp and blocky.

   Sprites: game/sprites/b_01_01..14 (idle), b_02_01..03 (hop off),
   b_03_01..03 (roll). Every sprite shows for 2 ticks. While rolling,
   the sprite turns 22.5 degrees every tick.

   Best score is kept per computer by MNR Launcher (state.json). */

(function () {
  "use strict";

  // ── Tuning ────────────────────────────────────────────────────────
  const W = 384, H = 144;            // game size in sprite pixels
  const FLOOR = 124;                 // y of the cave floor
  const CEIL = 12;                   // y of the cave roof (roughly)
  const BALL_X = 64;                 // x of the ball's centre
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
  // A tap hops 21-31 px, a held jump 44 px. Stalactite tips sit where a
  // hop passes under them and a full jump does not.
  const TIP_MIN = 44, TIP_MAX = 52;
  const SPEED_START = 3.0, SPEED_MAX = 7.0, SPEED_GAIN = 0.0009;

  // Where each sprite group's feet / ball sit in its 64x64 image.
  const BOTTOM = { b_01: 64, b_02: 57, b_03: 53 };
  const CENTRE_X = { b_01: 32, b_02: 33, b_03: 32.5 };

  const FRAMES = {
    b_01: 14, b_02: 3, b_03: 3
  };

  // ── Pixel font (3 x 5) ───────────────────────────────────────────
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

  // ── Seeded random, so the cave looks the same every time ─────────
  function rng(seed) {
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

  // Wavy edge that repeats every `w` pixels (whole sine periods).
  function wave(x, w, parts) {
    let v = 0;
    for (const [k, a, ph] of parts) { v += a * Math.sin((2 * Math.PI * k * x) / w + ph); }
    return v;
  }

  // ── Background layers (made once, scrolled) ──────────────────────
  function makeBackWall() {
    // Far wall: dark rock, some lumps and a few faint green crystals.
    const [c, x] = canvas(W, H);
    const r = rng(7);
    x.fillStyle = "#15141b"; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const bx = Math.floor(r() * W), by = Math.floor(20 + r() * 90);
      const bw = 6 + Math.floor(r() * 22), bh = 4 + Math.floor(r() * 12);
      x.fillStyle = r() < 0.5 ? "#1b1a23" : "#1f1d28";
      for (const dx of [-W, 0, W]) { x.fillRect(bx + dx, by, bw, bh); }
    }
    // Rock columns far back.
    for (let i = 0; i < 5; i++) {
      const cx = Math.floor(i * (W / 5) + r() * 30), cw = 10 + Math.floor(r() * 10);
      for (let y = 0; y < H; y++) {
        const off = Math.round(Math.sin(y / 9 + i) * 2);
        x.fillStyle = "#1d1b25";
        x.fillRect(cx + off, y, cw, 1);
        x.fillStyle = "#23212d";
        x.fillRect(cx + off, y, 2, 1);
      }
    }
    // Crystals.
    for (let i = 0; i < 14; i++) {
      const gx = Math.floor(r() * W), gy = Math.floor(30 + r() * 80);
      x.fillStyle = "#1f4a33"; x.fillRect(gx - 1, gy, 3, 1); x.fillRect(gx, gy - 1, 1, 3);
      x.fillStyle = "#3d9a63"; x.fillRect(gx, gy, 1, 1);
    }
    return c;
  }

  function makeRoof() {
    const [c, x] = canvas(W, 30);
    const r = rng(11);
    const parts = [[2, 2.2, 0.4], [5, 1.4, 1.3], [11, 0.9, 2.1], [17, 0.6, 0.2]];
    for (let px = 0; px < W; px++) {
      const edge = Math.round(CEIL + wave(px, W, parts));
      x.fillStyle = "#2b2733"; x.fillRect(px, 0, 1, edge);
      x.fillStyle = "#3a3444"; x.fillRect(px, edge - 2, 1, 1);
      x.fillStyle = "#0f0e13"; x.fillRect(px, edge, 1, 1);
    }
    for (let i = 0; i < 60; i++) {
      x.fillStyle = r() < 0.5 ? "#332e3c" : "#25212c";
      x.fillRect(Math.floor(r() * W), Math.floor(r() * (CEIL - 4)), 2, 1);
    }
    return c;
  }

  function makeFloor() {
    const [c, x] = canvas(W, H - FLOOR);
    const r = rng(23);
    x.fillStyle = "#2e2935"; x.fillRect(0, 0, W, H - FLOOR);
    x.fillStyle = "#4b4354"; x.fillRect(0, 0, W, 1);
    x.fillStyle = "#3a3443"; x.fillRect(0, 1, W, 1);
    for (let i = 0; i < 90; i++) {
      const px = Math.floor(r() * W), py = 3 + Math.floor(r() * (H - FLOOR - 4));
      x.fillStyle = r() < 0.6 ? "#3a3443" : "#221e28";
      x.fillRect(px, py, 1 + Math.floor(r() * 3), 1);
    }
    return c;
  }

  // ── Obstacles ────────────────────────────────────────────────────
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
        x.fillStyle = ROCK.dark; x.fillRect(b - 1 - Math.max(1, Math.floor((b - a) / 5)), y, Math.max(1, Math.floor((b - a) / 5)), 1);
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

  // ── Game ─────────────────────────────────────────────────────────
  let overlay = null, view = null, ctx = null, sprites = {}, loaded = false;
  let backWall, roof, floor;
  let running = false, raf = 0, lastTime = 0, acc = 0;
  let g = null, best = 0, keyHeld = false;

  function reset(state) {
    g = {
      state,                 // "idle" | "hop" | "roll" | "dead"
      tick: 0,               // ticks in this state
      speed: SPEED_START,
      scroll: 0,             // how far the world has moved
      y: 0, vy: 0, air: 0,   // height above the floor (up is +), ticks in the air
      angle: 0,
      obstacles: [],
      untilNext: 120,
      score: 0,
      deadTick: 0,
      newBest: false
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
    const n = FRAMES[group];
    const i = Math.floor(tick / HOLD) % n;
    return sprites[group + "_" + String(i + 1).padStart(2, "0")];
  }

  function jumpPressed() {
    if (!g) { return; }
    if (g.state === "idle") { g.state = "hop"; g.tick = 0; return; }
    if (g.state === "dead") {
      if (g.deadTick > 30) { reset("hop"); }
      return;
    }
    if (g.state === "roll" && g.y <= 0) { g.vy = JUMP_V; g.air = 0; g.y = 0.01; }
  }

  function spawn() {
    // A pattern just off the right edge. Harder ones come in with speed.
    const x0 = W + 8;
    const r = Math.random();
    const hard = Math.min(1, (g.speed - SPEED_START) / (SPEED_MAX - SPEED_START));
    if (r < 0.38) {
      // Tall stalagmite: full jump.
      g.obstacles.push(stalagmite(x0, 14 + Math.floor(Math.random() * 6), 22 + Math.floor(Math.random() * 12)));
    } else if (r < 0.6) {
      // Short stalagmite: a hop is enough.
      g.obstacles.push(stalagmite(x0, 10 + Math.floor(Math.random() * 4), 9 + Math.floor(Math.random() * 6)));
    } else if (r < 0.78) {
      // Short stalagmite under a low stalactite: tap, don't hold.
      g.obstacles.push(stalagmite(x0, 10 + Math.floor(Math.random() * 3), 9 + Math.floor(Math.random() * 5)));
      g.obstacles.push(stalactite(x0 + 4 + Math.floor(Math.random() * 10), 12 + Math.floor(Math.random() * 4),
        TIP_MIN + Math.floor(Math.random() * (TIP_MAX - TIP_MIN + 1))));
    } else if (r < 0.9 || hard < 0.3) {
      // A stalactite on its own: just keep rolling.
      g.obstacles.push(stalactite(x0, 12 + Math.floor(Math.random() * 6),
        TIP_MIN + Math.floor(Math.random() * (TIP_MAX - TIP_MIN + 1))));
    } else {
      // Two stalagmites close together: one long jump.
      g.obstacles.push(stalagmite(x0, 12, 18 + Math.floor(Math.random() * 6)));
      g.obstacles.push(stalagmite(x0 + 22 + Math.floor(Math.random() * 10), 12, 16 + Math.floor(Math.random() * 8)));
    }
    // Room to land before the next one.
    const air = FULL_AIR * g.speed;
    g.untilNext = air + 40 + Math.random() * (160 - 60 * hard);
  }

  function update() {
    g.tick++;
    if (g.state === "idle") { return; }
    if (g.state === "hop") {
      if (g.tick >= FRAMES.b_02 * HOLD) { g.state = "roll"; g.tick = 0; }
      return;
    }
    if (g.state === "dead") { g.deadTick++; return; }

    // Rolling: the world moves every tick, the ball turns 22.5 degrees.
    g.speed = Math.min(SPEED_MAX, g.speed + SPEED_GAIN);
    g.scroll += g.speed;
    g.score += g.speed / 10;
    g.angle = (g.angle + ROLL_STEP) % 360;

    // Jump: holding the key keeps it floaty, a tap is a short hop.
    if (g.y > 0) {
      g.y += g.vy;
      g.air++;
      g.vy -= GRAVITY;
      if (keyHeld && g.air <= BOOST_TICKS && g.vy > 0) { g.vy += BOOST; }
      if (g.y <= 0) { g.y = 0; g.vy = 0; }
    }

    for (const o of g.obstacles) { o.x -= g.speed; }
    g.obstacles = g.obstacles.filter(o => o.x + o.w > -4);
    g.untilNext -= g.speed;
    if (g.untilNext <= 0) { spawn(); }

    const cy = FLOOR - BALL_R - g.y;
    for (const o of g.obstacles) {
      if (circleHitsTriangle(BALL_X, cy, HIT_R, triangle(o))) {
        g.state = "dead";
        g.deadTick = 0;
        const s = Math.floor(g.score);
        if (s > best) { best = s; g.newBest = true; saveBest(s); }
        break;
      }
    }
  }

  function tile(img, offset, y) {
    const o = Math.floor(((offset % img.width) + img.width) % img.width);
    ctx.drawImage(img, -o, y);
    ctx.drawImage(img, img.width - o, y);
  }

  function pad(n) { return String(Math.floor(n)).padStart(5, "0"); }

  function render() {
    ctx.imageSmoothingEnabled = false;
    tile(backWall, g.scroll * 0.3, 0);
    tile(roof, g.scroll, 0);
    tile(floor, g.scroll, FLOOR);

    for (const o of g.obstacles) {
      const x = Math.round(o.x);
      ctx.drawImage(o.img, x, o.kind === "up" ? FLOOR - o.h : o.top);
    }

    // The little guy.
    if (g.state === "idle" || g.state === "hop") {
      const group = g.state === "idle" ? "b_01" : "b_02";
      const img = sprite(group, g.tick);
      ctx.drawImage(img, Math.round(BALL_X - CENTRE_X[group]), FLOOR - BOTTOM[group]);
    } else {
      const img = sprite("b_03", g.state === "dead" ? 0 : g.tick);
      const cy = Math.round(FLOOR - BALL_R - g.y);
      ctx.save();
      ctx.translate(BALL_X, cy);
      ctx.rotate((g.angle * Math.PI) / 180);
      ctx.drawImage(img, -32, -32);
      ctx.restore();
    }

    // Score.
    drawText(ctx, "HI " + pad(best) + "  " + pad(g.score), W - textWidth("HI 00000  00000", 1) - 6, 4, "#d8d4de", 1);

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

  // ── Best score (MNR Launcher's state.json, else this browser) ────
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

  // ── Window ───────────────────────────────────────────────────────
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
    hint.textContent = "Space / Up / click to jump  \u00b7  Esc to close";
    hint.style.cssText = "margin-top:10px;font-size:11px;color:#8b8d93";
    const close = document.createElement("button");
    close.textContent = "\u00d7";
    close.title = "Close (Esc)";
    close.style.cssText = "position:absolute;top:14px;right:18px;font-size:22px;background:none;" +
      "border:none;color:#8b8d93;cursor:pointer";
    close.onclick = hide;
    overlay.append(view, hint, close);
    document.body.appendChild(overlay);
    ctx = view.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    backWall = makeBackWall(); roof = makeRoof(); floor = makeFloor();

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
      reset("idle");
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

  // ── Keys while playing, and the way in ──────────────────────────
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
