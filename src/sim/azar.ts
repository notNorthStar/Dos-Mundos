/**
 * Azar inyectable: la simulación nunca llama a `Math.random` directo, para que las pruebas (y una
 * repetición de partida) sean deterministas con una semilla.
 */

/** Devuelve un número en [0, 1). */
export type Azar = () => number;

/** Generador sembrable (mulberry32): misma semilla, misma secuencia. */
export function crearAzar(semilla: number): Azar {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
