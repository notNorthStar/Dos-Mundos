import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { ALA_ESTE } from '../../src/data/alaEste';
import { AJUSTES_SIM } from '../../src/sim/ajustes';
import { crearPartida } from './ayuda';

const INICIO = ALA_ESTE.inicioOido;

describe('fases', () => {
  it('empieza en inicio e ignora las órdenes de Oído hasta juego/iniciar', () => {
    const p = crearPartida({ iniciar: false });
    expect(p.sim.estado.fase).toBe('inicio');
    p.caminar(1);
    p.girar('der');
    p.bus.enviar('oido/girarFino', { grados: 20 });
    p.bus.enviar('oido/interactuar', {});
    p.puerta(1);
    expect(p.sim.estado.oido.pos).toEqual(INICIO.pos);
    expect(p.sim.estado.oido.rumbo).toBe(INICIO.rumbo);
    expect(p.sim.estado.puertas['p-cuarto1']).toBe(true);
    expect(p.sim.estado.t).toBe(0);
    expect(p.hechos).toEqual([]);

    p.bus.enviar('juego/iniciar', {});
    expect(p.sim.estado.fase).toBe('jugando');
  });
});

describe('pasos de Oído', () => {
  it('un paso avanza 1 m hacia el rumbo, interpolado, y termina con sim/paso', () => {
    const p = crearPartida();
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    p.avanzar(CONFIG.movimiento.segPorPaso / 2);

    const medio = p.sim.estado.oido;
    expect(medio.moviendose).toBe(true);
    expect(medio.pos.x).toBeGreaterThan(INICIO.pos.x - 0.7);
    expect(medio.pos.x).toBeLessThan(INICIO.pos.x - 0.3);
    expect(p.de('sim/paso')).toHaveLength(0);

    p.avanzar(CONFIG.movimiento.segPorPaso / 2 + 0.05);
    const fin = p.sim.estado.oido;
    expect(fin.moviendose).toBe(false);
    expect(fin.pos.x).toBeCloseTo(INICIO.pos.x - 1); // despierta mirando al oeste
    expect(fin.pos.z).toBeCloseTo(INICIO.pos.z);
    expect(p.de('sim/paso')).toEqual([{ pos: { x: fin.pos.x, z: fin.pos.z }, superficie: 'madera', corriendo: false }]);
  });

  it('retrocede en reversa sin cambiar el rumbo', () => {
    const p = crearPartida();
    p.caminar(1, 'atras');
    expect(p.sim.estado.oido.pos.x).toBeCloseTo(INICIO.pos.x + 1);
    expect(p.sim.estado.oido.rumbo).toBe(INICIO.rumbo);
  });

  it('ignora las órdenes de mover durante un paso', () => {
    const p = crearPartida();
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    p.avanzar(0.1);
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    p.bus.enviar('oido/mover', { dir: 'atras', corriendo: false });
    p.avanzar(2);
    expect(p.sim.estado.oido.pos.x).toBeCloseTo(INICIO.pos.x - 1);
    expect(p.de('sim/paso')).toHaveLength(1);
  });

  it('correr dura menos, marca corriendo y suma ruido en cada paso', () => {
    const p = crearPartida();
    p.bus.enviar('oido/mover', { dir: 'atras', corriendo: true });
    p.avanzar(0.1);
    expect(p.sim.estado.oido.corriendo).toBe(true);
    expect(p.sim.estado.ruido.nivel).toBe(0);
    p.avanzar(CONFIG.movimiento.segPorPasoCorriendo - 0.1 + 0.02);
    expect(p.sim.estado.oido.moviendose).toBe(false);
    expect(p.sim.estado.oido.corriendo).toBe(false);
    expect(p.de('sim/paso')[0]?.corriendo).toBe(true);
    expect(p.sim.estado.ruido.nivel).toBeGreaterThan(CONFIG.ruido.porPasoCorriendo - 0.05);

    // Caminar no hace ruido.
    const q = crearPartida();
    q.caminar(2);
    expect(q.sim.estado.ruido.nivel).toBe(0);
  });

  it('contra la pared: avanza hasta donde cabe y después choca sin moverse', () => {
    const p = crearPartida();
    p.caminar(2); // (1.5, 2.5): queda a medio metro de la pared oeste
    expect(p.sim.estado.oido.pos.x).toBeCloseTo(1.5);

    p.caminar(1); // solo caben 0.2 m (radio 0.3)
    const pegado = p.sim.estado.oido.pos;
    expect(pegado.x).toBeCloseTo(1 + AJUSTES_SIM.radioOido, 1);
    expect(p.de('sim/choque')).toHaveLength(0);
    expect(p.de('sim/paso')).toHaveLength(3);

    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    expect(p.de('sim/choque')).toEqual([{ pos: pegado, rumbo: 270 }]);
    expect(p.sim.estado.oido.moviendose).toBe(false);
    expect(p.sim.estado.ruido.nivel).toBeCloseTo(CONFIG.ruido.porChoque);
    p.avanzar(1);
    expect(p.sim.estado.oido.pos).toEqual(pegado);
    expect(p.de('sim/paso')).toHaveLength(3);
  });

  it('nunca queda dentro de una pared aunque camine en diagonal', () => {
    const p = crearPartida();
    p.bus.enviar('oido/girarFino', { grados: 37 });
    for (let i = 0; i < 12; i++) {
      p.caminar(1);
      const { x, z } = p.sim.estado.oido.pos;
      expect(x).toBeGreaterThanOrEqual(1 + AJUSTES_SIM.radioOido - 1e-6);
      expect(z).toBeGreaterThanOrEqual(1 + AJUSTES_SIM.radioOido - 1e-6);
    }
    expect(p.de('sim/choque').length).toBeGreaterThan(0);
  });
});

describe('giros de Oído', () => {
  it('gira 90° con animación y vuelve con el giro contrario', () => {
    const p = crearPartida();
    p.bus.enviar('oido/girar', { sentido: 'der' });
    p.avanzar(CONFIG.movimiento.segPorGiro / 2);
    const medio = p.sim.estado.oido;
    expect(medio.moviendose).toBe(true);
    expect(medio.rumbo).toBeGreaterThan(270);
    expect(medio.rumbo).toBeLessThan(360);

    p.avanzar(CONFIG.movimiento.segPorGiro);
    expect(p.sim.estado.oido.moviendose).toBe(false);
    expect(p.sim.estado.oido.rumbo).toBe(0); // 270 + 90, normalizado

    p.girar('izq');
    expect(p.sim.estado.oido.rumbo).toBe(270);
    p.girar('izq');
    expect(p.sim.estado.oido.rumbo).toBe(180);
    expect(p.sim.estado.oido.pos).toEqual(INICIO.pos);
  });

  it('no acepta mover ni otro giro mientras gira', () => {
    const p = crearPartida();
    p.bus.enviar('oido/girar', { sentido: 'der' });
    p.bus.enviar('oido/girar', { sentido: 'der' });
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    p.avanzar(1.5);
    expect(p.sim.estado.oido.rumbo).toBe(0);
    expect(p.sim.estado.oido.pos).toEqual(INICIO.pos);
  });

  it('el giro fino se aplica al instante y se normaliza', () => {
    const p = crearPartida();
    p.bus.enviar('oido/girarFino', { grados: 10.5 });
    expect(p.sim.estado.oido.rumbo).toBeCloseTo(280.5);
    expect(p.sim.estado.oido.moviendose).toBe(false);
    p.bus.enviar('oido/girarFino', { grados: 100 });
    expect(p.sim.estado.oido.rumbo).toBeCloseTo(20.5);
    p.bus.enviar('oido/girarFino', { grados: -30 });
    expect(p.sim.estado.oido.rumbo).toBeCloseTo(350.5);
  });

  it('el giro fino en medio de un giro de 90° se suma al resultado', () => {
    const p = crearPartida();
    p.bus.enviar('oido/girar', { sentido: 'der' });
    p.avanzar(0.1);
    p.bus.enviar('oido/girarFino', { grados: 5 });
    p.avanzar(1);
    expect(p.sim.estado.oido.rumbo).toBeCloseTo(5);
  });
});
