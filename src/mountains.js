import * as THREE from 'three';
import { G } from './globals.js';
import { MOUNTAINS } from './config.js';
const COLOR_N = new THREE.Color(MOUNTAINS.colorNight);
const COLOR_D = new THREE.Color(MOUNTAINS.colorDay);
const TMP_COLOR = new THREE.Color();

function dayFactor(t) {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
}

function buildMountainRing({ radius, segments, baseHeight, heightVar, yOffset }) {
  const vertCount = segments * 2;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const aH = new Float32Array(vertCount); // 0 at bottom ring, 1 at peaks
  const indices = new Uint16Array(segments * 6);

  const colBottom = new THREE.Color(MOUNTAINS.colorBase);
  const colTop = new THREE.Color(MOUNTAINS.colorPeak);

  function ridge(a) {
    const s1 = Math.sin(a * 3.0) * 0.7 + Math.sin(a * 7.0) * 0.3;
    const s2 = Math.sin(a * 1.7 + 1.3) * 0.5 + Math.sin(a * 4.3 + 0.7) * 0.5;
    const v = 0.5 * s1 + 0.5 * s2;
    return baseHeight + heightVar * (0.5 + 0.5 * v);
  }

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const h = ridge(a0);
    const x = Math.cos(a0) * radius;
    const z = Math.sin(a0) * radius;

    const iBot = i * 3;
    positions[iBot + 0] = x;
    positions[iBot + 1] = yOffset;
    positions[iBot + 2] = z;

    const iTop = (segments + i) * 3;
    positions[iTop + 0] = x;
    positions[iTop + 1] = yOffset + h;
    positions[iTop + 2] = z;

    colors[iBot + 0] = colBottom.r;
    colors[iBot + 1] = colBottom.g;
    colors[iBot + 2] = colBottom.b;
    colors[iTop + 0] = colTop.r;
    colors[iTop + 1] = colTop.g;
    colors[iTop + 2] = colTop.b;

    aH[i] = 0.0;                   // bottom vertex ratio
    aH[segments + i] = 1.0;        // top vertex ratio
  }

  let idx = 0;
  for (let i = 0; i < segments; i++) {
    const n = (i + 1) % segments;
    const b0 = i;
    const b1 = n;
    const t0 = segments + i;
    const t1 = segments + n;
    indices[idx++] = b0;
    indices[idx++] = t0;
    indices[idx++] = b1;
    indices[idx++] = b1;
    indices[idx++] = t0;
    indices[idx++] = t1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  geo.computeBoundingSphere();
  return geo;
}

export function setupMountains() {
  if (!MOUNTAINS.enabled) return;
  const geo = buildMountainRing({
    radius: MOUNTAINS.radius,
    segments: MOUNTAINS.segments,
    baseHeight: MOUNTAINS.baseHeight,
    heightVar: MOUNTAINS.heightVar,
    yOffset: MOUNTAINS.yOffset
  });
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(MOUNTAINS.colorDay),
    vertexColors: true,
    fog: false,           // keep visible even in heavy fog
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide, // ensure visible regardless of winding
    transparent: true
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeEdge = { value: MOUNTAINS.fadeEdge ?? 0.35 };
    shader.uniforms.uFadePow = { value: MOUNTAINS.fadePow ?? 1.5 };
    shader.vertexShader = (
      'attribute float aH;\n' +
      'varying float vH;\n' +
      shader.vertexShader
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n vH = aH;`
    );
    shader.fragmentShader = (
      'varying float vH;\n uniform float uFadeEdge; uniform float uFadePow;\n' +
      shader.fragmentShader
    ).replace(
      '#include <dithering_fragment>',
      `diffuseColor.a *= pow(smoothstep(uFadeEdge, 1.0, vH), uFadePow);\n#include <dithering_fragment>`
    );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -10;
  G.scene.add(mesh);
  G.mountains = mesh;
}

export function updateMountains(delta) {
  if (!MOUNTAINS.enabled || !G.mountains) return;
  const p = G.player ? G.player.pos : G.camera.position;
  G.mountains.position.set(p.x, 0, p.z);

  const dayF = dayFactor(G.timeOfDay || 0);
  TMP_COLOR.copy(COLOR_N).lerp(COLOR_D, dayF);
  G.mountains.material.color.copy(TMP_COLOR);
}
