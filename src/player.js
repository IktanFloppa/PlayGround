import * as THREE from 'three';

const skinMat = new THREE.MeshStandardMaterial({ color: 0xc39368, roughness: 0.8, flatShading: true });
const shirtMat = new THREE.MeshStandardMaterial({ color: 0x6f7450, roughness: 0.95, flatShading: true });
const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3f4247, roughness: 0.95, flatShading: true });
const leatherMat = new THREE.MeshStandardMaterial({ color: 0x5a3c24, roughness: 0.9, flatShading: true });
const hairMat = new THREE.MeshStandardMaterial({ color: 0x2e241b, roughness: 0.95, flatShading: true });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8b80, roughness: 0.95, flatShading: true });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a532f, roughness: 0.95, flatShading: true });
const flintMat = new THREE.MeshStandardMaterial({ color: 0x4b4a44, roughness: 0.7, flatShading: true });

function box(parent, mat, size, pos, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function makeTool(kind) {
  const g = new THREE.Group();
  if (kind === 'pick' || kind === 'hatchet') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.92, 6), woodMat);
    handle.position.y = 0.1;
    handle.castShadow = true;
    g.add(handle);
    if (kind === 'pick') {
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 5), stoneMat);
      head.rotation.z = Math.PI / 2;
      head.position.set(0, 0.55, 0);
      head.castShadow = true;
      g.add(head);
      const head2 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), stoneMat);
      head2.rotation.z = -Math.PI / 2;
      head2.position.set(0, 0.55, 0);
      head2.castShadow = true;
      g.add(head2);
    } else {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.07), stoneMat);
      blade.position.set(0.12, 0.55, 0);
      blade.rotation.z = -0.18;
      blade.castShadow = true;
      g.add(blade);
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 4, 8), leatherMat);
      wrap.rotation.x = Math.PI / 2;
      wrap.position.y = 0.4;
      g.add(wrap);
    }
    g.position.set(0, -0.5, 0.02);
    g.rotation.x = 0.35;
    g.rotation.z = -0.1;
  } else if (kind === 'spear') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.026, 1.75, 6), woodMat);
    shaft.position.y = 0.35;
    shaft.castShadow = true;
    g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 5), flintMat);
    tip.position.y = 1.34;
    tip.castShadow = true;
    g.add(tip);
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 4, 8), leatherMat);
    lash.rotation.x = Math.PI / 2;
    lash.position.y = 1.16;
    g.add(lash);
    g.position.set(0, -0.45, 0.04);
    g.rotation.x = 0.08;
  }
  return g;
}

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.group.position.set(0, 2, 0);
    scene.add(this.group);

    this.body = new THREE.Group();
    this.group.add(this.body);

    // hips / torso
    box(this.body, pantsMat, [0.34, 0.2, 0.24], [0, 0.92, 0]);
    box(this.body, shirtMat, [0.46, 0.56, 0.28], [0, 1.3, 0]);
    box(this.body, shirtMat, [0.52, 0.16, 0.3], [0, 1.55, 0]);
    // belt
    box(this.body, leatherMat, [0.36, 0.09, 0.26], [0, 1.02, 0]);
    // chest strap
    box(this.body, leatherMat, [0.1, 0.62, 0.03], [0.12, 1.3, 0.15], [0, 0, -0.55]);
    // backpack
    box(this.body, leatherMat, [0.38, 0.42, 0.18], [0, 1.34, -0.23]);
    box(this.body, new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1, flatShading: true }), [0.3, 0.12, 0.1], [0, 1.52, -0.28]);
    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 6), skinMat);
    neck.position.set(0, 1.66, 0);
    this.body.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skinMat);
    head.scale.set(0.95, 1.04, 0.92);
    head.position.set(0, 1.85, 0.01);
    head.castShadow = true;
    this.body.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 8, 6), hairMat);
    hair.scale.set(1, 0.72, 1.02);
    hair.position.set(0, 1.94, -0.02);
    this.body.add(hair);
    box(this.body, hairMat, [0.16, 0.2, 0.1], [0, 1.83, -0.14]);
    // eyes
    const eyeGeo = new THREE.SphereGeometry(0.018, 5, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x17130f });
    for (const x of [0.075, -0.075]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(x, 1.86, 0.195);
      this.body.add(e);
    }
    // arms
    this.armL = new THREE.Group();
    this.armL.position.set(-0.3, 1.55, 0);
    this.body.add(this.armL);
    box(this.armL, shirtMat, [0.13, 0.44, 0.14], [0, -0.22, 0]);
    box(this.armL, skinMat, [0.11, 0.16, 0.12], [0, -0.5, 0]);
    this.armR = new THREE.Group();
    this.armR.position.set(0.3, 1.55, 0);
    this.body.add(this.armR);
    box(this.armR, shirtMat, [0.13, 0.44, 0.14], [0, -0.22, 0]);
    box(this.armR, skinMat, [0.11, 0.16, 0.12], [0, -0.5, 0]);
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.55, 0.02);
    this.armR.add(this.hand);
    this.tools = {};
    this.currentTool = null;

    // legs
    this.legL = new THREE.Group();
    this.legL.position.set(-0.14, 0.86, 0);
    this.body.add(this.legL);
    box(this.legL, pantsMat, [0.17, 0.5, 0.19], [0, -0.26, 0]);
    box(this.legL, pantsMat, [0.15, 0.34, 0.16], [0, -0.64, 0]);
    box(this.legL, leatherMat, [0.16, 0.12, 0.28], [0, -0.82, 0.04]);
    this.legR = new THREE.Group();
    this.legR.position.set(0.14, 0.86, 0);
    this.body.add(this.legR);
    box(this.legR, pantsMat, [0.17, 0.5, 0.19], [0, -0.26, 0]);
    box(this.legR, pantsMat, [0.15, 0.34, 0.16], [0, -0.64, 0]);
    box(this.legR, leatherMat, [0.16, 0.12, 0.28], [0, -0.82, 0.04]);

    // simple shoulder pad
    box(this.body, leatherMat, [0.2, 0.1, 0.24], [-0.27, 1.58, 0], [0, 0, 0.15]);

    this.walkPhase = 0;
    this.attackAnim = 0;
    this.bob = 0;
    this.riding = false;
    this.setTool('hand');
  }

  setTool(kind) {
    this.currentTool = kind;
    for (const key in this.tools) this.tools[key].visible = false;
    if (!kind || kind === 'hand') return;
    if (!this.tools[kind]) {
      const tool = makeTool(kind);
      this.tools[kind] = tool;
      this.hand.add(tool);
    }
    this.tools[kind].visible = true;
  }

  attack() {
    this.attackAnim = 1;
  }

  animate(dt, speed, moving) {
    const t = (this.walkPhase += dt * (2.2 + speed * 1.5));
    const swing = moving ? Math.min(0.72, 0.22 + speed * 0.09) : 0;
    this.legL.rotation.x = Math.sin(t) * swing;
    this.legR.rotation.x = -Math.sin(t) * swing;
    const armSwing = Math.sin(t) * swing * 0.8;
    this.armL.rotation.x = -armSwing;
    this.armL.rotation.z = 0.08;
    this.armR.rotation.x = armSwing - this.getAttackSwing();
    this.armR.rotation.z = -0.08;
    this.body.position.y = Math.abs(Math.sin(t)) * 0.035 * (moving ? 1 : 0.3);
    this.body.rotation.y = Math.sin(t) * 0.02 * (moving ? 1 : 0.2);
    this.attackAnim = Math.max(0, this.attackAnim - dt * 3.4);
    // idle breathing
    if (!moving) this.body.position.y += Math.sin(performance.now() * 0.002) * 0.008;
  }

  getAttackSwing() {
    if (this.attackAnim <= 0) return 0;
    const p = 1 - this.attackAnim;
    return Math.sin(p * Math.PI) * 2.1;
  }

  setRiding(on) {
    this.riding = on;
    this.group.visible = !on;
  }
}
