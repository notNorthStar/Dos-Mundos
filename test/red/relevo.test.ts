import { describe, expect, it } from 'vitest';
import { crearRelevo, type Conexion } from '../../tools/relevo';

function falsa(): Conexion & { recibidos: unknown[]; cerrada: boolean } {
  const c = {
    recibidos: [] as unknown[],
    cerrada: false,
    enviar: (texto: string) => void c.recibidos.push(JSON.parse(texto)),
    cerrar: () => void (c.cerrada = true),
  };
  return c;
}
const hola = (rol: string): string => JSON.stringify({ c: 'hola', rol });
const msg = (tipo: string, datos: unknown = {}): string => JSON.stringify({ c: 'msg', tipo, datos });

describe('relevo de dos PC', () => {
  it('anuncia quién está presente al entrar y al salir', () => {
    const relevo = crearRelevo();
    const oido = falsa();
    const vista = falsa();
    const eOido = relevo.conectar(oido);
    const eVista = relevo.conectar(vista);
    eOido.recibir(hola('oido'));
    expect(oido.recibidos.at(-1)).toEqual({ c: 'presentes', roles: ['oido'] });
    eVista.recibir(hola('vista'));
    expect(oido.recibidos.at(-1)).toEqual({ c: 'presentes', roles: ['oido', 'vista'] });
    eVista.cerrada();
    expect(oido.recibidos.at(-1)).toEqual({ c: 'presentes', roles: ['oido'] });
  });

  it('reenvía a la otra PC y no a quien lo mandó', () => {
    const relevo = crearRelevo();
    const oido = falsa();
    const vista = falsa();
    const eOido = relevo.conectar(oido);
    const eVista = relevo.conectar(vista);
    eOido.recibir(hola('oido'));
    eVista.recibir(hola('vista'));
    oido.recibidos.length = 0;
    vista.recibidos.length = 0;
    eVista.recibir(msg('vista/camara', { numero: 2 }));
    expect(oido.recibidos).toEqual([{ c: 'msg', tipo: 'vista/camara', datos: { numero: 2 } }]);
    expect(vista.recibidos).toEqual([]);
  });

  it('descarta lo que a ese rol no le toca enviar, lo mal formado y lo anónimo', () => {
    const relevo = crearRelevo();
    const oido = falsa();
    const vista = falsa();
    const extra = falsa();
    const eOido = relevo.conectar(oido);
    const eVista = relevo.conectar(vista);
    const eExtra = relevo.conectar(extra);
    eOido.recibir(hola('oido'));
    eVista.recibir(hola('vista'));
    oido.recibidos.length = 0;
    vista.recibidos.length = 0;
    eVista.recibir(msg('sim/estado')); // Vista no simula
    eOido.recibir(msg('oido/mover')); // las teclas de Oído no salen de su PC
    eVista.recibir('esto no es JSON');
    eExtra.recibir(msg('sim/estado')); // nunca dijo hola
    eExtra.recibir(hola('monstruo'));
    expect(oido.recibidos).toEqual([]);
    expect(vista.recibidos).toEqual([]);
  });

  it('un rol ocupado pasa a quien entra de último', () => {
    const relevo = crearRelevo();
    const vieja = falsa();
    const nueva = falsa();
    relevo.conectar(vieja).recibir(hola('vista'));
    relevo.conectar(nueva).recibir(hola('vista'));
    expect(vieja.cerrada).toBe(true);
    expect(nueva.recibidos.at(-1)).toEqual({ c: 'presentes', roles: ['vista'] });
  });
});
