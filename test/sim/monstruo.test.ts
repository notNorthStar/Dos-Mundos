import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { ALA_ESTE } from '../../src/data/alaEste';
import { puertasIniciales } from '../../src/shared/mapaUtil';
import { crearAzar } from '../../src/sim/azar';
import { buscarRuta } from '../../src/sim/rutas';
import { azarFijo, crearPartida, type Partida } from './ayuda';

const M = CONFIG.monstruo;

/**
 * Azar a la medida: desde la guarida, el primer destino del merodeo es el punto (10.5, 2.5) del
 * pasillo (tercer candidato de diez: 0.25) y las pausas duran lo mínimo (0). El camino pasa por
 * (10.5, 5.5), la puerta (10.5, 4.5) y (10.5, 3.5).
 */
const AL_PASILLO = (): (() => number) => azarFijo(0.25, 0);

/** Oído va en silencio del inicio a (10.5, 3.5), justo en el camino de la guarida al pasillo. */
function pararseEnElCamino(p: Partida): void {
  p.girar('der', 2);
  p.caminar(7);
  p.girar('der');
  p.caminar(1);
  expect(p.sim.estado.oido.pos).toEqual({ x: 10.5, z: 3.5 });
  expect(p.sim.estado.ruido.nivel).toBe(0);
}

const pasoEn = (p: Partida, x: number, z: number): boolean =>
  p.de('sim/monstruoPaso').some((m) => m.pos.x === x && m.pos.z === z);

describe('rutas (BFS)', () => {
  const abiertas = puertasIniciales(ALA_ESTE);

  it('encuentra el camino más corto de la guarida al pasillo', () => {
    const ruta = buscarRuta(ALA_ESTE, abiertas, { cx: 10, cz: 6 }, { cx: 10, cz: 2 });
    expect(ruta).toEqual([
      { cx: 10, cz: 5 },
      { cx: 10, cz: 4 },
      { cx: 10, cz: 3 },
      { cx: 10, cz: 2 },
    ]);
    expect(buscarRuta(ALA_ESTE, abiertas, { cx: 10, cz: 6 }, { cx: 10, cz: 6 })).toEqual([]);
  });

  it('no atraviesa puertas cerradas', () => {
    const cerrada = { ...abiertas, 'p-guarida': false };
    expect(buscarRuta(ALA_ESTE, cerrada, { cx: 10, cz: 6 }, { cx: 10, cz: 2 })).toBeNull();
    // La salida empieza cerrada: no hay camino hasta su casilla.
    expect(buscarRuta(ALA_ESTE, abiertas, { cx: 17, cz: 8 }, { cx: 17, cz: 9 })).toBeNull();
  });

  it('con aproximar va a la casilla alcanzable más cercana', () => {
    const cerrada = { ...abiertas, 'p-guarida': false };
    const ruta = buscarRuta(ALA_ESTE, cerrada, { cx: 10, cz: 6 }, { cx: 10, cz: 2 }, true);
    expect(ruta?.at(-1)).toEqual({ cx: 10, cz: 5 });
  });
});

describe('azar sembrable', () => {
  it('misma semilla, misma secuencia; valores en [0, 1)', () => {
    const a = crearAzar(7);
    const b = crearAzar(7);
    const c = crearAzar(8);
    const va = Array.from({ length: 50 }, () => a());
    expect(va).toEqual(Array.from({ length: 50 }, () => b()));
    expect(va).not.toEqual(Array.from({ length: 50 }, () => c()));
    expect(va.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe('monstruo: merodeo', () => {
  it('fuera de jugando no se mueve', () => {
    const p = crearPartida({ iniciar: false, monstruo: { segInicioTranquilo: 0 } });
    p.avanzar(5);
    expect(p.sim.estado.monstruo.pos).toEqual(ALA_ESTE.inicioMonstruo);
    expect(p.de('sim/monstruoPaso')).toHaveLength(0);
  });

  it('al empezar se queda segInicioTranquilo en su guarida y después sale a merodear', () => {
    const p = crearPartida();
    p.avanzar(M.segInicioTranquilo - 0.5);
    expect(p.sim.estado.monstruo.pos).toEqual(ALA_ESTE.inicioMonstruo);
    expect(p.de('sim/monstruoPaso')).toHaveLength(0);
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');
    p.avanzar(0.5 + M.segPorPasoPatrulla + 0.2);
    expect(p.de('sim/monstruoPaso')).toHaveLength(1);
  });

  it('camina de casilla en casilla al punto elegido, hace una pausa y elige otro', () => {
    const p = crearPartida({ azar: AL_PASILLO(), monstruo: { segInicioTranquilo: 0 } });
    p.avanzar(M.segPorPasoPatrulla * 4 + 0.2);
    const pasos = p.de('sim/monstruoPaso');
    expect(pasos).toHaveLength(4);
    expect(pasos[0]).toEqual({ pos: { x: 10.5, z: 5.5 }, superficie: 'concreto', rapido: false });
    expect(pasos[3]?.pos).toEqual({ x: 10.5, z: 2.5 });
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');
    expect(p.sim.estado.monstruo.cuartoId).toBe('pasillo');

    // Pausa (aquí la mínima): parado en el punto.
    p.avanzar(M.segPausaMin - 0.5);
    expect(p.de('sim/monstruoPaso')).toHaveLength(4);
    expect(p.sim.estado.monstruo.pos).toEqual({ x: 10.5, z: 2.5 });

    // Después elige otro punto y sigue: nunca se queda clavado.
    p.avanzar(0.5 + M.segPorPasoPatrulla * 3);
    expect(p.de('sim/monstruoPaso').length).toBeGreaterThan(5);
    expect(p.de('sim/monstruoEstado')).toHaveLength(0); // todo el merodeo es «patrulla»
  });

  it('el merodeo es determinista con la semilla y cambia con otra', () => {
    const recorrido = (semilla: number) => {
      const p = crearPartida({ semilla });
      p.avanzar(180);
      expect(p.sim.estado.fase).toBe('jugando');
      return p.de('sim/monstruoPaso').map((m) => m.pos);
    };
    const a = recorrido(5);
    expect(a.length).toBeGreaterThan(40);
    expect(recorrido(5)).toEqual(a);
    expect(recorrido(6)).not.toEqual(a);
  });

  it('merodea por varios cuartos, no solo por el pasillo', () => {
    const p = crearPartida({ semilla: 3 });
    const cuartos = new Set<string>();
    for (let i = 0; i < 600; i++) {
      p.avanzar(1);
      cuartos.add(p.sim.estado.monstruo.cuartoId);
    }
    expect(cuartos.size).toBeGreaterThanOrEqual(4);
    // Oído no se movió ni hizo ruido en diez minutos: sigue vivo.
    expect(p.sim.estado.fase).toBe('jugando');
  });
});

describe('monstruo: ruido', () => {
  it('ruido en cuidado: se detiene a escuchar y, si se callan, sigue merodeando', () => {
    const p = crearPartida({ azar: AL_PASILLO(), monstruo: { segInicioTranquilo: 0 } });
    p.avanzar(M.segPorPasoPatrulla * 1.5); // a medio paso
    p.bus.enviar('ruido/microfono', { nivel: 0.5 });
    p.avanzar(0.1);
    expect(p.sim.estado.monstruo.estado).toBe('escucha');
    const quieto = p.sim.estado.monstruo.pos;
    p.avanzar(2);
    expect(p.sim.estado.monstruo.pos).toEqual(quieto); // escuchando no se mueve
    expect(p.sim.estado.monstruo.rumbo).toBeGreaterThan(270); // voltea hacia el ruido (al noroeste)

    p.bus.enviar('ruido/microfono', { nivel: 0 });
    p.avanzar(M.segEscucha - 0.2);
    expect(p.sim.estado.monstruo.estado).toBe('escucha');
    p.avanzar(0.4);
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');
    p.avanzar(M.segPorPasoPatrulla * 3);
    expect(p.sim.estado.monstruo.pos).toEqual({ x: 10.5, z: 2.5 }); // retomó su camino
    expect(p.de('sim/monstruoEstado').map((e) => [e.anterior, e.estado])).toEqual([
      ['patrulla', 'escucha'],
      ['escucha', 'patrulla'],
    ]);
  });

  it('no se congela con ruido sostenido en cuidado: va a investigar a paso lento y encuentra a Oído', () => {
    const p = crearPartida();
    p.bus.enviar('ruido/microfono', { nivel: 0.5 });
    p.avanzar(M.segEscucha - 0.5);
    expect(p.sim.estado.monstruo.estado).toBe('escucha');
    expect(p.de('sim/monstruoPaso')).toHaveLength(0);

    p.avanzar(0.5 + M.segPorPasoPatrulla * 3 + 0.3);
    expect(p.de('sim/monstruoPaso').length).toBeGreaterThanOrEqual(3); // ya salió a investigar
    expect(p.sim.estado.monstruo.estado).toBe('escucha'); // investigar se anuncia como «escucha»

    p.avanzar(M.segPorPasoPatrulla * 12);
    // Oído siguió haciendo ruido en el mismo sitio: no está escondido y lo atrapa.
    expect(p.sim.estado.fase).toBe('perdieron');
    expect(p.de('sim/monstruoPaso').every((m) => !m.rapido)).toBe(true);
    expect(p.de('sim/monstruoEstado').map((e) => [e.anterior, e.estado])).toEqual([
      ['patrulla', 'escucha'],
      ['escucha', 'atrapa'],
    ]);
  });

  it('investiga el último punto del ruido; si ahí ya no hay nadie, busca un rato y vuelve a merodear', () => {
    const p = crearPartida();
    p.bus.enviar('ruido/microfono', { nivel: 0.5 });
    p.avanzar(M.segEscucha + 0.5); // ya va a investigar hacia (3.5, 2.5)
    p.bus.enviar('ruido/microfono', { nivel: 0 });
    // Oído se quita en silencio a la esquina (1.5, 4.5).
    p.caminar(2);
    p.girar('izq');
    p.caminar(2);
    expect(p.sim.estado.oido.pos).toEqual({ x: 1.5, z: 4.5 });

    expect(p.hasta(() => pasoEn(p, 3.5, 2.5), 30)).toBe(true);
    expect(p.sim.estado.monstruo.estado).toBe('escucha'); // buscando, parado en el punto
    p.avanzar(M.segBusca - 0.5);
    expect(p.sim.estado.monstruo.pos).toEqual({ x: 3.5, z: 2.5 });
    p.avanzar(1);
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');
    expect(p.sim.estado.fase).toBe('jugando');
  });

  it('caza hacia el último punto donde oyó el ruido, no hacia donde está Oído ahora', () => {
    const p = crearPartida();
    p.bus.enviar('ruido/microfono', { nivel: 1 });
    p.avanzar(0.2);
    expect(p.sim.estado.monstruo.estado).toBe('caza');
    p.bus.enviar('ruido/microfono', { nivel: 0 });
    // Oído gritó en (3.5, 2.5) y se va callado a la esquina (1.5, 4.5).
    p.caminar(2);
    p.girar('izq');
    p.caminar(2);
    expect(p.sim.estado.oido.pos).toEqual({ x: 1.5, z: 4.5 });

    expect(p.hasta(() => p.sim.estado.monstruo.estado !== 'caza', 20)).toBe(true);
    // Llegó corriendo al punto del grito (no a la esquina) y ahí se quedó buscando.
    expect(p.sim.estado.monstruo.pos).toEqual({ x: 3.5, z: 2.5 });
    expect(p.sim.estado.monstruo.estado).toBe('escucha');
    expect(p.de('sim/monstruoPaso').at(-1)).toMatchObject({ pos: { x: 3.5, z: 2.5 }, rapido: true });
    expect(p.sim.estado.fase).toBe('jugando');

    p.avanzar(M.segBusca + 0.5);
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');
    expect(p.sim.estado.fase).toBe('jugando');
    expect(p.de('sim/monstruoEstado').map((e) => [e.anterior, e.estado])).toEqual([
      ['patrulla', 'caza'],
      ['caza', 'escucha'],
      ['escucha', 'patrulla'],
    ]);
  });

  it('mientras el ruido siga en peligro, el objetivo se actualiza y alcanza a Oído: atrapa y pierden', () => {
    const p = crearPartida();
    p.bus.enviar('ruido/microfono', { nivel: 1 });
    p.caminar(2); // se mueve, pero sigue gritando
    p.avanzar(8);
    const e = p.sim.estado;
    expect(e.fase).toBe('perdieron');
    expect(e.monstruo.estado).toBe('atrapa');
    expect(p.de('sim/fin')).toEqual([{ resultado: 'perdieron' }]);
    expect(p.de('sim/monstruoEstado').map((x) => x.estado)).toEqual(['caza', 'atrapa']);

    // Después de perder todo queda congelado y las órdenes se ignoran.
    const t = e.t;
    p.caminar(1);
    p.avanzar(2);
    expect(p.sim.estado.t).toBe(t);
    expect(p.sim.estado.oido.pos).toEqual(e.oido.pos);
    expect(p.sim.estado.monstruo.pos).toEqual(e.monstruo.pos);
  });

  it('cazando atrapa por contacto aunque Oído ya esté quieto y callado en el punto del ruido', () => {
    const p = crearPartida();
    p.bus.enviar('ruido/microfono', { nivel: 1 });
    p.avanzar(0.2);
    p.bus.enviar('ruido/microfono', { nivel: 0 });
    p.avanzar(7);
    expect(p.sim.estado.fase).toBe('perdieron');
  });

  it('las velocidades dejan escapar corriendo y no caminando', () => {
    expect(M.segPorPasoCaza).toBeGreaterThan(CONFIG.movimiento.segPorPasoCorriendo);
    expect(M.segPorPasoCaza).toBeLessThan(CONFIG.movimiento.segPorPaso);
    expect(M.segPorPasoPatrulla).toBeGreaterThan(CONFIG.movimiento.segPorPaso);
  });
});

describe('monstruo: esconderse', () => {
  it('no atrapa a un Oído quieto y en silencio aunque le pase por encima', () => {
    const p = crearPartida({ azar: AL_PASILLO() });
    pararseEnElCamino(p);
    // El monstruo sale de la guarida y cruza la casilla de Oído camino a (10.5, 2.5).
    expect(p.hasta(() => pasoEn(p, 10.5, 2.5), 40)).toBe(true);
    expect(pasoEn(p, 10.5, 3.5)).toBe(true);
    expect(p.sim.estado.fase).toBe('jugando');
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');
    expect(p.de('sim/monstruoEstado')).toHaveLength(0);
  });

  it('mover solo la cabeza no lo delata', () => {
    const p = crearPartida({ azar: AL_PASILLO() });
    pararseEnElCamino(p);
    expect(
      p.hasta(() => {
        p.bus.enviar('oido/girarFino', { grados: p.sim.estado.t % 2 < 1 ? 3 : -3 });
        return pasoEn(p, 10.5, 2.5);
      }, 40),
    ).toBe(true);
    expect(p.sim.estado.fase).toBe('jugando');
  });

  it('sí lo atrapa si se mueve cuando lo tiene encima', () => {
    const p = crearPartida({ azar: AL_PASILLO() });
    pararseEnElCamino(p);
    expect(p.hasta(() => pasoEn(p, 10.5, 4.5), 40)).toBe(true); // está en la casilla de al lado
    expect(p.sim.estado.fase).toBe('jugando');
    p.girar('izq'); // basta un giro
    p.avanzar(1);
    expect(p.sim.estado.fase).toBe('perdieron');
    expect(p.de('sim/monstruoEstado')).toEqual([expect.objectContaining({ estado: 'atrapa', anterior: 'patrulla' })]);
  });

  it('acabar de detenerse no basta: hay que llevar segQuietoParaOcultarse quieto', () => {
    const p = crearPartida({ azar: AL_PASILLO() });
    p.girar('der', 2);
    p.caminar(7);
    p.girar('der'); // (10.5, 2.5) mirando al sur: el monstruo vendrá de frente
    expect(p.hasta(() => pasoEn(p, 10.5, 4.5), 40)).toBe(true);
    // Da el paso hacia (10.5, 3.5) justo cuando el monstruo también va para allá.
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    p.avanzar(CONFIG.movimiento.segPorPaso + 0.1);
    expect(p.sim.estado.fase).toBe('perdieron');
  });

  it('sí lo atrapa si hace ruido con el monstruo cerca', () => {
    const p = crearPartida({ azar: AL_PASILLO() });
    pararseEnElCamino(p);
    expect(p.hasta(() => pasoEn(p, 10.5, 4.5), 40)).toBe(true);
    p.bus.enviar('ruido/microfono', { nivel: 0.9 });
    p.avanzar(1);
    expect(p.sim.estado.fase).toBe('perdieron');
  });

  it('un choque contra la pared también lo delata', () => {
    const p = crearPartida({ azar: AL_PASILLO() });
    pararseEnElCamino(p);
    p.caminar(1); // (10.5, 4.5): en el marco de la puerta de la guarida
    p.girar('izq'); // mira al este: tiene la pared del marco enfrente
    // El monstruo ya viene entrando a su casilla y Oído, quieto y callado, sigue a salvo…
    expect(p.hasta(() => p.sim.estado.monstruo.pos.z < 5.2, 40)).toBe(true);
    expect(p.sim.estado.fase).toBe('jugando');
    // …hasta que intenta dar un paso y topa con la pared.
    p.bus.enviar('oido/mover', { dir: 'adelante', corriendo: false });
    expect(p.de('sim/choque')).toHaveLength(1);
    expect(p.sim.estado.ruido.zona).toBe('silencio'); // el golpe solo no llega a «cuidado»
    p.avanzar(0.05);
    expect(p.sim.estado.fase).toBe('perdieron');
  });
});

describe('monstruo: puertas', () => {
  it('una puerta cerrada entre los dos impide que atrape, aunque esté cazando', () => {
    const p = crearPartida();
    p.puerta(1); // Oído encerrado en su cuarto
    p.girar('der', 2);
    p.caminar(1); // (4.5, 2.5): pegado a la puerta cerrada
    p.bus.enviar('ruido/microfono', { nivel: 1 });
    p.avanzar(12);
    expect(p.sim.estado.monstruo.estado).toBe('caza');
    // Llegó hasta la puerta cerrada del cuarto y ahí se queda al acecho.
    expect(p.sim.estado.monstruo.pos).toEqual({ x: 6.5, z: 2.5 });
    expect(p.sim.estado.fase).toBe('jugando');

    // Si se callan, busca un rato y se va a merodear; no entra al cuarto.
    p.bus.enviar('ruido/microfono', { nivel: 0 });
    p.avanzar(M.segBusca + 1);
    expect(p.sim.estado.monstruo.estado).toBe('patrulla');
    for (let i = 0; i < 120; i++) {
      p.avanzar(1);
      expect(p.sim.estado.monstruo.cuartoId).not.toBe('cuarto1');
    }
  });

  it('encerrado: con la puerta de la guarida cerrada no sale, ni merodeando ni cazando', () => {
    const p = crearPartida({ monstruo: { segInicioTranquilo: 0 } });
    p.puerta(2);
    for (let i = 0; i < 60; i++) {
      p.avanzar(1);
      expect(p.sim.estado.monstruo.cuartoId).toBe('guarida');
      expect(p.sim.estado.monstruo.pos.z).toBeGreaterThan(5);
    }
    // Encerrado sigue dando vueltas por su guarida.
    expect(p.de('sim/monstruoPaso').length).toBeGreaterThan(3);

    p.bus.enviar('ruido/microfono', { nivel: 1 });
    for (let i = 0; i < 10; i++) {
      p.avanzar(1);
      expect(p.sim.estado.monstruo.cuartoId).toBe('guarida');
      expect(p.sim.estado.monstruo.pos.z).toBeGreaterThan(5);
    }
    expect(p.sim.estado.monstruo.estado).toBe('caza');
    expect(p.sim.estado.fase).toBe('jugando');
    // Se pegó lo más posible al ruido (Oído está al noroeste).
    expect(p.sim.estado.monstruo.pos).toEqual({ x: 9.5, z: 5.5 });

    // Si Vista le abre, recalcula la ruta y sale a cazar.
    p.puerta(2);
    p.avanzar(8);
    expect(p.sim.estado.fase).toBe('perdieron');
  });

  it('si le cierran la guarida estando fuera, sigue merodeando por lo que le queda', () => {
    const p = crearPartida({ azar: AL_PASILLO(), monstruo: { segInicioTranquilo: 0 } });
    p.avanzar(M.segPorPasoPatrulla * 4 + 0.5); // ya está en (10.5, 2.5)
    p.puerta(2);
    expect(p.sim.estado.puertas['p-guarida']).toBe(false);
    const antes = p.de('sim/monstruoPaso').length;
    for (let i = 0; i < 120; i++) {
      p.avanzar(1);
      expect(p.sim.estado.monstruo.cuartoId).not.toBe('guarida');
    }
    expect(p.de('sim/monstruoPaso').length - antes).toBeGreaterThan(20);
  });
});
