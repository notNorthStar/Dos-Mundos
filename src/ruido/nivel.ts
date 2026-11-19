/**
 * Conversión de volumen del micrófono a nivel de ruido del juego. Lógica pura (se prueba en Node).
 * "dB" aquí son dBFS: 0 = escala completa, valores negativos = más bajo. No son decibeles reales.
 */

/** RMS de un bloque de muestras en dBFS. Silencio digital → `pisoDb`. */
export function rmsADb(muestras: ArrayLike<number>, pisoDb: number): number {
  const n = muestras.length;
  if (n === 0) return pisoDb;
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const v = muestras[i]!;
    suma += v * v;
  }
  return potenciaADb(suma / n, pisoDb);
}

/** Potencia media (RMS²) → dBFS, con piso. */
export function potenciaADb(potencia: number, pisoDb: number): number {
  if (!(potencia > 0)) return pisoDb;
  return Math.max(pisoDb, 10 * Math.log10(potencia));
}

/** dBFS → potencia media. */
export function dbAPotencia(db: number): number {
  return Math.pow(10, db / 10);
}

/**
 * Nivel de ruido 0–1: `clamp((db − baseDb − margenDb) / rangoDb, 0, 1)`.
 * Valores no finitos o rango no positivo dan 0.
 */
export function dbANivel(db: number, baseDb: number, margenDb: number, rangoDb: number): number {
  if (!Number.isFinite(db) || !Number.isFinite(baseDb) || !(rangoDb > 0)) return 0;
  const n = (db - baseDb - margenDb) / rangoDb;
  return Math.min(1, Math.max(0, n));
}

/**
 * Suavizado exponencial con constantes distintas para subir y bajar.
 * Con dt = 0 devuelve `anterior`; con tau = 0 salta directo a `objetivo`.
 */
export function suavizar(anterior: number, objetivo: number, dtSeg: number, tauSubida: number, tauBajada: number): number {
  const tau = objetivo > anterior ? tauSubida : tauBajada;
  if (!(tau > 0)) return objetivo;
  const k = 1 - Math.exp(-Math.max(0, dtSeg) / tau);
  return anterior + (objetivo - anterior) * k;
}

/** Ruido base a partir de varias mediciones en dBFS: promedio en potencia (no en dB). */
export function promedioDb(mediciones: readonly number[], pisoDb: number): number {
  if (mediciones.length === 0) return pisoDb;
  let suma = 0;
  for (const db of mediciones) suma += dbAPotencia(db);
  return potenciaADb(suma / mediciones.length, pisoDb);
}
