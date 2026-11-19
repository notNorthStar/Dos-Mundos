import { describe, expect, it } from 'vitest';
import { contarDedos, detalleDedos } from '../../src/radio/dedos';
import { POSTURAS, cuadro, mano, rotar, todos, type EstadoPulgar, type FormaDedos } from './manosSinteticas';

const CASOS: Array<{ nombre: string; pulgar: EstadoPulgar; dedos: FormaDedos; esperado: number }> = [
  { nombre: '0 · puño con el pulgar cruzado (S)', pulgar: 'across', dedos: todos('curl'), esperado: 0 },
  { nombre: '0 · puño con el pulgar arriba pegado (A)', pulgar: 'up', dedos: todos('curl'), esperado: 0 },
  { nombre: '0 · dedos en gancho', pulgar: 'across', dedos: todos('hook'), esperado: 0 },
  { nombre: '1 · índice', pulgar: 'across', dedos: { index: 'ext', middle: 'curl', ring: 'curl', pinky: 'curl' }, esperado: 1 },
  { nombre: '1 · solo el pulgar al costado', pulgar: 'side', dedos: todos('curl'), esperado: 1 },
  { nombre: '2 · índice y medio juntos', pulgar: 'across', dedos: { index: 'ext', middle: 'ext', ring: 'curl', pinky: 'curl' }, esperado: 2 },
  { nombre: '2 · índice y medio abiertos (V)', pulgar: 'across', dedos: { index: 'spread', middle: 'spread', ring: 'curl', pinky: 'curl' }, esperado: 2 },
  { nombre: '2 · pulgar e índice (L)', pulgar: 'ext', dedos: { index: 'ext', middle: 'curl', ring: 'curl', pinky: 'curl' }, esperado: 2 },
  { nombre: '3 · índice, medio y anular', pulgar: 'across', dedos: { index: 'spread', middle: 'ext', ring: 'spread', pinky: 'curl' }, esperado: 3 },
  { nombre: '3 · pulgar, índice y medio', pulgar: 'ext', dedos: { index: 'spread', middle: 'spread', ring: 'curl', pinky: 'curl' }, esperado: 3 },
  { nombre: '3 · la seña F (índice tocando el pulgar)', pulgar: 'touch', dedos: { index: 'touch', middle: 'ext', ring: 'ext', pinky: 'ext' }, esperado: 3 },
  { nombre: '4 · cuatro dedos con el pulgar cruzado (B)', pulgar: 'across', dedos: todos('ext'), esperado: 4 },
  { nombre: '4 · cuatro dedos con el pulgar metido', pulgar: 'tuck', dedos: todos('ext'), esperado: 4 },
  { nombre: '5 · mano abierta', pulgar: 'ext', dedos: todos('ext'), esperado: 5 },
  { nombre: '5 · mano abierta con dedos separados', pulgar: 'ext', dedos: { index: 'spread', middle: 'spread', ring: 'spread', pinky: 'spread' }, esperado: 5 },
];

describe('contarDedos', () => {
  for (const c of CASOS) {
    it(`${c.nombre} → ${c.esperado}, en todas las posturas y con las dos manos`, () => {
      const base = mano(c.pulgar, c.dedos);
      const fallos: string[] = [];
      for (const lado of ['der', 'izq'] as const) {
        for (const [roll, yaw] of POSTURAS) {
          const n = contarDedos(cuadro(rotar(base, roll, yaw), lado));
          if (n !== c.esperado) {
            fallos.push(`${lado} giro ${Math.round((roll * 180) / Math.PI)}° lado ${Math.round((yaw * 180) / Math.PI)}° → ${n}`);
          }
        }
      }
      expect(fallos).toEqual([]);
    });
  }

  it('el detalle dice qué dedos cuentan', () => {
    const d = detalleDedos(cuadro(mano('ext', { index: 'ext', middle: 'curl', ring: 'curl', pinky: 'curl' }), 'der'));
    expect(d).toMatchObject({ total: 2, pulgar: true, indice: true, medio: false, anular: false, menique: false });
  });

  it('un cuadro incompleto da 0 y no lanza', () => {
    expect(contarDedos({ landmarks: [], handedness: 'Right', latencyMs: 0, timestamp: 0 })).toBe(0);
  });

  it('no depende de la posición ni del tamaño de la mano en la imagen', () => {
    const base = mano('ext', todos('ext'));
    const chica = base.map((p) => ({ x: 0.2 + (p.x - 0.5) * 0.5, y: 0.3 + (p.y - 0.8) * 0.5, z: p.z * 0.5 }));
    expect(contarDedos(cuadro(chica, 'der'))).toBe(5);
  });
});
