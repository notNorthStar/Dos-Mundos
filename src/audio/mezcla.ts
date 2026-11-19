/**
 * La mezcla de Oído: buses, reverberación por cuarto, ducking del radio y la cadena final
 * (ganancia maestra → compresor → limitador → salida).
 *
 *   fuentes 3D ──┬──────────────▶ seco ──────────┐
 *                └─▶ envioReverb ─┬─▶ [chico]   ─┤
 *   cabeza ──┬─▶ seco             ├─▶ [mediano] ─┼─▶ retornoReverb ─┐
 *            └─▶ envioCabeza ─────┴─▶ [pasillo] ─┘                  │
 *   interno (latido) ─────────────────────────────────────────────┐ │
 *                                     seco ─────────────────────┐ │ │
 *                                                               ▼ ▼ ▼
 *                                                     juego (ducking) ──┐
 *   radio ──────────────────────────────────────────────────────────────┼─▶ maestro ─▶ compresor ─▶ limitador ─▶ destino
 */
import { CONFIG } from '../config';
import { AJUSTES_AUDIO, type TipoReverb } from './ajustes';
import { generarImpulso } from './nucleo';

const TIPOS: TipoReverb[] = ['chico', 'mediano', 'pasillo'];

export interface Mezcla {
  /** Entrada de las fuentes 3D (seco). */
  readonly seco: GainNode;
  /** Envío común a la reverberación del cuarto actual. */
  readonly envioReverb: GainNode;
  /** Sonidos en la cabeza de Oído (pisadas, golpe, objetos en la mano): seco + algo de reverb. */
  readonly cabeza: GainNode;
  /** Sonidos internos sin reverb (latido). */
  readonly interno: GainNode;
  /** El radio: no se agacha con el ducking. */
  readonly radio: GainNode;
  /** Elige la reverberación (con fundido). */
  fijarReverb(tipo: TipoReverb, inmediato?: boolean): void;
  /** Ducking: `nivel` < 1 agacha el juego; 1 lo suelta. */
  agachar(nivel: number): void;
  /** Silencia (o devuelve) toda la salida con un fundido. */
  silenciar(silencio: boolean): void;
  destruir(): void;
}

function compresor(ctx: AudioContext, op: { umbralDb: number; rodillaDb: number; proporcion: number; ataque: number; liberacion: number }): DynamicsCompressorNode {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = op.umbralDb;
  c.knee.value = op.rodillaDb;
  c.ratio.value = op.proporcion;
  c.attack.value = op.ataque;
  c.release.value = op.liberacion;
  return c;
}

export function crearMezcla(ctx: AudioContext): Mezcla {
  const A = AJUSTES_AUDIO;
  const nodos: AudioNode[] = [];
  const gan = (v: number): GainNode => {
    const g = ctx.createGain();
    g.gain.value = v;
    nodos.push(g);
    return g;
  };

  // Cadena final.
  const maestro = gan(CONFIG.audio.volumenGeneral);
  const comp = compresor(ctx, A.mezcla.compresor);
  const lim = compresor(ctx, A.mezcla.limitador);
  nodos.push(comp, lim);
  maestro.connect(comp);
  comp.connect(lim);
  lim.connect(ctx.destination);

  // Juego (se agacha cuando habla el radio).
  const juego = gan(1);
  juego.connect(maestro);
  const radio = gan(1);
  radio.connect(maestro);

  const seco = gan(1);
  seco.connect(juego);
  const interno = gan(1);
  interno.connect(juego);

  // Reverberación: un convolver por tipo, con su envío propio para hacer el fundido.
  const envioReverb = gan(A.reverb.envioFuentes);
  const retornoReverb = gan(1);
  retornoReverb.connect(juego);
  const envios = {} as Record<TipoReverb, GainNode>;
  for (const tipo of TIPOS) {
    const op = A.reverb.tipos[tipo];
    const envio = gan(0);
    const conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = generarImpulso(ctx, op);
    nodos.push(conv);
    const nivel = gan(op.nivel);
    envioReverb.connect(envio);
    envio.connect(conv);
    conv.connect(nivel);
    nivel.connect(retornoReverb);
    envios[tipo] = envio;
  }

  const cabeza = gan(1);
  cabeza.connect(seco);
  const envioCabeza = gan(A.reverb.envioCabeza);
  cabeza.connect(envioCabeza);
  // Pasa también por la ganancia del envío común (envioCabeza × envioFuentes).
  envioCabeza.connect(envioReverb);

  let tipoActual: TipoReverb | null = null;

  return {
    seco,
    envioReverb,
    cabeza,
    interno,
    radio,
    fijarReverb(tipo, inmediato = false) {
      if (tipo === tipoActual && !inmediato) return;
      tipoActual = tipo;
      const ahora = ctx.currentTime;
      for (const t of TIPOS) {
        const p = envios[t].gain;
        const objetivo = t === tipo ? 1 : 0;
        p.cancelScheduledValues(ahora);
        if (inmediato) p.setValueAtTime(objetivo, ahora);
        else {
          p.setValueAtTime(p.value, ahora);
          p.setTargetAtTime(objetivo, ahora, A.reverb.tauFundido);
        }
      }
    },
    agachar(nivel) {
      const ahora = ctx.currentTime;
      const p = juego.gain;
      p.cancelScheduledValues(ahora);
      p.setValueAtTime(p.value, ahora);
      p.setTargetAtTime(nivel, ahora, nivel < 1 ? A.radio.tauAgachar : A.radio.tauSoltar);
    },
    silenciar(silencio) {
      const ahora = ctx.currentTime;
      const p = maestro.gain;
      p.cancelScheduledValues(ahora);
      p.setValueAtTime(p.value, ahora);
      p.setTargetAtTime(silencio ? 0 : CONFIG.audio.volumenGeneral, ahora, A.mezcla.tauCorte);
    },
    destruir() {
      for (const n of nodos) n.disconnect();
    },
  };
}
