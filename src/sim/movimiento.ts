/**
 * Movimiento de Oído, de tablero: vive en centros de casilla, un paso = exactamente una casilla
 * (hacia el rumbo o en reversa) y el cuerpo gira de 90° en 90°. El mouse solo gira la cabeza.
 * Lógica pura (docs/CONTRATOS.md §2 y §5).
 */
import type { Config } from '../config';
import type { Casilla, Mapa, Punto } from '../shared/contratos';
import { casillaDe, centroDe, cuartoEn, esPared, normalizarRumbo, vectorDeRumbo, type Puertas } from '../shared/mapaUtil';
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
  /** Rumbo al empezar (siempre múltiplo de 90). */
  desde: number;
  /** Grados con signo que hay que girar. */
  delta: number;
  progreso: number;
}

export class MovimientoOido {
  pos: Punto;
  /** Rumbo del cuerpo: en reposo siempre 0, 90, 180 o 270. */
  rumbo: number;
  /** Giro de la cabeza respecto al cuerpo (+ = derecha), acotado por `gradosCabezaMax`. */
  cabeza = 0;
  /**
   * Segundos desde que terminó el último paso o giro (o desde el último choque). Mientras se
   * mueve vale 0. La simulación lo usa para saber si Oído está escondido (quieto).
   */
  segQuieto = Number.POSITIVE_INFINITY;

  private paso: PasoEnCurso | null = null;
  private giro: GiroEnCurso | null = null;
  /** true mientras la cabeza vuelve sola al frente. */
  private recentrando = false;
  /** Segundos desde el último `sim/choque` (para no repetirlo con la tecla sostenida). */
  private segDesdeChoque = Number.POSITIVE_INFINITY;

  constructor(
    private readonly mapa: Mapa,
    private readonly config: Config,
    private readonly ajustes: AjustesSim,
    private readonly ruido: MedidorRuido,
    private readonly emitir: Emisor,
  ) {
    // Por si el mapa no lo trae exacto: siempre al centro de la casilla y a un rumbo de tablero.
    this.pos = centroDe(casillaDe(mapa.inicioOido.pos));
    const giro = config.movimiento.gradosPorGiro;
    this.rumbo = normalizarRumbo(Math.round(mapa.inicioOido.rumbo / giro) * giro);
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
   * Un paso de exactamente una casilla hacia el rumbo del cuerpo (o en reversa, sin girar); nunca
   * hacia donde mira la cabeza. Se ignora si hay un paso o un giro en curso. Si la casilla de
   * destino es pared o puerta cerrada, no se mueve y anuncia `sim/choque` (con su ruido); los
   * choques repetidos muy seguidos (tecla sostenida) se callan.
   */
  mover(dir: 'adelante' | 'atras', corriendo: boolean, puertas: Puertas): void {
    if (this.moviendose) return;
    const cfg = this.config.movimiento;
    const rumboAvance = dir === 'adelante' ? this.rumbo : normalizarRumbo(this.rumbo + MEDIA_VUELTA);
    const v = vectorDeRumbo(rumboAvance);
    const aqui = casillaDe(this.pos);
    const destino: Casilla = { cx: aqui.cx + Math.round(v.x), cz: aqui.cz + Math.round(v.z) };

    if (esPared(this.mapa, puertas, destino.cx, destino.cz)) {
      if (this.segDesdeChoque < this.ajustes.segMinEntreChoques) return;
      this.segDesdeChoque = 0;
      this.segQuieto = 0;
      this.ruido.sumar(this.config.ruido.porChoque);
      // El rumbo del choque es hacia donde está el obstáculo (detrás, si iba en reversa).
      this.emitir('sim/choque', { pos: { ...this.pos }, rumbo: rumboAvance });
      return;
    }

    this.recentrando = true;
    this.segQuieto = 0;
    this.paso = {
      desde: { ...this.pos },
      hacia: centroDe(destino),
      progreso: 0,
      seg: corriendo ? cfg.segPorPasoCorriendo : cfg.segPorPaso,
      corriendo,
    };
  }

  /** Giro animado de `gradosPorGiro`. Se ignora si hay un paso o un giro en curso. */
  girar(sentido: 'izq' | 'der'): void {
    if (this.moviendose) return;
    const grados = this.config.movimiento.gradosPorGiro;
    this.recentrando = true;
    this.segQuieto = 0;
    this.giro = { desde: this.rumbo, delta: sentido === 'der' ? grados : -grados, progreso: 0 };
  }

  /**
   * Mouse: gira solo la cabeza, nunca el cuerpo, acotada a ±`gradosCabezaMax`. Durante un paso o
   * un giro se ignora: la cabeza va al frente, para que un jugador vendado no camine con la
   * cabeza chueca sin saberlo.
   */
  girarFino(grados: number): void {
    if (!Number.isFinite(grados) || this.moviendose) return;
    const max = this.config.movimiento.gradosCabezaMax;
    this.recentrando = false;
    this.cabeza = Math.max(-max, Math.min(max, this.cabeza + grados));
  }

  actualizar(dtSeg: number): void {
    this.segDesdeChoque += dtSeg;
    if (!this.moviendose) this.segQuieto += dtSeg;

    if (this.recentrando) {
      const avance = this.config.movimiento.gradosPorSegRecentrarCabeza * dtSeg;
      if (Math.abs(this.cabeza) <= avance) {
        this.cabeza = 0;
        this.recentrando = false;
      } else {
        this.cabeza -= Math.sign(this.cabeza) * avance;
      }
    }

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
}
