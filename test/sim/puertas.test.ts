import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { crearPartida } from './ayuda';

describe('puertas de Vista', () => {
  it('vista/camara acepta solo las cámaras 1 a 5', () => {
    const p = crearPartida();
    expect(p.sim.estado.camaraActiva).toBe(1);
    p.bus.enviar('vista/camara', { numero: 3 });
    expect(p.sim.estado.camaraActiva).toBe(3);
    for (const numero of [0, 6, -1, 2.5]) p.bus.enviar('vista/camara', { numero });
    expect(p.sim.estado.camaraActiva).toBe(3);
  });

  it('cerrar es un portazo que sube el ruido; abrir no', () => {
    const p = crearPartida();
    p.puerta(1);
    expect(p.sim.estado.puertas['p-cuarto1']).toBe(false);
    expect(p.de('sim/puerta')).toEqual([{ id: 'p-cuarto1', abierta: false, pos: { x: 5.5, z: 2.5 }, portazo: true }]);
    expect(p.sim.estado.ruido.nivel).toBeCloseTo(CONFIG.ruido.porPortazo);
    expect(p.sim.estado.ruido.zona).toBe('cuidado');

    p.avanzar(2); // el ruido cae a cero
    p.puerta(1);
    expect(p.sim.estado.puertas['p-cuarto1']).toBe(true);
    expect(p.de('sim/puerta')[1]).toEqual({ id: 'p-cuarto1', abierta: true, pos: { x: 5.5, z: 2.5 }, portazo: false });
    expect(p.sim.estado.ruido.nivel).toBe(0);
  });

  it('una puerta cerrada bloquea el paso de Oído', () => {
    const p = crearPartida();
    p.puerta(1);
    p.girar('der', 2); // mira al este, hacia la puerta
    p.caminar(4);
    expect(p.sim.estado.oido.pos.x).toBeLessThan(5);
    expect(p.sim.estado.oido.cuartoId).toBe('cuarto1');
    expect(p.de('sim/choque').length).toBeGreaterThan(0);

    p.puerta(1); // se abre y ya puede pasar
    p.caminar(2);
    expect(p.sim.estado.oido.pos.x).toBeGreaterThan(6);
    expect(p.sim.estado.oido.cuartoId).toBe('pasillo');
  });

  it('no se puede cerrar con Oído en la casilla de la puerta', () => {
    const p = crearPartida();
    p.caminar(2, 'atras'); // (5.5, 2.5): justo en la puerta
    expect(p.sim.estado.oido.pos.x).toBeCloseTo(5.5);
    p.puerta(1);
    expect(p.sim.estado.puertas['p-cuarto1']).toBe(true);
    expect(p.de('sim/puerta')).toHaveLength(0);
    expect(p.sim.estado.ruido.nivel).toBe(0);
  });

  it('no se puede cerrar mientras Oído está entrando a la casilla de la puerta', () => {
    const p = crearPartida();
    p.caminar(1, 'atras'); // (4.5, 2.5)
    p.bus.enviar('oido/mover', { dir: 'atras', corriendo: false });
    p.avanzar(0.05); // apenas empezó el paso hacia la puerta
    p.puerta(1);
    expect(p.sim.estado.puertas['p-cuarto1']).toBe(true);
    p.avanzar(1);
    expect(p.sim.estado.oido.pos.x).toBeCloseTo(5.5);
  });

  it('no se puede cerrar con el monstruo cruzando la puerta', () => {
    const p = crearPartida();
    // Sale de la guarida: entra a la casilla de la puerta (10,4) entre 0.9 s y 1.8 s.
    p.avanzar(CONFIG.monstruo.segPorPasoPatrulla * 1.6);
    p.puerta(2);
    expect(p.sim.estado.puertas['p-guarida']).toBe(true);
    expect(p.de('sim/puerta')).toHaveLength(0);
  });

  it('la cámara 5 no controla ninguna puerta y la salida no es controlable', () => {
    const p = crearPartida();
    p.puerta(5);
    expect(p.de('sim/puerta')).toHaveLength(0);
    expect(p.sim.estado.puertas['p-salida']).toBe(false);
  });
});
