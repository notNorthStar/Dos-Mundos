# Registro de uso de IA

## 2026-11-19 · Claude Code (Anthropic, Claude Opus 5.5) · Concepto y diseño
**Qué se pidió:** ideas de proyecto con al menos dos interfaces además de la gráfica; el equipo eligió «Dos Mundos» y lo afinó en conversación.
**Qué resultó:** `docs/DISENO.md`, `AGENTS.md`, `README.md` y una presentación corta de la idea.
**Qué decidió o modificó el equipo:** estilo terror tipo Five Nights at Freddy's / P.T. con un monstruo que caza por el ruido y un decibelímetro; señas como letras-acción bilingües (F, B, L, R, U, D); confirmación del mensaje con Enter antes de enviarlo; Oído se mueve con flechas y mouse en lugar de comandos de voz; radio con audífonos; pulsera háptica con Arduino; 3D estilo PSX con Three.js; MVP en una PC y después dos PC en red.

## 2026-11-19 · Claude Code (Anthropic, Claude Fable 5.2) · Preguntas abiertas del diseño
**Qué se pidió:** resolver las preguntas abiertas de `docs/DISENO.md` §12 antes de planear el MVP.
**Qué resultó:** `docs/DISENO.md` y `AGENTS.md` actualizados con las decisiones.
**Qué decidió o modificó el equipo:** Oído a la izquierda y Vista a la derecha; giro de 90° por pulsación; voz del radio sintética en el MVP y clips grabados después; la seña A entra en el MVP.

## 2026-11-19 · Claude Code (Anthropic, Claude Fable 5.2) · Hito 0: base del proyecto
**Qué se pidió:** aprobar el plan del MVP por hitos y empezar.
**Qué resultó:** proyecto Vite + TypeScript estricto + Three.js (`package.json`, `index.html`, `src/main.ts`, `src/config.ts`), módulo de LSM copiado de ECOS a `src/lsm/` sin cambios (sin el adaptador de Phaser), bus local con pruebas (`src/bus/`, `test/`), contratos (`docs/CONTRATOS.md`, `src/shared/contratos.ts`), `CREDITOS.md` y repositorio git local.
**Qué decidió o modificó el equipo:** aprobó el plan de 7 hitos; git solo local, sin repositorio remoto por ahora.

## 2026-11-19 · Claude Code (Fable 5.2 en la sesión principal; subagentes Fable 5.2 y Opus 5.5) · Hitos 1 a 6, primera versión jugable
**Qué se pidió:** continuar con el MVP usando subagentes en paralelo, variando el modelo según el trabajo, y firmar los commits con el modelo de la sesión.
**Qué resultó:** mapa del ala este y utilidades (sesión principal); simulación con movimiento, puertas, ruido y monstruo (`src/sim/`, Fable 5.2); mundo 3D PSX, pantalla de Oído y cámaras VHS de Vista (`src/mundo3d/`, `src/oido/`, `src/vista/`, Fable 5.2); audio espacial sintetizado por código y micrófono (`src/audio/`, `src/ruido/`, Opus 5.5); panel del radio, conteo de dedos y voz sintética (`src/radio/`, Opus 5.5); integración en `src/main.ts`. 127 pruebas de lógica en verde y partida ganada en el navegador con teclado.
**Qué decidió o modificó el equipo:** firma de commits según el modelo de la sesión; subagentes repartidos entre Fable 5.2 y Opus 5.5. Pendiente del equipo: probar con audífonos, cámara y micrófono.

## 2026-11-23 · Claude Code (Anthropic, Claude Fable 5.2) · Dos PC en red
**Qué se pidió:** el equipo probó el MVP y pidió la versión de dos PC antes de seguir probando.
**Qué resultó:** bus de red (`src/bus/BusRed.ts`, `src/shared/red.ts`), relevo WebSocket como plugin de Vite (`tools/relevo.ts`), `npm run red` con HTTPS, selector de modo en la pantalla de inicio (`index.html`, `src/main.ts`) y 9 pruebas nuevas (136 en total). Probado con dos pestañas en una PC; falta con dos equipos.
**Qué decidió o modificó el equipo:** en el foro las PC se conectan por hotspot o router propio; en dos PC solo cuenta el micrófono de Oído. Del MVP en una PC: el audio «estaba muy bueno» y el micrófono funcionó.

## 2026-11-23 · Claude Code (Anthropic, Claude Fable 5.2) · Prueba con dos PC
**Qué se pidió:** levantar el servidor para probar con dos PC y publicar el repositorio.
**Qué resultó:** repositorio público en GitHub; aviso cuando falta la voz en español; partida jugada entre dos PC conectadas al hotspot de un celular.
**Qué decidió o modificó el equipo:** quitó la narración inicial; usó hotspot porque la red de la escuela separa los equipos; la profesora aprobó el avance. Sigue el pulido.

## 2026-11-24 · Claude Code (Fable 5.2 en la sesión principal; subagentes Fable 5.2 y Opus 5.5) y Gemini TTS · Correcciones tras jugar en dos PC
**Qué se pidió:** el equipo reportó que el monstruo sonaba a ronroneo, que la voz seguía en inglés, que Oído se desorientaba y que nunca pudieron ganar; pidió movimiento de tablero, WASD, un monstruo que merodee y que Vista también oiga.
**Qué resultó:** movimiento por casillas con cabeza independiente, WASD y monstruo que merodea con regla de esconderse (`src/sim/`, `src/oido/`, subagente Fable 5.2); voz del monstruo rehecha, reproductor de clips y audio de monitor para Vista (`src/audio/`, `src/radio/vozGrabada.ts`, subagente Opus 5.5); 23 clips de voz en español generados con Gemini TTS (`gemini-3.8-flash-lite-tts`, voz Algenib) en `public/radio/` con `tools/generar-voces.mjs`; integración y tecla F4 para recalibrar el micrófono. 182 pruebas en verde. Nadie ha oído todavía el resultado.
**Qué decidió o modificó el equipo:** giros de 90° (no 45°); esconderse quieto y en silencio; Vista oye lo mismo que Oído; voz seria y tensa. La clave de la API la dio el equipo y se guarda fuera del repositorio.

<!-- Plantilla:
## AAAA-MM-DD · <herramienta>
**Qué se pidió:**
**Qué resultó (archivos/assets):**
**Qué decidió o modificó el equipo:**
-->
