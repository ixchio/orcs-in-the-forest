import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';
import { updateHUD } from './hud.js';
import { spawnTracer, spawnImpact, spawnMuzzleFlash } from './fx.js';
import { getTreesInAABB, getTerrainHeight } from './world.js';
import { spawnShellCasing } from './casings.js';
import { popHelmet } from './helmets.js';
import { beginReload } from './weapon.js';
import { spawnHealthOrbs } from './pickups.js';
import { playGunshot, playHeadshot, playShotgunBlast, playSniperShot } from './audio.js';
import { getVampiricHeal } from './upgrades.js';
import { registerKill, getScoreMultiplier } from './killstreak.js';
import { getWeatherScoreMult } from './weather.js';

// Helper to get the active weapon's config
function activeWeaponConfig() {
  return G.activeWeaponSlot === 1 ? CFG.shotgun : CFG.gun;
}

// Reusable temps to reduce GC
const TMP2 = new THREE.Vector2();
const TMPv1 = new THREE.Vector3();
const TMPv2 = new THREE.Vector3();
const TMPn = new THREE.Vector3();
const HIT_OBJECTS = [];
const UP = new THREE.Vector3(0, 1, 0);

export function performShooting(delta) {
  G.shootCooldown -= delta;
  const wCfg = activeWeaponConfig();

  if (G.input.shoot && G.shootCooldown <= 0 && G.state === 'playing') {
    if (G.weapon.reloading) return;
    if (G.switching) return;

    const infinite = G.weapon.infiniteAmmoTimer > 0;
    if (!infinite && G.weapon.ammo <= 0) {
      G.shootCooldown = 0.2;
      G.weapon.recoil += wCfg.recoilKick * 0.25;
      return;
    }

    G.shootCooldown = 1 / (wCfg.rof * (G.weapon.rofMult || 1));
    if (!infinite) {
      G.weapon.ammo--;
    }
    G.weapon.recoil += wCfg.recoilKick;
    G.stats.totalShots++;
    updateHUD();

    // Increase dynamic spread per shot (clamped)
    const inc = wCfg.spreadShotIncrease || 0;
    const maxS = wCfg.spreadMax || 0.02;
    G.weapon.spread = Math.min(maxS, G.weapon.spread + inc);

    // View recoil: add a pitch up and small random yaw
    const pitchKick = THREE.MathUtils.degToRad(wCfg.viewKickPitchDeg || 0);
    const yawKick = THREE.MathUtils.degToRad((wCfg.viewKickYawDeg || 0) * (G.random() * 2 - 1));
    G.weapon.viewPitch += pitchKick;
    G.weapon.viewYaw += yawKick;

    // Number of pellets (1 for rifle, 8 for shotgun)
    const pelletCount = G.activeWeaponSlot === 1 ? (CFG.shotgun.pellets || 8) : 1;

    G.weapon.muzzle.getWorldPosition(TMPv1);

    for (let pellet = 0; pellet < pelletCount; pellet++) {
      const spread = G.weapon.spread || (wCfg.bloom || 0);
      const nx = (G.random() - 0.5) * spread * 2;
      const ny = (G.random() - 0.5) * spread * 2;

      TMP2.set(nx, ny);
      G.raycaster.setFromCamera(TMP2, G.camera);
      G.raycaster.far = wCfg.range;

      // Build hit list using lightweight proxies and trunk-only blockers
      HIT_OBJECTS.length = 0;
      for (let i = 0; i < G.enemies.length; i++) {
        const e = G.enemies[i];
        if (!e.alive || !e.hitProxies) continue;
        for (let k = 0; k < e.hitProxies.length; k++) HIT_OBJECTS.push(e.hitProxies[k]);
      }
      for (let i = 0; i < G.blockers.length; i++) HIT_OBJECTS.push(G.blockers[i]);

      const hits = G.raycaster.intersectObjects(HIT_OBJECTS, false);

      G.camera.getWorldDirection(TMPv2);

      let end = TMPv2.clone().multiplyScalar(wCfg.range).add(G.camera.position);
      let firstHit = null;

      // Choose nearest of raycast hit (enemy/ground) and tree trunk collision
      const origin = G.camera.position;
      const rayFirst = hits.length > 0 ? hits[0] : null;
      const rayDist = rayFirst ? origin.distanceTo(rayFirst.point) : Infinity;

      // Candidate tree hit along the segment (origin -> max range)
      let treeHitU = Infinity;
      {
        const minX = Math.min(origin.x, end.x) - 2.0;
        const maxX = Math.max(origin.x, end.x) + 2.0;
        const minZ = Math.min(origin.z, end.z) - 2.0;
        const maxZ = Math.max(origin.z, end.z) + 2.0;
        const cands = getTreesInAABB(minX, minZ, maxX, maxZ);
        const ox = origin.x, oz = origin.z;
        const ex = end.x, ez = end.z;
        const vx = ex - ox, vz = ez - oz;
        const vv = vx * vx + vz * vz || 1;
        for (let i = 0; i < cands.length; i++) {
          const t = cands[i];
          const wx = t.x - ox, wz = t.z - oz;
          let u = (wx * vx + wz * vz) / vv;
          if (u < 0) u = 0; else if (u > 1) u = 1;
          const px = ox + u * vx, pz = oz + u * vz;
          const dx = t.x - px, dz = t.z - pz;
          const rr = (t.radius + 0.2) * (t.radius + 0.2);
          if (dx * dx + dz * dz <= rr) {
            const yAt = origin.y + (end.y - origin.y) * u;
            if (yAt < 8 && u < treeHitU) treeHitU = u;
          }
        }
      }

      if (treeHitU !== Infinity && (treeHitU * origin.distanceTo(end)) < rayDist) {
        const hitPos = new THREE.Vector3(
          origin.x + (end.x - origin.x) * treeHitU,
          origin.y + (end.y - origin.y) * treeHitU,
          origin.z + (end.z - origin.z) * treeHitU
        );
        const gy = getTerrainHeight(hitPos.x, hitPos.z) + 0.02;
        if (hitPos.y < gy) hitPos.y = gy;
        end.copy(hitPos);
        firstHit = { point: hitPos, object: null, face: null };
      } else if (rayFirst) {
        firstHit = rayFirst;
        end.copy(rayFirst.point);
      }

      if (firstHit && firstHit.object) {
        function findEnemyAndZone(obj) {
          let cur = obj;
          while (cur) {
            if (cur.userData && cur.userData.enemy) {
              return { enemy: cur.userData.enemy, zone: cur.userData.hitZone || 'body' };
            }
            cur = cur.parent;
          }
          return { enemy: null, zone: null };
        }

        const { enemy, zone } = findEnemyAndZone(firstHit.object);
        if (enemy && enemy.alive) {
          G.hitFlash = Math.min(1, (G.hitFlash || 0) + 1);
          const isHead = zone === 'head';
          const dmg = wCfg.damage * (isHead ? wCfg.headshotMult : 1);
          enemy.hp -= dmg;
          G.stats.damageDealt += dmg;

          if (isHead) {
            playHeadshot();
            G.stats.headshots++;
          }

          if (isHead && enemy.helmetAttached) {
            const shotDir = new THREE.Vector3();
            G.camera.getWorldDirection(shotDir);
            popHelmet(enemy, shotDir, firstHit.point);
          }

          if (enemy.hp <= 0) {
            enemy.alive = false;
            enemy.deathTimer = 0;
            G.waves.aliveCount--;
            const scoreMult = getScoreMultiplier() * getWeatherScoreMult();
            G.player.score += (isHead ? 15 : 10) * scoreMult;
            G.stats.kills++;
            registerKill();
            // Vampiric Rounds heal
            const vHeal = getVampiricHeal();
            if (vHeal > 0) {
              G.player.health = Math.min(CFG.player.health, G.player.health + vHeal);
              G.healFlash = Math.min(1, G.healFlash + 0.25);
            }
            if (enemy.type === 'golem') {
              const cnt = 15 + Math.floor(G.random() * 6);
              spawnHealthOrbs(enemy.pos, cnt);
            } else {
              const cnt = 1 + Math.floor(G.random() * 5);
              spawnHealthOrbs(enemy.pos, cnt);
            }
          }
        } else if (firstHit.object !== G.ground) {
          const n = firstHit.face?.normal
            ? TMPn.copy(firstHit.face.normal).transformDirection(firstHit.object.matrixWorld)
            : UP;
          spawnImpact(firstHit.point, n);
        }
      } else if (firstHit && !firstHit.object) {
        spawnImpact(firstHit.point, UP);
      }

      spawnTracer(TMPv1, end);
    } // end pellet loop

    spawnMuzzleFlash();
    spawnShellCasing();
    if (G.activeWeaponSlot === 2) {
      playSniperShot();
    } else if (G.activeWeaponSlot === 1) {
      playShotgunBlast();
    } else {
      playGunshot();
    }
  }

  if (
    !G.weapon.reloading &&
    G.weapon.infiniteAmmoTimer <= 0 &&
    G.weapon.ammo === 0 &&
    (G.weapon.reserve > 0 || G.weapon.reserve === Infinity)
  ) {
    beginReload();
  }
}
