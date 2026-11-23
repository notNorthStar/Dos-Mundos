/**
 * Relevo del modo de dos PC: un WebSocket en el mismo servidor de Vite (desarrollo y preview)
 * que reenvía los mensajes del bus entre la PC de Oído y la de Vista.
 *
 * `crearRelevo` es lógica pura (probada en test/red/); `pluginRelevo` la conecta a Vite.
 */
import type { Server as ServidorHttp } from 'node:http';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import { RUTA_RELEVO, esRol, viajaDesde, type Rol, type TramaServidor } from '../src/shared/red';

/** Lo que el relevo necesita de una conexión, sea un WebSocket real o uno de prueba. */
export interface Conexion {
  enviar(texto: string): void;
  cerrar(): void;
}

export interface Relevo {
  /** Registra una conexión nueva y devuelve cómo avisarle al relevo de lo que le pasa. */
  conectar(conexion: Conexion): { recibir(texto: string): void; cerrada(): void };
}

export function crearRelevo(): Relevo {
  const roles = new Map<Conexion, Rol>();

  const anunciarPresentes = (): void => {
    const trama: TramaServidor = { c: 'presentes', roles: [...new Set(roles.values())] };
    const texto = JSON.stringify(trama);
    for (const c of roles.keys()) c.enviar(texto);
  };

  return {
    conectar(conexion) {
      return {
        recibir(texto) {
          let trama: unknown;
          try {
            trama = JSON.parse(texto);
          } catch {
            return;
          }
          if (typeof trama !== 'object' || trama === null) return;
          const t = trama as { c?: unknown; rol?: unknown; tipo?: unknown; datos?: unknown };

          if (t.c === 'hola' && esRol(t.rol)) {
            // Un solo jugador por rol: si alguien entra con un rol ocupado, sale el anterior.
            for (const [otra, rol] of roles) {
              if (rol === t.rol && otra !== conexion) {
                roles.delete(otra);
                otra.cerrar();
              }
            }
            roles.set(conexion, t.rol);
            anunciarPresentes();
            return;
          }

          const rol = roles.get(conexion);
          if (t.c !== 'msg' || !rol || typeof t.tipo !== 'string' || !viajaDesde(rol, t.tipo)) return;
          const salida: TramaServidor = { c: 'msg', tipo: t.tipo, datos: t.datos };
          const reenvio = JSON.stringify(salida);
          for (const otra of roles.keys()) if (otra !== conexion) otra.enviar(reenvio);
        },
        cerrada() {
          if (roles.delete(conexion)) anunciarPresentes();
        },
      };
    },
  };
}

function montar(http: ServidorHttp | null): void {
  if (!http) return;
  const relevo = crearRelevo();
  const wss = new WebSocketServer({ noServer: true });

  http.on('upgrade', (peticion, socket, cabeza) => {
    // Solo nuestra ruta: el WebSocket de recarga en caliente de Vite sigue por su cuenta.
    const ruta = new URL(peticion.url ?? '/', 'http://relevo').pathname;
    if (ruta !== RUTA_RELEVO) return;
    wss.handleUpgrade(peticion, socket, cabeza, (ws) => {
      const enlace = relevo.conectar({
        enviar: (texto) => {
          if (ws.readyState === ws.OPEN) ws.send(texto);
        },
        cerrar: () => ws.close(),
      });
      ws.on('message', (dato) => enlace.recibir(dato.toString()));
      ws.on('close', () => enlace.cerrada());
      ws.on('error', () => ws.close());
    });
  });
}

export function pluginRelevo(): Plugin {
  return {
    name: 'dos-mundos-relevo',
    configureServer(servidor) {
      montar(servidor.httpServer as ServidorHttp | null);
    },
    configurePreviewServer(servidor) {
      montar(servidor.httpServer as ServidorHttp | null);
    },
  };
}
