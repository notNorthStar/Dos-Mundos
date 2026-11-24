# AGENTS.md — Dos Mundos (Listick Games)

> Contexto común para **todas las IAs** que trabajen en este proyecto (Claude Code, subagentes y otras).
> Léelo completo antes de escribir código o generar assets. **Comunícate con el equipo en español.**
> Si algo contradice una instrucción directa del equipo, gana el equipo; luego actualiza el documento correspondiente.

## 0. Fuentes de verdad

| Documento | Qué define | Regla |
|---|---|---|
| `docs/DISENO.md` | **El juego completo**: premisa, roles, interfaces, señas, radio, ruido, monstruo, partida de ejemplo, decisiones técnicas, alcance del MVP | Fuente oficial del diseño. Lo marcado `[PROPUESTA]` lo puede cambiar el equipo |
| Este archivo | Reglas técnicas, forma de trabajar y estado del proyecto | Gana en temas técnicos y de proceso |
| `docs/CONTRATOS.md` y `src/shared/contratos.ts` | Mensajes del bus, geometría, interfaces de cada sistema y dueños de archivos | Léelo antes de programar un módulo. No inventes mensajes: pídelos a la integración |
| `C:\Users\David\Desktop\ClaudeCode\ECOS-Game` | Proyecto anterior del mismo equipo (ECOS, 2.º lugar en la Game Jam ANIEI 2026). **De ahí se reutiliza el módulo de LSM** y la forma de trabajar | Solo lectura: **no modifiques nada de ese repositorio** |

## 1. Qué es

**Dos Mundos** es un juego cooperativo de terror en 3D (estilo PSX) para dos personas: un **Five Nights at Freddy's cooperativo**.

- **Jugador1 = Vista.** La persona que ve el juego. En la historia está encerrada en la caseta de vigilancia: ve las cámaras y controla las puertas, **pero no puede hablar** (un gas le quitó la voz). Oye el edificio por la bocina de su caseta (desde el 2026-11-24 también usa audífonos). Se comunica **con señas de la Lengua de Señas Mexicana** frente a la cámara: arma un mensaje, lo confirma y le llega a Oído por el radio.
- **Jugador2 = Oído.** La persona que juega **con los ojos vendados y audífonos**. En la historia está a oscuras dentro del edificio, con un monstruo que caza por el ruido. Se mueve **por casillas con WASD o flechas** (el mouse solo gira la cabeza), se orienta con **audio espacial 3D** y con una **pulsera háptica**, y obedece (o no) lo que Vista le dice por el radio.

Es un proyecto de la universidad: se presentará en un **foro de proyectos** y su rubrica pide **al menos dos interfaces además de la gráfica**. Dos Mundos usa cuatro: **gestual** (señas), **auditiva espacial 3D**, **de voz** (radio sintetizado, transcripción y volumen como ruido) y **háptica** (pulsera con Arduino).

Todo el detalle está en `docs/DISENO.md`. **Léelo antes de empezar.**

## 2. Stack técnico (decidido con el equipo)

| Pieza | Elección |
|---|---|
| Motor | **Three.js** (última estable en npm) |
| Lenguaje y herramientas | **TypeScript estricto + Vite** (`base: './'`) |
| Estilo visual | **PSX horror**: render a baja resolución escalado sin suavizado, polígonos simples, texturas pixeladas, niebla densa, temblor de vértices opcional y filtro VHS/CRT en las cámaras de Vista |
| Arte 3D | Generado **por código** por la IA (geometría procedural y texturas generadas). Si se usa algún asset externo, solo CC0 y registrado en `CREDITOS.md` |
| Audio | **WebAudio**: `PannerNode` en modo HRTF por fuente, atenuación por distancia, **oclusión** (filtro de graves si hay pared entre la fuente y Oído), **reverberación por cuarto** (`ConvolverNode`), pasos según el piso. El radio va en mono con filtro de banda y estática |
| Señas | **Módulo `ecos-lsm`** del proyecto ECOS (ver §3) |
| Voz | Radio: **clips grabados** en `public/radio/` (generados una vez con Gemini TTS, `tools/generar-voces.mjs`; la clave va en `.env.local`, nunca en el repo), con `speechSynthesis` de respaldo. Reconocimiento (fase 2): Web Speech API para prototipo; **Vosk** con gramática cerrada para el foro (sin internet) |
| Ruido | Volumen del micrófono (RMS en dBFS) contra un ruido base calibrado al inicio |
| Red | **Una PC** (pantalla y teclado divididos) o **dos PC**: un relevo WebSocket dentro del servidor de Vite (`tools/relevo.ts`), por HTTPS con `npm run red`; la PC de Oído simula el juego y le manda el estado a Vista |
| Háptica | Arduino + 2 motores de vibración, conectado por **Web Serial** (Chrome) a la PC de Oído. Fase 2 |
| Pruebas | Windows, Chrome. Audífonos de diadema obligatorios para probar el audio 3D |

**Arquitectura obligatoria desde el día uno:** separar en código el **cliente de Vista**, el **cliente de Oído** y la **simulación** (mundo, monstruo, puertas, ruido), comunicados por un **bus de mensajes** con una interfaz única. En el MVP el bus es local (en memoria); en la fase 2 se cambia por WebSocket **sin tocar la lógica del juego**.

### 2.1 Advertencias técnicas conocidas
- **Dos ventanas en una PC no sirven para jugar a la vez**: el sistema operativo solo manda el teclado a la ventana activa. Por eso el MVP es una sola página con pantalla dividida.
- **No uses Ctrl** en los controles (Ctrl+W cierra la pestaña y no se puede bloquear). Bloquea Tab, Alt y el menú contextual como en ECOS.
- **WebAudio y el micrófono solo arrancan después de un clic** del usuario: pon una pantalla de inicio con botón.
- **La R y la U de LSM se confunden** en el detector (documentado en ECOS). El sistema de confirmación de Vista lo mitiga; aun así, no asignes acciones críticas a una sola de las dos sin confirmación.
- PowerShell: **no uses `Set-Content -Encoding utf8`** (mete BOM). Usa la herramienta Write o Node.

## 3. Módulo de LSM (reutilizar, no reescribir)

La detección de LSM ya existe, está calibrada con la cámara del equipo y probada en ECOS:
- Código: `C:\Users\David\Desktop\ClaudeCode\ECOS-Game\ecos-lsm\` (guía: `ecos-lsm/README.md`).
- Integración: `C:\Users\David\Desktop\ClaudeCode\ECOS-Game\docs\MODULO_LSM.md`.

Cópialo a este proyecto (`src/lsm/` + `public/mediapipe/hand_landmarker.task` + el script de setup de MediaPipe), igual que en ECOS. **No cambies umbrales a ciegas** y **no inventes formas de mano**. Reconoce A B C D E F G H I L M N O P R S T U V W Y y Z. Si una letra falla, pide al equipo una captura con **F3** (`lsm.explain()`).

## 4. Forma de trabajar (la misma que funcionó en ECOS)

1. **Primero las dudas.** Al empezar algo nuevo, pregunta lo que no esté claro con `AskUserQuestion` (opciones concretas, la recomendada primero).
2. **Plan corto y aprobación.** Presenta el plan por hitos y espera el visto bueno antes de programar.
3. **Contratos antes que código.** Para trabajo en paralelo, escribe primero los contratos entre módulos (`docs/CONTRATOS.md`): tipos de mensajes del bus, eventos, interfaces de cada sistema y quién es dueño de qué archivo.
4. **Subagentes en paralelo**, cada uno con archivos propios que no se pisen:
   - Varía el modelo según el trabajo: **Fable 5.2** para lo más difícil o central (simulación, lógica del monstruo, 3D, integración) y **Opus 5.5** para sistemas bien acotados por los contratos (audio espacial, radio, micrófono, red, contenido).
   - Si un subagente necesita tocar archivos de otro, se integra después; nunca dos escritores sobre el mismo archivo.
5. **Integrar y probar en el navegador.** Abre el juego con el preview, juega el reto completo, revisa la consola y arregla. Las pruebas automáticas cubren la lógica (movimiento por casillas, ruido, monstruo, bus de mensajes); el audio y el 3D se verifican jugando.
6. **Documentar.** Actualiza `docs/DISENO.md` si cambia el diseño y la tabla de estado (§6) al cerrar cada hito.
7. **Git:**
   - Commits pequeños y frecuentes **en español**, terminados en `Co-Authored-By:` con **el modelo de la sesión que hace el commit** (por ejemplo `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`).
   - `git pull` antes de cada `push`. **Nunca `push --force`.** No reescribas historial subido.
   - **No hagas merges entre ramas ni a `main` sin autorización explícita.**
   - Repositorio remoto (público, desde 2026-11-23): https://github.com/notNorthStar/Dos-Mundos, rama `main`.
8. **Registro de IA obligatorio** en `AI_LOG.md` (fecha, herramienta, qué se pidió, qué resultó, qué decidió el equipo) y créditos de terceros en `CREDITOS.md`.
9. Al cerrar una sesión: termina el paso actual, haz commit, actualiza §6 y di dónde te quedaste.

## 5. Reglas de contenido
- **Terror sin gore.** El monstruo atrapa: estática, grito y pantalla de "inténtenlo de nuevo". Nada de sangre ni desmembramientos.
- **No ridiculizar la discapacidad.** El mensaje del juego es **celebrar otras formas de comunicarse**, no "disfrazarse" de persona ciega o sorda. Cuida textos y narración con eso en mente.
- **El juego debe poder probarse sin cámara y sin micrófono**: todo tiene respaldo de teclado (señas por letras del teclado, ruido simulado).
- Todos los valores ajustables (umbrales de ruido, velocidades, tiempos, distancias de audio) en archivos de configuración o JSON.

## 6. Estado del proyecto

| Hito | Estado | Notas |
|---|---|---|
| Concepto y diseño | ✅ Definido (2026-11-19) | Ver `docs/DISENO.md` |
| MVP: un reto, una PC, pantalla dividida | 🔨 En curso | Alcance en `docs/DISENO.md` §9. Hitos abajo |
| · Hito 0: base (Vite, Three.js, `src/lsm/`, bus local, contratos) | ✅ 2026-11-19 | `docs/CONTRATOS.md` |
| · Hito 1: mundo y simulación | ✅ 2026-11-19 | `src/sim/`, `src/data/alaEste.ts`; 51 pruebas |
| · Hito 2: pantallas (Oído en tinieblas, cámaras VHS de Vista) | ✅ 2026-11-19 | Visto en el navegador. Falta: pointer lock real y medir FPS en la PC del foro |
| · Hito 3: audio 3D | 🔨 | El equipo lo oyó en dos PC: «muy bueno», pero el monstruo no asustaba. **Voz del monstruo rehecha y Vista con audio (2026-11-24): falta oírlos** |
| · Hito 4: radio (señas, números con dedos, voz) | 🔨 | Voz en español con clips grabados (2026-11-24). **Falta oír los clips** y confirmar que cada uno dice su frase |
| · Hito 5: ruido y monstruo | 🔨 | Micrófono real probado. Monstruo rehecho el 2026-11-24 (merodea; quieto y en silencio no atrapa). 182 pruebas. **Falta jugarlo** para afinar el balance |
| · Hito 6: partida completa | 🔨 | Jugado en dos PC el 2026-11-23 sin poder ganar; reglas corregidas el 2026-11-24 (tablero, WASD, monstruo). Falta volver a jugarlo, tutorial guiado y punto de control |
| Dos PC en red | ✅ 2026-11-23 | `npm run red`; `docs/CONTRATOS.md` §7. **Probado con dos PC reales por hotspot** y aprobado por la profesora. La red de la escuela aísla los equipos: usar hotspot |
| Fase 2: ecolocalización, transcripción, Vosk | ⬜ | |
| Pulsera háptica (Arduino) | ⬜ | El equipo tiene un Arduino; plan en `docs/DISENO.md` §8 |
| Pulido para el foro | ⬜ | |

Estados: ⬜ pendiente · 🔨 en curso · ✅ hecho.

## 7. Comandos
```bash
npm install      # la primera vez
npm run dev      # desarrollo en http://localhost:5190 (copia antes el WASM de MediaPipe)
npm run red      # dos PC: HTTPS y visible en la red local (ver docs/DISENO.md §6.2)
npm run build    # revisa tipos y genera dist/
npm test         # pruebas de lógica (Vitest, en test/)
```
Preview de Claude Code: configuración **"Dos Mundos (dev)"** en `.claude/launch.json` de este proyecto (y también en el de la carpeta padre `ClaudeCode`, según desde dónde se abra la sesión).
