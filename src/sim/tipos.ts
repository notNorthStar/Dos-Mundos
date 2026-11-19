import type { Mensajes, TipoMensaje } from '../shared/contratos';

/** Función con la que los módulos de la simulación anuncian hechos `sim/*` por el bus. */
export type Emisor = <T extends TipoMensaje>(tipo: T, datos: Mensajes[T]) => void;
