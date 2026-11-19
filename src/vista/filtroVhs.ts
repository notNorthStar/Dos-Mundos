/**
 * Filtro VHS/CRT: postproceso propio. Cada cámara se dibuja a un render target pequeño y este
 * shader lo pasa a la pantalla con deformación de tubo, aberración cromática, líneas de barrido,
 * grano, banda de «tracking» y estática (la que mete el monstruo, DISENO.md §5.2).
 *
 * Cada recuadro (cámara grande o miniatura) es un plano con su propio material; todos comparten
 * el mismo programa. El plano se coloca directo en coordenadas de pantalla (−1 a 1).
 */
import * as THREE from 'three';
import { AJUSTES_VISTA as A } from './ajustes';

const VERTICES = /* glsl */ `
uniform vec2 uCentro;
uniform vec2 uEscala;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * uEscala + uCentro, 0.0, 1.0);
}
`;

const FRAGMENTOS = /* glsl */ `
uniform sampler2D tImagen;
uniform float uTiempo;
uniform float uSemilla;
uniform float uEstatica;
uniform float uBrillo;
uniform float uDeformacion;
uniform float uAberracion;
uniform float uGrano;
uniform float uBarrido;
uniform float uVineta;
uniform float uSaturacion;
uniform vec3 uTinte;
varying vec2 vUv;

float azar(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  // Cuadro de «video» a 24 por segundo: el ruido cambia a saltos, no continuo.
  float cuadro = mod(floor(uTiempo * 24.0), 512.0) + uSemilla * 7.0;

  // Deformación de tubo.
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  vec2 uv = 0.5 + c * (1.0 + uDeformacion * r2);

  // Desgarro horizontal por renglones (más con estática).
  float renglon = floor(uv.y * 60.0);
  float rota = step(0.992 - uEstatica * 0.35, azar(vec2(renglon, cuadro)));
  uv.x += rota * (azar(vec2(cuadro, renglon)) - 0.5) * (0.015 + 0.16 * uEstatica);

  // Banda de tracking que recorre la imagen.
  float banda = fract(uv.y + uTiempo * 0.11 + uSemilla * 0.37);
  float tracking = smoothstep(0.0, 0.015, banda) * (1.0 - smoothstep(0.015, 0.06, banda));
  uv.x += tracking * 0.008;

  // Aberración cromática.
  float ab = uAberracion * (1.0 + 5.0 * uEstatica);
  vec3 color;
  color.r = texture2D(tImagen, uv + vec2(ab, 0.0)).r;
  color.g = texture2D(tImagen, uv).g;
  color.b = texture2D(tImagen, uv - vec2(ab, 0.0)).b;

  // Imagen de cámara barata: poco color y un tinte.
  float gris = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(gris), color, uSaturacion) * uTinte;

  // Grano.
  color += (azar(gl_FragCoord.xy + cuadro * 1.7) - 0.5) * uGrano;

  // Estática: nieve mezclada por renglones.
  float nieve = azar(gl_FragCoord.xy * 0.71 + vec2(cuadro * 3.1, cuadro * 1.3));
  float mezcla = uEstatica * (0.55 + 0.45 * azar(vec2(cuadro, floor(uv.y * 24.0))));
  color = mix(color, vec3(nieve * 0.8), clamp(mezcla, 0.0, 1.0));

  color *= uBrillo;
  color += tracking * 0.05;

  // Líneas de barrido y viñeta.
  color *= 1.0 - uBarrido * step(1.0, mod(gl_FragCoord.y, 2.0));
  color *= clamp(1.0 - r2 * uVineta, 0.0, 1.0);

  // Fuera del tubo: negro.
  float dentro = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  gl_FragColor = vec4(max(color, 0.0) * dentro, 1.0);
  #include <colorspace_fragment>
}
`;

export interface Recuadro {
  malla: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** Coloca el recuadro: rectángulo en píxeles internos del lienzo (origen arriba-izquierda). */
  colocar(x: number, y: number, ancho: number, alto: number, anchoLienzo: number, altoLienzo: number): void;
  ponerImagen(textura: THREE.Texture): void;
  /** Valores que cambian cada cuadro. */
  animar(tiempo: number, estatica: number, brillo: number): void;
}

/** `fuerza` escala los efectos de lente (las miniaturas llevan menos deformación). */
export function crearRecuadro(geometria: THREE.BufferGeometry, semilla: number, fuerza = 1): Recuadro {
  const V = A.vhs;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTICES,
    fragmentShader: FRAGMENTOS,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tImagen: { value: null },
      uCentro: { value: new THREE.Vector2(0, 0) },
      uEscala: { value: new THREE.Vector2(1, 1) },
      uTiempo: { value: 0 },
      uSemilla: { value: semilla },
      uEstatica: { value: 0 },
      uBrillo: { value: 1 },
      uDeformacion: { value: V.deformacion * fuerza },
      uAberracion: { value: V.aberracion * fuerza },
      uGrano: { value: V.grano },
      uBarrido: { value: V.barrido },
      uVineta: { value: V.vineta },
      uSaturacion: { value: V.saturacion },
      uTinte: { value: new THREE.Vector3(V.tinte[0] ?? 1, V.tinte[1] ?? 1, V.tinte[2] ?? 1) },
    },
  });
  const malla = new THREE.Mesh(geometria, material);
  malla.frustumCulled = false;
  const u = material.uniforms;

  return {
    malla,
    material,
    colocar(x, y, ancho, alto, anchoLienzo, altoLienzo) {
      const centro = u['uCentro']!.value as THREE.Vector2;
      const escala = u['uEscala']!.value as THREE.Vector2;
      escala.set(ancho / anchoLienzo, alto / altoLienzo);
      centro.set(((x + ancho / 2) / anchoLienzo) * 2 - 1, 1 - ((y + alto / 2) / altoLienzo) * 2);
    },
    ponerImagen(textura) {
      u['tImagen']!.value = textura;
    },
    animar(tiempo, estatica, brillo) {
      u['uTiempo']!.value = tiempo;
      u['uEstatica']!.value = estatica;
      u['uBrillo']!.value = brillo;
    },
  };
}
