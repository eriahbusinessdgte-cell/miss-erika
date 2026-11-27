"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";

export type OfficeAgent = { id: string; name: string; working: boolean };

// Desk slots in order: three at the back row, then three at the front row.
const SLOTS: [number, number][] = [[-5.2, -2.4], [-1.6, -2.4], [2.0, -2.4], [-5.2, 1.6], [-1.6, 1.6], [2.0, 1.6]];
export const MAX_AGENTS = SLOTS.length;

function noiseTexture(base: string, speck: string, size: number, count: number, line?: string) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) { g.fillStyle = speck; g.globalAlpha = Math.random() * 0.25; g.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  g.globalAlpha = 1;
  if (line) { g.strokeStyle = line; for (let y = 0; y < size; y += 6) { g.globalAlpha = 0.12 + Math.random() * 0.1; g.beginPath(); g.moveTo(0, y); g.lineTo(size, y + Math.random() * 3); g.stroke(); } }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function box(w: number, h: number, d: number, mat: unknown, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** The 3D office. Draws one desk per agent; working agents get a robot and a green light. Labels float over each desk. */
export default function OfficeScene({ agents }: { agents: OfficeAgent[] }) {
  const mount = useRef<HTMLDivElement>(null);
  const labelEls = useRef<(HTMLDivElement | null)[]>([]);
  const api = useRef<{ setAgents: (a: OfficeAgent[]) => void } | null>(null);
  const latest = useRef(agents);
  latest.current = agents;

  useEffect(() => {
    const el = mount.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14171c);
    scene.fog = new THREE.Fog(0x14171c, 18, 34);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    camera.position.set(0, 7.5, 12.5);
    camera.lookAt(0, 0.6, -0.8);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    // Lights: one directional light with soft shadows, hemisphere fill.
    scene.add(new THREE.HemisphereLight(0xcfd8e6, 0x2a2d33, 0.65));
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.9);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 40 });
    sun.shadow.radius = 4; sun.shadow.bias = -0.0004;
    scene.add(sun);

    const concrete = noiseTexture("#8a8d90", "#5d6064", 512, 2500); concrete.repeat.set(5, 4);
    const woodTex = noiseTexture("#a9774a", "#5b3a1e", 256, 600, "#6b4526");
    const mats = {
      floor: new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.92 }),
      wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.8, roughness: 0.4 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.9, roughness: 0.35 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xaed6ee, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1 }),
      screen: new THREE.MeshStandardMaterial({ color: 0x0b1620, emissive: 0x1d6fa8, emissiveIntensity: 0.55, roughness: 0.3 }),
      chair: new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.8 }),
      robot: new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.35, metalness: 0.1 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.15, metalness: 0.6 }),
      sofa: new THREE.MeshStandardMaterial({ color: 0x4a5a6b, roughness: 0.9 }),
      pot: new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.8 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.8 }),
    };

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), mats.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);

    // Glass wall at the back with steel frames
    const wall = new THREE.Group();
    wall.add(new THREE.Mesh(new THREE.BoxGeometry(24, 4.2, 0.06), mats.glass));
    wall.children[0].position.y = 2.1;
    for (let i = -12; i <= 12; i += 4) wall.add(box(0.12, 4.3, 0.14, mats.steel, i, 2.15, 0));
    wall.add(box(24.2, 0.14, 0.14, mats.steel, 0, 4.25, 0), box(24.2, 0.14, 0.14, mats.steel, 0, 0.07, 0), box(24.2, 0.1, 0.12, mats.steel, 0, 2.2, 0));
    wall.position.set(0, 0, -6.2);
    scene.add(wall);

    // Decoration: meeting table, sofa, plant
    const decor = new THREE.Group();
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 40), mats.wood);
    table.position.set(6.2, 0.78, -2.6); table.castShadow = table.receiveShadow = true;
    const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.75, 16), mats.metal);
    tleg.position.set(6.2, 0.38, -2.6); tleg.castShadow = true;
    decor.add(table, tleg);
    decor.add(box(3.2, 0.45, 1.1, mats.sofa, 6.2, 0.25, 3.4), box(3.2, 0.7, 0.28, mats.sofa, 6.2, 0.7, 3.85), box(0.28, 0.6, 1.1, mats.sofa, 4.7, 0.5, 3.4), box(0.28, 0.6, 1.1, mats.sofa, 7.7, 0.5, 3.4));
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 20), mats.pot);
    pot.position.set(-9.8, 0.3, -5.2); pot.castShadow = true;
    decor.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.42 - i * 0.04, 14, 10), mats.leaf);
      leaf.position.set(-9.8 + Math.sin(i * 2.4) * 0.25, 0.95 + i * 0.3, -5.2 + Math.cos(i * 2.4) * 0.25); leaf.castShadow = true;
      decor.add(leaf);
    }
    scene.add(decor);

    // Desks, rebuilt whenever the agent list changes
    const deskGroup = new THREE.Group();
    scene.add(deskGroup);
    let robots: { position: { y: number }; rotation: { y: number }; userData: { phase: number } }[] = [];
    let current: OfficeAgent[] = [];
    const disposables: { dispose: () => void }[] = [];

    function buildDesk(a: OfficeAgent, x: number, z: number) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.add(box(2.6, 0.08, 1.2, mats.wood, 0, 0.78, 0));
      for (const [lx, lz] of [[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]]) g.add(box(0.07, 0.76, 0.07, mats.metal, lx, 0.38, lz));
      // Monitor: screen faces the chair (toward -z)
      g.add(box(0.12, 0.3, 0.12, mats.metal, 0, 0.97, 0.15), box(0.95, 0.55, 0.05, mats.metal, 0, 1.4, 0.15));
      const scr = box(0.88, 0.48, 0.02, mats.screen, 0, 1.4, 0.115); scr.castShadow = false;
      g.add(scr);
      // Chair on the -z side, facing the camera
      g.add(box(0.7, 0.08, 0.7, mats.chair, 0, 0.5, -1.05), box(0.7, 0.75, 0.08, mats.chair, 0, 0.9, -1.4), box(0.06, 0.5, 0.06, mats.metal, 0, 0.25, -1.05), box(0.6, 0.05, 0.05, mats.metal, 0, 0.03, -1.05));
      // Status light
      const lightMat = new THREE.MeshStandardMaterial({ color: a.working ? 0x35d36b : 0x7b8087, emissive: a.working ? 0x35d36b : 0x000000, emissiveIntensity: a.working ? 1.1 : 0 });
      disposables.push(lightMat);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), lightMat);
      light.position.set(1.05, 0.86, -0.4);
      g.add(light);
      if (a.working) {
        const r = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.6, 20), mats.robot); body.position.y = 0.3;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 18), mats.robot); head.position.y = 0.78;
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.12), mats.visor); visor.position.set(0, 0.8, 0.2);
        for (const m of [body, head, visor]) m.castShadow = true;
        r.add(body, head, visor);
        for (const sx of [-0.3, 0.3]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 10), mats.robot); arm.position.set(sx, 0.4, 0.1); arm.rotation.x = 0.9; arm.castShadow = true; r.add(arm); }
        r.position.set(0, 0.58, -1.05);
        r.userData.phase = x;
        g.add(r); robots.push(r);
      }
      deskGroup.add(g);
    }

    function setAgents(list: OfficeAgent[]) {
      current = list.slice(0, MAX_AGENTS);
      while (deskGroup.children.length) deskGroup.remove(deskGroup.children[0]);
      disposables.splice(0).forEach((d) => d.dispose());
      robots = [];
      current.forEach((a, i) => buildDesk(a, SLOTS[i][0], SLOTS[i][1]));
    }
    api.current = { setAgents };
    setAgents(latest.current);

    function resize() {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const narrow = w / h < 1.2; // phones: pull the camera back so all six desks fit
      camera.fov = narrow ? 52 : 42;
      camera.position.set(0, narrow ? 9 : 7.5, narrow ? 15 : 12.5);
      camera.lookAt(0, 0.6, -0.8);
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const v = new THREE.Vector3();
    let raf = 0;
    const clock = new THREE.Clock();
    function frame() {
      raf = requestAnimationFrame(frame);
      const t = clock.getElapsedTime();
      robots.forEach((r) => { r.position.y = 0.58 + Math.sin(t * 3 + r.userData.phase) * 0.03; r.rotation.y = Math.sin(t * 0.8 + r.userData.phase) * 0.12; });
      // Project each desk's position onto the screen for its HTML label
      const w = el.clientWidth, h = el.clientHeight;
      current.forEach((_, i) => {
        const lab = labelEls.current[i];
        if (!lab) return;
        v.set(SLOTS[i][0], 2.35, SLOTS[i][1] - 0.9).project(camera);
        lab.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
        lab.style.opacity = v.z < 1 ? "1" : "0";
      });
      renderer.render(scene, camera);
    }
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      api.current = null;
      scene.traverse((o: { geometry?: { dispose: () => void } }) => o.geometry?.dispose());
      Object.values(mats).forEach((m) => (m as { dispose: () => void }).dispose());
      concrete.dispose(); woodTex.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { api.current?.setAgents(agents); }, [agents]);

  return (
    <div className="office-scene" ref={mount} role="img" aria-label="3D office with one desk per agent">
      {agents.slice(0, MAX_AGENTS).map((a, i) => (
        <div key={a.id} className="office-label" ref={(n) => { labelEls.current[i] = n; }}>
          <b>{a.name}</b>
          <span className={a.working ? "on" : "off"}>{a.working ? "Working" : "Stopped"}</span>
        </div>
      ))}
    </div>
  );
}
