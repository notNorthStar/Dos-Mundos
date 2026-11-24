/**
 * Valores propios de la simulación que (todavía) no están en src/config.ts (docs/CONTRATOS.md §4).
 * La integración puede pasarlos a CONFIG cuando convenga. Nada de números sueltos en la lógica.
 */
export const AJUSTES_SIM = {
  /** Radio del cuerpo de Oído (solo para no cerrarle una puerta encima), en metros. */
  radioOido: 0.3,
  /** Con la tecla sostenida contra una pared, no se repite `sim/choque` antes de estos segundos. */
  segMinEntreChoques: 0.35,
  /** Distancia máxima a un objeto para agarrarlo, en metros. */
  alcanceInteraccion: 1.2,
  /** Distancia máxima al centro de la casilla de la salida para usarla, en metros. */
  alcanceSalida: 1.5,
  /** Veces por segundo que se emite `sim/estado`. */
  estadoHz: 15,
  /** La simulación parte los cuadros largos en trozos de, como mucho, estos segundos. */
  dtMaxSeg: 0.05,
  /** Segundos que el monstruo espera, encerrado sin ningún punto de merodeo alcanzable, antes de volver a probar. */
  segEsperaBloqueo: 2,
  /** Cámara activa al empezar y al reiniciar. */
  camaraInicial: 1,
} as const;

export type AjustesSim = typeof AJUSTES_SIM;
