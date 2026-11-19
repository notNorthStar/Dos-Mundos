import { describe, expect, it } from 'vitest';
import { dbANivel, potenciaADb, promedioDb, rmsADb, suavizar } from '../../src/ruido/nivel';

describe('dbANivel', () => {
  it('es 0 en el ruido base y dentro del margen', () => {
    expect(dbANivel(-60, -60, 6, 30)).toBe(0);
    expect(dbANivel(-55, -60, 6, 30)).toBe(0);
  });

  it('crece lineal sobre base + margen y se satura en 1', () => {
    expect(dbANivel(-39, -60, 6, 30)).toBeCloseTo(0.5);
    expect(dbANivel(-24, -60, 6, 30)).toBeCloseTo(1);
    expect(dbANivel(0, -60, 6, 30)).toBe(1);
  });

  it('nunca es negativo y tolera valores raros', () => {
    expect(dbANivel(-100, -60, 6, 30)).toBe(0);
    expect(dbANivel(-Infinity, -60, 6, 30)).toBe(0);
    expect(dbANivel(Number.NaN, -60, 6, 30)).toBe(0);
    expect(dbANivel(-20, -60, 6, 0)).toBe(0);
  });
});

describe('rmsADb', () => {
  it('una onda cuadrada a escala completa es 0 dBFS', () => {
    expect(rmsADb([1, -1, 1, -1], -100)).toBeCloseTo(0);
  });

  it('media amplitud son ~−6 dBFS', () => {
    expect(rmsADb([0.5, -0.5, 0.5, -0.5], -100)).toBeCloseTo(-6.02, 1);
  });

  it('el silencio y el bloque vacío dan el piso', () => {
    expect(rmsADb([0, 0, 0], -100)).toBe(-100);
    expect(rmsADb([], -100)).toBe(-100);
    expect(potenciaADb(1e-20, -100)).toBe(-100);
  });
});

describe('promedioDb', () => {
  it('promedia en potencia, no en dB', () => {
    // −20 dB y −40 dB: potencia media ≈ 0.00505 → ≈ −22.97 dB (no −30).
    expect(promedioDb([-20, -40], -100)).toBeCloseTo(-22.97, 1);
    expect(promedioDb([-50, -50, -50], -100)).toBeCloseTo(-50);
    expect(promedioDb([], -100)).toBe(-100);
  });
});

describe('suavizar', () => {
  it('se acerca al objetivo sin pasarse', () => {
    const v = suavizar(0, 1, 0.03, 0.03, 0.15);
    expect(v).toBeGreaterThan(0.6);
    expect(v).toBeLessThan(0.7);
  });

  it('baja más lento de lo que sube', () => {
    const sube = suavizar(0, 1, 0.05, 0.03, 0.15);
    const baja = 1 - suavizar(1, 0, 0.05, 0.03, 0.15);
    expect(sube).toBeGreaterThan(baja);
  });

  it('dt = 0 no cambia y tau = 0 salta', () => {
    expect(suavizar(0.3, 1, 0, 0.03, 0.15)).toBe(0.3);
    expect(suavizar(0.3, 1, 0.1, 0, 0.15)).toBe(1);
  });
});
