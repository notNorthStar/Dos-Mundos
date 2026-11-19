import { describe, expect, it } from 'vitest';
import { crearPartida } from './ayuda';

/** Lleva a Oído del inicio a (17.5, 2.5), en la bodega, mirando al sur. La guarida queda cerrada. */
function irALaBodega(p: ReturnType<typeof crearPartida>): void {
  p.puerta(2); // encierra al monstruo antes de que salga
  p.girar('der', 2);
  p.caminar(14);
  p.girar('der');
}

describe('objetos', () => {
  it('agarra el decibelímetro que tiene a un metro, sin mirarlo de frente', () => {
    const p = crearPartida();
    expect(p.sim.estado.inventario).toEqual({ decibelimetro: false, llave: false });
    p.bus.enviar('oido/interactuar', {});
    expect(p.sim.estado.inventario).toEqual({ decibelimetro: true, llave: false });
    expect(p.de('sim/objeto')).toEqual([{ id: 'decibelimetro', pos: { x: 3.5, z: 1.5 } }]);

    // Ya no hay nada más al alcance.
    p.bus.enviar('oido/interactuar', {});
    expect(p.de('sim/objeto')).toHaveLength(1);
    expect(p.de('sim/nadaQueAgarrar')).toHaveLength(1);
  });

  it('lejos del objeto: nada que agarrar', () => {
    const p = crearPartida();
    p.caminar(2); // (1.5, 2.5): a más de 2 m del decibelímetro
    p.bus.enviar('oido/interactuar', {});
    expect(p.de('sim/nadaQueAgarrar')).toHaveLength(1);
    expect(p.sim.estado.inventario.decibelimetro).toBe(false);
  });

  it('agarra la llave en la bodega', () => {
    const p = crearPartida();
    irALaBodega(p);
    expect(p.sim.estado.oido.cuartoId).toBe('bodega');
    p.bus.enviar('oido/interactuar', {}); // a 1.41 m: todavía no
    expect(p.sim.estado.inventario.llave).toBe(false);
    p.caminar(1); // (17.5, 3.5): a 1 m de la llave
    p.bus.enviar('oido/interactuar', {});
    expect(p.sim.estado.inventario.llave).toBe(true);
    expect(p.de('sim/objeto')).toEqual([{ id: 'llave', pos: { x: 18.5, z: 3.5 } }]);
    expect(p.de('sim/paso').at(-1)?.superficie).toBe('metal');
  });
});

describe('la salida', () => {
  it('sin llave está bloqueada y la partida sigue', () => {
    const p = crearPartida();
    irALaBodega(p);
    p.caminar(6); // (17.5, 8.5): frente a la salida
    expect(p.sim.estado.oido.pos.z).toBeCloseTo(8.5);
    p.bus.enviar('oido/interactuar', {});
    expect(p.de('sim/puertaBloqueada')).toEqual([{ id: 'p-salida', pos: { x: 17.5, z: 9.5 } }]);
    expect(p.sim.estado.fase).toBe('jugando');
    expect(p.sim.estado.puertas['p-salida']).toBe(false);
    expect(p.de('sim/fin')).toHaveLength(0);
  });

  it('a más de 1.5 m no alcanza la salida', () => {
    const p = crearPartida();
    irALaBodega(p);
    p.caminar(5); // (17.5, 7.5): a 2 m del centro de la casilla de salida
    p.bus.enviar('oido/interactuar', {});
    expect(p.de('sim/puertaBloqueada')).toHaveLength(0);
    expect(p.de('sim/nadaQueAgarrar')).toHaveLength(1);
  });

  it('con llave se abre y ganan', () => {
    const p = crearPartida();
    irALaBodega(p);
    p.caminar(1);
    p.bus.enviar('oido/interactuar', {});
    p.caminar(5);
    p.bus.enviar('oido/interactuar', {});
    expect(p.de('sim/puerta').at(-1)).toEqual({ id: 'p-salida', abierta: true, pos: { x: 17.5, z: 9.5 }, portazo: false });
    expect(p.sim.estado.puertas['p-salida']).toBe(true);
    expect(p.sim.estado.fase).toBe('ganaron');
    expect(p.de('sim/fin')).toEqual([{ resultado: 'ganaron' }]);
  });
});
