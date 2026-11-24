import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { ALA_ESTE } from '../../src/data/alaEste';
import { crearPartida } from './ayuda';

const INICIO = ALA_ESTE.inicioOido;
const MOV = CONFIG.movimiento;

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
    expect(p.sim.estado.oido.cabeza).toBe(0);
    expect(p.sim.estado.puertas['p-cuarto1']).toBe(true);
    expect(p.sim.estado.t).toBe(0);
    expect(p.hechos).toEqual([]);

    p.bus.enviar('juego/iniciar', {});
    expect(p.sim.estado.fase).toBe('jugando');
  });
});

describe('pasos de Oído (tablero)', () => {
  it('un paso avanza exactamente una casilla hacia el rumbo, interpolado, y termina con sim/paso', () => {
    const p = crearPartida();
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    p.avanzar(MOV.segPorPaso / 2);

    const medio = p.sim.estado.oido;
    expect(medio.moviendose).toBe(true);
    expect(medio.pos.x).toBeGreaterThan(INICIO.pos.x - 0.7);
    expect(medio.pos.x).toBeLessThan(INICIO.pos.x - 0.3);
    expect(p.de('sim/paso')).toHaveLength(0);

    p.avanzar(MOV.segPorPaso / 2 + 0.05);
    const fin = p.sim.estado.oido;
    expect(fin.moviendose).toBe(false);
    // Despierta mirando al oeste. Centro de casilla exacto, sin decimales sueltos.
    expect(fin.pos).toEqual({ x: INICIO.pos.x - 1, z: INICIO.pos.z });
    expect(p.de('sim/paso')).toEqual([{ pos: fin.pos, superficie: 'madera', corriendo: false }]);
  });

  it('después de muchos pasos y giros sigue en un centro de casilla y a un rumbo de tablero', () => {
    const p = crearPartida();
    p.puerta(2); // monstruo encerrado
    const ordenes = ['der', 'paso', 'der', 'paso', 'paso', 'paso', 'izq', 'atras', 'der', 'paso', 'izq', 'izq', 'paso', 'atras'];
    for (const o of ordenes) {
      if (o === 'paso') p.caminar(1);
      else if (o === 'atras') p.caminar(1, 'atras');
      else p.girar(o as 'izq' | 'der');
      const { pos, rumbo } = p.sim.estado.oido;
      expect(pos.x % 1).toBe(0.5);
      expect(pos.z % 1).toBe(0.5);
      expect(rumbo % 90).toBe(0);
    }
  });

  it('retrocede en reversa sin cambiar el rumbo', () => {
    const p = crearPartida();
    p.caminar(1, 'atras');
    expect(p.sim.estado.oido.pos).toEqual({ x: INICIO.pos.x + 1, z: INICIO.pos.z });
    expect(p.sim.estado.oido.rumbo).toBe(INICIO.rumbo);
  });

  it('ignora las órdenes de mover durante un paso', () => {
    const p = crearPartida();
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    p.avanzar(0.1);
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    p.bus.enviar('oido/mover', { dir: 'atras', corriendo: false });
    p.avanzar(2);
    expect(p.sim.estado.oido.pos.x).toBe(INICIO.pos.x - 1);
    expect(p.de('sim/paso')).toHaveLength(1);
  });

  it('correr dura menos, marca corriendo y suma ruido en cada paso', () => {
    const p = crearPartida();
    p.bus.enviar('oido/mover', { dir: 'atras', corriendo: true });
    p.avanzar(0.1);
    expect(p.sim.estado.oido.corriendo).toBe(true);
    expect(p.sim.estado.ruido.nivel).toBe(0);
    p.avanzar(MOV.segPorPasoCorriendo - 0.1 + 0.02);
    expect(p.sim.estado.oido.moviendose).toBe(false);
    expect(p.sim.estado.oido.corriendo).toBe(false);
    expect(p.de('sim/paso')[0]?.corriendo).toBe(true);
    expect(p.sim.estado.ruido.nivel).toBeGreaterThan(CONFIG.ruido.porPasoCorriendo - 0.05);

    // Caminar no hace ruido.
    const q = crearPartida();
    q.caminar(2);
    expect(q.sim.estado.ruido.nivel).toBe(0);
  });

  it('contra la pared: choca sin moverse nada, con su ruido', () => {
    const p = crearPartida();
    p.caminar(2); // (1.5, 2.5): la casilla pegada a la pared oeste
    const pegado = p.sim.estado.oido.pos;
    expect(pegado).toEqual({ x: 1.5, z: 2.5 });
    expect(p.de('sim/choque')).toHaveLength(0);

    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    expect(p.de('sim/choque')).toEqual([{ pos: pegado, rumbo: 270 }]);
    expect(p.sim.estado.oido.moviendose).toBe(false);
    expect(p.sim.estado.ruido.nivel).toBeCloseTo(CONFIG.ruido.porChoque);
    p.avanzar(1);
    expect(p.sim.estado.oido.pos).toEqual(pegado);
    expect(p.de('sim/paso')).toHaveLength(2);
  });

  it('en reversa contra la pared, el choque apunta hacia el obstáculo', () => {
    const p = crearPartida();
    p.girar('der'); // mira al norte
    p.caminar(1); // (3.5, 1.5), pegado a la pared norte
    p.girar('der', 2); // mira al sur: la pared norte queda detrás
    p.bus.enviar('oido/mover', { dir: 'atras', corriendo: false });
    expect(p.de('sim/choque')).toEqual([{ pos: { x: 3.5, z: 1.5 }, rumbo: 0 }]);
    expect(p.sim.estado.oido.pos).toEqual({ x: 3.5, z: 1.5 });
  });

  it('con la tecla sostenida contra la pared no repite el choque a cada cuadro', () => {
    const p = crearPartida();
    p.caminar(2);
    // Como si el cliente reenviara `oido/mover` en cada cuadro durante un segundo.
    for (let i = 0; i < 60; i++) {
      p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
      p.avanzar(1 / 60);
    }
    const choques = p.de('sim/choque').length;
    expect(choques).toBeGreaterThanOrEqual(1);
    expect(choques).toBeLessThanOrEqual(4);
    expect(p.sim.estado.oido.pos).toEqual({ x: 1.5, z: 2.5 });
  });
});

describe('giros de Oído', () => {
  it('gira 90° con animación y vuelve con el giro contrario', () => {
    const p = crearPartida();
    p.bus.enviar('oido/girar', { sentido: 'der' });
    p.avanzar(MOV.segPorGiro / 2);
    const medio = p.sim.estado.oido;
    expect(medio.moviendose).toBe(true);
    expect(medio.rumbo).toBeGreaterThan(270);
    expect(medio.rumbo).toBeLessThan(360);

    p.avanzar(MOV.segPorGiro);
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
});

describe('cabeza de Oído (mouse)', () => {
  it('el mouse gira la cabeza y no cambia el rumbo del cuerpo', () => {
    const p = crearPartida();
    p.bus.enviar('oido/girarFino', { grados: 10.5 });
    expect(p.sim.estado.oido.cabeza).toBeCloseTo(10.5);
    expect(p.sim.estado.oido.rumbo).toBe(INICIO.rumbo);
    expect(p.sim.estado.oido.moviendose).toBe(false);
    p.bus.enviar('oido/girarFino', { grados: -30 });
    expect(p.sim.estado.oido.cabeza).toBeCloseTo(-19.5);
    expect(p.sim.estado.oido.rumbo).toBe(INICIO.rumbo);
    // En reposo la cabeza se queda donde la dejó el mouse.
    p.avanzar(2);
    expect(p.sim.estado.oido.cabeza).toBeCloseTo(-19.5);
  });

  it('la cabeza está acotada a ±gradosCabezaMax', () => {
    const p = crearPartida();
    for (let i = 0; i < 20; i++) p.bus.enviar('oido/girarFino', { grados: 25 });
    expect(p.sim.estado.oido.cabeza).toBe(MOV.gradosCabezaMax);
    p.bus.enviar('oido/girarFino', { grados: -1000 });
    expect(p.sim.estado.oido.cabeza).toBe(-MOV.gradosCabezaMax);
    p.bus.enviar('oido/girarFino', { grados: Number.NaN });
    expect(p.sim.estado.oido.cabeza).toBe(-MOV.gradosCabezaMax);
    expect(p.sim.estado.oido.rumbo).toBe(INICIO.rumbo);
  });

  it('se camina hacia el rumbo del cuerpo, no hacia donde mira la cabeza', () => {
    const p = crearPartida();
    p.bus.enviar('oido/girarFino', { grados: 60 });
    p.caminar(1);
    expect(p.sim.estado.oido.pos).toEqual({ x: INICIO.pos.x - 1, z: INICIO.pos.z });
  });

  it('la cabeza se recentra sola, suave, al empezar un paso', () => {
    const p = crearPartida();
    p.bus.enviar('oido/girarFino', { grados: 60 });
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    p.avanzar(0.05);
    const medio = p.sim.estado.oido.cabeza;
    expect(medio).toBeGreaterThan(0);
    expect(medio).toBeLessThan(60);
    // Durante el paso el mouse no la mueve: va al frente.
    p.bus.enviar('oido/girarFino', { grados: 40 });
    expect(p.sim.estado.oido.cabeza).toBe(medio);
    p.avanzar(MOV.segPorPaso);
    expect(p.sim.estado.oido.cabeza).toBe(0);
  });

  it('también se recentra al empezar un giro, y antes de que termine', () => {
    const p = crearPartida();
    p.bus.enviar('oido/girarFino', { grados: -60 });
    p.bus.enviar('oido/girar', { sentido: 'der' });
    p.avanzar(MOV.segPorGiro - 0.03);
    expect(p.sim.estado.oido.moviendose).toBe(true);
    expect(p.sim.estado.oido.cabeza).toBe(0);
    p.avanzar(0.1);
    expect(p.sim.estado.oido.rumbo).toBe(0);
    // Ya en reposo, el mouse vuelve a mover la cabeza.
    p.bus.enviar('oido/girarFino', { grados: 15 });
    expect(p.sim.estado.oido.cabeza).toBe(15);
  });

  it('un choque no recentra ni mueve la cabeza', () => {
    const p = crearPartida();
    p.caminar(2);
    p.bus.enviar('oido/girarFino', { grados: 30 });
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    p.avanzar(0.5);
    expect(p.de('sim/choque')).toHaveLength(1);
    expect(p.sim.estado.oido.cabeza).toBe(30);
  });
});
