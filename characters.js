// ============================================================
// characters.js — 20 Hero Definitions + Expanded Weapon Stats
// ============================================================

const CHARACTERS = [
  {
    id: 'vex', name: 'VEX', role: 'DUELIST',
    lore: 'Cybernetic assassin. Precision-engineered for elimination.',
    color: '#00f5ff', speed: 1.1, maxHealth: 100, maxShield: 25,
    weapon: 'smg',
    abilities: {
      e: { name: 'Phase Dash',   desc: 'Dash forward through obstacles.',          cooldown: 8,  icon: '⚡', type: 'dash'      },
      q: { name: 'Reflex Smoke', desc: 'Deploy a smoke cloud blocking vision 4s.', cooldown: 14, icon: '💨', type: 'smoke'     },
      f: { name: 'Overclock',    desc: '+40% fire rate & speed for 6s.',           cooldown: 45, icon: '🔥', type: 'boost', isUlt: true }
    },
    bodyColor: 0x0088cc, accentColor: 0x00ffff
  },
  {
    id: 'solaris', name: 'SOLARIS', role: 'SENTINEL',
    lore: 'Solar-powered guardian. A wall of light between allies and harm.',
    color: '#ffaa00', speed: 0.9, maxHealth: 150, maxShield: 75,
    weapon: 'assaultRifle',
    abilities: {
      e: { name: 'Solar Wall',    desc: 'Erect a barrier absorbing 300 damage 5s.',  cooldown: 16, icon: '🛡', type: 'shield'   },
      q: { name: 'Healing Pulse', desc: 'Heal nearby allies for 40 HP.',             cooldown: 20, icon: '✚', type: 'heal'     },
      f: { name: 'Nova Burst',    desc: '180 damage explosion in 8m radius.',         cooldown: 50, icon: '☀', type: 'aoe', isUlt: true }
    },
    bodyColor: 0xcc7700, accentColor: 0xffee00
  },
  {
    id: 'wraith', name: 'WRAITH', role: 'INFILTRATOR',
    lore: 'Ghost operative. Disappears before you even see her coming.',
    color: '#9900ff', speed: 1.2, maxHealth: 80, maxShield: 20,
    weapon: 'smg',
    abilities: {
      e: { name: 'Ghost Step',   desc: 'Invisible for 3s. Breaking gives +20% speed.', cooldown: 15, icon: '👻', type: 'invis'   },
      q: { name: 'Veil Shift',   desc: 'Teleport up to 12m in any direction.',         cooldown: 18, icon: '🌀', type: 'teleport'},
      f: { name: 'Phantom Realm',desc: 'Immune + invisible + fast for 5s.',            cooldown: 60, icon: '◈',  type: 'phantom', isUlt: true }
    },
    bodyColor: 0x6600cc, accentColor: 0xaa44ff
  },
  {
    id: 'ironclad', name: 'IRONCLAD', role: 'TANK',
    lore: 'Walking fortress. Where he stands, the line does not break.',
    color: '#888888', speed: 0.75, maxHealth: 225, maxShield: 100,
    weapon: 'shotgun',
    abilities: {
      e: { name: 'Bulwark',    desc: 'Personal shield absorbing 500 damage for 3s.', cooldown: 12, icon: '🛡', type: 'shield'   },
      q: { name: 'Shockwave',  desc: 'Stomp launches nearby enemies into the air.',  cooldown: 14, icon: '💥', type: 'aoe'      },
      f: { name: 'Siege Mode', desc: 'Stationary turret with extreme armor 8s.',     cooldown: 55, icon: '🏰', type: 'siege', isUlt: true }
    },
    bodyColor: 0x555555, accentColor: 0x888888
  },
  {
    id: 'cinder', name: 'CINDER', role: 'PYRO',
    lore: 'Fire manipulator. Everything she touches burns.',
    color: '#ff4400', speed: 1.0, maxHealth: 110, maxShield: 30,
    weapon: 'assaultRifle',
    abilities: {
      e: { name: 'Flame Dash',     desc: 'Dash leaving a fire trail for 2s.',    cooldown: 9,  icon: '🔥', type: 'dash'    },
      q: { name: 'Napalm Grenade', desc: 'Creates a fire zone for 5s.',          cooldown: 13, icon: '💣', type: 'grenade' },
      f: { name: 'Inferno',        desc: '12m cone firestorm for 4s.',           cooldown: 48, icon: '🌋', type: 'aoe', isUlt: true }
    },
    bodyColor: 0xcc2200, accentColor: 0xff6600
  },
  {
    id: 'rift', name: 'RIFT', role: 'CONTROLLER',
    lore: 'Dimensional hacker. Reality bends to his calculations.',
    color: '#00ffaa', speed: 1.0, maxHealth: 100, maxShield: 40,
    weapon: 'burstRifle',
    abilities: {
      e: { name: 'Grav Trap',    desc: 'Gravity trap pulls & slows enemies.',    cooldown: 14, icon: '⊕', type: 'trap'    },
      q: { name: 'Dimension Rift',desc: 'Portal pair — enter one, exit other.',  cooldown: 22, icon: '🔵', type: 'teleport'},
      f: { name: 'Singularity',  desc: 'Black hole pulls all nearby enemies.',   cooldown: 60, icon: '⚫', type: 'aoe', isUlt: true }
    },
    bodyColor: 0x008855, accentColor: 0x00ffaa
  },
  {
    id: 'strix', name: 'STRIX', role: 'SNIPER',
    lore: 'Precision hunter. One shot. One thought. One kill.',
    color: '#4488ff', speed: 0.85, maxHealth: 90, maxShield: 20,
    weapon: 'sniperRifle',
    abilities: {
      e: { name: 'Radar Scan',        desc: 'Reveal enemies within 30m for 5s.',    cooldown: 18, icon: '📡', type: 'scan'   },
      q: { name: 'Grapple Hook',      desc: 'Zip to target location.',              cooldown: 12, icon: '🪝', type: 'grapple'},
      f: { name: 'Precision Protocol',desc: 'Slow-time + perfect accuracy for 6s.', cooldown: 55, icon: '🎯', type: 'boost', isUlt: true }
    },
    bodyColor: 0x2244aa, accentColor: 0x4488ff
  },
  {
    id: 'nyx', name: 'NYX', role: 'SUPPORT',
    lore: 'Nano-medic. She keeps her team breathing.',
    color: '#ff44aa', speed: 1.05, maxHealth: 100, maxShield: 35,
    weapon: 'smg',
    abilities: {
      e: { name: 'Nano Swarm',      desc: 'Heal nearby allies 80 HP over 4s.',    cooldown: 16, icon: '✚', type: 'heal'    },
      q: { name: 'Disruption Field',desc: 'Disrupt enemy HUDs and slow them.',    cooldown: 14, icon: '📡', type: 'utility' },
      f: { name: 'Revival Beacon',  desc: 'Beacon auto-revives fallen allies.',   cooldown: 70, icon: '💠', type: 'revive', isUlt: true }
    },
    bodyColor: 0xcc2288, accentColor: 0xff44aa
  },
  {
    id: 'apex', name: 'APEX', role: 'ASSAULT',
    lore: 'Peak-performance warrior. Pure combat instinct amplified.',
    color: '#ffdd00', speed: 1.1, maxHealth: 120, maxShield: 45,
    weapon: 'assaultRifle',
    abilities: {
      e: { name: 'Damage Boost',   desc: 'Next 5 shots deal +60% damage.',      cooldown: 12, icon: '💪', type: 'boost'   },
      q: { name: 'Flash Grenade',  desc: 'Blinds enemies for 2.5s.',            cooldown: 13, icon: '💡', type: 'flash'   },
      f: { name: 'Apex Predator',  desc: 'Infinite ammo + no recoil + speed 8s.',cooldown: 50, icon: '👑', type: 'boost', isUlt: true }
    },
    bodyColor: 0xaaaa00, accentColor: 0xffdd00
  },
  {
    id: 'bolt', name: 'BOLT', role: 'RUNNER',
    lore: 'Hyperkinetic speedster. Gone before you pull the trigger.',
    color: '#00eeff', speed: 1.4, maxHealth: 85, maxShield: 15,
    weapon: 'pistol',
    abilities: {
      e: { name: 'Wall Run',    desc: 'Sprint along walls for up to 4s.',   cooldown: 8,  icon: '🏃', type: 'movement'},
      q: { name: 'Speed Surge', desc: 'Triple movement speed for 3s.',      cooldown: 12, icon: '💨', type: 'boost'   },
      f: { name: 'Hyperdash',   desc: 'Pass through enemies dealing 60 dmg each.', cooldown: 40, icon: '⚡', type: 'dash', isUlt: true }
    },
    bodyColor: 0x0099aa, accentColor: 0x00eeff
  },
  {
    id: 'hex', name: 'HEX', role: 'HACKER',
    lore: 'Data-breach specialist. Turns your own tech against you.',
    color: '#aaff00', speed: 0.95, maxHealth: 100, maxShield: 50,
    weapon: 'pistol',
    abilities: {
      e: { name: 'Turret Deploy',     desc: 'Smart turret auto-fires enemies 15s.',    cooldown: 25, icon: '🤖', type: 'turret' },
      q: { name: 'System Hack',       desc: 'Disable enemy abilities for 4s.',         cooldown: 18, icon: '💻', type: 'hack'   },
      f: { name: 'Network Takeover',  desc: 'Reveal all enemies for 8s.',              cooldown: 65, icon: '🌐', type: 'scan', isUlt: true }
    },
    bodyColor: 0x448800, accentColor: 0xaaff00
  },
  {
    id: 'titan', name: 'TITAN', role: 'BERSERKER',
    lore: 'Rage embodied. Closer to death, more dangerous he becomes.',
    color: '#ff0022', speed: 0.95, maxHealth: 175, maxShield: 25,
    weapon: 'shotgun',
    abilities: {
      e: { name: 'Berserker Charge', desc: 'Charge dealing damage & knockback.',     cooldown: 11, icon: '🐂', type: 'dash'  },
      q: { name: 'Blood Frenzy',     desc: 'Gain 1 HP per hit dealt for 8s.',        cooldown: 20, icon: '🩸', type: 'boost' },
      f: { name: 'Ragnarok',         desc: 'Invincible + 2x damage for 6s.',          cooldown: 55, icon: '☠',  type: 'boost', isUlt: true }
    },
    bodyColor: 0x880011, accentColor: 0xff0022
  },
  // ── NEW CHARACTERS ──────────────────────────────────────────
  {
    id: 'kira', name: 'KIRA', role: 'BLADE MASTER',
    lore: 'Nano-blade specialist. She closes the gap before you can blink.',
    color: '#ff2288', speed: 1.25, maxHealth: 95, maxShield: 30,
    weapon: 'katana',
    abilities: {
      e: { name: 'Blade Rush',   desc: 'Leap to target dealing 80 melee damage.',  cooldown: 9,  icon: '⚔', type: 'dash'    },
      q: { name: 'Reflect',      desc: 'Deflect bullets back for 1.5s.',           cooldown: 15, icon: '🔄', type: 'shield'  },
      f: { name: 'Death Lotus',  desc: 'Spin dealing 50dmg per hit to all nearby.', cooldown: 45, icon: '🌸', type: 'aoe', isUlt: true }
    },
    bodyColor: 0xaa0055, accentColor: 0xff2288
  },
  {
    id: 'forge', name: 'FORGE', role: 'HEAVY GUNNER',
    lore: 'Walking arsenal. His minigun spins up for a reason.',
    color: '#ff6600', speed: 0.7, maxHealth: 200, maxShield: 80,
    weapon: 'minigun',
    abilities: {
      e: { name: 'Spin Up',      desc: 'Minigun spins up: +200% fire rate 4s.',   cooldown: 14, icon: '🔄', type: 'boost'   },
      q: { name: 'Suppression',  desc: 'Fire zone that slows all enemies 5s.',    cooldown: 18, icon: '🔥', type: 'grenade' },
      f: { name: 'Death Machine',desc: 'Infinite spin + armor for 8s.',           cooldown: 60, icon: '💀', type: 'boost', isUlt: true }
    },
    bodyColor: 0xaa4400, accentColor: 0xff6600
  },
  {
    id: 'phantom', name: 'PHANTOM', role: 'SPECTER',
    lore: 'Spectral assassin. Neither fully alive nor dead.',
    color: '#8844ff', speed: 1.0, maxHealth: 90, maxShield: 60,
    weapon: 'revolver',
    abilities: {
      e: { name: 'Soul Step',    desc: 'Phase through walls for 2s.',             cooldown: 10, icon: '👻', type: 'invis'   },
      q: { name: 'Haunt',        desc: 'Attach ghost to enemy — see their view.',  cooldown: 20, icon: '🔮', type: 'scan'   },
      f: { name: 'Wraith Form',  desc: 'Full intangibility + 2x dmg for 6s.',     cooldown: 55, icon: '☁',  type: 'phantom', isUlt: true }
    },
    bodyColor: 0x441188, accentColor: 0x8844ff
  },
  {
    id: 'zeus', name: 'ZEUS', role: 'STORMCALLER',
    lore: 'Lightning incarnate. The battlefield is his circuit board.',
    color: '#44aaff', speed: 1.0, maxHealth: 105, maxShield: 35,
    weapon: 'burstRifle',
    abilities: {
      e: { name: 'Static Dash',  desc: 'Dash leaving electric trail for 3s.',     cooldown: 8,  icon: '⚡', type: 'dash'    },
      q: { name: 'Storm Bolt',   desc: 'Lightning bolt chains to 3 enemies.',     cooldown: 16, icon: '🌩', type: 'aoe'     },
      f: { name: 'Thunderstorm', desc: 'Storm aura shocks all nearby 6s.',        cooldown: 55, icon: '🌪', type: 'aoe', isUlt: true }
    },
    bodyColor: 0x2266aa, accentColor: 0x44aaff
  },
  {
    id: 'viper', name: 'VIPER', role: 'TOXIC',
    lore: 'Biochemical warfare specialist. Her poison seeps into everything.',
    color: '#88ff00', speed: 1.05, maxHealth: 95, maxShield: 25,
    weapon: 'smg',
    abilities: {
      e: { name: 'Acid Spray',   desc: 'Spray acid pool dealing 8 DPS for 6s.',  cooldown: 12, icon: '🧪', type: 'grenade' },
      q: { name: 'Toxic Screen', desc: 'Smoke wall of poison — slows+damages.',   cooldown: 18, icon: '☠', type: 'smoke'   },
      f: { name: 'Biohazard',    desc: 'Massive gas cloud: 15 DPS 10s range.',    cooldown: 60, icon: '🦠', type: 'aoe', isUlt: true }
    },
    bodyColor: 0x446600, accentColor: 0x88ff00
  },
  {
    id: 'oracle', name: 'ORACLE', role: 'TACTICIAN',
    lore: 'Information broker. She knows your move before you make it.',
    color: '#ffbb00', speed: 0.95, maxHealth: 100, maxShield: 45,
    weapon: 'burstRifle',
    abilities: {
      e: { name: 'Recon Drone',  desc: 'Drone reveals all enemies for 8s.',       cooldown: 20, icon: '📡', type: 'scan'   },
      q: { name: 'Data Spike',   desc: 'Disable one enemy for 3s.',               cooldown: 16, icon: '💉', type: 'hack'   },
      f: { name: 'Omniscience',  desc: 'See through walls + mark all for 10s.',   cooldown: 65, icon: '👁', type: 'scan', isUlt: true }
    },
    bodyColor: 0xaa7700, accentColor: 0xffbb00
  },
  {
    id: 'glacier', name: 'GLACIER', role: 'CRYO',
    lore: 'Absolute zero made flesh. Time itself freezes in her wake.',
    color: '#88ddff', speed: 0.9, maxHealth: 115, maxShield: 55,
    weapon: 'assaultRifle',
    abilities: {
      e: { name: 'Ice Wall',     desc: 'Erect ice barrier blocking path 6s.',     cooldown: 14, icon: '🧊', type: 'shield'  },
      q: { name: 'Frost Nova',   desc: 'Freeze all nearby enemies for 2.5s.',     cooldown: 20, icon: '❄', type: 'aoe'     },
      f: { name: 'Permafrost',   desc: 'Giant freeze zone slows all for 8s.',     cooldown: 55, icon: '🌨', type: 'aoe', isUlt: true }
    },
    bodyColor: 0x4499aa, accentColor: 0x88ddff
  },
  {
    id: 'rampage', name: 'RAMPAGE', role: 'JUGGERNAUT',
    lore: 'Unstoppable force. Walls are just suggestions.',
    color: '#ff3300', speed: 0.85, maxHealth: 190, maxShield: 70,
    weapon: 'hammerfist',
    abilities: {
      e: { name: 'Power Slam',   desc: 'Smash ground — massive AoE shockwave.',   cooldown: 10, icon: '👊', type: 'aoe'     },
      q: { name: 'Iron Skin',    desc: 'Reduce all damage by 70% for 3s.',        cooldown: 16, icon: '🛡', type: 'shield'  },
      f: { name: 'RAMPAGE',      desc: 'Sprint through walls + 3x damage 6s.',    cooldown: 55, icon: '🔥', type: 'boost', isUlt: true }
    },
    bodyColor: 0x991100, accentColor: 0xff3300
  }
];

// ── EXPANDED WEAPON STATS (ranged + melee + special) ───────────────────────
const WEAPON_STATS = {
  // ── RANGED GUNS ──────────────────────────────────────────────────────────
  assaultRifle: { name: 'ASSAULT RIFLE', damage: 28, fireRate: 600,  reloadTime: 2200, magSize: 30, reserveAmmo: 90,  range: 60,  spread: 0.04,  auto: true,  pellets: 1, type: 'gun',   color: 0x445566, accentColor: 0x00aaff },
  smg:          { name: 'SMG',           damage: 18, fireRate: 900,  reloadTime: 1800, magSize: 40, reserveAmmo: 120, range: 35,  spread: 0.06,  auto: true,  pellets: 1, type: 'gun',   color: 0x334455, accentColor: 0x00f5ff },
  sniperRifle:  { name: 'SNIPER RIFLE',  damage: 150,fireRate: 45,   reloadTime: 3000, magSize: 5,  reserveAmmo: 20,  range: 200, spread: 0.001, auto: false, pellets: 1, type: 'gun',   color: 0x2a3a2a, accentColor: 0x00ff88 },
  shotgun:      { name: 'SHOTGUN',       damage: 18, fireRate: 70,   reloadTime: 500,  magSize: 6,  reserveAmmo: 36,  range: 20,  spread: 0.15,  auto: false, pellets: 8, type: 'gun',   color: 0x4a3030, accentColor: 0xff6600 },
  burstRifle:   { name: 'BURST RIFLE',   damage: 35, fireRate: 450,  reloadTime: 2400, magSize: 24, reserveAmmo: 72,  range: 55,  spread: 0.025, auto: false, pellets: 1, type: 'gun',   color: 0x2a2a4a, accentColor: 0xaaff00, burst: 3 },
  pistol:       { name: 'PISTOL',        damage: 45, fireRate: 350,  reloadTime: 1400, magSize: 15, reserveAmmo: 60,  range: 40,  spread: 0.03,  auto: false, pellets: 1, type: 'gun',   color: 0x333333, accentColor: 0x999999 },
  revolver:     { name: 'REVOLVER',      damage: 90, fireRate: 160,  reloadTime: 2800, magSize: 6,  reserveAmmo: 36,  range: 50,  spread: 0.015, auto: false, pellets: 1, type: 'gun',   color: 0x554433, accentColor: 0xddaa44 },
  minigun:      { name: 'MINIGUN',       damage: 14, fireRate: 1200, reloadTime: 4000, magSize: 120,reserveAmmo: 360, range: 45,  spread: 0.08,  auto: true,  pellets: 1, type: 'gun',   color: 0x332211, accentColor: 0xff8800, spinUp: 1200 },
  plasmaRifle:  { name: 'PLASMA RIFLE',  damage: 38, fireRate: 400,  reloadTime: 2600, magSize: 20, reserveAmmo: 60,  range: 65,  spread: 0.02,  auto: true,  pellets: 1, type: 'gun',   color: 0x220044, accentColor: 0xff00ff },
  railgun:      { name: 'RAILGUN',       damage: 220,fireRate: 25,   reloadTime: 4000, magSize: 3,  reserveAmmo: 12,  range: 999, spread: 0.0,   auto: false, pellets: 1, type: 'gun',   color: 0x001133, accentColor: 0x0088ff, penetrating: true },
  // ── MELEE ────────────────────────────────────────────────────────────────
  katana:       { name: 'KATANA',        damage: 75, fireRate: 180,  reloadTime: 0,    magSize: 999,reserveAmmo: 999, range: 2.2, spread: 0.0,   auto: false, pellets: 1, type: 'melee', color: 0x888899, accentColor: 0x00ffff, meleeRadius: 2.2, meleeArc: 1.8 },
  hammerfist:   { name: 'HAMMER FIST',   damage: 110,fireRate: 90,   reloadTime: 0,    magSize: 999,reserveAmmo: 999, range: 2.5, spread: 0.0,   auto: false, pellets: 1, type: 'melee', color: 0x444444, accentColor: 0xff4400, meleeRadius: 2.5, meleeArc: 2.2 },
  energyBlade:  { name: 'ENERGY BLADE',  damage: 60, fireRate: 240,  reloadTime: 0,    magSize: 999,reserveAmmo: 999, range: 2.0, spread: 0.0,   auto: true,  pellets: 1, type: 'melee', color: 0x001133, accentColor: 0x00ffff, meleeRadius: 2.0, meleeArc: 1.6 },
};

// ── WEAPON PICKUP TYPES (available in shop + field drops) ──────────────────
const WEAPON_PICKUP_LIST = ['assaultRifle','smg','sniperRifle','shotgun','burstRifle','pistol','revolver','minigun','plasmaRifle','railgun','katana','hammerfist','energyBlade'];

const MAP_CONFIGS = [
  { id: 'neonCity',       name: 'NEON CITY',       color: '#00f5ff' },
  { id: 'jungle',         name: 'JUNGLE',           color: '#00ff44' },
  { id: 'desertRuins',    name: 'DESERT RUINS',     color: '#c8a850' },
  { id: 'neonJungle',     name: 'NEON JUNGLE CITY', color: '#44ff00' },
  { id: 'cyberDesert',    name: 'CYBER DESERT',     color: '#ff8800' },
  { id: 'factory',        name: 'FACTORY',          color: '#ff4400' },
  { id: 'skyPlatforms',   name: 'SKY PLATFORMS',    color: '#aa44ff' }
];
