/**
 * Valores ajustables de la pantalla y los controles de Oído.
 * (Teclas, velocidad y sensibilidad del mouse viven en src/config.ts.)
 */
export const AJUSTES_OIDO = {
  /** Altura de los ojos en metros. */
  alturaOjos: 1.6,
  /** Campo de visión vertical en grados. */
  fov: 68,

  /** Tinieblas: el público apenas debe distinguir formas (DISENO.md §7.2). */
  densidadNiebla: 0.4,
  luzAmbiente: 0.1,
  /** Luz tenue que acompaña a Oído (como ojos acostumbrados a la oscuridad). */
  luzCercana: 1.3,
  alcanceLuzCercana: 4.5,
  colorLuz: 0x8fa3b8,

  /** Qué tan rápido la cámara alcanza la posición y el rumbo del estado (1/seg). */
  seguimientoPos: 18,
  seguimientoRumbo: 22,
  /** Si el estado salta más que esto (reinicio), la cámara se teletransporta. */
  saltoMaximo: 2.5,

  /** Inclinación local de la vista con el mouse (solo estética; no viaja por el bus). */
  gradosPorPixelInclinacion: 0.12,
  inclinacionMaxGrados: 55,

  /** Tope de píxeles de mouse por cuadro (evita latigazos al entrar o salir del pointer lock). */
  maxPixelesPorCuadro: 240,
  /** Mínimo entre dos órdenes `oido/mover` repetidas al mantener la tecla. */
  segMinEntreOrdenes: 0.06,

  textoGanaron: 'Ala este superada',
  textoPerdieron: 'Inténtenlo de nuevo',
} as const;
