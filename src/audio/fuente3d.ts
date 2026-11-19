/**
 * Una fuente de sonido en el mundo:
 *
 *   entrada (volumen) ─▶ pasa-bajas (oclusión) ─▶ atenuación (oclusión) ─▶ panner HRTF ─┬─▶ seco
 *                                                                                      └─▶ envío reverb
 *
 * Coordenadas del mundo: x este, z sur, y arriba (iguales a las de WebAudio con el norte en −z).
 */
import { CONFIG } from '../config';
import type { Punto } from '../shared/contratos';
import { AJUSTES_AUDIO } from './ajustes';

export class FuenteEspacial {
  /** Aquí se conectan los sonidos. Su ganancia es el volumen de la fuente (para fundidos). */
  readonly entrada: GainNode;
  private readonly filtro: BiquadFilterNode;
  private readonly atenuacion: GainNode;
  private readonly panner: PannerNode;
  private ocluida: boolean | null = null;
  private destruida = false;
  /** Última posición pedida (en el plano). */
  pos: Punto;

  constructor(
    private readonly ctx: AudioContext,
    seco: AudioNode,
    envioReverb: AudioNode,
    pos: Punto,
    private readonly altura: number,
    volumen = 1,
  ) {
    this.pos = { x: pos.x, z: pos.z };
    this.entrada = ctx.createGain();
    this.entrada.gain.value = volumen;

    this.filtro = ctx.createBiquadFilter();
    this.filtro.type = 'lowpass';
    this.filtro.Q.value = 0.7;
    this.filtro.frequency.value = AJUSTES_AUDIO.oclusion.hzAbierto;

    this.atenuacion = ctx.createGain();
    this.atenuacion.gain.value = 1;

    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = CONFIG.audio.distanciaRef;
    p.maxDistance = CONFIG.audio.distanciaMax;
    p.rolloffFactor = CONFIG.audio.rolloff;
    this.panner = p;
    this.colocar(pos, true);

    this.entrada.connect(this.filtro);
    this.filtro.connect(this.atenuacion);
    this.atenuacion.connect(p);
    p.connect(seco);
    p.connect(envioReverb);
  }

  /** Mueve la fuente (suave salvo que `inmediato`). */
  colocar(pos: Punto, inmediato = false): void {
    if (this.destruida) return;
    if (!inmediato && Math.abs(pos.x - this.pos.x) < 0.001 && Math.abs(pos.z - this.pos.z) < 0.001) return;
    this.pos = { x: pos.x, z: pos.z };
    const p = this.panner;
    const ahora = this.ctx.currentTime;
    const tau = AJUSTES_AUDIO.suavizado.tauFuente;
    if (p.positionX) {
      const fijar = (param: AudioParam, v: number) => {
        if (inmediato) {
          param.cancelScheduledValues(ahora);
          param.setValueAtTime(v, ahora);
        } else param.setTargetAtTime(v, ahora, tau);
      };
      fijar(p.positionX, pos.x);
      fijar(p.positionY, this.altura);
      fijar(p.positionZ, pos.z);
    } else {
      // Navegadores sin AudioParam de posición.
      (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, this.altura, pos.z);
    }
  }

  /** Pared entre la fuente y Oído: graves y algo más bajo. Sin saltos salvo que `inmediato`. */
  fijarOclusion(ocluida: boolean, inmediato = false): void {
    if (this.destruida || (ocluida === this.ocluida && !inmediato)) return;
    this.ocluida = ocluida;
    const A = AJUSTES_AUDIO.oclusion;
    const hz = ocluida ? CONFIG.audio.hzOclusion : A.hzAbierto;
    const g = ocluida ? A.ganancia : 1;
    const ahora = this.ctx.currentTime;
    for (const [param, v] of [
      [this.filtro.frequency, hz],
      [this.atenuacion.gain, g],
    ] as const) {
      param.cancelScheduledValues(ahora);
      if (inmediato) param.setValueAtTime(v, ahora);
      else {
        param.setValueAtTime(param.value, ahora);
        param.setTargetAtTime(v, ahora, A.tau);
      }
    }
  }

  /** Fundido del volumen de la fuente. */
  fundir(volumen: number, tau: number): void {
    if (this.destruida) return;
    const ahora = this.ctx.currentTime;
    const p = this.entrada.gain;
    p.cancelScheduledValues(ahora);
    p.setValueAtTime(p.value, ahora);
    p.setTargetAtTime(volumen, ahora, tau);
  }

  destruir(): void {
    if (this.destruida) return;
    this.destruida = true;
    this.entrada.disconnect();
    this.filtro.disconnect();
    this.atenuacion.disconnect();
    this.panner.disconnect();
  }
}
