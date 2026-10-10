/* What neutrinos are and how they are caught: through a lattice of atoms (s04), through Earth and you (s05),
   out of the Sun's core and from distant sources (s06), the rare interaction (s07), a water detector (s08),
   scale and backgrounds (s10), natural targets: sea and Antarctic ice (s11). */
(function () {
  'use strict';
  const { clamp, ramp, smooth, bump, lerp, v3, rng, randomDir } = F3;
  const ICE = [0.72, 0.83, 0.87], AMBER = F3.C.amber;

  // plain deep-ink background for micro-scale shots
  function inkSky(top = [0.05, 0.085, 0.115], bottom = [0.022, 0.04, 0.058], warm = 0) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({
      uniforms: { uTop: { value: v3(top) }, uBot: { value: v3(bottom) }, uWarm: { value: warm } }, side: THREE.BackSide, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform vec3 uTop;uniform vec3 uBot;uniform float uWarm;varying vec3 vDir;
        void main(){vec3 d=normalize(vDir);vec3 c=mix(uBot,uTop,smoothstep(-0.6,0.8,d.y));
        float sunGlow=uWarm*exp(-pow(d.y/0.10,2.0))*smoothstep(0.2,-1.0,d.x);
        c+=vec3(0.55,0.30,0.14)*sunGlow*0.55+vec3(0.20,0.24,0.26)*uWarm*exp(-pow(d.y/0.25,2.0))*0.25;
        gl_FragColor=vec4(c,1.0);}`,
    }));
    m.renderOrder = -10; m.frustumCulled = false; m.follow = (cam) => m.position.copy(cam.position);
    return m;
  }
  // instanced translucent spheres (electron clouds, sensors) with fresnel rims that fade with distance
  function fresnelInstances(positions, radius, color, opts = {}) {
    const geo = new THREE.SphereGeometry(radius, opts.seg || 18, opts.seg2 || 12);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: v3(color) }, uA: { value: 1 }, uFar: { value: opts.far || 14 }, uFill: { value: opts.fill ?? 0.03 } }, ...F3.additive,
      vertexShader: `varying vec3 vN;varying vec3 vV;varying float vD;
        void main(){vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);vN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);
        vV=normalize(cameraPosition-wp.xyz);vD=length(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
      fragmentShader: `uniform vec3 uColor;uniform float uA;uniform float uFar;uniform float uFill;varying vec3 vN;varying vec3 vV;varying float vD;
        void main(){float f=1.0-abs(dot(normalize(vN),normalize(vV)));float a=(pow(f,2.2)*0.32+uFill)*exp(-vD/uFar)*uA;gl_FragColor=vec4(uColor*a,1.0);}`,
    });
    const im = new THREE.InstancedMesh(geo, mat, positions.length);
    const m4 = new THREE.Matrix4();
    positions.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m4); });
    im.frustumCulled = false;
    return im;
  }
  function pointCloud(positions, opts = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions.flatMap(p => [p.x, p.y, p.z]), 3));
    const seeds = positions.map((_, i) => (Math.sin(i * 12.9898) * 43758.5453) % 1);
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds.map(x => Math.abs(x)), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: v3(opts.color || [0.9, 0.94, 0.95]) }, uSize: { value: opts.size || 30 }, uA: { value: 1 }, uFar: { value: opts.far || 16 }, uTime: { value: 0 },
        uMax: { value: opts.max || 9 } },
      ...F3.additive,
      vertexShader: `attribute float aSeed;uniform float uSize;uniform float uFar;uniform float uTime;uniform float uMax;varying float vA;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;float d=-mv.z;
        gl_PointSize=clamp(uSize/max(d,0.1),1.0,uMax);vA=exp(-d/uFar)*(0.85+0.15*sin(uTime*3.0+aSeed*40.0));}`,
      fragmentShader: `uniform vec3 uColor;uniform float uA;varying float vA;void main(){float d=length(gl_PointCoord-0.5)*2.0;float a=smoothstep(1.0,0.0,d);gl_FragColor=vec4(uColor*a*a*vA*uA,1.0);}`,
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
    return pts;
  }
  function cutShell(radius, outer, inner, cut, heatable) {
    const mk = (side, col) => {
      const m = new THREE.ShaderMaterial({
        side, uniforms: { uC: { value: v3(col) }, uHeat: { value: 0 } }, vertexShader: F3.LIMB_VERT,
        fragmentShader: F3.NOISE + F3.CUT_GLSL + `uniform vec3 uC;uniform float uHeat;varying vec3 vN;varying vec3 vV;varying vec3 vO;varying vec3 vP;
          void main(){${F3.CUT_TEST}float k=0.5+0.5*abs(dot(normalize(vN),normalize(vV)));float n=0.9+0.1*snoise(normalize(vO)*9.0);
          gl_FragColor=vec4(mix(uC*k*n,vec3(1.0,0.97,0.9),uHeat),1.0);}`,
      });
      F3.shareCut(m, cut); return m;
    };
    const g = new THREE.Group();
    if (outer) g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 80, 56), mk(THREE.FrontSide, outer)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 80, 56), mk(THREE.BackSide, inner)));
    return g;
  }
  function setWedge(cut, cam, open, center = new THREE.Vector3()) {
    const ang = Math.atan2(cam.position.x - center.x, cam.position.z - center.z), half = 0.55 * open;
    cut.uCutOn.value = open > 0.01 ? 1 : 0; cut.uCutC.value.copy(center);
    cut.uCutA.value.set(-Math.cos(ang - half), 0, Math.sin(ang - half));
    cut.uCutB.value.set(Math.cos(ang + half), 0, -Math.sin(ang + half));
  }

  /* ================= s04: a neutrino through matter ================= */
  F3.define('identity', ({ D, cues }) => {
    const c = cues;
    const scene = new THREE.Scene(), cam = F3.camera(40, 150);
    const sky = inkSky(); scene.add(sky);
    const atoms = [], SP = 1.25;
    for (let x = -8; x < 64; x++) for (let y = -4; y <= 4; y++) for (let z = -7; z <= 1; z++) atoms.push(new THREE.Vector3(x * SP, y * SP + 0.3, z * SP - 0.2));
    const clouds = fresnelInstances(atoms, 0.15, ICE, { far: 9, fill: 0.01, seg: 14, seg2: 10 }); clouds.material.uniforms.uA.value = 0.8; scene.add(clouds);
    const nuclei = pointCloud(atoms, { color: [0.88, 0.93, 0.96], size: 20, far: 10, max: 6 }); scene.add(nuclei);
    const P0 = new THREE.Vector3(-4, 0.92, 0.42), DIR = new THREE.Vector3(1, -0.004, 0.0).normalize(), SPEED = 3.0;
    const nu = F3.streaks([{ o: P0.toArray(), d: DIR.toArray(), speed: SPEED, len: 5.5, max: 80 }], { width: 4.5, head: 1.3 }); scene.add(nu);
    const head = F3.glow(AMBER, 2.6); scene.add(head);
    const pos = (t) => P0.clone().addScaledVector(DIR, t * SPEED);
    return {
      update(t) {
        const p = pos(t);
        const lag = smooth(c.through - 0.3, D, t);
        // ride alongside the particle, then hold still and let it leave the frame
        const follow = pos(Math.min(t, c.through - 0.3) + 0.35 * Math.max(0, t - (c.through - 0.3)));
        cam.position.set(follow.x - 0.6 - 1.2 * lag, 1.55 + 0.9 * lag, 4.2 + 2.6 * lag);
        cam.up.set(0, 1, 0);
        cam.lookAt(follow.x + 0.55, 0.62, -0.6);
        cam.updateMatrixWorld(); sky.follow(cam);
        nuclei.material.uniforms.uTime.value = t;
        nu.set(t, 0, 1);
        head.position.copy(p); head.set(cam, 0.55, 1.5);
        const fixed = (text, y, size, color, a) => ({ text, x: 540, y, size, color, a });
        const labels = [
          fixed('Neutrino', 300, 56, '#efb768', smooth(c.name - 0.15, c.name + 0.25, t) * (1 - smooth(c.basic - 0.3, c.basic, t))),
          fixed('Hạt cơ bản', 270, 42, '#edf0e9', smooth(c.basic - 0.1, c.basic + 0.3, t) * (1 - smooth(c.rarely - 0.4, c.rarely, t))),
          fixed('Không mang điện', 330, 42, '#edf0e9', smooth(c.charge - 0.1, c.charge + 0.3, t) * (1 - smooth(c.rarely - 0.4, c.rarely, t))),
          fixed('Khối lượng rất nhỏ', 390, 42, '#edf0e9', smooth(c.mass - 0.1, c.mass + 0.3, t) * (1 - smooth(c.rarely - 0.4, c.rarely, t))),
        ];
        return { labels };
      },
      scene, camera: cam,
    };
  });

  /* ================= s05: from the Sun, through Earth, through you ================= */
  F3.define('body', ({ D, cues }) => {
    const c = cues;
    const T1 = c.body - 0.62;
    // world 1: Sun → Earth
    const s1 = new THREE.Scene(), cam1 = F3.camera(38, 150);
    const bg1 = F3.backdrop(s1, { seed: 51 });
    const SUN = new THREE.Vector3(-10, 3.5, -7), EARTH = new THREE.Vector3(3.2, -1.2, 0);
    const sun = F3.starBody({ type: 'sun' }); sun.group.position.copy(SUN); s1.add(sun.group);
    const toE = EARTH.clone().sub(SUN).normalize(), L = EARTH.distanceTo(SUN);
    const earth = F3.earth({ sun: SUN.clone().sub(EARTH).normalize().toArray(), night: 0.12 }); earth.group.position.copy(EARTH); s1.add(earth.group);
    const r = rng(505), flux = [];
    const side = new THREE.Vector3().crossVectors(toE, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(side, toE).normalize();
    for (let i = 0; i < 260; i++) {
      const d = toE.clone().addScaledVector(side, (r() - 0.5) * 0.30).addScaledVector(up, (r() - 0.5) * 0.30).normalize();
      const o = SUN.clone().addScaledVector(d, 2.0);
      flux.push({ o: o.toArray(), d: d.toArray(), delay: -r() * 30, speed: 7 + r() * 1.5, len: 1.6 + r(), max: L + 10 });
    }
    const nu1 = F3.streaks(flux, { width: 2.4, loop: L + 10 }); s1.add(nu1);
    const rig1 = F3.rig([
      { t: 0, p: [-4.6, 4.6, 3.6], q: [-9.0, 3.2, -6.5] },
      { t: c.sun + 0.2, p: [-2.4, 3.4, 5.8], q: [-4.5, 1.6, -3.5] },
      { t: T1, p: [3.6, 0.1, 4.2], q: [3.0, -1.1, 0] },
    ]);
    // world 2: a person at dusk, the flux passing straight through
    const s2 = new THREE.Scene(), cam2 = F3.camera(38, 150);
    const sky2 = inkSky([0.05, 0.08, 0.11], [0.06, 0.07, 0.08], 1.0); s2.add(sky2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vP;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}',
      fragmentShader: F3.NOISE + `varying vec3 vP;void main(){float d=length(vP.xz);float n=fbm3(vec3(vP.xz*0.35,1.0))*0.5+0.5;
        vec3 c=mix(vec3(0.035,0.050,0.062),vec3(0.055,0.07,0.082),n);c=mix(c,vec3(0.09,0.10,0.11),smoothstep(10.0,55.0,d));
        float grid=0.0;gl_FragColor=vec4(c+grid,1.0);}`,
    }));
    s2.add(ground);
    // a glass human: smooth-blended anatomy ray-marched in a box, with fine horizontal scan lines
    const HUMAN_SDF = `
      float sdEll(vec3 p,vec3 r){float k0=length(p/r);float k1=length(p/(r*r));return k0*(k0-1.0)/max(k1,1e-5);}
      float sdCap(vec3 p,vec3 a,vec3 b,float ra,float rb){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);return length(pa-ba*h)-mix(ra,rb,h);}
      float smin(float a,float b,float k){float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}
      float body(vec3 p){
        vec3 q=vec3(abs(p.x),p.y,p.z);
        float d=sdEll(p-vec3(0.0,1.638,0.0),vec3(0.080,0.106,0.097));
        d=smin(d,sdEll(p-vec3(0.0,1.578,0.030),vec3(0.060,0.060,0.066)),0.032);
        d=smin(d,sdEll(q-vec3(0.081,1.628,-0.004),vec3(0.012,0.028,0.019)),0.01);
        d=smin(d,sdCap(p,vec3(0.0,1.462,-0.008),vec3(0.0,1.565,0.0),0.051,0.046),0.034);
        d=smin(d,sdEll(p-vec3(0.0,1.312,0.004),vec3(0.160,0.158,0.098)),0.05);
        d=smin(d,sdCap(q,vec3(0.055,1.408,-0.012),vec3(0.188,1.392,-0.012),0.058,0.054),0.055);
        d=smin(d,sdEll(p-vec3(0.0,1.112,0.010),vec3(0.128,0.150,0.086)),0.065);
        d=smin(d,sdEll(p-vec3(0.0,0.958,-0.006),vec3(0.152,0.104,0.102)),0.05);
        float arm=sdCap(q,vec3(0.203,1.382,-0.014),vec3(0.240,1.118,-0.034),0.045,0.035);
        arm=smin(arm,sdCap(q,vec3(0.240,1.118,-0.034),vec3(0.258,0.872,0.006),0.034,0.025),0.022);
        arm=smin(arm,sdEll(q-vec3(0.262,0.800,0.014),vec3(0.024,0.066,0.040)),0.02);
        d=smin(d,arm,0.034);
        float leg=sdCap(q,vec3(0.086,0.930,0.0),vec3(0.093,0.505,0.014),0.082,0.051);
        leg=smin(leg,sdEll(q-vec3(0.094,0.505,0.018),vec3(0.050,0.055,0.050)),0.03);
        leg=smin(leg,sdCap(q,vec3(0.093,0.505,0.014),vec3(0.098,0.088,-0.012),0.049,0.031),0.03);
        leg=smin(leg,sdEll(q-vec3(0.095,0.365,-0.026),vec3(0.046,0.088,0.047)),0.03);
        leg=smin(leg,sdEll(q-vec3(0.100,0.034,0.046),vec3(0.040,0.031,0.104)),0.022);
        d=smin(d,leg,0.04);
        return d;
      }`;
    const humanMat = new THREE.ShaderMaterial({
      uniforms: { uInv: { value: new THREE.Matrix4() }, uRot: { value: new THREE.Matrix3() }, uA: { value: 1 }, uSun: { value: new THREE.Vector3(-1, 0.12, -0.15).normalize() } },
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vObj;void main(){vObj=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: HUMAN_SDF + `uniform mat4 uInv;uniform mat3 uRot;uniform float uA;uniform vec3 uSun;varying vec3 vObj;
        void main(){
          vec3 ro=(uInv*vec4(cameraPosition,1.0)).xyz;vec3 rd=normalize(vObj-ro);
          vec3 p=vObj;bool hit=false;
          for(int i=0;i<80;i++){float d=body(p);if(d<0.0007){hit=true;break;}p+=rd*max(d,0.0012);
            if(abs(p.x)>0.40||p.y<-0.03||p.y>1.80||abs(p.z)>0.30)break;}
          if(!hit)discard;
          const vec2 e=vec2(0.0015,-0.0015);
          vec3 n=normalize(e.xyy*body(p+e.xyy)+e.yyx*body(p+e.yyx)+e.yxy*body(p+e.yxy)+e.xxx*body(p+e.xxx));
          vec3 nw=normalize(uRot*n);
          float fres=pow(1.0-abs(dot(n,-rd)),2.3);
          float f=abs(fract(p.y*23.0)-0.5);float scan=smoothstep(0.462,0.492,f);
          float warm=pow(max(dot(nw,uSun),0.0),2.0);
          vec3 col=vec3(0.11,0.17,0.21)+vec3(0.80,0.92,0.98)*fres*1.05+vec3(0.62,0.80,0.90)*scan*(0.25+0.5*fres)+vec3(1.0,0.66,0.38)*warm*(0.25+0.6*fres);
          float a=(0.27+0.70*fres+0.32*scan+0.25*warm)*uA;
          gl_FragColor=vec4(col,clamp(a,0.0,0.95));}`,
    });
    const human = new THREE.Mesh(new THREE.BoxGeometry(0.80, 1.84, 0.60).translate(0, 0.89, 0), humanMat);
    human.rotation.y = 0.5; s2.add(human);
    human.refresh = () => {
      human.updateMatrixWorld();
      humanMat.uniforms.uInv.value.copy(human.matrixWorld).invert();
      humanMat.uniforms.uRot.value.setFromMatrix4(human.matrixWorld);
    };
    const r2 = rng(517), flux2 = [];
    for (let i = 0; i < 150; i++) {
      const o = new THREE.Vector3(-9, 0.15 + r2() * 2.4 + 0.9, -1.4 + r2() * 2.8);
      const d = new THREE.Vector3(1, -0.10 - r2() * 0.03, (r2() - 0.5) * 0.02).normalize();
      flux2.push({ o: o.toArray(), d: d.toArray(), delay: -r2() * 30, speed: 6.5 + r2() * 1.2, len: 1.4 + r2() * 0.8, max: 22 });
    }
    const nu2 = F3.streaks(flux2, { width: 3.0, loop: 22 }); nu2.material.depthTest = false; s2.add(nu2);
    const sunset = F3.glow([1.0, 0.70, 0.42], 2.5); sunset.position.set(-60, 2.5, -8); s2.add(sunset);
    const rig2 = F3.rig([
      { t: T1, p: [1.3, 1.3, 3.9], q: [0, 1.0, 0] },
      { t: c.journey - 0.3, p: [2.4, 1.25, 3.6], q: [0.2, 1.05, 0] },
      { t: D, p: [5.6, 1.6, 4.6], q: [2.6, 0.8, 0], hold: true },
    ]);
    return {
      update(t) {
        if (t < T1) {
          rig1(t, cam1); bg1.follow(cam1, t);
          sun.set(cam1, { radius: 2.0, time: t, glow: 0.55, glowScale: 3.6, halo: 0.6 });
          earth.set({ yaw: F3.earthYawFor(106, new THREE.Vector3(0.3, 0, 1)) + t * 0.03 });
          nu1.set(t, 0, 1);
          return { scene: s1, camera: cam1, wash: 0.5 * smooth(T1 - 0.35, T1, t) };
        }
        rig2(t, cam2); sky2.follow(cam2);
        sunset.set(cam2, 14, 0.9);
        const ghost = smooth(c.ghost - 0.8, c.ghost + 0.2, t);
        nu2.set(t, 0, 1 - 0.35 * ghost);
        humanMat.uniforms.uA.value = 1 - 0.35 * ghost; human.refresh();
        const labels = [
          { text: '“Hạt ma”', x: 540, y: 300, size: 64, color: '#efb768', a: smooth(c.ghost - 0.1, c.ghost + 0.35, t) },
        ];
        return { scene: s2, camera: cam2, labels, wash: 0.5 * (1 - smooth(T1, T1 + 0.35, t)) };
      },
    };
  });

  /* ================= s06: a window into the inside ================= */
  F3.define('meaning', ({ D, cues }) => {
    const c = cues;
    const T1 = c.cosmic - 0.45;
    // world 1: inside the Sun
    const s1 = new THREE.Scene(), cam1 = F3.camera(38, 150);
    const bg1 = F3.backdrop(s1, { seed: 61 });
    const sun = F3.starBody({ type: 'sun' }); s1.add(sun.group);
    const cut = sun.cut, R = 1.5;
    const zone = cutShell(0.70, [0.98, 0.78, 0.42], [0.82, 0.52, 0.22], cut); zone.scale.setScalar(R); s1.add(zone);
    const coreShell = cutShell(0.25, [1.0, 0.95, 0.80], [0.98, 0.82, 0.55], cut); coreShell.scale.setScalar(R); s1.add(coreShell);
    const envIn = cutShell(0.995, null, [0.70, 0.36, 0.12], cut); envIn.scale.setScalar(R); s1.add(envIn);
    const coreGlow = F3.glow([1.0, 0.95, 0.82], 2.6); s1.add(coreGlow);
    // a photon random-walks near the core while neutrinos leave in a straight line
    const rw = rng(606), walk = [new THREE.Vector3(0.02, 0.05, 0.05)];
    for (let i = 0; i < 900; i++) {
      const p = walk[walk.length - 1].clone().addScaledVector(randomDir(rw), 0.045 * R);
      if (p.length() > 0.62 * R) p.multiplyScalar(0.62 * R / p.length());
      walk.push(p);
    }
    const photon = F3.polyline(walk, { width: 1.3, color: [0.86, 0.93, 0.97], depthTest: false }); photon.renderOrder = 9; s1.add(photon);
    const photonHead = F3.glow([0.9, 0.96, 1.0], 2.6); s1.add(photonHead);
    const r = rng(611), list = [];
    for (let i = 0; i < 90; i++) { const d = randomDir(r); list.push({ o: d.clone().multiplyScalar(0.06).toArray(), d: d.toArray(), delay: -r() * 30, speed: 2.4 + r() * 0.8, len: 0.7, max: 8 }); }
    const nu = F3.streaks(list, { width: 2.8, loop: 8 }); nu.material.depthTest = false; nu.renderOrder = 10; s1.add(nu);
    const rig1 = F3.rig([
      { t: 0, p: [4.6, 1.4, 6.6], q: [0, 0.15, 0] },
      { t: c.sun, p: [3.4, 1.0, 4.6], q: [0, 0.05, 0] },
      { t: c.core + 0.2, p: [1.9, 0.6, 2.4], q: [0, 0, 0] },
      { t: T1 + 0.4, p: [1.6, 0.5, 2.0], q: [0, 0, 0] },
    ]);
    // world 2: deep space, a high-energy neutrino pointing back to where it came from
    const s2 = new THREE.Scene(), cam2 = F3.camera(38, 150);
    const bg2 = F3.backdrop(s2, { seed: 62, band: 0.5 });
    const rg = rng(633), galaxies = [];
    const SRC = new THREE.Vector3(-6, 9, -60);
    const spots = [SRC, new THREE.Vector3(14, 3, -80), new THREE.Vector3(-18, -6, -70), new THREE.Vector3(8, 16, -95), new THREE.Vector3(-3, -14, -55), new THREE.Vector3(20, -12, -90), new THREE.Vector3(-22, 14, -100)];
    spots.forEach((p, i) => {
      const g = F3.glow(i === 0 ? [0.96, 0.92, 0.84] : [0.80, 0.86, 0.92], 2.2); g.position.copy(p); g.userData = { ang: rg() * Math.PI, ecc: 0.32 + rg() * 0.4, size: 3.4 + rg() * 3 };
      s2.add(g); galaxies.push(g);
    });
    const jet = F3.polyline([SRC.clone().add(new THREE.Vector3(0, -4, 1.2)), SRC.clone().add(new THREE.Vector3(0, 4, -1.2))], { width: 1.6, color: [0.86, 0.93, 0.97] }); s2.add(jet);
    const HERE = new THREE.Vector3(0, -3.4, 4);
    const back = SRC.clone().sub(HERE).normalize(), Lb = SRC.distanceTo(HERE);
    const arrow = F3.streaks([{ o: SRC.toArray(), d: back.clone().negate().toArray(), speed: Lb / 1.6, len: 9, max: Lb }], { width: 4.5, head: 1.3 }); s2.add(arrow);
    const trace = F3.polyline([HERE, SRC], { width: 1.6, color: AMBER, dash: 34 }); s2.add(trace);
    const rings = spots.map((p, i) => { const m = F3.polyline(F3.circlePoints(i === 0 ? 4.2 : 3.4, 64, 'xy').map(v => v.add(p)), { width: 1.4, color: i === 0 ? AMBER : ICE }); s2.add(m); return m; });
    const rig2 = F3.rig([
      { t: T1, p: [1.5, -1.0, 13], q: [-1.0, 2.0, -40] },
      { t: c.direction, p: [2.4, -2.2, 10], q: [-2.2, 3.4, -40] },
      { t: D, p: [3.2, -3.0, 9.0], q: [-2.0, 2.6, -40], hold: true },
    ]);
    return {
      update(t) {
        if (t < T1) {
          rig1(t, cam1); bg1.follow(cam1, t);
          setWedge(cut, cam1, smooth(0.6, 2.4, t));
          sun.set(cam1, { radius: R, time: t, glow: 0.35, glowScale: 3.6, halo: 0.55 });
          coreGlow.set(cam1, 1.0, 0.6 + 0.6 * smooth(c.core - 0.6, c.core + 0.2, t));
          const tw = Math.max(0, t - 0.9);
          photon.set(0.95 * (1 - smooth(c.sun - 0.4, c.sun, t)), clamp(tw / 26));
          const k = Math.min(walk.length - 1, Math.floor(clamp(tw / 26) * (walk.length - 1)));
          photonHead.position.copy(walk[k]); photonHead.set(cam1, 0.18, 1.0 * (1 - smooth(c.sun - 0.4, c.sun, t)) * smooth(0.9, 1.2, t));
          nu.set(t, 0, smooth(0.8, 1.4, t));
          const labels = [
            { text: 'Neutrino: khoảng 2 giây để thoát ra', x: 540, y: 232, size: 38, color: '#efb768', a: smooth(c.info, c.info + 0.35, t) * (1 - smooth(c.sun - 0.5, c.sun - 0.1, t)) },
            { text: 'Ánh sáng: hàng chục nghìn năm', x: 540, y: 290, size: 38, color: '#d8e4e8', a: smooth(c.info + 0.6, c.info + 0.95, t) * (1 - smooth(c.sun - 0.5, c.sun - 0.1, t)) },
            { text: 'Phản ứng ở lõi Mặt Trời', x: 540, y: 260, size: 42, color: '#f1dcae', a: smooth(c.core - 0.2, c.core + 0.2, t) * (1 - smooth(T1 - 0.35, T1, t)) },
          ];
          return { scene: s1, camera: cam1, labels, wash: 0.5 * smooth(T1 - 0.35, T1, t) };
        }
        rig2(t, cam2); bg2.follow(cam2, t);
        galaxies.forEach((g, i) => {
          g.set(cam2, g.userData.size, i === 0 ? 1.0 : 0.65);
          g.scale.set(g.userData.size, g.userData.size * g.userData.ecc, 1); g.rotateZ(g.userData.ang);
        });
        jet.set(0.55, 1);
        const ta = t - (c.cosmic + 0.3);
        arrow.set(t, c.cosmic + 0.3, ta > 0 ? 1 : 0);
        trace.set(0.85 * smooth(c.direction - 0.1, c.direction + 0.5, t), smooth(c.direction - 0.1, c.direction + 0.9, t));
        rings.forEach((m, i) => m.set(i === 0 ? 0.9 * smooth(c.direction + 0.6, c.direction + 1.0, t) : 0.5 * smooth(c.sources + 0.1 * i, c.sources + 0.3 + 0.1 * i, t), 1));
        const labels = [
          { text: 'Hướng đến', p: HERE.clone().lerp(SRC, 0.35), dx: 120, size: 38, color: '#efb768', a: smooth(c.direction + 0.2, c.direction + 0.6, t) },
        ];
        return { scene: s2, camera: cam2, labels, wash: 0.5 * (1 - smooth(T1, T1 + 0.4, t)) };
      },
    };
  });

  /* ================= s07: one interaction among many crossings ================= */
  F3.define('volume', ({ D, cues }) => {
    const c = cues;
    const scene = new THREE.Scene(), cam = F3.camera(38, 150);
    const sky = inkSky(); scene.add(sky);
    const S = 2.2, corners = [];
    for (const x of [-S, S]) for (const y of [-S, S]) for (const z of [-S, S]) corners.push(new THREE.Vector3(x, y, z));
    const edges = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]].map(([a, b]) => F3.polyline([corners[a], corners[b]], { width: 1.5, color: ICE }));
    edges.forEach(e => scene.add(e));
    const fillMat = new THREE.ShaderMaterial({ ...F3.additive, side: THREE.DoubleSide, vertexShader: F3.LIMB_VERT,
      fragmentShader: 'varying vec3 vN;varying vec3 vV;void main(){gl_FragColor=vec4(vec3(0.40,0.55,0.62)*0.07,1.0);}' });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(2 * S, 2 * S, 2 * S), fillMat));
    const inner = [];
    const ri = rng(707);
    for (let i = 0; i < 260; i++) inner.push(new THREE.Vector3((ri() - 0.5) * 2 * S, (ri() - 0.5) * 2 * S, (ri() - 0.5) * 2 * S));
    const grains = pointCloud(inner, { color: ICE, size: 14, far: 30, max: 4 }); scene.add(grains);
    const r = rng(717), list = [];
    const D0 = new THREE.Vector3(0.55, -0.62, -0.56).normalize();
    for (let i = 0; i < 70; i++) {
      const o = new THREE.Vector3((r() - 0.5) * 6, (r() - 0.5) * 6, (r() - 0.5) * 6).addScaledVector(D0, -9);
      list.push({ o: o.toArray(), d: D0.clone().add(new THREE.Vector3((r() - 0.5) * 0.08, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08)).normalize().toArray(), delay: -r() * 20, speed: 6 + r() * 2, len: 2.0, max: 18 });
    }
    const flux = F3.streaks(list, { width: 2.4, loop: 18 }); scene.add(flux);
    const HIT = new THREE.Vector3(0.4, 0.3, -0.2), T_HIT = c.interact - 0.05;
    const special = F3.streaks([{ o: HIT.clone().addScaledVector(D0, -9).toArray(), d: D0.toArray(), speed: 9 / 0.9, len: 2.2, max: 9 }], { width: 3.4, head: 1.4 });
    scene.add(special);
    const spark = F3.glow([0.92, 0.96, 1.0], 2.2); spark.position.copy(HIT); scene.add(spark);
    const secondary = F3.streaks([{ o: HIT.toArray(), d: [0.75, -0.35, -0.56], speed: 2.2, len: 1.4, max: 2.6 }, { o: HIT.toArray(), d: [-0.5, -0.8, 0.3], speed: 1.6, len: 0.6, max: 0.9 }], { width: 2.4, color: [0.88, 0.94, 0.97] });
    scene.add(secondary);
    const rig = F3.rig([{ t: 0, p: [10.5, 6.0, 13.5], q: [0, -0.2, 0] }, { t: D, p: [7.6, 4.4, 10.6], q: [0.3, -0.1, -0.1], hold: true }]);
    return {
      update(t) {
        rig(t, cam); sky.follow(cam);
        edges.forEach(e => e.set(0.75, 1));
        grains.material.uniforms.uTime.value = t;
        flux.set(t, 0, 0.85);
        special.set(t, T_HIT - 0.9, t < T_HIT + 0.25 ? 1 : 0);
        const k = t - T_HIT;
        spark.set(cam, 1.2 + 0.8 * Math.exp(-Math.max(k, 0) * 2), k > 0 ? clamp(k / 0.05) * (0.5 + 1.6 * Math.exp(-k / 0.35)) : 0);
        secondary.set(t, T_HIT, k > 0 ? 1 : 0);
        const labels = [{ text: 'Tương tác', p: HIT, dy: -120, size: 44, color: '#edf0e9', a: smooth(T_HIT + 0.15, T_HIT + 0.5, t) }];
        return { labels };
      },
      scene, camera: cam,
    };
  });

  /* ================= s08: a water detector ================= */
  F3.define('water', ({ D, cues }) => {
    const c = cues;
    const scene = new THREE.Scene(), cam = F3.camera(40, 150);
    const sky = inkSky(); scene.add(sky);
    const RT = 3.2, HT = 3.4;
    const cut = F3.cutUniforms();
    const wallMat = (side, col) => { const m = new THREE.ShaderMaterial({ side, uniforms: { uC: { value: v3(col) } }, vertexShader: F3.LIMB_VERT,
      fragmentShader: F3.CUT_GLSL + `uniform vec3 uC;varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){${F3.CUT_TEST}float k=0.55+0.45*abs(dot(normalize(vN),normalize(vV)));gl_FragColor=vec4(uC*k,1.0);}` });
      F3.shareCut(m, cut); return m; };
    const shell = new THREE.Group();
    shell.add(new THREE.Mesh(new THREE.CylinderGeometry(RT, RT, 2 * HT, 96, 1, true), wallMat(THREE.FrontSide, [0.20, 0.26, 0.30])));
    shell.add(new THREE.Mesh(new THREE.CylinderGeometry(RT * 0.999, RT * 0.999, 2 * HT, 96, 1, true), wallMat(THREE.BackSide, [0.07, 0.11, 0.14])));
    const capB = new THREE.Mesh(new THREE.CircleGeometry(RT, 96).rotateX(-Math.PI / 2), wallMat(THREE.DoubleSide, [0.06, 0.10, 0.13])); capB.position.y = -HT; shell.add(capB);
    scene.add(shell);
    // light sensors lining the wall
    const pm = [], rows = 15, cols = 46;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = (j + (i % 2) * 0.5) / cols * Math.PI * 2, y = -HT + 0.32 + i * (2 * HT - 0.64) / (rows - 1);
      pm.push({ p: new THREE.Vector3(Math.cos(a) * (RT - 0.06), y, Math.sin(a) * (RT - 0.06)), n: new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)) });
    }
    for (let i = 0; i < 7; i++) for (let j = 0; j < 6 * (i + 1); j++) {
      if (i === 0 && j > 0) break;
      const rr = i * 0.42, a = j / (6 * Math.max(i, 1)) * Math.PI * 2;
      if (rr > RT - 0.3) continue;
      pm.push({ p: new THREE.Vector3(Math.cos(a) * rr, -HT + 0.06, Math.sin(a) * rr), n: new THREE.Vector3(0, 1, 0) });
    }
    // Cherenkov ring: hit time and charge for each sensor from a straight charged track
    const V = new THREE.Vector3(-0.6, -0.4, 1.1), TD = new THREE.Vector3(0.18, -0.12, -1).normalize(), T_INT = c.interact + 0.15, CV = 2.0, TRACK = 1.9;
    const TANC = Math.tan(41.2 * Math.PI / 180);
    const hitT = new Float32Array(pm.length), hitQ = new Float32Array(pm.length);
    pm.forEach((s, i) => {
      const rel = s.p.clone().sub(V), z = rel.dot(TD), rho = rel.clone().addScaledVector(TD, -z).length();
      const ze = z - rho / TANC;
      if (ze >= 0 && ze <= TRACK && z > 0) { hitT[i] = T_INT + (z + rho * TANC) / CV * 0.55 + 0.25; hitQ[i] = (0.55 + 0.45 * clamp(1.6 / (0.6 + rho * 0.5))) * (0.7 + 0.3 * Math.sin(i * 7.3) ** 2); }
      else hitT[i] = 1e4;
    });
    const pmGeo = new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    pmGeo.setAttribute('aHit', new THREE.InstancedBufferAttribute(hitT, 1));
    pmGeo.setAttribute('aQ', new THREE.InstancedBufferAttribute(hitQ, 1));
    const pmMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uShow: { value: 0 } },
      vertexShader: `attribute float aHit;attribute float aQ;uniform float uTime;varying vec3 vN;varying vec3 vV;varying vec3 vP;varying float vLit;
        void main(){vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);vP=wp.xyz;vN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);
        vV=normalize(cameraPosition-wp.xyz);float k=uTime-aHit;vLit=k>0.0?aQ*(0.9+2.2*exp(-k/0.6)):0.0;gl_Position=projectionMatrix*viewMatrix*wp;}`,
      fragmentShader: F3.CUT_GLSL + `uniform float uShow;varying vec3 vN;varying vec3 vV;varying vec3 vP;varying float vLit;
        void main(){${F3.CUT_TEST}float k=0.35+0.65*pow(max(dot(normalize(vN),normalize(vV)),0.0),0.7);
        vec3 base=vec3(0.50,0.43,0.30)*k*(0.55+0.5*uShow)*(1.0-0.35*min(vLit,1.0));vec3 lit=vec3(0.78,0.92,1.0)*vLit;
        gl_FragColor=vec4(base+lit,1.0);}`,
    });
    F3.shareCut(pmMat, cut);
    const pms = new THREE.InstancedMesh(pmGeo, pmMat, pm.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    pm.forEach((s, i) => { q.setFromUnitVectors(up, s.n); m4.compose(s.p, q, one); pms.setMatrixAt(i, m4); });
    pms.frustumCulled = false; scene.add(pms);
    // water: a faint volume tint
    const water = new THREE.Mesh(new THREE.CylinderGeometry(RT * 0.995, RT * 0.995, 2 * HT * 0.995, 64, 1, true), (() => {
      const m = new THREE.ShaderMaterial({ ...F3.additive, side: THREE.BackSide, vertexShader: F3.LIMB_VERT,
        fragmentShader: F3.CUT_GLSL + `varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){${F3.CUT_TEST}gl_FragColor=vec4(vec3(0.05,0.13,0.18),1.0);}` });
      F3.shareCut(m, cut); return m; })());
    scene.add(water);
    const ND = TD.clone().add(new THREE.Vector3(-0.05, 0.08, 0.02)).normalize();
    const nu = F3.streaks([{ o: V.clone().addScaledVector(ND, -10).toArray(), d: ND.toArray(), speed: 10 / 0.8, len: 2.4, max: 10 }], { width: 4, head: 1.4 }); nu.material.depthTest = false; scene.add(nu);
    const lepton = F3.streaks([{ o: V.toArray(), d: TD.toArray(), speed: TRACK / 1.2, len: TRACK, max: TRACK }], { width: 3, color: [0.86, 0.94, 0.98] }); lepton.material.depthTest = false; scene.add(lepton);
    const vtx = F3.glow([0.92, 0.96, 1.0], 2.2); vtx.position.copy(V); scene.add(vtx);
    const coneMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 } }, ...F3.additive, side: THREE.DoubleSide, vertexShader: F3.LIMB_VERT,
      fragmentShader: `uniform float uA;varying vec3 vN;varying vec3 vV;varying vec3 vO;void main(){float f=1.0-abs(dot(normalize(vN),normalize(vV)));float fade=smoothstep(0.0,0.5,1.0+vO.y);
        gl_FragColor=vec4(vec3(0.62,0.82,1.0)*(0.10+0.55*pow(f,2.0))*uA*fade,1.0);}` });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(TANC, 1, 64, 1, true), coneMat); cone.geometry.translate(0, -0.5, 0); scene.add(cone);
    const recon = F3.polyline([V.clone().addScaledVector(ND, -3.4), V.clone().addScaledVector(TD, 2.6)], { width: 2.2, color: AMBER, dash: 22, depthTest: false }); scene.add(recon);
    const rig = F3.rig([
      { t: 0, p: [3.2, 4.6, 10.6], q: [0, -0.3, 0] },
      { t: c.sensors + 0.5, p: [2.0, 2.2, 7.8], q: [0, -0.4, 0] },
      { t: c.interact, p: [1.3, 1.0, 6.6], q: [0, -0.6, -2.0] },
      { t: c.glow + 0.5, p: [0.8, 0.8, 7.6], q: [0.1, -0.7, -3.0] },
      { t: D, p: [0.6, 0.9, 8.6], q: [0.1, -0.7, -3.0], hold: true },
    ]);
    return {
      update(t) {
        rig(t, cam); sky.follow(cam);
        const ang = Math.atan2(cam.position.x, cam.position.z), half = 0.55;
        cut.uCutOn.value = 1; cut.uCutA.value.set(-Math.cos(ang - half), 0, Math.sin(ang - half)); cut.uCutB.value.set(Math.cos(ang + half), 0, -Math.sin(ang + half));
        pmMat.uniforms.uTime.value = t; pmMat.uniforms.uShow.value = bump(c.sensors - 0.2, c.sensors + 0.3, c.interact - 0.4, c.interact, t);
        nu.set(t, T_INT - 0.95, t < T_INT + 0.3 ? 1 : 0);
        const k = t - T_INT;
        vtx.set(cam, 0.9 + 0.6 * Math.exp(-Math.max(k, 0) * 2), k > 0 ? clamp(k / 0.05) * (0.4 + 1.3 * Math.exp(-k / 0.4)) : 0);
        lepton.set(t, T_INT, k > 0 ? 1 - smooth(1.6, 2.4, k) : 0);
        const along = clamp(k / 1.2) * TRACK;
        const headP = V.clone().addScaledVector(TD, along);
        cone.position.copy(headP); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), TD);
        const cl = Math.max(0.01, along * 1.15);
        cone.scale.set(cl, cl, cl);
        coneMat.uniforms.uA.value = k > 0 ? (1 - smooth(1.4, 2.2, k)) * 0.9 : 0;
        recon.set(0.9 * smooth(c.rebuild - 0.1, c.rebuild + 0.3, t), smooth(c.rebuild - 0.1, c.rebuild + 0.8, t));
        const labels = [
          { text: 'Nước', x: 540, y: 250, size: 44, color: '#d8e4e8', a: bump(c.water - 0.1, c.water + 0.3, c.sensors - 0.3, c.sensors, t) },
          { text: 'Cảm biến ánh sáng', x: 540, y: 250, size: 44, color: '#d8e4e8', a: bump(c.sensors - 0.1, c.sensors + 0.3, c.interact - 0.4, c.interact, t) },
          { text: 'Vòng ánh sáng trên thành bể', x: 540, y: 250, size: 40, color: '#d8e4e8', a: bump(c.record - 0.1, c.record + 0.3, c.rebuild - 0.3, c.rebuild, t) },
          { text: 'Tái dựng hướng đi', x: 540, y: 250, size: 42, color: '#efb768', a: smooth(c.rebuild + 0.1, c.rebuild + 0.5, t) },
        ];
        return { labels };
      },
      scene, camera: cam,
    };
  });

  /* ================= s10: scale and backgrounds ================= */
  F3.define('background', ({ D, cues }) => {
    const c = cues;
    const T1 = c.signal - 0.25, T2 = c.sea - 0.3;
    // world 1: a bigger volume catches more
    const s1 = new THREE.Scene(), cam1 = F3.camera(38, 150);
    const sky1 = inkSky(); s1.add(sky1);
    const unit = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) unit.push(new THREE.Vector3(x, y, z));
    const cubeEdges = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
    const cubeGroup = new THREE.Group(); s1.add(cubeGroup);
    const cubeLines = cubeEdges.map(([a, b]) => { const m = F3.polyline([unit[a], unit[b]], { width: 1.6, color: ICE }); cubeGroup.add(m); return m; });
    const r = rng(1010), list = [], flashes = [];
    const DD = new THREE.Vector3(0.45, -0.7, -0.55).normalize();
    for (let i = 0; i < 50; i++) { const o = new THREE.Vector3((r() - 0.5) * 9, (r() - 0.5) * 9, (r() - 0.5) * 9).addScaledVector(DD, -12); list.push({ o: o.toArray(), d: DD.toArray(), delay: -r() * 20, speed: 7 + r() * 2, len: 2, max: 24 }); }
    const flux = F3.streaks(list, { width: 2.2, loop: 24 }); s1.add(flux);
    for (let i = 0; i < 26; i++) { const g = F3.glow([0.92, 0.96, 1.0], 2.4); const p = new THREE.Vector3((r() - 0.5) * 2, (r() - 0.5) * 2, (r() - 0.5) * 2); g.userData = { p, t0: c.volume + 0.3 + r() * (T1 - c.volume - 0.4), small: Math.abs(p.x) < 0.22 && Math.abs(p.y) < 0.22 && Math.abs(p.z) < 0.22 }; s1.add(g); flashes.push(g); }
    const rig1 = F3.rig([{ t: 0, p: [3.2, 2.1, 4.6], q: [0, 0, 0] }, { t: c.volume + 1.2, p: [9.5, 6.0, 13.5], q: [0, 0, 0] }, { t: T1 + 0.4, p: [10.5, 6.4, 14.5], q: [0, 0, 0] }]);
    // world 2: the atmosphere makes its own particles
    const s2 = new THREE.Scene(), cam2 = F3.camera(38, 150);
    const bg2 = F3.backdrop(s2, { seed: 102 });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(20, 160, 96), new THREE.ShaderMaterial({ vertexShader: F3.LIMB_VERT,
      fragmentShader: F3.NOISE + 'varying vec3 vN;varying vec3 vV;varying vec3 vO;void main(){float n=fbm3(normalize(vO)*14.0)*0.5+0.5;float f=1.0-abs(dot(normalize(vN),normalize(vV)));vec3 c=mix(vec3(0.05,0.11,0.16),vec3(0.08,0.16,0.22),n)+vec3(0.35,0.55,0.70)*pow(f,3.0)*0.6;gl_FragColor=vec4(c,1.0);}' }));
    planet.position.set(0, -20, 0); s2.add(planet);
    const air = new THREE.Mesh(new THREE.SphereGeometry(21.2, 160, 96), new THREE.ShaderMaterial({ ...F3.additive, side: THREE.BackSide, vertexShader: F3.LIMB_VERT,
      fragmentShader: 'varying vec3 vN;varying vec3 vV;void main(){float f=clamp(dot(-normalize(vN),normalize(vV)),0.0,1.0);gl_FragColor=vec4(vec3(0.30,0.52,0.70)*pow(clamp(f*3.2,0.0,1.0),2.0)*0.7,1.0);}' }));
    air.position.copy(planet.position); s2.add(air);
    const showers = [], rs = rng(1020);
    [[-3.2, 0.9, -1.0, 0.0], [1.4, 0.95, -2.2, 0.7], [3.6, 0.9, 0.4, 1.4], [-0.8, 0.95, 1.2, 2.0]].forEach(([x, y, z, dt]) => {
      const segs = [], top = new THREE.Vector3(x, y + 4.0, z), hit = new THREE.Vector3(x, y + 1.0, z);
      segs.push({ a: top, b: hit, u0: 0, u1: 0.25, k: 1.3 });
      const grow = (p, d, depth, u) => {
        if (depth > 4) return;
        const n = depth < 2 ? 2 : (rs() < 0.6 ? 2 : 1);
        for (let k = 0; k < n; k++) {
          const nd = d.clone().add(new THREE.Vector3((rs() - 0.5) * 0.5, 0, (rs() - 0.5) * 0.5)).normalize();
          const q2 = p.clone().addScaledVector(nd, 0.45 + rs() * 0.3);
          segs.push({ a: p, b: q2, u0: u, u1: u + 0.15, k: 1 - depth * 0.15 }); grow(q2, nd, depth + 1, u + 0.15);
        }
      };
      grow(hit, new THREE.Vector3(0, -1, 0), 0, 0.25);
      const m = F3.segLines(segs, { width: 1.8, color: [0.84, 0.92, 0.96], fade: 0.6 }); m.userData = { dt, hit }; s2.add(m); showers.push(m);
    });
    const ra = rng(1030), rain = [];
    for (let i = 0; i < 90; i++) { const o = new THREE.Vector3((ra() - 0.5) * 9, 1.75 - ra() * 0.35, (ra() - 0.5) * 4); rain.push({ o: o.toArray(), d: [(ra() - 0.5) * 0.25, -1, (ra() - 0.5) * 0.2], delay: ra() * 2.5, speed: 2.2 + ra(), len: 0.5, max: 1.8 }); }
    const noise = F3.streaks(rain, { width: 1.8, color: [0.82, 0.90, 0.95] }); s2.add(noise);
    const cosmic = F3.streaks([{ o: [1.0, 9, -2.0], d: [-0.12, -1, 0.15], speed: 6, len: 3.2, max: 14 }], { width: 4.2, head: 1.4 }); s2.add(cosmic);
    const rig2 = F3.rig([{ t: T1, p: [0.4, 3.0, 8.4], q: [0, 1.3, 0] }, { t: T2 + 0.4, p: [-0.4, 2.5, 7.4], q: [0, 1.1, 0] }]);
    // world 3: light that is already in the sea
    const s3 = new THREE.Scene(), cam3 = F3.camera(38, 150);
    const sky3 = inkSky([0.02, 0.07, 0.10], [0.008, 0.025, 0.04]); s3.add(sky3);
    const module = new THREE.Group(); s3.add(module);
    module.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 32), new THREE.ShaderMaterial({ ...F3.additive, vertexShader: F3.LIMB_VERT,
      fragmentShader: 'varying vec3 vN;varying vec3 vV;void main(){float f=1.0-abs(dot(normalize(vN),normalize(vV)));gl_FragColor=vec4(vec3(0.6,0.75,0.85)*(pow(f,2.5)*0.8+0.04),1.0);}' })));
    const dots = [], rd = rng(1040);
    for (let i = 0; i < 31; i++) { const d = randomDir(rd); if (d.y > 0.85) continue; dots.push(d.multiplyScalar(0.62)); }
    const faceGeo = new THREE.CircleGeometry(0.115, 32);
    const faceMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv;void main(){float r=length(vUv-0.5)*2.0;vec3 c=mix(vec3(0.10,0.10,0.09),vec3(0.62,0.52,0.32),smoothstep(0.62,0.95,r));c+=vec3(0.30,0.28,0.22)*smoothstep(0.35,0.0,length(vUv-vec2(0.38,0.62))*2.0);gl_FragColor=vec4(c,1.0);}' });
    const modulePm = new THREE.InstancedMesh(faceGeo, faceMat, dots.length);
    const fm = new THREE.Matrix4(), fq = new THREE.Quaternion();
    dots.forEach((d, i) => { fq.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize()); fm.compose(d.clone().multiplyScalar(1.24), fq, new THREE.Vector3(1, 1, 1)); modulePm.setMatrixAt(i, fm); });
    module.add(modulePm);
    const flashPts = [], rf = rng(1050);
    for (let i = 0; i < 90; i++) { const g = F3.glow([0.62, 0.86, 1.0], 2.6); g.userData = { p: randomDir(rf).multiplyScalar(1.6 + rf() * 4.5), t0: T2 + rf() * (D - T2), dur: 0.25 + rf() * 0.5 }; g.position.copy(g.userData.p); s3.add(g); flashPts.push(g); }
    const rig3 = F3.rig([{ t: T2, p: [2.2, 0.6, 6.4], q: [0, 0.4, 0] }, { t: D, p: [1.2, 0.4, 5.0], q: [0, 0.3, 0], hold: true }]);
    return {
      update(t) {
        if (t < T1) {
          rig1(t, cam1); sky1.follow(cam1);
          const grow = 1 + 4.2 * smooth(c.volume - 0.2, c.volume + 1.0, t);
          cubeGroup.scale.setScalar(grow * 0.6);
          cubeLines.forEach(m => m.set(0.8, 1));
          flux.set(t, 0, 0.9);
          flashes.forEach(g => { const k = t - g.userData.t0; g.position.copy(g.userData.p).multiplyScalar(grow * 0.6); g.set(cam1, 0.7 + 0.5 * grow * 0.2, k > 0 && k < 1.2 ? clamp(k / 0.05) * Math.exp(-k / 0.3) * 1.4 : 0); });
          return { scene: s1, camera: cam1, wash: 0.45 * smooth(T1 - 0.3, T1, t) };
        }
        if (t < T2) {
          rig2(t, cam2); bg2.follow(cam2, t);
          showers.forEach(m => { const k = t - (c.atmos - 1.2 + m.userData.dt * 0.55); m.set(0.9, clamp(k / 1.4)); });
          noise.set(t, c.atmos - 0.2, smooth(c.atmos - 0.2, c.atmos + 0.3, t));
          cosmic.set(t, c.atmos + 0.2, 1);
          const labels = [
            { text: 'Khí quyển', x: 300, y: 1320, size: 42, color: '#d8e4e8', a: smooth(c.atmos, c.atmos + 0.35, t) },
            { text: 'Nguồn vũ trụ', x: 780, y: 1320, size: 42, color: '#efb768', a: smooth(c.atmos + 0.4, c.atmos + 0.75, t) },
          ];
          return { scene: s2, camera: cam2, labels, wash: 0.45 * Math.max(1 - smooth(T1, T1 + 0.3, t), smooth(T2 - 0.3, T2, t)) };
        }
        rig3(t, cam3); sky3.follow(cam3);
        module.rotation.y = t * 0.15;
        flashPts.forEach(g => { const k = t - g.userData.t0; g.set(cam3, 0.6, k > 0 && k < g.userData.dur ? Math.sin(k / g.userData.dur * Math.PI) * 1.2 : 0); });
        const labels = [{ text: 'Ánh sáng nền', x: 540, y: 250, size: 44, color: '#d8e4e8', a: smooth(T2 + 0.4, T2 + 0.8, t) }];
        return { scene: s3, camera: cam3, labels, wash: 0.45 * (1 - smooth(T2, T2 + 0.3, t)) };
      },
    };
  });

  /* ================= s11: natural targets — the sea and the Antarctic ice ================= */
  F3.define('natural', ({ D, cues }) => {
    const c = cues;
    const scene = new THREE.Scene(), cam = F3.camera(38, 150);
    const bg = F3.backdrop(scene, { seed: 111 });
    const earth = F3.earth({ sun: [0.2, 0.5, 1.0], night: 0.55, ambient: 0.55, tilt: 0 });
    scene.add(earth.group);
    const pin = (lat, lon, col) => {
      const p = F3.latLon(lat, lon, 1.012);
      const g = F3.glow(col, 2.4); g.position.copy(p); earth.body.add(g);
      const ring = F3.polyline(F3.circlePoints(0.055, 48, 'xy'), { width: 1.6, color: col, depthTest: true });
      ring.position.copy(p); ring.lookAt(p.clone().multiplyScalar(2)); earth.body.add(ring);
      return { g, ring, p };
    };
    const med = pin(36.3, 16.1, ICE), pole = pin(-89.9, 0, ICE);
    earth.body.rotation.z = 0;
    const camDir = (lat, lon, dist) => F3.latLon(lat, lon, dist);
    const tmp = new THREE.Vector3();
    return {
      update(t) {
        // the globe turns so the camera travels from the Mediterranean to the South Pole
        const k1 = smooth(0, c.sea + 0.4, t), k2 = smooth(c.ice - 1.0, c.ice + 0.6, t);
        const lat = lerp(lerp(16, 30, k1), -80, k2), lon = lerp(lerp(-8, 14, k1), 40, k2), dist = lerp(lerp(6.2, 5.2, k1), 3.4, k2) - 0.2 * smooth(c.ice + 0.6, D, t);
        earth.body.rotation.y = 0;
        earth.group.updateMatrixWorld();
        tmp.copy(camDir(lat, lon, dist));
        cam.position.copy(tmp); cam.up.set(0, 1, 0);
        cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        bg.follow(cam, t);
        earth.set({});
        const mA = bump(c.sea - 0.2, c.sea + 0.2, c.ice - 0.9, c.ice - 0.4, t), pA = smooth(c.ice - 0.1, c.ice + 0.3, t);
        med.g.set(cam, 0.09, 1.2 * mA); med.ring.set(0.9 * mA, 1);
        pole.g.set(cam, 0.09, 1.2 * pA); pole.ring.set(0.9 * pA, 1);
        const wm = med.p.clone().applyMatrix4(earth.body.matrixWorld), wp = pole.p.clone().applyMatrix4(earth.body.matrixWorld);
        const labels = [
          { text: 'Địa Trung Hải', p: wm, dy: -70, size: 40, color: '#edf0e9', a: mA },
          { text: 'Nam Cực', p: wp, dy: -70, size: 42, color: '#edf0e9', a: pA },
        ];
        return { labels };
      },
      scene, camera: cam,
    };
  });
})();
