/* The sign-in curtain. Loaded only on the sign-in screen, never for signed-in visits. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Group, Mesh,
  PlaneGeometry, BoxGeometry, CylinderGeometry, MeshStandardMaterial, DoubleSide, DynamicDrawUsage, MathUtils,
} from 'three';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const eInOut = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eDrop = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-5.2 * x) * Math.cos(11 * x);

/* Two layers: saffron behind, deep teal satin in front. amp is pleat depth, closed to gathered. */
const LAYERS = [
  { color: 0xe3a712, z: -.3, lag: .16, gather: .78, amp: [.1, .34] },
  { color: 0x14606a, z: 0, lag: .34, gather: .86, amp: [.16, .5] },
];

export function createCurtain() {
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let renderer, scene, camera, canvas, group, deco, meshes = [], raf = 0, last = 0, panelW = 1, yTop = 0, Hfull = 1, rt = 0;
  const state = { open: 0, drop: 1, time: 0 }, tweens = [];

  try {
    canvas = document.createElement('canvas');
    canvas.id = 'curtain'; canvas.setAttribute('aria-hidden', 'true');
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) { return null; }
  document.body.appendChild(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight, false);
  scene = new Scene();
  camera = new PerspectiveCamera(35, innerWidth / innerHeight, .1, 60); camera.position.set(0, 0, 10);
  scene.add(new HemisphereLight(0xffe9c4, 0x1a3a40, .62));
  const key = new DirectionalLight(0xfff4e0, 1.25); key.position.set(-5, 7, 7); scene.add(key);
  const fill = new DirectionalLight(0xffb067, .45); fill.position.set(7, -2, 4); scene.add(fill);
  group = new Group(); scene.add(group);

  function build() {
    meshes.forEach(m => { group.remove(m); m.geometry.dispose(); m.material.dispose(); }); meshes = [];
    if (deco) { group.remove(deco); deco.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }); }
    const ratio = Math.max(innerWidth, 1) / Math.max(innerHeight, 1); camera.aspect = ratio; camera.updateProjectionMatrix();
    const wh = 2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z, ww = wh * ratio;
    panelW = ww / 2 * 1.05; yTop = wh / 2 - .36; Hfull = wh + .36 + .6;
    const n = Math.max(3, Math.round(panelW / .62));
    LAYERS.forEach((L, li) => [-1, 1].forEach(side => {
      L.n = n;
      const sx = n * 16, sy = 48, g = new PlaneGeometry(1, 1, sx, sy), cnt = g.attributes.position.count;
      const xi = new Float32Array(cnt), tv = new Float32Array(cnt);
      for (let iy = 0; iy <= sy; iy++) for (let ix = 0; ix <= sx; ix++) { const i = iy * (sx + 1) + ix; xi[i] = ix / sx; tv[i] = iy / sy; }
      g.attributes.position.setUsage(DynamicDrawUsage);
      const m = new Mesh(g, new MeshStandardMaterial({ color: L.color, roughness: .5, metalness: .05, side: DoubleSide }));
      m.userData = { L, side, xi, tv }; m.renderOrder = li; m.frustumCulled = false; group.add(m); meshes.push(m);
    }));
    deco = new Group();
    const pelmet = new Mesh(new BoxGeometry(ww + 1, .54, .7), new MeshStandardMaterial({ color: 0x07272d, roughness: .6 }));
    pelmet.position.set(0, wh / 2 - .1, .2);
    const rod = new Mesh(new CylinderGeometry(.045, .045, ww + .8, 16), new MeshStandardMaterial({ color: 0xd9b45a, roughness: .25, metalness: .8 }));
    rod.rotation.z = Math.PI / 2; rod.position.set(0, wh / 2 - .4, .3);
    deco.add(pelmet, rod); group.add(deco);
  }

  function update() {
    const { open, drop, time } = state, e = eDrop(drop), ec = clamp(e);
    meshes.forEach(m => {
      const { L, side, xi, tv } = m.userData, pos = m.geometry.attributes.position;
      for (let i = 0; i < xi.length; i++) {
        const u = xi[i], t = tv[i], o = clamp(open * (1 + L.lag) - L.lag * t), c = 1 - o * L.gather;
        const x = side * (panelW * ((1 - c) + c * u) - .06 * (1 - o)), ph = u * L.n * 6.2832 + .6;
        const amp = (L.amp[0] + (L.amp[1] - L.amp[0]) * o) * (.8 + .35 * t) * (1 + .7 * (1 - ec));
        let z = L.z - side * .004 + amp * Math.sin(ph) + amp * .22 * Math.sin(ph * 2.3 + 1.1);
        z += o * (1 - o) * .35 * t * t + (1 - ec) * .16 * Math.sin(t * 9 - e * 14);
        const sway = Math.sin(time * 1.3 + u * 2 + side) * .018 * t * t * (1 - o * .6);
        pos.setXYZ(i, x + sway, yTop - t * Hfull * e + o * .16 * t, z);
      }
      pos.needsUpdate = true; m.geometry.computeVertexNormals();
    });
  }
  const draw = () => { update(); renderer.render(scene, camera); };

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now; state.time += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i], p = clamp((now - w.t0) / w.ms);
      state[w.key] = w.from + (w.to - w.from) * (w.ease ? w.ease(p) : p);
      if (p >= 1) { tweens.splice(i, 1); w.res(); }
    }
    draw();
    if (state.open >= .999 && !tweens.length) stop(false);
  }
  function start() { canvas.style.display = 'block'; if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop(hide) { cancelAnimationFrame(raf); raf = 0; if (hide) canvas.style.display = 'none'; }
  const tween = (key, to, ms, ease) => new Promise(res => {
    tweens.push({ key, from: state[key], to, ms: reduce ? 1 : ms, ease, t0: performance.now(), res }); start();
  });

  build();
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { renderer.setSize(innerWidth, innerHeight, false); build(); if (!raf && canvas.style.display === 'block') draw(); }, 120);
  });

  return {
    hide() { stop(true); },
    isClosed: () => state.open < .001 && state.drop >= .999 && canvas.style.display === 'block',
    drop() { state.open = 0; state.drop = 0; tweens.length = 0; return tween('drop', 1, 2000); },
    open(ms = 1800) { return tween('open', 1, ms, eInOut); },
    close(ms = 1300) { return tween('open', 0, ms, eInOut); },
    set(o) { tweens.length = 0; Object.assign(state, o); stop(false); canvas.style.display = 'block'; draw(); },
  };
}
