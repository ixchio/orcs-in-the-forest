// Weather events — fog bank, blood moon, thunderstorm
import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';

const WEATHER_TYPES = ['fog', 'bloodMoon', 'thunderstorm'];
const WEATHER_NAMES = { fog: '🌫️ FOG BANK', bloodMoon: '🔴 BLOOD MOON', thunderstorm: '⚡ THUNDERSTORM' };

export function maybeStartWeather(waveNumber) {
    // Trigger on waves 4, 8, 12…
    if (waveNumber < 4 || waveNumber % 4 !== 0) return;

    const type = WEATHER_TYPES[Math.floor(G.random() * WEATHER_TYPES.length)];
    G.weather.type = type;
    G.weather.timer = 0;
    G.weather.lightningTimer = 0;

    // Show banner
    showWeatherBanner(WEATHER_NAMES[type] || type);

    // Save current fog density for restoration
    G.weather.savedFogDensity = G.scene.fog?.density || 0;

    if (type === 'fog') {
        // Extreme fog — visibility ~15m
        if (G.scene.fog) G.scene.fog.density = 0.08;
    } else if (type === 'bloodMoon') {
        // Red tint + enemy speed boost
        G.weather.bloodMoon = true;
        if (G.ambientLight) {
            G.weather.savedAmbientColor = G.ambientLight.color.getHex();
            G.ambientLight.color.set(0xff2222);
        }
        if (G.scene.fog) {
            G.weather.savedFogColor = G.scene.fog.color.getHex();
            G.scene.fog.color.set(0x220000);
        }
        if (G.scene.background) {
            G.weather.savedBg = G.scene.background.getHex();
            G.scene.background.set(0x110000);
        }
    } else if (type === 'thunderstorm') {
        // Rain particles
        createRain();
        G.weather.lightningTimer = 3 + G.random() * 4;
    }
}

export function updateWeather(delta) {
    if (!G.weather.type) return;

    G.weather.timer += delta;

    if (G.weather.type === 'thunderstorm') {
        // Update rain
        if (G.weather.rain) {
            const positions = G.weather.rain.geometry.getAttribute('position');
            for (let i = 0; i < positions.count; i++) {
                let y = positions.getY(i);
                y -= 40 * delta; // rain speed
                if (y < 0) y += 30;
                positions.setY(i, y);
            }
            positions.needsUpdate = true;
            // Move rain to follow player
            G.weather.rain.position.x = G.player.pos.x;
            G.weather.rain.position.z = G.player.pos.z;
        }

        // Lightning flashes
        G.weather.lightningTimer -= delta;
        if (G.weather.lightningTimer <= 0) {
            triggerLightning();
            G.weather.lightningTimer = 2 + G.random() * 5;
        }

        // Fade lightning flash
        if (G.weather.flashTimer > 0) {
            G.weather.flashTimer -= delta;
            const el = document.getElementById('lightning-flash');
            if (el) el.style.opacity = Math.max(0, G.weather.flashTimer / 0.15).toString();
        }
    }
}

export function endWeather() {
    if (!G.weather.type) return;

    if (G.weather.type === 'fog') {
        if (G.scene.fog) G.scene.fog.density = G.weather.savedFogDensity;
    } else if (G.weather.type === 'bloodMoon') {
        G.weather.bloodMoon = false;
        // Colors will be restored by daynight.js on next frame
    } else if (G.weather.type === 'thunderstorm') {
        // Remove rain
        if (G.weather.rain) {
            G.scene.remove(G.weather.rain);
            G.weather.rain.geometry.dispose();
            G.weather.rain.material.dispose();
            G.weather.rain = null;
        }
        const el = document.getElementById('lightning-flash');
        if (el) el.style.opacity = '0';
    }

    hideWeatherBanner();
    G.weather.type = null;
    G.weather.timer = 0;
}

function createRain() {
    const count = 2000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 60;
        positions[i * 3 + 1] = Math.random() * 30;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        color: 0x8899bb,
        size: 0.08,
        transparent: true,
        opacity: 0.6,
        depthWrite: false
    });
    const rain = new THREE.Points(geo, mat);
    rain.position.y = 5;
    G.scene.add(rain);
    G.weather.rain = rain;
}

function triggerLightning() {
    // Flash overlay
    const el = document.getElementById('lightning-flash');
    if (el) el.style.opacity = '1';
    G.weather.flashTimer = 0.15;

    // Brief bright ambient
    if (G.ambientLight) {
        const savedI = G.ambientLight.intensity;
        G.ambientLight.intensity = 5;
        setTimeout(() => { if (G.ambientLight) G.ambientLight.intensity = savedI; }, 120);
    }
}

function showWeatherBanner(text) {
    let el = document.getElementById('weather-banner');
    if (!el) {
        el = document.createElement('div');
        el.id = 'weather-banner';
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
}

function hideWeatherBanner() {
    const el = document.getElementById('weather-banner');
    if (el) el.style.opacity = '0';
}

/**
 * Returns the enemy speed multiplier from weather (1.5× for Blood Moon)
 */
export function getWeatherSpeedMult() {
    return G.weather.bloodMoon ? 1.5 : 1.0;
}

/**
 * Returns the score multiplier from weather (2× for Blood Moon)
 */
export function getWeatherScoreMult() {
    return G.weather.bloodMoon ? 2.0 : 1.0;
}
