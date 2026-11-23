import type { Bus, Mensajes, TipoMensaje } from '../shared/contratos';
import { elOtro, viajaDesde, type Rol, type TramaCliente, type TramaServidor } from '../shared/red';
import { BusLocal } from './BusLocal';

/** Lo mínimo de un WebSocket que usa el bus (así las pruebas pueden darle uno falso). */
export interface Enchufe {
  onopen: ((e: never) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: never) => void) | null;
  send(texto: string): void;
  close(): void;
}

export interface EstadoRed {
  /** Esta PC está conectada al relevo. */
  conectado: boolean;
  /** La otra PC (el otro rol) también lo está. */
  otroPresente: boolean;
}

export interface OpcionesBusRed {
  rol: Rol;
  crearEnchufe: () => Enchufe;
  /** Espera antes de reintentar la conexión. */
  msReintento?: number;
  /** Para las pruebas; por defecto `setTimeout`. */
  programar?: (fn: () => void, ms: number) => void;
}

/**
 * Bus del modo de dos PC. Dentro de la página se comporta igual que `BusLocal`; además, los
 * mensajes que le tocan a este rol (`viajaDesde`) salen por el WebSocket y los que llegan de la
 * otra PC se reparten aquí. La lógica del juego no cambia: solo ve la interfaz `Bus`.
 */
export class BusRed implements Bus {
  private readonly local = new BusLocal();
  private readonly oyentesEstado = new Set<(e: EstadoRed) => void>();
  private enchufe: Enchufe | null = null;
  private abierto = false;
  private otroPresente = false;
  private cerradoAProposito = false;

  constructor(private readonly opciones: OpcionesBusRed) {
    this.conectar();
  }

  get estado(): EstadoRed {
    return { conectado: this.abierto, otroPresente: this.otroPresente };
  }

  /** Avisa ahora y cada vez que cambie la conexión. Devuelve cómo darse de baja. */
  alCambiar(fn: (e: EstadoRed) => void): () => void {
    this.oyentesEstado.add(fn);
    fn(this.estado);
    return () => {
      this.oyentesEstado.delete(fn);
    };
  }

  enviar<T extends TipoMensaje>(tipo: T, datos: Mensajes[T]): void {
    this.local.enviar(tipo, datos);
    if (this.abierto && viajaDesde(this.opciones.rol, tipo)) this.mandar({ c: 'msg', tipo, datos });
  }

  escuchar<T extends TipoMensaje>(tipo: T, fn: (datos: Mensajes[T]) => void): () => void {
    return this.local.escuchar(tipo, fn);
  }

  cerrar(): void {
    this.cerradoAProposito = true;
    this.enchufe?.close();
  }

  private mandar(trama: TramaCliente): void {
    this.enchufe?.send(JSON.stringify(trama));
  }

  private conectar(): void {
    const enchufe = this.opciones.crearEnchufe();
    this.enchufe = enchufe;

    enchufe.onopen = () => {
      this.abierto = true;
      this.mandar({ c: 'hola', rol: this.opciones.rol });
      this.avisar();
    };

    enchufe.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      let trama: TramaServidor;
      try {
        trama = JSON.parse(e.data) as TramaServidor;
      } catch {
        return;
      }
      if (trama.c === 'presentes') {
        const otro = trama.roles.includes(elOtro(this.opciones.rol));
        if (otro !== this.otroPresente) {
          this.otroPresente = otro;
          this.avisar();
        }
      } else if (trama.c === 'msg') {
        // Solo se reparte aquí: lo que llega de la red no vuelve a salir.
        this.local.enviar(trama.tipo as TipoMensaje, trama.datos as never);
      }
    };

    enchufe.onclose = () => {
      if (this.enchufe !== enchufe) return;
      this.abierto = false;
      this.otroPresente = false;
      this.avisar();
      if (this.cerradoAProposito) return;
      const programar = this.opciones.programar ?? ((fn, ms) => void setTimeout(fn, ms));
      programar(() => this.conectar(), this.opciones.msReintento ?? 1000);
    };
  }

  private avisar(): void {
    const e = this.estado;
    for (const fn of [...this.oyentesEstado]) fn(e);
  }
}

/** Dirección del relevo: el mismo servidor y puerto que sirvió la página. */
export function urlRelevo(ubicacion: { protocol: string; host: string }, ruta: string): string {
  return `${ubicacion.protocol === 'https:' ? 'wss' : 'ws'}://${ubicacion.host}${ruta}`;
}

/** Un WebSocket del navegador visto como `Enchufe` (sus eventos traen más datos de los que usamos). */
export function enchufeWeb(url: string): Enchufe {
  return new WebSocket(url) as unknown as Enchufe;
}
