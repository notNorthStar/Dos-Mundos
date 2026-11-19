/**
 * Valores ajustables del mundo 3D (docs/CONTRATOS.md §4: los valores propios de un módulo
 * viven en su `ajustes.ts`; la integración los pasa a config.ts si conviene).
 * Unidades: metros, segundos y radianes salvo que el nombre diga otra cosa.
 */
export const AJUSTES_MUNDO = {
  /** Alto de las paredes. */
  altoPared: 3,

  puerta: {
    /** Alto del vano; de ahí al techo va el dintel. */
    alto: 2.1,
    /** Ancho de cada jamba (la hoja mide 1 − 2 × jamba). */
    anchoJamba: 0.08,
    /** Grosor del marco en el sentido del paso. */
    grosorMarco: 0.22,
    grosorHoja: 0.05,
    /** Segundos que tarda la hoja en abrir o cerrar. */
    segAbrir: 0.4,
  },

  /** Cuartos que llevan estantes pegados a la pared norte y este. */
  cuartosConEstantes: ['bodega'] as readonly string[],

  estante: {
    fondo: 0.34,
    alto: 1.8,
    /** Alturas de las tablas. */
    tablas: [0.15, 0.7, 1.25, 1.8] as readonly number[],
  },

  mesa: {
    ancho: 0.8,
    fondo: 0.45,
    alto: 0.75,
  },

  figura: {
    /** Qué tan rápido alcanza la figura la posición del estado (1/seg). Más alto = más pegada. */
    seguimientoPos: 16,
    seguimientoRumbo: 18,
    /** Si el estado salta más que esto (reinicio), la figura se teletransporta. */
    saltoMaximo: 2.5,
    /** Amplitud del balanceo de piernas y brazos al caminar. */
    balanceo: 0.6,
  },

  /** Semilla de las texturas y del desorden de los estantes: mismo mundo en las dos pantallas. */
  semilla: 1996,
} as const;
