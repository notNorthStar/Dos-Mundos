/** Utilidades compartidas por las pruebas de la simulación. */
import { BusLocal } from '../../src/bus/BusLocal';
import { CONFIG, type Config } from '../../src/config';
import { ALA_ESTE } from '../../src/data/alaEste';
import type { Casilla, Fase, Mensajes, TipoMensaje } from '../../src/shared/contratos';
import { casillaDe, centroDe, distancia, normalizarRumbo, rumboHacia } from '../../src/shared/mapaUtil';
import { crearAzar, type Azar } from '../../src/sim/azar';
import { buscarRuta, mismaCasilla } from '../../src/sim/rutas';
import { Simulacion } from '../../src/sim/Simulacion';

/** Cuadro de 60 Hz, como en el navegador. */
export const DT = 1 / 60;

/** Margen de tiempo para que una animación termine seguro. */
const MARGEN = 0.05;

export type Hecho = { [T in TipoMensaje]: { tipo: T; datos: Mensajes[T] } }[TipoMensaje];

const HECHOS: TipoMensaje[] = [
  'sim/paso',
  'sim/choque',
  'sim/puerta',
  'sim/puertaBloqueada',
  'sim/objeto',
  'sim/nadaQueAgarrar',
  'sim/monstruoPaso',
  'sim/monstruoEstado',
  'sim/fin',
];

export interface OpcionesPartida {
  iniciar?: boolean;
  /** Semilla del azar del monstruo (por omisión 1: toda prueba es determinista). */
  semilla?: number;
  /** Azar a la medida (gana a `semilla`). Ver `azarFijo`. */
  azar?: Azar;
  /** Cambios a `CONFIG.monstruo` solo para esta partida. */
  monstruo?: Partial<Record<keyof Config['monstruo'], number>>;
}

/** Azar que repite en ciclo los valores dados (cada uno en [0, 1)). */
export function azarFijo(...valores: number[]): Azar {
  let i = 0;
  return () => valores[i++ % valores.length] ?? 0;
}

export function crearPartida(opciones: OpcionesPartida = {}) {
  const bus = new BusLocal({ copiar: true });
  const config = opciones.monstruo
    ? ({ ...CONFIG, monstruo: { ...CONFIG.monstruo, ...opciones.monstruo } } as unknown as Config)
    : CONFIG;
  const sim = new Simulacion(bus, ALA_ESTE, config, opciones.azar ?? crearAzar(opciones.semilla ?? 1));
  const hechos: Hecho[] = [];
  for (const tipo of HECHOS) bus.escuchar(tipo, (datos) => hechos.push({ tipo, datos } as Hecho));
  if (opciones.iniciar ?? true) bus.enviar('juego/iniciar', {});

  const avanzar = (seg: number): void => {
    const n = Math.round(seg / DT);
    for (let i = 0; i < n; i++) sim.actualizar(DT);
  };

  /** Da `n` pasos esperando a que termine cada uno. */
  const caminar = (n: number, dir: 'adelante' | 'atras' = 'adelante', corriendo = false): void => {
    const seg = corriendo ? CONFIG.movimiento.segPorPasoCorriendo : CONFIG.movimiento.segPorPaso;
    for (let i = 0; i < n; i++) {
      bus.enviar('oido/mover', { dir, corriendo });
      avanzar(seg + MARGEN);
    }
  };

  /** Gira 90° `n` veces esperando a que termine cada giro. */
  const girar = (sentido: 'izq' | 'der', n = 1): void => {
    for (let i = 0; i < n; i++) {
      bus.enviar('oido/girar', { sentido });
      avanzar(CONFIG.movimiento.segPorGiro + MARGEN);
    }
  };

  /** Con la cámara `numero`, pulsa la tecla de puerta. */
  const puerta = (numero: number): void => {
    bus.enviar('vista/camara', { numero });
    bus.enviar('vista/puerta', {});
  };

  const de = <T extends TipoMensaje>(tipo: T): Mensajes[T][] =>
    hechos.filter((h) => h.tipo === tipo).map((h) => h.datos as Mensajes[T]);

  /** Avanza cuadro a cuadro hasta que se cumpla la condición (o pasen `maxSeg`). Devuelve si se cumplió. */
  const hasta = (condicion: () => boolean, maxSeg = 120): boolean => {
    for (let i = 0; i < maxSeg / DT; i++) {
      if (condicion()) return true;
      sim.actualizar(DT);
    }
    return condicion();
  };

  return { bus, sim, hechos, avanzar, caminar, girar, puerta, de, hasta };
}

export type Partida = ReturnType<typeof crearPartida>;

/** A esta distancia (m) del monstruo, o menos, el Oído guionizado se queda quieto: 2 casillas. */
export const DISTANCIA_QUIETO = 2.5;

/**
 * Un Oído guionizado y prudente, como lo guiaría una buena Vista: camina (nunca corre) y en
 * silencio; no da un paso ni gira si el monstruo está a 2 casillas o menos de él o de la casilla
 * que va a pisar. Recoge el decibelímetro y la llave y sale. Devuelve la fase final.
 */
export function jugarGuionizado(p: Partida, distanciaQuieto = DISTANCIA_QUIETO, maxSeg = 900): Fase {
  // Casilla desde la que se hace clic en cada meta: decibelímetro, llave y salida.
  const metas: Casilla[] = [casillaDe(ALA_ESTE.inicioOido.pos), { cx: 17, cz: 3 }, { cx: 17, cz: 8 }];
  let meta = 0;

  for (let i = 0; i < maxSeg / DT; i++) {
    const e = p.sim.estado;
    if (e.fase !== 'jugando') break;
    const destino = metas[meta];
    if (!destino || e.oido.moviendose) {
      p.sim.actualizar(DT);
      continue;
    }

    const aqui = casillaDe(e.oido.pos);
    if (mismaCasilla(aqui, destino)) {
      p.bus.enviar('oido/interactuar', {});
      meta++;
      continue;
    }

    const siguiente = buscarRuta(ALA_ESTE, e.puertas, aqui, destino)?.[0];
    if (siguiente) {
      const hacia = centroDe(siguiente);
      const cerca =
        distancia(e.monstruo.pos, e.oido.pos) <= distanciaQuieto || distancia(e.monstruo.pos, hacia) <= distanciaQuieto;
      if (!cerca) {
        const giro = normalizarRumbo(rumboHacia(e.oido.pos, hacia) - e.oido.rumbo);
        if (giro === 0) p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
        else p.bus.enviar('oido/girar', { sentido: giro === 270 ? 'izq' : 'der' });
      }
    }
    p.sim.actualizar(DT);
  }
  return p.sim.estado.fase;
}
