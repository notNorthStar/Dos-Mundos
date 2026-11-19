import { describe, expect, it } from 'vitest';
import { ALA_ESTE } from '../src/data/alaEste';
import {
  anchoMapa,
  chocaCirculo,
  cuartoEn,
  esPared,
  hayPared,
  puertaEn,
  puertasIniciales,
  rumboHacia,
  vectorDeRumbo,
} from '../src/shared/mapaUtil';

const mapa = ALA_ESTE;
const puertas = puertasIniciales(mapa);

describe('mapa del ala este', () => {
  it('todas las filas miden lo mismo', () => {
    for (const fila of mapa.celdas) expect(fila.length).toBe(anchoMapa(mapa));
  });

  it('cada puerta está sobre una casilla P y cada P tiene puerta', () => {
    for (const p of mapa.puertas) expect(mapa.celdas[p.casilla.cz]![p.casilla.cx]).toBe('P');
    mapa.celdas.forEach((fila, cz) =>
      [...fila].forEach((c, cx) => {
        if (c === 'P') expect(puertaEn(mapa, cx, cz)).toBeDefined();
      }),
    );
  });

  it('los cuartos solo cubren piso', () => {
    for (const c of mapa.cuartos)
      for (let cz = c.desde.cz; cz <= c.hasta.cz; cz++)
        for (let cx = c.desde.cx; cx <= c.hasta.cx; cx++) expect(mapa.celdas[cz]![cx]).toBe('.');
  });

  it('inicios, objetos, ruta y cámaras caen en piso libre', () => {
    const puntos = [mapa.inicioOido.pos, mapa.inicioMonstruo, ...mapa.rutaPatrulla, ...mapa.objetos.map((o) => o.pos), ...mapa.camaras.map((c) => c.pos)];
    for (const p of puntos) expect(esPared(mapa, puertas, Math.floor(p.x), Math.floor(p.z))).toBe(false);
  });

  it('las cámaras apuntan a puertas que existen', () => {
    for (const c of mapa.camaras) if (c.puertaId) expect(mapa.puertas.some((p) => p.id === c.puertaId)).toBe(true);
  });
});

describe('mapaUtil', () => {
  it('una puerta cerrada es pared y abierta no', () => {
    expect(esPared(mapa, puertas, 5, 2)).toBe(false);
    expect(esPared(mapa, { ...puertas, 'p-cuarto1': false }, 5, 2)).toBe(true);
    expect(esPared(mapa, puertas, 17, 9)).toBe(true); // la salida empieza cerrada
    expect(esPared(mapa, puertas, -1, 0)).toBe(true);
  });

  it('cuartoEn ubica cuartos y casillas de puerta', () => {
    expect(cuartoEn(mapa, { x: 3.5, z: 2.5 }).id).toBe('cuarto1');
    expect(cuartoEn(mapa, { x: 10.5, z: 2.5 }).id).toBe('pasillo');
    expect(cuartoEn(mapa, { x: 5.5, z: 2.5 }).id).toBe('cuarto1');
  });

  it('hayPared detecta la pared entre el cuarto y el pasillo, salvo por la puerta', () => {
    expect(hayPared(mapa, puertas, { x: 3.5, z: 3.5 }, { x: 8.5, z: 3.5 })).toBe(true);
    expect(hayPared(mapa, puertas, { x: 3.5, z: 2.5 }, { x: 8.5, z: 2.5 })).toBe(false);
    expect(hayPared(mapa, { ...puertas, 'p-cuarto1': false }, { x: 3.5, z: 2.5 }, { x: 8.5, z: 2.5 })).toBe(true);
  });

  it('chocaCirculo respeta el radio', () => {
    expect(chocaCirculo(mapa, puertas, { x: 1.5, z: 1.5 }, 0.3)).toBe(false);
    expect(chocaCirculo(mapa, puertas, { x: 1.2, z: 1.5 }, 0.3)).toBe(true);
  });

  it('rumbo y vector son coherentes', () => {
    expect(vectorDeRumbo(90).x).toBeCloseTo(1);
    expect(vectorDeRumbo(0).z).toBeCloseTo(-1);
    expect(rumboHacia({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(90);
    expect(rumboHacia({ x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(180);
    expect(rumboHacia({ x: 0, z: 0 }, { x: -1, z: 0 })).toBeCloseTo(270);
  });
});
