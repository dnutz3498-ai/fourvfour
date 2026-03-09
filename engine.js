// engine.js — Renderer, WeaponSystem, PlayerController, BotAI, MapBuilder
// UPGRADED: Fixed gun damage, melee weapons, smart bots, parkour-ready maps

// ─────────────────────────────────────────────
// RENDERER
// ─────────────────────────────────────────────
class Renderer {
  constructor(canvas) {
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false; // disabled by default, enabled by setQuality
    this.renderer.shadowMap.type = THREE.BasicShadowMap; // cheapest shadow type
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.05, 600);
    this.scene.add(this.camera);
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
  }
  clearScene() {
    const kids = [...this.scene.children];
    kids.forEach(c => {
      if (c === this.camera) return;
      this.scene.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose());
    });
    this.scene.fog = null; this.scene.background = null;
    // Clear cached textures and shop rings between maps
    if (MapBuilder._texCache) { Object.values(MapBuilder._texCache).forEach(t => t.dispose()); MapBuilder._texCache = {}; }
    MapBuilder._shopRings = [];
  }
  setQuality(q) {
    if (q === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
    } else if (q === 'medium') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }
  }
  render() { this.renderer.render(this.scene, this.camera); }
}

// ─────────────────────────────────────────────
// WEAPON SYSTEM — supports gun + melee + special
// ─────────────────────────────────────────────
class WeaponSystem {
  constructor(scene) {
    this.scene = scene;
    this.ammo = 30; this.reserve = 90;
    this.isReloading = false; this.reloadTimer = 0;
    this.lastShotTime = 0; this.recoilY = 0; this.recoilX = 0;
    this.stats = null; this.weaponId = null;
    this.flashes = []; this.viewMesh = null;
    // Minigun spin-up state
    this._spinUpTimer = 0; this._spinReady = false;
    // Burst state
    this._burstQueue = 0; this._burstTimer = 0;
  }

  equip(id) {
    const s = WEAPON_STATS[id] || WEAPON_STATS.assaultRifle;
    this.stats = s; this.weaponId = id;
    this.ammo = s.type === 'melee' ? 999 : s.magSize;
    this.reserve = s.type === 'melee' ? 999 : s.reserveAmmo;
    this.isReloading = false; this.recoilY = 0; this.recoilX = 0;
    this._spinUpTimer = 0; this._spinReady = false;
    this._burstQueue = 0; this._burstTimer = 0;
    this.viewMesh = this._buildViewmodel(id, s);
    return s;
  }

  isMelee() { return this.stats?.type === 'melee'; }

  _mat(col, emCol, ei = 0.3) {
    return new THREE.MeshStandardMaterial({ color: col, metalness: 0.85, roughness: 0.15,
      emissive: new THREE.Color(emCol || 0), emissiveIntensity: emCol ? ei : 0 });
  }

  _buildViewmodel(id, s) {
    const g = new THREE.Group();
    const bm = this._mat(s.color, 0);
    const am = this._mat(s.accentColor, s.accentColor, 0.45);
    if (s.type === 'melee') {
      if (id === 'katana') {
        // Blade
        g.add(this._m(new THREE.BoxGeometry(0.022, 0.022, 0.75), am, 0, 0, 0.18));
        g.add(this._m(new THREE.BoxGeometry(0.018, 0.018, 0.32), bm, 0, 0, -0.16));
        g.add(this._m(new THREE.BoxGeometry(0.12, 0.02, 0.02), bm, 0, 0, 0.01));
      } else if (id === 'hammerfist') {
        g.add(this._m(new THREE.BoxGeometry(0.14, 0.18, 0.14), am, 0, 0, 0));
        g.add(this._m(new THREE.BoxGeometry(0.06, 0.28, 0.06), bm, 0, 0, -0.2));
        for (let i = -1; i <= 1; i++) g.add(this._m(new THREE.BoxGeometry(0.022, 0.022, 0.06), am, i*0.04, 0.1, 0.1));
      } else { // energyBlade
        g.add(this._m(new THREE.BoxGeometry(0.016, 0.016, 0.55), am, 0, 0, 0.15));
        g.add(this._m(new THREE.BoxGeometry(0.04, 0.04, 0.18), bm, 0, 0, -0.1));
        const glow = new THREE.PointLight(s.accentColor, 2.5, 1.5);
        glow.position.set(0, 0, 0.4); g.add(glow);
      }
    } else if (id === 'sniperRifle') {
      g.add(this._m(new THREE.BoxGeometry(0.036, 0.05, 0.72), bm, 0, 0, 0));
      g.add(this._m(new THREE.CylinderGeometry(0.008, 0.01, 0.62, 8), bm, 0, 0.003, 0.67, [Math.PI/2,0,0]));
      g.add(this._m(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 12), am, 0, 0.048, 0.05, [Math.PI/2,0,0]));
      g.add(this._m(new THREE.BoxGeometry(0.03, 0.036, 0.2), bm, 0, -0.008, -0.42));
      g.add(this._m(new THREE.BoxGeometry(0.022, 0.055, 0.026), bm, 0, -0.052, -0.02));
    } else if (id === 'shotgun') {
      g.add(this._m(new THREE.BoxGeometry(0.062, 0.068, 0.52), bm, 0, 0, 0));
      g.add(this._m(new THREE.CylinderGeometry(0.02, 0.022, 0.44, 8), bm, 0, 0.004, 0.48, [Math.PI/2,0,0]));
      g.add(this._m(new THREE.BoxGeometry(0.048, 0.05, 0.14), am, 0, -0.01, 0.12));
      g.add(this._m(new THREE.BoxGeometry(0.048, 0.058, 0.2), bm, 0, -0.004, -0.32));
      g.add(this._m(new THREE.BoxGeometry(0.03, 0.062, 0.03), bm, 0, -0.058, -0.06));
    } else if (id === 'smg') {
      g.add(this._m(new THREE.BoxGeometry(0.048, 0.055, 0.3), bm, 0, 0, 0));
      g.add(this._m(new THREE.CylinderGeometry(0.008, 0.01, 0.2, 8), bm, 0, 0.004, 0.25, [Math.PI/2,0,0]));
      g.add(this._m(new THREE.BoxGeometry(0.018, 0.095, 0.022), am, 0, -0.078, 0.0));
      g.add(this._m(new THREE.BoxGeometry(0.022, 0.052, 0.026), bm, 0, -0.05, 0.02));
      g.add(this._m(new THREE.BoxGeometry(0.022, 0.032, 0.075), am, 0, 0.008, -0.19));
    } else if (id === 'pistol' || id === 'revolver') {
      g.add(this._m(new THREE.BoxGeometry(0.038, 0.052, 0.18), bm, 0, 0, 0));
      g.add(this._m(new THREE.CylinderGeometry(0.007, 0.009, 0.15, 8), bm, 0, 0.009, 0.165, [Math.PI/2,0,0]));
      g.add(this._m(new THREE.BoxGeometry(0.03, 0.072, 0.026), bm, 0, -0.06, -0.04));
      if (id === 'revolver') g.add(this._m(new THREE.CylinderGeometry(0.022, 0.022, 0.045, 6), am, 0, 0.005, -0.01, [Math.PI/2,0,0]));
    } else if (id === 'minigun') {
      g.add(this._m(new THREE.BoxGeometry(0.09, 0.07, 0.6), bm, 0, 0, 0.05));
      for (let i = 0; i < 6; i++) { const a = (i/6)*Math.PI*2, cx=Math.cos(a)*0.035, cy=Math.sin(a)*0.035; g.add(this._m(new THREE.CylinderGeometry(0.008,0.008,0.64,6),bm,cx,cy,0.04,[Math.PI/2,0,0])); }
      g.add(this._m(new THREE.BoxGeometry(0.07, 0.05, 0.35), am, 0, -0.03, -0.22));
    } else if (id === 'plasmaRifle') {
      g.add(this._m(new THREE.BoxGeometry(0.055, 0.065, 0.5), bm, 0, 0, 0));
      g.add(this._m(new THREE.CylinderGeometry(0.022, 0.025, 0.28, 8), am, 0, 0.005, 0.42, [Math.PI/2,0,0]));
      const glow = new THREE.PointLight(s.accentColor, 2, 1.8); glow.position.set(0, 0, 0.56); g.add(glow);
    } else if (id === 'railgun') {
      g.add(this._m(new THREE.BoxGeometry(0.04, 0.06, 0.85), bm, 0, 0, 0));
      g.add(this._m(new THREE.BoxGeometry(0.08, 0.01, 0.85), am, 0, 0.04, 0));
      g.add(this._m(new THREE.CylinderGeometry(0.016, 0.018, 0.7, 6), am, 0, 0.005, 0.62, [Math.PI/2,0,0]));
      const gl = new THREE.PointLight(s.accentColor, 3, 2); gl.position.set(0, 0, 1); g.add(gl);
    } else {
      // assault / burst
      g.add(this._m(new THREE.BoxGeometry(0.052, 0.062, 0.44), bm, 0, 0, 0));
      g.add(this._m(new THREE.CylinderGeometry(0.01, 0.012, 0.32, 8), bm, 0, 0.004, 0.38, [Math.PI/2,0,0]));
      g.add(this._m(new THREE.BoxGeometry(0.02, 0.088, 0.03), am, 0, -0.076, 0.02));
      g.add(this._m(new THREE.BoxGeometry(0.026, 0.062, 0.026), bm, 0, -0.053, 0.0));
      g.add(this._m(new THREE.BoxGeometry(0.038, 0.05, 0.17), bm, 0, -0.004, -0.24));
      g.add(this._m(new THREE.BoxGeometry(0.011, 0.007, 0.18), am, 0, 0.036, 0.04));
    }
    const muz = new THREE.Object3D(); muz.name = 'muzzle';
    const mzz = { sniperRifle: 0.98, railgun: 1.05, shotgun: 0.73, smg: 0.36, pistol: 0.25, revolver: 0.25, minigun: 0.68, plasmaRifle: 0.62, katana: 0, hammerfist: 0, energyBlade: 0 };
    muz.position.set(0, 0.004, mzz[id] !== undefined ? mzz[id] : 0.55);
    g.add(muz);
    return g;
  }

  _m(geo, mat, x, y, z, rot) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rot) { m.rotation.x = rot[0] || 0; m.rotation.y = rot[1] || 0; m.rotation.z = rot[2] || 0; }
    return m;
  }

  canShoot(now) {
    if (!this.stats) return false;
    if (this.isMelee()) return (now - this.lastShotTime) >= (60000 / this.stats.fireRate);
    if (this.isReloading || this.ammo <= 0) {
      if (this.ammo <= 0 && !this.isReloading) this.startReload();
      return false;
    }
    // Minigun spin-up
    if (this.stats.spinUp) {
      if (!this._spinReady) return false;
    }
    return (now - this.lastShotTime) >= (60000 / this.stats.fireRate);
  }

  shoot(camera, now) {
    if (!this.canShoot(now)) return null;
    const s = this.stats;
    if (!this.isMelee()) {
      this.ammo--;
      if (this.ammo < 0) { this.ammo = 0; return null; }
    }
    this.lastShotTime = now;
    if (!this.isMelee()) {
      this.recoilY += 0.048 + Math.random() * 0.02;
      this.recoilX += (Math.random() - 0.5) * 0.018;
      this._flash(camera);
    }

    // Melee: no bullet, just an AoE swing marker
    if (this.isMelee()) {
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      const origin = camera.position.clone().addScaledVector(dir, 0.5);
      // Return a special melee "bullet" with very short range
      return { bullets: [{
        id: 'melee_' + Math.random().toString(36).substr(2,6),
        position: origin,
        direction: dir.clone(),
        speed: 0, // instant
        damage: s.damage,
        range: s.meleeRadius || 2.2,
        meleeArc: s.meleeArc || 1.8,
        distanceTraveled: 0,
        alive: true,
        isMelee: true,
        ownerId: 'local', ownerTeam: this._ownerTeam || 'a'
      }], ammo: this.ammo, reserve: this.reserve };
    }

    // Burst rifle: queue up burst shots
    if (s.burst && s.burst > 1 && !this._burstQueue) {
      this._burstQueue = s.burst - 1;
    }

    const bullets = [];
    const pellets = s.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      const sp = s.spread * (1 + this.recoilY * 0.5);
      dir.x += (Math.random() - 0.5) * sp;
      dir.y += (Math.random() - 0.5) * sp;
      dir.z += (Math.random() - 0.5) * sp;
      dir.normalize();
      bullets.push({
        id: Math.random().toString(36).substr(2, 8),
        position: camera.position.clone().addScaledVector(dir, 0.4),
        direction: dir.clone(),
        speed: s.id === 'railgun' ? 800 : 140,
        damage: s.damage,
        range: s.range,
        distanceTraveled: 0,
        alive: true,
        penetrating: !!s.penetrating,
        ownerId: 'local', ownerTeam: this._ownerTeam || 'a'
      });
    }
    return { bullets, ammo: this.ammo, reserve: this.reserve };
  }

  _flash(camera) {
    if (this.isMelee()) return;
    const lt = new THREE.PointLight(0xffaa44, 14, 6);
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    lt.position.copy(camera.position).addScaledVector(dir, 0.8);
    this.scene.add(lt);
    this.flashes.push({ light: lt, life: 70 });
  }

  startReload() {
    if (this.isMelee() || this.isReloading || !this.stats || this.reserve <= 0 || this.ammo === this.stats.magSize) return;
    this.isReloading = true; this.reloadTimer = this.stats.reloadTime;
  }

  update(delta, isFiring) {
    // Muzzle flashes
    this.flashes = this.flashes.filter(f => {
      f.life -= delta; f.light.intensity = Math.max(0, 14 * (f.life / 70));
      if (f.life <= 0) { this.scene.remove(f.light); return false; } return true;
    });
    // Recoil recovery
    this.recoilY *= 0.8; this.recoilX *= 0.8;
    if (Math.abs(this.recoilY) < 0.001) this.recoilY = 0;
    if (Math.abs(this.recoilX) < 0.001) this.recoilX = 0;
    // Reload
    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const n = Math.min(this.stats.magSize - this.ammo, this.reserve);
        this.ammo += n; this.reserve -= n;
        return { reloaded: true };
      }
    }
    // Minigun spin-up
    if (this.stats?.spinUp) {
      if (isFiring) {
        this._spinUpTimer = Math.min(this._spinUpTimer + delta, this.stats.spinUp);
        this._spinReady = this._spinUpTimer >= this.stats.spinUp * 0.7;
      } else {
        this._spinUpTimer = Math.max(0, this._spinUpTimer - delta * 2);
        this._spinReady = this._spinUpTimer > this.stats.spinUp * 0.3;
      }
    }
    // Burst queue
    if (this._burstQueue > 0) {
      this._burstTimer -= delta;
      if (this._burstTimer <= 0) {
        this._burstQueue--;
        this._burstTimer = 80;
        // Trigger burst shot via flag
        return { burstFire: true };
      }
    }
    return null;
  }
}

// ─────────────────────────────────────────────
// HUMANOID CHARACTER MESH SYSTEM
// Full skeleton with animated limb bones
// ─────────────────────────────────────────────

function buildCharMesh(charId, charDef, forPreview) {
  const g = new THREE.Group();

  const bm = new THREE.MeshStandardMaterial({ color: charDef.bodyColor,  metalness: 0.45, roughness: 0.38 });
  const am = new THREE.MeshStandardMaterial({ color: charDef.accentColor, metalness: 0.85, roughness: 0.10,
    emissive: new THREE.Color(charDef.accentColor), emissiveIntensity: 0.50 });
  const sm = new THREE.MeshStandardMaterial({ color: 0x111118, metalness: 0.9, roughness: 0.15 });  // visor/dark
  const fm = new THREE.MeshStandardMaterial({ color: charDef.bodyColor,  metalness: 0.3, roughness: 0.55 });  // flesh-toned limbs, slightly lighter

  // Helper: make a mesh and add to parent group
  const mk = (geo, mat, px, py, pz, rx, ry, rz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px||0, py||0, pz||0);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    m.castShadow = true;
    return m;
  };

  // ── TORSO (pivot at hips) ──────────────────
  const torso = new THREE.Group(); torso.position.set(0, 0.72, 0); g.add(torso);

  // Hips / lower torso
  const hips = mk(new THREE.BoxGeometry(0.34, 0.22, 0.20), bm, 0, 0, 0);
  torso.add(hips);

  // Waist taper
  const waist = mk(new THREE.BoxGeometry(0.30, 0.16, 0.18), bm, 0, 0.18, 0);
  torso.add(waist);

  // Upper torso / chest (wider)
  const chest = new THREE.Group(); chest.position.set(0, 0.36, 0); torso.add(chest);
  chest.add(mk(new THREE.BoxGeometry(0.44, 0.32, 0.22), bm, 0, 0, 0));
  // Chest armor plate accent
  chest.add(mk(new THREE.BoxGeometry(0.36, 0.20, 0.025), am, 0, 0, 0.115));
  // Shoulder pads
  chest.add(mk(new THREE.BoxGeometry(0.13, 0.10, 0.22), am, -0.30, 0.12, 0));
  chest.add(mk(new THREE.BoxGeometry(0.13, 0.10, 0.22), am, 0.30, 0.12, 0));

  // ── NECK + HEAD (pivot at base of neck) ──
  const neck = new THREE.Group(); neck.position.set(0, 0.20, 0); chest.add(neck);
  neck.add(mk(new THREE.CylinderGeometry(0.065, 0.075, 0.10, 8), bm, 0, 0.05, 0));

  const head = new THREE.Group(); head.position.set(0, 0.14, 0); neck.add(head);
  // Skull
  head.add(mk(new THREE.BoxGeometry(0.24, 0.22, 0.22), bm, 0, 0.01, 0));
  // Rounded top (sphere cap)
  head.add(mk(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI*2, 0, Math.PI*0.5), bm, 0, 0.11, 0));
  // Face plate / visor
  head.add(mk(new THREE.BoxGeometry(0.20, 0.07, 0.02), sm, 0, 0.02, 0.115));
  // Visor glow strip
  head.add(mk(new THREE.BoxGeometry(0.18, 0.025, 0.018), am, 0, 0.02, 0.126));
  // Chin
  head.add(mk(new THREE.BoxGeometry(0.16, 0.06, 0.05), bm, 0, -0.07, 0.09));
  // Ear details
  head.add(mk(new THREE.BoxGeometry(0.025, 0.06, 0.06), am, -0.125, 0, 0));
  head.add(mk(new THREE.BoxGeometry(0.025, 0.06, 0.06), am,  0.125, 0, 0));

  // Character-specific head gear
  const charRng = charId.charCodeAt(0) % 5;
  if (charRng === 0) {
    // Mohawk fin
    head.add(mk(new THREE.BoxGeometry(0.035, 0.10, 0.18), am, 0, 0.17, 0));
  } else if (charRng === 1) {
    // Antenna
    head.add(mk(new THREE.CylinderGeometry(0.012, 0.018, 0.15, 6), am, -0.08, 0.20, -0.02));
  } else if (charRng === 2) {
    // Crest / helmet ridge
    head.add(mk(new THREE.BoxGeometry(0.05, 0.06, 0.22), am, 0, 0.16, 0));
  } else if (charRng === 3) {
    // Wide visor / gas mask
    head.add(mk(new THREE.BoxGeometry(0.22, 0.09, 0.02), am, 0, -0.01, 0.116));
  }
  // else: plain helmet

  // ── LEFT ARM (shoulder pivot) ──────────────
  const lShoulder = new THREE.Group(); lShoulder.position.set(-0.30, 0.14, 0); chest.add(lShoulder);
  lShoulder.rotation.z = 0.08;
  // Upper arm
  const lUpperArm = new THREE.Group(); lUpperArm.position.set(-0.04, 0, 0); lShoulder.add(lUpperArm);
  lUpperArm.add(mk(new THREE.CylinderGeometry(0.055, 0.05, 0.28, 8), bm, 0, -0.14, 0));
  // Elbow joint
  lUpperArm.add(mk(new THREE.SphereGeometry(0.055, 8, 6), bm, 0, -0.28, 0));
  // Forearm (elbow pivot)
  const lElbow = new THREE.Group(); lElbow.position.set(0, -0.28, 0); lUpperArm.add(lElbow);
  lElbow.add(mk(new THREE.CylinderGeometry(0.045, 0.04, 0.26, 8), bm, 0, -0.13, 0));
  // Forearm accent stripe
  lElbow.add(mk(new THREE.BoxGeometry(0.025, 0.18, 0.025), am, 0.045, -0.13, 0));
  // Hand
  const lHand = new THREE.Group(); lHand.position.set(0, -0.27, 0); lElbow.add(lHand);
  lHand.add(mk(new THREE.BoxGeometry(0.08, 0.08, 0.06), bm, 0, -0.04, 0));
  // Store references for animation
  g.userData.lShoulder = lShoulder;
  g.userData.lElbow    = lElbow;

  // ── RIGHT ARM ──────────────────────────────
  const rShoulder = new THREE.Group(); rShoulder.position.set(0.30, 0.14, 0); chest.add(rShoulder);
  rShoulder.rotation.z = -0.08;
  const rUpperArm = new THREE.Group(); rUpperArm.position.set(0.04, 0, 0); rShoulder.add(rUpperArm);
  rUpperArm.add(mk(new THREE.CylinderGeometry(0.055, 0.05, 0.28, 8), bm, 0, -0.14, 0));
  rUpperArm.add(mk(new THREE.SphereGeometry(0.055, 8, 6), bm, 0, -0.28, 0));
  const rElbow = new THREE.Group(); rElbow.position.set(0, -0.28, 0); rUpperArm.add(rElbow);
  rElbow.add(mk(new THREE.CylinderGeometry(0.045, 0.04, 0.26, 8), bm, 0, -0.13, 0));
  rElbow.add(mk(new THREE.BoxGeometry(0.025, 0.18, 0.025), am, -0.045, -0.13, 0));
  const rHand = new THREE.Group(); rHand.position.set(0, -0.27, 0); rElbow.add(rHand);
  rHand.add(mk(new THREE.BoxGeometry(0.08, 0.08, 0.06), bm, 0, -0.04, 0));
  g.userData.rShoulder = rShoulder;
  g.userData.rElbow    = rElbow;

  // ── LEFT LEG (hip pivot) ───────────────────
  const lHip = new THREE.Group(); lHip.position.set(-0.10, -0.01, 0); torso.add(lHip);
  // Thigh
  const lThigh = new THREE.Group(); lHip.add(lThigh);
  lThigh.add(mk(new THREE.CylinderGeometry(0.07, 0.063, 0.36, 8), bm, 0, -0.18, 0));
  lThigh.add(mk(new THREE.BoxGeometry(0.065, 0.22, 0.04), am, 0, -0.14, 0.07)); // thigh guard
  // Knee joint
  lThigh.add(mk(new THREE.SphereGeometry(0.065, 8, 6), bm, 0, -0.36, 0));
  // Shin (knee pivot)
  const lKnee = new THREE.Group(); lKnee.position.set(0, -0.36, 0); lThigh.add(lKnee);
  lKnee.add(mk(new THREE.CylinderGeometry(0.057, 0.05, 0.33, 8), bm, 0, -0.165, 0));
  lKnee.add(mk(new THREE.BoxGeometry(0.05, 0.16, 0.025), am, 0, -0.16, 0.06)); // shin guard
  // Ankle + foot
  const lAnkle = new THREE.Group(); lAnkle.position.set(0, -0.33, 0); lKnee.add(lAnkle);
  lAnkle.add(mk(new THREE.BoxGeometry(0.09, 0.07, 0.16), bm, 0, -0.035, 0.03));
  lAnkle.add(mk(new THREE.BoxGeometry(0.085, 0.03, 0.14), am, 0, -0.065, 0.035)); // boot sole
  g.userData.lHip   = lHip;
  g.userData.lKnee  = lKnee;
  g.userData.lAnkle = lAnkle;

  // ── RIGHT LEG ──────────────────────────────
  const rHip = new THREE.Group(); rHip.position.set(0.10, -0.01, 0); torso.add(rHip);
  const rThigh = new THREE.Group(); rHip.add(rThigh);
  rThigh.add(mk(new THREE.CylinderGeometry(0.07, 0.063, 0.36, 8), bm, 0, -0.18, 0));
  rThigh.add(mk(new THREE.BoxGeometry(0.065, 0.22, 0.04), am, 0, -0.14, 0.07));
  rThigh.add(mk(new THREE.SphereGeometry(0.065, 8, 6), bm, 0, -0.36, 0));
  const rKnee = new THREE.Group(); rKnee.position.set(0, -0.36, 0); rThigh.add(rKnee);
  rKnee.add(mk(new THREE.CylinderGeometry(0.057, 0.05, 0.33, 8), bm, 0, -0.165, 0));
  rKnee.add(mk(new THREE.BoxGeometry(0.05, 0.16, 0.025), am, 0, -0.16, 0.06));
  const rAnkle = new THREE.Group(); rAnkle.position.set(0, -0.33, 0); rKnee.add(rAnkle);
  rAnkle.add(mk(new THREE.BoxGeometry(0.09, 0.07, 0.16), bm, 0, -0.035, 0.03));
  rAnkle.add(mk(new THREE.BoxGeometry(0.085, 0.03, 0.14), am, 0, -0.065, 0.035));
  g.userData.rHip   = rHip;
  g.userData.rKnee  = rKnee;
  g.userData.rAnkle = rAnkle;

  // Store bone references for easy animation
  g.userData.torso  = torso;
  g.userData.chest  = chest;
  g.userData.head   = head;
  g.userData.neck   = neck;
  g.userData.lThigh = lThigh;
  g.userData.rThigh = rThigh;
  // Animation state
  g.userData.animT        = Math.random() * Math.PI * 2; // random phase offset
  g.userData.isBot        = true;
  g.userData.botRef       = null;
  g.userData.lastAnimSpd  = 0;
  g.userData.aimPitch     = 0; // upper-body aim pitch set by AI
  g.userData.idleSwayT    = Math.random() * 10;

  // Accent glow light
  const glow = new THREE.PointLight(charDef.accentColor, 0.8, 2.5);
  glow.position.set(0, 1.1, 0); g.add(glow);

  return g;
}

// ─────────────────────────────────────────────
// CHARACTER ANIMATION SYSTEM
// Call each frame with speed + state + delta
// ─────────────────────────────────────────────
function animateCharMesh(mesh, speed, state, delta, aimYaw, aimPitch) {
  const u  = mesh.userData;
  if (!u.torso) return; // not a humanoid mesh

  const dt  = delta / 1000;
  const spd = Math.min(speed, 14);
  const moving = spd > 0.5;

  // Walk cycle speed — scales with movement speed
  const cycleSpd = spd * 0.045;
  u.animT      += moving ? cycleSpd : dt * 0.6; // idle sway if still
  u.idleSwayT  += dt * 0.9;

  const t   = u.animT;
  const sin = Math.sin(t);
  const cos = Math.cos(t);

  // ── LEGS — full walk cycle ──────────────────
  if (u.lThigh && u.rThigh) {
    const legSwing = moving ? sin * 0.62 : 0;
    const kneeBend = moving ? Math.max(0, -sin) * 0.55 : 0;

    // Thigh forward/back swing
    u.lThigh.rotation.x =  legSwing;
    u.rThigh.rotation.x = -legSwing;

    // Knee bends on back-swing
    u.lKnee.rotation.x  = moving ? Math.max(0, sin) * 0.5 : 0;
    u.rKnee.rotation.x  = moving ? Math.max(0, -sin) * 0.5 : 0;

    // Ankle compensates to keep foot flat
    u.lAnkle.rotation.x = -(u.lThigh.rotation.x + u.lKnee.rotation.x) * 0.4;
    u.rAnkle.rotation.x = -(u.rThigh.rotation.x + u.rKnee.rotation.x) * 0.4;

    // Side sway from leg swing (weight shift)
    if (u.torso && moving) {
      u.torso.rotation.z = -sin * 0.04;
      u.torso.position.y = 0.72 + Math.abs(sin) * 0.018;
    } else if (u.torso) {
      u.torso.rotation.z = 0;
      u.torso.position.y = 0.72;
    }
  }

  // ── ARMS — opposite swing to legs ──────────
  if (u.lShoulder && u.rShoulder) {
    if (state === 'attack' || state === 'strafe' || state === 'flank') {
      // Aiming pose: arms raised toward target
      const pitch = aimPitch || u.aimPitch || 0;
      u.rShoulder.rotation.x = -0.55 + pitch * 0.6; // gun arm raised
      u.rShoulder.rotation.z = -0.08;
      u.rElbow.rotation.x    = 0.45;
      u.lShoulder.rotation.x = -0.40 + pitch * 0.4; // support arm
      u.lShoulder.rotation.z =  0.15;
      u.lElbow.rotation.x    = 0.60;
    } else if (moving) {
      // Natural arm swing (counter to legs)
      u.lShoulder.rotation.x = -sin * 0.40;
      u.rShoulder.rotation.x =  sin * 0.40;
      u.lElbow.rotation.x    = Math.max(0, -sin) * 0.30;
      u.rElbow.rotation.x    = Math.max(0,  sin) * 0.30;
      u.lShoulder.rotation.z = 0.08;
      u.rShoulder.rotation.z = -0.08;
    } else {
      // Idle: very slight sway
      const idleSin = Math.sin(u.idleSwayT * 0.7) * 0.04;
      u.lShoulder.rotation.x = idleSin;
      u.rShoulder.rotation.x = -idleSin;
      u.lElbow.rotation.x    = 0.08;
      u.rElbow.rotation.x    = 0.08;
    }
  }

  // ── HEAD — idle look-around + aim ──────────
  if (u.neck) {
    const idleLook = Math.sin(u.idleSwayT * 0.4) * 0.12;
    u.neck.rotation.y = idleLook;
    // Pitch neck slightly up/down with aim
    u.neck.rotation.x = (aimPitch || 0) * 0.35;
  }

  // ── CHEST — twists slightly toward aim yaw ─
  if (u.chest && aimYaw !== undefined) {
    u.chest.rotation.y += ((aimYaw || 0) * 0.18 - u.chest.rotation.y) * 0.12;
  }

  // ── TORSO BOB while moving ─────────────────
  if (u.torso && moving) {
    u.torso.position.y = 0.72 + Math.abs(Math.sin(t * 2)) * 0.02;
  }

  // ── CROUCH ────────────────────────────────
  if (state === 'cover' || state === 'reload') {
    mesh.scale.y += (0.75 - mesh.scale.y) * 0.12;
    if (u.torso) u.torso.rotation.x += (-0.25 - u.torso.rotation.x) * 0.1;
  } else {
    mesh.scale.y += (1.0 - mesh.scale.y) * 0.10;
    if (u.torso) u.torso.rotation.x += (0 - u.torso.rotation.x) * 0.08;
  }
}

// ─────────────────────────────────────────────
// PLAYER CONTROLLER
// ─────────────────────────────────────────────
class PlayerController {
  constructor(camera, scene, charId, config) {
    this.camera = camera; this.scene = scene;
    this.charDef = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
    this.config = { sensitivity: 0.002, fov: 90, invertY: false, ...config };
    this.position = new THREE.Vector3(0, 1.8, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.isGrounded = false; this.height = 1.8;
    this.health = this.charDef.maxHealth; this.shield = this.charDef.maxShield;
    this.maxHealth = this.charDef.maxHealth; this.maxShield = this.charDef.maxShield;
    this.isAlive = true; this.isInvincible = false;
    this.kills = 0; this.deaths = 0; this.assists = 0;
    this.isPlayer = true; this.team = 'a'; this.name = 'YOU'; this.id = 'local';
    this.isSprinting = false; this.isCrouching = false; this.isAiming = false;
    this.speedMult = 1; this.damageMult = 1;
    this.abilityCooldowns = { e: 0, q: 0, f: 0 };
    this.weaponSystem = new WeaponSystem(scene);
    this.weaponSystem._ownerTeam = 'a';
    this.weaponSystem.equip(this.charDef.weapon || 'assaultRifle');
    this._setupViewmodel();
    this.keys = {}; this.mouse = {}; this._prevFire = false;
    this._bindInput();
    // Coyote time + jump buffer for better game feel
    this._coyoteTime = 0;
    this._jumpBuffer = 0;
  }

  _setupViewmodel() {
    if (this._vm) this.camera.remove(this._vm);
    this._vm = new THREE.Group();
    if (this.weaponSystem.viewMesh) {
      const m = this.weaponSystem.viewMesh.clone();
      const isMelee = this.weaponSystem.isMelee();
      if (isMelee) {
        m.position.set(0.18, -0.16, -0.28); m.rotation.set(-0.3, Math.PI + 0.2, 0.15);
      } else {
        m.position.set(0.2, -0.2, -0.38); m.rotation.y = Math.PI;
      }
      this._vm.add(m);
    }
    this.camera.add(this._vm);
  }

  _bindInput() {
    this._kd = e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR' && !this.weaponSystem.isMelee()) this.weaponSystem.startReload();
      if (e.code === 'KeyE') this._ability('e');
      if (e.code === 'KeyQ') this._ability('q');
      if (e.code === 'KeyF') this._ability('f');
      if (e.code === 'Space') this._jumpBuffer = 200;
    };
    this._ku = e => { this.keys[e.code] = false; };
    this._mm = e => {
      if (document.pointerLockElement !== document.getElementById('game-canvas')) return;
      const s = this.config.sensitivity;
      this.yaw   -= e.movementX * s;
      // movementY > 0 = mouse moved down = look down = NEGATIVE pitch in Three.js YXZ (positive = up)
      this.pitch -= e.movementY * s * (this.config.invertY ? -1 : 1);
      this.pitch  = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch));
    };
    this._md = e => { this.mouse[e.button] = true; };
    this._mu = e => { this.mouse[e.button] = false; };
    this._rc = e => { if (e.button === 2) { this.isAiming = !this.isAiming; e.preventDefault(); } };
    document.addEventListener('keydown', this._kd);
    document.addEventListener('keyup',   this._ku);
    document.addEventListener('mousemove', this._mm);
    document.addEventListener('mousedown', this._md);
    document.addEventListener('mouseup',   this._mu);
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  _ability(key) {
    if (this.abilityCooldowns[key] > 0 || !this.isAlive) return;
    const ab = this.charDef.abilities[key]; if (!ab) return;
    this.abilityCooldowns[key] = ab.cooldown * 1000;
    const t = ab.type;
    const pos = this.position.clone();
    const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
    this._abilityFlash(ab);

    if (t === 'dash') {
      const d = fwd.clone(); d.y = 0.3; d.normalize();
      this.velocity.addScaledVector(d, 26);
      this.isInvincible = true;
      setTimeout(() => { this.isInvincible = false; }, 200);
      this._spawnAfterimage(pos);
    } else if (t === 'movement') {
      this.speedMult = 2.2; this.isGrounded = false;
      this.velocity.y = Math.max(this.velocity.y, 5);
      this.velocity.addScaledVector(fwd, 18);
      setTimeout(() => { this.speedMult = 1; }, 3500);
    } else if (t === 'teleport') {
      this._spawnTeleportDecal(pos);
      fwd.y = 0; fwd.normalize();
      const dest = pos.clone().addScaledVector(fwd, 16);
      dest.y = Math.max(dest.y, 1.0);
      this.position.copy(dest);
      this.velocity.set(0, 0, 0);
      this._spawnTeleportDecal(dest);
    } else if (t === 'boost') {
      const dur = ab.name.includes('Overclock') ? 6000 : ab.name.includes('Apex') ? 8000 : ab.name.includes('Ragnarok') ? 6000 : ab.name.includes('Machine') ? 8000 : 6000;
      const dmgBoost = ab.name.includes('Ragnarok') || ab.name.includes('RAMPAGE') ? 2.0 : ab.name.includes('Damage') ? 1.6 : 1.4;
      const spdBoost = ab.name.includes('Surge') ? 3.0 : ab.name.includes('Protocol') ? 1.0 : 1.4;
      this.speedMult = spdBoost; this.damageMult = dmgBoost;
      if (ab.name.includes('Ragnarok') || ab.name.includes('Precision') || ab.name.includes('RAMPAGE')) {
        this.isInvincible = true;
        setTimeout(() => { this.isInvincible = false; }, dur);
      }
      this._spawnBoostAura(pos, ab);
      setTimeout(() => { this.speedMult = 1; this.damageMult = 1; }, dur);
    } else if (t === 'invis' || t === 'phantom') {
      const dur = t === 'phantom' ? 5000 : 3000;
      this.isInvisible = true;
      if (this._vm) this._vm.visible = false;
      if (t === 'phantom') {
        this.isInvincible = true; this.speedMult = 1.6;
        setTimeout(() => { this.isInvincible = false; this.speedMult = 1; }, dur);
      }
      this._spawnInvisEffect(pos);
      setTimeout(() => {
        this.isInvisible = false;
        if (this._vm) this._vm.visible = true;
        this._spawnInvisEffect(this.position.clone());
      }, dur);
    } else if (t === 'shield') {
      const dur = ab.name.includes('Siege') ? 8000 : ab.name.includes('Iron') ? 3000 : 3000;
      this.isInvincible = true;
      if (ab.name.includes('Siege')) this.speedMult = 0;
      this._spawnShieldBubble(pos, dur);
      setTimeout(() => {
        this.isInvincible = false;
        if (this.speedMult === 0) this.speedMult = 1;
      }, dur);
    } else if (t === 'grapple') {
      const d = fwd.clone().multiplyScalar(38);
      d.y += 8;
      this.velocity.copy(d);
    } else if (t === 'aoe') {
      const radius = ab.name.includes('Nova') || ab.name.includes('Singularity') || ab.name.includes('Thunderstorm') || ab.name.includes('Biohazard') ? 12 :
                     ab.name.includes('Inferno') || ab.name.includes('Permafrost') ? 14 : 8;
      const dmg = ab.name.includes('Nova') ? 180 : ab.name.includes('Inferno') || ab.name.includes('Biohazard') ? 40 : ab.name.includes('Frost') ? 60 : 120;
      this._abilityAoE = { pos: pos.clone().addScaledVector(fwd, 6), radius, dmg, duration: ab.name.includes('Inferno') || ab.name.includes('Biohazard') ? 4000 : 500 };
      this._spawnAoEEffect(this._abilityAoE.pos, radius, ab);
    } else if (t === 'smoke') {
      const smkPos = pos.clone().addScaledVector(fwd, 5);
      smkPos.y += 0.5;
      this._spawnSmokeCloud(smkPos, 4000);
    } else if (t === 'grenade') {
      const vel = fwd.clone().multiplyScalar(20); vel.y += 10;
      this._throwGrenade(pos.clone().add(new THREE.Vector3(0,1,0)), vel, 'fire', 5000);
    } else if (t === 'heal') {
      const healAmt = ab.name.includes('Revival') ? 999 : ab.name.includes('Nano') ? 80 : 40;
      this.health = Math.min(this.maxHealth, this.health + healAmt);
      this._spawnHealRing(pos);
    } else if (t === 'scan') {
      this._spawnScanPulse(pos, ab.cooldown * 1000);
    } else if (t === 'trap') {
      const trapPos = pos.clone().addScaledVector(fwd, 5); trapPos.y = 0;
      this._placeTrap(trapPos);
    } else if (t === 'turret') {
      const turretPos = pos.clone().addScaledVector(fwd, 4); turretPos.y = 0;
      this._deployTurret(turretPos, 15000);
    } else if (t === 'hack') {
      this._spawnHackEffect(pos.clone().addScaledVector(fwd, 4));
    } else if (t === 'utility') {
      this._spawnDisruptionField(pos.clone().addScaledVector(fwd, 3), 4000);
    } else if (t === 'revive') {
      this._spawnReviveBeacon(pos.clone(), 8000);
    }
  }

  // ── Ability VFX (kept from original, condensed) ──────────────────────────
  _abilityFlash(ab) {
    const col = new THREE.Color(this.charDef.accentColor);
    const fl = new THREE.PointLight(col, 12, 8); fl.position.copy(this.position).add(new THREE.Vector3(0,1,0)); this.scene.add(fl);
    const t0 = performance.now();
    const tick = () => { const p = Math.min(1,(performance.now()-t0)/350); fl.intensity = 12*(1-p); if(p<1) requestAnimationFrame(tick); else this.scene.remove(fl); };
    requestAnimationFrame(tick);
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:38%;left:50%;transform:translateX(-50%);font-family:Orbitron,monospace;font-size:18px;font-weight:900;text-shadow:0 0 18px currentColor;pointer-events:none;z-index:9999;animation:abilityPop 1.2s ease forwards';
    div.style.color = this.charDef.color; div.textContent = ab.icon + ' ' + ab.name.toUpperCase();
    document.body.appendChild(div); setTimeout(()=>div.remove(),1200);
  }
  _spawnAfterimage(pos) {
    const col = new THREE.Color(this.charDef.accentColor);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.25,1.2,4,8) : new THREE.BoxGeometry(0.5,1.8,0.3), new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.55}));
    m.position.copy(pos); this.scene.add(m);
    const t0=performance.now(); const fade=()=>{ const p=(performance.now()-t0)/500; m.material.opacity=Math.max(0,0.55*(1-p)); if(p<1)requestAnimationFrame(fade); else this.scene.remove(m); }; requestAnimationFrame(fade);
  }
  _spawnTeleportDecal(pos) {
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.6,0.05,8,24),new THREE.MeshBasicMaterial({color:this.charDef.accentColor,transparent:true,opacity:0.9}));
    ring.position.copy(pos); ring.position.y=0.05; ring.rotation.x=-Math.PI/2; this.scene.add(ring);
    const t0=performance.now(); const ex=()=>{ const p=(performance.now()-t0)/700; ring.scale.setScalar(1+p*2); ring.material.opacity=Math.max(0,0.9*(1-p)); if(p<1)requestAnimationFrame(ex); else this.scene.remove(ring); }; requestAnimationFrame(ex);
  }
  _spawnBoostAura(pos, ab) {
    const col=new THREE.Color(this.charDef.accentColor);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.1,0.06,8,36),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.8}));
    ring.position.copy(pos).add(new THREE.Vector3(0,0.2,0)); ring.rotation.x=-Math.PI/2; this.scene.add(ring);
    const lt=new THREE.PointLight(col,6,5); lt.position.copy(pos).add(new THREE.Vector3(0,1,0)); this.scene.add(lt);
    const t0=performance.now(), dur=6000;
    const pulse=()=>{ const t=performance.now()-t0; ring.scale.setScalar(1+Math.sin(t*0.005)*0.12); lt.intensity=4+Math.sin(t*0.008)*2; if(t<dur)requestAnimationFrame(pulse); else{this.scene.remove(ring);this.scene.remove(lt);} };
    requestAnimationFrame(pulse);
  }
  _spawnInvisEffect(pos) {
    const col=new THREE.Color(this.charDef.accentColor);
    for(let i=0;i<10;i++){ const p=new THREE.Mesh(new THREE.SphereGeometry(0.06+Math.random()*0.06,4,4),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.9})); const a=(i/10)*Math.PI*2; p.position.set(pos.x+Math.cos(a)*0.5,pos.y+0.5+Math.random()*1.4,pos.z+Math.sin(a)*0.5); this.scene.add(p); const t0=performance.now(); const tick=()=>{ const t=(performance.now()-t0)/600; p.position.y+=0.012; p.material.opacity=Math.max(0,0.9*(1-t)); if(t<1)requestAnimationFrame(tick); else this.scene.remove(p); }; requestAnimationFrame(tick); }
  }
  _spawnShieldBubble(pos, dur) {
    const col=new THREE.Color(this.charDef.accentColor);
    const bubble=new THREE.Mesh(new THREE.SphereGeometry(1.1,18,14),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.22,side:THREE.BackSide,depthWrite:false}));
    bubble.position.copy(pos).add(new THREE.Vector3(0,0.9,0)); this.scene.add(bubble);
    const lt=new THREE.PointLight(col,4,4); lt.position.copy(bubble.position); this.scene.add(lt);
    const t0=performance.now(); const pulse=()=>{ const t=performance.now()-t0; bubble.material.opacity=0.18+Math.sin(t*0.006)*0.06; lt.intensity=3+Math.sin(t*0.008)*1; if(t<dur)requestAnimationFrame(pulse); else{this.scene.remove(bubble);this.scene.remove(lt);} };
    requestAnimationFrame(pulse);
  }
  _spawnAoEEffect(pos, radius, ab) {
    const col=new THREE.Color(this.charDef.accentColor);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,0.12,8,48),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.9}));
    ring.position.copy(pos); ring.rotation.x=-Math.PI/2; this.scene.add(ring);
    const lt=new THREE.PointLight(col,12,radius*1.5); lt.position.copy(pos).add(new THREE.Vector3(0,1,0)); this.scene.add(lt);
    const t0=performance.now(); const ex=()=>{ const p=(performance.now()-t0)/700; ring.scale.setScalar(1+p*0.4); ring.material.opacity=Math.max(0,0.9*(1-p)); lt.intensity=Math.max(0,12*(1-p)); if(p<1)requestAnimationFrame(ex); else{this.scene.remove(ring);this.scene.remove(lt);} };
    requestAnimationFrame(ex);
  }
  _spawnSmokeCloud(pos, dur) {
    const smoke=new THREE.Mesh(new THREE.SphereGeometry(3.5,8,6),new THREE.MeshBasicMaterial({color:0x445566,transparent:true,opacity:0.55,depthWrite:false}));
    smoke.position.copy(pos); this.scene.add(smoke);
    const t0=performance.now(); const tick=()=>{ if(performance.now()-t0<dur)requestAnimationFrame(tick); else{const fade=()=>{ smoke.material.opacity=Math.max(0,smoke.material.opacity-0.012); if(smoke.material.opacity>0)requestAnimationFrame(fade); else this.scene.remove(smoke); }; requestAnimationFrame(fade); } };
    requestAnimationFrame(tick);
  }
  _spawnFireZone(pos, radius, dur) {
    const col=0xff4400;
    const disk=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,0.15,18),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.4,depthWrite:false}));
    disk.position.copy(pos); disk.position.y=0.1; this.scene.add(disk);
    const lt=new THREE.PointLight(col,4,radius*1.5); lt.position.copy(pos).add(new THREE.Vector3(0,1,0)); this.scene.add(lt);
    const t0=performance.now(); const tick=()=>{ const t=performance.now()-t0; lt.intensity=3+Math.sin(t*0.012)*1.5; if(t<dur)requestAnimationFrame(tick); else{this.scene.remove(disk);this.scene.remove(lt);} };
    requestAnimationFrame(tick);
  }
  _throwGrenade(startPos, vel, type, lingerDur) {
    const col=type==='flash'?0xffffaa:0xff4400;
    const g=new THREE.Mesh(new THREE.SphereGeometry(0.1,6,5),new THREE.MeshBasicMaterial({color:col}));
    g.position.copy(startPos); this.scene.add(g);
    const v=vel.clone(); const t0=performance.now();
    const fly=()=>{ const dt=0.016; v.y-=14*dt; g.position.addScaledVector(v,dt); if(performance.now()-t0>1500||g.position.y<0.2){ this.scene.remove(g); if(type==='fire')this._spawnFireZone(g.position.clone(),4,lingerDur); else if(type==='flash'){const fl=document.createElement('div');fl.style.cssText='position:fixed;inset:0;background:#fff;opacity:0.85;pointer-events:none;z-index:9999;transition:opacity 1.5s';document.body.appendChild(fl);requestAnimationFrame(()=>{fl.style.opacity='0';setTimeout(()=>fl.remove(),1500);}); } return; } requestAnimationFrame(fly); };
    requestAnimationFrame(fly);
  }
  _spawnHealRing(pos) {
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.5,0.06,8,36),new THREE.MeshBasicMaterial({color:0x00ff88,transparent:true,opacity:0.9}));
    ring.position.copy(pos).add(new THREE.Vector3(0,0.3,0)); ring.rotation.x=-Math.PI/2; this.scene.add(ring);
    const lt=new THREE.PointLight(0x00ff88,5,6); lt.position.copy(ring.position); this.scene.add(lt);
    const t0=performance.now(); const ex=()=>{ const p=(performance.now()-t0)/800; ring.scale.setScalar(1+p*1.5); ring.material.opacity=Math.max(0,0.9*(1-p)); lt.intensity=Math.max(0,5*(1-p)); if(p<1)requestAnimationFrame(ex); else{this.scene.remove(ring);this.scene.remove(lt);} };
    requestAnimationFrame(ex);
    const hpDiv=document.createElement('div'); hpDiv.style.cssText='position:fixed;top:42%;left:50%;transform:translateX(-50%);font-family:Orbitron,monospace;font-size:22px;color:#00ff88;text-shadow:0 0 20px #00ff88;pointer-events:none;z-index:9999;animation:abilityPop 1.4s ease forwards'; hpDiv.textContent='+HP'; document.body.appendChild(hpDiv); setTimeout(()=>hpDiv.remove(),1400);
  }
  _spawnScanPulse(pos) {
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.5,0.04,8,36),new THREE.MeshBasicMaterial({color:0x4488ff,transparent:true,opacity:0.9}));
    ring.position.copy(pos).add(new THREE.Vector3(0,0.5,0)); ring.rotation.x=-Math.PI/2; this.scene.add(ring);
    const t0=performance.now(); const ex=()=>{ const p=(performance.now()-t0)/1200; ring.scale.setScalar(1+p*40); ring.material.opacity=Math.max(0,0.7*(1-p)); if(p<1)requestAnimationFrame(ex); else this.scene.remove(ring); }; requestAnimationFrame(ex);
  }
  _placeTrap(pos) {
    const col=new THREE.Color(this.charDef.accentColor);
    const trap=new THREE.Mesh(new THREE.TorusGeometry(0.4,0.05,8,18),new THREE.MeshBasicMaterial({color:col}));
    trap.position.copy(pos); trap.position.y=0.05; trap.rotation.x=-Math.PI/2; this.scene.add(trap);
    const lt=new THREE.PointLight(col,2,3); lt.position.copy(pos).add(new THREE.Vector3(0,0.3,0)); this.scene.add(lt);
    this._activeTrap={pos:pos.clone(),mesh:trap,light:lt,active:true};
    const t0=performance.now(); const pulse=()=>{ if(!this._activeTrap?.active){this.scene.remove(trap);this.scene.remove(lt);return;} const t=performance.now()*0.003; lt.intensity=1.5+Math.sin(t)*0.8; if(performance.now()-t0<12000)requestAnimationFrame(pulse); else{this.scene.remove(trap);this.scene.remove(lt);this._activeTrap=null;} }; requestAnimationFrame(pulse);
  }
  _deployTurret(pos, dur) {
    const col=new THREE.Color(this.charDef.accentColor);
    const base=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.3,0.4),new THREE.MeshStandardMaterial({color:0x333333,metalness:0.8}));
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.4,8),new THREE.MeshStandardMaterial({color:0x555555,metalness:0.9}));
    barrel.rotation.z=Math.PI/2; barrel.position.set(0.3,0.15,0);
    const lt=new THREE.PointLight(col,2,4); lt.position.set(0,0.5,0);
    const turret=new THREE.Group(); turret.add(base,barrel,lt);
    turret.position.copy(pos); this.scene.add(turret);
    this._activeTurret={mesh:turret,pos:pos.clone(),active:true,lastShot:0};
    const t0=performance.now(); const tick=()=>{ if(!this._activeTurret?.active){this.scene.remove(turret);return;} const age=performance.now()-t0; lt.intensity=1.5+Math.sin(age*0.005)*0.5; if(age<dur)requestAnimationFrame(tick); else{this.scene.remove(turret);this._activeTurret=null;} };
    requestAnimationFrame(tick);
    setTimeout(()=>{if(this._activeTurret){this.scene.remove(this._activeTurret.mesh);this._activeTurret=null;}},dur);
  }
  _spawnHackEffect(pos) {
    const col=new THREE.Color(this.charDef.accentColor);
    for(let i=0;i<8;i++){const p=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,0.06),new THREE.MeshBasicMaterial({color:col,transparent:true})); const a=(i/8)*Math.PI*2,r=1.2+Math.random(); p.position.set(pos.x+Math.cos(a)*r,pos.y+0.5+Math.random()*1.5,pos.z+Math.sin(a)*r); this.scene.add(p); const t0=performance.now(); const tick=()=>{ const t=(performance.now()-t0)/4000; p.rotation.x+=0.05; p.rotation.y+=0.08; p.material.opacity=Math.max(0,0.8*(1-t)); if(t<1)requestAnimationFrame(tick); else this.scene.remove(p); }; requestAnimationFrame(tick); }
  }
  _spawnDisruptionField(pos, dur) {
    const mat=new THREE.MeshBasicMaterial({color:0x4400ff,transparent:true,opacity:0.15,side:THREE.DoubleSide});
    const disk=new THREE.Mesh(new THREE.CylinderGeometry(4,4,0.2,24),mat);
    disk.position.copy(pos); this.scene.add(disk);
    const lt=new THREE.PointLight(0x4400ff,3,8); lt.position.copy(pos).add(new THREE.Vector3(0,1,0)); this.scene.add(lt);
    const t0=performance.now(); const fade=()=>{ const p=(performance.now()-t0)/dur; disk.material.opacity=Math.max(0,0.15*(1-p)); lt.intensity=Math.max(0,3*(1-p)); if(p<1)requestAnimationFrame(fade); else{this.scene.remove(disk);this.scene.remove(lt);} };
    requestAnimationFrame(fade);
  }
  _spawnReviveBeacon(pos, dur) {
    const col=new THREE.Color(0xff44aa);
    const beacon=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,1.2,8),new THREE.MeshStandardMaterial({color:0xcc2288,emissive:col,emissiveIntensity:1.5}));
    beacon.position.copy(pos).add(new THREE.Vector3(0,0.6,0));
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.6,0.04,8,24),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.8}));
    ring.position.copy(pos).add(new THREE.Vector3(0,0.1,0)); ring.rotation.x=-Math.PI/2;
    const lt=new THREE.PointLight(col,3,5); lt.position.copy(beacon.position);
    this.scene.add(beacon); this.scene.add(ring); this.scene.add(lt);
    const t0=performance.now(); const pulse=()=>{ const t=performance.now()*0.002; lt.intensity=2+Math.sin(t)*1; ring.scale.setScalar(1+Math.sin(t*2)*0.1); if(performance.now()-t0<dur)requestAnimationFrame(pulse); else{this.scene.remove(beacon);this.scene.remove(ring);this.scene.remove(lt);} };
    requestAnimationFrame(pulse);
  }

  // ── Main update ───────────────────────────────────────────────────────────
  update(delta, colliders) {
    if (!this.isAlive) return null;
    const dt = delta / 1000;

    // Camera rotation
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    // Movement
    let mx = 0, mz = 0;
    if (this.keys['KeyW']  || this.keys['ArrowUp'])    mz = -1;
    if (this.keys['KeyS']  || this.keys['ArrowDown'])  mz =  1;
    if (this.keys['KeyA']  || this.keys['ArrowLeft'])  mx = -1;
    if (this.keys['KeyD']  || this.keys['ArrowRight']) mx =  1;
    const len = Math.sqrt(mx*mx + mz*mz);
    if (len > 0) { mx /= len; mz /= len; }

    this.isSprinting = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && len > 0;
    this.isCrouching = !!(this.keys['ControlLeft'] || this.keys['KeyC']);
    const baseSpeed = 10 * (this.charDef.speed || 1.0) * this.speedMult;
    const speed = this.isSprinting ? baseSpeed * 1.55 : this.isCrouching ? baseSpeed * 0.5 : baseSpeed;

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rgt = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = fwd.clone().multiplyScalar(-mz).addScaledVector(rgt, mx);

    this.velocity.x += (move.x * speed - this.velocity.x) * (this.isGrounded ? 0.28 : 0.06);
    this.velocity.z += (move.z * speed - this.velocity.z) * (this.isGrounded ? 0.28 : 0.06);

    // Gravity
    if (!this.isGrounded) this.velocity.y -= 26 * dt;

    // Jump with coyote time + buffer
    if (this.isGrounded) this._coyoteTime = 120;
    else this._coyoteTime = Math.max(0, this._coyoteTime - delta);
    this._jumpBuffer = Math.max(0, this._jumpBuffer - delta);

    if (this._jumpBuffer > 0 && this._coyoteTime > 0) {
      this.velocity.y = 11.5;
      this._coyoteTime = 0; this._jumpBuffer = 0;
      this.isGrounded = false;
    }

    // Move + collide
    this.position.addScaledVector(this.velocity, dt);

    // Ground check
    const groundY = this._getGround(colliders);
    const eyeH = this.isCrouching ? 1.1 : this.height;
    if (this.position.y <= groundY + eyeH * 0.5) {
      this.position.y = groundY + eyeH * 0.5;
      this.velocity.y = 0; this.isGrounded = true;
    } else { this.isGrounded = false; }

    if (colliders) this._resolveWalls(colliders);
    this.position.x = Math.max(-195, Math.min(195, this.position.x));
    this.position.z = Math.max(-195, Math.min(195, this.position.z));

    // Camera position — set BEFORE shooting so bullet origin is correct
    const eyeOffset = this.isCrouching ? 0 : 0.25;
    this.camera.position.set(this.position.x, this.position.y + eyeOffset, this.position.z);

    // FOV
    const tFov = this.isAiming ? this.config.fov * 0.62 : this.config.fov;
    this.camera.fov += (tFov - this.camera.fov) * 0.16;
    this.camera.updateProjectionMatrix();

    // Viewmodel bob + sway
    if (this._vm) {
      const t = performance.now() * 0.001;
      const bob = len > 0 && this.isGrounded ? Math.sin(t * (this.isSprinting ? 13 : 7)) * (this.isSprinting ? 0.022 : 0.009) : 0;
      const isMelee = this.weaponSystem.isMelee();
      const baseX = isMelee ? 0.18 : (this.isAiming ? 0.08 : 0.2);
      const baseZ = isMelee ? -0.28 : -0.38;
      this._vm.position.y = -0.2 + bob;
      this._vm.position.x += (baseX - this._vm.position.x) * 0.2;
      this._vm.position.z += (baseZ - this._vm.position.z) * 0.2;
      this._vm.rotation.z = this.weaponSystem.recoilX;
      this._vm.rotation.x = -this.weaponSystem.recoilY * 0.5;
    }

    // Shooting
    const now = performance.now();
    const isFiring = !!this.mouse[0];
    const auto    = this.weaponSystem.stats?.auto && isFiring;
    const single  = !this.weaponSystem.stats?.auto && isFiring && !this.weaponSystem.isMelee() && !this._prevFire;
    const melee   = this.weaponSystem.isMelee() && isFiring && !this._prevFire;
    this._prevFire = isFiring;

    const wsUpdate = this.weaponSystem.update(delta, isFiring);
    if (wsUpdate?.burstFire) {
      const burstRes = this.weaponSystem.shoot(this.camera, now);
      if (burstRes) return { shot: true, ...burstRes };
    }

    if (auto || single || melee) {
      if (melee) this._meleeSwingAnim();
      const res = this.weaponSystem.shoot(this.camera, now);
      if (res) return { shot: true, ...res };
    }

    for (const k of ['e','q','f']) if (this.abilityCooldowns[k] > 0) this.abilityCooldowns[k] = Math.max(0, this.abilityCooldowns[k] - delta);
    return null;
  }

  _meleeSwingAnim() {
    if (!this._vm || this._swinging) return;
    this._swinging = true;
    const t0 = performance.now();
    const orig = { x: this._vm.rotation.x, y: this._vm.rotation.y, z: this._vm.rotation.z };
    const swing = () => {
      const p = Math.min(1, (performance.now() - t0) / 200);
      const curve = p < 0.5 ? p * 2 : (1 - p) * 2;
      this._vm.rotation.x = orig.x - curve * 0.8;
      this._vm.rotation.z = orig.z + curve * 0.4;
      if (p < 1) requestAnimationFrame(swing);
      else { this._vm.rotation.x = orig.x; this._vm.rotation.z = orig.z; this._swinging = false; }
    };
    requestAnimationFrame(swing);
  }

  _getGround(colliders) {
    if (!colliders) return 0;
    let maxY = -Infinity;
    for (const c of colliders) {
      if (c.isGround) { maxY = Math.max(maxY, c.y || 0); continue; }
      if (!c.box) continue;
      // Check if standing on top of a box
      if (this.position.x > c.box.min.x - 0.4 && this.position.x < c.box.max.x + 0.4 &&
          this.position.z > c.box.min.z - 0.4 && this.position.z < c.box.max.z + 0.4) {
        const topY = c.box.max.y;
        if (topY > -Infinity && this.position.y - this.height * 0.5 <= topY + 0.5 && this.position.y - this.height * 0.5 >= topY - 1.5) {
          maxY = Math.max(maxY, topY);
        }
      }
    }
    return maxY === -Infinity ? 0 : maxY;
  }

  _resolveWalls(cols) {
    const pad = 0.45;
    for (const c of cols) {
      if (!c.box) continue;
      // Only block lateral movement for actual walls (not platforms we stand on)
      const topY = c.box.max.y;
      if (this.position.y - this.height * 0.5 > topY + 0.1) continue; // above box top — can stand on it
      if (this.position.y > topY + 0.4) continue; // clearly above — skip wall push
      if (this.position.x > c.box.min.x - pad && this.position.x < c.box.max.x + pad &&
          this.position.z > c.box.min.z - pad && this.position.z < c.box.max.z + pad &&
          this.position.y > c.box.min.y && this.position.y < c.box.max.y + 3) {
        const ox = Math.min(Math.abs(this.position.x - c.box.min.x), Math.abs(this.position.x - c.box.max.x));
        const oz = Math.min(Math.abs(this.position.z - c.box.min.z), Math.abs(this.position.z - c.box.max.z));
        if (ox < oz) { this.position.x = this.position.x < (c.box.min.x + c.box.max.x)/2 ? c.box.min.x - pad : c.box.max.x + pad; this.velocity.x = 0; }
        else         { this.position.z = this.position.z < (c.box.min.z + c.box.max.z)/2 ? c.box.min.z - pad : c.box.max.z + pad; this.velocity.z = 0; }
      }
    }
  }

  takeDamage(amount) {
    if (!this.isAlive || this.isInvincible) return 0;
    let dmg = amount;
    if (this.shield > 0) { const a = Math.min(this.shield, dmg); this.shield -= a; dmg -= a; }
    this.health -= dmg;
    if (this.health <= 0) { this.health = 0; this.isAlive = false; this.deaths++; }
    // Screen flash red
    const fl = document.createElement('div');
    fl.style.cssText = 'position:fixed;inset:0;background:rgba(255,0,0,0.18);pointer-events:none;z-index:8888;animation:damageFlash 0.35s ease forwards';
    document.body.appendChild(fl); setTimeout(()=>fl.remove(), 350);
    return amount;
  }

  respawn(sp) {
    this.isAlive = true; this.health = this.maxHealth; this.shield = this.charDef.maxShield;
    this.position.copy(sp); this.velocity.set(0, 0, 0);
    this.isInvincible = true; setTimeout(() => { this.isInvincible = false; }, 2500);
    this.weaponSystem.equip(this.charDef.weapon || 'assaultRifle');
    this._setupViewmodel();
  }

  getState() {
    return { position: this.position.clone(), yaw: this.yaw, pitch: this.pitch,
             health: this.health, shield: this.shield, isAlive: this.isAlive,
             ammo: this.weaponSystem.ammo, reserve: this.weaponSystem.reserve,
             isReloading: this.weaponSystem.isReloading,
             abilityCooldowns: { ...this.abilityCooldowns }, kills: this.kills, deaths: this.deaths };
  }

  destroy() {
    document.removeEventListener('keydown',   this._kd);
    document.removeEventListener('keyup',     this._ku);
    document.removeEventListener('mousemove', this._mm);
    document.removeEventListener('mousedown', this._md);
    document.removeEventListener('mouseup',   this._mu);
    if (this._vm && this.camera) this.camera.remove(this._vm);
  }
}

// ─────────────────────────────────────────────
// BOT AI — TACTICAL, ANIMATED, SMART
// ─────────────────────────────────────────────
const BOT_NAMES = [
  'ALPHA-7','NEXUS-3','VECTOR','GHOST-X','CIPHER','UNIT-9','PHANTOM',
  'BINARY','ROGUE-5','APEX-BOT','STATIC','PULSE','WRAITH-II','STORM',
  'VIPER-4','ORACLE-X','TITAN-9','BLAZE','VOID','ECHO'
];

class BotAI {
  constructor(scene, charId, team, spawnPos, difficulty) {
    this.scene   = scene;
    this.charDef = CHARACTERS.find(c => c.id === charId) || CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    this.team    = team;
    this.name    = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    this.id      = 'bot_' + Math.random().toString(36).substr(2, 6);
    this.isPlayer = false;
    this.charId  = charId;

    // ── Difficulty tuning ───────────────────
    const P = {
      easy:   { acc: 0.20, react: 2800, fr: 0.22, spd: 0.48, sightRange: 18, burstMax: 2, jumpChance: 0.03, meleeRange: 3.8 },
      medium: { acc: 0.50, react: 800,  fr: 0.55, spd: 0.78, sightRange: 38, burstMax: 4, jumpChance: 0.09, meleeRange: 3.2 },
      hard:   { acc: 0.76, react: 280,  fr: 0.88, spd: 1.00, sightRange: 56, burstMax: 7, jumpChance: 0.16, meleeRange: 2.8 }
    };
    this.p = P[difficulty] || P.medium;

    this._burstCount = 0; this._burstPause = 0;
    this.health = this.charDef.maxHealth; this.shield = this.charDef.maxShield;
    this.maxHealth = this.charDef.maxHealth; this.maxShield = this.charDef.maxShield;
    this.isAlive = true; this.isInvincible = false;
    this.kills = 0; this.deaths = 0; this.assists = 0;
    this.position = spawnPos.clone(); this.velocity = new THREE.Vector3();
    this.rotation = 0; this.isGrounded = true;
    this._groundY = 0;
    this.speed = 7.5 * this.charDef.speed * this.p.spd;

    const wid = this.charDef.weapon || 'assaultRifle';
    const ws = WEAPON_STATS[wid] || WEAPON_STATS.assaultRifle;
    this.wStats = ws; this.weaponId = wid;
    this.isMeleeWeapon = ws.type === 'melee';
    this.ammo = this.isMeleeWeapon ? 999 : ws.magSize;
    this.reserve = this.isMeleeWeapon ? 999 : ws.reserveAmmo;
    this.isReloading = false; this.reloadTimer = 0; this.lastShot = 0;
    this.state = 'patrol';
    this.reactionT = 0; this.reacted = false;
    this.strafeDir = 1; this.strafeT = 0;
    this.patrolPts = []; this.patrolIdx = 0; this.patrolWait = 0;
    this.stuckT = 0; this.prevPos = this.position.clone();
    this.jumpT = Math.random() * 3000;
    this._lastSeenPos = null; this._lastSeenTime = 0;
    this._coverPos = null; this._coverT = 0;
    this._flankAngle = Math.random() * Math.PI * 2;
    this._abilityCooldown = 0;
    this._grenadeT = 8000 + Math.random() * 12000; // grenade timer
    this._peekT = 0; // peek from cover timer
    this._suppressT = 0; // suppression fire mode
    this._aimOffset = new THREE.Vector3(); // jitter on aim
    this._aimOffsetT = 0;
    this._lastHealthRegen = 0;
    this._engageRange = this.p.sightRange; // same sight range for all weapon types; melee close-range handled in _transition

    // Nav waypoint system
    this._navWaypoints = null;
    this._navIdx = 0;
    this._navTimer = 0;
    this._jumpTimer = 0;
    this._platformQueue = []; // queued platform jumps

    // Build humanoid mesh
    this.mesh = buildCharMesh(charId, this.charDef, false);
    this.mesh.position.copy(this.position);
    this.mesh.userData.isBot = true;
    this.mesh.userData.botRef = this;
    // Tint team glow
    this.mesh.traverse(c => {
      if (c.isPointLight) c.color.setHex(team === 'a' ? 0x0055ff : 0xff2200);
    });
    scene.add(this.mesh);
    this._buildHPBar();
    this._buildBotWeapon();
  }

  _buildBotWeapon() {
    const ws = this.wStats;
    if (!ws || ws.type === 'melee') return;
    // Attach gun to the right forearm
    const wg = new THREE.Group();
    const bm = new THREE.MeshStandardMaterial({ color: ws.color, metalness: 0.8, roughness: 0.2 });
    const am = new THREE.MeshStandardMaterial({ color: ws.accentColor, metalness: 0.9, roughness: 0.1, emissive: new THREE.Color(ws.accentColor), emissiveIntensity: 0.3 });
    wg.add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.32), bm));
    const acc = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.10), am);
    acc.position.z = 0.18; wg.add(acc);
    // Muzzle
    const muz = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 6), am);
    muz.rotation.x = Math.PI/2; muz.position.z = 0.25; wg.add(muz);

    // Try to attach to right hand group, fallback to mesh root
    const rHand = this.mesh.userData.rElbow;
    if (rHand) {
      wg.position.set(0, -0.30, 0.04);
      wg.rotation.x = Math.PI / 2;
      rHand.add(wg);
    } else {
      wg.position.set(0.25, 1.05, 0.12);
      wg.rotation.y = -Math.PI / 2;
      this.mesh.add(wg);
    }
    this._weaponGroup = wg;
  }

  _buildHPBar() {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.085), new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, depthWrite: false })));
    this.hbFill = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.085), new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, depthWrite: false }));
    this.hbFill.position.z = 0.001; grp.add(this.hbFill);
    this.shFill = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.055), new THREE.MeshBasicMaterial({ color: 0x4488ff, side: THREE.DoubleSide, depthWrite: false }));
    const shBg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.055), new THREE.MeshBasicMaterial({ color: 0x111133, side: THREE.DoubleSide, depthWrite: false }));
    shBg.position.set(0, -0.10, 0); this.shFill.position.set(0, -0.10, 0.001); grp.add(shBg, this.shFill);
    grp.position.y = 2.4; this.mesh.add(grp); this.hpBarGrp = grp;
  }

  setGroundY(y) { this._groundY = y; this.position.y = Math.max(this.position.y, y + 0.9); }

  setPatrolPoints(pts) {
    this.patrolPts = pts && pts.length ? pts : [];
    if (this.patrolPts.length <= 1) {
      const base = this.patrolPts[0] || this.position;
      this.patrolPts = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = 14 + Math.random() * 28;
        this.patrolPts.push(new THREE.Vector3(
          Math.max(-85, Math.min(85, base.x + Math.cos(a)*r)),
          base.y,
          Math.max(-85, Math.min(85, base.z + Math.sin(a)*r))
        ));
      }
    }
  }

  setColliders(cols) {
    this._colliders = cols;
  }

  update(delta, enemies) {
    if (!this.isAlive) return null;

    this.strafeT        -= delta;
    this.jumpT          -= delta;
    this._abilityCooldown -= delta;
    this._grenadeT      -= delta;
    this._peekT         -= delta;
    this._suppressT     -= delta;
    this._aimOffsetT    -= delta;
    this._navTimer      -= delta;
    this._jumpTimer     -= delta;

    // Reload tick
    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const n = Math.min(this.wStats.magSize - this.ammo, this.reserve);
        this.ammo += n; this.reserve -= n;
      }
    }

    // Passive shield regen (hard bots only)
    if (this.p.acc >= 0.72 && this.shield < this.maxShield) {
      this._lastHealthRegen += delta;
      if (this._lastHealthRegen > 4000) { this.shield = Math.min(this.maxShield, this.shield + 8); this._lastHealthRegen = 0; }
    }

    // Refresh aim jitter periodically
    if (this._aimOffsetT <= 0) {
      this._aimOffsetT = 120 + Math.random() * 180;
      const jitter = (1 - this.p.acc) * 0.6;
      this._aimOffset.set((Math.random()-0.5)*jitter, (Math.random()-0.5)*jitter*0.5, (Math.random()-0.5)*jitter);
    }

    const enemy = this._nearest(enemies);
    this._transition(enemy, delta);

    let bullets = null;
    if      (this.state === 'patrol')  this._patrol(delta);
    else if (this.state === 'chase')   this._chase(delta, enemy);
    else if (this.state === 'attack')  bullets = this._attack(enemy, delta);
    else if (this.state === 'strafe')  { this._strafe(delta, enemy); bullets = this._attack(enemy, delta); }
    else if (this.state === 'flank')   { this._flank(delta, enemy); bullets = this._attack(enemy, delta); }
    else if (this.state === 'cover')   { this._moveToCover(delta); if (this._peekT <= 0) bullets = this._attack(enemy, delta); }
    else if (this.state === 'flee')    this._flee(delta, enemy);
    else if (this.state === 'search')  this._search(delta);
    else if (this.state === 'reload')  this._moveRandomly(delta);
    else if (this.state === 'suppress') { this._strafe(delta, enemy); bullets = this._attack(enemy, delta); }

    this._physics(delta);

    // Ally scatter
    if (this._allyPositions?.length) {
      for (const ap of this._allyPositions) {
        const dx = this.position.x - ap.x, dz = this.position.z - ap.z;
        const d2 = dx*dx + dz*dz;
        if (d2 < 9 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (3 - d) / 3 * 4;
          this.velocity.x += (dx/d) * push;
          this.velocity.z += (dz/d) * push;
        }
      }
    }

    this.mesh.position.copy(this.position);

    // Face enemy or direction of movement
    let targetRot = this.rotation;
    if (enemy && (this.state === 'attack' || this.state === 'strafe' || this.state === 'flank' || this.state === 'suppress')) {
      targetRot = Math.atan2(enemy.position.x - this.position.x, enemy.position.z - this.position.z);
    } else if (this.velocity.length() > 0.5) {
      targetRot = Math.atan2(this.velocity.x, this.velocity.z);
    }
    // Smooth rotation
    let dRot = targetRot - this.rotation;
    while (dRot > Math.PI)  dRot -= Math.PI * 2;
    while (dRot < -Math.PI) dRot += Math.PI * 2;
    this.rotation += dRot * 0.20;
    this.mesh.rotation.y = this.rotation;

    // Compute aim pitch toward enemy for animations
    let aimPitch = 0;
    if (enemy) {
      const dy = enemy.position.y + 1.2 - this.position.y;
      const dh = Math.sqrt((enemy.position.x-this.position.x)**2 + (enemy.position.z-this.position.z)**2);
      aimPitch = Math.atan2(dy, dh);
      if (this.mesh.userData) this.mesh.userData.aimPitch = aimPitch;
    }

    // Weapon aim angle
    if (this._weaponGroup && enemy) {
      const dy = enemy.position.y - this.position.y;
      const dh = this.position.distanceTo(enemy.position);
      this._weaponGroup.rotation.x = -Math.atan2(dy + 0.5, dh) * 0.6;
    }

    // Run full humanoid animation
    const speed = Math.sqrt(this.velocity.x**2 + this.velocity.z**2);
    animateCharMesh(this.mesh, speed, this.state, delta, 0, aimPitch);

    this._updateHPBar();
    this._tickHitFlash(delta);

    // Stuck detection — jump + sidestep to escape
    const moved = this.position.distanceTo(this.prevPos);
    if (moved < 0.04 && (this.state === 'chase' || this.state === 'patrol' || this.state === 'flank' || this.state === 'cover')) {
      this.stuckT += delta;
      if (this.stuckT > 900) {
        this.stuckT = 0;
        // Jump + push sideways to get past obstacle
        if (this.isGrounded) {
          this.velocity.y = 10 + Math.random() * 3;
          this.isGrounded = false;
        }
        const escapeAngle = this.rotation + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2) + (Math.random()-0.5)*0.8;
        this.velocity.x += Math.sin(escapeAngle) * this.speed * 1.4;
        this.velocity.z += Math.cos(escapeAngle) * this.speed * 1.4;
        // pick a fresh patrol point so bot doesn't keep running at same wall
        if (this.patrolPts.length) {
          this.patrolIdx = (this.patrolIdx + 1) % this.patrolPts.length;
        }
      }
    } else { this.stuckT = 0; }
    this.prevPos.copy(this.position);

    return bullets;
  }

  _nearest(enemies) {
    if (!enemies?.length) return null;
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (!e.isAlive) continue;
      const d = this.position.distanceTo(e.position);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  _transition(enemy, delta) {
    // Reload check
    if (!this.isMeleeWeapon && this.ammo === 0 && !this.isReloading) { this.state = 'reload'; this._startReload(); return; }
    if (!this.isMeleeWeapon && this.isReloading) { this.state = 'reload'; return; }
    if (this._burstPause > 0) this._burstPause -= delta;

    const hp   = this.health / this.maxHealth;
    const dist = enemy ? this.position.distanceTo(enemy.position) : Infinity;

    // Near death: always flee
    if (hp < 0.12 && dist < 45) { this.state = 'flee'; return; }

    // Hurt: retreat to cover
    if (hp < 0.40 && dist < 32 && !this._coverPos) {
      this._pickCoverPos(enemy);
      // Set peek timer so bot fires from cover
      this._peekT = 2500 + Math.random() * 2000;
    }
    if (this._coverPos && hp < 0.50 && this._coverT > 0) { this.state = 'cover'; return; }

    if (!enemy || !enemy.isAlive) {
      this.state = this._lastSeenPos ? 'search' : 'patrol';
      this.reacted = false; this.reactionT = 0;
      return;
    }

    this._lastSeenPos = enemy.position.clone();
    this._lastSeenTime = Date.now();

    if (dist <= this._engageRange) {
      // Reaction delay
      if (!this.reacted) {
        this.reactionT += delta;
        if (this.reactionT >= this.p.react) { this.reacted = true; this.reactionT = 0; }
        else { this.state = 'chase'; return; }
      }

      const optRange = this.isMeleeWeapon ? 2.5 : this.wStats.range * 0.45;
      const rng = Math.random();

      if (this.isMeleeWeapon) {
        if (dist > optRange + 0.8) this.state = 'chase'; // aggressive chase for melee
        else if (this.strafeT > 0 && dist > optRange * 0.8) this.state = 'strafe';
        else this.state = 'attack';
      } else {
        // Varied tactics based on distance + randomness + health
        if (dist > optRange * 1.5) {
          this.state = 'chase';
        } else if (dist < optRange * 0.20 && this.p.acc < 0.55) {
          this.state = 'flee'; // too close for ranged — escape
        } else if (this._suppressT > 0) {
          this.state = 'suppress';
        } else if (this.strafeT > 0) {
          this.state = 'strafe';
        } else if (rng < 0.18 && hp > 0.55) {
          this.state = 'flank';
          this._flankAngle = Math.atan2(this.position.z - enemy.position.z, this.position.x - enemy.position.x) + Math.PI * (Math.random() > 0.5 ? 0.5 : -0.5);
        } else if (rng < 0.28 && hp > 0.70 && dist < 20) {
          // Suppression burst
          this.state = 'suppress';
          this._suppressT = 1500 + Math.random() * 1200;
        } else {
          this.state = 'attack';
        }
      }

      // Reset strafe timer
      if (this.strafeT <= 0) {
        this.strafeT = 600 + Math.random() * 1400;
        this.strafeDir *= -1;
      }
    } else if (dist < this._engageRange * 2.2) {
      this.state = 'chase';
      this.reacted = false; this.reactionT = 0;
    } else {
      this.state = 'patrol';
      this.reacted = false;
    }

    // Smart jumping — bots use parkour to chase over terrain
    if (this.jumpT <= 0 && this.isGrounded) {
      // Jump more aggressively when chasing or near enemy elevation difference
      const elevDiff = enemy ? Math.abs(enemy.position.y - this.position.y) : 0;
      const jumpChance = this.p.jumpChance * (elevDiff > 1.5 ? 3.0 : 1.0) * (this.state === 'chase' ? 1.6 : 1.0);
      if (Math.random() < jumpChance) {
        this.velocity.y = 9.5 + Math.random() * 2;
        this.isGrounded = false;
        this.jumpT = 2500 + Math.random() * 4000;
      }
    }
  }

  _patrol(delta) {
    // In KOTH mode, patrol TOWARD the capture zone
    if (this._kothZonePos) {
      const dx = this._kothZonePos.x - this.position.x;
      const dz = this._kothZonePos.z - this.position.z;
      const d  = Math.sqrt(dx*dx+dz*dz);
      if (d > 3) {
        const s = this.speed * 0.70;
        this.velocity.x += (dx/d * s - this.velocity.x) * 0.12;
        this.velocity.z += (dz/d * s - this.velocity.z) * 0.12;
      }
      return;
    }
    if (!this.patrolPts.length) return;
    this.patrolWait -= delta; if (this.patrolWait > 0) return;
    const t = this.patrolPts[this.patrolIdx];
    if (!t) return;
    const dx = t.x - this.position.x, dz = t.z - this.position.z;
    const d = Math.sqrt(dx*dx + dz*dz);
    if (d < 2.5) {
      this.patrolIdx = (this.patrolIdx + 1) % this.patrolPts.length;
      this.patrolWait = 400 + Math.random() * 800;
      return;
    }
    const s = this.speed * 0.60;
    this.velocity.x += (dx/d * s - this.velocity.x) * 0.12;
    this.velocity.z += (dz/d * s - this.velocity.z) * 0.12;
  }

  _chase(delta, e) {
    if (!e) return;
    const dx = e.position.x - this.position.x, dz = e.position.z - this.position.z;
    const d = Math.sqrt(dx*dx + dz*dz) || 1;
    const spd = this.isMeleeWeapon ? this.speed * 1.25 : this.speed;
    this.velocity.x += (dx/d * spd - this.velocity.x) * 0.16;
    this.velocity.z += (dz/d * spd - this.velocity.z) * 0.16;

    // Jump toward enemy if enemy is significantly higher
    if (e.position.y > this.position.y + 2.0 && this.isGrounded && this._jumpTimer <= 0) {
      this.velocity.y = 10 + Math.min(4, (e.position.y - this.position.y) * 0.4);
      this.isGrounded = false;
      this._jumpTimer = 1500;
    }
  }

  _attack(e, delta) {
    if (!e || !e.isAlive || !this.reacted) return null;
    if (this._burstPause > 0) return null;

    const now = performance.now();

    // MELEE
    if (this.isMeleeWeapon) {
      const dist = this.position.distanceTo(e.position);
      const mRange = this.wStats.meleeRadius || this.wStats.range || 2.5;
      if (dist > mRange + 0.5) return null;
      const fireInterval = 60000 / this.wStats.fireRate;
      if (now - this.lastShot < fireInterval) return null;
      this.lastShot = now;
      return [{
        id: 'melee_' + Math.random().toString(36).substr(2,6),
        position: this.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
        direction: e.position.clone().sub(this.position).normalize(),
        speed: 0, damage: this.wStats.damage,
        range: this.wStats.meleeRadius || 2.5,
        meleeArc: this.wStats.meleeArc || 2.0,
        distanceTraveled: 0, alive: true, isMelee: true,
        ownerId: this.id, ownerTeam: this.team
      }];
    }

    // GUN
    if (this.isReloading || this.ammo <= 0) return null;
    // p.fr is 0..1: hard=0.88 fires close to max RPM, easy=0.22 fires much slower
    const fireInterval = (60000 / this.wStats.fireRate) * (1 + (1 - this.p.fr) * 3.5);
    if (now - this.lastShot < fireInterval) return null;
    this.lastShot = now;
    this.ammo = Math.max(0, this.ammo - 1);
    this._burstCount++;
    if (this._burstCount >= this.p.burstMax) {
      this._burstCount = 0;
      this._burstPause = Math.round(120 / this.p.fr) + Math.random() * Math.round(250 / this.p.fr);
    }

    // Predictive aiming: lead moving targets
    const origin = this.position.clone().add(new THREE.Vector3(0, 1.55, 0));
    const travelTime = this.position.distanceTo(e.position) / 130;
    const predicted = e.position.clone().add(
      e.velocity ? e.velocity.clone().multiplyScalar(travelTime * this.p.acc) : new THREE.Vector3()
    );
    const aimTarget = predicted.clone().add(new THREE.Vector3(0, 1.1, 0)).add(this._aimOffset);
    const idealDir = aimTarget.sub(origin).normalize();

    // Spread based on accuracy
    const sp = (1 - this.p.acc) * 0.12;
    idealDir.x += (Math.random() - 0.5) * sp;
    idealDir.y += (Math.random() - 0.5) * sp * 0.45;
    idealDir.z += (Math.random() - 0.5) * sp;
    idealDir.normalize();

    const bullets = [];
    const pellets = this.wStats.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      const d = idealDir.clone();
      if (p > 0) { d.x += (Math.random()-0.5)*0.10; d.z += (Math.random()-0.5)*0.10; d.normalize(); }
      bullets.push({
        id: 'b_' + Math.random().toString(36).substr(2,6),
        position: origin.clone(), direction: d,
        speed: 130, damage: this.wStats.damage,
        range: this.wStats.range, distanceTraveled: 0,
        alive: true, isMelee: false,
        ownerId: this.id, ownerTeam: this.team
      });
    }
    this._botMuzzleFlash();
    return bullets;
  }

  _botMuzzleFlash() {
    if (!this._muzzleLight) {
      this._muzzleLight = new THREE.PointLight(0xffaa44, 0, 5);
      this.scene.add(this._muzzleLight);
    }
    const fwd = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    this._muzzleLight.position.copy(this.position).addScaledVector(fwd, 0.7).add(new THREE.Vector3(0, 1.4, 0));
    this._muzzleLight.intensity = 7;
    clearTimeout(this._muzzleT);
    this._muzzleT = setTimeout(() => { if (this._muzzleLight) this._muzzleLight.intensity = 0; }, 65);
  }

  _flank(delta, e) {
    if (!e) return;
    this._flankAngle += delta * 0.0008;
    const r = 10 + Math.random() * 4;
    const tx = e.position.x + Math.cos(this._flankAngle) * r;
    const tz = e.position.z + Math.sin(this._flankAngle) * r;
    const dx = tx - this.position.x, dz = tz - this.position.z;
    const d = Math.sqrt(dx*dx + dz*dz) || 1;
    this.velocity.x += (dx/d * this.speed - this.velocity.x) * 0.13;
    this.velocity.z += (dz/d * this.speed - this.velocity.z) * 0.13;
  }

  _pickCoverPos(enemy) {
    if (!enemy) return;
    const dx = this.position.x - enemy.position.x, dz = this.position.z - enemy.position.z;
    const d = Math.sqrt(dx*dx+dz*dz) || 1;
    // Pick a position 12-18 units away, behind current position (away from enemy)
    const coverDist = 12 + Math.random() * 6;
    const lateralOffset = (Math.random()-0.5) * 10;
    this._coverPos = new THREE.Vector3(
      this.position.x + (dx/d)*coverDist + (-dz/d)*lateralOffset,
      0,
      this.position.z + (dz/d)*coverDist + (dx/d)*lateralOffset
    );
    this._coverT = 4000 + Math.random() * 2000;
  }

  _moveToCover(delta) {
    this._coverT -= delta;
    if (!this._coverPos || this._coverT <= 0 || this.position.distanceTo(this._coverPos) < 2) {
      this._coverPos = null; this.state = 'patrol'; return;
    }
    const dx = this._coverPos.x - this.position.x, dz = this._coverPos.z - this.position.z;
    const d = Math.sqrt(dx*dx+dz*dz) || 1;
    this.velocity.x += (dx/d * this.speed*1.2 - this.velocity.x) * 0.20;
    this.velocity.z += (dz/d * this.speed*1.2 - this.velocity.z) * 0.20;
  }

  _strafe(delta, e) {
    if (!e) return;
    const dx = e.position.x - this.position.x, dz = e.position.z - this.position.z;
    const d = Math.sqrt(dx*dx + dz*dz) || 1;
    this.velocity.x += (-dz/d * this.strafeDir * this.speed * 0.88 - this.velocity.x) * 0.16;
    this.velocity.z += ( dx/d * this.strafeDir * this.speed * 0.88 - this.velocity.z) * 0.16;
    // Maintain optimal range
    const optDist = this.isMeleeWeapon ? 2.5 : this.wStats.range * 0.38;
    const pushBack = d - optDist;
    if (Math.abs(pushBack) > 2.5) {
      this.velocity.x += (dx/d * (pushBack > 0 ? 2.2 : -2.2) - this.velocity.x) * 0.08;
      this.velocity.z += (dz/d * (pushBack > 0 ? 2.2 : -2.2) - this.velocity.z) * 0.08;
    }
  }

  _flee(delta, e) {
    if (!e) return;
    const dx = this.position.x - e.position.x, dz = this.position.z - e.position.z;
    const d = Math.sqrt(dx*dx + dz*dz) || 1;
    this.velocity.x += (dx/d * this.speed * 1.35 - this.velocity.x) * 0.18;
    this.velocity.z += (dz/d * this.speed * 1.35 - this.velocity.z) * 0.18;
    if (this.isGrounded && Math.random() < 0.06) {
      this.velocity.y = 9.5; this.isGrounded = false;
    }
  }

  _search(delta) {
    if (!this._lastSeenPos) return;
    const dx = this._lastSeenPos.x - this.position.x, dz = this._lastSeenPos.z - this.position.z;
    const d = Math.sqrt(dx*dx + dz*dz);
    if (d < 2.5 || (Date.now() - this._lastSeenTime) > 8000) {
      this._lastSeenPos = null; this.state = 'patrol'; return;
    }
    this.velocity.x += (dx/d * this.speed * 0.65 - this.velocity.x) * 0.10;
    this.velocity.z += (dz/d * this.speed * 0.65 - this.velocity.z) * 0.10;
  }

  _moveRandomly(delta) {
    if (this._navTimer > 0) return;
    this._navTimer = 1000 + Math.random() * 1500;
    const a = Math.random() * Math.PI * 2;
    this.velocity.x += Math.cos(a) * this.speed * 0.45;
    this.velocity.z += Math.sin(a) * this.speed * 0.45;
  }

  _startReload() {
    if (this.isReloading || this.reserve <= 0) return;
    this.isReloading = true;
    this.reloadTimer = this.wStats.reloadTime * 1.1;
  }

  _physics(delta) {
    const dt = delta / 1000;
    // Gravity
    if (!this.isGrounded) this.velocity.y += -24 * dt;

    // Move in X and Z separately so wall sliding works
    this.position.x += this.velocity.x * dt;
    this._resolveWallsBot('x');
    this.position.z += this.velocity.z * dt;
    this._resolveWallsBot('z');
    this.position.y += this.velocity.y * dt;

    // Ground check against flat ground AND platform tops
    const groundY = this._getGroundBot();
    const botH = 0.9; // half-height offset so feet touch ground
    if (this.position.y <= groundY + botH) {
      this.position.y = groundY + botH;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    // Friction — frame-rate independent (0.88 per second allows bots to maintain speed)
    const fric = Math.pow(0.88, delta / 1000);
    this.velocity.x *= fric; this.velocity.z *= fric;
    // Clamp to arena bounds
    this.position.x = Math.max(-190, Math.min(190, this.position.x));
    this.position.z = Math.max(-190, Math.min(190, this.position.z));
  }

  _getGroundBot() {
    const cols = this._colliders;
    if (!cols) return this._groundY || 0;
    // groundY: base ground or -500 safety net (for sky map, bots respawn if they fall)
    let maxY = this._groundY !== undefined ? this._groundY : 0;
    for (const c of cols) {
      if (c.isGround) { maxY = Math.max(maxY, c.y || 0); continue; }
      if (!c.box) continue;
      const b = c.box;
      // Must be horizontally within the box footprint
      if (this.position.x > b.min.x - 0.45 && this.position.x < b.max.x + 0.45 &&
          this.position.z > b.min.z - 0.45 && this.position.z < b.max.z + 0.45) {
        const topY = b.max.y;
        // Bot feet (position.y - 0.9) must be at or just above the platform top
        const footY2 = this.position.y - 0.9;
        if (topY > maxY && footY2 <= topY + 0.8 && footY2 >= topY - 1.5) {
          maxY = topY;
        }
      }
    }
    return maxY;
  }

  _resolveWallsBot(axis) {
    const cols = this._colliders;
    if (!cols) return;
    const pad = 0.42;
    for (const c of cols) {
      if (!c.box) continue;
      const b = c.box;
      // Only push laterally if we are inside the box vertically (not standing on top)
      const footY = this.position.y - 0.9;
      if (footY >= b.max.y - 0.05) continue; // standing on top — skip wall push
      if (this.position.y < b.min.y + 0.1)   continue; // below box — skip
      if (axis === 'x') {
        if (this.position.x > b.min.x - pad && this.position.x < b.max.x + pad &&
            this.position.z > b.min.z - pad && this.position.z < b.max.z + pad) {
          const midX = (b.min.x + b.max.x) / 2;
          if (this.position.x < midX) { this.position.x = b.min.x - pad; }
          else                        { this.position.x = b.max.x + pad; }
          this.velocity.x *= -0.1; // bounce slightly to avoid re-penetration
        }
      } else {
        if (this.position.x > b.min.x - pad && this.position.x < b.max.x + pad &&
            this.position.z > b.min.z - pad && this.position.z < b.max.z + pad) {
          const midZ = (b.min.z + b.max.z) / 2;
          if (this.position.z < midZ) { this.position.z = b.min.z - pad; }
          else                        { this.position.z = b.max.z + pad; }
          this.velocity.z *= -0.1;
        }
      }
    }
  }

  _updateHPBar() {
    if (!this.hbFill) return;
    const r = Math.max(0, this.health / this.maxHealth);
    this.hbFill.scale.x = Math.max(0.001, r);
    this.hbFill.position.x = (r - 1) * 0.45;
    this.hbFill.material.color.setHex(r > 0.5 ? 0x00ff88 : r > 0.25 ? 0xffaa00 : 0xff2200);
    if (this.shFill && this.maxShield > 0) {
      const sr = Math.max(0, this.shield / this.maxShield);
      this.shFill.scale.x = Math.max(0.001, sr);
      this.shFill.position.x = (sr - 1) * 0.45;
    }
    if (this.hpBarGrp) {
      // Billboard: face the camera by using the inverse of the world Y rotation
      // We can't easily get camera here so just negate mesh.rotation.y
      this.hpBarGrp.rotation.y = -this.mesh.rotation.y;
    }
  }

  takeDamage(amount) {
    if (!this.isAlive) return 0;
    if (this.isInvincible) return 0;
    let dmg = Math.max(1, Math.floor(amount));

    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed; dmg -= absorbed;
    }
    this.health = Math.max(0, this.health - dmg);

    this._hitFlashT = 130;
    if (!this._matCache) this._buildMatCache();
    for (const m of this._matCache) { m.emissive.setHex(0xff2200); m.emissiveIntensity = 3.5; }

    if (!window._dmgQueue) window._dmgQueue = [];
    window._dmgQueue.push({ pos: this.position.clone().add(new THREE.Vector3(0, 2.5, 0)), amount: Math.round(dmg), t: performance.now() });

    this.reacted = true;
    if (this.state === 'patrol' || this.state === 'search') this.state = 'chase';

    if (this.health <= 0) {
      this.health = 0; this.isAlive = false; this.deaths++;
      this._die();
    }
    return amount;
  }

  _buildMatCache() {
    this._matCache = []; this._matOrigEmissive = []; this._matOrigEI = [];
    this.mesh.traverse(c => {
      if (!c.isMesh || !c.material) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      for (const m of mats) {
        if (m.emissive !== undefined) {
          this._matCache.push(m);
          this._matOrigEmissive.push(m.emissive.clone());
          this._matOrigEI.push(m.emissiveIntensity || 0);
        }
      }
    });
  }

  _tickHitFlash(delta) {
    if (!this._hitFlashT || this._hitFlashT <= 0) return;
    this._hitFlashT -= delta;
    if (this._hitFlashT <= 0) {
      this._hitFlashT = 0;
      if (!this._matCache) return;
      for (let i = 0; i < this._matCache.length; i++) {
        this._matCache[i].emissive.copy(this._matOrigEmissive[i]);
        this._matCache[i].emissiveIntensity = this._matOrigEI[i];
      }
    }
  }

  _die() {
    const t0 = performance.now();
    const fall = () => {
      const pct = Math.min(1, (performance.now() - t0) / 600);
      this.mesh.rotation.x = pct * Math.PI / 2;
      this.mesh.position.y = this.position.y - pct * 0.6;
      if (pct < 1) requestAnimationFrame(fall);
      else setTimeout(() => { if (this.scene && this.mesh.parent) this.scene.remove(this.mesh); }, 3500);
    };
    requestAnimationFrame(fall);
  }

  respawn(sp) {
    this.isAlive = true; this.health = this.maxHealth; this.shield = this.charDef.maxShield;
    this.position.copy(sp); this.velocity.set(0, 0, 0);
    this.mesh.rotation.x = 0; this.mesh.position.copy(this.position);
    if (!this.mesh.parent) this.scene.add(this.mesh);
    if (!this.isMeleeWeapon) this.ammo = this.wStats.magSize;
    this.isReloading = false;
    this.state = 'patrol'; this.reacted = false; this._coverPos = null;
  }
}


// ─────────────────────────────────────────────
// MAP BUILDER — Large enclosed arenas with
// full parkour, interior structures, multi-level
// ─────────────────────────────────────────────
class MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.spawnPoints = { a: [], b: [] };
    this.shopPositions = [];
  }

  build(mapId) {
    this.colliders = []; this.spawnPoints = { a: [], b: [] }; this.shopPositions = [];
    const fns = {
      neonCity:    () => this._neonCity(),
      jungle:      () => this._jungle(),
      desertRuins: () => this._desert(),
      neonJungle:  () => this._neonJungle(),
      cyberDesert: () => this._cyberDesert(),
      factory:     () => this._factory(),
      skyPlatforms:() => this._sky()
    };
    (fns[mapId] || fns.neonCity)();
    return { colliders: this.colliders, spawnPoints: this.spawnPoints, shopPositions: this.shopPositions };
  }

  _texMat(col, em=0, ei=0.2, met=0.3, rou=0.6, tileType=null) {
    const mat = new THREE.MeshStandardMaterial({ color: col, metalness: met, roughness: rou,
      emissive: new THREE.Color(em||0), emissiveIntensity: em ? ei : 0 });
    if (tileType) {
      if (!MapBuilder._texCache) MapBuilder._texCache = {};
      if (!MapBuilder._texCache[tileType]) {
        const size = 128;
        const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#444'; ctx.fillRect(0,0,size,size);
        if (tileType === 'neon') { ctx.strokeStyle='rgba(0,245,255,0.15)';ctx.lineWidth=1;for(let i=0;i<=8;i++){ctx.beginPath();ctx.moveTo(i*16,0);ctx.lineTo(i*16,size);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*16);ctx.lineTo(size,i*16);ctx.stroke();} }
        else if (tileType === 'metal') { ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(i*16,0);ctx.lineTo(i*16,size);ctx.stroke();}ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=3;[40,80,110].forEach(y=>{ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(size,y);ctx.stroke();}); }
        else if (tileType === 'stone') { ctx.strokeStyle='rgba(0,0,0,0.35)';ctx.lineWidth=2;[[0,0,90,55],[0,57,70,55],[0,114,80,55]].forEach(([x,y,w,h])=>{ctx.strokeRect(x,y,Math.min(w,size-x),Math.min(h,size-y));}); }
        else if (tileType === 'sand') { for(let i=0;i<80;i++){const x=Math.random()*size,y=Math.random()*size;ctx.fillStyle='rgba(200,165,80,0.3)';ctx.fillRect(x,y,2,2);} }
        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(4,4);
        MapBuilder._texCache[tileType] = tex;
      }
      mat.map = MapBuilder._texCache[tileType];
    }
    return mat;
  }

  _mat(col, em=0, ei=0.2, met=0.3, rou=0.6) { return this._texMat(col,em,ei,met,rou); }

  _box(w,h,d,x,y,z,col,em=0,opts={}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
      this._mat(col,em,opts.ei??0.2,opts.m??0.3,opts.r??0.55));
    const cy = y+h/2;
    mesh.position.set(x,cy,z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.colliders.push({box: new THREE.Box3(
      new THREE.Vector3(x-w/2,cy-h/2,z-d/2),
      new THREE.Vector3(x+w/2,cy+h/2,z+d/2))});
    return mesh;
  }

  _wall(w,h,d,x,y,z,col,em=0,opts={}) { return this._box(w,h,d,x,y,z,col,em,opts); }

  _ramp(w,h,d,x,y,z,col,rotY=0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), this._mat(col,0,0,0.3,0.8));
    const cy = y+h/2; mesh.position.set(x,cy,z);
    mesh.rotation.y = rotY; mesh.rotation.x = -Math.PI/10;
    mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh);
    this.colliders.push({box: new THREE.Box3(new THREE.Vector3(x-w/2-0.2,y-0.2,z-d/2-0.2),new THREE.Vector3(x+w/2+0.2,cy+h/2+0.2,z+d/2+0.2))});
    return mesh;
  }

  _stairs(x,z,dir,steps,stepW,stepH,stepD,col,startY=0) {
    for(let i=0;i<steps;i++){
      const sx=x+(dir==='x'?i*stepD:0), sz=z+(dir==='z'?i*stepD:0), sy=startY+i*stepH;
      this._box(stepW,stepH,stepD,sx,sy,sz,col,0,{m:0.3,r:0.8});
    }
  }

  _cyl(rt,rb,h,x,y,z,col,em=0) {
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,10),this._mat(col,em,0.3,0.5,0.3));
    const cy=y+h/2; m.position.set(x,cy,z); m.castShadow=true; this.scene.add(m);
    const r=Math.max(rt,rb);
    this.colliders.push({box:new THREE.Box3(new THREE.Vector3(x-r,cy-h/2,z-r),new THREE.Vector3(x+r,cy+h/2,z+r))});
  }

  _light(x,y,z,col,int=2,dist=20) {
    const l=new THREE.PointLight(col,int,dist); l.position.set(x,y,z); this.scene.add(l);
  }

  _amb(sky,fog,fn,ff,ai=0.45) {
    this.scene.background=new THREE.Color(sky);
    this.scene.fog=new THREE.Fog(fog,fn,ff);
    this.scene.add(new THREE.AmbientLight(0xffffff,ai));
    const d=new THREE.DirectionalLight(0xffffff,1.0);
    d.position.set(60,120,40); d.castShadow=true;
    d.shadow.mapSize.width=d.shadow.mapSize.height=1024;
    d.shadow.camera.left=d.shadow.camera.bottom=-150;
    d.shadow.camera.right=d.shadow.camera.top=150;
    this.scene.add(d);
  }

  _spawns(ax,az,bx,bz,s=8) {
    [[-1,-1],[1,-1],[-1,1],[1,1],[0,-1.5],[0,1.5],[-1.5,0],[1.5,0]].forEach(([ox,oz]) => {
      this.spawnPoints.a.push(new THREE.Vector3(ax+ox*s*0.5,1,az+oz*s*0.5));
      this.spawnPoints.b.push(new THREE.Vector3(bx+ox*s*0.5,1,bz+oz*s*0.5));
    });
  }

  _addShop(x,z,color=0x00f5ff) {
    const base=new THREE.Mesh(new THREE.BoxGeometry(3.5,0.3,3.5),this._mat(0x111122,0,0,0.8,0.2));
    base.position.set(x,0.15,z); base.receiveShadow=true; this.scene.add(base);
    const body=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.1,0.4),this._mat(0x0a1a2a,0,0,0.9,0.1));
    body.position.set(x,0.85,z); this.scene.add(body);
    const screen=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.7,0.05),new THREE.MeshStandardMaterial({color:0,emissive:new THREE.Color(color),emissiveIntensity:0.9}));
    screen.position.set(x,0.95,z+0.23); this.scene.add(screen);
    const sign=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.22,0.04),new THREE.MeshBasicMaterial({color}));
    sign.position.set(x,1.65,z+0.22); this.scene.add(sign);
    [[-1.1,0.02],[1.1,0.02]].forEach(([ox,oz])=>{
      const p=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,2.2,6),new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color),emissiveIntensity:0.5}));
      p.position.set(x+ox,1.1,z+oz); this.scene.add(p);
    });
    const lt=new THREE.PointLight(color,2.5,9); lt.position.set(x,2.2,z); this.scene.add(lt);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.45,0.04,6,18),new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color),emissiveIntensity:1.0}));
    ring.position.set(x,1.55,z-0.6); ring.rotation.x=Math.PI/2; this.scene.add(ring);
    ring.userData.spinShop=true;
    if(!MapBuilder._shopRings) MapBuilder._shopRings=[];
    MapBuilder._shopRings.push(ring);
    this.shopPositions.push({x,z,color});
    this.colliders.push({box:new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x,0.85,z),new THREE.Vector3(2.4,1.7,0.6))});
  }

  // ── Enclosed Arena border walls ──
  _arenaWalls(size, wallH, col, em=0) {
    const t = 2; // wall thickness
    this._box(size*2+t*2, wallH, t, 0, 0, -size, col, em, {m:0.5}); // N
    this._box(size*2+t*2, wallH, t, 0, 0,  size, col, em, {m:0.5}); // S
    this._box(t, wallH, size*2, -size, 0, 0, col, em, {m:0.5}); // W
    this._box(t, wallH, size*2,  size, 0, 0, col, em, {m:0.5}); // E
  }

  // ── NEON CITY — huge enclosed cyberpunk arena ─────────────────────────────
  _neonCity() {
    this._amb(0x020509, 0x020509, 60, 220);
    const floorMat = this._texMat(0x0d1117, 0, 0, 0.1, 0.9, 'neon');
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(280,280), floorMat);
    floor.rotation.x=-Math.PI/2; floor.receiveShadow=true;
    this.scene.add(floor); this.colliders.push({isGround:true,y:0});

    // Neon grid road lines
    for(let i=-7;i<=7;i++){
      const m=new THREE.Mesh(new THREE.PlaneGeometry(0.15,280),new THREE.MeshBasicMaterial({color:0x00f5ff,transparent:true,opacity:0.10}));
      m.rotation.x=-Math.PI/2; m.position.set(i*14,0.01,0); this.scene.add(m);
      const m2=m.clone(); m2.rotation.y=Math.PI/2; m2.position.set(0,0.01,i*14); this.scene.add(m2);
    }

    // ── ARENA PERIMETER WALLS ──────────────────
    this._arenaWalls(90, 18, 0x080f1e, 0x00f5ff);
    // Corner towers
    [[-88,0,-88],[88,0,-88],[-88,0,88],[88,0,88]].forEach(([x,y,z],i) => {
      const ac = [0x00f5ff,0xff6600,0x00aaff,0xff2200][i];
      this._box(10,30,10,x,y,z,0x06101e,ac,{ei:0.25}); this._light(x,30,z,ac,3,25);
      [8,16,24].forEach(ly => this._box(11,0.6,11,x,ly,z,0x0a1826,ac,{ei:0.3}));
      // Catwalk from corner tower to inner wall ledge
      if (x < 0 && z < 0) this._box(24,0.5,2,-76,16,-76,0x1a2a3a,0x00f5ff,{ei:0.2});
    });

    // ── TEAM A BASE (northwest) ────────────────
    // Main tower
    this._box(14,28,14,-58,0,-58,0x080e1c,0x00f5ff,{ei:0.15}); this._light(-58,28,-58,0x00f5ff,2.5,30);
    this._box(10,0.6,10,-58,28,-58,0x112233,0x00f5ff,{ei:0.3}); // rooftop
    this._box(6,0.6,6,-58,35,-58,0x1a2a3a,0x00aaff,{ei:0.4});   // upper
    this._box(3,0.6,3,-58,41,-58,0x223344,0x00f5ff,{ei:0.6});   // sniper

    // Secondary buildings
    this._box(10,18,10,-40,0,-58,0x0a1422,0x00aaff,{ei:0.12}); this._light(-40,18,-58,0x00aaff,2,22);
    this._box(12,24,12,-58,0,-40,0x080e1c,0xff6600,{ei:0.14}); this._light(-58,24,-40,0xff6600,2.5,26);
    this._box(8,14,8,-44,0,-44,0x0a1a2a,0x00f5ff,{ei:0.12});

    // Stairs & ramps into A base
    this._stairs(-64,-52,'x',7,4,3,4,0x0a1520,0);
    this._stairs(-52,-64,'z',7,4,3,4,0x0a1520,0);
    this._ramp(3.5,6,12,-50,0,-44,0x1a2233);
    this._ramp(3.5,6,12,-44,0,-50,0x1a2233,Math.PI/2);

    // Internal catwalk network A-side
    this._box(20,0.5,2,-49,18,-58,0x1a2a3a,0x00f5ff,{ei:0.2});  // A rooftop bridge 1
    this._box(2,0.5,20,-58,18,-49,0x1a2a3a,0x00aaff,{ei:0.2});  // A rooftop bridge 2
    this._box(14,0.5,2,-51,10,-44,0x1a2233,0x00f5ff,{ei:0.15}); // mid height catwalk
    this._box(2,0.5,14,-44,10,-51,0x1a2233,0x00f5ff,{ei:0.15});

    // Cover low walls inside A base
    [[-52,-52],[-46,-52],[-52,-46],[-46,-46]].forEach(([px,pz]) =>
      this._box(4,2,1.2,px,0,pz,0x1a2233,0x00f5ff,{ei:0.15}));

    // ── TEAM B BASE (southeast) ──────────────
    this._box(14,28,14,58,0,58,0x1a0808,0xff4400,{ei:0.15}); this._light(58,28,58,0xff4400,2.5,30);
    this._box(10,0.6,10,58,28,58,0x331211,0xff4400,{ei:0.3});
    this._box(6,0.6,6,58,35,58,0x3a1a1a,0xff2200,{ei:0.4});
    this._box(3,0.6,3,58,41,58,0x441a1a,0xff4400,{ei:0.6});
    this._box(10,18,10,40,0,58,0x1a0e0a,0xff8800,{ei:0.12}); this._light(40,18,58,0xff8800,2,22);
    this._box(12,24,12,58,0,40,0x180808,0xff0022,{ei:0.14}); this._light(58,24,40,0xff0022,2.5,26);
    this._box(8,14,8,44,0,44,0x1a0a0a,0xff4400,{ei:0.12});
    this._stairs(60,48,'x',7,4,3,4,0x1a0a0a,0);
    this._stairs(48,60,'z',7,4,3,4,0x1a0a0a,0);
    this._ramp(3.5,6,12,50,0,44,0x2a1a1a);
    this._ramp(3.5,6,12,44,0,50,0x2a1a1a,Math.PI/2);
    this._box(20,0.5,2,49,18,58,0x2a1a1a,0xff4400,{ei:0.2});
    this._box(2,0.5,20,58,18,49,0x2a1a1a,0xff6600,{ei:0.2});
    this._box(14,0.5,2,51,10,44,0x2a1a1a,0xff4400,{ei:0.15});
    this._box(2,0.5,14,44,10,51,0x2a1a1a,0xff4400,{ei:0.15});
    [[52,52],[46,52],[52,46],[46,46]].forEach(([px,pz]) =>
      this._box(4,2,1.2,px,0,pz,0x2a1a1a,0xff4400,{ei:0.15}));

    // ── MID ZONE — central arena with multi-level parkour ──
    // Outer cover walls in mid
    [[22,2.5,1.5,0,0,-14],[22,2.5,1.5,0,0,14],[1.5,2.5,22,-14,0,0],[1.5,2.5,22,14,0,0]].forEach(([w,h,d,x,y,z]) =>
      this._box(w,h,d,x,y,z,0x1a2233,0x00aaff,{ei:0.25}));

    // Central raised platform
    this._box(12,1.5,12,0,0,0,0x1a2a3a,0x00f5ff,{ei:0.45});
    this._box(7,0.6,7,0,5,0,0x223344,0x00f5ff,{ei:0.4});
    this._box(4,0.6,4,0,9,0,0x2a3a4a,0x00aaff,{ei:0.5});
    this._box(2,4,2,0,13,0,0x1a3a5a,0x00f5ff,{ei:0.7}); // spire

    // Ramps up to center platform from all 4 sides
    [[6,0,0,0],[  -6,0,0,Math.PI],[0,0,6,Math.PI/2],[0,0,-6,-Math.PI/2]].forEach(([dx,dy,dz,ry]) =>
      this._ramp(3,1.5,6,dx,0,dz,0x1a2a3a,ry));

    // Mid floating platforms — stepped vertically
    [[-24,7,0],[24,7,0],[0,7,-24],[0,7,24],
     [-18,10,18],[18,10,-18],[-18,10,-18],[18,10,18],
     [-30,4,-12],[30,4,12],[-12,4,-30],[12,4,30]].forEach(([x,y,z],i) => {
      const col = i%3===0?0x1a2233:i%3===1?0x221a33:0x1a3322;
      const ac  = i%3===0?0x00aaff:i%3===1?0xaa44ff:0x00ff88;
      this._box(7,0.5,7,x,y,z,col,ac,{ei:0.35}); this._light(x,y+3,z,ac,1.8,14);
    });

    // Connecting bridges across mid
    this._box(28,0.5,2,0,7,0,0x1a2233,0x00aaff,{ei:0.2});  // E-W bridge at height 7
    this._box(2,0.5,28,0,7,0,0x1a2233,0x00aaff,{ei:0.2});  // N-S bridge

    // Tall parkour pillars mid-lane
    [[-28,0,0],[28,0,0],[0,0,-28],[0,0,28],[-20,0,-20],[20,0,20]].forEach(([x,y,z]) => {
      this._box(2.5,16,2.5,x,y,z,0x1a2233,0x00f5ff,{ei:0.2});
      this._light(x,16,z,0x00f5ff,1.5,12);
      [4,8,12].forEach(ly => this._box(3.5,0.5,3.5,x,ly,z,0x223344,0x00f5ff,{ei:0.3}));
    });

    // ── CORRIDORS connecting bases to mid ──
    // North corridor (A→mid)
    this._box(8,5,30,-20,0,-40,0x0d1420,0x00aaff,{ei:0.08}); // corridor walls
    this._box(8,5,30, 20,0,-40,0x0d1420,0x00aaff,{ei:0.08});
    // South corridor
    this._box(8,5,30,-20,0,40,0x140d0d,0xff4400,{ei:0.08});
    this._box(8,5,30, 20,0,40,0x140d0d,0xff4400,{ei:0.08});
    // Overhead catwalk on corridors
    this._box(6,0.5,30,-20,5,-40,0x1a2a3a,0x00f5ff,{ei:0.2});
    this._box(6,0.5,30, 20,5, 40,0x2a1a1a,0xff4400,{ei:0.2});

    // Neon accent lighting
    const cols=[0x00f5ff,0xff6b00,0xff0080,0x00ff88,0xaa00ff];
    for(let i=0;i<14;i++){
      const a=(i/14)*Math.PI*2, r=50+Math.random()*32;
      this._light(Math.cos(a)*r,10+Math.random()*22,Math.sin(a)*r,cols[i%5],2,24);
    }

    this._addShop(0,0,0x00f5ff);
    this._addShop(-32,-32,0x00aaff);
    this._addShop(32,32,0xff4400);
    // Spawn in open side areas — completely clear of all structures
    this.spawnPoints.a = [
      new THREE.Vector3(-70, 1, 30), new THREE.Vector3(-74, 1, 24),
      new THREE.Vector3(-74, 1, 36), new THREE.Vector3(-78, 1, 30),
      new THREE.Vector3(-70, 1, 20), new THREE.Vector3(-70, 1, 40),
      new THREE.Vector3(-80, 1, 24), new THREE.Vector3(-80, 1, 36)
    ];
    this.spawnPoints.b = [
      new THREE.Vector3( 70, 1,-30), new THREE.Vector3( 74, 1,-24),
      new THREE.Vector3( 74, 1,-36), new THREE.Vector3( 78, 1,-30),
      new THREE.Vector3( 70, 1,-20), new THREE.Vector3( 70, 1,-40),
      new THREE.Vector3( 80, 1,-24), new THREE.Vector3( 80, 1,-36)
    ];
  }

  // ── JUNGLE TEMPLE — enclosed dense arena ─────────────────────────────────
  _jungle() {
    this._amb(0x061208, 0x081408, 14, 100, 0.48);
    this.scene.fog = new THREE.Fog(0x061208, 14, 95);
    const floorMat = this._texMat(0x1a2a0a, 0, 0, 0.05, 0.98, 'stone');
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(280,280),floorMat);
    floor.rotation.x=-Math.PI/2; floor.receiveShadow=true;
    this.scene.add(floor); this.colliders.push({isGround:true,y:0});

    // Jungle arena perimeter — stone walls with vine-covered look
    this._arenaWalls(88, 20, 0x3a2a1a, 0);
    // Wall battlements
    for(let i=-6;i<=6;i++){
      this._box(3,4,2, i*14,-1,-88,0x4a3a2a,0,{r:0.95});
      this._box(3,4,2, i*14,-1, 88,0x4a3a2a,0,{r:0.95});
      this._box(2,4,3,-88,-1,i*14,0x4a3a2a,0,{r:0.95});
      this._box(2,4,3, 88,-1,i*14,0x4a3a2a,0,{r:0.95});
    }

    // Dense tree ring (not in center)
    for(let i=0;i<50;i++){
      const a=(i/50)*Math.PI*2, r=42+Math.random()*36;
      const x=Math.cos(a)*r, z=Math.sin(a)*r;
      if(Math.abs(x)<26&&Math.abs(z)<26) continue;
      this._tree(x,z);
    }
    // A few trees in mid to break sightlines
    [[-10,8],[10,-8],[8,10],[-8,-10]].forEach(([x,z])=>this._tree(x,z));

    // ── TEAM A BASE — elevated stone fort ──────
    [[-60,-60]].forEach(([bx,bz]) => {
      // Fort walls
      this._box(28,8,2,bx,-1,bz-14,0x4a3a2a,0,{r:0.95}); // N wall
      this._box(28,8,2,bx,-1,bz+14,0x4a3a2a,0,{r:0.95}); // S wall
      this._box(2,8,28,bx-14,-1,bz,0x4a3a2a,0,{r:0.95}); // W wall
      this._box(2,8,28,bx+14,-1,bz,0x4a3a2a,0,{r:0.95}); // E wall
      // Fort floor (raised courtyard)
      this._box(26,1,26,bx,1.5,bz,0x5a4a3a,0,{r:0.9});
      // Corner towers
      [[-14,-14],[14,-14],[-14,14],[14,14]].forEach(([ox,oz]) => {
        this._box(6,14,6,bx+ox,-1,bz+oz,0x5a4a3a,0,{r:0.9});
        this._box(6.5,0.5,6.5,bx+ox,13,bz+oz,0x6a5a4a,0,{r:0.85});
        [4,9].forEach(ly=>this._box(7,0.5,7,bx+ox,ly,bz+oz,0x6a5a4a,0,{r:0.85}));
      });
      // Walkway around fort interior
      this._box(2,0.5,24,bx-13,8,bz,0x6a5a4a,0,{r:0.85});
      this._box(2,0.5,24,bx+13,8,bz,0x6a5a4a,0,{r:0.85});
      this._box(24,0.5,2,bx,8,bz-13,0x6a5a4a,0,{r:0.85});
      this._box(24,0.5,2,bx,8,bz+13,0x6a5a4a,0,{r:0.85});
      // Steps into fort
      this._stairs(bx+7,bz+14,'z',5,4,1.6,3,0x5a4a3a,2);
      // Central obelisk
      this._box(3,12,3,bx,2,bz,0x7a6a5a,0,{r:0.8});
      this._box(4,0.5,4,bx,14,bz,0x8a7a6a,0,{r:0.8});
    });

    // ── TEAM B BASE — mirrored ─────────────────
    [[60,60]].forEach(([bx,bz]) => {
      this._box(28,8,2,bx,-1,bz-14,0x4a3a2a,0,{r:0.95});
      this._box(28,8,2,bx,-1,bz+14,0x4a3a2a,0,{r:0.95});
      this._box(2,8,28,bx-14,-1,bz,0x4a3a2a,0,{r:0.95});
      this._box(2,8,28,bx+14,-1,bz,0x4a3a2a,0,{r:0.95});
      this._box(26,1,26,bx,1.5,bz,0x5a4a3a,0,{r:0.9});
      [[-14,-14],[14,-14],[-14,14],[14,14]].forEach(([ox,oz]) => {
        this._box(6,14,6,bx+ox,-1,bz+oz,0x5a4a3a,0,{r:0.9});
        this._box(6.5,0.5,6.5,bx+ox,13,bz+oz,0x6a5a4a,0,{r:0.85});
        [4,9].forEach(ly=>this._box(7,0.5,7,bx+ox,ly,bz+oz,0x6a5a4a,0,{r:0.85}));
      });
      this._box(2,0.5,24,bx-13,8,bz,0x6a5a4a,0,{r:0.85});
      this._box(2,0.5,24,bx+13,8,bz,0x6a5a4a,0,{r:0.85});
      this._box(24,0.5,2,bx,8,bz-13,0x6a5a4a,0,{r:0.85});
      this._box(24,0.5,2,bx,8,bz+13,0x6a5a4a,0,{r:0.85});
      this._stairs(bx-7,bz-14,'z',5,4,1.6,-3,0x5a4a3a,2);
      this._box(3,12,3,bx,2,bz,0x7a6a5a,0,{r:0.8});
      this._box(4,0.5,4,bx,14,bz,0x8a7a6a,0,{r:0.8});
    });

    // ── TEMPLE COMPLEX (center) ────────────────
    // Outer compound walls
    [[32,2.5,2,0,-1,-18],[32,2.5,2,0,-1,18],[2,2.5,32,-16,-1,0],[2,2.5,32,16,-1,0]].forEach(([w,h,d,x,y,z]) =>
      this._box(w,h,d,x,y,z,0x4a3a2a,0,{r:0.95}));
    // Gates (gaps in walls)
    // Temple pillars
    [[-10,-10],[10,-10],[-10,10],[10,10],[-10,0],[10,0],[0,-10],[0,10]].forEach(([px,pz]) =>
      this._cyl(0.6,0.7,10,px,-1,pz,0x5a4a3a));
    // Stepped pyramid
    [[14,0.9,14,0,-1,0],[10,0.9,10,0,0,0],[7,1.0,7,0,0.9,0],[4,1.2,4,0,1.9,0],[2.5,2,2.5,0,3.1,0]].forEach(([w,h,d,x,y,z]) =>
      this._box(w,h,d,x,y,z,0x8a7a5a,0,{r:0.85}));
    // Stairs to pyramid from all 4 sides
    for(let s=0;s<4;s++){
      const a=s*(Math.PI/2), cos=Math.cos(a), sinA=Math.sin(a);
      for(let i=0;i<4;i++){
        const dist=8-i*1.8, sy=i*0.9;
        this._box(3,0.6,2,dist*cos,sy-1,dist*sinA,0x9a8a6a,0,{r:0.9});
      }
    }
    // Raised outer platforms
    [[-22,0],[22,0],[0,-22],[0,22],[-16,16],[16,-16],[-16,-16],[16,16]].forEach(([px,pz],i) => {
      const h=3+i%3*1.5;
      this._box(5,h,5,px,-1,pz,0x4a3a2a,0,{r:0.95});
      this._box(5,0.5,5,px,h-1,pz,0x5a4a3a,0,{r:0.9});
      // Parkour step to platform
      this._box(3,h*0.5,2,px+(px>0?-3.5:3.5),h*0.25-1,pz,0x4a3a2a,0,{r:0.95});
    });
    // Bridges from outer platforms
    this._box(22,0.5,2,0,5,0,0x6b4423,0,{r:1});
    this._box(2,0.5,22,0,5,0,0x6b4423,0,{r:1});

    // Ambient jungle lights
    const gc=[0x00ff44,0x44ff88,0x00ffaa,0x88ff44];
    for(let i=0;i<16;i++){
      const x=(Math.random()-0.5)*160, z=(Math.random()-0.5)*160;
      this._light(x,3+Math.random()*6,z,gc[i%4],1.4,18);
    }

    this._addShop(0,-5,0x00ff44);
    this._addShop(-36,0,0x44ff88);
    this._addShop(36,0,0x44ff88);
    // Spawn along open side lanes — clear of forts and dense tree ring
    this.spawnPoints.a = [
      new THREE.Vector3(-78, 1,-12), new THREE.Vector3(-78, 1, -4),
      new THREE.Vector3(-78, 1,  4), new THREE.Vector3(-78, 1, 12),
      new THREE.Vector3(-82, 1, -8), new THREE.Vector3(-82, 1,  8),
      new THREE.Vector3(-74, 1, -6), new THREE.Vector3(-74, 1,  6)
    ];
    this.spawnPoints.b = [
      new THREE.Vector3( 78, 1, 12), new THREE.Vector3( 78, 1,  4),
      new THREE.Vector3( 78, 1, -4), new THREE.Vector3( 78, 1,-12),
      new THREE.Vector3( 82, 1,  8), new THREE.Vector3( 82, 1, -8),
      new THREE.Vector3( 74, 1,  6), new THREE.Vector3( 74, 1, -6)
    ];
  }

  _tree(x,z) {
    const h=6+Math.random()*10, r=0.28+Math.random()*0.14;
    const t=new THREE.Mesh(new THREE.CylinderGeometry(r,r*1.5,h,6),new THREE.MeshStandardMaterial({color:0x3a2210,roughness:1}));
    t.position.set(x,h/2,z); this.scene.add(t);
    this.colliders.push({box:new THREE.Box3(new THREE.Vector3(x-0.5,0,z-0.5),new THREE.Vector3(x+0.5,h,z+0.5))});
    [0x0a3a08,0x0d4a0a,0x0a5a0c].forEach((lc,i)=>{
      const l=new THREE.Mesh(new THREE.ConeGeometry(2.5-i*0.4,3+i,6),new THREE.MeshStandardMaterial({color:lc,roughness:0.9}));
      l.position.set(x,h-1+i*2,z); this.scene.add(l);
    });
  }

  // ── DESERT RUINS — arena with pyramid + fortresses ───────────────────────
  _desert() {
    this._amb(0x1a1208, 0xc8a850, 40, 180);
    const floorMat = this._texMat(0xc8a850,0,0,0.05,0.98,'sand');
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(280,280),floorMat);
    floor.rotation.x=-Math.PI/2; floor.receiveShadow=true;
    this.scene.add(floor); this.colliders.push({isGround:true,y:0});
    const sun=new THREE.DirectionalLight(0xffa844,1.8); sun.position.set(80,100,40); sun.castShadow=true; this.scene.add(sun);

    // Sandstone arena perimeter walls
    this._arenaWalls(88, 12, 0xc8a850, 0);
    // Battlements on walls
    for(let i=-5;i<=5;i++){
      [[i*16,-88],[i*16,88]].forEach(([x,z]) => this._box(5,5,2,x,12,z,0xb89840,0,{r:0.95}));
      [[-88,i*16],[88,i*16]].forEach(([x,z]) => this._box(2,5,5,x,12,z,0xb89840,0,{r:0.95}));
    }
    // Corner obelisks
    [[-88,-88],[88,-88],[-88,88],[88,88]].forEach(([x,z]) => {
      this._box(4,28,4,x,-1,z,0xaa8830,0,{r:0.9}); this._light(x,28,z,0xffaa00,3,14);
      [8,16,24].forEach(ly => this._box(5.5,0.5,5.5,x,ly,z,0xaa8830,0x442200,{ei:0.2}));
    });

    // ── TEAM A FORTRESS ──────────────────────
    [[-62,-62]].forEach(([bx,bz]) => {
      // Fortress walls
      this._box(30,10,2.5,bx,-1,bz-15,0xb89840,0,{r:0.95});
      this._box(30,10,2.5,bx,-1,bz+15,0xb89840,0,{r:0.95});
      this._box(2.5,10,30,bx-15,-1,bz,0xb89840,0,{r:0.95});
      this._box(2.5,10,30,bx+15,-1,bz,0xb89840,0,{r:0.95});
      // Gate (break in wall)
      // Towers
      [[-15,-15],[15,-15],[-15,15],[15,15]].forEach(([ox,oz]) => {
        this._box(7,16,7,bx+ox,-1,bz+oz,0xaa8830,0,{r:0.9});
        this._box(7.5,0.5,7.5,bx+ox,15,bz+oz,0xaa8830,0,{r:0.85});
        [4,8,12].forEach(ly => this._box(8,0.5,8,bx+ox,ly,bz+oz,0xaa8830,0,{r:0.9}));
      });
      // Interior catwalk
      this._box(2,0.5,28,bx-14,10,bz,0xaa8830,0,{r:0.9});
      this._box(2,0.5,28,bx+14,10,bz,0xaa8830,0,{r:0.9});
      this._box(28,0.5,2,bx,10,bz-14,0xaa8830,0,{r:0.9});
      this._box(28,0.5,2,bx,10,bz+14,0xaa8830,0,{r:0.9});
      // Steps
      this._stairs(bx+7,bz+15,'z',5,4,2,3,0xb89840,0);
      // Central cistern
      this._cyl(5,5.5,2,bx,-1,bz,0x887755);
    });

    // ── TEAM B FORTRESS ─────────────────────
    [[62,62]].forEach(([bx,bz]) => {
      this._box(30,10,2.5,bx,-1,bz-15,0xb89840,0,{r:0.95});
      this._box(30,10,2.5,bx,-1,bz+15,0xb89840,0,{r:0.95});
      this._box(2.5,10,30,bx-15,-1,bz,0xb89840,0,{r:0.95});
      this._box(2.5,10,30,bx+15,-1,bz,0xb89840,0,{r:0.95});
      [[-15,-15],[15,-15],[-15,15],[15,15]].forEach(([ox,oz]) => {
        this._box(7,16,7,bx+ox,-1,bz+oz,0xaa8830,0,{r:0.9});
        this._box(7.5,0.5,7.5,bx+ox,15,bz+oz,0xaa8830,0,{r:0.85});
        [4,8,12].forEach(ly => this._box(8,0.5,8,bx+ox,ly,bz+oz,0xaa8830,0,{r:0.9}));
      });
      this._box(2,0.5,28,bx-14,10,bz,0xaa8830,0,{r:0.9});
      this._box(2,0.5,28,bx+14,10,bz,0xaa8830,0,{r:0.9});
      this._box(28,0.5,2,bx,10,bz-14,0xaa8830,0,{r:0.9});
      this._box(28,0.5,2,bx,10,bz+14,0xaa8830,0,{r:0.9});
      this._stairs(bx-7,bz-15,'z',5,4,2,-3,0xb89840,0);
      this._cyl(5,5.5,2,bx,-1,bz,0x887755);
    });

    // ── CENTRAL PYRAMID — full climbable ──
    [[16,3,0,0],[11,3,0,3],[7.5,3,0,6],[5,3,0,9],[3,3,0,12],[1.8,3,0,15]].forEach(([s,h,ox,sy]) =>
      this._box(s*2,h,s*2,ox,-1+sy,ox,0xc8a850,0,{r:0.95}));
    // Stair ramps up all 4 sides
    for(let side=0;side<4;side++){
      const a=side*(Math.PI/2);
      for(let i=0;i<5;i++){
        const dist=15-i*2.8, sy=i*3;
        this._box(3,0.6,2.5, Math.cos(a)*dist, sy-1, Math.sin(a)*dist, 0xb89840,0,{r:0.95});
      }
    }
    // Pyramid top platform
    this._box(3.5,0.6,3.5,0,17.5,0,0xaa8830,0x442200,{ei:0.3});

    // Rubble / cover scattered around
    [[-34,-8],[34,8],[-8,34],[8,-34],[24,-24],[-24,24],[40,0],[0,40],[-40,0],[0,-40]].forEach(([px,pz]) =>
      this._box(3+Math.random()*3,1.5+Math.random()*4,2.5+Math.random()*2,px,-1,pz,0xb89840,0,{r:0.95}));

    // Mid ruins (broken walls)
    [[-18,0],[18,0],[0,-18],[0,18],[-12,-12],[12,12]].forEach(([px,pz]) => {
      this._box(6,5,1.5,px,-1,pz,0xaa8830,0,{r:0.95});
      this._box(3,2,1.5,px+3,4,pz,0xaa8830,0,{r:0.95}); // broken top
    });

    this._addShop(0,22,0xffaa00);
    this._addShop(-36,-8,0xffaa00);
    this._addShop(36,-8,0xffaa00);
    // Spawn in open desert quadrants opposite to enemy base
    this.spawnPoints.a = [
      new THREE.Vector3(-62, 1, 58), new THREE.Vector3(-68, 1, 52),
      new THREE.Vector3(-56, 1, 52), new THREE.Vector3(-74, 1, 58),
      new THREE.Vector3(-62, 1, 64), new THREE.Vector3(-50, 1, 58),
      new THREE.Vector3(-68, 1, 64), new THREE.Vector3(-56, 1, 64)
    ];
    this.spawnPoints.b = [
      new THREE.Vector3( 62, 1,-58), new THREE.Vector3( 68, 1,-52),
      new THREE.Vector3( 56, 1,-52), new THREE.Vector3( 74, 1,-58),
      new THREE.Vector3( 62, 1,-64), new THREE.Vector3( 50, 1,-58),
      new THREE.Vector3( 68, 1,-64), new THREE.Vector3( 56, 1,-64)
    ];
  }

  // ── NEON JUNGLE — cyber-organic arena ────────────────────────────────────
  _neonJungle() {
    this._amb(0x010802, 0x010a01, 18, 110, 0.35);
    this.scene.fog = new THREE.Fog(0x010a01, 16, 100);
    const floorMat=this._texMat(0x0a1a08,0,0,0.05,0.98,'stone');
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(280,280),floorMat);
    floor.rotation.x=-Math.PI/2; floor.receiveShadow=true;
    this.scene.add(floor); this.colliders.push({isGround:true,y:0});

    // Bioluminescent perimeter walls
    this._arenaWalls(88, 22, 0x0a1a0a, 0x00ff44);
    // Wall spires
    for(let i=-5;i<=5;i++){
      this._cyl(0.6,0.9,10,i*16,-1,-88,0x0a2a0a,0x00ff44);
      this._cyl(0.6,0.9,10,i*16,-1, 88,0x0a2a0a,0x00ff44);
      this._cyl(0.6,0.9,10,-88,-1,i*16,0x0a2a0a,0x44ff88);
      this._cyl(0.6,0.9,10, 88,-1,i*16,0x0a2a0a,0x44ff88);
    }

    // Dense outer tree ring
    for(let i=0;i<44;i++){
      const a=(i/44)*Math.PI*2, r=46+Math.random()*32;
      this._cyberTree(Math.cos(a)*r,Math.sin(a)*r);
    }
    // Inner trees breaking sightlines
    [[-16,8],[16,-8],[8,16],[-8,-16],[-22,22],[22,-22]].forEach(([x,z])=>this._cyberTree(x,z));

    const tc=[0x00ff44,0x00ffaa,0xff00aa,0xaaff00,0x00aaff];

    // ── TEAM A BASE — bioluminescent hive ────
    [[-62,-62]].forEach(([bx,bz]) => {
      // Organic walls
      this._box(28,12,2.5,bx,-1,bz-14,0x0a2a0a,0x00ff44,{ei:0.2});
      this._box(28,12,2.5,bx,-1,bz+14,0x0a2a0a,0x00ff44,{ei:0.2});
      this._box(2.5,12,28,bx-14,-1,bz,0x0a2a0a,0x00ff44,{ei:0.2});
      this._box(2.5,12,28,bx+14,-1,bz,0x0a2a0a,0x00ff44,{ei:0.2});
      // Bio-towers (corners)
      [[-14,-14],[14,-14],[-14,14],[14,14]].forEach(([ox,oz],i) => {
        const ac=tc[i%tc.length];
        this._box(6,18,6,bx+ox,-1,bz+oz,0x0a2a0a,ac,{ei:0.3});
        this._light(bx+ox,18,bz+oz,ac,2,16);
        [5,10,15].forEach(ly=>this._box(7,0.5,7,bx+ox,ly,bz+oz,0x0a2a0a,ac,{ei:0.25}));
      });
      this._box(2,0.5,26,bx-13,12,bz,0x0a2a0a,0x00ff44,{ei:0.2});
      this._box(2,0.5,26,bx+13,12,bz,0x0a2a0a,0x00ff44,{ei:0.2});
      this._box(26,0.5,2,bx,12,bz-13,0x0a2a0a,0x00ff44,{ei:0.2});
      this._box(26,0.5,2,bx,12,bz+13,0x0a2a0a,0x00ff44,{ei:0.2});
      this._stairs(bx+7,bz+14,'z',5,4,2.4,3,0x0a2a0a,0);
    });

    // ── TEAM B BASE ───────────────────────────
    [[62,62]].forEach(([bx,bz]) => {
      this._box(28,12,2.5,bx,-1,bz-14,0x1a0a0a,0xff00aa,{ei:0.2});
      this._box(28,12,2.5,bx,-1,bz+14,0x1a0a0a,0xff00aa,{ei:0.2});
      this._box(2.5,12,28,bx-14,-1,bz,0x1a0a0a,0xff00aa,{ei:0.2});
      this._box(2.5,12,28,bx+14,-1,bz,0x1a0a0a,0xff00aa,{ei:0.2});
      [[-14,-14],[14,-14],[-14,14],[14,14]].forEach(([ox,oz],i) => {
        const ac=[0xff00aa,0xaaff00,0x00aaff,0xffaa00][i];
        this._box(6,18,6,bx+ox,-1,bz+oz,0x1a0a0a,ac,{ei:0.3});
        this._light(bx+ox,18,bz+oz,ac,2,16);
        [5,10,15].forEach(ly=>this._box(7,0.5,7,bx+ox,ly,bz+oz,0x1a0a0a,ac,{ei:0.25}));
      });
      this._box(2,0.5,26,bx-13,12,bz,0x1a0a0a,0xff00aa,{ei:0.2});
      this._box(2,0.5,26,bx+13,12,bz,0x1a0a0a,0xff00aa,{ei:0.2});
      this._box(26,0.5,2,bx,12,bz-13,0x1a0a0a,0xff00aa,{ei:0.2});
      this._box(26,0.5,2,bx,12,bz+13,0x1a0a0a,0xff00aa,{ei:0.2});
      this._stairs(bx-7,bz-14,'z',5,4,2.4,-3,0x1a0a0a,0);
    });

    // ── CENTRAL HIVE TOWER ────────────────────
    [[24,0.6,24,0,4,0],[16,0.6,16,0,9,0],[10,0.6,10,0,14,0],[6,0.6,6,0,20,0],[3,4,3,0,23,0]].forEach(([w,h,d,x,y,z]) =>
      this._box(w,h,d,x,y,z,0x1a2a1a,0x00ff44,{ei:0.3}));
    // Ramps to center
    [[8,0,0,0],[  -8,0,0,Math.PI],[0,0,8,Math.PI/2],[0,0,-8,-Math.PI/2]].forEach(([dx,dy,dz,ry]) =>
      this._ramp(3.5,2,8,dx,2,dz,0x1a2a1a,ry));

    // Cybertowers mid-ring
    for(let i=0;i<10;i++){
      const a=(i/10)*Math.PI*2, r=32+Math.random()*10, h=14+Math.random()*20;
      const cx=Math.cos(a)*r, cz=Math.sin(a)*r, c=tc[i%5];
      this._box(7,h,7,cx,-1,cz,0x0a1a0a,c,{ei:0.28}); this._light(cx,h*0.8,cz,c,2.2,18);
      [Math.floor(h*0.4),Math.floor(h*0.75)].forEach(ly => this._box(8,0.5,8,cx,ly,cz,0x0a2a0a,c,{ei:0.22}));
    }

    // Rope bridges between towers
    [[-22,9,-22,22,9,-22],[-22,9,22,22,9,22],[-22,9,-22,-22,9,22],[22,9,-22,22,9,22]].forEach(([x1,y1,z1,x2,y2,z2]) => {
      const mx=(x1+x2)/2, mz=(z1+z2)/2, dx=x2-x1, dz=z2-z1, d=Math.sqrt(dx*dx+dz*dz);
      const bridge=new THREE.Mesh(new THREE.BoxGeometry(d,0.4,2),this._mat(0x3a2a0a,0x00ff44,0.15,0.3,0.9));
      bridge.position.set(mx,y1,mz); bridge.rotation.y=Math.atan2(dz,dx)+Math.PI/2;
      this.scene.add(bridge);
      this.colliders.push({box:new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(mx,y1,mz),new THREE.Vector3(d+1,0.8,2.5))});
    });

    // Glowing mushrooms / bio-pillars
    for(let i=0;i<14;i++){
      const x=(Math.random()-0.5)*70, z=(Math.random()-0.5)*70;
      this._box(1.5,2+Math.random()*3,1.5,x,-1,z,0x0a2a0a,tc[i%5],{ei:0.55});
    }

    this._addShop(0,4,0x00ff44);
    this._addShop(-28,-28,0x00ffaa);
    this._addShop(28,28,0xaaff00);
    // Spawn in open clearings — NE/SW quadrants, clear of hive bases
    this.spawnPoints.a = [
      new THREE.Vector3(-62, 1, 55), new THREE.Vector3(-68, 1, 50),
      new THREE.Vector3(-56, 1, 50), new THREE.Vector3(-74, 1, 55),
      new THREE.Vector3(-62, 1, 62), new THREE.Vector3(-50, 1, 55),
      new THREE.Vector3(-68, 1, 62), new THREE.Vector3(-55, 1, 62)
    ];
    this.spawnPoints.b = [
      new THREE.Vector3( 62, 1,-55), new THREE.Vector3( 68, 1,-50),
      new THREE.Vector3( 56, 1,-50), new THREE.Vector3( 74, 1,-55),
      new THREE.Vector3( 62, 1,-62), new THREE.Vector3( 50, 1,-55),
      new THREE.Vector3( 68, 1,-62), new THREE.Vector3( 55, 1,-62)
    ];
  }

  _cyberTree(x,z) {
    const h=8+Math.random()*14, r=0.28+Math.random()*0.1;
    const t=new THREE.Mesh(new THREE.CylinderGeometry(r,r*1.5,h,6),new THREE.MeshStandardMaterial({color:0x0a2a08,roughness:0.9,emissive:new THREE.Color(0x002200),emissiveIntensity:0.3}));
    t.position.set(x,h/2,z); this.scene.add(t);
    this.colliders.push({box:new THREE.Box3(new THREE.Vector3(x-0.5,0,z-0.5),new THREE.Vector3(x+0.5,h,z+0.5))});
    [0x00ff44,0x00ffaa,0xaaff00].forEach((c,i)=>{
      const l=new THREE.Mesh(new THREE.ConeGeometry(2-i*0.3,2.5+i,6),new THREE.MeshStandardMaterial({color:0x0a2a08,emissive:new THREE.Color(c),emissiveIntensity:0.4,roughness:0.8}));
      l.position.set(x,h-0.5+i*2,z); this.scene.add(l);
    });
  }

  // ── CYBER DESERT — hardened facility arena ───────────────────────────────
  _cyberDesert() {
    this._amb(0x100c00, 0x201800, 45, 180);
    const floorMat=this._texMat(0x2a1e08,0,0,0.05,0.98,'sand');
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(280,280),floorMat);
    floor.rotation.x=-Math.PI/2; floor.receiveShadow=true;
    this.scene.add(floor); this.colliders.push({isGround:true,y:0});

    this._arenaWalls(88, 14, 0xb89840, 0xffaa00);
    [[-88,-88],[88,-88],[-88,88],[88,88]].forEach(([x,z]) => {
      this._box(12,30,12,x,-1,z,0xb89840,0xffaa00,{ei:0.3}); this._light(x,30,z,0xffaa00,3,20);
      [8,16,24].forEach(ly=>this._box(13,0.5,13,x,ly,z,0xcc9940,0xffaa00,{ei:0.35}));
    });

    // A base
    [[-62,-62]].forEach(([bx,bz]) => {
      this._box(30,10,2.5,bx,-1,bz-15,0xb89840,0x00aaff,{ei:0.25});
      this._box(30,10,2.5,bx,-1,bz+15,0xb89840,0x00aaff,{ei:0.25});
      this._box(2.5,10,30,bx-15,-1,bz,0xb89840,0x00aaff,{ei:0.25});
      this._box(2.5,10,30,bx+15,-1,bz,0xb89840,0x00aaff,{ei:0.25});
      [[-15,-15],[15,-15],[-15,15],[15,15]].forEach(([ox,oz]) => {
        this._box(8,18,8,bx+ox,-1,bz+oz,0xaa8830,0x00aaff,{ei:0.3});
        this._light(bx+ox,18,bz+oz,0x00aaff,2,16);
        [5,10,15].forEach(ly=>this._box(9,0.5,9,bx+ox,ly,bz+oz,0xcc9940,0x00aaff,{ei:0.3}));
      });
      this._box(2,0.5,28,bx-14,10,bz,0xcc9940,0x00aaff,{ei:0.2});
      this._box(2,0.5,28,bx+14,10,bz,0xcc9940,0x00aaff,{ei:0.2});
      this._box(28,0.5,2,bx,10,bz-14,0xcc9940,0x00aaff,{ei:0.2});
      this._box(28,0.5,2,bx,10,bz+14,0xcc9940,0x00aaff,{ei:0.2});
      this._stairs(bx+7,bz+15,'z',5,4,2,3,0xb89840,0);
    });

    // B base
    [[62,62]].forEach(([bx,bz]) => {
      this._box(30,10,2.5,bx,-1,bz-15,0xb89840,0xff6600,{ei:0.25});
      this._box(30,10,2.5,bx,-1,bz+15,0xb89840,0xff6600,{ei:0.25});
      this._box(2.5,10,30,bx-15,-1,bz,0xb89840,0xff6600,{ei:0.25});
      this._box(2.5,10,30,bx+15,-1,bz,0xb89840,0xff6600,{ei:0.25});
      [[-15,-15],[15,-15],[-15,15],[15,15]].forEach(([ox,oz]) => {
        this._box(8,18,8,bx+ox,-1,bz+oz,0xaa8830,0xff6600,{ei:0.3});
        this._light(bx+ox,18,bz+oz,0xff6600,2,16);
        [5,10,15].forEach(ly=>this._box(9,0.5,9,bx+ox,ly,bz+oz,0xcc9940,0xff6600,{ei:0.3}));
      });
      this._box(2,0.5,28,bx-14,10,bz,0xcc9940,0xff6600,{ei:0.2});
      this._box(2,0.5,28,bx+14,10,bz,0xcc9940,0xff6600,{ei:0.2});
      this._box(28,0.5,2,bx,10,bz-14,0xcc9940,0xff6600,{ei:0.2});
      this._box(28,0.5,2,bx,10,bz+14,0xcc9940,0xff6600,{ei:0.2});
      this._stairs(bx-7,bz-15,'z',5,4,2,-3,0xb89840,0);
    });

    // Central structure + platforms
    [[24,1.6,24,0,3,0],[16,1.6,16,0,6,0],[10,1.6,10,0,9,0],[6,1.6,6,0,12,0]].forEach(([w,h,d,x,y,z]) =>
      this._box(w,h,d,x,y,z,0xcc9940,0xffaa00,{ei:0.4}));
    // Cross bridges
    this._box(28,0.5,3.5,0,10,0,0xcc9940,0xffaa00,{ei:0.35});
    this._box(3.5,0.5,28,0,10,0,0xcc9940,0xffaa00,{ei:0.35});
    // Mid obelisks
    [[-36,0],[36,0],[0,-36],[0,36]].forEach(([px,pz]) => {
      this._box(3,22,3,px,-1,pz,0xb89840,0,{r:0.9}); this._light(px,22,pz,0xffaa00,3,14);
      [6,12,18].forEach(ly=>this._box(4.5,0.5,4.5,px,ly,pz,0xcc9940,0xffaa00,{ei:0.35}));
      this._ramp(3,6,10,px+(px>0?-4:4),0,pz,0xb89840);
    });
    // Rubble + cover
    for(let i=0;i<14;i++){
      const x=-50+Math.random()*100, z=-50+Math.random()*100;
      this._box(2+Math.random()*4,1+Math.random()*3,2+Math.random()*3,x,-1,z,0xb89840,[0x00aaff,0xff6600,0x00ff88][i%3],{ei:0.4});
    }

    this._addShop(0,0,0xff8800);
    this._addShop(-28,28,0x00aaff);
    this._addShop(28,-28,0xff00aa);
    // Spawn in open areas — NE/SW quadrants clear of bases
    this.spawnPoints.a = [
      new THREE.Vector3(-62, 1, 55), new THREE.Vector3(-68, 1, 50),
      new THREE.Vector3(-56, 1, 50), new THREE.Vector3(-74, 1, 55),
      new THREE.Vector3(-62, 1, 62), new THREE.Vector3(-50, 1, 55),
      new THREE.Vector3(-68, 1, 62), new THREE.Vector3(-55, 1, 62)
    ];
    this.spawnPoints.b = [
      new THREE.Vector3( 62, 1,-55), new THREE.Vector3( 68, 1,-50),
      new THREE.Vector3( 56, 1,-50), new THREE.Vector3( 74, 1,-55),
      new THREE.Vector3( 62, 1,-62), new THREE.Vector3( 50, 1,-55),
      new THREE.Vector3( 68, 1,-62), new THREE.Vector3( 55, 1,-62)
    ];
  }

  // ── FACTORY — industrial arena with conveyor platforms ───────────────────
  _factory() {
    this._amb(0x080606, 0x100808, 30, 140);
    const floorMat=this._texMat(0x1a1212,0,0,0.8,0.4,'metal');
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(280,280),floorMat);
    floor.rotation.x=-Math.PI/2; floor.receiveShadow=true;
    this.scene.add(floor); this.colliders.push({isGround:true,y:0});
    this.scene.add(Object.assign(new THREE.DirectionalLight(0xff6600,0.5),{position:new THREE.Vector3(-50,80,-30)}));

    // Industrial arena walls with grating
    this._arenaWalls(88, 24, 0x1a1a1a, 0xff4400);
    // Pipes on walls
    for(let i=-4;i<=4;i++){
      this._cyl(0.4,0.4,24,i*20,-1,-88,0x222222,0xff6600);
      this._cyl(0.4,0.4,24,i*20,-1, 88,0x222222,0xff6600);
    }

    // A base
    [[-62,-62]].forEach(([bx,bz]) => {
      this._box(30,12,2.5,bx,-1,bz-15,0x1a1a1a,0xff6600,{m:0.9,r:0.2,ei:0.2});
      this._box(30,12,2.5,bx,-1,bz+15,0x1a1a1a,0xff6600,{m:0.9,r:0.2,ei:0.2});
      this._box(2.5,12,30,bx-15,-1,bz,0x1a1a1a,0xff6600,{m:0.9,r:0.2,ei:0.2});
      this._box(2.5,12,30,bx+15,-1,bz,0x1a1a1a,0xff6600,{m:0.9,r:0.2,ei:0.2});
      [[-15,-15],[15,-15],[-15,15],[15,15]].forEach(([ox,oz]) => {
        this._box(10,20,10,bx+ox,-1,bz+oz,0x1a1a1a,0xff4400,{m:0.9,r:0.2,ei:0.22});
        this._light(bx+ox,20,bz+oz,0xff6600,3,20);
        [4,8,12,16].forEach(ly=>this._box(11,0.5,11,bx+ox,ly,bz+oz,0x282828,0xff6600,{m:0.8,ei:0.2}));
      });
      this._box(2,0.5,28,bx-14,12,bz,0x333333,0xff6600,{m:0.8,ei:0.15});
      this._box(2,0.5,28,bx+14,12,bz,0x333333,0xff6600,{m:0.8,ei:0.15});
      this._box(28,0.5,2,bx,12,bz-14,0x333333,0xff6600,{m:0.8,ei:0.15});
      this._box(28,0.5,2,bx,12,bz+14,0x333333,0xff6600,{m:0.8,ei:0.15});
      this._stairs(bx+7,bz+15,'z',5,4,2.4,3,0x2a2a2a,0);
    });

    // B base
    [[62,62]].forEach(([bx,bz]) => {
      this._box(30,12,2.5,bx,-1,bz-15,0x1a1a1a,0xffaa00,{m:0.9,r:0.2,ei:0.2});
      this._box(30,12,2.5,bx,-1,bz+15,0x1a1a1a,0xffaa00,{m:0.9,r:0.2,ei:0.2});
      this._box(2.5,12,30,bx-15,-1,bz,0x1a1a1a,0xffaa00,{m:0.9,r:0.2,ei:0.2});
      this._box(2.5,12,30,bx+15,-1,bz,0x1a1a1a,0xffaa00,{m:0.9,r:0.2,ei:0.2});
      [[-15,-15],[15,-15],[-15,15],[15,15]].forEach(([ox,oz]) => {
        this._box(10,20,10,bx+ox,-1,bz+oz,0x1a1a1a,0xffaa00,{m:0.9,r:0.2,ei:0.22});
        this._light(bx+ox,20,bz+oz,0xffaa00,3,20);
        [4,8,12,16].forEach(ly=>this._box(11,0.5,11,bx+ox,ly,bz+oz,0x282828,0xffaa00,{m:0.8,ei:0.2}));
      });
      this._box(2,0.5,28,bx-14,12,bz,0x333333,0xffaa00,{m:0.8,ei:0.15});
      this._box(2,0.5,28,bx+14,12,bz,0x333333,0xffaa00,{m:0.8,ei:0.15});
      this._box(28,0.5,2,bx,12,bz-14,0x333333,0xffaa00,{m:0.8,ei:0.15});
      this._box(28,0.5,2,bx,12,bz+14,0x333333,0xffaa00,{m:0.8,ei:0.15});
      this._stairs(bx-7,bz-15,'z',5,4,2.4,-3,0x2a2a2a,0);
    });

    // Central machinery
    this._box(8,5,8,0,-1,0,0x222222,0x444444,{m:0.9,r:0.2});
    this._box(5,4,5,0,4,0,0x2a2a2a,0x555555,{m:0.9,r:0.2});
    this._box(3,5,3,0,8,0,0x333333,0xff4400,{ei:0.4,m:0.9});
    // Conveyor platforms
    [[-22,-1,0],[22,-1,0],[0,-1,-22],[0,-1,22]].forEach(([x,y,z]) =>
      this._box(4,0.5,4,x,6,z,0x334444,0x00aaff,{ei:0.22,m:0.7}));
    // Main catwalks
    [[38,0.6,4,0,10,0],[4,0.6,38,0,10,0],[26,0.5,3.5,0,6,-28],[26,0.5,3.5,0,6,28]].forEach(([w,h,d,x,y,z]) =>
      this._box(w,h,d,x,y,z,0x333344,0x00aaff,{m:0.7,ei:0.15}));
    // Factory chimneys with platforms
    [[-36,-1,-36],[-36,-1,36],[36,-1,-36],[36,-1,36]].forEach(([x,y,z]) => {
      this._cyl(1.0,1.2,30,x,y,z,0x222222,0x444444); this._light(x,30,z,0xff4400,2,18);
      [8,16,22].forEach(ly=>this._box(4,0.5,4,x,ly,z,0x333333,0xff6600,{ei:0.2}));
    });
    // Crates for cover
    for(let i=0;i<22;i++){
      const x=-30+(i%6)*12, z=-20+Math.floor(i/6)*14;
      this._box(2+Math.random(),2+Math.random()*1.5,2.5+Math.random(),x,-1,z,0x333333);
    }
    this._stairs(-20,0,'z',6,3,1.8,2.5,0x2a2a2a,0);
    this._stairs(18,0,'z',6,3,1.8,2.5,0x2a2a2a,0);
    for(let i=0;i<12;i++){
      const x=-50+(i%6)*20, z=-30+Math.floor(i/6)*24;
      this._light(x,18,z,[0xff6600,0xffaa00,0xff4400][i%3],3,28);
    }

    this._addShop(0,0,0xff4400);
    this._addShop(-26,-26,0xffaa00);
    this._addShop(26,26,0xff6600);
    // Spawn along open side lanes — away from all factory structures
    this.spawnPoints.a = [
      new THREE.Vector3(-76, 1,-12), new THREE.Vector3(-76, 1, -4),
      new THREE.Vector3(-76, 1,  4), new THREE.Vector3(-76, 1, 12),
      new THREE.Vector3(-80, 1, -8), new THREE.Vector3(-80, 1,  8),
      new THREE.Vector3(-72, 1, -6), new THREE.Vector3(-72, 1,  6)
    ];
    this.spawnPoints.b = [
      new THREE.Vector3( 76, 1, 12), new THREE.Vector3( 76, 1,  4),
      new THREE.Vector3( 76, 1, -4), new THREE.Vector3( 76, 1,-12),
      new THREE.Vector3( 80, 1,  8), new THREE.Vector3( 80, 1, -8),
      new THREE.Vector3( 72, 1,  6), new THREE.Vector3( 72, 1, -6)
    ];
  }

  // ── SKY PLATFORMS — vertical arena in the void ───────────────────────────
  _sky() {
    this._amb(0x030510, 0x050818, 90, 350, 0.28);
    this.colliders.push({isGround:true,y:-500});

    // Stars
    const sv=[];
    for(let i=0;i<4000;i++) sv.push((Math.random()-0.5)*600,30+Math.random()*300,(Math.random()-0.5)*600);
    const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.Float32BufferAttribute(sv,3));
    this.scene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:0.35})));

    // Nebulae
    [0x0022aa,0x220044,0x004422,0x440022].forEach((c,i)=>{
      const nm=new THREE.Mesh(new THREE.SphereGeometry(230,8,6),new THREE.MeshBasicMaterial({color:c,side:THREE.BackSide,transparent:true,opacity:0.25}));
      nm.position.set(i*100-150,60,0); this.scene.add(nm);
    });

    const pc=[0x00aaff,0x4466ff,0xff4444,0x00ff88,0xaa44ff,0xffaa00,0xff00aa];

    // ── MAIN PLATFORM LAYERS ─────────────────
    // Ground ring (large central)
    this._box(28,1.2,28,0,0,0,0x1a2a3a,0x4466ff,{ei:0.4});
    // Trim
    const trim0=new THREE.Mesh(new THREE.BoxGeometry(28.2,0.16,28.2),new THREE.MeshBasicMaterial({color:0x4466ff}));
    trim0.position.set(0,1.05,0); this.scene.add(trim0);

    // Side platforms ground level
    [[-40,0,0],[40,0,0],[0,0,-40],[0,0,40],[-28,0,-28],[28,0,28],[-28,0,28],[28,0,-28]].forEach(([x,y,z],i) => {
      const c=pc[i%pc.length], s=10+Math.random()*4;
      this._box(s,1,s,x,y,z,0x1a2a3a,c,{ei:0.38});
      this._light(x,y+3,z,c,2,16);
      const tr=new THREE.Mesh(new THREE.BoxGeometry(s+0.1,0.14,s+0.1),new THREE.MeshBasicMaterial({color:c}));
      tr.position.set(x,y+1.05,z); this.scene.add(tr);
    });

    // Mid level ring
    [[-24,7,-24],[24,7,24],[-24,7,24],[24,7,-24],[0,7,-34],[0,7,34],[-34,7,0],[34,7,0]].forEach(([x,y,z],i) => {
      const c=pc[i%pc.length];
      this._box(9,0.8,9,x,y,z,0x1a2a4a,c,{ei:0.4});
      this._light(x,y+3,z,c,2,14);
    });

    // High level
    [[-16,14,0],[16,14,0],[0,14,-16],[0,14,16],[-22,14,-22],[22,14,22]].forEach(([x,y,z],i) => {
      const c=pc[i%pc.length];
      this._box(8,0.8,8,x,y,z,0x2a1a4a,c,{ei:0.42});
      this._light(x,y+3,z,c,2,12);
    });

    // Ultra high sniper perches
    [[0,22,0],[-18,18,18],[18,18,-18]].forEach(([x,y,z],i) => {
      const c=pc[i%pc.length];
      this._box(6,0.8,6,x,y,z,0x1a1a4a,c,{ei:0.5});
      this._light(x,y+3,z,c,2.5,10);
    });

    // ── BRIDGES between platforms ─────────────
    const bridgeConns = [
      [[-14,1,0],[14,1,0]],[[-14,1,0],[0,1,-14]],[[-14,1,0],[0,1,14]],
      [[14,1,0],[0,1,-14]],[[14,1,0],[0,1,14]],
      [[-24,7,-24],[0,7,-34]],[[24,7,24],[0,7,34]],
      [[-24,7,-24],[-34,7,0]],[[24,7,24],[34,7,0]],
      [[0,7,-34],[0,14,-16]],[[0,7,34],[0,14,16]],
      [[-24,7,24],[-16,14,0]],[[24,7,-24],[16,14,0]]
    ];
    bridgeConns.forEach(([[x1,y1,z1],[x2,y2,z2]],i) => {
      const mx=(x1+x2)/2, my=(y1+y2)/2+0.1, mz=(z1+z2)/2;
      const dx=x2-x1, dz=z2-z1, len=Math.sqrt(dx*dx+dz*dz);
      const c=pc[i%pc.length];
      const m=new THREE.Mesh(new THREE.BoxGeometry(len,0.35,1.8),new THREE.MeshStandardMaterial({color:c,emissive:new THREE.Color(c),emissiveIntensity:0.5,metalness:0.8}));
      m.position.set(mx,my,mz); m.rotation.y=Math.atan2(dz,dx); this.scene.add(m);
      this.colliders.push({box:new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(mx,my,mz),new THREE.Vector3(len+0.5,0.6,2.2))});
    });

    // Vertical columns with climb rings
    [[-20,0,-20],[20,0,20],[-20,0,20],[20,0,-20]].forEach(([x,y,z],i) => {
      const c=pc[i%pc.length];
      const m=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.7,25,10),new THREE.MeshStandardMaterial({color:0x1a2a4a,emissive:new THREE.Color(c),emissiveIntensity:0.35,metalness:0.8}));
      m.position.set(x,12.5,z); this.scene.add(m);
      this.colliders.push({box:new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x,12.5,z),new THREE.Vector3(1.5,25,1.5))});
      [4,8,12,16,20].forEach(ly => {
        const ring=new THREE.Mesh(new THREE.TorusGeometry(1.6,0.09,6,18),new THREE.MeshBasicMaterial({color:c}));
        ring.position.set(x,ly,z); ring.rotation.x=Math.PI/2; this.scene.add(ring);
        // Rings act as platforms too
        if(ly%8===0) this.colliders.push({box:new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x,ly,z),new THREE.Vector3(3.4,0.3,3.4))});
      });
    });

    // ── A and B spawn zones (raised sub-platforms) ──
    [[  -38,1.2,0],[38,1.2,0]].forEach(([x,y,z],i) => {
      const c=i===0?0x0044ff:0xff4400;
      this._box(14,1,14,x,y,z,0x1a2a4a,c,{ei:0.5});
      this._light(x,y+4,z,c,3,18);
      // Walls behind spawn for protection
      this._box(14,5,1.5,x,y+0.5, z+(i===0?-8:8), 0x1a1a4a,c,{ei:0.3});
    });

    this._addShop(0,0,0xaa44ff);
    this._addShop(-26,7,0x00aaff);
    this._addShop(26,7,0xff4444);
    this.spawnPoints.a=[
      new THREE.Vector3(-38,2.2,0),new THREE.Vector3(-40,2.2,4),new THREE.Vector3(-36,2.2,-4),
      new THREE.Vector3(-42,2.2,0),new THREE.Vector3(-38,2.2,6),new THREE.Vector3(-38,2.2,-6),
      new THREE.Vector3(-35,2.2,3),new THREE.Vector3(-35,2.2,-3)
    ];
    this.spawnPoints.b=[
      new THREE.Vector3(38,2.2,0),new THREE.Vector3(40,2.2,4),new THREE.Vector3(36,2.2,-4),
      new THREE.Vector3(42,2.2,0),new THREE.Vector3(38,2.2,6),new THREE.Vector3(38,2.2,-6),
      new THREE.Vector3(35,2.2,3),new THREE.Vector3(35,2.2,-3)
    ];
  }
}
