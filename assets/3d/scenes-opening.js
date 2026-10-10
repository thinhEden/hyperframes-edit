/* Opening: Betelgeuse in Orion → its size against the Sun's orbits → supernova → light reaches Earth (s01),
   inside the collapsing star (s02), particles arrive before light (s03). */
(function () {
  'use strict';
  const { clamp, ramp, smooth, bump, lerp, v3, rng, randomDir, cloudField } = F3;

  // Orion as seen from Earth: RA/Dec (degrees), distance (light-years), visual magnitude, colour
  const ORION = {
    betelgeuse: [88.793, 7.407, 550, 0.5, [1.0, 0.60, 0.32]], rigel: [78.634, -8.202, 860, 0.13, [0.82, 0.90, 1.0]],
    bellatrix: [81.283, 6.350, 250, 1.64, [0.86, 0.91, 1.0]], mintaka: [83.002, -0.299, 1200, 2.23, [0.86, 0.91, 1.0]],
    alnilam: [84.053, -1.202, 2000, 1.69, [0.86, 0.91, 1.0]], alnitak: [85.190, -1.943, 1260, 1.77, [0.86, 0.91, 1.0]],
    saiph: [86.939, -9.670, 650, 2.06, [0.86, 0.91, 1.0]], meissa: [83.785, 9.934, 1100, 3.33, [0.86, 0.91, 1.0]],
  };
  const FIGURE = [['meissa', 'betelgeuse'], ['meissa', 'bellatrix'], ['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'], ['alnitak', 'alnilam'],
    ['alnilam', 'mintaka'], ['alnitak', 'saiph'], ['mintaka', 'rigel']];
  const A0 = 84.2, D0 = 0.0;
  function dirOf(ra, dec) { // looking toward (A0,D0) along -Z, north up, east to the left
    const a = (ra - A0) * Math.PI / 180, d = dec * Math.PI / 180;
    return new THREE.Vector3(-Math.cos(d) * Math.sin(a), Math.sin(d) - Math.sin(D0 * Math.PI / 180), -Math.cos(d) * Math.cos(a)).normalize();
  }
  const PX = 38 * Math.PI / 180 / 1920; // radians per pixel (vertical)

  /* ================= s01: Betelgeuse ================= */
  F3.define('betelgeuse', ({ D, cues }) => {
    const c = cues;
    const T1 = c.sun - 0.38;                 // into the glow, out at the star
    const BLAST = c.blast;                   // "nổ"
    const T2 = c.earth - 0.62;               // light wash to Earth
    const ARRIVE = c.flare - 0.22;           // the light reaches Earth
    const FRONT_SPEED = 2.9, R_STAR = 1.5;

    /* ---- world 1: Orion from Earth, then the flight to Betelgeuse ---- */
    const s1 = new THREE.Scene(), cam1 = F3.camera(38, 150);
    const bg1 = F3.backdrop(s1, { seed: 11 });
    const stars1 = {};
    for (const [name, [ra, dec, ly, mag, col]] of Object.entries(ORION)) {
      const g = F3.glow(col, name === 'betelgeuse' ? 2.4 : 3.2);
      const pos = dirOf(ra, dec).multiplyScalar(ly / 10);
      g.position.copy(pos);
      const px = name === 'betelgeuse' ? 46 : 40 - 7 * mag;
      stars1[name] = { g, pos, base: (ly / 10) * px * PX * 2.6, mag };
      s1.add(g);
    }
    const nebula = F3.glow([0.62, 0.66, 0.78], 2.2); nebula.position.copy(dirOf(83.82, -5.39).multiplyScalar(134)); s1.add(nebula);
    const figure = FIGURE.map(([a, b]) => {
      const pa = stars1[a].pos, pb = stars1[b].pos, dir = pb.clone().sub(pa), L = dir.length(); dir.normalize();
      // keep the line clear of the star glows
      const m = F3.polyline([pa.clone().addScaledVector(dir, L * 0.07), pb.clone().addScaledVector(dir, -L * 0.07)], { width: 1.3, color: [0.66, 0.78, 0.84] });
      s1.add(m); return m;
    });
    const B = stars1.betelgeuse.pos.clone(), Bdir = B.clone().normalize();
    const centre = dirOf(84.2, -0.6).multiplyScalar(100);
    const flight = (t) => { // log-distance approach: Betelgeuse grows at a steady visual rate
      const k = smooth(c.naked - 0.45, T1, t); const k2 = k * k * (3 - 2 * k);
      const dist = 55 * Math.pow(0.3 / 55, k2);
      return { k, pos: Bdir.clone().multiplyScalar(55 - dist), dist };
    };

    /* ---- world 2: the red supergiant, its size, its end ---- */
    const s2 = new THREE.Scene(), cam2 = F3.camera(38, 150);
    const bg2 = F3.backdrop(s2, { seed: 12 });
    const star = F3.starBody(); s2.add(star.group);
    const sunDot = F3.glow([1.0, 0.86, 0.55], 3.0); s2.add(sunDot);
    const earthDot = F3.glow([0.72, 0.86, 0.95], 2.5), marsDot = F3.glow([0.95, 0.66, 0.48], 2.5); s2.add(earthDot, marsDot);
    const AU = R_STAR / 3.55; // Betelgeuse ≈ 3.5 AU in radius
    const orbitE = F3.polyline(F3.circlePoints(AU), { width: 1.8, color: [0.74, 0.86, 0.92], depthTest: false });
    const orbitM = F3.polyline(F3.circlePoints(1.524 * AU), { width: 1.8, color: [0.92, 0.70, 0.55], depthTest: false });
    orbitE.renderOrder = orbitM.renderOrder = 5; s2.add(orbitE, orbitM);
    const glowBlast = F3.glow([1.0, 0.96, 0.90], 2.0), glowCore = F3.glow([0.88, 0.93, 1.0], 4.0); s2.add(glowBlast, glowCore);
    const rem = F3.remnant(); s2.add(rem.mesh);
    const front = F3.lightFront(); s2.add(front.mesh);
    const dust = F3.echoDust({ count: 9000, seed: 4242, place: (r) => {
      const d = randomDir(r), rad = 3.2 + Math.pow(r(), 0.8) * 13, p = d.multiplyScalar(rad);
      return cloudField(p.x, p.y, p.z) + (r() - 0.5) * 0.8 > 0.45 ? p : null;
    } });
    s2.add(dust);
    const rig2 = F3.rig([
      { t: T1, p: [0.30, 0.10, 1.85], q: [0, 0, 0] },
      { t: T1 + 1.0, p: [1.8, 2.6, 6.2], q: [0, -0.08, 0] },
      { t: c.earthorbit - 0.6, p: [2.6, 5.6, 5.9], q: [0, -0.18, 0] },
      { t: c.quiet - 0.2, p: [2.2, 5.0, 6.6], q: [0, -0.12, 0] },
      { t: c.quiet + 1.6, p: [1.9, 0.9, 8.6], q: [0, 0.05, 0] },
      { t: BLAST - 0.25, p: [1.68, 0.6, 9.0], q: [0, 0.05, 0] },
      { t: BLAST, p: [1.62, 0.58, 8.8], q: [0, 0.05, 0], pIn: [-0.3, -0.1, -1.2], pOut: [-14, 7, 27] },
      { t: BLAST + 1.9, p: [-12, 7, 34], q: [0, 0.2, 0] },
      { t: T2 + 0.6, p: [-14.5, 8.8, 39.5], q: [0, 0.3, 0] },
    ]);
    const debris = (t) => R_STAR * 0.9 + 1.7 * (1 - Math.exp(-Math.max(0, t - BLAST) * 0.85));

    /* ---- world 3: Earth, the Moon, and Orion in the sky ---- */
    const s3 = new THREE.Scene(), cam3 = F3.camera(38, 150);
    const bg3 = F3.backdrop(s3, { seed: 13, band: 0.8 });
    const SUN3 = [1.0, 0.05, 0.25];
    const earth = F3.earth({ sun: SUN3, waveDir: Bdir.clone().negate().toArray(), night: 0.12 });
    s3.add(earth.group);
    const moon = F3.moon({ sun: SUN3 }); moon.mesh.scale.setScalar(0.27); moon.mesh.position.set(0.50, 2.05, -5.0); s3.add(moon.mesh);
    const sky3 = {};
    for (const [name, [ra, dec, , mag, col]] of Object.entries(ORION)) {
      const g = F3.glow(col, name === 'betelgeuse' ? 2.4 : 3.2);
      const pos = dirOf(ra, dec).multiplyScalar(1400); g.position.copy(pos);
      sky3[name] = { g, pos, base: 1400 * (40 - 7 * mag) * PX * 2.2 }; s3.add(g);
    }
    const figure3 = FIGURE.map(([a, b]) => {
      const pa = sky3[a].pos, pb = sky3[b].pos, dir = pb.clone().sub(pa), L = dir.length(); dir.normalize();
      const m = F3.polyline([pa.clone().addScaledVector(dir, L * 0.08), pb.clone().addScaledVector(dir, -L * 0.08)], { width: 1.2, color: [0.66, 0.78, 0.84] });
      s3.add(m); return m;
    });
    const sweep = F3.echoDust({ count: 2400, seed: 99, mode: 1, dir: Bdir.clone().negate().toArray(), width: 0.22, base: 0.04, sizeScale: 14, maxSize: 4, after: 0.05,
      place: (r) => { const p = new THREE.Vector3((r() - 0.5) * 12, (r() - 0.5) * 12, -8 + r() * 13); if (p.length() < 1.4) return null; return cloudField(p.x * 2, p.y * 2, p.z * 2) + (r() - 0.5) > 0.6 ? p : null; } });
    s3.add(sweep);
    const yawE = F3.earthYawFor(106, new THREE.Vector3(0.1, 0, 1));
    const rig3 = F3.rig([
      { t: T2, p: [0.48, 1.42, 3.45], q: [-0.32, 1.62, -4.0] },
      { t: c.flare, p: [0.40, 1.36, 3.15], q: [-0.28, 1.70, -4.0] },
      { t: D, p: [0.26, 1.22, 2.70], q: [-0.16, 1.92, -4.0] },
    ]);

    function ground(ctx, drop, a) {
      if (a <= 0.003) return;
      const base = 1730 + drop;
      if (base > 2100) return;
      ctx.save(); ctx.globalAlpha = a;
      const glow = ctx.createLinearGradient(0, base - 360, 0, base + 10);
      glow.addColorStop(0, 'rgba(60,96,118,0)'); glow.addColorStop(0.7, 'rgba(70,108,128,0.22)'); glow.addColorStop(1, 'rgba(96,132,148,0.42)');
      ctx.fillStyle = glow; ctx.fillRect(0, base - 360, 1080, 360);
      ctx.fillStyle = '#04080c'; ctx.beginPath(); ctx.moveTo(0, 1920 + drop);
      for (let x = 0; x <= 1080; x += 8) {
        const y = base - 34 * Math.sin(x * 0.004 + 1.2) - 18 * Math.sin(x * 0.011 + 0.4) - 7 * Math.sin(x * 0.037) - (x > 690 && x < 760 ? 42 * Math.sin((x - 690) / 70 * Math.PI) : 0);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(1080, 1920 + drop); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    function marker(ctx, cam, p, r, a) {
      if (a <= 0.003) return;
      const s = F3.project(cam, p); ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = 'rgba(237,240,233,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }

    const pAt = new THREE.Vector3();
    return {
      update(t) {
        /* ---------- world 1 ---------- */
        if (t < T1) {
          const f = flight(t);
          const lookFrom = centre.clone(), lookTo = B.clone();
          const aim = lookFrom.lerp(lookTo, smooth(c.naked - 0.6, T1 - 0.5, t));
          const drift = smooth(0, c.naked, t);
          cam1.position.copy(f.pos).add(new THREE.Vector3(0, 0, 0));
          cam1.up.set(0, 1, 0);
          cam1.lookAt(aim.x + 2.5 * (1 - drift), aim.y - 3 + 3 * drift, aim.z);
          cam1.updateMatrixWorld();
          bg1.follow(cam1, t);
          for (const [name, s] of Object.entries(stars1)) {
            const d = s.pos.distanceTo(cam1.position);
            const tw = 0.92 + 0.08 * Math.sin(t * 2.1 + s.base);
            if (name === 'betelgeuse') {
              const heat = smooth(T1 - 0.9, T1, t);
              s.g.set(cam1, s.base * (1 + 0.06 * Math.sin(t * 1.7)), 1.2 - 0.35 * heat, [1.0, 0.55 + 0.05 * heat, 0.26 + 0.02 * heat]);
            } else s.g.set(cam1, s.base, (1.15 - 0.12 * s.mag) * tw * (1 - smooth(T1 - 0.6, T1, t)));
          }
          nebula.set(cam1, 8.5, 0.22 * (1 - f.k));
          const lineA = smooth(0.05, 1.0, t) * (1 - smooth(c.naked - 0.4, c.naked + 0.5, t));
          figure.forEach((m, i) => m.set(0.55 * lineA, clamp((t - 0.05 - i * 0.07) / 0.55)));
          const labels = [
            { text: 'Betelgeuse', p: B, dx: -6, dy: 70, size: 44, a: smooth(c.name - 0.1, c.name + 0.3, t) * (1 - smooth(c.naked - 0.3, c.naked + 0.2, t)) },
            { text: 'Orion', p: stars1.saiph.pos.clone().lerp(stars1.rigel.pos, 0.5), dy: 120, size: 40, color: '#b8d4df',
              a: smooth(c.orion - 0.1, c.orion + 0.35, t) * (1 - smooth(c.naked - 0.3, c.naked + 0.2, t)) },
          ];
          const groundA = 1 - smooth(c.naked - 0.5, c.naked + 0.6, t);
          return {
            scene: s1, camera: cam1, labels,
            flash: 0.0,
            draw2d: (ctx) => { ground(ctx, 700 * smooth(c.naked - 0.55, c.naked + 0.75, t), 1); marker(ctx, cam1, B, 36, smooth(c.name - 0.1, c.name + 0.3, t) * (1 - smooth(c.naked - 0.6, c.naked, t)) * 0.8); },
          };
        }
        /* ---------- world 2 ---------- */
        if (t < T2) {
          const post = t - BLAST, blasted = post > 0;
          const shake = blasted ? [0.09 * Math.exp(-post * 6) * Math.sin(post * 53), 0.09 * Math.exp(-post * 6) * Math.cos(post * 41), 0] : null;
          rig2(t, cam2, shake);
          const roll = 0.035 * smooth(BLAST + 0.4, T2, t);
          cam2.up.set(Math.sin(roll), Math.cos(roll), 0); cam2.lookAt(F3.track ? cam2.getWorldDirection(pAt).add(cam2.position) : pAt); cam2.updateMatrixWorld();
          bg2.follow(cam2, t);
          const ghost = smooth(c.sun - 0.05, c.sun + 0.75, t) * (1 - smooth(c.quiet + 0.05, c.quiet + 0.9, t));
          const pre = smooth(BLAST - 0.7, BLAST, t);
          const sR = R_STAR * (1 - 0.055 * pre * pre) * (blasted ? 1 - 0.5 * ramp(0, 0.3, post) : 1);
          star.set(cam2, { radius: sR, time: t, dim: 1 - 0.26 * pre * pre, heat: blasted ? clamp(post / 0.06) : 0, stir: pre, ghost,
            glow: 0.30 * (1 - 0.3 * pre) * (1 - smooth(T1, T1 + 0.6, t) * 0) + 1.6 * (1 - smooth(T1, T1 + 0.5, t)), glowScale: 4.6, visible: post < 0.3 });
          // the Sun and the orbits inside the star
          const orbitA = ghost;
          sunDot.position.set(0, 0, 0); sunDot.set(cam2, 0.13, 0.95 * smooth(c.sun + 0.6, c.sun + 1.1, t) * orbitA);
          const aE = 0.30 + t * 0.012, aM = 3.55 + t * 0.008;
          earthDot.position.set(Math.cos(aE) * AU, 0, Math.sin(aE) * AU); marsDot.position.set(Math.cos(aM) * 1.524 * AU, 0, Math.sin(aM) * 1.524 * AU);
          const eA = smooth(c.earthorbit - 0.15, c.earthorbit + 0.4, t) * orbitA, mA = smooth(c.mars - 0.35, c.mars + 0.2, t) * orbitA;
          orbitE.set(0.95 * eA, smooth(c.earthorbit - 0.2, c.earthorbit + 0.6, t)); orbitM.set(0.95 * mA, smooth(c.mars - 0.4, c.mars + 0.35, t));
          earthDot.set(cam2, 0.09, 1.1 * eA); marsDot.set(cam2, 0.09, 1.1 * mA);
          // blast
          const flash = blasted ? clamp(post / 0.04) * Math.exp(-post / 0.32) : 0;
          glowBlast.set(cam2, R_STAR * (4 + 9 * (1 - Math.exp(-post * 3.0))), blasted && post < 3 ? 1.5 * flash : 0);
          glowCore.set(cam2, 1.0 + 1.0 * Math.exp(-post * 0.9), blasted ? 0.45 + 1.0 * Math.exp(-post * 1.2) : 0);
          const R = debris(t), age = clamp(post / 3.5);
          rem.set({ visible: blasted, R, time: t, age, hot: blasted ? Math.exp(-post / 0.35) : 0, a: blasted ? clamp(post / 0.12) * (1.0 + 1.4 * Math.exp(-post / 0.3)) * (1 - 0.2 * age) : 0 });
          const rF = blasted ? R_STAR + FRONT_SPEED * post : -100;
          front.set(rF, blasted ? clamp(post / 0.35) * 1.15 : 0);
          dust.set(rF, blasted ? 1 : 0); dust.visible = blasted;
          const labels = [
            { text: 'Mặt Trời', p: new THREE.Vector3(0, 0, 0), dy: -40, size: 34, color: '#f1dcae', a: smooth(c.sun + 0.7, c.sun + 1.1, t) * orbitA },
            { text: 'Trái Đất', p: earthDot.position, dx: 20, dy: 40, size: 36, color: '#cfe2ea', a: smooth(c.earthorbit + 0.1, c.earthorbit + 0.5, t) * orbitA },
            { text: 'Sao Hỏa', p: marsDot.position, dx: -10, dy: -40, size: 36, color: '#f0c8ae', a: smooth(c.mars, c.mars + 0.4, t) * orbitA },
          ];
          return { scene: s2, camera: cam2, labels, flash: 0.5 * flash, wash: 0.55 * smooth(T2 - 0.45, T2, t) };
        }
        /* ---------- world 3 ---------- */
        rig3(t, cam3);
        bg3.follow(cam3, t);
        const arrive = t - ARRIVE, lit = arrive > 0 ? clamp(arrive / 0.14) : 0, burst = arrive > 0 ? Math.exp(-arrive / 0.7) : 0;
        earth.set({ yaw: yawE + t * 0.02, wave: -1.2 + 2.6 * (t - ARRIVE), boost: burst, flash: arrive > 0 ? lit * (0.18 + 0.9 * burst) : 0 });
        sweep.set(-1.2 + 2.6 * (t - ARRIVE), 1);
        for (const [name, s] of Object.entries(sky3)) {
          if (name === 'betelgeuse') {
            s.g.set(cam3, s.base * (1.25 + lit * (1.5 + 2.2 * burst)), 1.0 + lit * (0.55 + 0.9 * burst), [1.0, 0.60 + 0.37 * lit, 0.32 + 0.62 * lit]);
          } else s.g.set(cam3, s.base, 0.95);
        }
        figure3.forEach((m) => m.set(0.32 * (1 - 0.5 * lit), 1));
        moon.mesh.rotation.y = 0.4;
        return { scene: s3, camera: cam3, wash: 0.55 * (1 - smooth(T2, T2 + 0.45, t)) };
      },
    };
  });

  /* ================= s02: inside the star ================= */
  F3.define('collapse', ({ D, cues }) => {
    const c = cues;
    const scene = new THREE.Scene(), cam = F3.camera(38, 150);
    const bg = F3.backdrop(scene, { seed: 21 });
    const R_STAR = 1.5;
    const star = F3.starBody(); scene.add(star.group);
    const cut = star.cut;
    // onion shells: radius (star radii), outer colour, inner colour
    const LAYERS = [[0.46, [0.82, 0.40, 0.15], [0.50, 0.20, 0.07]], [0.30, [0.94, 0.64, 0.33], [0.62, 0.36, 0.16]],
      [0.18, [0.92, 0.82, 0.64], [0.62, 0.52, 0.40]], [0.085, [0.84, 0.88, 0.92], [0.60, 0.64, 0.68]]];
    const shellMat = (side, col) => {
      const m = new THREE.ShaderMaterial({
        side, uniforms: { uC: { value: v3(col) }, uHeat: { value: 0 } }, vertexShader: F3.LIMB_VERT,
        fragmentShader: F3.NOISE + F3.CUT_GLSL + `uniform vec3 uC;uniform float uHeat;varying vec3 vN;varying vec3 vV;varying vec3 vO;varying vec3 vP;
          void main(){${F3.CUT_TEST}float k=0.45+0.55*abs(dot(normalize(vN),normalize(vV)));float n=0.9+0.1*snoise(normalize(vO)*9.0);
          gl_FragColor=vec4(mix(uC*k*n,vec3(1.0,0.97,0.92),uHeat),1.0);}`,
      });
      F3.shareCut(m, cut); return m;
    };
    // the inside face of the envelope
    const env = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), shellMat(THREE.BackSide, [0.46, 0.15, 0.06]));
    env.scale.setScalar(R_STAR * 0.995); scene.add(env);
    const layers = LAYERS.map(([r, out, ins]) => {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(new THREE.SphereGeometry(r, 80, 56), shellMat(THREE.FrontSide, out)), new THREE.Mesh(new THREE.SphereGeometry(r, 80, 56), shellMat(THREE.BackSide, ins)));
      grp.scale.setScalar(R_STAR); scene.add(grp); return grp;
    });
    const core = layers[layers.length - 1];
    const coreGlow = F3.glow([0.92, 0.95, 1.0], 3.0); scene.add(coreGlow);
    const r = rng(77), list = [];
    for (let i = 0; i < 240; i++) { const d = randomDir(r); list.push({ o: d.clone().multiplyScalar(0.05).toArray(), d: d.toArray(), delay: r() * 0.35, speed: 3.0 + r() * 1.4, len: 0.8 + r() * 0.5, max: 14 }); }
    const nu = F3.streaks(list, { width: 3.4, color: F3.C.amber }); nu.material.depthTest = false; nu.renderOrder = 8; scene.add(nu);
    const shock = F3.lightFront([0.92, 0.96, 0.98], 5); scene.add(shock.mesh);
    const front = F3.lightFront(); scene.add(front.mesh);
    const T_COL = c.collapse, T_NU = c.release - 0.05, T_SHOCK = c.light - 0.2, T_OUT = c.surface + 0.15;
    const rigC = F3.rig([
      { t: 0, p: [5.6, 1.6, 7.2], q: [0, 0.1, 0] },
      { t: c.core - 0.4, p: [3.6, 1.2, 4.6], q: [0, 0.0, 0] },
      { t: T_COL + 0.3, p: [3.0, 1.0, 3.8], q: [0, 0, 0] },
      { t: c.escape, p: [4.6, 1.7, 6.6], q: [0, 0.1, 0] },
      { t: c.shock, p: [3.9, 1.4, 5.4], q: [0, 0.05, 0] },
      { t: D, p: [5.4, 1.9, 8.4], q: [0, 0.2, 0], hold: true },
    ]);
    return {
      update(t) {
        rigC(t, cam); bg.follow(cam, t);
        // a wedge cut toward the camera opens the star
        const open = smooth(1.0, 3.4, t);
        const ang = Math.atan2(cam.position.x, cam.position.z), half = 0.52 * open;
        cut.uCutOn.value = open > 0.01 ? 1 : 0;
        cut.uCutA.value.set(-Math.cos(ang - half), 0, Math.sin(ang - half));
        cut.uCutB.value.set(Math.cos(ang + half), 0, -Math.sin(ang + half));
        const heat = t > T_OUT ? Math.exp(-(t - T_OUT) / 0.7) * clamp((t - T_OUT) / 0.12) : 0;
        star.set(cam, { radius: R_STAR, time: t + 30, heat: heat * 0.8, glow: 0.22 + 0.9 * heat, halo: 0.5 });
        const col = smooth(T_COL - 0.15, T_COL + 0.25, t);
        core.scale.setScalar(R_STAR * (1 - 0.72 * col));
        core.children.forEach(m => { m.material.uniforms.uHeat.value = col; });
        coreGlow.set(cam, 0.45 + 0.5 * col, col * (1.1 + 0.6 * Math.exp(-(t - T_COL) * 2)));
        nu.set(t, T_NU, smooth(T_NU, T_NU + 0.15, t) * (1 - smooth(D - 1.0, D, t)));
        const rs = t > T_SHOCK ? lerp(0.13, 1.0, ramp(T_SHOCK, T_OUT, t)) * R_STAR : 0;
        shock.set(rs, t > T_SHOCK && t < T_OUT + 0.15 ? 1.0 * smooth(T_SHOCK, T_SHOCK + 0.3, t) : 0);
        front.set(t > T_OUT ? R_STAR + 2.6 * (t - T_OUT) : 0, t > T_OUT ? 1.0 : 0);
        const labels = [
          { text: 'Lõi sao', p: new THREE.Vector3(0, 0, 0), dy: 70, size: 36, color: '#d8e4e8', a: smooth(c.core - 0.2, c.core + 0.3, t) * (1 - smooth(T_NU - 0.1, T_NU + 0.3, t)) },
          { text: 'Dòng hạt', x: 540, y: 250, size: 44, color: '#efb768', a: smooth(c.through - 0.3, c.through + 0.2, t) * (1 - smooth(c.light - 0.4, c.light, t)) },
          { text: 'Sóng xung kích', x: 540, y: 250, size: 42, color: '#d8e4e8', a: smooth(c.shock - 0.2, c.shock + 0.25, t) * (1 - smooth(T_OUT - 0.2, T_OUT + 0.1, t)) },
          { text: 'Ánh sáng thoát ra — vài giờ sau', x: 540, y: 250, size: 40, color: '#edf0e9', a: smooth(T_OUT, T_OUT + 0.35, t) },
        ];
        return { labels, flash: heat * 0.3 };
      },
      scene, camera: cam,
    };
  });

  /* ================= s03: the particles arrive first ================= */
  F3.define('arrival', ({ D, cues }) => {
    const c = cues;
    const scene = new THREE.Scene(), cam = F3.camera(38, 150);
    const bg = F3.backdrop(scene, { seed: 31 });
    const SRC = new THREE.Vector3(0, 2.85, -1.2), EARTH = new THREE.Vector3(0, -2.5, 0);
    const dir = EARTH.clone().sub(SRC).normalize(), L = EARTH.distanceTo(SRC);
    const star = F3.glow([1.0, 0.94, 0.84], 2.6); star.position.copy(SRC); scene.add(star);
    const earth = F3.earth({ sun: [0.95, 0.15, 0.3], waveDir: dir.toArray(), night: 0.14 }); earth.group.position.copy(EARTH); scene.add(earth.group);
    const ping = F3.glow(F3.C.amber, 2.4); ping.position.copy(EARTH.clone().addScaledVector(dir, -1.02)); scene.add(ping);
    const T_LIGHT = 0.45;
    const arriveNu = c.first - 0.12, arriveL = c.see - 0.12;
    const NU_SPEED = (L - 1) / arriveNu, LIGHT_SPEED = (L - 1) / (arriveL - T_LIGHT);
    const r = rng(303), list = [];
    const side = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let i = 0; i < 80; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.30;
      const o = SRC.clone().addScaledVector(side, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr);
      list.push({ o: o.toArray(), d: dir.toArray(), delay: r() * 0.35, speed: NU_SPEED * (0.98 + r() * 0.05), len: 1.5, max: L + 3 });
    }
    const nu = F3.streaks(list, { width: 3.2 }); nu.material.depthTest = false; scene.add(nu);
    const front = F3.lightFront([0.92, 0.95, 0.94], 9); front.mesh.position.copy(SRC); scene.add(front.mesh);
    const rigA = F3.rig([
      { t: 0, p: [14.6, 0.2, 3.6], q: [0, -0.20, -0.5] },
      { t: D, p: [13.4, 0.0, 3.2], q: [0, -0.32, -0.45], hold: true },
    ]);
    const yaw = F3.earthYawFor(106, new THREE.Vector3(1, 0, 0.3));
    return {
      update(t) {
        rigA(t, cam); bg.follow(cam, t);
        star.set(cam, 1.5, 1.25);
        nu.set(t, 0, 1);
        const rL = Math.max(0, (t - T_LIGHT) * LIGHT_SPEED);
        front.set(rL, t > T_LIGHT ? 1.0 : 0);
        earth.set({ yaw: yaw + t * 0.02, wave: rL - L, boost: t > arriveL ? Math.exp(-(t - arriveL) / 0.8) : 0, flash: t > arriveL ? 0.8 * Math.exp(-(t - arriveL) / 0.8) : 0 });
        const pingA = t > arriveNu ? clamp((t - arriveNu) / 0.08) * (0.45 + 0.9 * Math.exp(-(t - arriveNu) / 0.5)) : 0;
        ping.set(cam, 1.1, pingA);
        const headNu = SRC.clone().addScaledVector(dir, Math.min(L - 1, t * NU_SPEED));
        const headL = SRC.clone().addScaledVector(dir, Math.min(L - 1, rL));
        const labels = [
          { text: 'Dòng hạt', p: headNu, dx: 150, dy: 0, size: 42, color: '#efb768', a: smooth(0.25, 0.6, t) * (1 - smooth(arriveNu + 0.1, arriveNu + 0.5, t)) },
          { text: 'Ánh sáng', p: headL, dx: -150, dy: 0, size: 42, color: '#d8e4e8', a: smooth(T_LIGHT + 0.3, T_LIGHT + 0.7, t) * (1 - smooth(arriveL + 0.1, arriveL + 0.5, t)) },
        ];
        return { labels };
      },
      scene, camera: cam,
    };
  });
})();
