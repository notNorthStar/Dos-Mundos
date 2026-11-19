/**
 * Valores propios del audio de Oído (docs/CONTRATOS.md §4: lo que no está en CONFIG.audio).
 * La integración puede pasarlos a src/config.ts si conviene.
 *
 * Tiempos en segundos, frecuencias en Hz, ganancias lineales (1 = sin cambio).
 * Los "tau" son constantes de tiempo de setTargetAtTime: a 3·tau se llega al ~95 % del valor.
 */
export const AJUSTES_AUDIO = {
  /** Narración al pasar de 'inicio' a 'jugando' (DISENO.md §10, paso 1). */
  narracionInicial: 'Despiertas en la oscuridad. Algo respira en el edificio.',

  /** Altura de cada cosa que suena, en metros (y). */
  alturas: {
    oido: 1.6,
    monstruo: 1.5,
    puerta: 1.2,
    /** El decibelímetro está en una mesa. */
    decibelimetro: 0.85,
    /** La llave está en el piso. */
    llave: 0.1,
  },

  /** Suavizado de posiciones (el estado llega ~15 veces por segundo). */
  suavizado: {
    tauOyente: 0.05,
    tauFuente: 0.1,
  },

  oclusion: {
    /** Cada cuánto se recalcula la línea de vista de cada fuente. */
    segEntreChequeos: 0.1,
    /** Corte del pasa-bajas sin pared (prácticamente abierto). */
    hzAbierto: 18000,
    /** Ganancia extra cuando hay pared (además del pasa-bajas a CONFIG.audio.hzOclusion). */
    ganancia: 0.55,
    tau: 0.12,
  },

  reverb: {
    /** Fundido entre reverberaciones al cambiar de cuarto. */
    tauFundido: 0.6,
    /** Cuánto de los sonidos "en la cabeza" (pisadas, golpe) va a la reverb. */
    envioCabeza: 0.45,
    /** Cuánto de cada fuente 3D va a la reverb. */
    envioFuentes: 0.8,
    /** seg = tiempo de caída a −60 dB; brillo 0–1 (más alto = cola más aguda); nivel = mezcla húmeda. */
    tipos: {
      chico: { seg: 0.5, predelay: 0.004, brillo: 0.45, nivel: 0.35, ecos: [0.011, 0.019] },
      mediano: { seg: 1.2, predelay: 0.012, brillo: 0.55, nivel: 0.4, ecos: [0.023, 0.041] },
      pasillo: { seg: 2.3, predelay: 0.02, brillo: 0.6, nivel: 0.45, ecos: [0.067, 0.134, 0.201] },
    },
  },

  mezcla: {
    /** Compresor suave antes del limitador (Oído lleva audífonos). */
    compresor: { umbralDb: -20, rodillaDb: 12, proporcion: 4, ataque: 0.005, liberacion: 0.25 },
    /** Limitador final: nada pasa de ~−3 dBFS de forma sostenida. */
    limitador: { umbralDb: -4, rodillaDb: 0, proporcion: 20, ataque: 0.001, liberacion: 0.1 },
    /** Fundido de los bucles al cambiar de fase. */
    tauFase: 0.4,
    /** Fundido de salida de todo al destruir o reiniciar. */
    tauCorte: 0.03,
  },

  /**
   * Volumen de cada sonido (antes de la ganancia maestra y la distancia). Calibrados midiendo el
   * RMS en ventanas de 50 ms con un render offline (2026-11-19): pisada ≈ −25 dB como referencia;
   * los sonidos 3D se midieron a la distancia indicada en el comentario.
   */
  volumen: {
    pisada: 0.6,
    pisadaCorriendo: 1.0,
    golpe: 0.45,
    /** A 3 m. Sierra con filtros muy resonantes: necesita ganancia alta. */
    rechinido: 3.0,
    cierre: 2.0,
    portazo: 1.5,
    cerradura: 0.28,
    pitidoEncendido: 0.06,
    llaveMano: 0.14,
    roce: 0.09,
    /** A 4 m: retumbo grave, se percibe menos que su nivel. */
    pasoMonstruo: 12,
    pasoMonstruoRapido: 14,
    respiracionPatrulla: 1.5,
    respiracionCaza: 0.7,
    grunido: 2.0,
    faroDecibelimetro: 0.18,
    faroLlave: 0.7,
    latido: 0.08,
    estaticaAtrapa: 0.15,
    grito: 0.18,
    salida: 0.6,
    aire: 0.35,
  },

  /** Pisadas de Oído: suenan en la cabeza, alternando un poco izquierda y derecha. */
  pisadas: {
    paneo: 0.12,
    /** Variación aleatoria de volumen y tono para que no suene a metralleta. */
    variacion: 0.15,
  },

  monstruo: {
    segRespiroPatrulla: 4.2,
    segRespiroCaza: 1.05,
    /** Gruñidos sueltos durante la caza (además del que suena al entrar en caza). */
    segGrunidoMin: 2.8,
    segGrunidoMax: 5.5,
    /** La respiración "se corta" al escuchar: rápido pero sin clic. */
    tauCorte: 0.03,
    tauVuelta: 0.6,
    /** Tras volver de 'escucha', espera esto antes del primer respiro. */
    segPausaVuelta: 0.8,
  },

  faros: {
    segPitidoDecibelimetro: 1.4,
    segTintineoLlave: 1.7,
    /** Más allá de CONFIG.audio.metrosTintineo, la llave se desvanece del todo en estos metros. */
    metrosDesvanecerLlave: 0.75,
    tauAudible: 0.25,
  },

  latido: {
    bpmBase: 62,
    /** BPM extra con ruido 1. */
    bpmPorRuido: 55,
    /** BPM extra con el monstruo encima. */
    bpmPorMonstruo: 45,
    bpmMax: 165,
    /** Cercanía 1 a esta distancia o menos; 0 a metrosLejos o más. */
    metrosCerca: 1.5,
    metrosLejos: 12,
    /** Volumen extra (proporción) cuando el latido va al máximo. */
    volumenExtraMax: 0.6,
    /** Entrada suave del latido al agarrar el decibelímetro. */
    tauEntrada: 1.5,
  },

  radio: {
    /** Ganancia del resto de la mezcla mientras habla el radio. */
    ducking: 0.4,
    /** Ducking más suave para la narración. */
    duckingNarracion: 0.7,
    tauAgachar: 0.08,
    tauSoltar: 0.35,
    volumenEstatica: 0.07,
    volumenChasquido: 0.45,
    /** Banda del radio. */
    hzBajo: 300,
    hzAlto: 3000,
    /** Pausas alrededor de la voz. */
    segAntesVoz: 0.25,
    segDespuesVoz: 0.12,
    /** Tope de seguridad por si la voz nunca avisa que terminó. */
    segMinVoz: 3,
    segPorCaracter: 0.12,
    segMargenVoz: 2,
    /** Máximo de mensajes en espera; los más viejos se descartan. */
    maxCola: 6,
  },

  /** Cuánto se adelanta la programación de los bucles respecto al reloj de audio. */
  programador: {
    segAdelanto: 0.12,
    /** Si un bucle se atrasa más que esto (pestaña en segundo plano), se reinicia en vez de ponerse al día. */
    segAtrasoMax: 0.5,
  },

  final: {
    /** Duración de la estática al ser atrapado. */
    segEstatica: 1.8,
    /** Retraso del grito respecto a la estática. */
    segAntesGrito: 0.12,
    /** Duración total del aire de fuera al ganar. */
    segAire: 9,
  },
} as const;

export type AjustesAudio = typeof AJUSTES_AUDIO;
export type TipoReverb = keyof typeof AJUSTES_AUDIO.reverb.tipos;
