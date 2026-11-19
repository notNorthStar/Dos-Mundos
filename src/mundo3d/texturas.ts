/**
 * Texturas generadas por código (sin assets externos): lienzos pequeños pintados píxel a píxel
 * y usados con NearestFilter para que se vean pixelados, estilo PSX.
 */
import * as THREE from 'three';
import type { Superficie } from '../shared/contratos';

type Rgb = [number, number, number];
type Pintor = (x: number, y: number, azar: () => number) => Rgb;

/** Generador pseudoaleatorio con semilla (mulberry32): mismas texturas en las dos pantallas. */
export function crearAzar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function limitar(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Pinta un lienzo de w×h llamando a `pintor` por píxel (y = 0 es el borde de ARRIBA). */
function pintar(w: number, h: number, semilla: number, pintor: Pintor): HTMLCanvasElement {
  const lienzo = document.createElement('canvas');
  lienzo.width = w;
  lienzo.height = h;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear un lienzo 2D para las texturas');
  const img = ctx.createImageData(w, h);
  const azar = crearAzar(semilla);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = pintor(x, y, azar);
      const i = (y * w + x) * 4;
      img.data[i] = limitar(c[0]);
      img.data[i + 1] = limitar(c[1]);
      img.data[i + 2] = limitar(c[2]);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return lienzo;
}

function aTextura(lienzo: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(lienzo);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Suma `v` a los tres canales. */
function mas(c: Rgb, v: number): Rgb {
  return [c[0] + v, c[1] + v, c[2] + v];
}

// ───────────────────────── Pisos (32×32, 1 m por repetición) ─────────────────────────

function pisoMadera(semilla: number): THREE.CanvasTexture {
  const tonos = [0, -10, 6, -4];
  return aTextura(
    pintar(32, 32, semilla, (x, y, azar) => {
      const tabla = Math.floor(y / 8);
      const corrido = (x + tabla * 13) % 32;
      const junta = y % 8 === 0 || corrido === 0;
      const veta = ((x * 3 + tabla * 7) % 11 === 0 ? -8 : 0) + (azar() - 0.5) * 12;
      const base: Rgb = [92, 62, 38];
      return junta ? [34, 22, 14] : mas(base, (tonos[tabla % 4] ?? 0) + veta);
    }),
  );
}

function pisoConcreto(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(32, 32, semilla, (x, y, azar) => {
      const r = azar();
      if (x === 0 || y === 0) return [44, 46, 44];
      if (r > 0.97) return [52, 54, 52];
      // Grieta diagonal quebrada.
      if (Math.abs(x - 20 + Math.floor(y / 5) * 2 - Math.floor(y / 3)) === 0 && y > 6 && y < 26) return [48, 50, 48];
      return mas([88, 90, 86], (r - 0.5) * 18);
    }),
  );
}

function pisoMetal(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(32, 32, semilla, (x, y, azar) => {
      const rombo = (x + y) % 8 === 0 || (x - y + 32) % 8 === 0;
      const borde = x === 0 || y === 0;
      const base: Rgb = [66, 76, 86];
      if (borde) return [32, 38, 44];
      return mas(base, (rombo ? 26 : 0) + (azar() - 0.5) * 10);
    }),
  );
}

export function texturaPiso(superficie: Superficie, semilla: number): THREE.CanvasTexture {
  if (superficie === 'madera') return pisoMadera(semilla);
  if (superficie === 'metal') return pisoMetal(semilla);
  return pisoConcreto(semilla);
}

export function texturaTecho(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(32, 32, semilla, (x, y, azar) => {
      const borde = x % 16 === 0 || y % 16 === 0;
      const mancha = (x - 22) * (x - 22) + (y - 9) * (y - 9) < 20 ? -10 : 0;
      return borde ? [30, 30, 29] : mas([58, 58, 55], mancha + (azar() - 0.5) * 8);
    }),
  );
}

// ───────────────────────── Paredes (32×64: 1 m de ancho, la pared completa de alto) ─────────────────────────

/** Papel tapiz verdoso con zócalo de madera. */
function paredTapiz(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(32, 64, semilla, (x, y, azar) => {
      const r = (azar() - 0.5) * 10;
      if (y >= 52) return y === 52 ? [30, 20, 13] : mas([78, 52, 32], (x % 16 === 0 ? -18 : 0) + r);
      const raya = x % 8 < 2 ? -12 : 0;
      const flor = x % 8 === 5 && y % 8 === 3 ? 16 : 0;
      const humedad = y < 10 ? -(10 - y) * 1.6 : 0;
      return mas([86, 100, 74], raya + flor + humedad + r);
    }),
  );
}

/** Pintura institucional de dos colores con escurrimientos. */
function paredBicolor(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(32, 64, semilla, (x, y, azar) => {
      const r = (azar() - 0.5) * 10;
      const escurre = (x === 7 || x === 19 || x === 20) && y > 4 && y < 30 + ((x * 5) % 9) ? -14 : 0;
      if (y === 36 || y === 37) return [28, 34, 32];
      if (y > 37) return mas([54, 86, 80], r + (y > 60 ? -16 : 0));
      return mas([124, 118, 98], r + escurre);
    }),
  );
}

/** Lámina corrugada con óxido abajo. */
function paredLamina(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(32, 64, semilla, (x, y, azar) => {
      const onda = Math.sin((x / 8) * Math.PI * 2) * 16;
      const r = azar();
      const oxido = y > 44 && r > 0.55 + (64 - y) * 0.02;
      if (y === 31 || y === 32) return [36, 42, 48];
      if (oxido) return mas([104, 58, 30], (r - 0.5) * 20);
      return mas([84, 94, 104], onda + (r - 0.5) * 8);
    }),
  );
}

/** Ladrillo oscuro. */
function paredLadrillo(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(32, 64, semilla, (x, y, azar) => {
      const hilada = Math.floor(y / 4);
      const corrido = (x + (hilada % 2) * 4) % 8;
      const junta = y % 4 === 0 || corrido === 0;
      const tono = ((hilada * 7 + Math.floor((x + (hilada % 2) * 4) / 8) * 5) % 5) * 5 - 10;
      return junta ? [36, 32, 30] : mas([96, 44, 36], tono + (azar() - 0.5) * 12);
    }),
  );
}

/** Concreto con franja amarilla y negra de señalización. */
function paredFranja(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(32, 64, semilla, (x, y, azar) => {
      const r = (azar() - 0.5) * 14;
      if (y >= 38 && y < 44) return (x + y) % 8 < 4 ? mas([190, 150, 30], r) : [22, 22, 20];
      const cimbra = y % 21 === 0 ? -14 : 0;
      const hoyo = x % 16 === 4 && y % 21 === 10 ? -24 : 0;
      return mas([104, 104, 100], r + cimbra + hoyo);
    }),
  );
}

const ESTILOS_PARED = [paredTapiz, paredBicolor, paredLamina, paredLadrillo, paredFranja];

/** Textura de pared del cuarto número `indice` (cada cuarto recibe un estilo distinto, en ciclo). */
export function texturaPared(indice: number, semilla: number): THREE.CanvasTexture {
  const estilo = ESTILOS_PARED[indice % ESTILOS_PARED.length] ?? paredBicolor;
  return estilo(semilla);
}

// ───────────────────────── Puertas (32×64, una hoja completa) ─────────────────────────

export function texturaPuerta(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(32, 64, semilla, (x, y, azar) => {
      const r = (azar() - 0.5) * 10;
      const borde = x < 1 || x > 30 || y < 1 || y > 62;
      const enTablero = x >= 5 && x <= 26 && ((y >= 6 && y <= 27) || (y >= 34 && y <= 57));
      const filoTablero =
        enTablero && (x === 5 || x === 26 || y === 6 || y === 27 || y === 34 || y === 57);
      const perilla = x >= 26 && x <= 28 && y >= 30 && y <= 32;
      if (perilla) return [190, 170, 90];
      if (borde || filoTablero) return [40, 34, 28];
      return mas([112, 98, 78], (enTablero ? -12 : 0) + r);
    }),
  );
}

/** La salida: metal rojo con barra antipánico y franjas de señalización. */
export function texturaPuertaSalida(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(32, 64, semilla, (x, y, azar) => {
      const r = (azar() - 0.5) * 12;
      const borde = x < 1 || x > 30 || y < 1 || y > 62;
      if (borde) return [36, 14, 12];
      if (y >= 30 && y <= 33 && x >= 3 && x <= 28) return mas([170, 170, 160], r);
      if (y >= 54) return (x + y) % 8 < 4 ? mas([200, 160, 30], r) : [24, 22, 18];
      const remache = (x === 4 || x === 27) && y % 10 === 5 ? 30 : 0;
      return mas([138, 34, 28], r + remache);
    }),
  );
}

/** Letrero luminoso «SALIDA» (64×16). */
export function texturaLetreroSalida(): THREE.CanvasTexture {
  const lienzo = document.createElement('canvas');
  lienzo.width = 64;
  lienzo.height = 16;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear un lienzo 2D para el letrero');
  ctx.fillStyle = '#062010';
  ctx.fillRect(0, 0, 64, 16);
  ctx.strokeStyle = '#3cff7a';
  ctx.strokeRect(0.5, 0.5, 63, 15);
  ctx.fillStyle = '#5dff93';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SALIDA', 32, 9);
  const t = aTextura(lienzo);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Grano casi blanco (16×16) que multiplica el color por vértice de muebles, marcos y figura. */
export function texturaGrano(semilla: number): THREE.CanvasTexture {
  return aTextura(
    pintar(16, 16, semilla, (_x, _y, azar) => mas([226, 226, 226], (azar() - 0.5) * 50)),
  );
}
