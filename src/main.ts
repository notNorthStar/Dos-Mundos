/**
 * Punto de entrada. Por ahora solo comprueba que la base funciona:
 * pantalla de inicio (WebAudio y el micrófono necesitan un clic) y un render de Three.js
 * a baja resolución en cada mitad. La integración real se hace en los hitos 1 a 6
 * siguiendo docs/CONTRATOS.md.
 */
import * as THREE from 'three';
import { CONFIG } from './config';

function montarPlaceholder(contenedor: HTMLElement, color: number): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  const lienzo = renderer.domElement;
  lienzo.style.cssText = 'width:100%;height:100%;display:block;image-rendering:pixelated';
  contenedor.appendChild(lienzo);

  const escena = new THREE.Scene();
  escena.fog = new THREE.Fog(0x000000, 1, 6);
  const camara = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
  camara.position.z = 3;
  const cubo = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color, wireframe: true }),
  );
  escena.add(cubo);

  const ajustar = () => {
    const ancho = Math.max(1, contenedor.clientWidth);
    const alto = Math.max(1, contenedor.clientHeight);
    // Estilo PSX: se dibuja a baja resolución y el CSS lo escala sin suavizado.
    const h = CONFIG.render.altoInterno;
    const w = Math.round((h * ancho) / alto);
    renderer.setSize(w, h, false);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
  };
  ajustar();
  window.addEventListener('resize', ajustar);

  return () => {
    cubo.rotation.x += 0.01;
    cubo.rotation.y += 0.013;
    renderer.render(escena, camara);
  };
}

function bloquearTeclasDelNavegador(): void {
  // Nunca Ctrl en los controles (AGENTS.md §2.1). Tab y Alt se bloquean para que no saquen el foco.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Alt') e.preventDefault();
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}

function arrancar(): void {
  const oido = document.getElementById('oido');
  const vista = document.getElementById('vista');
  if (!oido || !vista) throw new Error('Faltan los contenedores #oido y #vista');

  bloquearTeclasDelNavegador();
  const pasos = [montarPlaceholder(oido, 0x2a332a), montarPlaceholder(vista, 0x7fae7f)];
  const ciclo = () => {
    for (const paso of pasos) paso();
    requestAnimationFrame(ciclo);
  };
  requestAnimationFrame(ciclo);
}

const inicio = document.getElementById('inicio');
document.getElementById('btn-inicio')?.addEventListener('click', () => {
  inicio?.remove();
  arrancar();
});
