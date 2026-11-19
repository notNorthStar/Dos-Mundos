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

<!-- Plantilla:
## AAAA-MM-DD · <herramienta>
**Qué se pidió:**
**Qué resultó (archivos/assets):**
**Qué decidió o modificó el equipo:**
-->
