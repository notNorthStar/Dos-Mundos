/**
 * CONTRATOS entre módulos. Explicación en docs/CONTRATOS.md.
 * Este archivo es de la integración: los subagentes NO lo editan; si falta algo, lo piden.
 *
 * Regla de oro: todo lo que viaja por el bus es JSON plano (sin clases, funciones ni objetos
 * de Three.js), porque en la fase 2 el mismo mensaje cruza un WebSocket.
 */

// ───────────────────────── Geometría ─────────────────────────
// Unidades: metros. Ejes del mundo: +x = este, +z = sur, +y = arriba.
// Una casilla mide 1×1 m; la casilla (cx, cz) ocupa de (cx, cz) a (cx+1, cz+1) y su centro es (cx+0.5, cz+0.5).
// Rumbo en grados: 0 = norte (−z), 90 = este (+x), 180 = sur, 270 = oeste. Siempre normalizado a [0, 360).

export interface Punto {
  x: number;
  z: number;
}

export interface Casilla {
  cx: number;
  cz: number;
}

// ───────────────────────── Mapa (datos estáticos) ─────────────────────────

export type Superficie = 'concreto' | 'madera' | 'metal';

export interface Cuarto {
  id: string;
  nombre: string;
  /** Rectángulo en casillas, extremos incluidos. */
  desde: Casilla;
  hasta: Casilla;
  superficie: Superficie;
  /** Tamaño acústico: elige la reverberación. */
  reverb: 'chico' | 'mediano' | 'pasillo';
}

export interface PuertaDef {
  id: string;
  nombre: string;
  /** Casilla que ocupa la puerta (transitable solo si está abierta). */
  casilla: Casilla;
  /** Cuartos que conecta. */
  entre: [string, string];
  abiertaAlInicio: boolean;
  /** true = la controla Vista con la tecla de puerta. La salida no: se abre con la llave. */
  controlable: boolean;
  /** true = necesita la llave y abrirla gana la partida. */
  esSalida: boolean;
}

export interface CamaraDef {
  /** 1 a 5: coincide con la tecla. */
  numero: number;
  nombre: string;
  cuartoId: string;
  /** Posición de la cámara y punto al que mira (y = altura en metros). */
  pos: Punto & { y: number };
  mira: Punto & { y: number };
  /** Puerta que abre o cierra la tecla de puerta con esta cámara activa (si hay). */
  puertaId?: string;
}

export type ObjetoId = 'decibelimetro' | 'llave';

export interface ObjetoDef {
  id: ObjetoId;
  pos: Punto;
  /** true = está en el piso (Vista usa la seña D). */
  enElPiso: boolean;
}

export interface Mapa {
  id: string;
  nombre: string;
  /** Filas de norte a sur; cada carácter es una casilla: '#' pared, '.' piso, 'P' casilla de puerta. */
  celdas: string[];
  cuartos: Cuarto[];
  puertas: PuertaDef[];
  camaras: CamaraDef[];
  objetos: ObjetoDef[];
  inicioOido: { pos: Punto; rumbo: number };
  inicioMonstruo: Punto;
  /** Centros de casilla que el monstruo recorre en orden y en ciclo. */
  rutaPatrulla: Punto[];
}

// ───────────────────────── Estado del juego ─────────────────────────

export type Fase = 'inicio' | 'jugando' | 'ganaron' | 'perdieron';
export type ZonaRuido = 'silencio' | 'cuidado' | 'peligro';
export type EstadoMonstruo = 'patrulla' | 'escucha' | 'caza' | 'atrapa';

export interface EstadoJuego {
  /** Segundos de simulación desde que empezó la partida. */
  t: number;
  fase: Fase;
  oido: {
    pos: Punto;
    /** Hacia dónde apunta el cuerpo: siempre 0, 90, 180 o 270 al terminar un giro. */
    rumbo: number;
    /**
     * Giro de la cabeza respecto al cuerpo, en grados (+ = derecha), acotado por
     * `CONFIG.movimiento.gradosCabezaMax`. La mirada y el oído apuntan a `rumbo + cabeza`;
     * caminar siempre es hacia `rumbo`.
     */
    cabeza: number;
    cuartoId: string;
    corriendo: boolean;
    /** true mientras dura la animación de un paso o un giro. */
    moviendose: boolean;
  };
  /** Vista y la pantalla de Oído lo reciben, pero NO deben dibujarlo (DISENO.md §7). */
  monstruo: {
    pos: Punto;
    rumbo: number;
    cuartoId: string;
    estado: EstadoMonstruo;
  };
  /** id de puerta → abierta. */
  puertas: Record<string, boolean>;
  /** Objetos que Oído ya tiene. */
  inventario: Record<ObjetoId, boolean>;
  ruido: {
    /** 0 a 1, ya combinado (micrófono + juego). */
    nivel: number;
    zona: ZonaRuido;
  };
  /** Cámara activa de Vista (1 a 5). */
  camaraActiva: number;
}

// ───────────────────────── Radio ─────────────────────────

export type Sena = 'F' | 'B' | 'L' | 'R' | 'U' | 'D' | 'S' | 'A';
export type Ficha = { tipo: 'sena'; sena: Sena } | { tipo: 'numero'; valor: 1 | 2 | 3 | 4 | 5 };

/** Interfaz de la voz del radio: hoy speechSynthesis, después clips grabados (DISENO.md §4.2). */
export interface VozRadio {
  /** Dice la frase y resuelve al terminar. Nunca lanza. */
  decir(texto: string): Promise<void>;
  callar(): void;
}

// ───────────────────────── Mensajes del bus ─────────────────────────
// Prefijo = quién lo emite: oido/ vista/ radio/ ruido/ juego/ son órdenes hacia la simulación;
// sim/ son hechos que la simulación anuncia. Solo la simulación emite sim/*.

export interface Mensajes {
  // — Órdenes de Oído —
  /** Un paso de 1 m hacia el rumbo actual (o en reversa). Si ya se está moviendo, se ignora. */
  'oido/mover': { dir: 'adelante' | 'atras'; corriendo: boolean };
  /** Giro de CONFIG.movimiento.gradosPorGiro. */
  'oido/girar': { sentido: 'izq' | 'der' };
  /** Giro fino con el mouse, en grados (positivo = derecha). */
  /** Mouse: gira solo la cabeza (`estado.oido.cabeza`), nunca el cuerpo. */
  'oido/girarFino': { grados: number };
  /** Clic izquierdo: agarra el objeto al alcance o usa la puerta de enfrente. */
  'oido/interactuar': Record<string, never>;

  // — Órdenes de Vista —
  'vista/camara': { numero: number };
  /** Abre o cierra la puerta de la cámara activa (si es controlable). */
  'vista/puerta': Record<string, never>;

  // — Radio (Vista → Oído) —
  /** Mensaje confirmado con Enter (o S de emergencia). `texto` es lo que dice la voz. */
  'radio/mensaje': { fichas: Ficha[]; texto: string; emergencia: boolean };

  // — Ruido —
  /** Nivel del micrófono, 0 a 1 sobre el ruido base. Se manda unas 10 veces por segundo. */
  'ruido/microfono': { nivel: number };

  // — Partida —
  'juego/iniciar': Record<string, never>;
  'juego/reiniciar': Record<string, never>;

  // — Hechos de la simulación —
  /** Foto completa del estado; unas 15 veces por segundo y al cambiar de fase. */
  'sim/estado': EstadoJuego;
  /** Oído terminó un paso (una pisada). */
  'sim/paso': { pos: Punto; superficie: Superficie; corriendo: boolean };
  /** Oído topó con una pared o una puerta cerrada. */
  'sim/choque': { pos: Punto; rumbo: number };
  'sim/puerta': { id: string; abierta: boolean; pos: Punto; portazo: boolean };
  /** Oído intentó abrir la salida sin la llave. */
  'sim/puertaBloqueada': { id: string; pos: Punto };
  'sim/objeto': { id: ObjetoId; pos: Punto };
  /** Clic sin nada al alcance. */
  'sim/nadaQueAgarrar': Record<string, never>;
  'sim/monstruoPaso': { pos: Punto; superficie: Superficie; rapido: boolean };
  'sim/monstruoEstado': { estado: EstadoMonstruo; anterior: EstadoMonstruo; pos: Punto };
  'sim/fin': { resultado: 'ganaron' | 'perdieron' };
}

export type TipoMensaje = keyof Mensajes;

export interface Bus {
  enviar<T extends TipoMensaje>(tipo: T, datos: Mensajes[T]): void;
  /** Devuelve la función para dejar de escuchar. */
  escuchar<T extends TipoMensaje>(tipo: T, fn: (datos: Mensajes[T]) => void): () => void;
}

// ───────────────────────── Sistemas ─────────────────────────

/** Forma común de todo sistema que se integra en main.ts. */
export interface Sistema {
  /** Se llama una vez por cuadro con el tiempo real transcurrido en segundos. */
  actualizar(dtSeg: number): void;
  destruir(): void;
}
