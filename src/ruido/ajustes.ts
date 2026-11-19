/**
 * Valores propios del micrófono (lo que no está en CONFIG.ruido). La integración puede
 * pasarlos a src/config.ts si conviene.
 */
export const AJUSTES_RUIDO = {
  /** dB por encima del ruido base que se ignoran (respiración, ventilador, fluctuación normal). */
  margenDb: 6,
  /** Ruido base supuesto si nunca se calibra. */
  baseDbInicial: -60,
  /** Piso de medición: el silencio digital se toma como este valor (evita −Infinity). */
  pisoDb: -100,
  /** Cada cuánto se manda `ruido/microfono` (≈10 por segundo). */
  segEntreEnvios: 0.1,
  /** Suavizado del nivel: sube rápido (un grito cuenta ya) y baja un poco más lento. */
  tauSubida: 0.03,
  tauBajada: 0.15,
  /** Tamaño de la ventana del AnalyserNode (muestras). 2048 ≈ 43 ms a 48 kHz. */
  fftSize: 2048,
  /** Cada cuánto se toma una muestra durante la calibración. */
  msMuestraCalibracion: 50,
} as const;
