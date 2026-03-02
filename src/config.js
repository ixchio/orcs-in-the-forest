// Game configuration constants
export const CFG = {
  forestSize: 300,
  treeCount: 400,
  clearRadius: 12,
  // Ground cover (instanced) config
  foliage: {
    chunkSize: 30,        // world units per chunk (controls draw calls)
    grassPerChunk: 1260,   // base blades per chunk (triangle grass scales density internally)
    grassDensityMult: 6.0, // extra multiplier for triangle blades (higher = denser)
    grass: {
      // Placement/density
      densityMult: 6.0,
      baseYOffset: -0.01,
      randomTilt: 0.10,
      // Blade mesh dimensions
      bladeBaseWidth: 0.07,
      bladeBaseHeight: 0.62,
      bladeMinScale: 0.95,
      bladeMaxScale: 1.45,
      // Blade profile + bend
      rootWidth: 0.65,
      tipWidth: 0.10,
      bendBase: 0.16,
      bendWindMult: 0.55,
      leanJitter: 0.22,
      swayPushX: 0.28,
      swayPushZ: 0.22,
      tipNoiseBase: 0.02,
      tipNoiseMult: 0.03,
      // Wind timing / phase
      phaseScaleX: 0.047,
      phaseScaleZ: 0.041,
      gustFreqA: 1.6,
      gustFreqB: 0.85,
      gustAmpA: 0.65,
      gustAmpB: 0.35,
      // Color variation
      hueMin: 0.26,
      hueMax: 0.34,
      satMin: 0.46,
      satMax: 0.72,
      lightMin: 0.26,
      lightMax: 0.42
    },
    flowersPerChunk: 10,  // avg flower sprites per chunk
    bushesPerChunk: 2,    // avg bushes per chunk
    rocksPerChunk: 1,     // avg rocks per chunk
    maxSlope: 0.98,       // skip very steep surfaces (0..1, 1 = flat)
    windStrength: 0.45,   // vertex sway amount for grass/flowers
    densityNearClear: 0.45, // density multiplier at the edge of the clearing
    // Distance culling for instanced ground cover
    grassViewDist: 95,    // draw grass within this radius from camera
    flowerViewDist: 85,   // draw flowers within this radius from camera
    seedOffset: 8888      // extra salt for deterministic placement
  },
  player: {
    speed: 8,
    sprintMult: 1.5,
    crouchMult: 0.6,
    radius: 0.8,
    health: 100,
    jumpVel: 5,
    eyeHeight: 1.8,
    crouchEyeHeight: 1.2,
    // Apex-like movement tuning
    move: {
      friction: 5.5,           // ground friction (~4-6)
      stopSpeed: 6.0,          // speed where friction clamps (m/s)
      groundAccel: 9.5,        // slightly slower to build speed
      airAccel: 12.0,          // reduce mid-air drift/control
      gravity: 15.0,           // matches prior gravity
      jumpSpeed: 5.0,          // vertical impulse (mirrors jumpVel)
      airSpeedCap: 8.0,        // tighter cap to curb air strafing
      // Sliding
      slideFriction: 1.6,      // a bit less slide drift
      slideAccel: 8.0,         // less push while sliding
      slideMinSpeed: 6.0,      // enter slide when crouch and >= this speed
      slideJumpBoost: 0.85,    // tone down slide-jump boost slightly
      // Helpers
      jumpBuffer: 0.12,        // seconds to buffer jump presses
      coyoteTime: 0.12,        // late jump after leaving ground
      // Wall bounce
      wallBounceWindow: 0.10,  // seconds after wall contact to accept jump
      wallBounceImpulse: 1.2   // outward push on wall bounce (m/s)
    }
  },
  flashlight: {
    on: true,
    distance: 150,
    intensity: 38.0,
    angle: 0.6
  },
  fogDensity: 0.008,
  waves: {
    baseCount: 6,
    perWaveAdd: 4,
    spawnEvery: 0.7,
    spawnDecay: 0.03,
    spawnMin: 0.25,
    maxAlive: 30,
    annulusMin: 28,
    annulusMax: 45,
    breakTime: 2.5
  },
  enemy: {
    hp: 100,
    radius: 0.9,
    baseSpeed: 2.5,
    speedPerWave: 0.25,
    dps: 15,
    // Ranged weapon settings
    rof: 0.6,            // shots per second (archers)
    range: 120,
    shotDamage: 8,
    bloom: 0.015,        // aim error
    // Arrow projectile settings
    arrowSpeed: 40,
    arrowGravity: 20,
    arrowDamage: 12,
    arrowLife: 6,
    arrowHitRadius: 0.6
  },
  // Wolf-specific tuning
  wolf: {
    speedMult: 2.0,      // 2x faster than other enemies
    biteRange: 1.6,      // distance to trigger a bite
    biteInterval: 0.9,   // seconds between bites
    biteWindup: 0.22,    // time before bite lands
    biteDamage: 14,      // damage per bite when it lands
    radius: 0.8          // collision radius for wolves
  },
  // Shaman-specific tuning
  shaman: {
    // Fireball slightly slower than orc arrow (40)
    fireballSpeed: 42,
    fireballDamage: 60,
    fireballLife: 5,
    fireballHitRadius: 0.9,
    teleportCooldown: 6,
    teleportDistance: 12
  },
  // Golem-specific tuning
  golem: {
    hp: 1000,             // 5x basic enemy (100)
    radius: 1.8,         // bigger footprint
    baseSpeed: 1.6,
    speedPerWave: 0.10,
    dps: 20,             // contact damage if you hug it
    range: 90,
    // Throwing
    throwInterval: 1.8,  // seconds between throws
    throwWindup: 0.40,
    bloom: 0.01,
    // Rock projectile
    rockSpeed: 34,
    rockGravity: 22,
    rockDamage: 45,
    rockLife: 7,
    rockHitRadius: 0.9
  },
  // Roguelite upgrade pool
  upgrades: [
    { id: 'vampiric', name: 'Vampiric Rounds', icon: '🩸', desc: 'Heal 5 HP per kill', maxStacks: 3 },
    { id: 'extMag', name: 'Extended Mag', icon: '🔋', desc: '+8 magazine capacity', maxStacks: 3 },
    { id: 'hollowPoint', name: 'Hollow Points', icon: '💀', desc: '+15% damage, −10% fire rate', maxStacks: 5 },
    { id: 'adrenaline', name: 'Adrenaline', icon: '⚡', desc: 'Speed scales with low health', maxStacks: 3 },
    { id: 'quickHands', name: 'Quick Hands', icon: '🤲', desc: '−25% reload time', maxStacks: 3 },
    { id: 'shrapnel', name: 'Shrapnel Grenades', icon: '💥', desc: 'Grenades split into 3 blasts', maxStacks: 2 },
    { id: 'thickSkin', name: 'Thick Skin', icon: '🛡️', desc: '+25 max HP', maxStacks: 4 },
    { id: 'scavenger', name: 'Scavenger', icon: '🎒', desc: '+1 extra grenade per wave', maxStacks: 3 },
    { id: 'deadEye', name: 'Dead Eye', icon: '🎯', desc: '+50% headshot multiplier', maxStacks: 2 },
    { id: 'regen', name: 'Rapid Recovery', icon: '💚', desc: 'Passive 2 HP/s regeneration', maxStacks: 3 }
  ],
  gun: {
    // Faster, closer to AK full-auto feel (~600 RPM is 10 RPS)
    rof: 10.5,
    damage: 34,
    range: 120,
    // Minimum hipfire spread (normalized device coords)
    bloom: 0.004,
    // CS-style dynamic spread tuning
    spreadMin: 0.003,
    spreadMax: 0.028,
    spreadShotIncrease: 0.0030, // added per shot (faster bloom)
    spreadDecay: 6.8,           // slightly slower recovery while spraying
    spreadMoveMult: 2.2,        // walking
    spreadSprintMult: 3.2,      // sprinting
    spreadAirMult: 4.0,         // not grounded
    spreadCrouchMult: 0.6,      // crouching for precision
    magSize: 24,
    reloadTime: 1.6,
    recoilKick: 0.065,
    recoilRecover: 9.0,
    headshotMult: 2.0,
    // View recoil (adds to camera; radians suggested)
    viewKickPitchDeg: 1.2,     // a touch more kick
    viewKickYawDeg: 0.5,       // slightly more horizontal wander
    viewReturn: 9.0            // per second return to neutral
  },
  shotgun: {
    pellets: 8,
    rof: 1.2,
    damage: 18,
    range: 35,
    spreadMin: 0.04,
    spreadMax: 0.08,
    spreadShotIncrease: 0.006,
    spreadDecay: 4.0,
    spreadMoveMult: 1.6,
    spreadSprintMult: 2.2,
    spreadAirMult: 2.8,
    spreadCrouchMult: 0.7,
    magSize: 6,
    reloadTime: 2.2,
    recoilKick: 0.12,
    headshotMult: 1.5,
    viewKickPitchDeg: 2.8,
    viewKickYawDeg: 1.2,
    viewReturn: 7.0,
    bloom: 0.04
  },
  sniper: {
    rof: 0.8,
    damage: 85,
    range: 200,
    spreadMin: 0.001,
    spreadMax: 0.015,
    spreadShotIncrease: 0.005,
    spreadDecay: 2.0,
    spreadMoveMult: 2.5,
    spreadSprintMult: 4.0,
    spreadAirMult: 5.0,
    spreadCrouchMult: 0.4,
    magSize: 5,
    reloadTime: 3.0,
    recoilKick: 0.18,
    headshotMult: 4.0,
    viewKickPitchDeg: 4.0,
    viewKickYawDeg: 0.8,
    viewReturn: 5.0,
    bloom: 0.001
  },
  megaBoss: {
    hp: 5000,
    speed: 1.8,
    scale: 3.5,
    groundPoundRadius: 12,
    groundPoundDamage: 40,
    groundPoundCooldown: 6,
    throwInterval: 2.0,
    rockSpeed: 22,
    rockGravity: 12
  },
  fx: {
    tracerLife: 0.08,
    impactLife: 0.25,
    muzzleLife: 0.05
  },
  // Player grenades
  grenade: {
    speed: 24,        // initial throw speed
    gravity: 20,      // matches enemy arrow gravity
    fuse: 3.0,        // seconds after priming
    radius: 6.5,      // explosion radius
    maxDamage: 140,   // center damage to enemies
    selfMaxDamage: 90,// center damage to player
    previewSteps: 36, // points along arc preview
    previewDt: 0.06,  // timestep used for preview sim
    minPitchDeg: 28,  // minimum upward throw angle for a nice arc (not enforced if yBoost used)
    yBoost: 3.5       // additional upward speed added for nicer arc (scaled by horizontal aim)
  },
  audio: {
    master: 0.6,
    gunshotVol: 0.9,
    headshotVol: 0.8,
    reloadVol: 0.7,
    pickupVol: 1.0,
    reloadStart: true,
    reloadEnd: true,
    // Background music
    musicEnabled: true,
    musicVol: 0.18,
    musicTempo: 138,
    ambienceVol: 0.35,
    warDrumsVol: 0.22,
    warDrumsMaxTempo: 180
  },
  hud: {
    damageMaxOpacity: 0.6,
    damageFadeSpeed: 2.5, // per second
    damagePulsePerHit: 0.5, // adds to flash on single hit
    damagePulsePerHP: 0.01, // adds per HP of damage
    // Heal overlay
    healMaxOpacity: 0.5,
    healFadeSpeed: 2.5, // per second
    healPulsePerPickup: 0.45, // adds to flash per orb pickup
    healPulsePerHP: 0.01, // adds per HP healed
    // Hitmarker (X) flash
    hitFadeSpeed: 12.0, // higher = faster fade (per second)
    hitMaxOpacity: 0.3, // cap opacity to 30%
    hitSize: 12,        // shorter segment length
    hitGapExtra: 6      // extra center gap vs crosshair
  },
  seed: 1337
};

// Day/Night cycle configuration
export const DAY_NIGHT = {
  enabled: true,
  lengthSec: 180, // full cycle duration
  // Orbit
  sunDistance: 200,   // distance of sun sprite from origin
  moonDistance: 200,  // distance of moon sprite from origin
  sunTiltDeg: -30,    // yaw tilt of the sun path (azimuth)
  // Intensities
  nightAmbient: 0.45,
  dayAmbient: 0.65,
  nightKey: 0.9,   // keep night brighter than before
  dayKey: 1.5,
  // Fog densities
  nightFogDensity: 0.006,
  dayFogDensity: 0.0035,
  // Colors
  colors: {
    ambientSkyNight: 0x6a7f9a,
    ambientSkyDay: 0xbfd4ff,
    ambientGroundNight: 0x2a3544,
    ambientGroundDay: 0x7a8c6e,
    dirNight: 0x8baae0,
    dirDay: 0xfff1cc,
    // Sun color grading
    sunSunrise: 0xffa04a, // warmer at horizon
    sunNoon: 0xfff1cc,    // softer pale at zenith
    fogNight: 0x101922,
    fogDay: 0x9cc3ff,
    bgNight: 0x121a24,
    bgDay: 0x6ea7e0
  }
};

// Simple clouds config
export const CLOUDS = {
  enabled: true,
  count: 12,
  height: 92,
  radius: 200,
  sizeMin: 28,
  sizeMax: 48,
  speed: 2.0,          // base drift speed
  windDeg: 35,         // wind direction in degrees (0 = +X, 90 = +Z)
  opacityDay: 0.55,
  opacityNight: 0.25,
  colorDay: 0xffffff,
  colorNight: 0xa0b0c8
};

// Background mountains (purely visual)
export const MOUNTAINS = {
  enabled: true,
  radius: 420,
  segments: 96,
  baseHeight: 20,
  heightVar: 60,
  yOffset: -30,
  colorDay: 0x6e8ba6,
  colorNight: 0x223140,
  // Per-vertex gradient along height
  colorBase: 0x1d2a35,
  colorPeak: 0xd7e0ea,
  // Bottom fade to avoid visible base demarcation
  fadeEdge: 0.45, // 0..1, where it starts to become opaque
  fadePow: 1.3
};
