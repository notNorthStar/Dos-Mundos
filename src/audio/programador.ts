/**
 * Programador de bucles: en cada `tick` agenda, con un poco de adelanto sobre el reloj de audio,
 * los eventos que tocan (un respiro, un latido, un pitido). Así el ritmo puede cambiar en cada
 * evento (el latido se acelera) y un bucle se apaga simplemente dejando de agendar.
 */
import { AJUSTES_AUDIO } from './ajustes';

export class Programador {
  /** Hora de audio del próximo evento; −1 = parado. */
  private proximo = -1;

  /** `disparar(t)` agenda un evento en `t` y devuelve los segundos hasta el siguiente. */
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly disparar: (t: number) => number,
  ) {}

  get activo(): boolean {
    return this.proximo >= 0;
  }

  /** Arranca si estaba parado (el primer evento suena tras `retraso`). */
  arrancar(retraso = 0): void {
    if (this.proximo < 0) this.proximo = this.ctx.currentTime + retraso;
  }

  /** Vuelve a empezar la cuenta aunque ya estuviera andando. */
  reiniciar(retraso = 0): void {
    this.proximo = this.ctx.currentTime + retraso;
  }

  parar(): void {
    this.proximo = -1;
  }

  tick(): void {
    if (this.proximo < 0) return;
    const P = AJUSTES_AUDIO.programador;
    const ahora = this.ctx.currentTime;
    // Pestaña en segundo plano o pausa larga: no se pone al día de golpe.
    if (this.proximo < ahora - P.segAtrasoMax) this.proximo = ahora + 0.05;
    let guardia = 0;
    while (this.proximo >= 0 && this.proximo < ahora + P.segAdelanto && guardia++ < 8) {
      const t = Math.max(this.proximo, ahora);
      const intervalo = this.disparar(t);
      if (this.proximo < 0) break; // `disparar` lo paró
      this.proximo = t + Math.max(0.05, intervalo);
    }
  }
}
