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
import { azar, entre, variar, type Disparo, type Sintesis, type TipoRuido } from './nucleo';

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

// ───────────── Monstruo: piezas ─────────────
//
// El monstruo NO debe sonar a ronroneo: nada de un tono grave pulsando con ritmo fijo. Todo lo que
// se repite se sortea (duraciones, pausas, formantes) y la aspereza viene de ruido, no de un LFO.
// Cada sonido lleva medios y agudos (formantes, chasquidos, soplo) para que el HRTF lo ubique.

const M = AJUSTES_AUDIO.monstruo;

/** Un sonido del monstruo y cuánto dura (para encadenar el siguiente con una pausa al azar). */
export interface VozMonstruo {
  d: Disparo;
  seg: number;
}

/**
 * RMS aproximado del ruido café de `Sintesis` tras un pasa-bajas en `hz` (medido offline con el
 * mismo generador: 8 Hz → 0.042, 40 Hz → 0.088, 100 Hz → 0.131, sin filtro → 0.208).
 */
function rmsCafe(hz: number): number {
  return 0.208 * Math.sqrt(Math.atan(hz / 150) / (Math.PI / 2));
}

/**
 * Modulación aleatoria (nunca periódica): ruido café filtrado a `hz` sumado a `param`, con `rms` de
 * desviación en las unidades del parámetro. Los picos llegan a ~3·rms.
 */
function deriva(d: Disparo, t: number, dur: number, hz: number, rms: number, param: AudioParam): void {
  const src = d.ruido('cafe', t, dur);
  const lp = d.filtro('lowpass', hz, 0.7);
  const g = d.ganancia(rms / rmsCafe(hz));
  src.connect(lp);
  lp.connect(g);
  g.connect(param);
}

/** Ganancia áspera: `base` ± ruido lento. Con rms alto a veces cruza cero: textura húmeda, rota. */
function aspera(d: Disparo, t: number, dur: number, hz: number, base: number, rms: number): GainNode {
  const g = d.ganancia(base);
  deriva(d, t, dur, hz, rms, g.gain);
  return g;
}

/** Frecuencia que va de `a` a `b` pasando por un punto intermedio al azar (no en línea recta). */
function deslizar(param: AudioParam, t: number, dur: number, a: number, b: number): void {
  param.setValueAtTime(a, t);
  param.linearRampToValueAtTime(azar(Math.min(a, b), Math.max(a, b)) * azar(0.9, 1.1), t + dur * azar(0.3, 0.7));
  param.linearRampToValueAtTime(b, t + dur);
}

/**
 * Soplo de garganta: ruido rosa por dos formantes que se mueven (la boca cambia de forma) más un
 * siseo agudo, todo con aspereza húmeda. Va a `destino` (la envolvente la pone quien llama).
 */
function soplo(
  d: Disparo, t: number, dur: number,
  f1: readonly [number, number], f2: readonly [number, number],
  q: number, humedad: number, siseo: number, destino: AudioNode,
): void {
  const largo = dur + 0.02;
  const asp = aspera(d, t, largo, 45, 1, humedad);
  const src = d.ruido('rosa', t, largo);
  for (const [a, b] of [f1, f2]) {
    const bp = d.filtro('bandpass', a, q);
    deslizar(bp.frequency, t, dur, a, b);
    src.connect(bp);
    bp.connect(asp);
  }
  if (siseo > 0) {
    const blanco = d.ruido('blanco', t, largo);
    const bp = d.filtro('bandpass', azar(2800, 3800), 0.9);
    const g = d.ganancia(siseo);
    blanco.connect(bp);
    bp.connect(g);
    g.connect(asp);
  }
  asp.connect(destino);
}

/**
 * Voz de garganta: sierra grave con el tono temblando al azar y pulsos irregulares (carraspeo,
 * "vocal fry"), saturada y pasada por formantes medios. `f0` en Hz. Va a `destino`.
 */
function garganta(
  d: Disparo, t: number, dur: number, f0: number, rudeza: number,
  formantes: readonly (readonly [number, number])[], destino: AudioNode,
): void {
  const largo = dur + 0.02;
  const o = d.osc('sawtooth', f0, t, largo);
  deriva(d, t, largo, 14, f0 * 0.05 * rudeza, o.frequency);
  // Subarmónico: le da el peso de un cuerpo grande sin ser un zumbido limpio.
  const sub = d.osc('sawtooth', f0 * 0.5, t, largo);
  deriva(d, t, largo, 9, f0 * 0.03 * rudeza, sub.frequency);
  const gSub = d.ganancia(0.35);
  sub.connect(gSub);
  const pulsos = aspera(d, t, largo, 70, 0.55, 0.45 * rudeza);
  o.connect(pulsos);
  gSub.connect(pulsos);
  const sat = d.saturador(1.5 + 2 * rudeza);
  pulsos.connect(sat);
  for (const [f, q] of formantes) {
    const bp = d.filtro('bandpass', f, q);
    sat.connect(bp);
    bp.connect(destino);
  }
}

/** Gorgoteo: pulsos húmedos muy cortos, irregulares, que crecen y se apagan. Devuelve el fin. */
function gorgoteo(d: Disparo, t: number, dur: number, nivel: number, destino: AudioNode): number {
  const fc = azar(650, 1100);
  let tt = t;
  for (let k = 0; tt < t + dur && k < 40; k++) {
    const prog = (tt - t) / dur;
    const amp = nivel * Math.max(0.2, Math.sin(Math.PI * prog)) * azar(0.5, 1);
    rafaga(d, 'blanco', 'bandpass', variar(fc, 0.3), azar(2, 4), tt, 0.002, amp, azar(0.012, 0.03), destino);
    // Se acelera y se frena como líquido en la garganta.
    tt += azar(0.025, 0.08) * (1 + 0.6 * Math.sin(prog * 7 + azar(0, 1)));
  }
  // Aire húmedo debajo de los pulsos.
  const env = d.ganancia(0);
  const fin = d.sostenido(env.gain, t, dur * 0.2, nivel * 0.35, dur * 0.4, dur * 0.4);
  soplo(d, t, fin - t, [azar(350, 500), azar(300, 400)], [azar(900, 1200), azar(700, 900)], 1.6, 0.6, 0, env);
  env.connect(destino);
  return Math.max(tt, fin);
}

/** Chasquido seco (lengua, dientes, una articulación). Agudo: se ubica bien en 3D. Devuelve el fin. */
function clicSeco(d: Disparo, t: number, nivel: number, destino: AudioNode): number {
  const f1 = rafaga(d, 'blanco', 'bandpass', azar(2800, 4200), azar(2, 4), t, 0.0008, nivel, azar(0.005, 0.012), destino);
  const f2 = tono(d, 'triangle', azar(1700, 2600), t, 0.0008, nivel * 0.35, 0.008, destino, azar(900, 1300));
  const f3 = tono(d, 'sine', azar(260, 380), t, 0.001, nivel * 0.4, 0.02, destino, 150);
  return Math.max(f1, f2, f3);
}

// ───────────── Monstruo: sonidos ─────────────

/** Paso del monstruo: golpe pesado (talón y peso) y luego el pie que se arrastra. */
export function pasoMonstruo(s: Sintesis, destino: AudioNode, t: number, superficie: Superficie, rapido: boolean): Disparo {
  const d = s.disparo(destino, variar(rapido ? V.pasoMonstruoRapido : V.pasoMonstruo, 0.1));
  const k = rapido ? 0.7 : 1;
  tono(d, 'sine', variar(55, 0.08), t, 0.006, 1, 0.35 * k, d.salida, 32);
  // Cuerpo medio para que se ubique en 3D (el HRTF casi no localiza los graves puros).
  tono(d, 'sine', variar(120, 0.08), t, 0.004, 0.5, 0.15 * k, d.salida, 70);
  rafaga(d, 'cafe', 'lowpass', 700, 0.7, t, 0.004, 0.8, 0.25 * k, d.salida);
  // El peso del cuerpo cae un instante después del talón.
  const tPeso = t + azar(0.06, 0.1);
  tono(d, 'sine', variar(42, 0.08), tPeso, 0.01, 0.6, 0.3 * k, d.salida, 28);
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

  // Arrastre: el pie (o algo que cuelga) raspa el piso.
  const A = M.arrastre;
  if (!rapido || Math.random() < A.probRapido) {
    const t0 = tPeso + azar(0.02, 0.08);
    const dur = entre(A.seg) * (rapido ? 0.55 : 1);
    const env = d.ganancia(0);
    const fin = d.sostenido(env.gain, t0, dur * 0.25, A.nivel, dur * 0.3, dur * 0.45);
    const largo = fin - t0 + 0.02;
    const grano = aspera(d, t0, largo, 90, 1, 0.5);
    const src = d.ruido(superficie === 'madera' ? 'rosa' : 'blanco', t0, largo);
    const [fa, fb, q]: [number, number, number] =
      superficie === 'concreto' ? [azar(1400, 2000), azar(2400, 3200), 1.2]
      : superficie === 'madera' ? [azar(500, 700), azar(800, 1100), 1.8]
      : [azar(1600, 2000), azar(2200, 2800), 6];
    const bp = d.filtro('bandpass', fa, q);
    deslizar(bp.frequency, t0, fin - t0, fa, fb);
    src.connect(bp);
    bp.connect(grano);
    grano.connect(env);
    env.connect(d.salida);
  }
  return d;
}

/**
 * Patrulla: un respiro trabajoso. Inhala (a veces entrecortado), hueco, exhala húmedo y grave
 * (a veces con voz de garganta, a veces acaba en estertor). Duraciones al azar en cada uno.
 */
export function respiroPatrulla(s: Sintesis, destino: AudioNode, t: number): VozMonstruo {
  const P = M.patrulla;
  const d = s.disparo(destino, variar(V.respiroPatrulla, 0.15));
  let tt = t;

  // Inhala: aire que entra con esfuerzo; las formantes suben.
  const tirones = Math.random() < P.probInhalaEntrecortada ? (Math.random() < 0.5 ? 2 : 3) : 1;
  const segInhala = entre(P.segInhala);
  for (let i = 0; i < tirones; i++) {
    const dur = (segInhala / tirones) * azar(0.75, 1.2);
    const env = d.ganancia(0);
    const fin = d.sostenido(env.gain, tt, dur * 0.45, azar(0.4, 0.65), dur * 0.2, dur * 0.35);
    soplo(d, tt, fin - tt, [azar(550, 750), azar(1100, 1500)], [azar(1500, 1900), azar(2200, 2800)], 2.4, 0.3, 0.12, env);
    env.connect(d.salida);
    tt = fin + (i < tirones - 1 ? azar(0.04, 0.12) : 0);
  }

  // Exhala: más larga, más grave y más húmeda; las formantes bajan.
  tt += entre(P.segHueco);
  const segExhala = entre(P.segExhala);
  const env = d.ganancia(0);
  const ataque = segExhala * azar(0.1, 0.2);
  const sostener = segExhala * azar(0.2, 0.35);
  const fin = d.sostenido(env.gain, tt, ataque, azar(0.75, 1), sostener, Math.max(0.2, segExhala - ataque - sostener));
  soplo(d, tt, fin - tt, [azar(700, 950), azar(330, 450)], [azar(1500, 1900), azar(800, 1050)], 1.8, 0.5, 0.08, env);
  env.connect(d.salida);
  let finTotal = fin;

  if (Math.random() < P.probVozAlExhalar) {
    const gv = d.ganancia(0);
    const tv = tt + ataque * 0.5;
    const fv = d.sostenido(gv.gain, tv, ataque, azar(0.12, 0.25), sostener, Math.max(0.15, (fin - tv) - ataque - sostener));
    garganta(d, tv, fv - tv, azar(62, 95), 0.8, [[azar(450, 600), 2.5], [azar(1100, 1400), 3.5]], gv);
    gv.connect(d.salida);
    finTotal = Math.max(finTotal, fv);
  }
  if (Math.random() < P.probEstertorAlExhalar) {
    finTotal = Math.max(finTotal, gorgoteo(d, fin - azar(0.3, 0.5), azar(0.4, 0.8), 0.5, d.salida));
  }
  return { d, seg: finTotal - t };
}

/** Patrulla: estertor (gorgoteo húmedo en la garganta), suelto entre respiros. */
export function estertor(s: Sintesis, destino: AudioNode, t: number): VozMonstruo {
  const d = s.disparo(destino, variar(V.estertor, 0.15));
  const fin = gorgoteo(d, t, azar(0.5, 1.2), 0.6, d.salida);
  return { d, seg: fin - t };
}

/** Patrulla: castañeteo seco, como dientes o huesos (ráfaga irregular de clics). */
export function chasquidos(s: Sintesis, destino: AudioNode, t: number): VozMonstruo {
  const d = s.disparo(destino, variar(V.chasquidos, 0.15));
  const n = Math.floor(azar(3, 10));
  let tt = t;
  let fin = t;
  for (let i = 0; i < n; i++) {
    fin = Math.max(fin, clicSeco(d, tt, azar(0.5, 1), d.salida));
    tt += azar(0.028, 0.075) * (Math.random() < 0.15 ? 3 : 1);
  }
  return { d, seg: fin - t };
}

/** Patrulla: gemido grave, largo, con un vibrato que no se está quieto. */
export function gemido(s: Sintesis, destino: AudioNode, t: number): VozMonstruo {
  const d = s.disparo(destino, variar(V.gemido, 0.15));
  const dur = azar(1.4, 2.8);
  const env = d.ganancia(0);
  const fin = d.sostenido(env.gain, t, dur * 0.3, 1, dur * 0.3, dur * 0.4);
  const largo = fin - t + 0.02;
  const f0 = azar(90, 140);
  const o = d.osc('sawtooth', f0, t, largo);
  // Contorno: sube, se quiebra y cae (al azar).
  o.frequency.setValueAtTime(f0 * azar(0.85, 0.95), t);
  o.frequency.linearRampToValueAtTime(f0 * azar(1.05, 1.2), t + dur * azar(0.25, 0.45));
  o.frequency.linearRampToValueAtTime(f0 * azar(0.95, 1.05), t + dur * azar(0.5, 0.7));
  o.frequency.linearRampToValueAtTime(f0 * azar(0.7, 0.85), fin);
  // Vibrato inestable: uno lento que cambia de velocidad + temblor aleatorio.
  const vib = d.osc('sine', azar(4, 6.5), t, largo);
  vib.frequency.setValueAtTime(azar(3.5, 5), t);
  vib.frequency.linearRampToValueAtTime(azar(5.5, 8), fin);
  const prof = d.ganancia(f0 * 0.025);
  vib.connect(prof);
  prof.connect(o.frequency);
  deriva(d, t, largo, 6, f0 * 0.035, o.frequency);
  const pulsos = aspera(d, t, largo, 40, 0.8, 0.25);
  const sat = d.saturador(1.8);
  o.connect(pulsos);
  pulsos.connect(sat);
  // Vocal "o/u" que se abre un poco a la mitad.
  for (const [a, b, q] of [[380, 520, 5], [750, 950, 6], [2400, 2700, 8]] as const) {
    const bp = d.filtro('bandpass', a, q);
    deslizar(bp.frequency, t, dur, a, b);
    sat.connect(bp);
    bp.connect(env);
  }
  // Aire de la garganta encima del tono.
  const ga = d.ganancia(0.4);
  soplo(d, t, fin - t, [500, 400], [1300, 1000], 2, 0.4, 0.05, ga);
  ga.connect(env);
  env.connect(d.salida);
  return { d, seg: fin - t };
}

/** Escucha: olfateo corto, agudo (dos a cuatro jalones de aire por la nariz). */
export function olfateo(s: Sintesis, destino: AudioNode, t: number): VozMonstruo {
  const d = s.disparo(destino, variar(V.olfateo, 0.15));
  const n = Math.floor(azar(2, 5));
  let tt = t;
  let fin = t;
  for (let i = 0; i < n; i++) {
    const g = d.ganancia(0);
    const f = d.sostenido(g.gain, tt, azar(0.02, 0.04), azar(0.6, 1), azar(0.03, 0.06), azar(0.04, 0.08));
    const src = d.ruido('blanco', tt, f - tt + 0.02);
    const bp = d.filtro('bandpass', 2500, 1.4);
    deslizar(bp.frequency, tt, f - tt, azar(2200, 2800), azar(3500, 4500));
    src.connect(bp);
    bp.connect(g);
    g.connect(d.salida);
    fin = f;
    tt = f + azar(0.05, 0.14);
  }
  return { d, seg: fin - t };
}

/** Escucha: un clic aislado (o dos), seco. */
export function clic(s: Sintesis, destino: AudioNode, t: number): VozMonstruo {
  const d = s.disparo(destino, variar(V.clic, 0.15));
  let fin = clicSeco(d, t, 1, d.salida);
  if (Math.random() < 0.35) fin = clicSeco(d, t + azar(0.09, 0.2), azar(0.5, 0.8), d.salida);
  return { d, seg: fin - t };
}

/** Caza: un jadeo (inhala-exhala corto y agresivo), a veces con gruñido en la exhalación. */
export function jadeo(s: Sintesis, destino: AudioNode, t: number): VozMonstruo {
  const d = s.disparo(destino, variar(V.jadeo, 0.15));
  // Inhala corto y raspado.
  const g1 = d.ganancia(0);
  const durIn = azar(0.1, 0.18);
  const f1 = d.sostenido(g1.gain, t, durIn * 0.5, azar(0.45, 0.65), durIn * 0.1, durIn * 0.4);
  soplo(d, t, f1 - t, [azar(800, 1000), azar(1300, 1600)], [azar(1900, 2300), azar(2600, 3000)], 2.2, 0.45, 0.15, g1);
  g1.connect(d.salida);
  // Exhala con fuerza.
  const t2 = f1 + azar(0.01, 0.05);
  const durEx = azar(0.16, 0.3);
  const g2 = d.ganancia(0);
  const f2 = d.sostenido(g2.gain, t2, 0.03, azar(0.8, 1), durEx * 0.35, durEx * 0.65);
  soplo(d, t2, f2 - t2, [azar(900, 1100), azar(500, 650)], [azar(1800, 2200), azar(1100, 1400)], 1.8, 0.6, 0.12, g2);
  if (Math.random() < 0.55) {
    const gv = d.ganancia(0);
    d.sostenido(gv.gain, t2, 0.03, azar(0.2, 0.35), durEx * 0.3, durEx * 0.6);
    garganta(d, t2, f2 - t2, azar(75, 110), 1, [[azar(500, 650), 2.5], [azar(1200, 1500), 3]], gv);
    gv.connect(d.salida);
  }
  g2.connect(d.salida);
  return { d, seg: f2 - t };
}

/** Caza: gruñido gutural, áspero y con medios (no un zumbido grave limpio). */
export function grunido(s: Sintesis, destino: AudioNode, t: number): VozMonstruo {
  const d = s.disparo(destino, variar(V.grunido, 0.15));
  const dur = azar(0.9, 1.8);
  const env = d.ganancia(0);
  // Crece, se tensa a media frase y se suelta.
  const ataque = azar(0.08, 0.2);
  const tMedio = t + ataque + (dur - ataque) * azar(0.3, 0.6);
  const fin = t + dur;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(azar(0.6, 0.8), t + ataque);
  env.gain.linearRampToValueAtTime(1, tMedio);
  env.gain.linearRampToValueAtTime(azar(0.5, 0.7), Math.max(tMedio + 0.02, fin - 0.25));
  env.gain.linearRampToValueAtTime(0, fin);
  const f0 = azar(70, 100);
  const cuerpo = d.ganancia(1);
  garganta(d, t, dur, f0, 1.2, [[azar(380, 480), 2], [azar(900, 1200), 3], [azar(2100, 2600), 4]], cuerpo);
  // Algo de grave para el peso (poco: el grave solo era lo que sonaba a gato).
  const o = d.osc('sawtooth', f0, t, dur + 0.02);
  deriva(d, t, dur + 0.02, 14, f0 * 0.06, o.frequency);
  const lp = d.filtro('lowpass', 300, 0.7);
  const gGrave = d.ganancia(0.25);
  o.connect(lp);
  lp.connect(gGrave);
  gGrave.connect(cuerpo);
  // Aire raspando encima.
  const ga = d.ganancia(0.5);
  soplo(d, t, dur, [700, 500], [1600, 1200], 1.6, 0.6, 0.1, ga);
  ga.connect(cuerpo);
  cuerpo.connect(env);
  env.connect(d.salida);
  return { d, seg: dur };
}

/**
 * Caza (al empezar): alarido disonante. Cúmulo de sierras desafinadas (segunda menor y tritono)
 * más ruido, con barrido de tono hacia arriba y caída, saturado y por formantes de grito.
 */
export function alarido(s: Sintesis, destino: AudioNode, t: number): VozMonstruo {
  const d = s.disparo(destino, variar(V.alarido, 0.1));
  const dur = azar(1.2, 1.7);
  const env = d.ganancia(0);
  const fin = d.sostenido(env.gain, t, 0.04, 1, dur - 0.55, 0.5);
  const largo = fin - t + 0.02;
  const f = azar(380, 470);
  const sat = d.saturador(3);
  const pico = t + azar(0.18, 0.3);
  for (const r of [1, 1.059, 0.97, 1.414, 2.03]) {
    const o = d.osc('sawtooth', f * r, t, largo);
    o.frequency.setValueAtTime(f * r * 0.6, t);
    o.frequency.exponentialRampToValueAtTime(f * r * azar(1.25, 1.4), pico);
    o.frequency.linearRampToValueAtTime(f * r * azar(1.05, 1.15), pico + (fin - pico) * 0.5);
    o.frequency.exponentialRampToValueAtTime(f * r * azar(0.55, 0.7), fin);
    deriva(d, t, largo, 18, f * r * 0.025, o.frequency);
    const g = d.ganancia(r > 1.9 ? 0.3 : 0.5);
    o.connect(g);
    g.connect(sat);
  }
  // Aire del grito.
  const ruido = d.ruido('blanco', t, largo);
  const bpR = d.filtro('bandpass', 2500, 0.8);
  const gR = d.ganancia(0.5);
  ruido.connect(bpR);
  bpR.connect(gR);
  gR.connect(sat);
  const rasgado = aspera(d, t, largo, 60, 1, 0.3);
  sat.connect(rasgado);
  for (const [a, b, q, n] of [[900, 1200, 3, 1], [2200, 2600, 4, 0.8], [3400, 3800, 5, 0.5]] as const) {
    const bp = d.filtro('bandpass', a, q);
    deslizar(bp.frequency, t, fin - t, a, b);
    const g = d.ganancia(n);
    rasgado.connect(bp);
    bp.connect(g);
    g.connect(env);
  }
  env.connect(d.salida);
  return { d, seg: fin - t };
}

/** Estática al ser atrapado (no 3D). */
export function estatica(s: Sintesis, destino: AudioNode, t: number, dur: number): Disparo {
  const d = s.disparo(destino, V.estaticaAtrapa);
  const env = d.ganancia(0);
  const fin = d.sostenido(env.gain, t, 0.01, 1, Math.max(0, dur - 0.4), 0.39);
  const largo = fin - t + 0.02;
  // Crepitar irregular (antes era un LFO cuadrado fijo: sonaba a zumbido).
  const crepita = aspera(d, t, largo, 220, 0.6, 0.35);
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

/**
 * Grito del monstruo al atrapar (en la cabeza): golpe grave seco + cúmulo disonante (segunda menor
 * y tritono) con temblor aleatorio y aire. Breve y sin nada explícito.
 */
export function grito(s: Sintesis, destino: AudioNode, t: number): Disparo {
  const d = s.disparo(destino, V.grito);
  // Golpe: lo que hace saltar (grave, sin saturar la mezcla).
  tono(d, 'sine', 70, t, 0.003, 1.2, 0.35, d.salida, 32);
  rafaga(d, 'rosa', 'lowpass', 1200, 0.7, t, 0.002, 0.8, 0.12, d.salida);
  const env = d.ganancia(0);
  const fin = d.sostenido(env.gain, t, 0.03, 1, 0.8, 0.35);
  const largo = fin - t + 0.02;
  const sat = d.saturador(2.5);
  const f1 = d.filtro('bandpass', 1100, 2);
  const f2 = d.filtro('bandpass', 2600, 3);
  const f3 = d.filtro('bandpass', 3800, 4);
  const g3 = d.ganancia(0.5);
  for (const f of [620, 657, 877, 1240]) {
    const o = d.osc('sawtooth', f, t, largo);
    o.frequency.setValueAtTime(f * 0.8, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.12);
    o.frequency.linearRampToValueAtTime(f * 1.1, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(f * 0.65, fin);
    deriva(d, t, largo, 16, f * 0.03, o.frequency);
    o.connect(sat);
  }
  const aire = d.ruido('blanco', t, largo);
  const bpA = d.filtro('bandpass', 2200, 0.8);
  const gA = d.ganancia(0.6);
  aire.connect(bpA);
  bpA.connect(gA);
  gA.connect(sat);
  sat.connect(f1);
  sat.connect(f2);
  sat.connect(f3);
  f1.connect(env);
  f2.connect(env);
  f3.connect(g3);
  g3.connect(env);
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
