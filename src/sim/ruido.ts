/**
 * Medidor de ruido (DISENO.md §5.1). Combina el micrófono con el ruido de dentro del juego.
 * Lógica pura.
 */
import type { Config } from '../config';
import type { ZonaRuido } from '../shared/contratos';

const NIVEL_MIN = 0;
const NIVEL_MAX = 1;

function acotar(v: number): number {
  if (!Number.isFinite(v)) return NIVEL_MIN;
  return Math.min(NIVEL_MAX, Math.max(NIVEL_MIN, v));
}

export class MedidorRuido {
  /** Último nivel que mandó el micrófono (0 a 1). */
  private microfono = NIVEL_MIN;
  /** Ruido del juego: sube con los eventos (pasos corriendo, choques, portazos) y baja solo. */
  private juego = NIVEL_MIN;

  constructor(private readonly config: Config['ruido']) {}

  fijarMicrofono(nivel: number): void {
    this.microfono = acotar(nivel);
  }

  /** Suma el ruido de un evento del juego (con tope en 1). */
  sumar(cantidad: number): void {
    this.juego = acotar(this.juego + cantidad);
  }

  /** El ruido del juego cae `caidaPorSeg` por segundo. El del micrófono no: es el último medido. */
  actualizar(dtSeg: number): void {
    this.juego = acotar(this.juego - this.config.caidaPorSeg * dtSeg);
  }

  reiniciar(): void {
    this.microfono = NIVEL_MIN;
    this.juego = NIVEL_MIN;
  }

  get nivel(): number {
    return Math.max(this.microfono, this.juego);
  }

  get zona(): ZonaRuido {
    const n = this.nivel;
    if (n >= this.config.umbralPeligro) return 'peligro';
    if (n >= this.config.umbralCuidado) return 'cuidado';
    return 'silencio';
  }
}
