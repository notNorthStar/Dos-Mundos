import type { Bus, Mensajes, TipoMensaje } from '../shared/contratos';

type Oyente = (datos: never) => void;

/**
 * Bus en memoria para el MVP (una sola página). En la fase 2 se sustituye por uno de WebSocket
 * con la misma interfaz `Bus`, sin tocar la lógica del juego.
 *
 * Con `copiar: true` cada mensaje pasa por JSON, igual que en la red: sirve en las pruebas
 * para detectar pronto cualquier dato que no sobreviviría al WebSocket.
 */
export class BusLocal implements Bus {
  private readonly oyentes = new Map<TipoMensaje, Set<Oyente>>();

  constructor(private readonly opciones: { copiar?: boolean } = {}) {}

  enviar<T extends TipoMensaje>(tipo: T, datos: Mensajes[T]): void {
    const lista = this.oyentes.get(tipo);
    if (!lista || lista.size === 0) return;
    const carga = this.opciones.copiar ? (JSON.parse(JSON.stringify(datos)) as Mensajes[T]) : datos;
    // Copia de la lista: un oyente puede darse de baja mientras se reparte.
    for (const fn of [...lista]) (fn as (d: Mensajes[T]) => void)(carga);
  }

  escuchar<T extends TipoMensaje>(tipo: T, fn: (datos: Mensajes[T]) => void): () => void {
    let lista = this.oyentes.get(tipo);
    if (!lista) {
      lista = new Set();
      this.oyentes.set(tipo, lista);
    }
    lista.add(fn as Oyente);
    return () => {
      lista.delete(fn as Oyente);
    };
  }
}
