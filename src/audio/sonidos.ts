/**
 * Recetas de cada sonido, todas sintetizadas: osciladores, ruido filtrado y envolventes.
 * Los números de timbre (frecuencias, tiempos de cada golpe) viven aquí, en la receta;
 * los volúmenes y lo que se ajusta jugando están en ajustes.ts.
 *
 * Cada receta crea un `Disparo` que se limpia solo al terminar; `alTerminar` permite
 * destruir una fuente 3D temporal cuando el sonido ya acabó.
 */
import type { Superficie } from '../shared/contratos';
import { AJUSTES_AUDIO } from './ajustes';
import { azar, variar, type Disparo, type Sintesis, type TipoRuido } from './nucleo';

const V = AJUSTES_AUDIO.volumen;

// ───────────── Piezas ─────────────

/** Tono percusivo (con caída de frecuencia opcional). Devuelve el fin. */
function tono(
  d: Disparo, tipo: OscillatorType, f: number, t: number,
  ataque: number, pico: number, caida: number, destino: AudioNode, fFin?: number,
): number {
  const g = d.ganancia(0);
  const fin = d.golpe(g.gain, t, ataque, pico, caida);
  const o = d.osc(tipo, f, t, fin - t + 0.02);
  if (fFin !== undefined) {
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, fFin), fin);
  }
  o.connect(g);
  g.connect(destino);
  return fin;
}

/** Ráfaga de ruido filtrado con envolvente percusiva. Devuelve el fin. */
function rafaga(
  d: Disparo, ruido: TipoRuido, filtro: BiquadFilterType, f: number, q: number, t: number,
  ataque: number, pico: number, caida: number, destino: AudioNode,
): number {
  const g = d.ganancia(0);
  const fin = d.golpe(g.gain, t, ataque, pico, caida);
  const src = d.ruido(ruido, t, fin - t + 0.02);
  const fl = d.filtro(filtro, f, q);
  src.connect(fl);
  fl.connect(g);
  g.connect(destino);
  return fin;
}

/** Pitido sostenido corto (ataque y salida de pocos ms, sin clic). Devuelve el fin. */
function pitido(d: Disparo, tipo: OscillatorType, f: number, t: number, dur: number, nivel: number, destino: AudioNode): number {
  const g = d.ganancia(0);
  const fin = d.sostenido(g.gain, t, 0.005, nivel, Math.max(0, dur - 0.02), 0.015);
  const o = d.osc(tipo, f, t, fin - t + 0.02);
  o.connect(g);
  g.connect(destino);
  return fin;
}

/** Tintineo metálico: parciales inarmónicos de una llave. Devuelve el fin. */
function tintin(d: Disparo, t: number, nivel: number, destino: AudioNode): number {
  const f0 = azar(2200, 3200);
  let fin = t;
  [1, 2.76, 5.4].forEach((m, k) => {
    fin = Math.max(fin, tono(d, 'sine', f0 * m, t, 0.0005, nivel / (k + 1), azar(0.15, 0.3) / (1 + k * 0.4), destino));
  });
  return fin;
}

/** Ganancia "temblorosa": base ± profundidad con un LFO (sale entre base−prof y base+prof). */
function temblor(d: Disparo, t: number, dur: number, hz: number, base: number, prof: number, forma: OscillatorType = 'sine'): GainNode {
  const g = d.ganancia(base);
  const lfo = d.osc(forma, hz, t, dur);
  const p = d.ganancia(prof);
  lfo.connect(p);
  p.connect(g.gain);
  return g;
}

/** Rechinido de bisagra: sierra resonante con tono que se desliza y "trabado" (stick-slip). */
function chirrido(d: Disparo, t: number, base: number, dur: number, nivel: number, destino: AudioNode): number {
  const env = d.ganancia(0);
  const fin = d.sostenido(env.gain, t, 0.08, nivel, Math.max(0, dur - 0.3), 0.22);
  const o = d.osc('sawtooth', base, t, fin - t + 0.02);
  o.frequency.setValueAtTime(base * 0.95, t);
  o.frequency.linearRampToValueAtTime(base * 1.45, t + dur * 0.4);
  o.frequency.linearRampToValueAtTime(base * 1.1, t + dur * 0.75);
  o.frequency.linearRampToValueAtTime(base * 1.3, t + dur);
  const trabado = temblor(d, t, fin - t + 0.02, azar(19, 27), 0.6, 0.4, 'square');
  const r1 = d.filtro('bandpass', 1100, 6);
  const r2 = d.filtro('bandpass', 2300, 8);
  o.connect(r1);
  o.connect(r2);
  r1.connect(trabado);
  r2.connect(trabado);
  trabado.connect(env);
  env.connect(destino);
  return fin;
}

// ───────────── Oído ─────────────

/** Pisada de Oído según el piso. Va en la cabeza, con un paneo leve que alterna pies. */
export function pisada(s: Sintesis, destino: AudioNode, t: number, superficie: Superficie, corriendo: boolean, pan: number): Disparo {
  const vr = AJUSTES_AUDIO.pisadas.variacion;
  const d = s.disparo(destino, variar(corriendo ? V.pisadaCorriendo : V.pisada, vr));
  const p = d.paneo(pan);
  p.connect(d.salida);
  const k = corriendo ? 0.8 : 1;
  switch (superficie) {
    case 'concreto':
      tono(d, 'sine', variar(95, vr), t, 0.003, 0.8, 0.1 * k, p, 60);
      rafaga(d, 'blanco', 'bandpass', variar(2500, vr), 0.8, t, 0.002, 0.55, 0.06 * k, p);
      break;
    case 'madera':
      tono(d, 'sine', variar(130, vr), t, 0.003, 0.9, 0.13 * k, p, 85);
      rafaga(d, 'rosa', 'bandpass', variar(700, vr), 2, t, 0.002, 0.45, 0.09 * k, p);
      if (Math.random() < 0.35) {
        // Una tabla que cruje.
        const g = d.ganancia(0);
        const fin = d.sostenido(g.gain, t + 0.02, 0.04, 0.08, 0.08, 0.06);
        const f0 = azar(380, 460);
        const o = d.osc('triangle', f0, t + 0.02, fin - t);
        o.frequency.setValueAtTime(f0, t + 0.02);
        o.frequency.linearRampToValueAtTime(f0 * 0.85, fin);
        const bp = d.filtro('bandpass', 900, 3);
        o.connect(bp);
        bp.connect(g);
        g.connect(p);
      }
      break;
    case 'metal':
      tono(d, 'sine', variar(110, vr), t, 0.003, 0.6, 0.09 * k, p, 70);
      rafaga(d, 'blanco', 'bandpass', variar(3200, vr), 1.2, t, 0.001, 0.35, 0.05 * k, p);
      [523, 1307, 2211, 3120].forEach((f, i) => {
        tono(d, 'sine', variar(f, 0.03), t, 0.001, 0.16 / (i + 1), 0.35 / (1 + i * 0.3), p);
      });
      break;
  }
  return d;
}

/** Oído topó con una pared o una puerta cerrada. */
export function golpe(s: Sintesis, destino: AudioNode, t: number): Disparo {
  const d = s.disparo(destino, V.golpe);
  tono(d, 'sine', 85, t, 0.004, 1, 0.22, d.salida, 50);
  rafaga(d, 'rosa', 'lowpass', 900, 0.7, t, 0.002, 0.7, 0.12, d.salida);
  rafaga(d, 'blanco', 'bandpass', 1800, 1, t, 0.001, 0.25, 0.04, d.salida);
  return d;
}

/** Clic sin nada al alcance: la mano roza el aire o la ropa. */
export function roce(s: Sintesis, destino: AudioNode, t: number): Disparo {
  const d = s.disparo(destino, V.roce);
  const g = d.ganancia(0);
  const fin = d.sostenido(g.gain, t, 0.08, 0.6, 0.05, 0.15);
  const src = d.ruido('blanco', t, fin - t + 0.02);
  const bp = d.filtro('bandpass', 1500, 1.5);
  bp.frequency.setValueAtTime(1500, t);
  bp.frequency.linearRampToValueAtTime(3500, fin);
  src.connect(bp);
  bp.connect(g);
  g.connect(d.salida);
  return d;
}

/** El decibelímetro se enciende al agarrarlo: dos pitidos y un chispazo. */
export function pitidoEncendido(s: Sintesis, destino: AudioNode, t: number): Disparo {
  const d = s.disparo(destino, V.pitidoEncendido);
  const suave = d.filtro('lowpass', 4000, 0.7);
  suave.connect(d.salida);
  rafaga(d, 'blanco', 'highpass', 3000, 0.7, t, 0.001, 0.25, 0.05, d.salida);
  pitido(d, 'square', 1750, t + 0.02, 0.08, 0.5, suave);
  pitido(d, 'square', 2350, t + 0.14, 0.13, 0.5, suave);
  return d;
}

/** La llave tintinea en la mano. */
export function llaveEnMano(s: Sintesis, destino: AudioNode, t: number): Disparo {
  const d = s.disparo(destino, V.llaveMano);
  let tt = t;
  for (let i = 0; i < 4; i++) {
    tintin(d, tt, 0.35, d.salida);
    tt += azar(0.04, 0.11);
  }
  return d;
}

// ───────────── Puertas (en 3D) ─────────────

export function rechinido(s: Sintesis, destino: AudioNode, t: number, alTerminar?: () => void): Disparo {
  const d = s.disparo(destino, V.rechinido, alTerminar);
  chirrido(d, t, azar(160, 185), azar(0.8, 1.1), 1, d.salida);
  return d;
}

/** Cierre suave (sin portazo): el pestillo. */
export function cierre(s: Sintesis, destino: AudioNode, t: number, alTerminar?: () => void): Disparo {
  const d = s.disparo(destino, V.cierre, alTerminar);
  tono(d, 'sine', 140, t, 0.003, 0.6, 0.1, d.salida, 90);
  rafaga(d, 'blanco', 'bandpass', 3000, 1, t + 0.02, 0.001, 0.4, 0.03, d.salida);
  return d;
}

export function portazo(s: Sintesis, destino: AudioNode, t: number, alTerminar?: () => void): Disparo {
  const d = s.disparo(destino, V.portazo, alTerminar);
  tono(d, 'sine', 70, t, 0.002, 1, 0.45, d.salida, 38);
  rafaga(d, 'rosa', 'lowpass', 1500, 0.7, t, 0.001, 1, 0.3, d.salida);
  rafaga(d, 'blanco', 'bandpass', 2500, 0.7, t, 0.001, 0.5, 0.08, d.salida);
  // La puerta vibra en el marco.
  for (let i = 0; i < 4; i++) {
    rafaga(d, 'blanco', 'bandpass', 1800, 4, t + 0.05 + i * 0.045, 0.001, 0.15 / (i + 1), 0.03, d.salida);
  }
  return d;
}

/** Forcejeo con la cerradura de la salida (sin llave). */
export function forcejeo(s: Sintesis, destino: AudioNode, t: number, alTerminar?: () => void): Disparo {
  const d = s.disparo(destino, V.cerradura, alTerminar);
  for (const dt of [0, 0.11, 0.2, 0.34]) {
    const tt = t + dt + azar(0, 0.02);
    rafaga(d, 'blanco', 'bandpass', azar(2500, 3100), 5, tt, 0.001, 0.6, 0.04, d.salida);
    tono(d, 'triangle', azar(1600, 1800), tt, 0.001, 0.2, 0.05, d.salida, 1450);
  }
  tono(d, 'sine', 120, t + 0.46, 0.002, 0.6, 0.12, d.salida, 80);
  rafaga(d, 'rosa', 'lowpass', 800, 0.7, t + 0.46, 0.002, 0.5, 0.1, d.salida);
  return d;
}

// ───────────── Monstruo ─────────────

export function pasoMonstruo(s: Sintesis, destino: AudioNode, t: number, superficie: Superficie, rapido: boolean): Disparo {
  const d = s.disparo(destino, variar(rapido ? V.pasoMonstruoRapido : V.pasoMonstruo, 0.1));
  const k = rapido ? 0.7 : 1;
  tono(d, 'sine', variar(55, 0.08), t, 0.006, 1, 0.35 * k, d.salida, 32);
  // Cuerpo medio para que se ubique en 3D (el HRTF casi no localiza los graves puros).
  tono(d, 'sine', variar(120, 0.08), t, 0.004, 0.5, 0.15 * k, d.salida, 70);
  rafaga(d, 'cafe', 'lowpass', 700, 0.7, t, 0.004, 0.8, 0.25 * k, d.salida);
  switch (superficie) {
    case 'concreto':
      rafaga(d, 'blanco', 'bandpass', 1400, 0.8, t, 0.003, 0.2, 0.07, d.salida);
      break;
    case 'madera':
      rafaga(d, 'rosa', 'bandpass', 500, 2, t, 0.003, 0.3, 0.12, d.salida);
      break;
    case 'metal':
      [180, 470, 1030].forEach((f, i) => tono(d, 'sine', f, t, 0.002, 0.25 / (i + 1), 0.5, d.salida));
      break;
  }
  return d;
}

/** Un ciclo de respiración (inhala y exhala). Lenta en patrulla, agitada en caza. */
export function respiro(s: Sintesis, destino: AudioNode, t: number, modo: 'patrulla' | 'caza'): Disparo {
  const caza = modo === 'caza';
  const d = s.disparo(destino, variar(caza ? V.respiracionCaza : V.respiracionPatrulla, 0.1));
  // Inhala.
  {
    const g = d.ganancia(0);
    const fin = caza ? d.sostenido(g.gain, t, 0.12, 0.7, 0.05, 0.13) : d.sostenido(g.gain, t, 0.9, 0.5, 0.2, 0.5);
    const src = d.ruido('rosa', t, fin - t + 0.02);
    const bp = d.filtro('bandpass', 500, 1.2);
    bp.frequency.setValueAtTime(caza ? 600 : 500, t);
    bp.frequency.linearRampToValueAtTime(caza ? 900 : 800, fin);
    const lp = d.filtro('lowpass', 1800, 0.7);
    src.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(d.salida);
  }
  // Exhala, con un raspado grave.
  {
    const t2 = t + (caza ? 0.38 : 1.9);
    const g = d.ganancia(0);
    const fin = caza ? d.sostenido(g.gain, t2, 0.06, 1, 0.1, 0.3) : d.sostenido(g.gain, t2, 0.25, 0.8, 0.4, 1.1);
    const src = d.ruido('rosa', t2, fin - t2 + 0.02);
    const bp = d.filtro('bandpass', 450, 0.9);
    bp.frequency.setValueAtTime(caza ? 520 : 450, t2);
    bp.frequency.linearRampToValueAtTime(300, fin);
    src.connect(bp);
    bp.connect(g);
    g.connect(d.salida);

    const gr = d.ganancia(0);
    d.sostenido(gr.gain, t2, caza ? 0.05 : 0.3, caza ? 0.3 : 0.12, caza ? 0.1 : 0.35, caza ? 0.3 : 1.0);
    const o = d.osc('sawtooth', caza ? 75 : 62, t2, fin - t2 + 0.02);
    const sat = d.saturador(caza ? 3 : 1.5);
    const lp = d.filtro('lowpass', caza ? 400 : 260, 1);
    o.connect(sat);
    sat.connect(lp);
    lp.connect(gr);
    gr.connect(d.salida);
  }
  return d;
}

export function grunido(s: Sintesis, destino: AudioNode, t: number): Disparo {
  const d = s.disparo(destino, variar(V.grunido, 0.1));
  const dur = azar(1.1, 1.5);
  const env = d.ganancia(0);
  const fin = d.sostenido(env.gain, t, 0.15, 1, dur - 0.6, 0.45);
  const largo = fin - t + 0.02;
  const trem = temblor(d, t, largo, azar(9, 13), 0.6, 0.4);
  const sat = d.saturador(3);
  const formante = d.filtro('lowpass', 700, 3);
  for (const f of [52, 55.5]) {
    const o = d.osc('sawtooth', f, t, largo);
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.1, t + 0.3);
    o.frequency.linearRampToValueAtTime(f * 0.85, fin);
    o.connect(sat);
  }
  const ruido = d.ruido('cafe', t, largo);
  const gr = d.ganancia(0.5);
  ruido.connect(gr);
  gr.connect(sat);
  sat.connect(formante);
  formante.connect(trem);
  trem.connect(env);
  env.connect(d.salida);
  return d;
}

/** Estática al ser atrapado (no 3D). */
export function estatica(s: Sintesis, destino: AudioNode, t: number, dur: number): Disparo {
  const d = s.disparo(destino, V.estaticaAtrapa);
  const env = d.ganancia(0);
  const fin = d.sostenido(env.gain, t, 0.01, 1, Math.max(0, dur - 0.4), 0.39);
  const largo = fin - t + 0.02;
  const crepita = temblor(d, t, largo, 37, 0.5, 0.5, 'square');
  const a = d.ruido('blanco', t, largo);
  const hp = d.filtro('highpass', 400, 0.7);
  const b = d.ruido('blanco', t, largo);
  const bp = d.filtro('bandpass', 1200, 0.5);
  a.connect(hp);
  hp.connect(crepita);
  b.connect(bp);
  bp.connect(crepita);
  crepita.connect(env);
  env.connect(d.salida);
  return d;
}

/** Grito del monstruo: breve, distorsionado, sin nada explícito. */
export function grito(s: Sintesis, destino: AudioNode, t: number): Disparo {
  const d = s.disparo(destino, V.grito);
  const env = d.ganancia(0);
  const fin = d.sostenido(env.gain, t, 0.04, 1, 0.75, 0.3);
  const largo = fin - t + 0.02;
  const sat = d.saturador(2);
  const f1 = d.filtro('bandpass', 1100, 2);
  const f2 = d.filtro('bandpass', 2600, 3);
  const vibrato = d.osc('sine', 7, t, largo);
  const prof = d.ganancia(25);
  vibrato.connect(prof);
  for (const f of [620, 655, 900]) {
    const o = d.osc('sawtooth', f, t, largo);
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.25, t + 0.15);
    o.frequency.linearRampToValueAtTime(f * 0.8, fin);
    prof.connect(o.frequency);
    o.connect(sat);
  }
  sat.connect(f1);
  sat.connect(f2);
  f1.connect(env);
  f2.connect(env);
  env.connect(d.salida);
  return d;
}

// ───────────── Objetos y final ─────────────

/** Faro del decibelímetro sin agarrar: pitido suave con estática. */
export function faroDecibelimetro(s: Sintesis, destino: AudioNode, t: number): Disparo {
  const d = s.disparo(destino, V.faroDecibelimetro);
  pitido(d, 'sine', 1450, t, 0.06, 0.5, d.salida);
  rafaga(d, 'blanco', 'bandpass', 4000, 1, t, 0.001, 0.4, 0.08, d.salida);
  if (Math.random() < 0.5) rafaga(d, 'blanco', 'bandpass', 3000, 1, t + azar(0.1, 0.3), 0.001, 0.25, 0.04, d.salida);
  return d;
}

/** Faro de la llave sin agarrar: un tintineo débil. */
export function faroLlave(s: Sintesis, destino: AudioNode, t: number): Disparo {
  const d = s.disparo(destino, V.faroLlave);
  tintin(d, t, 0.3, d.salida);
  tintin(d, t + azar(0.08, 0.16), 0.2, d.salida);
  return d;
}

/** Latido: "lub-dub" grave con un armónico para audífonos pequeños. `nivel` multiplica el volumen. */
export function latido(s: Sintesis, destino: AudioNode, t: number, nivel: number): Disparo {
  const d = s.disparo(destino, V.latido * nivel);
  tono(d, 'sine', 58, t, 0.008, 1, 0.14, d.salida, 42);
  tono(d, 'sine', 116, t, 0.008, 0.25, 0.1, d.salida, 84);
  rafaga(d, 'cafe', 'lowpass', 120, 0.7, t, 0.005, 0.4, 0.1, d.salida);
  const t2 = t + 0.17;
  tono(d, 'sine', 66, t2, 0.008, 0.7, 0.12, d.salida, 48);
  tono(d, 'sine', 132, t2, 0.008, 0.18, 0.08, d.salida, 96);
  return d;
}

/** Chasquido del radio al abrir o cerrar el canal. */
export function chasquido(s: Sintesis, destino: AudioNode, t: number, volumen: number): Disparo {
  const d = s.disparo(destino, volumen);
  const hp = d.filtro('highpass', AJUSTES_AUDIO.radio.hzBajo, 0.7);
  hp.connect(d.salida);
  rafaga(d, 'blanco', 'bandpass', 2000, 0.7, t, 0.0005, 1, 0.02, hp);
  tono(d, 'square', 900, t, 0.0005, 0.4, 0.015, hp);
  return d;
}

/** Ganaron: la llave gira, el cerrojo cede, la puerta se abre y entra el aire de fuera. */
export function salida(s: Sintesis, destino: AudioNode, t: number, segAire: number, alTerminar?: () => void): Disparo {
  const d = s.disparo(destino, V.salida, alTerminar);
  // Llave que gira y cerrojo.
  tono(d, 'sine', 300, t, 0.001, 0.4, 0.06, d.salida, 180);
  rafaga(d, 'blanco', 'bandpass', 3000, 2, t, 0.001, 0.4, 0.04, d.salida);
  tono(d, 'sine', 120, t + 0.25, 0.002, 0.8, 0.15, d.salida, 70);
  rafaga(d, 'rosa', 'lowpass', 900, 0.7, t + 0.25, 0.002, 0.6, 0.12, d.salida);
  // Puerta pesada que se abre despacio.
  chirrido(d, t + 0.6, 110, 1.8, 0.7, d.salida);
  // Aire de fuera: ruido rosa con el filtro moviéndose lento, como ráfagas.
  const ta = t + 0.9;
  const env = d.ganancia(0);
  const fin = d.sostenido(env.gain, ta, 2, V.aire / V.salida, Math.max(0, segAire - 6), 4);
  const largo = fin - ta + 0.02;
  const src = d.ruido('rosa', ta, largo);
  const lp = d.filtro('lowpass', 900, 0.7);
  const lfo = d.osc('sine', 0.15, ta, largo);
  const prof = d.ganancia(350);
  lfo.connect(prof);
  prof.connect(lp.frequency);
  const rafagas = temblor(d, ta, largo, 0.23, 0.75, 0.25);
  src.connect(lp);
  lp.connect(rafagas);
  rafagas.connect(env);
  env.connect(d.salida);
  return d;
}
