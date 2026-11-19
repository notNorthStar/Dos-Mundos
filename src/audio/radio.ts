/**
 * El radio del lado de Oído: cola de mensajes, chasquidos, estática con filtro de banda y ducking.
 *
 *   ruido blanco ─▶ pasa-altas 300 ─▶ pasa-bajas 3000 ─▶ aleteo ─▶ ganancia ─▶ mezcla.radio
 *
 * La voz la produce `VozRadio` (hoy speechSynthesis, fuera de WebAudio). Garantías:
 *  - Un mensaje a la vez; las emergencias interrumpen (voz.callar()) y pasan primero.
 *  - Si la voz nunca avisa que terminó, un tope de tiempo la da por terminada.
 *  - La mezcla siempre se suelta al vaciarse la cola, al limpiar o si algo falla.
 */
import type { VozRadio } from '../shared/contratos';
import { AJUSTES_AUDIO } from './ajustes';
import type { Mezcla } from './mezcla';
import type { Sintesis } from './nucleo';
import { chasquido } from './sonidos';

const R = AJUSTES_AUDIO.radio;

export interface ItemRadio {
  texto: string;
  emergencia: boolean;
  /** true = mensaje de Vista (chasquidos y estática); false = narración (solo la voz). */
  radio: boolean;
}

export class ColaRadio {
  private cola: ItemRadio[] = [];
  private ocupado = false;
  private generacion = 0;
  /** Esperas en curso que se pueden cortar (interrupción o limpieza). */
  private readonly esperas = new Set<() => void>();
  private estatica: { src: AudioBufferSourceNode; nodos: AudioNode[]; g: GainNode } | null = null;
  private destruida = false;

  constructor(
    private readonly s: Sintesis,
    private readonly mezcla: Mezcla,
    private readonly voz: VozRadio,
  ) {}

  encolar(item: ItemRadio): void {
    if (this.destruida || item.texto.trim() === '') return;
    if (item.emergencia) {
      this.cola.unshift(item);
      if (this.ocupado) {
        this.voz.callar();
        this.cortarEsperas();
      }
    } else {
      this.cola.push(item);
      // Si se acumulan demasiados, se descartan los más viejos (no emergencias).
      while (this.cola.length > R.maxCola) {
        const i = this.cola.findIndex((m) => !m.emergencia);
        this.cola.splice(i >= 0 ? i : 0, 1);
      }
    }
    void this.procesar();
  }

  /** Vacía la cola, calla la voz y suelta la mezcla. */
  limpiar(): void {
    this.generacion++;
    this.cola = [];
    this.voz.callar();
    this.cortarEsperas();
    this.cerrarEstatica();
    this.mezcla.agachar(1);
  }

  destruir(): void {
    this.limpiar();
    this.destruida = true;
  }

  private async procesar(): Promise<void> {
    if (this.ocupado || this.destruida) return;
    this.ocupado = true;
    const gen = this.generacion;
    try {
      while (this.cola.length > 0 && gen === this.generacion && !this.destruida) {
        const item = this.cola.shift()!;
        this.mezcla.agachar(item.radio ? R.ducking : R.duckingNarracion);
        await this.reproducir(item, gen);
      }
    } catch (e) {
      console.warn('[audio] Falló un mensaje del radio:', e);
    } finally {
      this.ocupado = false;
      this.cerrarEstatica();
      if (this.cola.length > 0 && !this.destruida) void this.procesar();
      else this.mezcla.agachar(1);
    }
  }

  private async reproducir(item: ItemRadio, gen: number): Promise<void> {
    const ctx = this.s.ctx;
    try {
      if (item.radio) {
        chasquido(this.s, this.mezcla.radio, ctx.currentTime, R.volumenChasquido);
        this.abrirEstatica();
        await this.esperar(R.segAntesVoz);
        if (gen !== this.generacion) return;
      }
      const tope = Math.max(R.segMinVoz, item.texto.length * R.segPorCaracter + R.segMargenVoz);
      let decir: Promise<void>;
      try {
        decir = Promise.resolve(this.voz.decir(item.texto)).catch(() => undefined);
      } catch {
        decir = Promise.resolve();
      }
      await Promise.race([decir, this.esperar(tope)]);
    } finally {
      if (item.radio) {
        this.cerrarEstatica();
        if (gen === this.generacion && !this.destruida) {
          chasquido(this.s, this.mezcla.radio, ctx.currentTime, R.volumenChasquido);
          await this.esperar(R.segDespuesVoz);
        }
      }
    }
  }

  /** Espera `seg` segundos; termina antes si se cortan las esperas. */
  private esperar(seg: number): Promise<void> {
    return new Promise((resolver) => {
      const fin = () => {
        window.clearTimeout(id);
        this.esperas.delete(fin);
        resolver();
      };
      const id = window.setTimeout(fin, seg * 1000);
      this.esperas.add(fin);
    });
  }

  private cortarEsperas(): void {
    for (const fin of [...this.esperas]) fin();
  }

  private abrirEstatica(): void {
    if (this.estatica) return;
    const ctx = this.s.ctx;
    const ahora = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.s.buffer('blanco');
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = R.hzBajo;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = R.hzAlto;
    // Aleteo de la señal: la ganancia oscila un poco (siempre positiva: 0.7 ± 0.3).
    const aleteo = ctx.createGain();
    aleteo.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.5;
    const prof = ctx.createGain();
    prof.gain.value = 0.3;
    lfo.connect(prof);
    prof.connect(aleteo.gain);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(aleteo);
    aleteo.connect(g);
    g.connect(this.mezcla.radio);
    g.gain.setValueAtTime(0, ahora);
    g.gain.linearRampToValueAtTime(R.volumenEstatica, ahora + 0.05);
    src.start(ahora, Math.random());
    lfo.start(ahora);
    const nodos: AudioNode[] = [src, hp, lp, aleteo, lfo, prof, g];
    // El oscilador se detiene junto con la fuente.
    src.onended = () => {
      try {
        lfo.stop();
      } catch {
        // ya detenido
      }
      for (const n of nodos) n.disconnect();
    };
    this.estatica = { src, nodos, g };
  }

  private cerrarEstatica(): void {
    const e = this.estatica;
    if (!e) return;
    this.estatica = null;
    const ahora = this.s.ctx.currentTime;
    e.g.gain.cancelScheduledValues(ahora);
    e.g.gain.setValueAtTime(e.g.gain.value, ahora);
    e.g.gain.linearRampToValueAtTime(0, ahora + 0.04);
    try {
      e.src.stop(ahora + 0.06);
    } catch {
      // ya detenida
    }
  }
}
