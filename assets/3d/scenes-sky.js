/* Looking for sources: the sky from IceCube (s19), the 2017 alert and the blazar (s20), the 2018 link (s21). */
(function () {
  'use strict';
  const { clamp, ramp, smooth, bump, lerp, v3, rng, randomDir } = F3;
  const ICE = [0.72, 0.83, 0.87], AMBER = F3.C.amber;

  function skyGrid(R) {
    const g = new THREE.Group(), lines = [];
    for (let dec = -60; dec <= 60; dec += 30) {
      const pts = []; for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 2, d = dec * Math.PI / 180; pts.push(new THREE.Vector3(Math.cos(d) * Math.cos(a) * R, Math.sin(d) * R, Math.cos(d) * Math.sin(a) * R)); }
      lines.push(F3.polyline(pts, { width: 1.0, color: [0.45, 0.58, 0.66] }));
    }
    for (let ra = 0; ra < 360; ra += 30) {
      const pts = []; for (let i = 0; i <= 80; i++) { const d = (-90 + i / 80 * 180) * Math.PI / 180, a = ra * Math.PI / 180; pts.push(new THREE.Vector3(Math.cos(d) * Math.cos(a) * R, Math.sin(d) * R, Math.cos(d) * Math.sin(a) * R)); }
      lines.push(F3.polyline(pts, { width: 1.0, color: [0.45, 0.58, 0.66] }));
    }
    lines.forEach(l => g.add(l));
    g.set = (a) => lines.forEach(l => l.set(a, 1));
    return g;
  }

  // a black hole with its accretion disk and two jets
  function blazarModel() {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    g.add(hole);
    const diskMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: 1 } }, ...F3.additive, side: THREE.DoubleSide, depthWrite: false,
      vertexShader: 'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: F3.NOISE + `uniform float uTime;uniform float uA;varying vec2 vP;
        void main(){float r=length(vP);float a=atan(vP.y,vP.x);
        float swirl=fbm3(vec3(cos(a)*2.0+r*1.6,sin(a)*2.0+r*1.6,r*3.0-uTime*0.9));
        float band=smoothstep(0.62,0.85,r)*(1.0-smoothstep(1.6,2.9,r));
        float temp=1.0-smoothstep(0.7,2.6,r);
        vec3 c=mix(vec3(0.85,0.40,0.16),vec3(1.0,0.92,0.80),temp);
        float k=band*(0.55+0.55*swirl)*(0.5+0.8*temp);
        gl_FragColor=vec4(c*k*uA*1.2,1.0);}`,
    });
    const disk = new THREE.Mesh(new THREE.RingGeometry(0.6, 3.0, 128, 8), diskMat); disk.rotation.x = -Math.PI / 2; g.add(disk);
    const photonRing = F3.polyline(F3.circlePoints(0.56, 96), { width: 2.0, color: [1.0, 0.92, 0.80] }); g.add(photonRing);
    const jetMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: 0 } }, ...F3.additive, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vO;varying vec3 vN;varying vec3 vV;void main(){vO=position;vec4 wp=modelMatrix*vec4(position,1.0);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}',
      fragmentShader: F3.NOISE + `uniform float uTime;uniform float uA;varying vec3 vO;varying vec3 vN;varying vec3 vV;
        void main(){float h=clamp(abs(vO.y)/7.0,0.0,1.0);float n=fbm3(vec3(vO.x*3.0,abs(vO.y)*1.2-uTime*3.0,vO.z*3.0))*0.5+0.5;
        float f=abs(dot(normalize(vN),normalize(vV)));
        gl_FragColor=vec4(vec3(0.70,0.86,1.0)*(0.25+0.75*n)*(1.0-h)*(0.3+0.7*f)*uA,1.0);}`,
    });
    const jetGeo = new THREE.CylinderGeometry(0.55, 0.08, 7, 32, 16, true); jetGeo.translate(0, 3.5, 0);
    const jetUp = new THREE.Mesh(jetGeo, jetMat), jetDown = new THREE.Mesh(jetGeo, jetMat); jetDown.rotation.x = Math.PI; g.add(jetUp, jetDown);
    const r = rng(2020), list = [];
    for (let i = 0; i < 120; i++) { const s = i % 2 ? 1 : -1; const o = new THREE.Vector3((r() - 0.5) * 0.2, s * 0.6, (r() - 0.5) * 0.2); list.push({ o: o.toArray(), d: [(r() - 0.5) * 0.12, s, (r() - 0.5) * 0.12], delay: -r() * 10, speed: 5 + r() * 2, len: 0.9, max: 8 }); }
    const plasma = F3.streaks(list, { width: 2.2, color: [0.80, 0.92, 1.0], loop: 8 }); g.add(plasma);
    const core = F3.glow([1.0, 0.95, 0.88], 2.0); g.add(core);
    g.set = (cam, t, o) => {
      diskMat.uniforms.uTime.value = t; diskMat.uniforms.uA.value = o.disk ?? 1;
      jetMat.uniforms.uTime.value = t; jetMat.uniforms.uA.value = o.jet ?? 0;
      plasma.set(t, 0, o.jet ?? 0); photonRing.set(0.8 * (o.disk ?? 1), 1);
      core.set(cam, 2.6, 0.5 * (o.disk ?? 1));
    };
    return g;
  }

  /* ================= s19: where do they come from? ================= */
  F3.define('search', ({ D, cues }) => {
    const c = cues;
    const scene = new THREE.Scene(), cam = F3.camera(38, 150);
    const bg = F3.backdrop(scene, { seed: 191 });
    const earth = F3.earth({ sun: [0.6, 0.3, 0.7], night: 0.25, ambient: 0.35 }); scene.add(earth.group);
    const pole = F3.glow(AMBER, 2.4); pole.position.set(0, -1.02, 0); scene.add(pole);
    const R = 9;
    const grid = skyGrid(R); scene.add(grid);
    const r = rng(1919), evs = [];
    for (let i = 0; i < 36; i++) {
      const d = randomDir(r); const g = F3.glow(AMBER, 2.4); g.position.copy(d.clone().multiplyScalar(R)); scene.add(g);
      const line = F3.polyline([new THREE.Vector3(0, -1, 0), d.clone().multiplyScalar(R)], { width: 1.0, color: AMBER }); scene.add(line);
      evs.push({ g, line, t0: c.open + 0.1 + i * 0.05 });
    }
    const scan = F3.polyline(F3.circlePoints(1.6, 64, 'xy'), { width: 2.0, color: [0.92, 0.95, 0.94] }); scene.add(scan);
    const yaw = F3.earthYawFor(0, new THREE.Vector3(0, 0, 1));
    return {
      update(t) {
        const a = 0.35 + t * 0.07;
        cam.position.set(Math.sin(a) * 19, 4.5 - t * 0.2, Math.cos(a) * 19); cam.up.set(0, 1, 0); cam.lookAt(0, 0.6, 0); cam.updateMatrixWorld();
        bg.follow(cam, t);
        earth.set({ yaw: yaw + t * 0.05 });
        pole.set(cam, 0.35, 1.2);
        grid.set(0.32 * smooth(0, 0.8, t));
        evs.forEach(e => { const k = t - e.t0; e.g.set(cam, 0.85, k > 0 ? clamp(k / 0.1) : 0); e.line.set(k > 0 ? 0.35 * (1 - 0.6 * smooth(c.next, c.next + 0.6, t)) : 0, clamp(k / 0.35)); });
        // a search window sweeping the sky
        const sa = smooth(c.next - 0.1, c.next + 0.3, t), u = (t - c.next) * 0.55;
        const dir = new THREE.Vector3(Math.cos(1.2 + u) * 0.8, 0.35 + 0.2 * Math.sin(u * 2), Math.sin(1.2 + u) * 0.8).normalize();
        scan.position.copy(dir.clone().multiplyScalar(R)); scan.lookAt(0, 0, 0); scan.set(0.9 * sa, 1);
        const labels = [
        ];
        return { labels };
      },
      scene, camera: cam,
    };
  });

  /* ================= s20: the 2017 alert ================= */
  F3.define('alert', ({ D, cues }) => {
    const c = cues;
    const T1 = c.alert - 0.35, T2 = c.blazar - 0.6;
    // world 1: an up-going muon track crosses IceCube
    const W = F3.iceWorld({ domSize: 0.06, fogD: 30 }), cam1 = F3.camera(40, 150);
    const P0 = new THREE.Vector3(5.5, -24.5, 3.0), DIR = new THREE.Vector3(-0.55, 0.62, -0.32).normalize();
    W.setHits((x) => { const h = F3.trackHits(P0, DIR, 0, 6.0, 2.2, 20)(x); if (!h) return null; h.tc = clamp(h.t / 3.0); h.t = c.event - 0.35 + h.t * 0.5; return h; });
    W.mat.uniforms.uGrow.value = 1.7;
    const track = F3.streaks([{ o: P0.toArray(), d: DIR.toArray(), speed: 12, len: 20, max: 20 }], { width: 3.2, color: [0.9, 0.96, 1.0] }); track.material.depthTest = false; W.scene.add(track);
    const mid = P0.clone().addScaledVector(DIR, 8);
    const rig1 = F3.rig([{ t: 0, p: [mid.x + 16, mid.y + 3, mid.z + 15], q: [mid.x, mid.y, mid.z] }, { t: T1 + 0.3, p: [mid.x + 11, mid.y + 6, mid.z + 18], q: [mid.x, mid.y + 1, mid.z] }]);
    // world 2: the alert goes around the world; telescopes turn to one patch of sky
    const s2 = new THREE.Scene(), cam2 = F3.camera(38, 150);
    const bg2 = F3.backdrop(s2, { seed: 202 });
    const earth = F3.earth({ sun: [0.7, 0.4, 0.6], night: 0.3, ambient: 0.4, tilt: 0 }); s2.add(earth.group);
    const SP = F3.latLon(-89.99, 0, 1.0), LP = F3.latLon(28.76, -17.89, 1.0);
    const spG = F3.glow(AMBER, 2.4); spG.position.copy(SP); s2.add(spG);
    const lpG = F3.glow([0.86, 0.94, 1.0], 2.4); lpG.position.copy(LP); s2.add(lpG);
    const SAT = new THREE.Vector3(1.35, 0.55, 0.95); const satG = F3.glow([0.86, 0.94, 1.0], 2.4); satG.position.copy(SAT); s2.add(satG);
    const arc = (a, b, h) => { const pts = []; for (let i = 0; i <= 64; i++) { const k = i / 64; const p = a.clone().lerp(b, k); p.normalize().multiplyScalar(1.0 + h * Math.sin(k * Math.PI)); pts.push(p); } return pts; };
    const alertArc1 = F3.polyline(arc(SP, LP, 0.45), { width: 2.0, color: AMBER }); s2.add(alertArc1);
    const alertArc2 = F3.polyline([SP, SAT], { width: 2.0, color: AMBER }); s2.add(alertArc2);
    const TARGET = new THREE.Vector3(-2.4, 6.2, -9.0); // reconstructed direction (scaled into view)
    const recon = F3.streaks([{ o: SP.toArray(), d: TARGET.clone().sub(SP).normalize().toArray(), speed: 18, len: 6, max: TARGET.distanceTo(SP) }], { width: 4, head: 1.3 }); recon.material.depthTest = false; s2.add(recon);
    const errRing = F3.polyline(F3.circlePoints(0.65, 64, 'xy').map(v => v.add(TARGET)), { width: 1.8, color: AMBER }); s2.add(errRing);
    const sight1 = F3.polyline([LP, TARGET], { width: 1.3, color: [0.86, 0.94, 1.0], dash: 40 }); s2.add(sight1);
    const sight2 = F3.polyline([SAT, TARGET], { width: 1.3, color: [0.86, 0.94, 1.0], dash: 40 }); s2.add(sight2);
    const tgtGlow = F3.glow([0.95, 0.92, 0.86], 2.2); tgtGlow.position.copy(TARGET); s2.add(tgtGlow);
    const rig2 = F3.rig([{ t: T1, p: [3.4, -1.6, 3.8], q: [0, -0.15, 0] }, { t: c.direction + 0.6, p: [4.8, 0.4, 6.6], q: [-0.4, 1.6, -2.2] }, { t: T2 + 0.4, p: [3.2, 2.8, 4.8], q: [-1.6, 5.0, -7.4] }]);
    // world 3: the blazar
    const s3 = new THREE.Scene(), cam3 = F3.camera(38, 150);
    const bg3 = F3.backdrop(s3, { seed: 203, band: 0.3 });
    const host = F3.glow([0.92, 0.88, 0.80], 1.6); s3.add(host);
    const bz = blazarModel(); bz.rotation.set(0.35, 0, 0.42); s3.add(bz);
    const rig3 = F3.rig([{ t: T2, p: [0, 3, 60], q: [0, 0, 0] }, { t: c.hole, p: [2.2, 3.4, 10.5], q: [0, 0, 0] }, { t: D, p: [3.6, 4.4, 9.0], q: [0, 0.6, 0], hold: true }]);
    const yaw = F3.earthYawFor(-20, new THREE.Vector3(1, 0, 1));
    return {
      update(t) {
        if (t < T1) {
          rig1(t, cam1); W.frame(cam1, t);
          W.cables.set(0.3, 1); W.snow.material.uniforms.uA.value = 0.2; W.mat.uniforms.uBase.value = 0.5;
          track.set(t, c.event - 0.35, smooth(c.event - 0.35, c.event, t));
          const labels = [
            { text: '22.09.2017', x: 540, y: 290, size: 84, color: '#edf0e9', a: smooth(c.y2017 - 0.1, c.y2017 + 0.3, t) },
            { text: 'IceCube-170922A', x: 540, y: 375, size: 38, color: '#b8d4df', a: smooth(c.event, c.event + 0.4, t) },
          ];
          return { scene: W.scene, camera: cam1, labels, wash: 0.45 * smooth(T1 - 0.3, T1, t) };
        }
        if (t < T2) {
          rig2(t, cam2); bg2.follow(cam2, t);
          earth.set({ yaw: 0 });
          spG.set(cam2, 0.3, 1.3); lpG.set(cam2, 0.22, smooth(c.telescopes - 0.2, c.telescopes + 0.2, t) * 1.2); satG.set(cam2, 0.22, smooth(c.telescopes - 0.2, c.telescopes + 0.2, t) * 1.2);
          alertArc1.set(0.9 * (1 - smooth(c.telescopes + 1.0, c.telescopes + 1.6, t)), smooth(c.alert - 0.1, c.alert + 0.8, t));
          alertArc2.set(0.9 * (1 - smooth(c.telescopes + 1.0, c.telescopes + 1.6, t)), smooth(c.alert, c.alert + 0.7, t));
          recon.set(t, c.direction - 0.05, smooth(c.direction - 0.05, c.direction + 0.1, t));
          errRing.set(0.9 * smooth(c.direction + 0.3, c.direction + 0.7, t), 1);
          sight1.set(0.8 * smooth(c.telescopes, c.telescopes + 0.4, t), smooth(c.telescopes, c.telescopes + 0.9, t));
          sight2.set(0.8 * smooth(c.telescopes + 0.2, c.telescopes + 0.6, t), smooth(c.telescopes + 0.2, c.telescopes + 1.1, t));
          tgtGlow.set(cam2, 0.8, 0.8 * smooth(c.telescopes + 0.8, c.telescopes + 1.3, t));
          const labels = [
            { text: 'Cảnh báo', p: SP, dy: 70, size: 42, color: '#efb768', a: bump(c.alert - 0.1, c.alert + 0.3, c.direction - 0.3, c.direction, t) },
            { text: 'Hướng tái dựng', p: TARGET, dy: -80, size: 40, color: '#efb768', a: bump(c.direction + 0.3, c.direction + 0.7, c.telescopes - 0.3, c.telescopes, t) },
            { text: 'Kính thiên văn', p: LP, dy: 64, size: 38, color: '#d8e4e8', a: smooth(c.telescopes, c.telescopes + 0.4, t) },
          ];
          return { scene: s2, camera: cam2, labels, wash: 0.45 * Math.max(1 - smooth(T1, T1 + 0.3, t), smooth(T2 - 0.3, T2, t)) };
        }
        rig3(t, cam3); bg3.follow(cam3, t);
        host.set(cam3, 16, 0.16 * (1 - smooth(c.hole - 0.6, c.hole + 0.4, t)) + 0.04);
        bz.set(cam3, t, { disk: 1, jet: smooth(c.jets - 0.3, c.jets + 0.6, t) * 1.0 + 0.25 });
        const labels = [
          { text: 'TXS 0506+056', x: 540, y: 285, size: 52, color: '#edf0e9', a: smooth(c.blazar - 0.1, c.blazar + 0.3, t) * (1 - smooth(c.hole - 0.3, c.hole, t)) },
          { text: 'Blazar', x: 540, y: 355, size: 40, color: '#b8d4df', a: smooth(c.blazar + 0.2, c.blazar + 0.5, t) * (1 - smooth(c.hole - 0.3, c.hole, t)) },
          { text: 'Lỗ đen siêu khối lượng', x: 540, y: 285, size: 44, color: '#edf0e9', a: bump(c.hole - 0.1, c.hole + 0.3, c.jets - 0.3, c.jets, t) },
          { text: 'Luồng vật chất', x: 540, y: 285, size: 44, color: '#d8e9ff', a: smooth(c.jets - 0.1, c.jets + 0.3, t) },
        ];
        return { scene: s3, camera: cam3, labels, wash: 0.45 * (1 - smooth(T2, T2 + 0.3, t)) };
      },
    };
  });

  /* ================= s21: 2018 — a link to the blazar, traced from the ice ================= */
  F3.define('blazar', ({ D, cues }) => {
    const c = cues;
    const T1 = c.trace - 0.45, T2 = c.far - 0.55;
    // world 1: the jet pointing at us; a neutrino and a gamma-ray flare leave together
    const s1 = new THREE.Scene(), cam1 = F3.camera(38, 150);
    const bg1 = F3.backdrop(s1, { seed: 211, band: 0.3 });
    const bz = blazarModel(); bz.rotation.set(1.15, 0, 0.2); s1.add(bz);
    const AX = new THREE.Vector3(0, 1, 0).applyEuler(bz.rotation).normalize();
    const nu = F3.streaks([{ o: AX.clone().multiplyScalar(0.8).toArray(), d: AX.toArray(), speed: 6, len: 3, max: 40 }], { width: 5, head: 1.4 }); nu.material.depthTest = false; s1.add(nu);
    const flare = F3.glow([0.86, 0.94, 1.0], 2.2); s1.add(flare);
    const rig1 = F3.rig([{ t: 0, p: [3.6, 4.4, 9.0], q: [0, 0.6, 0] }, { t: T1 + 0.4, p: [1.0, 7.5, 4.2], q: [0, 1.2, 0] }]);
    // world 2: the trace in the ice
    const W = F3.iceWorld({ domSize: 0.06, fogD: 30 }), cam2 = F3.camera(40, 150);
    const P0 = new THREE.Vector3(5.5, -24.5, 3.0), DIR = new THREE.Vector3(-0.55, 0.62, -0.32).normalize();
    W.setHits((x) => { const h = F3.trackHits(P0, DIR, 0, 6.0, 2.2, 20)(x); if (!h) return null; h.tc = clamp(h.t / 3.0); h.t = -10; return h; });
    W.mat.uniforms.uGrow.value = 1.7;
    const back = F3.polyline([P0.clone().addScaledVector(DIR, -3), P0.clone().addScaledVector(DIR, 60)], { width: 2.4, color: AMBER, dash: 30, depthTest: false }); W.scene.add(back);
    const mid = P0.clone().addScaledVector(DIR, 8);
    const rig2 = F3.rig([{ t: T1, p: [mid.x + 12, mid.y + 5, mid.z + 17], q: [mid.x, mid.y + 1, mid.z] }, { t: T2 + 0.4, p: [mid.x + 8, mid.y + 14, mid.z + 26], q: [mid.x - 2, mid.y + 7, mid.z - 2] }]);
    // world 3: very far away
    const s3 = new THREE.Scene(), cam3 = F3.camera(38, 150);
    const bg3 = F3.backdrop(s3, { seed: 213, band: 0.6 });
    const earth = F3.earth({ sun: [0.7, 0.3, 0.6], night: 0.25, ambient: 0.3 }); s3.add(earth.group);
    const FAR = new THREE.Vector3(-8, 150, -90);
    const src = F3.glow([0.95, 0.92, 0.86], 2.2); src.position.copy(FAR); s3.add(src);
    const link = F3.polyline([new THREE.Vector3(0, -1, 0), FAR], { width: 2.0, color: AMBER, dash: 60 }); s3.add(link);
    const rig3 = F3.rig([{ t: T2, p: [2.2, -2.6, 3.4], q: [-0.3, 2.2, -1.6] }, { t: D, p: [2.8, -3.4, 4.6], q: [-0.6, 3.6, -2.6], hold: true }]);
    return {
      update(t) {
        if (t < T1) {
          rig1(t, cam1); bg1.follow(cam1, t);
          bz.set(cam1, t + 10, { disk: 1, jet: 1.0 });
          nu.set(t, c.combine, smooth(c.combine, c.combine + 0.2, t));
          const fk = t - (c.combine + 0.1);
          flare.position.copy(AX.clone().multiplyScalar(1.0 + Math.max(0, fk) * 6)); flare.set(cam1, 0.9, fk > 0 ? 0.8 : 0);
          const labels = [
            { text: 'Neutrino + quan sát khác', x: 540, y: 285, size: 42, color: '#edf0e9', a: bump(c.combine + 0.2, c.combine + 0.6, c.y2018 - 0.3, c.y2018, t) },
            { text: '2018', x: 540, y: 290, size: 110, color: '#edf0e9', a: smooth(c.y2018 - 0.1, c.y2018 + 0.3, t) },
            { text: 'Bằng chứng liên hệ', x: 540, y: 395, size: 40, color: '#efb768', a: smooth(c.link, c.link + 0.4, t) },
          ];
          return { scene: s1, camera: cam1, labels, wash: 0.45 * smooth(T1 - 0.3, T1, t) };
        }
        if (t < T2) {
          rig2(t, cam2); W.frame(cam2, t);
          W.cables.set(0.3, 1); W.snow.material.uniforms.uA.value = 0.3; W.mat.uniforms.uBase.value = 0.5;
          back.set(0.9 * smooth(T1 + 0.2, T1 + 0.8, t), smooth(T1 + 0.2, T2, t));
          return { scene: W.scene, camera: cam2, wash: 0.45 * Math.max(1 - smooth(T1, T1 + 0.3, t), smooth(T2 - 0.3, T2, t)) };
        }
        rig3(t, cam3); bg3.follow(cam3, t);
        earth.set({ yaw: F3.earthYawFor(0, new THREE.Vector3(0, 0, 1)) });
        src.set(cam3, 4.5, 1.1);
        link.set(0.85, smooth(T2, T2 + 1.0, t));
        const labels = [
          { text: '≈ 4 tỷ năm ánh sáng', x: 540, y: 290, size: 54, color: '#efb768', a: smooth(c.far - 0.1, c.far + 0.3, t) },
        ];
        return { scene: s3, camera: cam3, labels, wash: 0.45 * (1 - smooth(T2, T2 + 0.3, t)) };
      },
    };
  });
})();
