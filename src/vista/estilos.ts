/**
 * Estilos de la pantalla de Vista. Todas las clases llevan el prefijo `dmv-` para no chocar con
 * index.html ni con el panel del radio (que se monta dentro de #panel-radio).
 */
import { AJUSTES_VISTA as A } from './ajustes';

export const ESTILOS_VISTA = `
.dmv-raiz { position:absolute; inset:0; display:flex; flex-direction:column; background:#020402;
  color:#9fd6a8; font-family:'Courier New',monospace; font-size:clamp(10px,0.85vw,14px);
  letter-spacing:0.08em; user-select:none; }
.dmv-camaras { position:relative; flex:1 1 0; min-height:0; overflow:hidden; background:#000; }
.dmv-lienzo { position:absolute; inset:0; width:100%; height:100%; display:block; image-rendering:pixelated; }
.dmv-osd { position:absolute; left:0; top:0; bottom:0; pointer-events:none;
  text-shadow:0 0 4px rgba(190,255,200,0.55), 1px 1px 0 #000; color:#e4f5e4;
  font-size:clamp(11px,1.15vw,19px); }
.dmv-osd > * { position:absolute; }
.dmv-rec { top:5%; right:5%; }
.dmv-rec i { display:inline-block; width:0.7em; height:0.7em; margin-left:0.45em; border-radius:50%;
  background:#ff3a2e; animation:dmv-latido 1.1s steps(1) infinite; }
.dmv-nombre { left:5%; bottom:6%; }
.dmv-fecha { right:5%; bottom:6%; text-align:right; }
.dmv-interferencia { left:0; right:0; top:14%; text-align:center; color:#ffd9a0; display:none;
  animation:dmv-latido 0.5s steps(1) infinite; }
.dmv-fin { inset:0; display:none; align-items:center; justify-content:center; text-align:center;
  padding:0 8%; font-size:clamp(18px,2.6vw,40px); letter-spacing:0.2em; text-transform:uppercase;
  background:rgba(0,0,0,0.45); }
.dmv-minis { position:absolute; right:0; top:0; bottom:0; pointer-events:none; }
.dmv-mini { position:absolute; left:0; right:0; box-sizing:border-box; border:1px solid #16301c; }
.dmv-mini span { position:absolute; left:3px; top:1px; font-size:0.95em; color:#7fb98a;
  text-shadow:1px 1px 0 #000; }
.dmv-mini.dmv-activa { border:2px solid #b6ffc4; }
.dmv-mini.dmv-activa span { color:#e9ffe9; }
.dmv-inferior { flex:0 0 ${A.fraccionInferior * 100}%; min-height:0; display:flex;
  border-top:2px solid #16301c; }
.dmv-info { flex:0 0 ${A.fraccionMapa * 100}%; min-width:0; display:flex; flex-direction:column;
  border-right:2px solid #16301c; }
.dmv-mapa { position:relative; flex:1 1 0; min-height:0; }
.dmv-mapa canvas { position:absolute; inset:0; }
.dmv-hud { flex:0 0 auto; padding:4px 8px 6px; display:flex; flex-direction:column; gap:3px;
  border-top:1px solid #16301c; overflow:hidden; }
.dmv-fila { overflow:hidden; }
.dmv-tenue { opacity:0.5; }
.dmv-rot { opacity:0.7; margin-right:0.7em; }
.dmv-ruido { display:none; align-items:center; gap:0.6em; }
.dmv-barra { position:relative; flex:1 1 auto; height:0.9em; display:flex; border:1px solid #3f7a4c;
  background:#000; }
.dmv-z { display:block; height:100%; opacity:0.28; }
.dmv-z1 { background:#3fbf5f; } .dmv-z2 { background:#d9a030; } .dmv-z3 { background:#e0483a; }
.dmv-nivel { position:absolute; left:0; top:0; bottom:0; width:0; background:#5fe07a;
  transition:width 0.09s linear; mix-blend-mode:screen; }
.dmv-ruido[data-zona="cuidado"] .dmv-nivel { background:#ffc04a; }
.dmv-ruido[data-zona="peligro"] .dmv-nivel { background:#ff5a4a; }
.dmv-zona { flex:0 0 5.5em; text-align:right; }
.dmv-ruido[data-zona="cuidado"] .dmv-zona { color:#ffc04a; }
.dmv-ruido[data-zona="peligro"] .dmv-zona { color:#ff5a4a; animation:dmv-latido 0.4s steps(1) infinite; }
.dmv-obj { margin-right:0.9em; opacity:0.3; text-decoration:line-through; }
.dmv-obj.dmv-si { opacity:1; text-decoration:none; color:#e9ffe9; }
.dmv-abierta { color:#5fe07a; } .dmv-cerrada { color:#ffb347; }
.dmv-destello { animation:dmv-destello 0.6s ease-out 1; }
#panel-radio { position:relative; flex:1 1 0; min-width:0; min-height:0; overflow:hidden; }
@keyframes dmv-latido { 0% { opacity:1; } 50% { opacity:0.15; } 100% { opacity:1; } }
@keyframes dmv-destello { 0% { background:#3f7a4c; } 100% { background:transparent; } }
`;
