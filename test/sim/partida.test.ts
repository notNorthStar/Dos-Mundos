import { describe, expect, it } from 'vitest';
import { BusLocal } from '../../src/bus/BusLocal';
import { ALA_ESTE } from '../../src/data/alaEste';
import type { EstadoJuego } from '../../src/shared/contratos';
import { puertasIniciales } from '../../src/shared/mapaUtil';
import { AJUSTES_SIM } from '../../src/sim/ajustes';
import { Simulacion } from '../../src/sim/Simulacion';
import { crearPartida, DT, jugarGuionizado } from './ayuda';

describe('sim/estado', () => {
  it('se emite unas 15 veces por segundo y de inmediato al cambiar de fase', () => {
    const p = crearPartida({ iniciar: false });
    const fotos: EstadoJuego[] = [];
    p.bus.escuchar('sim/estado', (e) => fotos.push(e));

    p.avanzar(1);
    expect(fotos.length).toBeGreaterThanOrEqual(AJUSTES_SIM.estadoHz - 1);
    expect(fotos.length).toBeLessThanOrEqual(AJUSTES_SIM.estadoHz + 1);
    expect(fotos.every((f) => f.fase === 'inicio')).toBe(true);

    fotos.length = 0;
    p.bus.enviar('juego/iniciar', {});
    expect(fotos).toHaveLength(1);
    expect(fotos[0]?.fase).toBe('jugando');

    p.avanzar(2);
    expect(fotos.length).toBeGreaterThanOrEqual(2 * AJUSTES_SIM.estadoHz - 1);
    expect(fotos.length).toBeLessThanOrEqual(2 * AJUSTES_SIM.estadoHz + 2);
    expect(fotos.at(-1)?.t).toBeGreaterThan(1.8);
  });

  it('es JSON plano y una copia: tocarla no cambia la simulación', () => {
    const bus = new BusLocal(); // sin copiar: lo que llega es lo que la simulación mandó
    const sim = new Simulacion(bus, ALA_ESTE);
    let foto: EstadoJuego | undefined;
    bus.escuchar('sim/estado', (e) => (foto = e));
    bus.enviar('juego/iniciar', {});
    expect(foto).toBeDefined();
    expect(JSON.parse(JSON.stringify(foto))).toEqual(foto);
    expect(foto).toEqual(sim.estado);

    foto!.oido.pos.x = 99;
    foto!.puertas['p-cuarto1'] = false;
    foto!.inventario.llave = true;
    expect(sim.estado.oido.pos.x).toBe(ALA_ESTE.inicioOido.pos.x);
    expect(sim.estado.puertas['p-cuarto1']).toBe(true);
    expect(sim.estado.inventario.llave).toBe(false);
  });

  it('destruir deja de escuchar y de emitir', () => {
    const p = crearPartida();
    let fotos = 0;
    p.bus.escuchar('sim/estado', () => fotos++);
    p.sim.destruir();
    p.bus.enviar('juego/reiniciar', {});
    p.caminar(1);
    p.avanzar(1);
    expect(fotos).toBe(0);
    expect(p.hechos).toEqual([]);
    expect(p.sim.estado.oido.pos).toEqual(ALA_ESTE.inicioOido.pos);
  });

  it('un cuadro larguísimo equivale a muchos cuadros cortos', () => {
    const a = crearPartida({ semilla: 4, monstruo: { segInicioTranquilo: 0 } });
    const b = crearPartida({ semilla: 4, monstruo: { segInicioTranquilo: 0 } });
    a.sim.actualizar(3);
    for (let i = 0; i < 180; i++) b.sim.actualizar(DT);
    expect(a.sim.estado.monstruo.pos.x).toBeCloseTo(b.sim.estado.monstruo.pos.x, 1);
    expect(a.sim.estado.monstruo.pos.z).toBeCloseTo(b.sim.estado.monstruo.pos.z, 1);
    expect(a.de('sim/monstruoPaso')).toEqual(b.de('sim/monstruoPaso'));
    expect(a.de('sim/monstruoPaso').length).toBeGreaterThan(0);
  });
});

describe('reinicio', () => {
  it('juego/reiniciar restablece todo y vuelve a jugando', () => {
    const p = crearPartida();
    p.bus.enviar('oido/interactuar', {}); // decibelímetro
    p.puerta(3); // cierra la bodega
    p.caminar(1);
    p.girar('der');
    p.bus.enviar('oido/girarFino', { grados: 25 });
    p.bus.enviar('ruido/microfono', { nivel: 1 });
    p.avanzar(10);
    expect(p.sim.estado.fase).toBe('perdieron');

    const fases: string[] = [];
    p.bus.escuchar('sim/estado', (e) => fases.push(e.fase));
    p.bus.enviar('juego/reiniciar', {});
    expect(fases).toEqual(['jugando']);

    const e = p.sim.estado;
    expect(e.fase).toBe('jugando');
    expect(e.t).toBe(0);
    expect(e.oido).toEqual({ pos: ALA_ESTE.inicioOido.pos, rumbo: ALA_ESTE.inicioOido.rumbo, cabeza: 0, cuartoId: 'cuarto1', corriendo: false, moviendose: false });
    expect(e.monstruo.pos).toEqual(ALA_ESTE.inicioMonstruo);
    expect(e.monstruo.estado).toBe('patrulla');
    expect(e.puertas).toEqual(puertasIniciales(ALA_ESTE));
    expect(e.inventario).toEqual({ decibelimetro: false, llave: false });
    expect(e.ruido).toEqual({ nivel: 0, zona: 'silencio' });
    expect(e.camaraActiva).toBe(AJUSTES_SIM.camaraInicial);

    // Y se puede volver a jugar.
    p.caminar(1);
    expect(p.sim.estado.oido.pos.x).toBeCloseTo(ALA_ESTE.inicioOido.pos.x - 1);
  });

  it('juego/iniciar no reinicia una partida en curso ni terminada', () => {
    const p = crearPartida();
    p.caminar(1);
    p.bus.enviar('juego/iniciar', {});
    expect(p.sim.estado.oido.pos.x).toBeCloseTo(ALA_ESTE.inicioOido.pos.x - 1);
    p.bus.enviar('ruido/microfono', { nivel: 1 });
    p.avanzar(10);
    p.bus.enviar('juego/iniciar', {});
    expect(p.sim.estado.fase).toBe('perdieron');
  });
});

describe('partida feliz completa', () => {
  it('del inicio a ganar, guiada por órdenes, con el monstruo encerrado en la guarida', () => {
    const p = crearPartida({ iniciar: false });
    p.bus.enviar('juego/iniciar', {});

    // Vista encierra al monstruo de entrada (apuesta: el portazo lo pone a escuchar).
    p.puerta(2);
    expect(p.sim.estado.puertas['p-guarida']).toBe(false);

    // Tutorial: «Gira a la derecha» y agarra el decibelímetro.
    p.girar('der');
    p.bus.enviar('oido/interactuar', {});
    expect(p.sim.estado.inventario.decibelimetro).toBe(true);

    // Sale del cuarto y cruza el pasillo hasta la bodega.
    p.girar('der');
    p.caminar(14);
    expect(p.sim.estado.oido.cuartoId).toBe('bodega');

    // «Agáchate, está en el piso»: la llave.
    p.bus.enviar('vista/camara', { numero: 4 });
    p.girar('der');
    p.caminar(1);
    p.bus.enviar('oido/interactuar', {});
    expect(p.sim.estado.inventario.llave).toBe(true);

    // Baja al vestíbulo y usa la salida.
    p.bus.enviar('vista/camara', { numero: 5 });
    p.caminar(5);
    expect(p.sim.estado.oido.cuartoId).toBe('vestibulo');
    expect(p.sim.estado.fase).toBe('jugando');
    p.bus.enviar('oido/interactuar', {});

    const e = p.sim.estado;
    expect(e.fase).toBe('ganaron');
    expect(e.puertas['p-salida']).toBe(true);
    expect(e.monstruo.cuartoId).toBe('guarida');
    expect(e.camaraActiva).toBe(5);
    expect(p.de('sim/fin')).toEqual([{ resultado: 'ganaron' }]);
    expect(p.de('sim/choque')).toHaveLength(0);
    expect(p.de('sim/paso')).toHaveLength(20);
    expect(p.de('sim/objeto').map((o) => o.id)).toEqual(['decibelimetro', 'llave']);

    // Ganada la partida, las órdenes ya no hacen nada.
    p.caminar(1, 'atras');
    p.puerta(1);
    expect(p.sim.estado.oido.pos).toEqual(e.oido.pos);
    expect(p.sim.estado.puertas['p-cuarto1']).toBe(true);
  });

  it('las metas se alcanzan desde centros de casilla: decibelímetro, llave y salida', () => {
    const p = crearPartida();
    p.puerta(2);
    expect(jugarGuionizado(p)).toBe('ganaron');
    expect(p.de('sim/objeto').map((o) => o.id)).toEqual(['decibelimetro', 'llave']);
    expect(p.de('sim/nadaQueAgarrar')).toHaveLength(0);
    expect(p.de('sim/choque')).toHaveLength(0);
  });
});

/**
 * La partida tiene que poder ganarse SIN encerrar al monstruo: un Oído prudente (camina en
 * silencio y se queda quieto cuando el monstruo anda a 2 casillas o menos) gana siempre, salga
 * cuando salga y merodee por donde merodee el monstruo.
 */
describe('partida ganable con el monstruo suelto', () => {
  const SEMILLAS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];

  it.each(SEMILLAS)('semilla %i: Oído prudente gana saliendo con el monstruo ya merodeando', (semilla) => {
    for (const espera of [0, 30, 75]) {
      const p = crearPartida({ semilla });
      p.avanzar(espera);
      expect(jugarGuionizado(p)).toBe('ganaron');
      expect(p.sim.estado.inventario).toEqual({ decibelimetro: true, llave: true });
      expect(p.sim.estado.ruido.nivel).toBe(0);
      expect(p.de('sim/puerta').filter((x) => x.portazo)).toHaveLength(0);
    }
  });

  it('el peligro es real: un Oído que nunca se detiene pierde en buena parte de las partidas', () => {
    let perdidas = 0;
    for (let semilla = 1; semilla <= 40; semilla++) {
      const p = crearPartida({ semilla });
      p.avanzar(60);
      if (jugarGuionizado(p, 0) === 'perdieron') perdidas++;
    }
    expect(perdidas).toBeGreaterThanOrEqual(8);
    expect(perdidas).toBeLessThan(40);
  });
});
