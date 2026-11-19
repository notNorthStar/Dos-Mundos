import { describe, expect, it } from 'vitest';
import { BusLocal } from '../src/bus/BusLocal';

describe('BusLocal', () => {
  it('entrega el mensaje a quien escucha ese tipo y solo a ese', () => {
    const bus = new BusLocal();
    const giros: string[] = [];
    let pasos = 0;
    bus.escuchar('oido/girar', (m) => giros.push(m.sentido));
    bus.escuchar('oido/mover', () => pasos++);

    bus.enviar('oido/girar', { sentido: 'izq' });
    bus.enviar('oido/girar', { sentido: 'der' });

    expect(giros).toEqual(['izq', 'der']);
    expect(pasos).toBe(0);
  });

  it('deja de entregar al darse de baja, incluso durante el reparto', () => {
    const bus = new BusLocal();
    let a = 0;
    let b = 0;
    const bajaA = bus.escuchar('juego/iniciar', () => {
      a++;
      bajaA();
    });
    bus.escuchar('juego/iniciar', () => b++);

    bus.enviar('juego/iniciar', {});
    bus.enviar('juego/iniciar', {});

    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it('con copiar:true el oyente recibe una copia, como en la red', () => {
    const bus = new BusLocal({ copiar: true });
    const original = { fichas: [{ tipo: 'sena' as const, sena: 'F' as const }], texto: 'Avanza', emergencia: false };
    let recibido: unknown;
    bus.escuchar('radio/mensaje', (m) => (recibido = m));

    bus.enviar('radio/mensaje', original);

    expect(recibido).toEqual(original);
    expect(recibido).not.toBe(original);
  });

  it('enviar sin oyentes no falla', () => {
    expect(() => new BusLocal().enviar('oido/interactuar', {})).not.toThrow();
  });
});
