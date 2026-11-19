/**
 * Consultas para interactuar (agarrar, usar la salida) y para las puertas de Vista. Lógica pura.
 */
import type { Casilla, Mapa, ObjetoDef, ObjetoId, PuertaDef, Punto } from '../shared/contratos';
import { centroDe, distancia, hayPared, type Puertas } from '../shared/mapaUtil';

/**
 * Objeto sin agarrar más cercano dentro del alcance. Basta la distancia: Oído juega a ciegas y
 * no se le exige estar de frente. No se agarra a través de una pared.
 */
export function objetoAlAlcance(
  mapa: Mapa,
  puertas: Puertas,
  inventario: Record<ObjetoId, boolean>,
  pos: Punto,
  alcance: number,
): ObjetoDef | undefined {
  let mejor: ObjetoDef | undefined;
  let mejorD = Infinity;
  for (const o of mapa.objetos) {
    if (inventario[o.id]) continue;
    const d = distancia(o.pos, pos);
    if (d > alcance || d >= mejorD) continue;
    if (hayPared(mapa, puertas, pos, o.pos)) continue;
    mejor = o;
    mejorD = d;
  }
  return mejor;
}

/** Puerta de salida todavía cerrada cuya casilla (su centro) está dentro del alcance. */
export function salidaAlAlcance(mapa: Mapa, puertas: Puertas, pos: Punto, alcance: number): PuertaDef | undefined {
  return mapa.puertas.find((p) => p.esSalida && !puertas[p.id] && distancia(centroDe(p.casilla), pos) <= alcance);
}

/** Puerta que maneja Vista con la cámara `numero` activa, si existe y es controlable. */
export function puertaDeCamara(mapa: Mapa, numero: number): PuertaDef | undefined {
  const camara = mapa.camaras.find((c) => c.numero === numero);
  if (!camara?.puertaId) return undefined;
  const puerta = mapa.puertas.find((p) => p.id === camara.puertaId);
  return puerta?.controlable ? puerta : undefined;
}

/** true si un círculo toca el cuadrado de 1×1 m de la casilla. */
export function circuloTocaCasilla(pos: Punto, radio: number, casilla: Casilla): boolean {
  const px = Math.max(casilla.cx, Math.min(pos.x, casilla.cx + 1));
  const pz = Math.max(casilla.cz, Math.min(pos.z, casilla.cz + 1));
  return (pos.x - px) ** 2 + (pos.z - pz) ** 2 < radio * radio;
}
