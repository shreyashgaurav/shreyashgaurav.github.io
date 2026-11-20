// Header: a hairline once you scroll, and (on the homepage) underline the section you're reading
(function () {
  var header = document.getElementById('top');
  var onHome = document.body.getAttribute('data-page') === 'home';
  var links = onHome ? Array.prototype.slice.call(header.querySelectorAll('nav a')) : [];
  var targets = links.map(function (a) { return a.hash ? document.getElementById(a.hash.slice(1)) : null; });
  var clicked = -1;
  links.forEach(function (a, i) { a.addEventListener('click', function () { clicked = i; update(); }); });
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { clicked = -1; }, { passive: true });
  });
  function update() {
    header.classList.toggle('scrolled', window.scrollY > 8);
    if (!onHome) return;
    var vh = window.innerHeight, base = header.offsetHeight + 40;
    var remaining = document.documentElement.scrollHeight - vh - window.scrollY;
    var zone = vh * 0.6, line = base;
    if (remaining < zone) line = base + (vh - 40 - base) * (1 - Math.max(remaining, 0) / zone);
    var active = -1;
    targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top <= line) active = i; });
    if (clicked > -1) active = clicked;
    links.forEach(function (a, i) {
      if (i === active) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

// Dark mode toggle. Remembers the visitor's choice; otherwise follows their system setting.
(function () {
  var btn = document.querySelector('.theme-toggle');
  var root = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');
  var system = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function saved() { try { return localStorage.getItem('theme'); } catch (e) { return null; } }
  function apply(theme, remember) {
    var dark = theme === 'dark';
    root.setAttribute('data-theme', theme);
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.dataset.tip = dark ? 'Light mode' : 'Dark mode';
    if (meta) meta.setAttribute('content', dark ? '#17191d' : '#ffffff');
    if (remember) { try { localStorage.setItem('theme', theme); } catch (e) {} }
    document.dispatchEvent(new Event('themechange'));
  }
  apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  btn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    // No View Transitions support, or the visitor prefers less motion: switch instantly
    if (!document.startViewTransition || (reduceMotion && reduceMotion.matches)) { apply(next, true); return; }
    // Otherwise reveal the new theme in a circle growing out of the button
    var b = btn.getBoundingClientRect();
    var x = b.left + b.width / 2, y = b.top + b.height / 2;
    var end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    var vt = document.startViewTransition(function () { apply(next, true); });
    vt.ready.then(function () {
      root.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + end + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 600, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(function () {});
  });
  function onSystem() { var s = saved(); if (s !== 'dark' && s !== 'light') apply(system.matches ? 'dark' : 'light', false); }
  if (system && system.addEventListener) system.addEventListener('change', onSystem);
  else if (system && system.addListener) system.addListener(onSystem);
})();

// Optional spider that follows the cursor. Off by default; mouse only.
// Look, walking, leg stepping and lifecycle are from our earlier version;
// the swing (shoot, pendulum arc, springy legs in the air, thread) is from your new code,
// with a slower start and finish. When the cursor is idle, it roams nearby, and a click
// close in front of it scares it away for a moment.
(function () {
  var btn = document.querySelector('.spider-toggle');
  var allowed = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  if (!btn || !allowed.matches) return;

  // Look and walking (earlier version)
  var LEG = 56, BEND = 13, LIFT = 7, HIP = 4.5, NECK = 3, REACH = 40, STEP = 18, STEP_TIME = 0.09, MAX_SPEED = 360, MAX_LEAD = 22;
  var ANGLES = [0.45, 1.05, 2.0, 2.65];         // leg directions from "forward", per side
  var REACHES = [1.12, 1.0, 0.95, 1.05];        // front legs reach furthest, like a real spider
  var BENDS = [1, 0.4, 0.4, 1];                 // middle legs bend less, so their knees don't meet
  var INK = 'rgb(27, 29, 33)';
  var WEB_COLOR = 'rgba(27, 29, 33, ';          // thread: same ink, drawn translucent
  // Follow the page's ink colour, so the spider stays visible in dark mode
  function readInk() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--ink-rgb').trim() || '27, 29, 33';
    INK = 'rgb(' + v + ')'; WEB_COLOR = 'rgba(' + v + ', ';
  }
  readInk();
  document.addEventListener('themechange', readInk);
  var GAP = 26;                                 // stop this far short of the cursor
  // Roaming: when the cursor is idle, wander slowly near it
  var ROAM_AFTER = 1.5;                         // seconds of cursor stillness before roaming
  var ROAM_MIN = 45, ROAM_MAX = 140;            // how far from the cursor it wanders (px)
  var ROAM_SPEED = 70;                          // px per second, a slow amble
  var ROAM_PAUSE_MIN = 1.0, ROAM_PAUSE_MAX = 2.5;   // rest between wanders (seconds)
  var ROAM_TOP = 90, ROAM_EDGE = 40;            // keep below the menu and away from the edges
  // Scared: a click close in front of the spider makes it hop and scurry away
  var SCARE_RADIUS = 160;                       // how close the click must be (px)
  var SCARE_ARC = Math.PI / 2;                  // "in front": within 90 degrees either side of where it faces
  var FLEE_DIST = 220, FLEE_SPEED = 700;        // how far and how fast it runs
  var FLEE_STEP_TIME = 0.05;                    // quicker, scurrying steps
  var HOP_TIME = 0.2, COWER_TIME = 1.1;         // startle hop, then freeze before carrying on

  // Swing (your new code)
  var SWING_DIST = 400;       // walk for anything closer; swing only for longer moves
  var SETTLE = 0.08;          // brief settle before shooting silk
  var SHOOT_TIME = 0.16;      // silk shoots up to top of viewport
  var RETRACT_TIME = 0.18;    // quick fade/retract after landing
  var CEILING = 0;            // anchor right at the top edge of the viewport
  var TRACK_MAX = 220;
  var L1 = 23, L2 = 25;       // leg span your swing uses to keep feet within reach (48px)

  var canvas, ctx, raf = 0, on = false, last = 0, elapsed = 0, dpr = 1, W = 0, H = 0;
  var mouse = null, body = null, legs = [], mode = 'walk', thread = null, loose = [], stillFor = 0;
  var roam = null, roamWait = 0, flee = null;

  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  // Points around the head and thorax, where the legs attach
  function at(angle, r) {
    var cx = body.x + Math.cos(body.a) * NECK, cy = body.y + Math.sin(body.a) * NECK;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  }
  // Points around the body centre (used by the swing's leg springs)
  function radialPoint(angle, r) {
    return { x: body.x + Math.cos(angle) * r, y: body.y + Math.sin(angle) * r };
  }

  function spawn(p) {
    body = { x: p.x, y: p.y, a: -Math.PI / 2, vx: 0, vy: 0 };
    mode = 'walk'; thread = null; loose = []; roam = null; roamWait = 0; flee = null;
    legs = [];
    [-1, 1].forEach(function (side) {
      ANGLES.forEach(function (ang, k) {
        var leg = {
          side: side, idx: k, ang: ang, reach: REACH * REACHES[k], bend: BENDS[k],
          group: (k + (side > 0 ? 0 : 1)) % 2, t: -1,
          fv: { x: 0, y: 0 },
          // Slight individual offset so trailing legs fan out during the swing
          trailSpread: (k - 1.5) * 3.8,
          trailLag: 0.85 + k * 0.1
        };
        leg.foot = at(body.a + side * ang, leg.reach);
        legs.push(leg);
      });
    });
  }

  // Knee: an outward bend about 40% along the leg, raised while the foot is in the air
  function knee(h, f, side, bend, lift) {
    var dx = f.x - h.x, dy = f.y - h.y, d = hyp(dx, dy) || 1;
    var off = Math.min(BEND, Math.sqrt(Math.max(0, LEG * LEG / 4 - d * d / 4))) * bend + lift;
    var nx = -dy / d, ny = dx / d;
    var lat = body.a + side * Math.PI / 2;
    if (nx * Math.cos(lat) + ny * Math.sin(lat) < 0) { nx = -nx; ny = -ny; }
    return { x: h.x + dx * 0.42 + nx * off, y: h.y + dy * 0.42 + ny * off };
  }

  function turnTo(angle, rate, dt) {
    var diff = Math.atan2(Math.sin(angle - body.a), Math.cos(angle - body.a));
    body.a += diff * (1 - Math.exp(-dt * rate));
  }

  function goal() {
    var dx = body.x - mouse.x, dy = body.y - mouse.y, d = hyp(dx, dy);
    if (d <= GAP) return { x: body.x, y: body.y };
    return { x: mouse.x + dx / d * GAP, y: mouse.y + dy / d * GAP };
  }

  // ---------- Swing (your new code) ----------

  function startSwing() {
    var g = goal(), sx = body.x, sy = body.y, gx = g.x, gy = g.y;
    var ax = clamp((sx + gx) * 0.5, 48, W - 48);
    var ay = CEILING;
    var l0 = hyp(sx - ax, sy - ay);
    var l1 = hyp(gx - ax, gy - ay);
    var th0 = Math.atan2(sx - ax, sy - ay);
    var th1 = Math.atan2(gx - ax, gy - ay);
    var arcLen = Math.abs(th1 - th0) * (l0 + l1) * 0.5 + Math.abs(l1 - l0);
    var dur = clamp(0.62 + arcLen / 1150, 0.72, 1.48);
    var sag = Math.min(72, Math.abs(gx - sx) * 0.14);

    thread = {
      ax: ax, ay: ay, s: 0, u: 0, dur: dur, sag: sag,
      gx: gx, gy: gy,
      l0: l0, l1: l1, th0: th0, th1: th1
    };
    legs.forEach(function (l) { l.t = -1; l.fv.x = 0; l.fv.y = 0; });
    mode = 'shoot';
  }

  // Spring-damper leg motion during shoot & swing:
  // legs trail naturally behind velocity + droop under gravity,
  // then spring outward into a full stance right before landing.
  function springAirLegs(dt, openFactor) {
    var speed = hyp(body.vx, body.vy);
    var nx = speed > 1 ? -body.vx / speed : 0;
    var ny = speed > 1 ? -body.vy / speed : 1;
    var px = -ny, py = nx;
    var trailMag = clamp(speed * 0.032, 0, 26);
    var stiffness = 210, damping = 17.5;

    legs.forEach(function (l) {
      var dir = body.a + l.side * l.ang;
      var splay = radialPoint(dir, l.reach);

      // Loose trailing cluster behind motion with gentle gravity droop
      var sway = Math.sin(elapsed * 14 + l.idx * 1.4 + l.side) * 2.2 * (1 - openFactor);
      var txTrail = body.x
        + Math.cos(dir) * (l.reach * 0.36)
        + nx * trailMag * l.trailLag
        + px * (l.side * (6 + Math.abs(l.trailSpread)) + sway);
      var tyTrail = body.y
        + Math.sin(dir) * (l.reach * 0.36)
        + ny * trailMag * l.trailLag
        + 10
        + py * (l.side * (6 + Math.abs(l.trailSpread)) + sway);

      var tx = txTrail + (splay.x - txTrail) * openFactor;
      var ty = tyTrail + (splay.y - tyTrail) * openFactor;

      var ax = (tx - l.foot.x) * stiffness - l.fv.x * damping;
      var ay = (ty - l.foot.y) * stiffness - l.fv.y * damping;
      l.fv.x += ax * dt;
      l.fv.y += ay * dt;
      l.foot.x += l.fv.x * dt;
      l.foot.y += l.fv.y * dt;

      // Keep foot within physical leg span
      var fdx = l.foot.x - body.x, fdy = l.foot.y - body.y;
      var fd = hyp(fdx, fdy);
      var maxSpan = L1 + L2 - 1;
      if (fd > maxSpan) {
        l.foot.x = body.x + fdx / fd * maxSpan;
        l.foot.y = body.y + fdy / fd * maxSpan;
      }
    });
  }

  function updateShoot(dt) {
    var t = thread;
    body.vx = body.vy = 0;
    t.s = Math.min(1, t.s + dt / SHOOT_TIME);
    // Gather legs inward slightly as the silk anchors to the ceiling
    springAirLegs(dt, 1 - t.s * 0.72);
    if (t.s >= 1) mode = 'swing';
  }

  function updateSwing(dt) {
    var t = thread;

    // Gently accommodate small cursor nudges while swinging
    var g = goal(), ox = g.x - t.gx, oy = g.y - t.gy, od = hyp(ox, oy);
    if (od > TRACK_MAX) { g = { x: t.gx + ox / od * TRACK_MAX, y: t.gy + oy / od * TRACK_MAX }; }
    var tk = 1 - Math.exp(-dt * 4);
    var thWant = Math.atan2(g.x - t.ax, g.y - t.ay);
    var lWant = hyp(g.x - t.ax, g.y - t.ay);
    t.th1 += Math.atan2(Math.sin(thWant - t.th1), Math.cos(thWant - t.th1)) * tk;
    t.l1 += (lWant - t.l1) * tk;

    t.u = Math.min(1, t.u + dt / t.dur);

    // Ease in and out: starts slowly, sweeps fastest through the middle, arrives slowly.
    // The dip (sag) eases in and out too (sin squared), so it doesn't lurch at either end.
    var e = t.u < 0.5 ? 4 * t.u * t.u * t.u : 1 - Math.pow(-2 * t.u + 2, 3) / 2;
    var dip = Math.sin(Math.PI * t.u);

    var th = t.th0 + (t.th1 - t.th0) * e;
    var len = t.l0 + (t.l1 - t.l0) * e + dip * dip * t.sag;
    var maxLen = (H - 36 - t.ay) / Math.max(Math.cos(th), 0.35);
    if (len > maxLen) len = maxLen;

    var nx = t.ax + Math.sin(th) * len;
    var ny = t.ay + Math.cos(th) * len;
    body.vx = (nx - body.x) / dt;
    body.vy = (ny - body.y) / dt;
    body.x = nx;
    body.y = ny;

    if (hyp(body.vx, body.vy) > 20) {
      turnTo(Math.atan2(body.vy, body.vx), 8, dt);
    }

    // Legs trail behind during the swing and spring open right before arrival
    var openFactor = smoothstep(0.76, 0.98, t.u);
    springAirLegs(dt, openFactor);

    if (t.u >= 1) {
      loose.push({ ax: t.ax, ay: t.ay, rx: body.x, ry: body.y, retract: 0 });
      thread = null;
      mode = 'walk';
      body.vx = body.vy = 0;
      legs.forEach(function (l) { l.t = -1; });
    }
  }

  // ---------- Walking and leg stepping (earlier version) ----------

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Next spot to wander to near the cursor, or null while resting between wanders
  function roamTarget(dt) {
    if (roam) {
      if (hyp(roam.x - body.x, roam.y - body.y) > 2) return roam;   // still on the way
      roam = null; roamWait = rand(ROAM_PAUSE_MIN, ROAM_PAUSE_MAX);  // arrived: rest a while
    }
    roamWait -= dt;
    if (roamWait > 0) return null;
    for (var i = 0; i < 6; i++) {
      var a = Math.random() * Math.PI * 2, d = rand(ROAM_MIN, ROAM_MAX);
      var p = {
        x: clamp(mouse.x + Math.cos(a) * d, ROAM_EDGE, W - ROAM_EDGE),
        y: clamp(mouse.y + Math.sin(a) * d, ROAM_TOP, H - ROAM_EDGE)
      };
      if (hyp(p.x - body.x, p.y - body.y) > 30) { roam = p; return roam; }
    }
    roamWait = 0.5;
    return null;
  }

  function walk(dt) {
    var g = goal(), maxSpeed = MAX_SPEED;
    if (stillFor > ROAM_AFTER) {
      var r = roamTarget(dt);
      g = r || { x: body.x, y: body.y };
      maxSpeed = ROAM_SPEED;
    } else {
      roam = null; roamWait = 0;
    }
    var dx = g.x - body.x, dy = g.y - body.y, dist = hyp(dx, dy);
    var move = dist < 1.5 ? 0 : Math.min(dist * (1 - Math.exp(-dt * 5)), maxSpeed * dt);
    var mx = dist ? dx / dist * move : 0, my = dist ? dy / dist * move : 0;
    body.x += mx; body.y += my;
    body.vx = mx / dt; body.vy = my / dt;
    if (hyp(body.vx, body.vy) > 20) turnTo(Math.atan2(body.vy, body.vx), 10, dt);
  }

  function stepLegs(dt) {
    // Plant feet about half a stride ahead, so each leg swings evenly around its hip
    var stepTime = mode === 'flee' ? FLEE_STEP_TIME : STEP_TIME;
    var speed = hyp(body.vx, body.vy), leadLen = Math.min(speed * stepTime * 1.2, MAX_LEAD);
    var lead = speed ? { x: body.vx / speed * leadLen, y: body.vy / speed * leadLen } : { x: 0, y: 0 };
    var settling = speed < 15;
    var stepping = [false, false];
    legs.forEach(function (l) { if (l.t >= 0) stepping[l.group] = true; });

    legs.forEach(function (l) {
      if (l.t >= 0) {
        l.t += dt / stepTime;
        if (l.t >= 1) { l.foot = l.to; l.t = -1; }
        else {
          var e = ease(l.t);
          l.foot = { x: l.from.x + (l.to.x - l.from.x) * e, y: l.from.y + (l.to.y - l.from.y) * e };
        }
        return;
      }
      var dir = body.a + l.side * l.ang;
      var hip = at(dir, HIP), ideal = at(dir, l.reach);
      ideal.x += lead.x; ideal.y += lead.y;
      var drift = hyp(l.foot.x - ideal.x, l.foot.y - ideal.y);
      var stretched = hyp(l.foot.x - hip.x, l.foot.y - hip.y) > LEG + 4;
      var due = drift > STEP || (settling && drift > 4);
      if (stretched || drift > STEP * 1.8 || (due && !stepping[1 - l.group])) {
        l.from = { x: l.foot.x, y: l.foot.y }; l.to = ideal; l.t = 0;
        stepping[l.group] = true;
      }
    });
  }

  // Run away from the click, then freeze for a moment before carrying on
  function scare(cx, cy) {
    var away = Math.atan2(body.y - cy, body.x - cx);
    var tries = [0, 0.6, -0.6, 1.2, -1.2, Math.PI / 2, -Math.PI / 2];
    var best = null, bestD = -1;
    for (var i = 0; i < tries.length; i++) {
      var a = away + tries[i] + rand(-0.25, 0.25);
      var p = {
        x: clamp(body.x + Math.cos(a) * FLEE_DIST, ROAM_EDGE, W - ROAM_EDGE),
        y: clamp(body.y + Math.sin(a) * FLEE_DIST, ROAM_TOP, H - ROAM_EDGE)
      };
      var d = hyp(p.x - body.x, p.y - body.y);
      if (d > FLEE_DIST * 0.7) { best = p; break; }        // enough room this way
      if (d > bestD) { bestD = d; best = p; }              // cornered: take the roomiest way
    }
    flee = { tx: best.x, ty: best.y, hop: 0, cower: -1 };
    roam = null; roamWait = 0;
    mode = 'flee';
  }

  function updateFlee(dt) {
    flee.hop += dt;
    if (flee.cower < 0) {
      var dx = flee.tx - body.x, dy = flee.ty - body.y, dist = hyp(dx, dy);
      var move = Math.min(dist * (1 - Math.exp(-dt * 9)), FLEE_SPEED * dt);
      var mx = dist ? dx / dist * move : 0, my = dist ? dy / dist * move : 0;
      body.x += mx; body.y += my;
      body.vx = mx / dt; body.vy = my / dt;
      if (hyp(body.vx, body.vy) > 20) turnTo(Math.atan2(body.vy, body.vx), 18, dt);
      if (dist < 3) flee.cower = 0;
    } else {
      body.vx = body.vy = 0;
      flee.cower += dt;
      if (flee.cower > COWER_TIME) { flee = null; mode = 'walk'; }
    }
  }

  function update(dt) {
    if (!mouse || !body) return;
    elapsed += dt;
    stillFor += dt;
    loose = loose.filter(function (q) { q.retract += dt / RETRACT_TIME; return q.retract < 1; });

    var dist = hyp(mouse.x - body.x, mouse.y - body.y);
    if (mode === 'walk' && dist > SWING_DIST && loose.length === 0 && stillFor > SETTLE) {
      startSwing();
    }

    if (mode === 'shoot') { updateShoot(dt); return; }
    if (mode === 'swing') { updateSwing(dt); return; }
    if (mode === 'flee') { updateFlee(dt); stepLegs(dt); return; }

    walk(dt);
    stepLegs(dt);
  }

  // ---------- Drawing (earlier look; thread timing from your new code) ----------

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!body) return;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // Silk thread (active + retracting)
    ctx.save();
    ctx.lineWidth = 1;
    loose.forEach(function (q) {
      var e = q.retract * q.retract;
      ctx.strokeStyle = WEB_COLOR + (0.5 * (1 - q.retract)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(q.rx + (q.ax - q.rx) * e, q.ry + (q.ay - q.ry) * e);
      ctx.lineTo(q.ax, q.ay);
      ctx.stroke();
    });
    if (thread) {
      var fadeOut = mode === 'swing' ? (1 - smoothstep(0.9, 1.0, thread.u) * 0.55) : 1;
      ctx.strokeStyle = WEB_COLOR + (0.5 * fadeOut).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(body.x, body.y);
      ctx.lineTo(body.x + (thread.ax - body.x) * thread.s, body.y + (thread.ay - body.y) * thread.s);
      ctx.stroke();
    }
    ctx.restore();

    // Startle hop: grow briefly, as if jumping, then settle
    var hop = flee && flee.hop < HOP_TIME ? 1 + 0.22 * Math.sin(Math.PI * flee.hop / HOP_TIME) : 1;
    ctx.save();
    ctx.translate(body.x, body.y); ctx.scale(hop, hop); ctx.translate(-body.x, -body.y);

    // Legs: thick near the body, thin at the foot
    ctx.strokeStyle = INK; ctx.fillStyle = INK;
    legs.forEach(function (l) {
      var hip = at(body.a + l.side * l.ang, HIP);
      var lift = l.t >= 0 ? Math.sin(Math.PI * l.t) * LIFT : 0;
      var k = knee(hip, l.foot, l.side, l.bend, lift);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(k.x, k.y); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.lineTo(l.foot.x, l.foot.y); ctx.stroke();
    });

    // Body: abdomen behind, head and thorax in front
    ctx.save(); ctx.translate(body.x, body.y); ctx.rotate(body.a);
    ctx.beginPath(); ctx.ellipse(-9, 0, 8.5, 6.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(NECK, 0, 5.6, 4.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();   // end of hop
  }

  // ---------- Lifecycle (earlier version) ----------

  // Never more than one loop, paused while the tab is hidden,
  // and switched off cleanly (instead of freezing on screen) if anything throws.
  function loop(now) {
    raf = 0;
    var dt = Math.min((now - last) / 1000, 0.05) || 0.016;
    last = now;
    try { update(dt); draw(); }
    catch (err) { if (window.console) console.error('Spider stopped:', err); setOn(false); return; }
    startLoop();
  }

  function startLoop() {
    if (raf || !on || document.hidden) return;
    raf = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setOn(value) {
    on = value;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.dataset.tip = on ? 'Spider Off' : 'Spider On';
    try { if (on) localStorage.setItem('spider', '1'); else localStorage.removeItem('spider'); } catch (e) {}
    if (on) {
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'spider-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
      }
      canvas.style.display = '';
      resize();
      if (mouse && !body) spawn(mouse);
      last = performance.now();
      startLoop();
    } else {
      stopLoop();
      body = null; thread = null; loose = []; mode = 'walk'; roam = null; flee = null;
      if (canvas) { ctx.clearRect(0, 0, W, H); canvas.style.display = 'none'; }
    }
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    mouse = { x: e.clientX, y: e.clientY };
    stillFor = 0;
    if (on && !body) spawn(mouse);
  }, { passive: true });
  window.addEventListener('pointerdown', function (e) {
    if (!on || !body || mode !== 'walk') return;
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var dx = e.clientX - body.x, dy = e.clientY - body.y, d = hyp(dx, dy);
    if (d > SCARE_RADIUS) return;
    var off = Math.atan2(Math.sin(Math.atan2(dy, dx) - body.a), Math.cos(Math.atan2(dy, dx) - body.a));
    if (d > 20 && Math.abs(off) > SCARE_ARC) return;      // behind it: not scared
    scare(e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener('resize', resize);
  btn.addEventListener('click', function () { setOn(!on); });

  // Pause in background tabs; on return, restart without a time jump
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopLoop();
    else { last = performance.now(); startLoop(); }
  });

  // If the visitor turns on "reduce motion" while it's running, switch it off
  function onPolicyChange() { if (!allowed.matches && on) setOn(false); }
  if (allowed.addEventListener) allowed.addEventListener('change', onPolicyChange);
  else if (allowed.addListener) allowed.addListener(onPolicyChange);

  try { if (localStorage.getItem('spider') === '1') setOn(true); } catch (e) {}
})();
