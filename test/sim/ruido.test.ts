import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { MedidorRuido } from '../../src/sim/ruido';
import { crearPartida } from './ayuda';

const R = CONFIG.ruido;

describe('MedidorRuido', () => {
  it('las zonas salen de los umbrales', () => {
    const m = new MedidorRuido(R);
    expect(m.zona).toBe('silencio');
    m.fijarMicrofono(R.umbralCuidado - 0.01);
    expect(m.zona).toBe('silencio');
    m.fijarMicrofono(R.umbralCuidado);
    expect(m.zona).toBe('cuidado');
    m.fijarMicrofono(R.umbralPeligro);
    expect(m.zona).toBe('peligro');
    m.fijarMicrofono(0);
    expect(m.zona).toBe('silencio');
  });

  it('el ruido del juego se acumula con tope en 1 y cae con el tiempo', () => {
    const m = new MedidorRuido(R);
    m.sumar(0.8);
    m.sumar(0.8);
    expect(m.nivel).toBe(1);
    m.actualizar(1);
    expect(m.nivel).toBeCloseTo(1 - R.caidaPorSeg);
    m.actualizar(10);
    expect(m.nivel).toBe(0);
  });

  it('el nivel es el máximo entre micrófono y juego', () => {
    const m = new MedidorRuido(R);
    m.fijarMicrofono(0.4);
    m.sumar(0.25);
    expect(m.nivel).toBeCloseTo(0.4);
    m.sumar(0.25);
    expect(m.nivel).toBeCloseTo(0.5);
    m.actualizar(10);
    expect(m.nivel).toBeCloseTo(0.4); // el micrófono no cae solo
    m.fijarMicrofono(7);
    expect(m.nivel).toBe(1);
    m.fijarMicrofono(Number.NaN);
    expect(m.nivel).toBe(0);
  });
});

describe('ruido en la simulación', () => {
  it('ruido/microfono fija el nivel y la zona', () => {
    const p = crearPartida();
    p.puerta(2); // monstruo encerrado: aquí solo se mide el ruido
    p.avanzar(3);
    expect(p.sim.estado.ruido).toEqual({ nivel: 0, zona: 'silencio' });
    p.bus.enviar('ruido/microfono', { nivel: 0.5 });
    expect(p.sim.estado.ruido).toEqual({ nivel: 0.5, zona: 'cuidado' });
    p.bus.enviar('ruido/microfono', { nivel: 0.9 });
    expect(p.sim.estado.ruido).toEqual({ nivel: 0.9, zona: 'peligro' });
    p.bus.enviar('ruido/microfono', { nivel: 0 });
    expect(p.sim.estado.ruido).toEqual({ nivel: 0, zona: 'silencio' });
  });

  it('el portazo sube el ruido y luego cae caidaPorSeg por segundo', () => {
    const p = crearPartida();
    p.puerta(1);
    expect(p.sim.estado.ruido.nivel).toBeCloseTo(R.porPortazo);
    p.avanzar(0.6);
    expect(p.sim.estado.ruido.nivel).toBeCloseTo(R.porPortazo - R.caidaPorSeg * 0.6, 2);
    expect(p.sim.estado.ruido.zona).toBe('silencio');
    p.avanzar(1);
    expect(p.sim.estado.ruido.nivel).toBe(0);
  });

  it('correr varios pasos seguidos acumula ruido hasta peligro', () => {
    const p = crearPartida();
    p.puerta(2);
    p.avanzar(3);
    p.girar('der', 2);
    const zonas = new Set<string>();
    for (let i = 0; i < 6; i++) {
      p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: true });
      p.avanzar(R.porPasoCorriendo); // 0.3 s: lo que dura un paso corriendo
      zonas.add(p.sim.estado.ruido.zona);
    }
    expect(zonas.has('cuidado')).toBe(true);
    expect(zonas.has('peligro')).toBe(true);
  });

  it('el ruido se calcula aunque Oído no tenga el decibelímetro', () => {
    const p = crearPartida();
    expect(p.sim.estado.inventario.decibelimetro).toBe(false);
    p.bus.enviar('ruido/microfono', { nivel: 1 });
    p.avanzar(0.1);
    expect(p.sim.estado.monstruo.estado).toBe('caza');
  });
});
