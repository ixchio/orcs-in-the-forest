import * as THREE from 'three';

// Centralized mutable game state shared across modules
export const G = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  clock: null,

  state: 'menu',

  ground: null,
  flashlight: null,
  sunLight: null,
  moonLight: null,
  sunSprite: null,
  moonSprite: null,
  ambientLight: null,
  // Lightweight sky clouds
  clouds: [],
  // Foliage chunk refs for LOD/culling and debug regeneration
  foliage: { grass: [], flowers: [], bushes: [], rocks: [] },
  mountains: null,

  input: {
    w: false,
    a: false,
    s: false,
    d: false,
    shoot: false,
    sprint: false,
    crouch: false,
    jump: false,
    grenade: false
  },

  // Roguelite upgrades active stacks
  upgrades: {
    vampiric: 0, extMag: 0, hollowPoint: 0, adrenaline: 0,
    quickHands: 0, shrapnel: 0, thickSkin: 0, scavenger: 0,
    deadEye: 0, regen: 0
  },
  upgradesPicking: false,

  // Weapon switching
  activeWeaponSlot: 0, // 0=rifle, 1=shotgun
  weaponSlots: [null, null], // { group, muzzle, ejector, materials, ammo, reserve }
  switching: false,
  switchTimer: 0,

  // Falling trees from grenade blasts
  fallingTrees: [],

  // Weather events
  weather: { type: null, timer: 0, particles: null, lightningTimer: 0, savedFogDensity: 0, banner: null },

  // Kill streak / combo
  killStreak: { kills: [], multiplier: 1, displayTimer: 0, peakStreak: 0 },

  // Game stats for death recap
  stats: { kills: 0, headshots: 0, totalShots: 0, grenadesThrown: 0, damageDealt: 0 },

  // Boss reference (for health bar)
  activeBoss: null,

  player: null, // initialized in main

  enemies: [],
  treeColliders: [],
  treeMeshes: [],
  // Subset of meshes used for bullet blocking (trunks only)
  treeTrunks: [],
  // Spatial index for trees to accelerate queries
  treeGrid: null,
  // Static blockers array for raycasting (ground + trees)
  blockers: [],

  shootCooldown: 0,
  raycaster: new THREE.Raycaster(),
  tmpV1: new THREE.Vector3(),
  tmpV2: new THREE.Vector3(),
  tmpV3: new THREE.Vector3(),

  weapon: {
    group: null,
    muzzle: null,
    basePos: new THREE.Vector3(),
    baseRot: new THREE.Euler(0, 0, 0),
    recoil: 0,
    swayT: 0,
    ammo: 0,
    reserve: Infinity,
    reloading: false,
    reloadTimer: 0,
    anchor: { depth: 0.80, right: 0.417, bottom: 0.365 },
    // Dynamic aim spread (NDC units) and helpers
    spread: 0,
    targetSpread: 0,
    // View recoil offsets applied to camera (radians)
    viewPitch: 0,
    viewYaw: 0,
    appliedPitch: 0,
    appliedYaw: 0,
    // Dynamic fire-rate buff
    rofMult: 1,
    rofBuffTimer: 0,
    rofBuffTotal: 0,
    // Infinite ammo buff
    infiniteAmmoTimer: 0,
    infiniteAmmoTotal: 0,
    ammoBeforeInf: null,
    reserveBeforeInf: null,
    materials: [],
    glowT: 0
  },

  // Temporary movement speed buff (used by accelerator)
  movementMult: 1,
  movementBuffTimer: 0,

  fx: { tracers: [], impacts: [], flashes: [], dusts: [], portals: [] },
  // Player grenades and preview helpers
  grenades: [],
  heldGrenade: null,
  grenadeCount: 0,
  grenadePreview: null,
  // Explosion VFX
  explosions: [],
  enemyProjectiles: [],
  // Health orbs and other pickups
  orbs: [],
  // Ephemeral wave pickups (e.g., ROF accelerators)
  powerups: [],
  // Ejected shell casings
  casings: [],
  // Detached props (helmets) with simple physics
  helmets: [],
  damageFlash: 0,
  healFlash: 0,
  hitFlash: 0,
  // Deferred GPU resource disposal queue to avoid frame spikes
  disposeQueue: [],

  waves: {
    current: 1,
    aliveCount: 0,
    spawnQueue: 0,
    nextSpawnTimer: 0,
    breakTimer: 0,
    inBreak: false,
    spawnAnchor: null,
    shamansToSpawn: 0,
    wolvesToSpawn: 0,
    golemsToSpawn: 0
  },

  random: null,

  // Day/night cycle
  timeOfDay: 0.25, // 0..1, where ~0.5 is noon

  // Default config snapshots for upgrade resets
  _defaults: null
};
