/* IceCube: the array is born in the ice (s13), 5,160 sensors in a cubic kilometre (s15), Cherenkov light (s16),
   timing and direction (s17), the 2013 evidence (s18). 1 unit = 100 m; the surface is y = 0. */
(function () {
  'use strict';
  const { clamp, ramp, smooth, bump, lerp, v3, rng, randomDir } = F3;
  const ICE = [0.72, 0.83, 0.87], AMBER = F3.C.amber;
  const FOG = [0.035, 0.085, 0.115];

  /* ---------- the instrument, built once per scene ---------- */
  function layout() {
    const pts = [];
    for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
      const s = -q - r; if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) > 5) continue;
      pts.push(new THREE.Vector2(1.25 * (q + r / 2), 1.25 * (r * Math.sqrt(3) / 2)));
    }
    const c = new THREE.Vector2(0.45, -0.35);
    pts.sort((a, b) => a.distanceTo(c) - b.distanceTo(c));
    const standard = pts.slice(0, 78);
    const deep = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; deep.push(new THREE.Vector2(Math.cos(a) * 0.72 + 0.1, Math.sin(a) * 0.72 - 0.1)); }
    deep.push(new THREE.Vector2(0.45, 0.25), new THREE.Vector2(-0.3, -0.38));
    const doms = [];
    standard.forEach((p, si) => { for (let k = 0; k < 60; k++) doms.push({ p: new THREE.Vector3(p.x, -14.5 - k * 10 / 59, p.y), s: si }); });
    deep.forEach((p, di) => {
      for (let k = 0; k < 10; k++) doms.push({ p: new THREE.Vector3(p.x, -17.5 - k * 1.0 / 9, p.y), s: 78 + di });
      for (let k = 0; k < 50; k++) doms.push({ p: new THREE.Vector3(p.x, -21.0 - k * 3.5 / 49, p.y), s: 78 + di });
    });
    return { standard, deep, strings: standard.concat(deep), doms };
  }
  const LAYOUT = layout(); // 86 strings, 5,160 sensors

  function iceWorld(opts = {}) {
    const scene = new THREE.Scene();
    const L = LAYOUT, N = L.doms.length;
    // background: deep ice below, Antarctic twilight above
    const bg = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({
      uniforms: { uUnder: { value: 1 } }, side: THREE.BackSide, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform float uUnder;varying vec3 vDir;void main(){vec3 d=normalize(vDir);
        vec3 ice=mix(vec3(0.012,0.035,0.05),vec3(0.05,0.12,0.16),smoothstep(-0.9,0.6,d.y));
        vec3 sky=mix(vec3(0.16,0.20,0.27),vec3(0.05,0.08,0.13),smoothstep(0.0,0.6,d.y))+vec3(0.35,0.22,0.16)*exp(-pow(d.y/0.08,2.0))*0.6;
        gl_FragColor=vec4(mix(sky,ice,uUnder),1.0);}`,
    }));
    bg.renderOrder = -10; bg.frustumCulled = false; scene.add(bg);
    // snow surface: opaque from above, a faint ceiling from below
    const snow = new THREE.Mesh(new THREE.CircleGeometry(300, 128).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uA: { value: 1 } }, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      vertexShader: 'varying vec3 vP;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}',
      fragmentShader: F3.NOISE + `uniform float uA;varying vec3 vP;void main(){float n=fbm3(vec3(vP.x*0.9,vP.z*3.5,2.0))*0.5+0.5;float dc=length(vP.xz-cameraPosition.xz);float d=length(vP.xz);
        vec3 c=mix(vec3(0.42,0.50,0.60),vec3(0.66,0.74,0.82),n*0.6+0.4*smoothstep(1.0,12.0,dc));c=mix(c,vec3(0.36,0.40,0.50),smoothstep(40.0,280.0,d));c*=0.75+0.25*smoothstep(0.5,6.0,dc);
        float under=step(cameraPosition.y,0.0);
        gl_FragColor=vec4(mix(c*0.85,vec3(0.10,0.20,0.26),under),uA*mix(1.0,0.35,under));}`,
    }));
    scene.add(snow);
    // IceCube Lab on its stilts
    const lab = new THREE.Group();
    const labMat = new THREE.ShaderMaterial({ vertexShader: F3.LIMB_VERT,
      fragmentShader: 'varying vec3 vN;varying vec3 vV;void main(){float k=0.45+0.55*max(dot(normalize(vN),normalize(vec3(-0.6,0.5,0.6))),0.0);gl_FragColor=vec4(vec3(0.42,0.50,0.58)*k,1.0);}' });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.20), labMat); box.position.y = 0.16; lab.add(box);
    for (const x of [-0.15, 0.15]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), labMat); t.position.set(x, 0.08, 0); lab.add(t); }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.07), labMat); tower.position.set(0.12, 0.30, 0.0); lab.add(tower);
    lab.position.set(0.3, 0, 0.2); scene.add(lab);
    const labLight = F3.glow([1.0, 0.36, 0.30], 3.0); labLight.position.set(0.05, 0.18, 0.31); scene.add(labLight);
    // strings: cable from the surface to the deepest sensor
    const segs = L.strings.map((p, i) => ({ a: new THREE.Vector3(p.x, 0, p.y), b: new THREE.Vector3(p.x, -24.5, p.y), u0: (i % 13) / 13 * 0.4, u1: (i % 13) / 13 * 0.4 + 0.6, k: 1 }));
    const cables = F3.segLines(segs, { width: 0.9, color: [0.55, 0.70, 0.78] }); scene.add(cables);
    // sensors: a fine point each; hit sensors grow into spheres sized by the light they saw (event-display style)
    const R0 = opts.domSize || 0.06;
    const geo = new THREE.SphereGeometry(1, 16, 12);
    const hit = new Float32Array(N).fill(1e4), q = new Float32Array(N), tc = new Float32Array(N);
    geo.setAttribute('aHit', new THREE.InstancedBufferAttribute(hit, 1));
    geo.setAttribute('aQ', new THREE.InstancedBufferAttribute(q, 1));
    geo.setAttribute('aTc', new THREE.InstancedBufferAttribute(tc, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBase: { value: 1 }, uFog: { value: v3(FOG) }, uFogD: { value: opts.fogD || 30 }, uGrow: { value: 4 }, uHold: { value: 1 },
        uDrop: { value: 1 }, uR0: { value: R0 }, uEarly: { value: v3([1.0, 0.78, 0.42]) }, uLate: { value: v3([0.62, 0.84, 1.0]) }, uTimeColor: { value: 1 } },
      vertexShader: `attribute float aHit;attribute float aQ;attribute float aTc;uniform float uTime;uniform float uGrow;uniform float uHold;uniform float uR0;
        varying float vLit;varying float vTc;varying vec3 vN;varying float vD;
        void main(){float k=uTime-aHit;float lit=k>0.0?aQ*(uHold+(1.0-uHold)*exp(-k/0.5))*smoothstep(0.0,0.08,k):0.0;
          float r=lit>0.002?uR0*(1.0+lit*uGrow):0.0;
          vec4 wp=modelMatrix*instanceMatrix*vec4(position*r,1.0);
          vN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);vLit=lit;vTc=aTc;vD=length(cameraPosition-wp.xyz);
          gl_Position=projectionMatrix*viewMatrix*wp;}`,
      fragmentShader: `uniform vec3 uFog;uniform float uFogD;uniform vec3 uEarly;uniform vec3 uLate;uniform float uTimeColor;
        varying float vLit;varying float vTc;varying vec3 vN;varying float vD;
        void main(){float shade=0.55+0.45*max(dot(normalize(vN),normalize(vec3(-0.4,0.7,0.6))),0.0);
          vec3 hc=uTimeColor>0.5?mix(uEarly,uLate,clamp(vTc,0.0,1.0)):vec3(0.80,0.93,1.0);
          vec3 c=hc*shade*(0.75+0.35*min(vLit,1.5));
          float fog=1.0-exp(-vD/(uFogD*1.6));c=mix(c,uFog,fog*0.6);
          gl_FragColor=vec4(c,1.0);}`,
    });
    const doms = new THREE.InstancedMesh(geo, mat, N);
    const m4 = new THREE.Matrix4();
    L.doms.forEach((d, i) => { m4.makeTranslation(d.p.x, d.p.y, d.p.z); doms.setMatrixAt(i, m4); });
    doms.frustumCulled = false; scene.add(doms);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(L.doms.flatMap(d => [d.p.x, d.p.y, d.p.z]), 3));
    const pmat = new THREE.ShaderMaterial({
      uniforms: { uBase: mat.uniforms.uBase, uDrop: mat.uniforms.uDrop, uFogD: mat.uniforms.uFogD }, ...F3.additive,
      vertexShader: `uniform float uDrop;uniform float uFogD;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;float d=-mv.z;
        gl_PointSize=clamp(2.0+26.0/max(d,0.1),1.6,7.0);vA=exp(-d/uFogD)*smoothstep(0.0,0.02,uDrop*24.5+position.y);}`,
      fragmentShader: `uniform float uBase;varying float vA;void main(){float r=length(gl_PointCoord-0.5)*2.0;float a=smoothstep(1.0,0.2,r);gl_FragColor=vec4(vec3(0.70,0.82,0.88)*a*vA*0.9*uBase,1.0);}`,
    });
    const points = new THREE.Points(pg, pmat); points.frustumCulled = false; scene.add(points);
    function setHits(fn) { // fn(position, index) -> {t, q, tc} or null
      L.doms.forEach((d, i) => { const h = fn(d.p, i); if (h) { hit[i] = h.t; q[i] = h.q; tc[i] = h.tc ?? 0; } else { hit[i] = 1e4; q[i] = 0; } });
      geo.attributes.aHit.needsUpdate = geo.attributes.aQ.needsUpdate = geo.attributes.aTc.needsUpdate = true;
    }
    return {
      scene, bg, snow, lab, labLight, cables, doms, mat, setHits, layout: L,
      frame(cam, t) {
        bg.position.copy(cam.position);
        const under = clamp((0.6 - cam.position.y) / 1.2);
        bg.material.uniforms.uUnder.value = under;
        labLight.set(cam, 0.16, (0.8 + 0.2 * Math.sin(t * 6)) * (1 - under * 0.7));
        mat.uniforms.uTime.value = t;
      },
    };
  }
  // hit pattern of a straight Cherenkov-emitting track: t0 at p0, unit dir d, particle speed v (units/s)
  const TANC = Math.tan(40.8 * Math.PI / 180);
  function trackHits(p0, d, t0, v, maxRho = 2.2, len = 40) {
    return (x) => {
      const rel = x.clone().sub(p0), z = rel.dot(d), rho = rel.clone().addScaledVector(d, -z).length();
      if (rho > maxRho || z < -0.2 || z - rho / TANC > len) return null;
      const t = t0 + (z + rho * TANC) / v;
      return { t, q: clamp(1.4 * Math.exp(-rho / 0.9)) * (0.6 + 0.4 * Math.abs(Math.sin(x.x * 13 + x.y * 7))), tc: 0 };
    };
  }
  function cascadeHits(c0, t0, v, maxR = 3.4) {
    return (x) => {
      const r = x.distanceTo(c0); if (r > maxR) return null;
      return { t: t0 + r / v, q: clamp(1.6 * Math.exp(-r / 1.1)), tc: 0 };
    };
  }

  /* ================= s13: the ice becomes the detector ================= */
  F3.define('array', ({ D, cues }) => {
    const c = cues;
    const W = iceWorld({ domSize: 0.06 }), cam = F3.camera(40, 150);
    const rig = F3.rig([
      { t: 0, p: [3.2, 0.62, 5.6], q: [0.2, 0.52, 0.1] },
      { t: c.ice - 0.45, p: [3.4, 1.0, 6.2], q: [0.2, 0.0, 0.1] },
      { t: c.ice + 0.7, p: [9, -2.0, 19], q: [0.2, -8.0, 0] },
      { t: c.born, p: [21, -6.5, 30], q: [0.2, -13.5, 0] },
      { t: D, p: [22.5, -7.0, 31.5], q: [0.2, -14.0, 0], hold: true },
    ]);
    return {
      update(t) {
        rig(t, cam); W.frame(cam, t);
        const drop = smooth(c.down + 0.1, c.ice + 1.6, t);
        W.cables.set(0.5, drop);
        W.mat.uniforms.uDrop.value = drop;
        W.mat.uniforms.uBase.value = 0.75 + 0.6 * smooth(c.born - 0.3, c.born + 0.4, t);
        W.snow.material.uniforms.uA.value = 1 - 0.75 * smooth(c.ice - 0.6, c.ice + 0.6, t);
        const labels = [{ text: 'IceCube', x: 540, y: 290, size: 84, color: '#edf0e9', a: smooth(c.born - 0.05, c.born + 0.35, t) },
          { text: 'Băng Nam Cực · sâu 1,45–2,45 km', x: 540, y: 380, size: 36, color: '#b8d4df', a: smooth(c.born + 0.4, c.born + 0.8, t) }];
        return { scene: W.scene, camera: cam, labels };
      },
    };
  });

  /* ================= s15: 5,160 sensors in about a cubic kilometre ================= */
  F3.define('sensor', ({ D, cues }) => {
    const c = cues;
    const W = iceWorld({ domSize: 0.06, fogD: 40 }), cam = F3.camera(40, 150);
    const C0 = new THREE.Vector3(0.2, -19.5, 0);
    const corners = [];
    for (const x of [-5, 5]) for (const y of [-5, 5]) for (const z of [-5, 5]) corners.push(C0.clone().add(new THREE.Vector3(x, y, z)));
    const cube = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]].map(([a, b]) => { const m = F3.polyline([corners[a], corners[b]], { width: 1.8, color: AMBER }); W.scene.add(m); return m; });
    const rig = F3.rig([{ t: 0, p: [20, -9.5, 27], q: [0.2, -18.5, 0] }, { t: D, p: [27, -11, 17], q: [0.2, -19.0, 0], hold: true }]);
    return {
      update(t) {
        rig(t, cam); W.frame(cam, t);
        W.cables.set(0.45, 1); W.snow.material.uniforms.uA.value = 0.25;
        const pulse = 0.85 + 0.5 * bump(c.count - 0.2, c.count + 0.2, c.count + 0.8, c.count + 1.4, t);
        W.mat.uniforms.uBase.value = pulse;
        const k = smooth(c.km - 0.2, c.km + 0.6, t);
        cube.forEach((m, i) => m.set(0.95 * k, clamp(k * 1.4 - i * 0.03)));
        const n = Math.round(5160 * smooth(c.count - 0.15, c.count + 0.9, t));
        const fmt = n >= 1000 ? Math.floor(n / 1000) + '.' + String(n % 1000).padStart(3, '0') : String(n);
        const labels = [
          { text: fmt, x: 540, y: 300, size: 120, color: '#edf0e9', a: smooth(c.count - 0.2, c.count, t) * (1 - smooth(c.km - 0.3, c.km, t)) },
          { text: 'cảm biến', x: 540, y: 395, size: 42, color: '#b8d4df', a: smooth(c.count - 0.2, c.count, t) * (1 - smooth(c.km - 0.3, c.km, t)) },
          { text: '≈ 1 km³', x: 540, y: 300, size: 110, color: '#efb768', a: smooth(c.km, c.km + 0.3, t) },
        ];
        return { scene: W.scene, camera: cam, labels };
      },
    };
  });

  /* ================= s16: light slower than the particle — Cherenkov light ================= */
  F3.define('cherenkov', ({ D, cues }) => {
    const c = cues;
    const W = iceWorld({ domSize: 0.035, fogD: 18 }), cam = F3.camera(40, 150);
    const V = new THREE.Vector3(1.2, -22.6, 0.6), DIR = new THREE.Vector3(-0.18, 1, -0.10).normalize();
    const T_INT = 1.1, VP = 1.25, N_IDX = 1.31, VL = VP / N_IDX;
    const nuDir = DIR.clone().add(new THREE.Vector3(0.05, 0, 0.04)).normalize();
    const nu = F3.streaks([{ o: V.clone().addScaledVector(nuDir, -9).toArray(), d: nuDir.toArray(), speed: 9 / 1.0, len: 3.5, max: 9 }], { width: 5, head: 1.4 }); nu.material.depthTest = false; W.scene.add(nu);
    const vtx = F3.glow([0.92, 0.96, 1.0], 2.2); vtx.position.copy(V); W.scene.add(vtx);
    const mu = F3.streaks([{ o: V.toArray(), d: DIR.toArray(), speed: VP, len: 30, max: 30 }], { width: 3.4, color: [0.88, 0.95, 0.99], head: 1.4 }); mu.material.depthTest = false; W.scene.add(mu);
    const muHead = F3.glow([0.9, 0.96, 1.0], 2.4); W.scene.add(muHead);
    // wavelets: light emitted along the track spreads slower than the particle; their envelope is the cone
    const wav = [];
    for (let i = 0; i < 16; i++) { const f = F3.lightFront([0.66, 0.84, 1.0], 7); W.scene.add(f.mesh); wav.push({ f, te: T_INT + 0.25 + i * 0.42 }); }
    const coneMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 } }, ...F3.additive, side: THREE.DoubleSide, vertexShader: F3.LIMB_VERT,
      fragmentShader: 'uniform float uA;varying vec3 vN;varying vec3 vV;varying vec3 vO;void main(){float f=1.0-abs(dot(normalize(vN),normalize(vV)));float fade=smoothstep(0.0,0.6,1.0+vO.y);gl_FragColor=vec4(vec3(0.60,0.82,1.0)*(0.08+0.6*pow(f,2.0))*uA*fade,1.0);}' });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(TANC, 1, 72, 1, true), coneMat); cone.geometry.translate(0, -0.5, 0); W.scene.add(cone);
    W.setHits(trackHits(V, DIR, T_INT, VP, 2.4, 30));
    W.mat.uniforms.uTimeColor.value = 0; W.mat.uniforms.uGrow.value = 1.3;
    const rig = F3.rig([
      { t: 0, p: [5.6, -22.6, 6.6], q: [0.8, -21.4, 0.2] },
      { t: c.slow, p: [5.2, -20.4, 6.4], q: [0.5, -19.6, 0.1] },
      { t: c.faster, p: [5.6, -18.6, 7.0], q: [0.3, -18.0, -0.1] },
      { t: D, p: [6.6, -16.8, 8.4], q: [0.1, -17.0, -0.3], hold: true },
    ]);
    return {
      update(t) {
        rig(t, cam); W.frame(cam, t);
        W.cables.set(0.35, 1); W.snow.material.uniforms.uA.value = 0.2; W.mat.uniforms.uBase.value = 0.65;
        nu.set(t, T_INT - 1.0, t < T_INT + 0.3 ? 1 : 0);
        const k = t - T_INT;
        vtx.set(cam, 0.9, k > 0 ? clamp(k / 0.05) * (0.3 + 1.3 * Math.exp(-k / 0.4)) : 0);
        mu.set(t, T_INT, k > 0 ? 1 : 0);
        const head = V.clone().addScaledVector(DIR, Math.max(0, k) * VP);
        muHead.position.copy(head); muHead.set(cam, 0.5, k > 0 ? 1.2 : 0);
        const wavA = smooth(c.slow - 0.3, c.slow + 0.4, t);
        wav.forEach(w => { const age = t - w.te; w.f.mesh.position.copy(V.clone().addScaledVector(DIR, (w.te - T_INT) * VP)); w.f.set(age > 0 ? age * VL : 0, age > 0 ? 0.75 * wavA * (1 - 0.6 * smooth(c.cherenkov - 0.5, c.cherenkov + 0.5, t)) : 0); });
        cone.position.copy(head); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), DIR);
        const cl = Math.max(0.01, Math.min(k * VP, 6.0) * 0.9); cone.scale.set(cl, cl, cl);
        coneMat.uniforms.uA.value = k > 0 ? 0.25 * smooth(c.faster - 0.2, c.faster + 0.6, t) + 0.75 * smooth(c.cherenkov - 0.4, c.cherenkov + 0.2, t) : 0;
        const labels = [
          { text: 'Trong băng: ánh sáng chậm lại', x: 540, y: 270, size: 40, color: '#d8e4e8', a: bump(c.slow - 0.1, c.slow + 0.3, c.faster - 0.4, c.faster, t) },
          { text: 'Hạt mang điện đi nhanh hơn ánh sáng', x: 540, y: 270, size: 38, color: '#edf0e9', a: bump(c.faster - 0.1, c.faster + 0.3, c.cherenkov - 0.4, c.cherenkov, t) },
          { text: 'Ánh sáng Cherenkov', x: 540, y: 270, size: 48, color: '#b8d8ff', a: smooth(c.cherenkov - 0.1, c.cherenkov + 0.3, t) },
        ];
        return { scene: W.scene, camera: cam, labels };
      },
    };
  });

  /* ================= s17: timing and charge → energy and direction ================= */
  F3.define('timing', ({ D, cues }) => {
    const c = cues;
    const W = iceWorld({ domSize: 0.06, fogD: 26 }), cam = F3.camera(40, 150);
    const P0 = new THREE.Vector3(4.2, -23.0, -2.4), DIR = new THREE.Vector3(-0.62, 0.55, 0.42).normalize();
    W.setHits((x) => {
      const h = trackHits(P0, DIR, 0, 3.4, 2.3, 16)(x); if (!h) return null;
      h.tc = clamp((h.t - 0.3) / 3.6); h.t = c.time - 0.1 + h.t * 0.62; return h;
    });
    W.mat.uniforms.uGrow.value = 1.7;
    const fit = F3.polyline([P0.clone().addScaledVector(DIR, -2), P0.clone().addScaledVector(DIR, 17)], { width: 3.0, color: AMBER, depthTest: false }); W.scene.add(fit);
    const tip = F3.streaks([{ o: P0.clone().addScaledVector(DIR, -2).toArray(), d: DIR.toArray(), speed: 19 / 0.9, len: 5, max: 19 }], { width: 6, head: 1.5 }); tip.material.depthTest = false; W.scene.add(tip);
    const mid = P0.clone().addScaledVector(DIR, 7);
    const rig = F3.rig([{ t: 0, p: [mid.x + 13, mid.y + 3.2, mid.z + 12], q: [mid.x, mid.y, mid.z] }, { t: D, p: [mid.x + 6, mid.y + 4.4, mid.z + 16.5], q: [mid.x, mid.y + 0.4, mid.z], hold: true }]);
    return {
      update(t) {
        rig(t, cam); W.frame(cam, t);
        W.cables.set(0.3, 1); W.snow.material.uniforms.uA.value = 0.2; W.mat.uniforms.uBase.value = 0.5;
        fit.set(0.9 * smooth(c.direction, c.direction + 0.6, t), smooth(c.direction, c.direction + 0.8, t));
        tip.set(t, c.direction, smooth(c.direction, c.direction + 0.1, t));
        const labels = [
          { text: 'Sớm', x: 330, y: 300, size: 40, color: '#ffc77a', a: smooth(c.time + 0.2, c.time + 0.6, t) * (1 - smooth(c.direction - 0.2, c.direction + 0.1, t)) },
          { text: '→', x: 540, y: 300, size: 40, color: '#edf0e9', a: smooth(c.time + 0.2, c.time + 0.6, t) * (1 - smooth(c.direction - 0.2, c.direction + 0.1, t)) },
          { text: 'Muộn', x: 750, y: 300, size: 40, color: '#9ed6ff', a: smooth(c.time + 0.2, c.time + 0.6, t) * (1 - smooth(c.direction - 0.2, c.direction + 0.1, t)) },
          { text: 'Hướng đi tái dựng', x: 540, y: 300, size: 44, color: '#efb768', a: smooth(c.direction + 0.3, c.direction + 0.6, t) },
        ];
        return { scene: W.scene, camera: cam, labels };
      },
    };
  });

  /* ================= s18: 2013 — evidence from the data ================= */
  F3.define('evidence', ({ D, cues }) => {
    const c = cues;
    const T1 = c.n28 - 0.9;
    // world 1: one high-energy cascade, the kind of event the 2013 analysis selected
    const W = iceWorld({ domSize: 0.06, fogD: 30 }), cam = F3.camera(40, 150);
    const C0 = new THREE.Vector3(0.6, -19.0, -0.4);
    W.setHits((x) => { const h = cascadeHits(C0, 0.7, 2.2, 4.2)(x); if (!h) return null; h.tc = clamp((h.t - 0.7) / 1.9); return h; });
    W.mat.uniforms.uGrow.value = 2.0;
    const rig = F3.rig([{ t: 0, p: [15, -14, 19], q: [0.4, -19.2, 0] }, { t: T1, p: [10, -16, 13], q: [0.5, -19.0, -0.2] }]);
    // world 2: 28 events, and how many the atmosphere alone would give
    const s2 = new THREE.Scene(), cam2 = F3.camera(38, 150);
    const bg2 = F3.backdrop(s2, { seed: 182, band: 0.4 });
    const r = rng(1828), events = [];
    for (let i = 0; i < 28; i++) {
      const col = i % 7, row = Math.floor(i / 7);
      const g = F3.glow(AMBER, 2.4); g.userData = { p: new THREE.Vector3(-2.4 + col * 0.8, 2.6 - row * 0.8, 0), sky: randomDir(r).multiplyScalar(9), t0: T1 + 0.25 + i * 0.045 };
      s2.add(g); events.push(g);
    }
    const bgDots = [];
    for (let i = 0; i < 11; i++) { const col = i % 7, row = Math.floor(i / 7); const g = F3.glow([0.62, 0.78, 0.86], 2.6); g.userData = { p: new THREE.Vector3(-2.4 + col * 0.8, -1.9 - row * 0.8, 0) }; s2.add(g); bgDots.push(g); }
    const ring = F3.polyline(F3.circlePoints(0.42, 40, 'xy'), { width: 1.4, color: [0.62, 0.78, 0.86] });
    const rig2 = F3.rig([{ t: T1, p: [0.4, 0.6, 17], q: [0, 0.4, 0] }, { t: D, p: [0.2, 0.2, 15.0], q: [0, 0.1, 0], hold: true }]);
    return {
      update(t) {
        if (t < T1) {
          rig(t, cam); W.frame(cam, t);
          W.cables.set(0.35, 1); W.snow.material.uniforms.uA.value = 0.2; W.mat.uniforms.uBase.value = 0.55;
          const labels = [
            { text: '2013', x: 540, y: 300, size: 120, color: '#edf0e9', a: smooth(c.y2013 - 0.1, c.y2013 + 0.25, t) },
          ];
          return { scene: W.scene, camera: cam, labels, wash: 0.4 * smooth(T1 - 0.3, T1, t) };
        }
        rig2(t, cam2); bg2.follow(cam2, t);
        const gather = smooth(c.together - 0.3, c.together + 0.9, t);
        events.forEach((g, i) => {
          const k = t - g.userData.t0;
          const p = g.userData.sky.clone().lerp(g.userData.p, gather);
          g.position.copy(p); g.set(cam2, 0.75, k > 0 ? clamp(k / 0.08) * (1.0 + 0.6 * Math.exp(-k / 0.3)) : 0);
        });
        const bA = smooth(c.atmos - 0.2, c.atmos + 0.4, t);
        bgDots.forEach((g, i) => { g.position.copy(g.userData.p); g.set(cam2, 0.75, bA * (i === 10 ? 0.6 : 0.9)); });
        const labels = [
          { text: '28 sự kiện', p: new THREE.Vector3(0, 2.6, 0), dy: -78, size: 64, color: '#efb768', a: smooth(c.n28 - 0.1, c.n28 + 0.3, t) },
          { text: 'Nền khí quyển dự kiến: ≈ 10,6', p: new THREE.Vector3(0, -1.9, 0), dy: -64, size: 38, color: '#b8d4df', a: bA },
        ];
        return { scene: s2, camera: cam2, labels, wash: 0.4 * (1 - smooth(T1, T1 + 0.3, t)) };
      },
    };
  });

  F3.iceWorld = iceWorld; F3.trackHits = trackHits; F3.cascadeHits = cascadeHits;
})();
