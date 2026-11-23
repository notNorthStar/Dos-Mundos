import { describe, expect, it } from 'vitest';
import { BusRed, urlRelevo, type Enchufe, type EstadoRed } from '../../src/bus/BusRed';

class EnchufeFalso implements Enchufe {
  onopen: ((e: never) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: never) => void) | null = null;
  enviados: unknown[] = [];
  send(texto: string): void {
    this.enviados.push(JSON.parse(texto));
  }
  close(): void {
    this.onclose?.(undefined as never);
  }
  abrir(): void {
    this.onopen?.(undefined as never);
  }
  llegar(trama: unknown): void {
    this.onmessage?.({ data: JSON.stringify(trama) });
  }
}

function montar(rol: 'oido' | 'vista') {
  const enchufes: EnchufeFalso[] = [];
  const pendientes: Array<() => void> = [];
  const bus = new BusRed({
    rol,
    crearEnchufe: () => {
      const e = new EnchufeFalso();
      enchufes.push(e);
      return e;
    },
    programar: (fn) => void pendientes.push(fn),
  });
  return { bus, enchufes, pendientes };
}

describe('BusRed', () => {
  it('saluda con su rol al conectarse', () => {
    const { enchufes } = montar('vista');
    enchufes[0]!.abrir();
    expect(enchufes[0]!.enviados).toEqual([{ c: 'hola', rol: 'vista' }]);
  });

  it('reparte en la página y manda a la red solo lo que le toca a su rol', () => {
    const { bus, enchufes } = montar('oido');
    const e = enchufes[0]!;
    e.abrir();
    e.enviados.length = 0;
    const locales: string[] = [];
    bus.escuchar('oido/interactuar', () => locales.push('interactuar'));
    bus.escuchar('juego/iniciar', () => locales.push('iniciar'));
    bus.enviar('oido/interactuar', {});
    bus.enviar('juego/iniciar', {});
    expect(locales).toEqual(['interactuar', 'iniciar']);
    expect(e.enviados).toEqual([{ c: 'msg', tipo: 'juego/iniciar', datos: {} }]);
  });

  it('lo que llega de la otra PC se reparte aquí y no rebota', () => {
    const { bus, enchufes } = montar('oido');
    const e = enchufes[0]!;
    e.abrir();
    e.enviados.length = 0;
    const camaras: number[] = [];
    bus.escuchar('vista/camara', (d) => camaras.push(d.numero));
    e.llegar({ c: 'msg', tipo: 'vista/camara', datos: { numero: 3 } });
    expect(camaras).toEqual([3]);
    expect(e.enviados).toEqual([]);
  });

  it('avisa de la conexión y de la presencia de la otra PC, y reintenta si se cae', () => {
    const { bus, enchufes, pendientes } = montar('oido');
    const vistos: EstadoRed[] = [];
    bus.alCambiar((e) => vistos.push(e));
    enchufes[0]!.abrir();
    enchufes[0]!.llegar({ c: 'presentes', roles: ['oido', 'vista'] });
    enchufes[0]!.close();
    expect(vistos).toEqual([
      { conectado: false, otroPresente: false },
      { conectado: true, otroPresente: false },
      { conectado: true, otroPresente: true },
      { conectado: false, otroPresente: false },
    ]);
    expect(pendientes).toHaveLength(1);
    pendientes[0]!();
    expect(enchufes).toHaveLength(2);
    enchufes[1]!.abrir();
    expect(bus.estado.conectado).toBe(true);
  });

  it('arma la dirección del relevo según el protocolo de la página', () => {
    expect(urlRelevo({ protocol: 'https:', host: '192.168.1.5:5190' }, '/bus')).toBe('wss://192.168.1.5:5190/bus');
    expect(urlRelevo({ protocol: 'http:', host: 'localhost:5190' }, '/bus')).toBe('ws://localhost:5190/bus');
  });
});
