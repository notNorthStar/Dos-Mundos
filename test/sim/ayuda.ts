/** Utilidades compartidas por las pruebas de la simulación. */
import { BusLocal } from '../../src/bus/BusLocal';
import { CONFIG } from '../../src/config';
import { ALA_ESTE } from '../../src/data/alaEste';
import type { Mensajes, TipoMensaje } from '../../src/shared/contratos';
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

export function crearPartida(opciones: { iniciar?: boolean } = {}) {
  const bus = new BusLocal({ copiar: true });
  const sim = new Simulacion(bus, ALA_ESTE);
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

  return { bus, sim, hechos, avanzar, caminar, girar, puerta, de };
}
