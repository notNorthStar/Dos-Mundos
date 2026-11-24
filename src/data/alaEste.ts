import type { Mapa } from '../shared/contratos';

/**
 * «El ala este» (DISENO.md §10). 21 × 11 casillas de 1 m. Norte arriba.
 *
 *        x: 0         1         2
 *           012345678901234567890
 *     z 0   #####################
 *       1   #....#.........#....#     Cuarto 1 (x1-4)  · Pasillo (x6-14) · Bodega (x16-19)
 *       2   #....P.........P....#     Puertas: (5,2) cuarto↔pasillo · (15,2) pasillo↔bodega
 *       3   #....#.........#....#
 *       4   #....#####P#####....#     (10,4) pasillo↔guarida
 *       5   #########...#####P###     (17,5) bodega↔vestíbulo
 *       6   #########...##......#     Guarida (x9-11) · Vestíbulo de salida (x14-19)
 *       7   #########...##......#
 *       8   ##############......#
 *       9   #################P###     (17,9) SALIDA (con llave)
 *      10   #####################
 */
export const ALA_ESTE: Mapa = {
  id: 'ala-este',
  nombre: 'El ala este',
  celdas: [
    '#####################',
    '#....#.........#....#',
    '#....P.........P....#',
    '#....#.........#....#',
    '#....#####P#####....#',
    '#########...#####P###',
    '#########...##......#',
    '#########...##......#',
    '##############......#',
    '#################P###',
    '#####################',
  ],
  cuartos: [
    { id: 'cuarto1', nombre: 'Cuarto', desde: { cx: 1, cz: 1 }, hasta: { cx: 4, cz: 4 }, superficie: 'madera', reverb: 'chico' },
    { id: 'pasillo', nombre: 'Pasillo', desde: { cx: 6, cz: 1 }, hasta: { cx: 14, cz: 3 }, superficie: 'concreto', reverb: 'pasillo' },
    { id: 'bodega', nombre: 'Bodega', desde: { cx: 16, cz: 1 }, hasta: { cx: 19, cz: 4 }, superficie: 'metal', reverb: 'mediano' },
    { id: 'guarida', nombre: 'Guarida', desde: { cx: 9, cz: 5 }, hasta: { cx: 11, cz: 7 }, superficie: 'concreto', reverb: 'chico' },
    { id: 'vestibulo', nombre: 'Salida', desde: { cx: 14, cz: 6 }, hasta: { cx: 19, cz: 8 }, superficie: 'concreto', reverb: 'mediano' },
  ],
  puertas: [
    { id: 'p-cuarto1', nombre: 'Puerta del cuarto', casilla: { cx: 5, cz: 2 }, entre: ['cuarto1', 'pasillo'], abiertaAlInicio: true, controlable: true, esSalida: false },
    { id: 'p-guarida', nombre: 'Puerta de la guarida', casilla: { cx: 10, cz: 4 }, entre: ['pasillo', 'guarida'], abiertaAlInicio: true, controlable: true, esSalida: false },
    { id: 'p-bodega', nombre: 'Puerta de la bodega', casilla: { cx: 15, cz: 2 }, entre: ['pasillo', 'bodega'], abiertaAlInicio: true, controlable: true, esSalida: false },
    { id: 'p-vestibulo', nombre: 'Puerta del vestíbulo', casilla: { cx: 17, cz: 5 }, entre: ['bodega', 'vestibulo'], abiertaAlInicio: true, controlable: true, esSalida: false },
    { id: 'p-salida', nombre: 'Salida', casilla: { cx: 17, cz: 9 }, entre: ['vestibulo', 'vestibulo'], abiertaAlInicio: false, controlable: false, esSalida: true },
  ],
  camaras: [
    { numero: 1, nombre: 'CAM 1 · CUARTO', cuartoId: 'cuarto1', pos: { x: 1.2, y: 2.6, z: 4.8 }, mira: { x: 3.6, y: 0.6, z: 2.2 }, puertaId: 'p-cuarto1' },
    { numero: 2, nombre: 'CAM 2 · PASILLO OESTE', cuartoId: 'pasillo', pos: { x: 6.2, y: 2.6, z: 1.2 }, mira: { x: 10.5, y: 0.6, z: 3.2 }, puertaId: 'p-guarida' },
    { numero: 3, nombre: 'CAM 3 · PASILLO ESTE', cuartoId: 'pasillo', pos: { x: 14.8, y: 2.6, z: 3.8 }, mira: { x: 11, y: 0.6, z: 1.8 }, puertaId: 'p-bodega' },
    { numero: 4, nombre: 'CAM 4 · BODEGA', cuartoId: 'bodega', pos: { x: 16.2, y: 2.6, z: 1.2 }, mira: { x: 18.4, y: 0.4, z: 3.6 }, puertaId: 'p-vestibulo' },
    { numero: 5, nombre: 'CAM 5 · SALIDA', cuartoId: 'vestibulo', pos: { x: 14.2, y: 2.6, z: 6.2 }, mira: { x: 17.5, y: 0.8, z: 8.8 } },
  ],
  objetos: [
    // A la derecha de Oído al despertar (mira al oeste): un paso al norte.
    { id: 'decibelimetro', pos: { x: 3.5, z: 1.5 }, enElPiso: false },
    { id: 'llave', pos: { x: 18.5, z: 3.5 }, enElPiso: true },
  ],
  // Despierta mirando al oeste; la puerta queda 2 m detrás (DISENO.md §10, paso 3).
  inicioOido: { pos: { x: 3.5, z: 2.5 }, rumbo: 270 },
  inicioMonstruo: { x: 10.5, z: 6.5 },
  // Puntos de merodeo: el monstruo elige uno al azar, camina hasta ahí, hace una pausa y elige
  // otro. Repartidos por todos los cuartos para que no viva en el pasillo que hay que cruzar.
  rutaPatrulla: [
    // Guarida
    { x: 10.5, z: 6.5 },
    { x: 9.5, z: 7.5 },
    // Pasillo
    { x: 7.5, z: 1.5 },
    { x: 10.5, z: 2.5 },
    { x: 13.5, z: 3.5 },
    // Cuarto
    { x: 1.5, z: 1.5 },
    { x: 2.5, z: 4.5 },
    // Bodega
    { x: 19.5, z: 1.5 },
    { x: 16.5, z: 4.5 },
    // Vestíbulo de salida
    { x: 14.5, z: 7.5 },
    { x: 19.5, z: 6.5 },
  ],
};
