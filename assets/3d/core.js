/* Shared Three.js toolkit for the film. One WebGL renderer draws every 3D scene; each scene composition owns a
   2D canvas and receives a copy of its frame, so the page never holds more than one WebGL context.
   Every visible value is a pure function of scene time t (seconds), so frames render identically in any order.
   Colour language: ice white = light and matter, amber = the neutrino signal, orange only for star bodies. */
window.F3 = (function () {
  'use strict';
  THREE.ColorManagement.enabled = false;
  const W = 1080, H = 1920;
  const C = {
    ink: [0.040, 0.075, 0.105], fg: [0.93, 0.94, 0.91], ice: [0.72, 0.83, 0.87], iceDim: [0.45, 0.58, 0.64],
    amber: [0.94, 0.72, 0.41], amberHot: [1.0, 0.86, 0.62], orange: [0.95, 0.50, 0.22],
  };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ramp = (a, b, t) => clamp((t - a) / (b - a));
  const smooth = (a, b, t) => { const v = ramp(a, b, t); return v * v * (3 - 2 * v); };
  const smoother = (a, b, t) => { const v = ramp(a, b, t); return v * v * v * (v * (v * 6 - 15) + 10); };
  const bump = (a, b, c, d, t) => smooth(a, b, t) * (1 - smooth(c, d, t));
  const lerp = (a, b, k) => a + (b - a) * k;
  const expoOut = (v) => v >= 1 ? 1 : 1 - Math.pow(2, -10 * v);
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function randomDir(r) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    return new THREE.Vector3(s * Math.cos(a), z, s * Math.sin(a));
  }
  const cloudField = (x, y, z) => Math.sin(x * 0.53 + 1.3) * Math.cos(y * 0.61 - 0.4) + Math.sin(z * 0.47 + x * 0.21) * 0.8 + Math.cos((x + z) * 0.33 + y * 0.2) * 0.6;

  // Simplex noise: Ashima Arts / Stefan Gustavson (MIT).
  const NOISE = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm(vec3 p){float f=0.0,a=0.5;for(int i=0;i<5;i++){f+=a*snoise(p);p*=2.03;a*=0.5;}return f;}
  float fbm3(vec3 p){float f=0.0,a=0.5;for(int i=0;i<3;i++){f+=a*snoise(p);p*=2.03;a*=0.5;}return f;}
  float fbm4(vec3 p){float f=0.0,a=0.5;for(int i=0;i<4;i++){f+=a*snoise(p);p*=2.07;a*=0.5;}return f;}
  `;
  const LIMB_VERT = `varying vec3 vN;varying vec3 vV;varying vec3 vP;varying vec3 vO;
    void main(){vO=position;vec4 wp=modelMatrix*vec4(position,1.0);vP=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);
    vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`;
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const CUT_GLSL = 'uniform float uCutOn;uniform vec3 uCutA;uniform vec3 uCutB;uniform vec3 uCutC;\n';
  const CUT_TEST = 'if(uCutOn>0.5&&dot(vP-uCutC,uCutA)<0.0&&dot(vP-uCutC,uCutB)<0.0)discard;';
  function cutUniforms() { return { uCutOn: { value: 0 }, uCutA: { value: new THREE.Vector3(1, 0, 0) }, uCutB: { value: new THREE.Vector3(0, 0, 1) }, uCutC: { value: new THREE.Vector3() } }; }
  function shareCut(mat, cut) { Object.assign(mat.uniforms, cut); }

  /* ---------- camera ---------- */
  function camera(fov = 38, lift = 150) {
    const cam = new THREE.PerspectiveCamera(fov, W / H, 0.02, 6000);
    if (lift) cam.setViewOffset(W, H, 0, lift, W, H); // keep subjects above the caption band
    return cam;
  }
  // time-knotted cubic Hermite through keys {t, p:[...], q:[...], r?:roll}; optional pIn/pOut/qIn/qOut tangents
  function track(keys, field) {
    const n = keys.length, T = keys.map(k => k.t);
    const P = keys.map(k => Array.isArray(k[field]) ? v3(k[field]) : new THREE.Vector3(k[field] || 0, 0, 0));
    const fd = (i) => {
      if (n === 1) return new THREE.Vector3();
      if (i === 0) return P[1].clone().sub(P[0]).divideScalar(T[1] - T[0]).multiplyScalar(keys[0].ease0 ? 0 : 1);
      if (i === n - 1) return P[n - 1].clone().sub(P[n - 2]).divideScalar(T[n - 1] - T[n - 2]).multiplyScalar(keys[n - 1].hold ? 0 : 0.55);
      return P[i + 1].clone().sub(P[i - 1]).divideScalar(T[i + 1] - T[i - 1]);
    };
    const mIn = keys.map((k, i) => k[field + 'In'] ? v3(k[field + 'In']) : fd(i));
    const mOut = keys.map((k, i) => k[field + 'Out'] ? v3(k[field + 'Out']) : mIn[i].clone());
    return function (t, out) {
      out = out || new THREE.Vector3();
      if (n === 1) return out.copy(P[0]);
      if (t <= T[0]) return out.copy(P[0]).addScaledVector(mOut[0], t - T[0]);
      if (t >= T[n - 1]) return out.copy(P[n - 1]).addScaledVector(mIn[n - 1], t - T[n - 1]);
      let i = 0; while (i < n - 2 && t > T[i + 1]) i++;
      const h = T[i + 1] - T[i], s = (t - T[i]) / h, s2 = s * s, s3 = s2 * s;
      return out.set(0, 0, 0)
        .addScaledVector(P[i], 2 * s3 - 3 * s2 + 1).addScaledVector(mOut[i], (s3 - 2 * s2 + s) * h)
        .addScaledVector(P[i + 1], -2 * s3 + 3 * s2).addScaledVector(mIn[i + 1], (s3 - s2) * h);
    };
  }
  function rig(keys) {
    const p = track(keys, 'p'), q = track(keys, 'q');
    const r = keys.some(k => k.r !== undefined) ? track(keys.map(k => ({ ...k, r: [k.r || 0, 0, 0] })), 'r') : null;
    const tp = new THREE.Vector3(), tq = new THREE.Vector3(), tr = new THREE.Vector3();
    return function (t, cam, shake) {
      p(t, tp); q(t, tq);
      if (shake) { tq.x += shake[0]; tq.y += shake[1]; tq.z += shake[2] || 0; }
      const roll = r ? r(t, tr).x : 0;
      cam.position.copy(tp); cam.up.set(Math.sin(roll), Math.cos(roll), 0); cam.lookAt(tq); cam.updateMatrixWorld();
      return cam;
    };
  }

  /* ---------- environment ---------- */
  function sky(opts = {}) {
    const band = opts.band ?? 1, tint = opts.tint || [0, 0, 0];
    const m = new THREE.Mesh(new THREE.SphereGeometry(3000, 64, 32), new THREE.ShaderMaterial({
      uniforms: { uBand: { value: band }, uTint: { value: v3(tint) }, uFade: { value: 1 } },
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: NOISE + `uniform float uBand;uniform vec3 uTint;uniform float uFade;varying vec3 vDir;
        void main(){vec3 d=normalize(vDir);
        vec3 col=mix(vec3(0.028,0.050,0.070),vec3(0.046,0.078,0.106),0.5+0.5*d.y);
        vec3 bn=normalize(vec3(0.42,0.80,-0.43));
        float band=exp(-pow(dot(d,bn)/0.16,2.0));
        float cl=fbm3(d*3.4)*0.5+0.5; float lane=fbm3(d*8.0+vec3(3.1,1.7,0.4))*0.5+0.5;
        col+=vec3(0.034,0.038,0.040)*band*cl*(1.0-0.75*smoothstep(0.5,0.72,lane))*uBand;
        gl_FragColor=vec4((col+uTint)*uFade,1.0);}`,
    }));
    m.renderOrder = -10; m.frustumCulled = false;
    m.follow = (cam) => m.position.copy(cam.position);
    return m;
  }
  function starfield(opts = {}) {
    const r = rng(opts.seed || 1729), N = opts.count || 11000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
    const palette = [[0.93, 0.94, 0.91], [0.80, 0.88, 0.94], [0.98, 0.88, 0.74]];
    for (let i = 0; i < N; i++) {
      const d = randomDir(r).multiplyScalar(1500);
      pos.set([d.x, d.y, d.z], i * 3);
      const m = r(), b = Math.pow(r(), 3.2);
      const c = palette[m < 0.70 ? 0 : m < 0.90 ? 1 : 2], k = 0.42 + 0.58 * b;
      col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
      size[i] = 1.5 + 3.6 * b; ph[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 } }, ...additive, depthTest: false,
      vertexShader: `attribute vec3 aColor;attribute float aSize;attribute float aPhase;uniform float uTime;uniform float uFade;varying vec3 vC;
        void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        float tw=0.88+0.12*sin(uTime*(1.1+aPhase*2.3)+aPhase*41.0);gl_PointSize=aSize;vC=aColor*tw*uFade;}`,
      fragmentShader: 'varying vec3 vC;void main(){float d=length(gl_PointCoord-0.5)*2.0;float a=smoothstep(1.0,0.15,d);gl_FragColor=vec4(vC*a*1.25,1.0);}',
    }));
    pts.renderOrder = -9; pts.frustumCulled = false;
    pts.follow = (cam, t) => { pts.position.copy(cam.position); pts.material.uniforms.uTime.value = t; };
    return pts;
  }
  function backdrop(scene, opts = {}) {
    const s = sky(opts), st = starfield(opts);
    scene.add(s, st);
    return { sky: s, stars: st, follow(cam, t, fade = 1) { s.follow(cam); st.follow(cam, t); s.material.uniforms.uFade.value = fade; st.material.uniforms.uFade.value = fade; } };
  }

  function glow(color, pow = 3) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: v3(color) }, uIntensity: { value: 0 }, uPow: { value: pow } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform vec3 uColor;uniform float uIntensity;uniform float uPow;varying vec2 vUv;
        void main(){float d=length(vUv-0.5)*2.0;float k=max(0.0,1.0-d);
        float a=pow(k,uPow)+0.6*pow(k,uPow*6.0);gl_FragColor=vec4(uColor*a*uIntensity,1.0);}`,
      ...additive,
    }));
    m.frustumCulled = false;
    m.set = (cam, scale, intensity, color) => {
      m.quaternion.copy(cam.quaternion); m.scale.setScalar(Math.max(scale, 1e-4));
      m.material.uniforms.uIntensity.value = intensity; if (color) m.material.uniforms.uColor.value.set(color[0], color[1], color[2]);
      m.visible = intensity > 0.001;
    };
    return m;
  }

  /* ---------- stars ---------- */
  function starBody(opts = {}) {
    const sun = opts.type === 'sun';
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDim: { value: 1 }, uHeat: { value: 0 }, uStir: { value: 0 }, uGhost: { value: 0 }, uCut: { value: 0 }, uCutDir: { value: new THREE.Vector3(1, 0, 0) } },
      transparent: true,
      vertexShader: LIMB_VERT,
      fragmentShader: NOISE + CUT_GLSL + `uniform float uTime;uniform float uDim;uniform float uHeat;uniform float uStir;uniform float uGhost;
        varying vec3 vO;varying vec3 vN;varying vec3 vV;varying vec3 vP;
        void main(){${CUT_TEST}vec3 p=normalize(vO);
        float big=fbm(p*${sun ? '2.6' : '1.5'}+vec3(0.0,uTime*0.035,0.0));
        float cells=snoise(p*${sun ? '14.0' : '6.0'}+vec3(uTime*0.10,0.0,uTime*0.06)*(1.0+uStir*5.0));
        float fine=snoise(p*${sun ? '38.0' : '19.0'}-vec3(uTime*0.18));
        float I=0.74+0.24*big+0.09*cells+0.03*fine;
        float mu=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
        I*=(0.42+0.58*pow(mu,0.55))*uDim;
        ${sun ? `vec3 c=mix(vec3(0.75,0.36,0.10),vec3(0.98,0.70,0.32),smoothstep(0.30,0.70,I));
        c=mix(c,vec3(1.0,0.93,0.74),smoothstep(0.70,1.0,I));`
      : `vec3 c=mix(vec3(0.42,0.10,0.03),vec3(0.80,0.30,0.09),smoothstep(0.22,0.55,I));
        c=mix(c,vec3(0.97,0.56,0.24),smoothstep(0.52,0.80,I));
        c=mix(c,vec3(1.0,0.84,0.60),smoothstep(0.80,1.05,I));`}
        c=mix(c,vec3(1.0,0.97,0.93)*1.7,uHeat);
        float rim=1.0-mu;
        float a=mix(1.0,0.07+0.80*pow(rim,2.2),uGhost);
        vec3 gc=mix(c,vec3(0.98,0.52,0.22)*(0.55+0.6*rim),uGhost*0.7);
        gl_FragColor=vec4(gc,a);}`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat);
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0.55 }, uColor: { value: v3(sun ? [1.0, 0.72, 0.35] : [0.95, 0.45, 0.18]) } }, side: THREE.BackSide, ...additive,
      vertexShader: LIMB_VERT,
      fragmentShader: CUT_GLSL + `uniform float uA;uniform vec3 uColor;varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){${CUT_TEST}float f=clamp(dot(-normalize(vN),normalize(vV)),0.0,1.0);
        float a=pow(clamp(f*1.9,0.0,1.0),2.4)*uA;gl_FragColor=vec4(uColor*a,1.0);}`,
    });
    const cut = cutUniforms(); shareCut(mat, cut); shareCut(haloMat, cut);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.14, 96, 64), haloMat);
    const g = glow(sun ? [1.0, 0.75, 0.40] : [0.90, 0.42, 0.16], 3.0);
    const group = new THREE.Group(); group.add(mesh, halo, g);
    return {
      group, mesh, halo, glow: g, material: mat, cut,
      set(cam, o) {
        const R = o.radius ?? 1;
        mesh.scale.setScalar(R); halo.scale.setScalar(R); mesh.rotation.y = (o.time || 0) * 0.045;
        mat.uniforms.uTime.value = o.time || 0; mat.uniforms.uDim.value = o.dim ?? 1; mat.uniforms.uHeat.value = o.heat || 0;
        mat.uniforms.uStir.value = o.stir || 0; mat.uniforms.uGhost.value = o.ghost || 0;
        mat.depthWrite = (o.ghost || 0) < 0.05;
        haloMat.uniforms.uA.value = (o.halo ?? 0.55) * (1 - (o.ghost || 0));
        g.set(cam, R * (o.glowScale ?? 4.6), (o.glow ?? 0.30) * (1 - 0.6 * (o.ghost || 0)));
        group.visible = o.visible ?? true;
      },
    };
  }

  // ejecta as a ray-marched emitting gas shell (filaments, knots, a hotter inner layer)
  function remnant() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uR: { value: 1 }, uA: { value: 0 }, uHot: { value: 0 }, uAge: { value: 0 }, uTime: { value: 0 } },
      side: THREE.BackSide, ...additive,
      vertexShader: 'varying vec3 vW;void main(){vec4 wp=modelMatrix*vec4(position,1.0);vW=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}',
      fragmentShader: NOISE + `uniform float uR;uniform float uA;uniform float uHot;uniform float uAge;uniform float uTime;varying vec3 vW;
        uniform vec3 uCenter;
        void main(){
          vec3 ro=cameraPosition-uCenter;vec3 rd=normalize(vW-cameraPosition);
          float Rb=uR*1.32;float b=dot(ro,rd);float c=dot(ro,ro)-Rb*Rb;float h=b*b-c;
          if(h<=0.0)discard;h=sqrt(h);
          float t0=max(-b-h,0.0),t1=-b+h;
          const int N=34;float dt=(t1-t0)/float(N);
          float jit=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
          vec3 acc=vec3(0.0);float trans=1.0;
          for(int i=0;i<N;i++){
            vec3 p=ro+rd*(t0+(float(i)+jit)*dt);
            vec3 q=p/uR;float r=length(q);
            float big=fbm4(q*1.9+vec3(1.7,0.0,uTime*0.04));
            float rr=r+0.16*big;
            float shell=exp(-pow((rr-1.0)/0.095,2.0));
            float ridge=1.0-abs(snoise(q*3.3+vec3(3.1,uTime*0.03,0.0)));
            float lobe=smoothstep(-0.35,0.55,snoise(q*0.9+vec3(5.2,1.1,0.0)));
            ridge=ridge*ridge*ridge*ridge;
            float inner=exp(-pow((rr-0.58)/0.16,2.0));
            float dens=(shell*(0.05+2.3*ridge)+inner*(0.10+1.1*ridge)*0.4)*(0.35+0.95*lobe);
            vec3 col=mix(vec3(1.0,0.90,0.76),vec3(0.70,0.83,0.90),smoothstep(0.62,1.02,rr)*(0.35+0.65*uAge));
            col=mix(col,vec3(1.0,0.98,0.94),uHot);
            float a=dens*dt/uR*0.8;
            acc+=trans*col*a;trans*=exp(-a*0.45);
          }
          gl_FragColor=vec4(acc*uA,1.0);
        }`,
    });
    mat.uniforms.uCenter = { value: new THREE.Vector3() };
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.32, 48, 32), mat);
    mesh.frustumCulled = false;
    return {
      mesh, set(o) {
        mesh.visible = o.visible ?? true; mesh.scale.setScalar(o.R); mat.uniforms.uR.value = o.R;
        mat.uniforms.uCenter.value.copy(mesh.getWorldPosition(new THREE.Vector3()));
        mat.uniforms.uTime.value = o.time; mat.uniforms.uAge.value = o.age; mat.uniforms.uHot.value = o.hot; mat.uniforms.uA.value = o.a;
      },
    };
  }

  // an expanding light front: a sphere drawn only at its limb
  function lightFront(color = [0.92, 0.95, 0.94], sharp = 14) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uColor: { value: v3(color) } }, side: THREE.FrontSide, ...additive,
      vertexShader: LIMB_VERT,
      fragmentShader: `uniform float uA;uniform vec3 uColor;varying vec3 vN;varying vec3 vV;void main(){float f=1.0-clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
        float a=(pow(f,${sharp.toFixed(1)})*1.1+pow(f,3.0)*0.07)*uA;gl_FragColor=vec4(uColor*a,1.0);}`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), mat);
    mesh.frustumCulled = false;
    return { mesh, set(r, a) { mesh.visible = a > 0.001 && r > 0.01; mesh.scale.setScalar(Math.max(r, 0.01)); mat.uniforms.uA.value = a; } };
  }

  /* ---------- Earth & Moon ---------- */
  let earthTex = null;
  function earthTexture() {
    if (earthTex) return earthTex;
    const cw = 2048, ch = 1024, c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.fillStyle = '#143042'; g.fillRect(0, 0, cw, ch);
    const X = (lon) => (lon + 180) / 360 * cw, Y = (lat) => (90 - lat) / 180 * ch;
    g.fillStyle = '#a3b8b0';
    for (const ring of window.LAND_RINGS) {
      g.beginPath();
      ring.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
      g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(237,240,233,0.12)'; g.lineWidth = 1.5;
    for (let lon = -180; lon <= 180; lon += 15) { g.beginPath(); g.moveTo(X(lon), 0); g.lineTo(X(lon), ch); g.stroke(); }
    for (let lat = -75; lat <= 75; lat += 15) { g.beginPath(); g.moveTo(0, Y(lat)); g.lineTo(cw, Y(lat)); g.stroke(); }
    earthTex = new THREE.CanvasTexture(c); earthTex.anisotropy = 4;
    return earthTex;
  }
  // yaw that brings longitude `lon` (degrees) to face world direction `dir` (projected on the equatorial plane)
  function earthYawFor(lon, dir) {
    const phi = (lon + 180) / 360 * Math.PI * 2;
    return Math.atan2(dir.x, dir.z) - Math.atan2(-Math.cos(phi), Math.sin(phi));
  }
  function earth(opts = {}) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: earthTexture() }, uSun: { value: v3(opts.sun || [0.92, -0.05, 0.38]).normalize() },
        uCenter: { value: new THREE.Vector3() }, uDir: { value: v3(opts.waveDir || [0, 0, -1]).normalize() }, uWave: { value: -100 }, uBoost: { value: 0 },
        uNight: { value: opts.night ?? 0.16 }, uAmbient: { value: opts.ambient ?? 0 },
      },
      vertexShader: `varying vec2 vUv;varying vec3 vN;varying vec3 vP;varying vec3 vV;
        void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.0);vP=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);
        vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
      fragmentShader: `uniform sampler2D uMap;uniform vec3 uSun;uniform vec3 uCenter;uniform vec3 uDir;uniform float uWave;uniform float uBoost;uniform float uNight;uniform float uAmbient;
        varying vec2 vUv;varying vec3 vN;varying vec3 vP;varying vec3 vV;
        void main(){vec3 n=normalize(vN);vec3 base=texture2D(uMap,vUv).rgb;
        float day=max(smoothstep(-0.10,0.50,dot(n,uSun)),uAmbient);
        vec3 col=mix(base*uNight+vec3(0.006,0.012,0.02),base*0.95,day);
        float behind=uWave-dot(vP-uCenter,uDir);
        float lit=smoothstep(0.0,0.5,behind);
        float face=max(dot(n,-uDir),0.0);
        col+=vec3(0.93,0.95,0.92)*lit*face*(0.14+0.9*uBoost);
        float f=1.0-max(dot(n,normalize(vV)),0.0);
        col+=vec3(0.50,0.70,0.82)*pow(f,3.0)*(0.18+0.70*day);
        gl_FragColor=vec4(col,1.0);}`,
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat);
    body.rotation.order = 'ZYX'; body.rotation.z = opts.tilt ?? 0.32;
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: { uSun: mat.uniforms.uSun, uDir: mat.uniforms.uDir, uFlash: { value: 0 }, uA: { value: 1 } },
      side: THREE.BackSide, ...additive,
      vertexShader: LIMB_VERT,
      fragmentShader: `uniform vec3 uSun;uniform vec3 uDir;uniform float uFlash;uniform float uA;varying vec3 vN;varying vec3 vV;
        void main(){vec3 n=normalize(vN);float f=clamp(dot(-n,normalize(vV)),0.0,1.0);float a=pow(clamp(f*2.9,0.0,1.0),2.0);
        float day=0.22+0.78*smoothstep(-0.3,0.6,dot(n,uSun));float sn=max(dot(n,-uDir),0.0);
        gl_FragColor=vec4((vec3(0.45,0.66,0.80)*day*0.8+vec3(0.92,0.95,0.93)*uFlash*(0.45+1.6*sn))*a*uA,1.0);}`,
    });
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 96, 64), atmoMat);
    const group = new THREE.Group(); group.add(body, atmo);
    return {
      group, body, atmo, material: mat,
      set(o) {
        if (o.yaw !== undefined) body.rotation.y = o.yaw;
        group.updateMatrixWorld();
        mat.uniforms.uCenter.value.setFromMatrixPosition(group.matrixWorld);
        if (o.wave !== undefined) mat.uniforms.uWave.value = o.wave;
        if (o.boost !== undefined) mat.uniforms.uBoost.value = o.boost;
        if (o.flash !== undefined) atmoMat.uniforms.uFlash.value = o.flash;
        if (o.sun) mat.uniforms.uSun.value.set(o.sun[0], o.sun[1], o.sun[2]).normalize();
      },
    };
  }
  function moon(opts = {}) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: v3(opts.sun || [0.92, -0.05, 0.38]).normalize() } },
      vertexShader: LIMB_VERT,
      fragmentShader: NOISE + `uniform vec3 uSun;varying vec3 vN;varying vec3 vO;varying vec3 vV;
        void main(){vec3 n=normalize(vN);vec3 p=normalize(vO);
        float maria=smoothstep(0.05,0.35,fbm3(p*2.2+vec3(4.0)));float crater=snoise(p*14.0)*0.5+0.5;
        vec3 base=mix(vec3(0.62,0.63,0.62),vec3(0.36,0.38,0.40),maria)*(0.9+0.15*crater);
        float d=smoothstep(-0.05,0.35,dot(n,uSun));
        gl_FragColor=vec4(base*(0.03+0.97*d),1.0);}`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat);
    return { mesh, material: mat };
  }

  /* ---------- particles ---------- */
  // faint points that flare as a spherical (mode 0) or planar (mode 1) front sweeps through them
  function echoDust(opts) {
    const r = rng(opts.seed || 4242), pos = [], size = [];
    let guard = 0;
    while (pos.length < opts.count * 3 && guard++ < opts.count * 60) {
      const p = opts.place(r); if (!p) continue;
      pos.push(p.x, p.y, p.z); size.push(0.5 + r() * 1.5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uFront: { value: -100 }, uOn: { value: 0 }, uCenter: { value: v3(opts.center || [0, 0, 0]) }, uDir: { value: v3(opts.dir || [0, 0, 1]).normalize() },
        uMode: { value: opts.mode || 0 }, uWidth: { value: opts.width || 0.75 }, uBase: { value: opts.base ?? 0.07 }, uScale: { value: opts.sizeScale || 120 },
        uAfter: { value: opts.after ?? 0.08 }, uMax: { value: opts.maxSize || 6 } },
      ...additive,
      vertexShader: `attribute float aSize;uniform float uFront;uniform float uOn;uniform vec3 uCenter;uniform vec3 uDir;uniform float uMode;uniform float uWidth;
        uniform float uBase;uniform float uScale;uniform float uAfter;uniform float uMax;varying float vA;varying float vE;
        void main(){vec4 wp=modelMatrix*vec4(position,1.0);
        float r=uMode<0.5?length(wp.xyz-uCenter):dot(wp.xyz-uCenter,uDir);
        float e=uOn*exp(-pow((r-uFront)/uWidth,2.0));float after=uOn*step(r,uFront)*uAfter*exp(-(uFront-r)/(uWidth*4.0));
        vec4 mv=viewMatrix*wp;gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(aSize*uScale/max(-mv.z,0.1)*(1.0+0.8*e),1.0,uMax);vA=uBase+1.1*e+after;vE=e;}`,
      fragmentShader: `varying float vA;varying float vE;void main(){float d=length(gl_PointCoord-0.5)*2.0;float a=smoothstep(1.0,0.0,d);
        vec3 c=mix(vec3(0.55,0.66,0.72),vec3(0.96,0.97,0.94),clamp(vE,0.0,1.0));gl_FragColor=vec4(c*a*vA,1.0);}`,
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
    pts.set = (front, on) => { mat.uniforms.uFront.value = front; mat.uniforms.uOn.value = on; };
    return pts;
  }

  /* screen-space glowing streaks (neutrino tracks): instanced ribbons with a bright head and a fading tail.
     Each streak: origin, dir, delay, speed, length. Head distance s = (t - t0 - delay) * speed, clipped to [minD, maxD]. */
  function streaks(list, opts = {}) {
    const N = list.length;
    const base = new THREE.InstancedBufferGeometry();
    const corners = new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]);
    base.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
    base.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    const ori = new Float32Array(N * 3), dir = new Float32Array(N * 3), misc = new Float32Array(N * 4);
    list.forEach((s, i) => {
      ori.set(s.o, i * 3); const d = v3(s.d).normalize(); dir.set([d.x, d.y, d.z], i * 3);
      misc.set([s.delay || 0, s.speed || 1, s.len || 1, s.max ?? 1e4], i * 4);
    });
    base.setAttribute('aO', new THREE.InstancedBufferAttribute(ori, 3));
    base.setAttribute('aD', new THREE.InstancedBufferAttribute(dir, 3));
    base.setAttribute('aM', new THREE.InstancedBufferAttribute(misc, 4));
    base.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uT0: { value: 0 }, uWidth: { value: opts.width || 5 }, uColor: { value: v3(opts.color || C.amber) },
        uA: { value: 1 }, uMin: { value: opts.min ?? 0 }, uLoop: { value: opts.loop || 0 }, uRes: { value: new THREE.Vector2(W, H) },
        uHead: { value: opts.head ?? 1.0 } },
      ...additive,
      vertexShader: `attribute vec2 corner;attribute vec3 aO;attribute vec3 aD;attribute vec4 aM;
        uniform float uTime;uniform float uT0;uniform float uWidth;uniform float uA;uniform float uMin;uniform float uLoop;uniform vec2 uRes;
        varying float vU;varying float vV;varying float vA;
        void main(){
          float s=(uTime-uT0-aM.x)*aM.y;
          if(uLoop>0.0)s=mod(s,uLoop);
          float head=min(s,aM.w);float tail=max(s-aM.z,uMin);
          float vis=step(uMin,s)*step(tail,head-1e-4)*step(0.0,uTime-uT0-aM.x);
          vec3 pH=aO+aD*head;vec3 pT=aO+aD*tail;
          vec4 cH=projectionMatrix*modelViewMatrix*vec4(pH,1.0);vec4 cT=projectionMatrix*modelViewMatrix*vec4(pT,1.0);
          if(cH.w<0.05||cT.w<0.05){gl_Position=vec4(2.0,2.0,2.0,1.0);vA=0.0;return;}
          vec2 sH=cH.xy/cH.w*uRes*0.5;vec2 sT=cT.xy/cT.w*uRes*0.5;
          vec2 d=sH-sT;float L=length(d);vec2 ds=L>1e-3?d/L:vec2(1.0,0.0);vec2 nrm=vec2(-ds.y,ds.x);
          float w=uWidth*mix(0.25,1.0,corner.x);
          vec4 c=mix(cT,cH,corner.x);
          vec2 sp=mix(sT,sH,corner.x)+nrm*corner.y*w+ds*(corner.x*2.0-1.0)*w*0.8;
          c.xy=sp/(uRes*0.5)*c.w;
          gl_Position=c;vU=corner.x;vV=corner.y;
          float fadeEnd=1.0-smoothstep(aM.w-aM.z*0.6,aM.w,s-aM.z*0.2);
          vA=vis*uA*fadeEnd;
        }`,
      fragmentShader: `uniform vec3 uColor;uniform float uHead;varying float vU;varying float vV;varying float vA;
        void main(){float across=1.0-vV*vV;float a=pow(vU,1.8)*across*across;
        float head=smoothstep(0.82,1.0,vU)*across*uHead;
        gl_FragColor=vec4((uColor*a+vec3(1.0,0.96,0.88)*head*0.9)*vA,1.0);}`,
    });
    const mesh = new THREE.Mesh(base, mat); mesh.frustumCulled = false;
    mesh.set = (t, t0 = 0, a = 1) => { mat.uniforms.uTime.value = t; mat.uniforms.uT0.value = t0; mat.uniforms.uA.value = a; mesh.visible = a > 0.001; };
    return mesh;
  }

  /* thin anti-aliased screen-space polyline with draw-on progress (constellations, orbits, strings, arrows) */
  function polyline(points, opts = {}) {
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) segs.push([points[i], points[i + 1], i / (points.length - 1), (i + 1) / (points.length - 1)]);
    if (opts.closed) segs.push([points[points.length - 1], points[0], (points.length - 1) / points.length, 1]);
    const N = segs.length, base = new THREE.InstancedBufferGeometry();
    base.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]), 2));
    base.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    const A = new Float32Array(N * 3), B = new Float32Array(N * 3), U = new Float32Array(N * 2);
    segs.forEach((s, i) => { A.set([s[0].x, s[0].y, s[0].z], i * 3); B.set([s[1].x, s[1].y, s[1].z], i * 3); U.set([s[2], s[3]], i * 2); });
    base.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 3));
    base.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 3));
    base.setAttribute('aU', new THREE.InstancedBufferAttribute(U, 2));
    base.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uWidth: { value: opts.width || 1.6 }, uColor: { value: v3(opts.color || C.ice) }, uA: { value: 1 }, uDraw: { value: 1 }, uRes: { value: new THREE.Vector2(W, H) },
        uDash: { value: opts.dash || 0 } },
      ...additive, depthTest: opts.depthTest ?? true,
      vertexShader: `attribute vec2 corner;attribute vec3 aA;attribute vec3 aB;attribute vec2 aU;uniform float uWidth;uniform vec2 uRes;uniform float uDraw;
        varying float vV;varying float vU;varying float vOn;
        void main(){
          float u1=min(aU.y,uDraw);float k=clamp((u1-aU.x)/max(aU.y-aU.x,1e-5),0.0,1.0);
          vec3 b=mix(aA,aB,k);
          vec4 ca=projectionMatrix*modelViewMatrix*vec4(aA,1.0);vec4 cb=projectionMatrix*modelViewMatrix*vec4(b,1.0);
          if(ca.w<0.02||cb.w<0.02||uDraw<=aU.x){gl_Position=vec4(2.0,2.0,2.0,1.0);vOn=0.0;return;}
          vec2 sa=ca.xy/ca.w*uRes*0.5;vec2 sb=cb.xy/cb.w*uRes*0.5;vec2 d=sb-sa;float L=length(d);vec2 ds=L>1e-3?d/L:vec2(1.0,0.0);vec2 n=vec2(-ds.y,ds.x);
          vec4 c=mix(ca,cb,corner.x);vec2 sp=mix(sa,sb,corner.x)+n*corner.y*(uWidth+1.0)+ds*(corner.x*2.0-1.0)*0.5;
          c.xy=sp/(uRes*0.5)*c.w;gl_Position=c;vV=corner.y;vU=mix(aU.x,u1,corner.x);vOn=1.0;}`,
      fragmentShader: `uniform vec3 uColor;uniform float uA;uniform float uWidth;uniform float uDash;varying float vV;varying float vU;varying float vOn;
        void main(){float edge=1.0-smoothstep(uWidth/(uWidth+1.0)-0.15,1.0,abs(vV));
        float dash=uDash>0.0?step(0.45,fract(vU*uDash)):1.0;
        gl_FragColor=vec4(uColor*edge*uA*vOn*dash,1.0);}`,
    });
    const mesh = new THREE.Mesh(base, mat); mesh.frustumCulled = false;
    mesh.set = (a, draw = 1, color) => { mat.uniforms.uA.value = a; mat.uniforms.uDraw.value = draw; mesh.visible = a > 0.001 && draw > 0; if (color) mat.uniforms.uColor.value.set(color[0], color[1], color[2]); };
    return mesh;
  }
  // disjoint segments with their own draw window: [{a:Vector3, b:Vector3, u0, u1}], drawn when uDraw passes u0..u1
  function segLines(segs, opts = {}) {
    const pts = [];
    const N = segs.length, base = new THREE.InstancedBufferGeometry();
    base.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]), 2));
    base.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    const A = new Float32Array(N * 3), B = new Float32Array(N * 3), U = new Float32Array(N * 2), K = new Float32Array(N);
    segs.forEach((s, i) => { A.set([s.a.x, s.a.y, s.a.z], i * 3); B.set([s.b.x, s.b.y, s.b.z], i * 3); U.set([s.u0, s.u1], i * 2); K[i] = s.k ?? 1; });
    base.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 3));
    base.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 3));
    base.setAttribute('aU', new THREE.InstancedBufferAttribute(U, 2));
    base.setAttribute('aK', new THREE.InstancedBufferAttribute(K, 1));
    base.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uWidth: { value: opts.width || 1.4 }, uColor: { value: v3(opts.color || C.ice) }, uA: { value: 1 }, uDraw: { value: 1 }, uFade: { value: opts.fade ?? 0 },
        uRes: { value: new THREE.Vector2(W, H) } },
      ...additive, depthTest: opts.depthTest ?? true,
      vertexShader: `attribute vec2 corner;attribute vec3 aA;attribute vec3 aB;attribute vec2 aU;attribute float aK;uniform float uWidth;uniform vec2 uRes;uniform float uDraw;uniform float uFade;
        varying float vV;varying float vOn;
        void main(){
          float k=clamp((uDraw-aU.x)/max(aU.y-aU.x,1e-5),0.0,1.0);
          vec3 b=mix(aA,aB,k);
          vec4 ca=projectionMatrix*modelViewMatrix*vec4(aA,1.0);vec4 cb=projectionMatrix*modelViewMatrix*vec4(b,1.0);
          if(ca.w<0.02||cb.w<0.02||uDraw<=aU.x){gl_Position=vec4(2.0,2.0,2.0,1.0);vOn=0.0;return;}
          vec2 sa=ca.xy/ca.w*uRes*0.5;vec2 sb=cb.xy/cb.w*uRes*0.5;vec2 d=sb-sa;float L=length(d);vec2 ds=L>1e-3?d/L:vec2(1.0,0.0);vec2 n=vec2(-ds.y,ds.x);
          vec4 c=mix(ca,cb,corner.x);vec2 sp=mix(sa,sb,corner.x)+n*corner.y*(uWidth+1.0)+ds*(corner.x*2.0-1.0)*0.5;
          c.xy=sp/(uRes*0.5)*c.w;gl_Position=c;vV=corner.y;
          float age=uDraw-aU.y;vOn=aK*(uFade>0.0?mix(1.0,0.35,clamp(age/uFade,0.0,1.0)):1.0);}`,
      fragmentShader: `uniform vec3 uColor;uniform float uA;uniform float uWidth;varying float vV;varying float vOn;
        void main(){float edge=1.0-smoothstep(uWidth/(uWidth+1.0)-0.15,1.0,abs(vV));gl_FragColor=vec4(uColor*edge*uA*vOn,1.0);}`,
    });
    const mesh = new THREE.Mesh(base, mat); mesh.frustumCulled = false;
    mesh.set = (a, draw = 1) => { mat.uniforms.uA.value = a; mat.uniforms.uDraw.value = draw; mesh.visible = a > 0.001 && draw > 0; };
    return mesh;
  }
  // position on a unit sphere for latitude/longitude, matching SphereGeometry's uv mapping (the Earth texture)
  function latLon(lat, lon, r = 1) {
    const phi = (lon + 180) / 360 * Math.PI * 2, th = (90 - lat) * Math.PI / 180;
    return new THREE.Vector3(-Math.cos(phi) * Math.sin(th) * r, Math.cos(th) * r, Math.sin(phi) * Math.sin(th) * r);
  }
  function circlePoints(r, n = 160, plane = 'xz') {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2;
      pts.push(plane === 'xz' ? new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r) : new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return pts;
  }

  /* ---------- labels drawn on the 2D canvas after the 3D frame ---------- */
  const tmpV = new THREE.Vector3();
  function project(cam, p) {
    tmpV.copy(p).project(cam);
    return { x: (tmpV.x * 0.5 + 0.5) * W, y: (1 - (tmpV.y * 0.5 + 0.5)) * H, behind: tmpV.z > 1 };
  }
  function drawLabels(ctx, cam, labels) {
    for (const l of labels || []) {
      if (!(l.a > 0.005)) continue;
      let x = l.x, y = l.y;
      if (l.p) { const s = project(cam, l.p); if (s.behind) continue; x = s.x + (l.dx || 0); y = s.y + (l.dy || 0); }
      ctx.save();
      ctx.globalAlpha = clamp(l.a);
      ctx.font = `${l.weight || 600} ${l.size || 44}px "Be Vietnam Pro"`;
      ctx.textAlign = l.align || 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(9,23,38,.7)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.strokeStyle = 'rgba(9,23,38,.85)'; ctx.lineWidth = Math.max(2, (l.size || 44) * 0.06);
      ctx.strokeText(l.text, x, y);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = l.color || '#edf0e9';
      ctx.fillText(l.text, x, y);
      if (l.tick) { ctx.strokeStyle = l.color || '#edf0e9'; ctx.globalAlpha = clamp(l.a) * 0.8; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(l.tick[0], l.tick[1]); ctx.lineTo(l.tick[2], l.tick[3]); ctx.stroke(); }
      ctx.restore();
    }
  }
  function overlay(ctx, o) {
    if (o.flash > 0.002) {
      const g = ctx.createRadialGradient(540, 806, 0, 540, 806, 1300);
      g.addColorStop(0, `rgba(255,251,242,${o.flash})`); g.addColorStop(0.38, `rgba(255,244,226,${o.flash * 0.7})`); g.addColorStop(0.8, `rgba(237,240,233,${o.flash * 0.2})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (o.wash > 0.002) {
      const g = ctx.createRadialGradient(540, 806, 0, 540, 806, 1250);
      g.addColorStop(0, `rgba(232,240,242,${o.wash * 0.95})`); g.addColorStop(0.55, `rgba(205,222,230,${o.wash * 0.55})`); g.addColorStop(1, `rgba(184,212,223,${o.wash * 0.25})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (o.dark > 0.002) { ctx.fillStyle = `rgba(10,19,27,${o.dark})`; ctx.fillRect(0, 0, W, H); }
  }

  /* ---------- the shared renderer and scene registry ---------- */
  let R = null;
  function renderer() {
    if (R) return R;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    R = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    R.setPixelRatio(1); R.setSize(W, H, false); R.outputColorSpace = THREE.LinearSRGBColorSpace; R.setClearColor(0x0a131b, 1);
    return R;
  }
  const registry = {};
  function define(kind, factory) { registry[kind] = factory; }
  function mount(canvas, kind, D, cues) {
    const ctx = canvas.getContext('2d');
    if (!registry[kind]) throw new Error('Unknown 3D scene ' + kind);
    const shot = registry[kind]({ D, cues: cues || {}, W, H });
    return function draw(t) {
      const r = renderer();
      const frame = shot.update(t) || {};
      const scene = frame.scene || shot.scene, cam = frame.camera || shot.camera;
      r.setClearColor(frame.clear ?? 0x0a131b, 1);
      r.render(scene, cam);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(r.domElement, 0, 0);
      if (frame.draw2d) frame.draw2d(ctx);
      if (frame.labels) drawLabels(ctx, cam, frame.labels);
      overlay(ctx, frame);
    };
  }

  return {
    W, H, C, clamp, ramp, smooth, smoother, bump, lerp, expoOut, v3, rng, randomDir, cloudField, NOISE, LIMB_VERT, additive,
    CUT_GLSL, CUT_TEST, cutUniforms, shareCut,
    camera, track, rig, sky, starfield, backdrop, glow, starBody, remnant, lightFront, earthTexture, earthYawFor, earth, moon,
    echoDust, streaks, polyline, segLines, latLon, circlePoints, project, drawLabels, define, mount, renderer,
  };
})();
