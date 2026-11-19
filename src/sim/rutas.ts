/**
 * Rutas sobre la cuadrícula del mapa con búsqueda en anchura (BFS). Lógica pura.
 * Vecindad de 4 (sin diagonales): el monstruo va de centro de casilla en centro de casilla.
 */
import type { Casilla, Mapa } from '../shared/contratos';
import { altoMapa, anchoMapa, esPared, type Puertas } from '../shared/mapaUtil';

const VECINOS: readonly Casilla[] = [
  { cx: 0, cz: -1 },
  { cx: 1, cz: 0 },
  { cx: 0, cz: 1 },
  { cx: -1, cz: 0 },
];

const SIN_VISITAR = -1;

export function mismaCasilla(a: Casilla, b: Casilla): boolean {
  return a.cx === b.cx && a.cz === b.cz;
}

/**
 * Camino más corto de `desde` a `hasta` sin pisar paredes ni puertas cerradas.
 * Devuelve las casillas a recorrer SIN incluir la de partida (lista vacía si ya está ahí).
 * Si no hay camino devuelve `null`, salvo con `aproximar = true`: entonces devuelve el camino
 * a la casilla alcanzable más cercana al destino (sirve para que el monstruo se pegue a la
 * puerta que lo separa del ruido).
 */
export function buscarRuta(
  mapa: Mapa,
  puertas: Puertas,
  desde: Casilla,
  hasta: Casilla,
  aproximar = false,
): Casilla[] | null {
  const ancho = anchoMapa(mapa);
  const alto = altoMapa(mapa);
  const indice = (c: Casilla): number => c.cz * ancho + c.cx;
  const dentro = (c: Casilla): boolean => c.cx >= 0 && c.cx < ancho && c.cz >= 0 && c.cz < alto;
  if (!dentro(desde)) return null;

  // previo[i] = índice de la casilla desde la que se llegó a i (la de partida apunta a sí misma).
  const previo = new Array<number>(ancho * alto).fill(SIN_VISITAR);
  const inicio = indice(desde);
  previo[inicio] = inicio;
  const cola: Casilla[] = [desde];

  let mejor = desde;
  let mejorD = distanciaCuadrada(desde, hasta);
  let encontrada = mismaCasilla(desde, hasta);

  for (let i = 0; i < cola.length && !encontrada; i++) {
    const actual = cola[i]!;
    for (const v of VECINOS) {
      const sig: Casilla = { cx: actual.cx + v.cx, cz: actual.cz + v.cz };
      if (!dentro(sig) || previo[indice(sig)] !== SIN_VISITAR) continue;
      if (esPared(mapa, puertas, sig.cx, sig.cz)) continue;
      previo[indice(sig)] = indice(actual);
      cola.push(sig);
      // BFS visita por distancia creciente: con `<` estricto, en empates gana la de menos pasos.
      const d = distanciaCuadrada(sig, hasta);
      if (d < mejorD) {
        mejorD = d;
        mejor = sig;
      }
      if (mismaCasilla(sig, hasta)) {
        encontrada = true;
        break;
      }
    }
  }

  if (!encontrada && !aproximar) return null;
  const meta = encontrada ? hasta : mejor;

  const camino: Casilla[] = [];
  let i = indice(meta);
  while (i !== inicio) {
    camino.push({ cx: i % ancho, cz: Math.floor(i / ancho) });
    i = previo[i]!;
  }
  return camino.reverse();
}

function distanciaCuadrada(a: Casilla, b: Casilla): number {
  return (a.cx - b.cx) ** 2 + (a.cz - b.cz) ** 2;
}
