/**
 * Manos SINTÉTICAS para probar el conteo de dedos sin cámara.
 * Adaptado (copiado lo necesario) de ECOS-Game/ecos-lsm/test/syntheticHands.ts: 21 puntos con la
 * forma pedida, que luego se rotan (inclinada en la imagen y de lado) y se reflejan (mano izquierda).
 * Detectan errores de lógica y de orientación, NO la precisión con manos reales.
 */
import type { HandFrame, Landmark } from '../../src/lsm/core/types';

export type EstadoDedo = 'ext' | 'curl' | 'touch' | 'curve' | 'hook' | 'spread';
export type EstadoPulgar = 'ext' | 'side' | 'across' | 'up' | 'touch' | 'tuck';

const W = { x: 0.5, y: 0.8 };
const MCP: Record<string, [number, number]> = {
  index: [0.54, 0.62],
  middle: [0.5, 0.615],
  ring: [0.46, 0.62],
  pinky: [0.42, 0.64],
};
const PULGAR: Record<EstadoPulgar, number[][]> = {
  ext: [[0.56, 0.76], [0.61, 0.7], [0.66, 0.66], [0.71, 0.63]],
  side: [[0.56, 0.76], [0.61, 0.71], [0.66, 0.68], [0.71, 0.66]],
  across: [[0.56, 0.76], [0.58, 0.69], [0.55, 0.64], [0.5, 0.625]],
  up: [[0.56, 0.76], [0.585, 0.7], [0.59, 0.63], [0.59, 0.575]],
  touch: [[0.56, 0.76], [0.6, 0.7], [0.6, 0.62], [0.565, 0.55]],
  tuck: [[0.56, 0.76], [0.575, 0.69, -0.03], [0.55, 0.63, -0.05], [0.52, 0.57, -0.06]],
};

function dedo(nombre: string, st: EstadoDedo, puntaPulgar: Landmark): Landmark[] {
  const [x, y] = MCP[nombre];
  const P = (dx: number, dy: number, dz = 0) => ({ x: x + dx, y: y + dy, z: dz });
  const s = nombre === 'index' ? 1 : -1;
  switch (st) {
    case 'ext': return [P(0, 0), P(0, -0.065), P(0, -0.105), P(0, -0.14)];
    case 'curl': return [P(0, 0), P(0, -0.045, -0.03), P(0, -0.015, -0.05), P(0, 0.015, -0.03)];
    case 'touch': return [P(0, 0), P(0.005, -0.05, -0.03), P(0.02, -0.075, -0.05), { x: puntaPulgar.x - 0.005, y: puntaPulgar.y - 0.005, z: -0.04 }];
    case 'hook': return [P(0, 0), P(0, -0.05, -0.03), P(0, -0.04, -0.07), P(0, -0.015, -0.08)];
    case 'curve': return [P(0, 0), P(0, -0.055, -0.03), P(0, -0.07, -0.07), P(0, -0.05, -0.1)];
    case 'spread': return [P(0, 0), P(0.02 * s, -0.065), P(0.035 * s, -0.105), P(0.05 * s, -0.14)];
  }
}

export type FormaDedos = Record<'index' | 'middle' | 'ring' | 'pinky', EstadoDedo>;

export function mano(pulgar: EstadoPulgar, f: FormaDedos): Landmark[] {
  const lm: Landmark[] = [{ x: W.x, y: W.y, z: 0 }];
  for (const [x, y, z = 0] of PULGAR[pulgar]) lm.push({ x, y, z });
  const punta = lm[4];
  for (const n of ['index', 'middle', 'ring', 'pinky'] as const) lm.push(...dedo(n, f[n], punta));
  return lm;
}

export const todos = (s: EstadoDedo): FormaDedos => ({ index: s, middle: s, ring: s, pinky: s });

/** Rota alrededor de la muñeca: roll (en el plano de la imagen) y yaw (mano de lado). */
export function rotar(lm: Landmark[], roll: number, yaw: number): Landmark[] {
  return lm.map((p) => {
    let x = p.x - W.x;
    let y = p.y - W.y;
    let z = p.z;
    [x, y] = [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)];
    [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    return { x: x + W.x, y: y + W.y, z };
  });
}

/** Posturas de prueba: [roll, yaw] en radianes (recta, inclinada, de lado, combinada, de cabeza). */
export const POSTURAS: Array<[number, number]> = [
  [0, 0],
  [0.44, 0],
  [-0.44, 0],
  [Math.PI / 2, 0],
  [Math.PI, 0],
  [0, 0.7],
  [0, -0.7],
  [0.3, 0.5],
];

/** Cuadro de MediaPipe para la mano derecha ('der') o su reflejo como mano izquierda ('izq'). */
export function cuadro(lm: Landmark[], lado: 'der' | 'izq'): HandFrame {
  const puntos = lado === 'izq' ? lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })) : lm;
  // Con video sin espejo, MediaPipe etiqueta la mano real (ver ecos-lsm/README.md §6).
  return { landmarks: puntos, handedness: lado === 'der' ? 'Right' : 'Left', latencyMs: 0, timestamp: 0 };
}
