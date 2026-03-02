import { G } from './globals.js';
import { CFG } from './config.js';
import { showOverlay } from './hud.js';
import { initAudio, resumeAudio } from './audio.js';
import { primeGrenade, releaseGrenade } from './grenades.js';
import { switchWeapon } from './weapon.js';

export function setupEvents({ startGame, restartGame, beginReload, updateWeaponAnchor }) {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;

  overlay.addEventListener('click', () => {
    // Initialize audio on user gesture
    initAudio();
    if (G.state === 'menu') {
      G.controls.lock();
    } else if (G.state === 'paused') {
      G.controls.lock();
    } else if (G.state === 'gameover') {
      // Restart on click after game over
      restartGame();
    }
  });

  G.controls.addEventListener('lock', () => {
    if (G.state === 'menu') {
      startGame();
    } else if (G.state === 'paused') {
      G.state = 'playing';
      overlay.classList.add('hidden');
    } else if (G.state === 'gameover') {
      // Treat lock like a fresh start after game over
      startGame();
    }
  });

  G.controls.addEventListener('unlock', () => {
    if (G.state === 'playing') {
      G.state = 'paused';
      showOverlay('paused');
    }
  });

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyW': G.input.w = true; break;
      case 'KeyA': G.input.a = true; break;
      case 'KeyS': G.input.s = true; break;
      case 'KeyD': G.input.d = true; break;
      case 'ShiftLeft': G.input.sprint = true; break;
      case 'KeyC': G.input.crouch = true; break;
      case 'KeyG':
        if (G.state === 'playing') {
          G.input.grenade = true;
          primeGrenade();
        }
        break;
      case 'Space':
        if (G.state === 'playing') {
          // Use buffered jump handled in player physics
          G.input.jump = true;
        }
        break;
      case 'KeyF':
        if (G.state === 'playing' && G.flashlight) {
          G.flashlight.visible = !G.flashlight.visible;
        }
        break;
      case 'KeyP':
      case 'Escape':
        if (G.state === 'playing') {
          G.controls.unlock();
        }
        break;
      case 'KeyR':
        if (G.state === 'playing') {
          beginReload();
        }
        break;
      case 'Digit1':
        if (G.state === 'playing') switchWeapon(0);
        break;
      case 'Digit2':
        if (G.state === 'playing') switchWeapon(1);
        break;
      case 'Digit3':
        if (G.state === 'playing') switchWeapon(2);
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW': G.input.w = false; break;
      case 'KeyA': G.input.a = false; break;
      case 'KeyS': G.input.s = false; break;
      case 'KeyD': G.input.d = false; break;
      case 'ShiftLeft': G.input.sprint = false; break;
      case 'KeyC': G.input.crouch = false; break;
      case 'KeyG':
        if (G.input.grenade) {
          G.input.grenade = false;
          releaseGrenade();
        }
        break;
      case 'Space':
        G.input.jump = false;
        break;
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && G.state === 'playing') {
      // Ensure audio context is running on interaction
      resumeAudio();
      G.input.shoot = true;
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      G.input.shoot = false;
    }
  });

  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(window.innerWidth, window.innerHeight);
    updateWeaponAnchor();
  });
}
