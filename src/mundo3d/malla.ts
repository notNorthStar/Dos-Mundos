/**
 * Constructor de mallas fusionadas: junta muchos cuadriláteros y cajas en UNA geometría
 * (un draw call por material). Cada vértice lleva posición, normal, uv y color.
 */
import * as THREE from 'three';

export type Color3 = readonly [number, number, number];

export const BLANCO: Color3 = [1, 1, 1];

export class ConstructorMalla {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly col: number[] = [];
  private readonly idx: number[] = [];

  get vacia(): boolean {
    return this.idx.length === 0;
  }

  /**
   * Cuadrilátero. Vértices vistos de frente: a = abajo-izquierda, b = abajo-derecha,
   * c = arriba-derecha, d = arriba-izquierda. `n` es la normal deseada: si el orden de los
   * vértices quedó al revés, se voltean los triángulos (así nunca queda una cara invisible).
   */
  cuad(
    a: Color3,
    b: Color3,
    c: Color3,
    d: Color3,
    n: Color3,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    color: Color3 = BLANCO,
  ): void {
    const base = this.pos.length / 3;
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    for (let i = 0; i < 4; i++) {
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(color[0], color[1], color[2]);
    }
    // Normal geométrica de (b−a) × (d−a) contra la normal pedida.
    const e1x = b[0] - a[0];
    const e1y = b[1] - a[1];
    const e1z = b[2] - a[2];
    const e2x = d[0] - a[0];
    const e2y = d[1] - a[1];
    const e2z = d[2] - a[2];
    const gx = e1y * e2z - e1z * e2y;
    const gy = e1z * e2x - e1x * e2z;
    const gz = e1x * e2y - e1y * e2x;
    if (gx * n[0] + gy * n[1] + gz * n[2] >= 0) {
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }

  /**
   * Caja alineada a los ejes, de esquina (x0,y0,z0) a (x1,y1,z1).
   * `uvPorCara`: true = cada cara muestra la textura completa una vez; false = la textura se
   * repite `repeticion` veces por metro.
   */
  caja(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    color: Color3 = BLANCO,
    uvPorCara = false,
    repeticion = 1,
  ): void {
    const sx = uvPorCara ? 1 : (x1 - x0) * repeticion;
    const sy = uvPorCara ? 1 : (y1 - y0) * repeticion;
    const sz = uvPorCara ? 1 : (z1 - z0) * repeticion;
    // +x
    this.cuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], 0, 0, sz, sy, color);
    // −x
    this.cuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], 0, 0, sz, sy, color);
    // +z
    this.cuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], 0, 0, sx, sy, color);
    // −z
    this.cuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], 0, 0, sx, sy, color);
    // +y
    this.cuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], 0, 0, sx, sz, color);
    // −y
    this.cuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], 0, 0, sx, sz, color);
  }

  /** Caja dada por su centro y su tamaño. */
  cajaCentro(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    color: Color3 = BLANCO,
    uvPorCara = false,
    repeticion = 1,
  ): void {
    this.caja(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, color, uvPorCara, repeticion);
  }

  construir(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
