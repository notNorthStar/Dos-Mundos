# Contratos entre módulos

> Versión 1 · 2026-11-19. Para el equipo y para las IAs que trabajen en paralelo.
> **La fuente exacta de los tipos es [`src/shared/contratos.ts`](../src/shared/contratos.ts).** Este documento explica cómo usarlos y quién es dueño de qué.
> Si necesitas un mensaje, un campo o un valor de configuración que no existe, **no lo inventes en tu módulo**: pídelo a la integración y se agrega aquí primero.

## 1. Las tres partes y el bus

```
 ┌──────────────┐   oido/*              ┌──────────────┐              vista/* radio/*  ┌──────────────┐
 │ Cliente Oído │ ───────────────────▶ │              │ ◀──────────────────────────── │ Cliente Vista│
 │ teclado,mouse│                       │  Simulación  │                               │ cámaras, HUD │
 │ audio 3D     │ ◀─────────────────── │ mundo,puertas│ ────────────────────────────▶ │ radio, señas │
 └──────────────┘   sim/*               │ ruido,monstruo│             sim/*            └──────────────┘
        ▲                               └──────────────┘
        │ ruido/microfono                      ▲
   ┌────┴─────┐                                │ todo pasa por el Bus
   │ Micrófono│                                │ (MVP: BusLocal · fase 2: WebSocket)
   └──────────┘
```

- **La simulación es la única dueña del estado.** Los clientes mandan órdenes y dibujan o suenan lo que la simulación anuncia. Un cliente nunca cambia el estado por su cuenta ni llama funciones de otro cliente.
- **Los clientes no se importan entre sí** ni importan la simulación. Solo comparten `src/shared/`, `src/config.ts` y el `Bus`.
- **Todo mensaje es JSON plano.** Nada de clases, funciones ni objetos de Three.js: en la fase 2 cruza un WebSocket. Las pruebas usan `new BusLocal({ copiar: true })` para detectarlo.
- **La simulación no toca el DOM, WebAudio ni Three.js**: es lógica pura y corre en Node para las pruebas.

## 2. Geometría

| Tema | Convención |
|---|---|
| Unidades | Metros. **Un paso = 1 m = 1 casilla** |
| Ejes | `+x` = este, `+z` = sur, `+y` = arriba (los de Three.js vistos desde arriba con el norte hacia `−z`) |
| Casillas | La casilla `(cx, cz)` va de `(cx, cz)` a `(cx+1, cz+1)`; su centro es `(cx+0.5, cz+0.5)` |
| Rumbo | Grados en `[0, 360)`: 0 = norte (`−z`), 90 = este, 180 = sur, 270 = oeste. Girar a la derecha suma |
| Posición de Oído | Continua (por el giro fino con el mouse). Un paso avanza 1 m hacia el rumbo; si hay pared se detiene antes y la simulación emite `sim/choque` |
| Mapa | `Mapa.celdas`: filas de norte a sur; `#` pared, `.` piso, `P` casilla de puerta |

Para pasar de rumbo a vector: `dx = sin(rumbo)`, `dz = −cos(rumbo)` (con el rumbo en radianes).
En Three.js, la cámara de Oído usa `rotation.y = −rumbo` (en radianes).

## 3. Mensajes del bus

El prefijo dice quién emite. **Solo la simulación emite `sim/*`.**

### Órdenes hacia la simulación
| Mensaje | Emite | Datos | Qué pasa |
|---|---|---|---|
| `oido/mover` | Cliente Oído | `dir`, `corriendo` | Un paso de 1 m. Se ignora si Oído ya se está moviendo. Correr suma ruido |
| `oido/girar` | Cliente Oído | `sentido` | Giro de 90° (`CONFIG.movimiento.gradosPorGiro`) |
| `oido/girarFino` | Cliente Oído | `grados` | Giro fino con el mouse |
| `oido/interactuar` | Cliente Oído | — | Agarra el objeto al alcance o usa la puerta de enfrente |
| `vista/camara` | Cliente Vista | `numero` (1–5) | Cambia la cámara activa |
| `vista/puerta` | Cliente Vista | — | Abre o cierra la puerta de la cámara activa. Cerrar es un portazo (ruido) |
| `radio/mensaje` | Panel del radio | `fichas`, `texto`, `emergencia` | La simulación no lo usa; el audio de Oído lo dice por el radio |
| `ruido/microfono` | Micrófono | `nivel` 0–1 | Se combina con el ruido del juego |
| `juego/iniciar` · `juego/reiniciar` | `main.ts` | — | Empieza o reinicia la partida |

### Hechos que anuncia la simulación
| Mensaje | Cuándo | Lo usan |
|---|---|---|
| `sim/estado` | ~15 veces por segundo y en cada cambio de fase. Foto completa (`EstadoJuego`) | Todos, para dibujar y posicionar el audio |
| `sim/paso` | Oído terminó un paso | Audio (pisada según la superficie) |
| `sim/choque` | Oído topó con pared o puerta cerrada | Audio (golpe) |
| `sim/puerta` | Una puerta cambió | Audio (rechinido o portazo), Vista (HUD) |
| `sim/puertaBloqueada` | Oído probó la salida sin llave | Audio |
| `sim/objeto` | Oído agarró algo | Audio, Vista (HUD) |
| `sim/nadaQueAgarrar` | Clic sin nada al alcance | Audio |
| `sim/monstruoPaso` | Cada paso del monstruo | Audio (pasos pesados en 3D) |
| `sim/monstruoEstado` | El monstruo cambió de estado | Audio (respiración, gruñido), Vista (estática) |
| `sim/fin` | Ganaron o perdieron | Todos |

**Estado continuo contra hechos sueltos:** lo que dura (posiciones, puertas, ruido, estado del monstruo) se lee de `sim/estado`; lo que ocurre en un instante (una pisada, un portazo) llega como hecho. No deduzcas hechos comparando estados.

**El monstruo no se dibuja.** `sim/estado` trae su posición porque el audio la necesita y porque Vista decide con ella qué cámara mete estática, pero ni la pantalla de Vista ni la de Oído lo muestran (DISENO.md §7).

## 4. Interfaces de cada sistema

Todos los sistemas con pantalla o sonido devuelven un `Sistema` (`actualizar(dtSeg)` y `destruir()`), y `main.ts` los llama una vez por cuadro. Las firmas de abajo son el contrato de integración.

| Sistema | Archivo de entrada | Firma |
|---|---|---|
| Simulación | `src/sim/Simulacion.ts` | `new Simulacion(bus, mapa, config)` · `actualizar(dtSeg)` · `estado: EstadoJuego` (solo lectura) |
| Mapa del ala este | `src/data/alaEste.ts` | `export const ALA_ESTE: Mapa` |
| Consultas del mapa | `src/shared/mapaUtil.ts` | `esPared(mapa, puertas, cx, cz)` · `chocaCirculo(mapa, puertas, pos, radio)` · `cuartoEn(mapa, pos)` · `hayPared(mapa, puertas, a, b)` (línea de vista, para la oclusión) · `vectorDeRumbo` · `rumboHacia` · `distancia` |

Valores propios de un módulo que no estén en `src/config.ts` van en un archivo `ajustes.ts` dentro de la carpeta del módulo (nunca números sueltos en la lógica); la integración los pasa después a `config.ts` si conviene.

| | | |
|---|---|---|
| Cliente Oído (pantalla y controles) | `src/oido/index.ts` | `crearClienteOido(bus, contenedor, mapa): Sistema` |
| Cliente Vista (cámaras, mapa, HUD) | `src/vista/index.ts` | `crearClienteVista(bus, contenedor, mapa): Sistema` |
| Mundo 3D compartido | `src/mundo3d/index.ts` | `construirMundo(mapa): { escena, actualizar(estado) }` (geometría y texturas PSX; lo usan las dos pantallas, cada una con su escena) |
| Audio de Oído | `src/audio/index.ts` | `crearAudio(bus, mapa, ctx: AudioContext, voz: VozRadio): Sistema` |
| Voz del radio | `src/radio/voz.ts` | `crearVozSintetica(): VozRadio` (después: `crearVozGrabada(ctx)`) |
| Panel del radio | `src/radio/index.ts` | `crearPanelRadio(bus, contenedor, lsm: LsmEngine \| null): Sistema` · `fichasATexto(fichas): string` |
| Conteo de dedos | `src/radio/dedos.ts` | `contarDedos(frame: HandFrame): 0–5` |
| Micrófono | `src/ruido/microfono.ts` | `crearMicrofono(bus, ctx): { calibrar(): Promise<void>; activo: boolean } & Sistema` |

Reglas de las interfaces:
- **El radio suena del lado de Oído.** El panel de Vista solo manda `radio/mensaje`; el audio lo dice con `VozRadio` y le pone la estática.
- **Sin cámara** (`lsm = null`), el panel del radio funciona con el teclado: una letra o un número sustituyen a la seña.
- **Sin micrófono**, `crearMicrofono` no falla: `activo` queda en `false` y no manda nada. El ruido del juego sigue funcionando.
- **Teclado:** cada cliente escucha solo sus teclas de `CONFIG.teclas`. Con el detector de señas abierto, el panel del radio captura las letras y los números (los números dejan de cambiar de cámara).

## 5. Reglas de la simulación que los clientes pueden dar por hechas

- Un paso dura `CONFIG.movimiento.segPorPaso`; durante ese tiempo `oido.moviendose` es `true` y la posición de `sim/estado` va interpolada. `sim/paso` llega al terminar.
- El ruido es un número de 0 a 1: el máximo entre el micrófono y el ruido del juego, que baja solo con el tiempo. Las zonas salen de `CONFIG.ruido`.
- El monstruo: `patrulla` → `escucha` (ruido en cuidado) → `caza` (ruido en peligro) → `atrapa` (alcanza a Oído). Sin ruido vuelve a `patrulla`. No atraviesa puertas cerradas.
- Interactuar alcanza 1.2 m al frente. La salida solo se abre con la llave y abrirla termina la partida con `ganaron`.

## 6. Dueños de archivos

Nunca dos escritores sobre el mismo archivo. Si necesitas algo de otro dueño, pídelo.

| Carpeta o archivo | Dueño | Hito |
|---|---|---|
| `src/shared/` (`contratos.ts`, `mapaUtil.ts`), `src/data/alaEste.ts`, `src/bus/`, `src/main.ts`, `index.html`, `package.json`, `docs/`, `test/bus.test.ts`, `test/mapa.test.ts` | **Integración** (sesión principal) | 0 |
| `src/config.ts` | Integración. Cada dueño propone los valores de **su sección** | 0 |
| `src/sim/`, `test/sim/` | Simulación | 1 y 5 |
| `src/mundo3d/`, `src/oido/`, `src/vista/` | Pantallas | 2 |
| `src/audio/` | Audio | 3 |
| `src/radio/`, `test/radio/` | Radio | 4 |
| `src/ruido/` | Micrófono | 5 |
| `src/lsm/` | **Nadie**: es el módulo de ECOS tal cual. No se cambian reglas ni umbrales |  |

## 7. Pruebas

- `npm test` corre Vitest sobre `test/**/*.test.ts` en Node, sin navegador.
- Cubren la lógica: bus, movimiento y colisiones, ruido, estados del monstruo, objetos y fin de partida, composición de mensajes del radio y conteo de dedos.
- El audio y el 3D se verifican jugando en Chrome con audífonos.
