/**
 * El monstruo (DISENO.md §5.2). Lógica pura.
 *
 * Por dentro tiene más modos que los cuatro estados del contrato; hacia afuera se anuncian así:
 *
 *   modo interno  | estado público | qué hace
 *   --------------|----------------|-----------------------------------------------------------
 *   guarida       | patrulla       | al empezar, espera `segInicioTranquilo` en su guarida
 *   merodeo       | patrulla       | camina a un punto de merodeo elegido al azar
 *   pausa         | patrulla       | parado un rato (al azar) antes de elegir otro punto
 *   escucha       | escucha        | oyó ruido en «cuidado»: se detiene y voltea hacia el ruido
 *   investiga     | escucha        | el ruido en «cuidado» no paró: va a paso lento al último punto
 *   busca         | escucha        | llegó al punto del ruido y no hay nada: espera `segBusca`
 *   caza          | caza           | ruido en «peligro»: va rápido al ÚLTIMO PUNTO donde lo oyó
 *
 * Nunca sabe dónde está Oído: solo recuerda dónde sonó el último ruido. Se mueve de centro de
 * casilla en centro de casilla con una ruta BFS que se recalcula en cada casilla, así que nunca
 * atraviesa una puerta cerrada. Decidir si atrapa a Oído es cosa de Simulacion.ts.
 */
import type { Config } from '../config';
import type { Casilla, EstadoMonstruo, Mapa, Punto, ZonaRuido } from '../shared/contratos';
import { casillaDe, centroDe, cuartoEn, normalizarRumbo, rumboHacia, type Puertas } from '../shared/mapaUtil';
import type { AjustesSim } from './ajustes';
import type { Azar } from './azar';
import { buscarRuta, mismaCasilla } from './rutas';
import type { Emisor } from './tipos';

/** Rumbo con el que aparece (sur) hasta que da su primer paso. */
const RUMBO_INICIAL = 180;

export type ModoMonstruo = 'guarida' | 'merodeo' | 'pausa' | 'escucha' | 'investiga' | 'busca' | 'caza';

const PUBLICO: Record<ModoMonstruo, EstadoMonstruo> = {
  guarida: 'patrulla',
  merodeo: 'patrulla',
  pausa: 'patrulla',
  escucha: 'escucha',
  investiga: 'escucha',
  busca: 'escucha',
  caza: 'caza',
};

interface PasoMonstruo {
  desde: Punto;
  hacia: Punto;
  /** 0 a 1. La duración depende del modo en cada momento (caza = rápido). */
  progreso: number;
}

export class Monstruo {
  pos: Punto;
  rumbo = normalizarRumbo(RUMBO_INICIAL);
  /** Estado público (el del contrato): es el que oyen el audio y las cámaras de Vista. */
  estado: EstadoMonstruo = 'patrulla';
  /** Modo interno (solo para la simulación y las pruebas). */
  modo: ModoMonstruo = 'guarida';

  private paso: PasoMonstruo | null = null;
  /** Punto de merodeo al que va (null = todavía no elige). */
  private destino: Casilla | null = null;
  /** Cuenta atrás de guarida, pausa y busca. */
  private segEspera: number;
  /** Segundos seguidos sin ruido en cuidado ni en peligro. */
  private segSinRuido = 0;
  /** Segundos de ruido en «cuidado» acumulados desde que se puso a escuchar. */
  private segCuidado = 0;
  /** Último punto donde oyó ruido (lo que investiga o caza). */
  private objetivo: Punto;
  private zona: ZonaRuido = 'silencio';

  constructor(
    private readonly mapa: Mapa,
    private readonly config: Config['monstruo'],
    private readonly ajustes: AjustesSim,
    private readonly emitir: Emisor,
    private readonly azar: Azar,
  ) {
    this.pos = { ...mapa.inicioMonstruo };
    this.objetivo = { ...this.pos };
    this.segEspera = config.segInicioTranquilo;
  }

  /** true si el monstruo está en esa casilla o entrando a ella (para no cerrarle la puerta encima). */
  ocupa(casilla: Casilla): boolean {
    if (mismaCasilla(casillaDe(this.pos), casilla)) return true;
    return this.paso !== null && mismaCasilla(casillaDe(this.paso.hacia), casilla);
  }

  /** Lo llama la simulación cuando alcanza a Oído. */
  atrapar(): void {
    this.publicar('atrapa');
  }

  /**
   * `origenRuido` es de dónde viene el ruido que se oye ahora (la posición de Oído); solo se usa
   * mientras la zona NO es silencio. En silencio el monstruo no recibe ninguna pista.
   */
  actualizar(dtSeg: number, zona: ZonaRuido, origenRuido: Punto, puertas: Puertas): void {
    if (this.estado === 'atrapa') return;
    this.zona = zona;
    this.reaccionarAlRuido(dtSeg, zona, origenRuido);

    switch (this.modo) {
      case 'guarida':
      case 'pausa':
      case 'busca':
        this.segEspera -= dtSeg;
        if (this.segEspera <= 0) {
          // Lo que sobró del cuadro ya se camina: así el resultado no depende del tamaño del cuadro.
          const sobra = -this.segEspera;
          this.cambiarModo('merodeo');
          this.avanzar(sobra, puertas);
        }
        break;
      case 'escucha':
        // Quieto donde esté; el paso a medias se reanuda al salir de escucha.
        break;
      default:
        this.avanzar(dtSeg, puertas);
    }
  }

  // ───────────────────────── Ruido ─────────────────────────

  private reaccionarAlRuido(dtSeg: number, zona: ZonaRuido, origen: Punto): void {
    if (zona === 'peligro') {
      // Mientras el ruido siga en peligro, el objetivo se actualiza; al callarse, se queda fijo.
      this.segSinRuido = 0;
      this.objetivo = { ...origen };
      this.cambiarModo('caza');
      return;
    }

    if (zona === 'cuidado') {
      this.segSinRuido = 0;
      switch (this.modo) {
        case 'caza':
          // El ruido en cuidado no cambia el objetivo de la caza: solo evita que se le olvide.
          break;
        case 'investiga':
          this.objetivo = { ...origen };
          break;
        case 'escucha':
          this.objetivo = { ...origen };
          this.segCuidado += dtSeg;
          if (this.segCuidado > this.config.segEscucha) this.cambiarModo('investiga');
          else this.mirarHacia(origen);
          break;
        default:
          this.objetivo = { ...origen };
          this.segCuidado = 0;
          this.cambiarModo('escucha');
          this.mirarHacia(origen);
      }
      return;
    }

    this.segSinRuido += dtSeg;
    if (this.modo === 'escucha' && this.segSinRuido >= this.config.segEscucha) this.cambiarModo('merodeo');
    else if (this.modo === 'caza' && this.segSinRuido >= this.config.segOlvido) this.cambiarModo('merodeo');
  }

  private cambiarModo(nuevo: ModoMonstruo): void {
    if (nuevo === this.modo) return;
    this.modo = nuevo;
    if (nuevo === 'busca') this.segEspera = this.config.segBusca;
    this.publicar(PUBLICO[nuevo]);
  }

  private publicar(nuevo: EstadoMonstruo): void {
    if (nuevo === this.estado) return;
    const anterior = this.estado;
    this.estado = nuevo;
    this.emitir('sim/monstruoEstado', { estado: nuevo, anterior, pos: { ...this.pos } });
  }

  private pausar(seg: number): void {
    this.segEspera = seg;
    this.cambiarModo('pausa');
  }

  private mirarHacia(p: Punto): void {
    if (p.x === this.pos.x && p.z === this.pos.z) return;
    this.rumbo = rumboHacia(this.pos, p);
  }

  // ───────────────────────── Movimiento ─────────────────────────

  private avanzar(dtSeg: number, puertas: Puertas): void {
    let resto = dtSeg;

    while (resto > 0) {
      const rapido = this.modo === 'caza';
      const segPorPaso = rapido ? this.config.segPorPasoCaza : this.config.segPorPasoPatrulla;

      if (!this.paso) {
        const siguiente = this.siguienteCasilla(puertas);
        if (!siguiente) {
          // Si solo le faltaba elegir a dónde ir, sigue caminando en este mismo cuadro.
          if (this.sinCamino(puertas)) continue;
          return;
        }
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

  /** Casilla contigua a la que debe ir ahora, o null si ya llegó o no hay camino. */
  private siguienteCasilla(puertas: Puertas): Casilla | null {
    const aqui = casillaDe(this.pos);

    if (this.modo === 'caza' || this.modo === 'investiga') {
      // Si el ruido quedó detrás de una puerta cerrada, se acerca todo lo que puede.
      const ruta = buscarRuta(this.mapa, puertas, aqui, casillaDe(this.objetivo), true);
      return ruta?.[0] ?? null;
    }

    if (!this.destino || mismaCasilla(aqui, this.destino)) return null;
    const ruta = buscarRuta(this.mapa, puertas, aqui, this.destino);
    if (!ruta) this.destino = null; // le cerraron el paso: elegirá otro punto
    return ruta?.[0] ?? null;
  }

  /**
   * No hay siguiente casilla: llegó a donde iba, o le cortaron el camino.
   * Devuelve true si acaba de elegir un punto de merodeo nuevo (y puede seguir caminando ya).
   */
  private sinCamino(puertas: Puertas): boolean {
    if (this.modo === 'caza') {
      // Si el ruido sigue en peligro se queda al acecho (el objetivo se sigue actualizando).
      if (this.zona !== 'peligro') this.cambiarModo('busca');
      return false;
    }
    if (this.modo === 'investiga') {
      this.cambiarModo('busca');
      return false;
    }

    // Merodeo.
    if (this.destino) {
      // Llegó al punto: se queda un rato y después elige otro.
      this.destino = null;
      const { segPausaMin, segPausaMax } = this.config;
      this.pausar(segPausaMin + this.azar() * (segPausaMax - segPausaMin));
      return false;
    }
    this.destino = this.elegirDestino(puertas);
    // Encerrado sin ningún punto alcanzable: espera y vuelve a probar.
    if (!this.destino) this.pausar(this.ajustes.segEsperaBloqueo);
    return this.destino !== null;
  }

  /** Un punto de merodeo al azar entre los alcanzables ahora mismo (distinto de donde está). */
  private elegirDestino(puertas: Puertas): Casilla | null {
    const aqui = casillaDe(this.pos);
    const candidatos = this.mapa.rutaPatrulla
      .map(casillaDe)
      .filter((c) => !mismaCasilla(c, aqui) && buscarRuta(this.mapa, puertas, aqui, c) !== null);
    if (candidatos.length === 0) return null;
    const i = Math.min(candidatos.length - 1, Math.floor(this.azar() * candidatos.length));
    return candidatos[i] ?? null;
  }
}
