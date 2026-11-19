/**
 * Movimiento de Oído: pasos de 1 m con colisión, giros de 90° animados y giro fino.
 * Lógica pura (docs/CONTRATOS.md §2 y §5).
 */
import type { Config } from '../config';
import type { Mapa, Punto } from '../shared/contratos';
import { chocaCirculo, cuartoEn, normalizarRumbo, vectorDeRumbo, type Puertas } from '../shared/mapaUtil';
import type { AjustesSim } from './ajustes';
import type { MedidorRuido } from './ruido';
import type { Emisor } from './tipos';

const MEDIA_VUELTA = 180;

interface PasoEnCurso {
  desde: Punto;
  hacia: Punto;
  /** 0 a 1. */
  progreso: number;
  /** Duración total de este paso en segundos. */
  seg: number;
  corriendo: boolean;
}

interface GiroEnCurso {
  /** Rumbo al empezar (sin normalizar: el giro fino lo desplaza durante la animación). */
  desde: number;
  /** Grados con signo que hay que girar. */
  delta: number;
  progreso: number;
}

export class MovimientoOido {
  pos: Punto;
  rumbo: number;
  private paso: PasoEnCurso | null = null;
  private giro: GiroEnCurso | null = null;

  constructor(
    private readonly mapa: Mapa,
    private readonly config: Config,
    private readonly ajustes: AjustesSim,
    private readonly ruido: MedidorRuido,
    private readonly emitir: Emisor,
  ) {
    this.pos = { ...mapa.inicioOido.pos };
    this.rumbo = normalizarRumbo(mapa.inicioOido.rumbo);
  }

  /** true mientras dura la animación de un paso o de un giro de 90°. */
  get moviendose(): boolean {
    return this.paso !== null || this.giro !== null;
  }

  /** true solo durante un paso dado corriendo. */
  get corriendo(): boolean {
    return this.paso?.corriendo ?? false;
  }

  /** Punto donde terminará el paso en curso (o null si no hay paso). */
  get destino(): Punto | null {
    return this.paso ? { ...this.paso.hacia } : null;
  }

  /**
   * Un paso de `metrosPorPaso` hacia el rumbo (o en reversa). Se ignora si hay un paso o un giro
   * en curso. Si el paso completo no cabe, avanza hasta donde quepa; si no cabe casi nada
   * (menos de `avanceMinimo`), no se mueve y anuncia `sim/choque`.
   */
  mover(dir: 'adelante' | 'atras', corriendo: boolean, puertas: Puertas): void {
    if (this.moviendose) return;
    const cfg = this.config.movimiento;
    const rumboAvance = dir === 'adelante' ? this.rumbo : normalizarRumbo(this.rumbo + MEDIA_VUELTA);
    const v = vectorDeRumbo(rumboAvance);
    const libre = this.metrosLibres(v, puertas);

    if (libre < this.ajustes.avanceMinimo) {
      this.ruido.sumar(this.config.ruido.porChoque);
      // El rumbo del choque es hacia donde está el obstáculo (detrás, si iba en reversa).
      this.emitir('sim/choque', { pos: { ...this.pos }, rumbo: rumboAvance });
      return;
    }

    const segPaso = corriendo ? cfg.segPorPasoCorriendo : cfg.segPorPaso;
    this.paso = {
      desde: { ...this.pos },
      hacia: { x: this.pos.x + v.x * libre, z: this.pos.z + v.z * libre },
      progreso: 0,
      // Un paso recortado dura en proporción a lo que avanza.
      seg: segPaso * (libre / cfg.metrosPorPaso),
      corriendo,
    };
  }

  /** Giro animado de `gradosPorGiro`. Se ignora si hay un paso o un giro en curso. */
  girar(sentido: 'izq' | 'der'): void {
    if (this.moviendose) return;
    const grados = this.config.movimiento.gradosPorGiro;
    this.giro = { desde: this.rumbo, delta: sentido === 'der' ? grados : -grados, progreso: 0 };
  }

  /** Giro fino (mouse): se aplica al instante, también en medio de un paso o de un giro. */
  girarFino(grados: number): void {
    if (!Number.isFinite(grados)) return;
    if (this.giro) this.giro.desde += grados;
    this.rumbo = normalizarRumbo(this.rumbo + grados);
  }

  actualizar(dtSeg: number): void {
    if (this.giro) {
      const g = this.giro;
      g.progreso += dtSeg / this.config.movimiento.segPorGiro;
      if (g.progreso >= 1) {
        this.rumbo = normalizarRumbo(g.desde + g.delta);
        this.giro = null;
      } else {
        this.rumbo = normalizarRumbo(g.desde + g.delta * g.progreso);
      }
    }

    if (this.paso) {
      const p = this.paso;
      p.progreso += dtSeg / p.seg;
      if (p.progreso >= 1) {
        this.pos = { ...p.hacia };
        this.paso = null;
        if (p.corriendo) this.ruido.sumar(this.config.ruido.porPasoCorriendo);
        this.emitir('sim/paso', {
          pos: { ...this.pos },
          superficie: cuartoEn(this.mapa, this.pos).superficie,
          corriendo: p.corriendo,
        });
      } else {
        this.pos = {
          x: p.desde.x + (p.hacia.x - p.desde.x) * p.progreso,
          z: p.desde.z + (p.hacia.z - p.desde.z) * p.progreso,
        };
      }
    }
  }

  /** Metros que Oído puede avanzar en la dirección `v` sin tocar pared (de 0 a `metrosPorPaso`). */
  private metrosLibres(v: Punto, puertas: Puertas): number {
    const metros = this.config.movimiento.metrosPorPaso;
    const n = Math.max(1, Math.round(metros / this.ajustes.precisionBarrido));
    let libre = 0;
    for (let i = 1; i <= n; i++) {
      const d = (metros * i) / n;
      const p = { x: this.pos.x + v.x * d, z: this.pos.z + v.z * d };
      if (chocaCirculo(this.mapa, puertas, p, this.ajustes.radioOido)) break;
      libre = d;
    }
    return libre;
  }
}
