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
    /** Grados por pulsación de ← → (o A D). El cuerpo siempre queda en 0/90/180/270. */
    gradosPorGiro: 90,
    segPorGiro: 0.25,
    /** Sensibilidad del mouse al girar la cabeza (grados por píxel). */
    gradosPorPixelMouse: 0.15,
    /** El mouse solo gira la cabeza, como mucho estos grados a cada lado del cuerpo. */
    gradosCabezaMax: 60,
    /** Velocidad con la que la cabeza vuelve sola al frente al empezar un paso o un giro. */
    gradosPorSegRecentrarCabeza: 400,
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
    /** Nivel que mandan las teclas de ruido simulado (respaldo sin micrófono). */
    simuladoCuidado: 0.5,
    simuladoPeligro: 0.9,
  },

  /** Dueño: integración. */
  interfaz: {
    /** Tiempo que se quedan en pantalla los avisos de "sin cámara / sin micrófono". */
    msAviso: 6000,
  },

  /** Dueño: simulación (hito 5). */
  monstruo: {
    /** Merodeando o investigando: más lento que Oído caminando. */
    segPorPasoPatrulla: 1.0,
    /** Cazando: algo más rápido que Oído caminando (0.55) y más lento que corriendo (0.30). */
    segPorPasoCaza: 0.45,
    /**
     * Segundos de silencio para dejar de escuchar y seguir merodeando. También: si el ruido en
     * «cuidado» dura más que esto, va a investigar el último punto donde lo oyó.
     */
    segEscucha: 4,
    /** Segundos sin ruido para abandonar la caza aunque no haya llegado al punto. */
    segOlvido: 6,
    /**
     * Distancia en metros a la que atrapa a Oído. Con 0.8 hace falta que entre a su casilla (o se
     * crucen); con 1.1 bastaría estar en la casilla de al lado (bastante más difícil).
     * Merodeando o escuchando NO atrapa a un Oído quieto y en silencio; cazando atrapa siempre.
     */
    distanciaAtrapa: 0.8,
    /** Al empezar la partida se queda este tiempo en su guarida (si nadie hace ruido). */
    segInicioTranquilo: 20,
    /** Segundos sin paso ni giro (y en silencio) para que Oído cuente como escondido. */
    segQuietoParaOcultarse: 0.6,
    /** Pausa (al azar entre los dos valores) al llegar a cada punto de merodeo. */
    segPausaMin: 2,
    segPausaMax: 6,
    /** Segundos que busca en el punto del ruido antes de volver a merodear. */
    segBusca: 4,
  },

  /** Dueño: radio (hito 4). */
  radio: {
    /** La seña S se envía sola si se sostiene este tiempo [PROPUESTA]. */
    msEmergencia: 600,
    /** Tiempo que hay que sostener una seña para que se vuelva ficha. */
    msSostener: 300,
    maxFichas: 6,
    voz: { idioma: 'es-MX', velocidad: 1, tono: 0.9 },
    /** Voz con clips grabados (src/radio/vozGrabada.ts). */
    clips: {
      /** Silencio entre una orden y la siguiente del mismo mensaje. */
      segPausaEntreOrdenes: 0.28,
      /** Ganancia de los clips antes de la cadena de radio. */
      volumen: 1,
      /** Si el primer mensaje llega mientras aún cargan los clips, se espera a lo más esto. */
      msEsperaCarga: 1500,
    },
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
      // Varias teclas por acción. Con el radio abierto en una sola PC, las letras son de Vista.
      avanzar: ['ArrowUp', 'KeyW'],
      retroceder: ['ArrowDown', 'KeyS'],
      girarIzq: ['ArrowLeft', 'KeyA'],
      girarDer: ['ArrowRight', 'KeyD'],
      correr: ['ShiftLeft', 'ShiftRight'],
    },
    vista: {
      camaras: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'],
      detector: 'Tab',
      borrar: 'Backspace',
      enviar: 'Enter',
      puerta: 'KeyP',
    },
    /** Integración. El ruido simulado no actúa con el radio abierto (N y M no son señas, pero por orden). */
    general: {
      reiniciar: 'F2',
      /** Vuelve a medir el ruido base del micrófono (PC de Oído). */
      recalibrar: 'F4',
      ruidoCuidado: 'KeyN',
      ruidoPeligro: 'KeyM',
    },
  },
} as const;

export type Config = typeof CONFIG;
