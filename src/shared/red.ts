/**
 * Protocolo del modo de dos PC (docs/CONTRATOS.md §7). Lo comparten el relevo del servidor
 * (`tools/relevo.ts`) y el bus de red del navegador (`src/bus/BusRed.ts`).
 *
 * La PC de Oído corre la simulación y el audio; la de Vista, las cámaras y el radio. El relevo
 * solo reenvía los mensajes del bus de una PC a la otra: no sabe nada del juego.
 */
export type Rol = 'oido' | 'vista';

/** Ruta del WebSocket en el mismo servidor y puerto que sirve la página. */
export const RUTA_RELEVO = '/bus';

/** Del navegador al relevo. */
export type TramaCliente =
  | { c: 'hola'; rol: Rol }
  | { c: 'msg'; tipo: string; datos: unknown };

/** Del relevo al navegador. */
export type TramaServidor =
  | { c: 'presentes'; roles: Rol[] }
  | { c: 'msg'; tipo: string; datos: unknown };

const PREFIJOS: Record<Rol, readonly string[]> = {
  // Oído simula: anuncia los hechos del mundo. Sus teclas (`oido/*`) y su micrófono se quedan en su PC.
  oido: ['sim/', 'juego/'],
  // Vista manda órdenes: cámaras, puertas y el radio.
  vista: ['vista/', 'radio/', 'juego/'],
};

/** ¿Este tipo de mensaje sale por la red cuando lo envía la PC con ese rol? */
export function viajaDesde(rol: Rol, tipo: string): boolean {
  return PREFIJOS[rol].some((p) => tipo.startsWith(p));
}

export function esRol(valor: unknown): valor is Rol {
  return valor === 'oido' || valor === 'vista';
}

export function elOtro(rol: Rol): Rol {
  return rol === 'oido' ? 'vista' : 'oido';
}
