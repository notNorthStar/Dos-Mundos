/**
 * "Sostener para confirmar": convierte una lectura por cuadro (letra o conteo de dedos) en un evento
 * que se dispara UNA vez cuando el valor lleva `ms` estable. Para repetirlo hay que soltarlo
 * (otro valor o null) y volver a hacerlo. Lógica pura, sin DOM.
 */
export class Sostenedor<T> {
  private actual: T | null = null;
  private desde = 0;
  private usado = false;

  constructor(private readonly ms: number) {}

  /** Valor que se lee ahora (null si nada). */
  get valor(): T | null {
    return this.actual;
  }

  /**
   * Procesa la lectura de este cuadro. `msEstable` permite usar la estabilidad que ya calcula otro
   * (p. ej. `stableMs` del clasificador de LSM); si no se da, se mide aquí.
   * Devuelve el valor solo en el cuadro en que se confirma; si no, null.
   */
  actualizar(valor: T | null, ahora: number, msEstable?: number): T | null {
    if (valor !== this.actual) {
      this.actual = valor;
      this.desde = ahora;
      this.usado = false;
    }
    if (valor === null || this.usado) return null;
    if (this.msSostenido(ahora, msEstable) >= this.ms) {
      this.usado = true;
      return valor;
    }
    return null;
  }

  msSostenido(ahora: number, msEstable?: number): number {
    if (this.actual === null) return 0;
    return msEstable ?? ahora - this.desde;
  }

  /** 0 a 1: avance hacia la confirmación (para una barra). 0 si ya se usó. */
  progreso(ahora: number, msEstable?: number): number {
    if (this.actual === null || this.usado) return 0;
    return Math.min(1, this.msSostenido(ahora, msEstable) / this.ms);
  }

  /** Marca el valor actual como ya usado: no se confirma hasta que cambie. */
  consumir(): void {
    this.usado = true;
  }

  /** Fija el valor actual como ya usado (p. ej. la forma de la mano al entrar en modo número). */
  bloquear(valor: T | null, ahora: number): void {
    this.actual = valor;
    this.desde = ahora;
    this.usado = true;
  }

  reiniciar(): void {
    this.actual = null;
    this.desde = 0;
    this.usado = false;
  }
}
