/**
 * Valores ajustables de la pantalla de Vista (cámaras VHS, miniaturas, mapa y HUD).
 * (Teclas y umbrales de ruido viven en src/config.ts.)
 */
export const AJUSTES_VISTA = {
  /** Parte del alto de la mitad de Vista que ocupa la franja inferior (mapa, HUD y panel del radio). */
  fraccionInferior: 0.35,
  /** Parte del ancho de la franja inferior que ocupan el mapa y el HUD; el resto es #panel-radio. */
  fraccionMapa: 0.44,

  camara: {
    /** Campo de visión vertical de las cámaras de seguridad, en grados. */
    fov: 72,
    lejos: 40,
  },

  /** Iluminación de la escena de las cámaras (visión tipo cámara nocturna). */
  luz: {
    ambiente: 1.9,
    colorAmbiente: 0xb8c8b8,
    direccional: 1.5,
    colorFondo: 0x020403,
    nieblaCerca: 5,
    nieblaLejos: 24,
  },

  miniaturas: {
    /** Proporción ancho/alto de cada miniatura. */
    aspecto: 4 / 3,
    /** Segundos entre refrescos: cada vez se redibuja UNA miniatura, por turnos. */
    segEntreRefrescos: 0.12,
  },

  /** Filtro VHS/CRT del postproceso. */
  vhs: {
    deformacion: 0.11,
    aberracion: 0.0025,
    grano: 0.055,
    barrido: 0.2,
    vineta: 1.1,
    saturacion: 0.55,
    /** Tinte de la imagen (lineal). */
    tinte: [0.92, 1.0, 0.9] as readonly number[],
  },

  /** Estática por el monstruo (DISENO.md §5.2): intensidad de 0 a 1 según su estado. */
  estatica: {
    patrulla: 0.22,
    escucha: 0.42,
    caza: 0.6,
    atrapa: 0.95,
    perdieron: 0.85,
    /** Golpe de estática al cambiar de cámara y segundos que tarda en irse. */
    alCambiar: 0.8,
    segAlCambiar: 0.28,
    /** Segundos entre cambios del parpadeo. */
    segParpadeo: 0.07,
    /** Probabilidad de que la imagen se oscurezca en cada parpadeo. */
    probParpadeoPatrulla: 0.3,
    probParpadeoCaza: 0.55,
    /** Qué tan rápido la estática alcanza su valor (1/seg). */
    seguimiento: 12,
  },

  reloj: {
    /** Fecha fija del sello de la cámara. */
    fecha: '19-11-1996',
    /** Hora a la que empieza la partida, en segundos desde medianoche (03:14:00). */
    inicioSeg: 3 * 3600 + 14 * 60,
  },

  textoGanaron: 'Ala este superada',
  textoPerdieron: 'Inténtenlo de nuevo',
} as const;
