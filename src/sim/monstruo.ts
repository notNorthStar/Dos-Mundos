/**
 * El monstruo (DISENO.md §5.2): patrulla → escucha → caza → atrapa. Lógica pura.
 *
 * Se mueve de centro de casilla en centro de casilla siguiendo una ruta BFS que se recalcula en
 * cada casilla, así que nunca atraviesa una puerta cerrada: si le cortan el paso, espera.
 * Decidir si atrapa a Oído es cosa de Simulacion.ts (necesita la posición de los dos).
 */
import type { Config } from '../config';
import type { Casilla, EstadoMonstruo, Mapa, Punto, ZonaRuido } from '../shared/contratos';
import { casillaDe, centroDe, cuartoEn, normalizarRumbo, rumboHacia, type Puertas } from '../shared/mapaUtil';
import type { AjustesSim } from './ajustes';
import { buscarRuta, mismaCasilla } from './rutas';
import type { Emisor } from './tipos';

/** Rumbo con el que aparece (sur) hasta que da su primer paso. */
const RUMBO_INICIAL = 180;

interface PasoMonstruo {
  desde: Punto;
  hacia: Punto;
  /** 0 a 1. La duración depende del estado en cada momento (caza = rápido). */
  progreso: number;
}

export class Monstruo {
  pos: Punto;
  rumbo = normalizarRumbo(RUMBO_INICIAL);
  estado: EstadoMonstruo = 'patrulla';

  private paso: PasoMonstruo | null = null;
  /** Punto de `rutaPatrulla` al que se dirige. */
  private indiceRuta = 0;
  /** Segundos seguidos sin ruido en cuidado ni en peligro. */
  private segSinRuido = 0;
  /** Segundos seguidos con la ruta de patrulla cortada. */
  private segBloqueado = 0;
  /** Último punto de ruido en zona de peligro. */
  private objetivoCaza: Punto;

  constructor(
    private readonly mapa: Mapa,
    private readonly config: Config['monstruo'],
    private readonly ajustes: AjustesSim,
    private readonly emitir: Emisor,
  ) {
    this.pos = { ...mapa.inicioMonstruo };
    this.objetivoCaza = { ...this.pos };
  }

  /** true si el monstruo está en esa casilla o entrando a ella (para no cerrarle la puerta encima). */
  ocupa(casilla: Casilla): boolean {
    if (mismaCasilla(casillaDe(this.pos), casilla)) return true;
    return this.paso !== null && mismaCasilla(casillaDe(this.paso.hacia), casilla);
  }

  /** Lo llama la simulación cuando alcanza a Oído. */
  atrapar(): void {
    this.cambiarEstado('atrapa');
  }

  actualizar(dtSeg: number, zona: ZonaRuido, posOido: Punto, puertas: Puertas): void {
    if (this.estado === 'atrapa') return;
    this.reaccionarAlRuido(dtSeg, zona, posOido);
    // En escucha se queda quieto donde esté; el paso a medias se reanuda al salir de escucha.
    if (this.estado !== 'escucha') this.avanzar(dtSeg, puertas);
  }

  // ───────────────────────── Estados ─────────────────────────

  private reaccionarAlRuido(dtSeg: number, zona: ZonaRuido, posOido: Punto): void {
    if (zona === 'peligro') {
      // El origen del ruido es siempre la posición de Oído; se actualiza mientras siga en peligro.
      this.segSinRuido = 0;
      this.objetivoCaza = { ...posOido };
      if (this.estado !== 'caza') this.cambiarEstado('caza');
      return;
    }

    if (zona === 'cuidado') {
      this.segSinRuido = 0;
      if (this.estado === 'patrulla') this.cambiarEstado('escucha');
      // En caza, el ruido en cuidado no cambia el objetivo: solo evita que se le olvide.
      if (this.estado === 'escucha') this.mirarHacia(posOido);
      return;
    }

    this.segSinRuido += dtSeg;
    if (this.estado === 'escucha' && this.segSinRuido >= this.config.segEscucha) this.cambiarEstado('patrulla');
    else if (this.estado === 'caza' && this.segSinRuido >= this.config.segOlvido) this.cambiarEstado('patrulla');
  }

  private cambiarEstado(nuevo: EstadoMonstruo): void {
    if (nuevo === this.estado) return;
    const anterior = this.estado;
    this.estado = nuevo;
    this.segBloqueado = 0;
    this.emitir('sim/monstruoEstado', { estado: nuevo, anterior, pos: { ...this.pos } });
  }

  private mirarHacia(p: Punto): void {
    if (p.x === this.pos.x && p.z === this.pos.z) return;
    this.rumbo = rumboHacia(this.pos, p);
  }

  // ───────────────────────── Movimiento ─────────────────────────

  private avanzar(dtSeg: number, puertas: Puertas): void {
    const rapido = this.estado === 'caza';
    const segPorPaso = rapido ? this.config.segPorPasoCaza : this.config.segPorPasoPatrulla;
    let resto = dtSeg;

    while (resto > 0) {
      if (!this.paso) {
        const siguiente = this.siguienteCasilla(puertas);
        if (!siguiente) {
          // Sin a dónde ir (ruta cortada o ya llegó): espera y vuelve a calcular en el próximo cuadro.
          this.esperar(resto);
          return;
        }
        this.segBloqueado = 0;
        const hacia = centroDe(siguiente);
        this.mirarHacia(hacia);
        this.paso = { desde: { ...this.pos }, hacia, progreso: 0 };
      }

      const p = this.paso;
      const segRestantes = (1 - p.progreso) * segPorPaso;
      if (resto < segRestantes) {
        p.progreso += resto / segPorPaso;
        this.pos = {
          x: p.desde.x + (p.hacia.x - p.desde.x) * p.progreso,
          z: p.desde.z + (p.hacia.z - p.desde.z) * p.progreso,
        };
        return;
      }

      // Llegó al centro de la casilla: una pisada, y lo que sobra del cuadro sigue con la siguiente.
      resto -= segRestantes;
      this.pos = { ...p.hacia };
      this.paso = null;
      this.emitir('sim/monstruoPaso', {
        pos: { ...this.pos },
        superficie: cuartoEn(this.mapa, this.pos).superficie,
        rapido,
      });
    }
  }

  /** Casilla contigua a la que debe ir ahora, o null si no hay camino o ya está en su destino. */
  private siguienteCasilla(puertas: Puertas): Casilla | null {
    const aqui = casillaDe(this.pos);

    if (this.estado === 'caza') {
      // Si el ruido quedó detrás de una puerta cerrada, se acerca todo lo que puede.
      const ruta = buscarRuta(this.mapa, puertas, aqui, casillaDe(this.objetivoCaza), true);
      return ruta?.[0] ?? null;
    }

    const puntos = this.mapa.rutaPatrulla;
    // Salta los puntos de la ruta en los que ya está (como mucho, una vuelta completa).
    for (let i = 0; i < puntos.length; i++) {
      const meta = puntos[this.indiceRuta % puntos.length];
      if (!meta || !mismaCasilla(aqui, casillaDe(meta))) break;
      this.pasarAlSiguientePunto();
    }
    const meta = puntos[this.indiceRuta % Math.max(1, puntos.length)];
    if (!meta) return null;
    const ruta = buscarRuta(this.mapa, puertas, aqui, casillaDe(meta));
    return ruta?.[0] ?? null;
  }

  /**
   * Ruta cortada. En patrulla, tras `segEsperaBloqueo` prueba con el siguiente punto de la ruta:
   * encerrado en su guarida se queda ahí dando vueltas, y si lo dejan fuera sigue por el pasillo
   * en vez de quedarse clavado para siempre frente a la puerta.
   */
  private esperar(dtSeg: number): void {
    if (this.estado !== 'patrulla') return;
    this.segBloqueado += dtSeg;
    if (this.segBloqueado >= this.ajustes.segEsperaBloqueo) {
      this.segBloqueado = 0;
      this.pasarAlSiguientePunto();
    }
  }

  private pasarAlSiguientePunto(): void {
    const n = this.mapa.rutaPatrulla.length;
    this.indiceRuta = n > 0 ? (this.indiceRuta + 1) % n : 0;
  }
}
