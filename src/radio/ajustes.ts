/**
 * Valores propios del radio (hito 4) que no están en src/config.ts (docs/CONTRATOS.md §4).
 * Los generales del radio (sostener, emergencia, máximo de fichas, voz) viven en CONFIG.radio.
 * La integración puede pasarlos a config.ts si conviene.
 */
import type { DetectionMode } from '../lsm/core/LsmEngine';

export const AJUSTES_RADIO = {
  /**
   * Modo de detección del LsmEngine con el detector abierto. 'spell' corre a ~18 Hz (más rápido para
   * "sostener 300 ms"); como el radio nunca pasa letra objetivo, la ayuda de pares R/U queda inactiva.
   * 'shield' (~12 Hz) gasta menos si la PC del foro va justa.
   */
  modoDeteccion: 'spell' as Exclude<DetectionMode, 'off'>,

  /** Tras F o B, tiempo para mostrar un número con los dedos antes de volver al modo letras. */
  msEsperaNumero: 4000,
  /** Enfriamiento de la seña de emergencia S para no mandarla en ráfaga [PROPUESTA]. */
  msEnfriamientoEmergencia: 3000,
  /** Cuánto se ve el aviso "ENVIADO" tras mandar un mensaje. */
  msAvisoEnviado: 1600,
  /** Cuánto se ve la pista "¿Quisiste R? Tecla R" al leer una U. */
  msPistaU: 2500,
  /** Mensajes recientes que se muestran en el historial. */
  historial: 3,

  /** Conteo de dedos (src/radio/dedos.ts). Medidas de analyzeHand() del módulo LSM, de 0 a 1. */
  dedos: {
    /** Un dedo cuenta si su "ext" (qué tan estirado) llega a este valor. */
    umbralDedo: 0.5,
    /** El pulgar cuenta si su "thumbExt" llega a este valor… */
    umbralPulgar: 0.5,
    /**
     * …y si su punta sobresale hacia afuera del nudillo del índice al menos esta fracción del ancho
     * de la palma. Evita contar el pulgar cruzado sobre la palma (como en la B o la S).
     */
    ladoMinPulgar: 0.05,
    /**
     * Un dedo cuya punta toca la del pulgar (círculo de la F o la O) no cuenta aunque se vea estirado.
     * Distancia en largos de palma (en rules.ts el contacto va de 0.2 a 0.42).
     */
    toquePulgar: 0.3,
  },

  /** Voz sintética (src/radio/voz.ts). */
  voz: {
    /** Tiempo límite de seguridad por si `onend` nunca llega (bug conocido de Chrome). */
    msMinimo: 2000,
    msPorCaracter: 110,
    msMargen: 1500,
  },
} as const;
