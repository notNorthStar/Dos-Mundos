/**
 * Todos los valores ajustables del juego (AGENTS.md §5). Nada de números mágicos en los sistemas:
 * si un sistema necesita un valor nuevo, se agrega aquí en su sección.
 * Cada sección tiene un dueño (docs/CONTRATOS.md §6); no edites secciones ajenas.
 */
export const CONFIG = {
  /** Dueño: pantallas (hito 2). */
  render: {
    /** Alto del render interno en píxeles; el CSS lo escala sin suavizado (estilo PSX). */
    altoInterno: 240,
  },

  /** Dueño: simulación (hito 1). */
  movimiento: {
    /** Un paso = 1 metro = 1 casilla (DISENO.md §4.2). */
    metrosPorPaso: 1,
    /** Segundos que tarda un paso caminando / corriendo. */
    segPorPaso: 0.55,
    segPorPasoCorriendo: 0.3,
    /** Grados por pulsación de ← →. */
    gradosPorGiro: 90,
    segPorGiro: 0.25,
    /** Sensibilidad del giro fino con el mouse (grados por píxel). */
    gradosPorPixelMouse: 0.15,
  },

  /** Dueño: simulación (hito 5). Niveles de ruido de 0 a 1. */
  ruido: {
    umbralCuidado: 0.35,
    umbralPeligro: 0.7,
    /** Cuánto baja el ruido por segundo si nadie hace nada. */
    caidaPorSeg: 0.5,
    /** Ruido que suma cada acción dentro del juego. */
    porPasoCorriendo: 0.3,
    porChoque: 0.25,
    porPortazo: 0.6,
    /** Segundos de silencio para medir el ruido base del micrófono. */
    segCalibracion: 5,
    /** dB por encima del ruido base que equivalen a nivel 1. */
    rangoDb: 30,
  },

  /** Dueño: simulación (hito 5). */
  monstruo: {
    segPorPasoPatrulla: 0.9,
    segPorPasoCaza: 0.35,
    /** Segundos que se queda escuchando antes de volver a patrullar. */
    segEscucha: 4,
    /** Segundos sin ruido para abandonar la caza. */
    segOlvido: 6,
    /** Distancia en metros a la que atrapa a Oído. */
    distanciaAtrapa: 0.8,
  },

  /** Dueño: radio (hito 4). */
  radio: {
    /** La seña S se envía sola si se sostiene este tiempo [PROPUESTA]. */
    msEmergencia: 600,
    /** Tiempo que hay que sostener una seña para que se vuelva ficha. */
    msSostener: 300,
    maxFichas: 6,
    voz: { idioma: 'es-MX', velocidad: 1, tono: 0.9 },
  },

  /** Dueño: audio (hito 3). */
  audio: {
    volumenGeneral: 0.9,
    /** Distancias del PannerNode en metros. */
    distanciaRef: 1,
    distanciaMax: 25,
    rolloff: 1.4,
    /** Frecuencia de corte del pasa-bajas cuando hay una pared entre la fuente y Oído. */
    hzOclusion: 600,
    /** A menos de estos metros se empieza a oír el tintineo de la llave. */
    metrosTintineo: 2,
  },

  /** Teclas (DISENO.md §6.1). Valores de KeyboardEvent.code. Nunca Ctrl. */
  teclas: {
    oido: {
      avanzar: 'ArrowUp',
      retroceder: 'ArrowDown',
      girarIzq: 'ArrowLeft',
      girarDer: 'ArrowRight',
      correr: 'ShiftRight',
    },
    vista: {
      camaras: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'],
      detector: 'Tab',
      borrar: 'Backspace',
      enviar: 'Enter',
      puerta: 'KeyP',
    },
  },
} as const;

export type Config = typeof CONFIG;
