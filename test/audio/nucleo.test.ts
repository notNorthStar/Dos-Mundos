import { describe, expect, it } from 'vitest';
import { curvaSaturacion, elegir, entre } from '../../src/audio/nucleo';
import { AJUSTES_AUDIO } from '../../src/audio/ajustes';

describe('utilidades de síntesis', () => {
  it('entre() queda dentro del rango', () => {
    for (let i = 0; i < 200; i++) {
      const v = entre([0.4, 2.6]);
      expect(v).toBeGreaterThanOrEqual(0.4);
      expect(v).toBeLessThan(2.6);
    }
  });

  it('elegir() respeta los pesos y nunca saca un peso 0', () => {
    const cuenta = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i++) cuenta[elegir({ a: 3, b: 1, c: 0 })]++;
    expect(cuenta.c).toBe(0);
    expect(cuenta.a).toBeGreaterThan(cuenta.b * 2);
  });

  it('la curva de saturación es impar, monótona y va de −1 a 1', () => {
    const c = curvaSaturacion(2.5, 101);
    expect(c[0]).toBeCloseTo(-1, 5);
    expect(c[100]).toBeCloseTo(1, 5);
    expect(c[50]).toBeCloseTo(0, 5);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!);
  });

  it('los rangos del monstruo están bien formados (mín ≤ máx)', () => {
    const rangos: (readonly [number, number])[] = [];
    const buscar = (o: unknown) => {
      if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'number')) rangos.push(o as [number, number]);
      else if (o && typeof o === 'object') Object.values(o).forEach(buscar);
    };
    buscar(AJUSTES_AUDIO.monstruo);
    expect(rangos.length).toBeGreaterThan(5);
    for (const [a, b] of rangos) expect(a).toBeLessThanOrEqual(b);
  });
});
