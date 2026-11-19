/**
 * Consultas del mapa que comparten la simulación y los clientes (docs/CONTRATOS.md §4).
 * Lógica pura: sin DOM ni Three.js.
 */
import type { Casilla, Cuarto, Mapa, PuertaDef, Punto } from './contratos';

/** id de puerta → abierta (lo mismo que EstadoJuego.puertas). */
export type Puertas = Record<string, boolean>;

export function anchoMapa(mapa: Mapa): number {
  return mapa.celdas[0]?.length ?? 0;
}

export function altoMapa(mapa: Mapa): number {
  return mapa.celdas.length;
}

export function casillaDe(pos: Punto): Casilla {
  return { cx: Math.floor(pos.x), cz: Math.floor(pos.z) };
}

export function centroDe(c: Casilla): Punto {
  return { x: c.cx + 0.5, z: c.cz + 0.5 };
}

export function puertaEn(mapa: Mapa, cx: number, cz: number): PuertaDef | undefined {
  return mapa.puertas.find((p) => p.casilla.cx === cx && p.casilla.cz === cz);
}

export function puertasIniciales(mapa: Mapa): Puertas {
  const estado: Puertas = {};
  for (const p of mapa.puertas) estado[p.id] = p.abiertaAlInicio;
  return estado;
}

/** true si la casilla no se puede pisar: pared, fuera del mapa o puerta cerrada. */
export function esPared(mapa: Mapa, puertas: Puertas, cx: number, cz: number): boolean {
  const fila = mapa.celdas[cz];
  if (fila === undefined || cx < 0 || cx >= fila.length) return true;
  const c = fila[cx];
  if (c === '#') return true;
  if (c === 'P') {
    const puerta = puertaEn(mapa, cx, cz);
    return puerta ? !puertas[puerta.id] : false;
  }
  return false;
}

/** true si un círculo de `radio` metros centrado en `pos` toca alguna pared o puerta cerrada. */
export function chocaCirculo(mapa: Mapa, puertas: Puertas, pos: Punto, radio: number): boolean {
  const x0 = Math.floor(pos.x - radio);
  const x1 = Math.floor(pos.x + radio);
  const z0 = Math.floor(pos.z - radio);
  const z1 = Math.floor(pos.z + radio);
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (!esPared(mapa, puertas, cx, cz)) continue;
      const px = Math.max(cx, Math.min(pos.x, cx + 1));
      const pz = Math.max(cz, Math.min(pos.z, cz + 1));
      const dx = pos.x - px;
      const dz = pos.z - pz;
      if (dx * dx + dz * dz < radio * radio) return true;
    }
  }
  return false;
}

function dentro(c: Cuarto, cx: number, cz: number): boolean {
  return cx >= c.desde.cx && cx <= c.hasta.cx && cz >= c.desde.cz && cz <= c.hasta.cz;
}

/**
 * Cuarto en el que está el punto. En una casilla de puerta devuelve el primero de los dos
 * cuartos que conecta. Si no cae en ninguno, devuelve el más cercano (nunca undefined).
 */
export function cuartoEn(mapa: Mapa, pos: Punto): Cuarto {
  const { cx, cz } = casillaDe(pos);
  const directo = mapa.cuartos.find((c) => dentro(c, cx, cz));
  if (directo) return directo;
  const puerta = puertaEn(mapa, cx, cz);
  if (puerta) {
    const c = mapa.cuartos.find((q) => q.id === puerta.entre[0]);
    if (c) return c;
  }
  let mejor = mapa.cuartos[0]!;
  let mejorD = Infinity;
  for (const c of mapa.cuartos) {
    const mx = (c.desde.cx + c.hasta.cx + 1) / 2;
    const mz = (c.desde.cz + c.hasta.cz + 1) / 2;
    const d = (mx - pos.x) ** 2 + (mz - pos.z) ** 2;
    if (d < mejorD) {
      mejorD = d;
      mejor = c;
    }
  }
  return mejor;
}

/**
 * true si entre `a` y `b` hay alguna pared o puerta cerrada (línea de vista cortada).
 * Sirve para la oclusión del audio. Recorre el segmento en pasos de 10 cm.
 */
export function hayPared(mapa: Mapa, puertas: Puertas, a: Punto, b: Punto): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const largo = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(largo / 0.1));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (esPared(mapa, puertas, Math.floor(a.x + dx * t), Math.floor(a.z + dz * t))) return true;
  }
  return false;
}

/** Rumbo en grados (0 = norte, 90 = este) → vector unitario en el plano. */
export function vectorDeRumbo(rumbo: number): Punto {
  const r = (rumbo * Math.PI) / 180;
  return { x: Math.sin(r), z: -Math.cos(r) };
}

/** Rumbo en grados para ir de `a` hacia `b`. */
export function rumboHacia(a: Punto, b: Punto): number {
  return normalizarRumbo((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI);
}

export function normalizarRumbo(grados: number): number {
  const g = grados % 360;
  return g < 0 ? g + 360 : g;
}

export function distancia(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
