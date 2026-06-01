// Melee attack — close-range punch/knife that damages nearby enemies
import * as THREE from 'three';
import { G } from './globals.js';
import { CFG } from './config.js';
import { triggerShake, spawnDamageNumber, addKillFeedEntry } from './juice.js';
import { playMeleeSwing, playMeleeHit } from './sfx.js';
import { spawnHealthOrbs } from './pickups.js';
import { registerKill, getScoreMultiplier } from './killstreak.js';
import { getWeatherScoreMult } from './weather.js';

const MELEE_RANGE = 2.8;
const MELEE_DAMAGE = 50;
const MELEE_COOLDOWN = 0.6;
const MELEE_ANGLE = Math.PI * 0.45; // ~80° cone

const tmpDir = new THREE.Vector3();
const tmpEnemy = new THREE.Vector3();

export function performMelee() {
  if (!G.player.alive || G.state !== 'playing') return;
  if (G.meleeTimer > 0) return;

  G.meleeTimer = MELEE_COOLDOWN;
  playMeleeSwing();

  // Visual feedback — quick weapon punch
  if (G.weapon.group) {
    G.weapon.recoil += 0.15;
  }

  // Get forward direction
  G.camera.getWorldDirection(tmpDir);
  tmpDir.y = 0;
  tmpDir.normalize();

  let hitAny = false;
  for (let i = 0; i < G.enemies.length; i++) {
    const enemy = G.enemies[i];
    if (!enemy.alive) continue;

    tmpEnemy.copy(enemy.pos).sub(G.player.pos);
    tmpEnemy.y = 0;
    const dist = tmpEnemy.length();
    if (dist > MELEE_RANGE) continue;

    // Check angle
    tmpEnemy.normalize();
    const dot = tmpDir.dot(tmpEnemy);
    if (dot < Math.cos(MELEE_ANGLE)) continue;

    // Hit!
    hitAny = true;
    const dmg = MELEE_DAMAGE;
    enemy.hp -= dmg;
    spawnDamageNumber(enemy.pos, dmg);

    // Knockback
    const knockDir = tmpEnemy.clone();
    enemy.pos.addScaledVector(knockDir, 2.5);

    if (enemy.hp <= 0 && enemy.alive) {
      enemy.alive = false;
      enemy.deathTimer = 0;
      G.waves.aliveCount--;
      const scoreMult = getScoreMultiplier() * getWeatherScoreMult();
      G.player.score += 15 * scoreMult;
      G.stats.kills++;
      registerKill();
      addKillFeedEntry(enemy.type, false);
      spawnHealthOrbs(enemy.pos, 2 + Math.floor(G.random() * 3));
    }
  }

  if (hitAny) {
    playMeleeHit();
    triggerShake(0.3, 10);
  }
}
