/**
 * Conteo de dedos extendidos para los números del radio (DISENO.md §4.2, nota sobre los números).
 * El módulo LSM reconoce letras, no números: aquí se reutilizan sus medidas sin modificarlas.
 *
 * Todo se mide en el MARCO DE LA MANO (igual que src/lsm/core/rules.ts), así que inclinar o girar la
 * mano, o usar la izquierda, no cambia el conteo:
 *   - un dedo (índice, medio, anular, meñique) cuenta si su "ext" de analyzeHand() es alto
 *     (recto Y con la punta lejos de la muñeca) y su punta no toca la del pulgar (círculo de la F);
 *   - el pulgar cuenta si está estirado (thumbExt) Y su punta sale hacia afuera del nudillo del índice
 *     (en el eje "lado" de la mano). Así no cuenta cruzado sobre la palma, como en la B o la S.
 */
import { normalizeLandmarks } from '../lsm/core/features';
import { analyzeHand } from '../lsm/core/rules';
import type { HandFrame, Landmark } from '../lsm/core/types';
import { AJUSTES_RADIO } from './ajustes';

const distancia = (p: Landmark, q: Landmark) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

export type ConteoDedos = 0 | 1 | 2 | 3 | 4 | 5;

/** Detalle del conteo (para la depuración y las pruebas). */
export interface DetalleDedos {
  total: ConteoDedos;
  pulgar: boolean;
  indice: boolean;
  medio: boolean;
  anular: boolean;
  menique: boolean;
}

export function detalleDedos(frame: HandFrame): DetalleDedos {
  const nada: DetalleDedos = { total: 0, pulgar: false, indice: false, medio: false, anular: false, menique: false };
  if (!frame || !Array.isArray(frame.landmarks) || frame.landmarks.length < 21) return nada;
  const a = AJUSTES_RADIO.dedos;
  const h = analyzeHand(normalizeLandmarks(frame.landmarks, frame.handedness));
  const F = h.fingers;
  // Un dedo cuenta si está estirado y su punta no forma un círculo con la del pulgar.
  const cuenta = (fi: (typeof F)['index']) =>
    fi.ext >= a.umbralDedo && distancia(fi.tip.p, h.thumbTip.p) > a.toquePulgar;
  const d: DetalleDedos = {
    total: 0,
    pulgar: h.thumbExt >= a.umbralPulgar && h.sideRel >= a.ladoMinPulgar,
    indice: cuenta(F.index),
    medio: cuenta(F.middle),
    anular: cuenta(F.ring),
    menique: cuenta(F.pinky),
  };
  d.total = ([d.pulgar, d.indice, d.medio, d.anular, d.menique].filter(Boolean).length as ConteoDedos);
  return d;
}

/** Cuenta los dedos extendidos (0 a 5) con los 21 puntos de MediaPipe. */
export function contarDedos(frame: HandFrame): ConteoDedos {
  return detalleDedos(frame).total;
}
