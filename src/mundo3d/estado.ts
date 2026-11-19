/**
 * Utilidades de estado para las pantallas: el estado inicial deducido del mapa (para dibujar
 * antes de que llegue el primer `sim/estado`) y una copia sin crear objetos (cada cliente guarda
 * SU copia del último estado; nunca se modifica el objeto que llegó por el bus).
 */
import type { EstadoJuego, Mapa } from '../shared/contratos';
import { cuartoEn, puertasIniciales } from '../shared/mapaUtil';

export function estadoInicial(mapa: Mapa): EstadoJuego {
  return {
    t: 0,
    fase: 'inicio',
    oido: {
      pos: { x: mapa.inicioOido.pos.x, z: mapa.inicioOido.pos.z },
      rumbo: mapa.inicioOido.rumbo,
      cuartoId: cuartoEn(mapa, mapa.inicioOido.pos).id,
      corriendo: false,
      moviendose: false,
    },
    monstruo: {
      pos: { x: mapa.inicioMonstruo.x, z: mapa.inicioMonstruo.z },
      rumbo: 0,
      cuartoId: cuartoEn(mapa, mapa.inicioMonstruo).id,
      estado: 'patrulla',
    },
    puertas: puertasIniciales(mapa),
    inventario: { decibelimetro: false, llave: false },
    ruido: { nivel: 0, zona: 'silencio' },
    camaraActiva: mapa.camaras[0]?.numero ?? 1,
  };
}

/** Copia `origen` sobre `destino` campo por campo (sin crear objetos). */
export function copiarEstado(destino: EstadoJuego, origen: EstadoJuego): void {
  destino.t = origen.t;
  destino.fase = origen.fase;

  destino.oido.pos.x = origen.oido.pos.x;
  destino.oido.pos.z = origen.oido.pos.z;
  destino.oido.rumbo = origen.oido.rumbo;
  destino.oido.cuartoId = origen.oido.cuartoId;
  destino.oido.corriendo = origen.oido.corriendo;
  destino.oido.moviendose = origen.oido.moviendose;

  destino.monstruo.pos.x = origen.monstruo.pos.x;
  destino.monstruo.pos.z = origen.monstruo.pos.z;
  destino.monstruo.rumbo = origen.monstruo.rumbo;
  destino.monstruo.cuartoId = origen.monstruo.cuartoId;
  destino.monstruo.estado = origen.monstruo.estado;

  for (const id in origen.puertas) destino.puertas[id] = origen.puertas[id] === true;
  destino.inventario.decibelimetro = origen.inventario.decibelimetro === true;
  destino.inventario.llave = origen.inventario.llave === true;

  destino.ruido.nivel = origen.ruido.nivel;
  destino.ruido.zona = origen.ruido.zona;
  destino.camaraActiva = origen.camaraActiva;
}

/** Diferencia angular más corta de `desde` a `hasta`, en grados, en (−180, 180]. */
export function diferenciaRumbo(desde: number, hasta: number): number {
  let d = (hasta - desde) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
