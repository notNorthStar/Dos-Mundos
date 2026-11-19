import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { ALA_ESTE } from '../../src/data/alaEste';
import { puertasIniciales } from '../../src/shared/mapaUtil';
import { buscarRuta } from '../../src/sim/rutas';
import { crearPartida } from './ayuda';

const M = CONFIG.monstruo;

describe('rutas (BFS)', () => {
  const abiertas = puertasIniciales(ALA_ESTE);

  it('encuentra el camino más corto de la guarida al pasillo', () => {
    const ruta = buscarRuta(ALA_ESTE, abiertas, { cx: 10, cz: 6 }, { cx: 10, cz: 2 });
    expect(ruta).toEqual([
      { cx: 10, cz: 5 },
      { cx: 10, cz: 4 },
      { cx: 10, cz: 3 },
      { cx: 10, cz: 2 },
    ]);
    expect(buscarRuta(ALA_ESTE, abiertas, { cx: 10, cz: 6 }, { cx: 10, cz: 6 })).toEqual([]);
  });

  it('no atraviesa puertas cerradas', () => {
    const cerrada = { ...abiertas, 'p-guarida': false };
    expect(buscarRuta(ALA_ESTE, cerrada, { cx: 10, cz: 6 }, { cx: 10, cz: 2 })).toBeNull();
    // La salida empieza cerrada: no hay camino hasta su casilla.
    expect(buscarRuta(ALA_ESTE, abiertas, { cx: 17, cz: 8 }, { cx: 17, cz: 9 })).toBeNull();
  });

  it('con aproximar va a la casilla alcanzable más cercana', () => {
    const cerrada = { ...abiertas, 'p-guarida': false };
    const ruta = buscarRuta(ALA_ESTE, cerrada, { cx: 10, cz: 6 }, { cx: 10, cz: 2 }, true);
    expect(ruta?.at(-1)).toEqual({ cx: 10, cz: 5 });
  });
});

describe('monstruo', () => {
  it('fuera de jugando no se mueve', () => {
    const p = crearPartida({ iniciar: false });
    p.avanzar(5);
    expect(p.sim.estado.monstruo.pos).toEqual(ALA_ESTE.inicioMonstruo);
    expect(p.de('sim/monstruoPaso')).toHaveLength(0);
  });

  it('patrulla de casilla en casilla por su ruta y anuncia cada paso', () => {
    const p = crearPartida();
    p.avanzar(M.segPorPasoPatrulla * 4 + 0.2);
    const pasos = p.de('sim/monstruoPaso');
    expect(pasos).toHaveLength(4);
    expect(pasos[0]).toEqual({ pos: { x: 10.5, z: 5.5 }, superficie: 'concreto', rapido: false });
    expect(pasos[3]?.pos).toEqual({ x: 10.5, z: 2.5 });
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');
    expect(p.sim.estado.monstruo.cuartoId).toBe('pasillo');
    expect(p.sim.estado.monstruo.rumbo).toBeCloseTo(270); // ya va hacia el oeste del pasillo
  });

  it('patrulla → escucha → caza → patrulla según el ruido', () => {
    const p = crearPartida();
    // Oído se queda encerrado en su cuarto: el portazo ya provoca la primera escucha.
    p.puerta(1);
    p.avanzar(0.1);
    expect(p.sim.estado.monstruo.estado).toBe('escucha');
    const quieto = p.sim.estado.monstruo.pos;
    p.avanzar(2);
    expect(p.sim.estado.monstruo.pos).toEqual(quieto); // en escucha no se mueve
    expect(p.sim.estado.monstruo.rumbo).toBeGreaterThan(270); // mira hacia Oído (al noroeste)
    p.avanzar(M.segEscucha);
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');

    p.bus.enviar('ruido/microfono', { nivel: 0.5 });
    p.avanzar(0.1);
    expect(p.sim.estado.monstruo.estado).toBe('escucha');
    // Mientras siga el ruido en cuidado, no deja de escuchar.
    p.avanzar(M.segEscucha + 1);
    expect(p.sim.estado.monstruo.estado).toBe('escucha');

    p.bus.enviar('ruido/microfono', { nivel: 0.9 });
    p.avanzar(0.1);
    expect(p.sim.estado.monstruo.estado).toBe('caza');
    p.avanzar(6);
    // Llegó hasta la puerta cerrada del cuarto y ahí se queda: no puede atrapar a Oído.
    expect(p.sim.estado.monstruo.pos).toEqual({ x: 6.5, z: 2.5 });
    expect(p.sim.estado.fase).toBe('jugando');
    expect(p.de('sim/monstruoPaso').at(-1)?.rapido).toBe(true);

    // El ruido en cuidado no deja que se le olvide.
    p.bus.enviar('ruido/microfono', { nivel: 0.5 });
    p.avanzar(M.segOlvido + 1);
    expect(p.sim.estado.monstruo.estado).toBe('caza');

    p.bus.enviar('ruido/microfono', { nivel: 0 });
    p.avanzar(M.segOlvido - 0.2);
    expect(p.sim.estado.monstruo.estado).toBe('caza');
    p.avanzar(0.4);
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');

    expect(p.de('sim/monstruoEstado').map((e) => [e.anterior, e.estado])).toEqual([
      ['patrulla', 'escucha'],
      ['escucha', 'patrulla'],
      ['patrulla', 'escucha'],
      ['escucha', 'caza'],
      ['caza', 'patrulla'],
    ]);
  });

  it('en caza alcanza a Oído: atrapa y pierden', () => {
    const p = crearPartida();
    p.bus.enviar('ruido/microfono', { nivel: 1 });
    p.avanzar(8);
    const e = p.sim.estado;
    expect(e.fase).toBe('perdieron');
    expect(e.monstruo.estado).toBe('atrapa');
    expect(p.de('sim/fin')).toEqual([{ resultado: 'perdieron' }]);
    expect(p.de('sim/monstruoEstado').map((x) => x.estado)).toEqual(['caza', 'atrapa']);

    // Después de perder todo queda congelado y las órdenes se ignoran.
    const t = e.t;
    p.caminar(1);
    p.avanzar(2);
    expect(p.sim.estado.t).toBe(t);
    expect(p.sim.estado.oido.pos).toEqual(e.oido.pos);
    expect(p.sim.estado.monstruo.pos).toEqual(e.monstruo.pos);
  });

  it('en patrulla también atrapa por contacto, aunque nadie haga ruido', () => {
    const p = crearPartida();
    p.caminar(3, 'atras'); // (6.5, 2.5): parado en plena ruta de patrulla
    expect(p.sim.estado.ruido.nivel).toBe(0);
    p.avanzar(M.segPorPasoPatrulla * 8 + 1);
    expect(p.sim.estado.fase).toBe('perdieron');
    expect(p.de('sim/monstruoEstado')).toHaveLength(1);
    expect(p.de('sim/monstruoEstado')[0]).toMatchObject({ estado: 'atrapa', anterior: 'patrulla' });
  });

  it('quieto y fuera de su ruta, la patrulla pasa de largo', () => {
    const p = crearPartida();
    p.avanzar(60);
    expect(p.sim.estado.fase).toBe('jugando');
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');
    // Recorrió el pasillo de punta a punta.
    const xs = p.de('sim/monstruoPaso').map((m) => m.pos.x);
    expect(Math.min(...xs)).toBe(6.5);
    expect(Math.max(...xs)).toBe(14.5);
  });

  it('una pared entre los dos impide que atrape', () => {
    const p = crearPartida();
    p.puerta(1); // Oído encerrado en su cuarto
    p.girar('der', 2);
    p.caminar(2); // pegado a la puerta cerrada, a menos de 1 m de (5.5, 2.5)
    p.bus.enviar('ruido/microfono', { nivel: 1 });
    p.avanzar(10);
    expect(p.sim.estado.monstruo.estado).toBe('caza');
    expect(p.sim.estado.fase).toBe('jugando');
  });

  it('encerrado: con la puerta de la guarida cerrada no sale, ni cazando', () => {
    const p = crearPartida();
    p.puerta(2);
    for (let i = 0; i < 20; i++) {
      p.avanzar(1);
      expect(p.sim.estado.monstruo.cuartoId).toBe('guarida');
    }
    p.bus.enviar('ruido/microfono', { nivel: 1 });
    for (let i = 0; i < 10; i++) {
      p.avanzar(1);
      expect(p.sim.estado.monstruo.cuartoId).toBe('guarida');
      expect(p.sim.estado.monstruo.pos.z).toBeGreaterThan(5);
    }
    expect(p.sim.estado.monstruo.estado).toBe('caza');
    expect(p.sim.estado.fase).toBe('jugando');
    // Se pegó lo más posible al ruido (Oído está al noroeste).
    expect(p.sim.estado.monstruo.pos).toEqual({ x: 9.5, z: 5.5 });

    // Si Vista le abre, recalcula la ruta y sale a cazar.
    p.puerta(2);
    p.avanzar(8);
    expect(p.sim.estado.fase).toBe('perdieron');
  });

  it('encerrado fuera de la guarida sigue patrullando el pasillo', () => {
    const p = crearPartida();
    p.avanzar(M.segPorPasoPatrulla * 6); // ya está en el pasillo
    p.puerta(2);
    expect(p.sim.estado.puertas['p-guarida']).toBe(false);
    const antes = p.hechos.length;
    p.avanzar(60);
    const pasos = p.hechos.slice(antes).filter((h) => h.tipo === 'sim/monstruoPaso');
    expect(pasos.length).toBeGreaterThan(20);
    expect(p.sim.estado.monstruo.cuartoId).toBe('pasillo');
  });
});
