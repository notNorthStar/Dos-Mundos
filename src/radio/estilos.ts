/**
 * Estilos del panel del radio: monitor de vigilancia (monoespaciada, verde y ámbar sobre negro).
 * Todas las clases llevan el prefijo `radio-` para no chocar con el resto del juego.
 * El panel llena su contenedor (la integración le da ~35 % del alto de la mitad de Vista).
 */
export const ESTILOS_RADIO = `
.radio-panel {
  --radio-verde: #33ff66;
  --radio-verde-tenue: #1d7a3a;
  --radio-ambar: #ffb000;
  --radio-rojo: #ff4040;
  --radio-fondo: #020602;
  box-sizing: border-box; width: 100%; height: 100%; min-height: 0;
  display: flex; flex-direction: column; gap: 4px; padding: 6px 8px;
  background: var(--radio-fondo); color: var(--radio-verde);
  font-family: 'Courier New', ui-monospace, monospace; font-size: 12px; line-height: 1.25;
  border: 1px solid var(--radio-verde-tenue); overflow: hidden;
  text-shadow: 0 0 4px rgba(51, 255, 102, 0.35);
}
.radio-panel *, .radio-panel *::before, .radio-panel *::after { box-sizing: border-box; }
.radio-panel.radio-alerta { border-color: var(--radio-rojo); animation: radio-parpadeo 0.25s steps(2) 4; }
@keyframes radio-parpadeo { 50% { background: #2a0606; } }

.radio-cabecera { display: flex; justify-content: space-between; gap: 8px; letter-spacing: 2px; flex: 0 0 auto; }
.radio-titulo { opacity: 0.7; white-space: nowrap; }
.radio-estado { font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.radio-cerrado .radio-estado { color: var(--radio-verde-tenue); }
.radio-escuchando .radio-estado { color: var(--radio-verde); }
.radio-numero .radio-estado, .radio-sin-camara .radio-estado { color: var(--radio-ambar); }

.radio-cuerpo { flex: 1 1 auto; min-height: 0; display: flex; gap: 8px; }

.radio-previa {
  position: relative; flex: 0 0 auto; height: 100%; aspect-ratio: 4 / 3; max-width: 38%;
  border: 1px solid var(--radio-verde-tenue); background: #000; overflow: hidden;
}
.radio-numero .radio-previa { border-color: var(--radio-ambar); }
.radio-previa-caja { position: absolute; inset: 0; }
.radio-previa-msg {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  text-align: center; white-space: pre-line; padding: 4px; color: var(--radio-verde-tenue);
  font-size: 11px; letter-spacing: 1px; pointer-events: none;
}
.radio-previa-lectura {
  position: absolute; left: 4px; top: 3px; font-size: 11px; font-weight: bold; color: var(--radio-verde);
  background: rgba(0, 0, 0, 0.6); padding: 0 3px; pointer-events: none;
}
.radio-numero .radio-previa-lectura { color: var(--radio-ambar); font-size: 14px; }
.radio-barra { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(0, 0, 0, 0.6); }
.radio-barra-relleno { height: 100%; width: 0; background: var(--radio-verde); }
.radio-numero .radio-barra-relleno { background: var(--radio-ambar); }

.radio-centro { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; overflow: hidden; }
.radio-fichas { display: flex; flex-wrap: wrap; gap: 4px; min-height: 20px; }
.radio-ficha {
  border: 1px solid var(--radio-verde); padding: 1px 5px; white-space: nowrap;
  background: rgba(51, 255, 102, 0.08);
}
.radio-ficha-numero { border-color: var(--radio-ambar); color: var(--radio-ambar); background: rgba(255, 176, 0, 0.08); }
.radio-vacio { color: var(--radio-verde-tenue); }
.radio-frase { color: #d8ffe2; min-height: 15px; overflow: hidden; text-overflow: ellipsis; }
.radio-pista { color: var(--radio-ambar); min-height: 15px; }
.radio-aviso { min-height: 0; font-weight: bold; }
.radio-aviso-enviado { color: var(--radio-verde); }
.radio-aviso-emergencia { color: var(--radio-rojo); }
.radio-historial { margin-top: auto; color: var(--radio-verde-tenue); font-size: 11px; overflow: hidden; }
.radio-hist { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.radio-hist-emergencia { color: #b03030; }

.radio-chuleta {
  flex: 0 0 auto; display: grid; grid-auto-rows: min-content; gap: 0 6px; align-content: start;
  font-size: 11px; border-left: 1px solid var(--radio-verde-tenue); padding-left: 6px; overflow: hidden;
}
.radio-chuleta-fila { display: flex; gap: 5px; white-space: nowrap; }
.radio-chuleta-letra { color: var(--radio-ambar); min-width: 2.2em; }
.radio-deshabilitada { opacity: 0.35; text-decoration: line-through; }

.radio-pie {
  flex: 0 0 auto; display: flex; justify-content: space-between; gap: 10px; font-size: 10px;
  color: var(--radio-verde-tenue); white-space: nowrap; overflow: hidden;
}
.radio-pie-privacidad { overflow: hidden; text-overflow: ellipsis; }
`;
