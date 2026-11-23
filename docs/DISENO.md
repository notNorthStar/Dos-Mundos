# Dos Mundos: documento de diseño

> Versión 1 · 2026-11-19 · Listick Games
> Lo marcado `[PROPUESTA]` está pendiente de confirmar con el equipo: impleméntalo así, pero configurable, y avísalo.

## 1. Premisa

Un apagón deja a dos personas atrapadas en un edificio abandonado donde vive **un monstruo que caza por el ruido**.

- **Vista** está encerrada en la **caseta de vigilancia**, en el piso de arriba. Ve todas las cámaras y controla las puertas, pero **un gas le quitó la voz**: solo puede comunicarse con señas que el radio traduce.
- **Oído** está **a oscuras dentro del ala este**. No ve nada, pero oye todo. Lleva un radio con audífonos, así que el monstruo no oye lo que le dicen.

Para salir, Oído tiene que encontrar la llave y llegar a la puerta guiándose por lo que oye y por lo que Vista le manda. **Ninguno puede ganar solo.**

Es un **Five Nights at Freddy's cooperativo**: Vista es el guardia de las cámaras; Oído es quien está ahí dentro.

**Mensaje del juego:** celebrar otras formas de comunicarse. No es "disfrazarse" de persona ciega o sorda.

## 2. Los jugadores

En los documentos, **Jugador1** y **Jugador2** son las personas reales; **Vista** y **Oído** son sus personajes.

| | **Jugador1 · Vista** | **Jugador2 · Oído** |
|---|---|---|
| En la vida real | Frente a la pantalla y la cámara web. **Sin audífonos** | **Ojos vendados**, audífonos de diadema con micrófono, manos en flechas y mouse |
| Ve | Las cámaras de seguridad (estilo VHS), el mapa, los objetos, las puertas y a Oído. **No ve al monstruo**: cuando está cerca, la cámara parpadea y mete estática | Nada |
| Oye | Solo el cuarto real. **No oye el juego** | El juego en audio 3D: sus pasos, el monstruo, los objetos, su corazón, y el radio de Vista |
| Habla | **No**. Si su micrófono detecta voz, cuenta como ruido `[PROPUESTA]` | Sí, pero el monstruo lo oye: tiene que susurrar |
| Actúa | **Señas** para armar mensajes de radio; teclado para cámaras, enviar mensajes y puertas | **Se mueve** y **agarra o usa** objetos. Tiene la última palabra: Vista solo sugiere |

## 3. Interfaces (rubrica: al menos dos además de la gráfica)

| Interfaz | Quién | Para qué | Fase |
|---|---|---|---|
| **Gestual**: señas de LSM leídas con MediaPipe (módulo `ecos-lsm`) | Vista | Armar los mensajes de radio | MVP |
| **Auditiva espacial 3D**: HRTF, oclusión y reverberación | Oído | Orientarse, ubicar al monstruo y los objetos | MVP |
| **De voz, salida**: el radio habla con Oído | Oído | Recibir las instrucciones de Vista | MVP |
| **De voz, entrada**: volumen del micrófono = ruido para el monstruo | Los dos | Mecánica central de sigilo | MVP |
| **De voz, reconocimiento**: Oído habla al radio y a Vista le llega transcrito | Oído → Vista | Que Oído pueda preguntar ("¿dónde está la llave?") cuando juegan en dos PC | Fase 2 |
| **Háptica**: pulsera con Arduino | Oído | Dirección, cercanía del monstruo, choques | Fase 2 |
| Gráfica | Vista | Cámaras, mensajes, puertas, medidor de ruido | MVP |

## 4. El radio: cómo se comunica Vista

### 4.1 Flujo
1. Vista abre el detector de señas (tecla, §6).
2. Hace una seña. Aparece en su pantalla como **ficha**: `L · Left · Gira a la izquierda`.
3. Puede seguir sumando fichas para armar un mensaje: `F` + `3` → "Avanza 3 pasos".
4. **Retroceso** borra la última ficha; **Enter** envía el mensaje.
5. Oído lo oye por el radio: voz en mono, con filtro de radio y estática. Nunca suena "dentro del mundo".

La confirmación con Enter existe porque el detector puede equivocarse (sobre todo **R** y **U**): Vista ve el error antes de mandarlo.

**Señas de emergencia** `[PROPUESTA]`: **S** (quieto) se envía sola si Vista la sostiene ~0,6 s, sin Enter. En pleno susto no hay tiempo de confirmar.

### 4.2 Vocabulario

Letras de LSM con significado en inglés y en español (en pantalla se ven los dos).

| Seña | En pantalla | Lo que dice el radio | Notas |
|---|---|---|---|
| **F** | Forward · Al frente | "Avanza" | Con número: "Avanza N pasos" |
| **B** | Back · Atrás | "Date la vuelta" | Con número: "Retrocede N pasos" |
| **L** | Left · Izquierda | "Gira a la izquierda" | 90° |
| **R** | Right · Derecha | "Gira a la derecha" | 90°. Se confunde con U: por eso se confirma |
| **U** | Up · Arriba | "Sube" | Solo cuando hay escaleras cerca |
| **D** | Down · Abajo | "Agáchate, está en el piso" | |
| **S** | Stop · Quieto | "Quieto. No hagas ruido" | Seña de emergencia |
| **A** | Agarra | "Ahí está, agárralo" | Entra en el MVP |
| **1–5** | Número | "uno"… "cinco" + "pasos" | Ver nota |

**Nota sobre los números:** el módulo `ecos-lsm` reconoce letras, no números. Después de **F** o **B**, el detector cambia a modo número y **cuenta los dedos extendidos** con los puntos de MediaPipe. Es fácil y robusto, pero hay que implementarlo: no existe en ECOS.

**Unidad de medida:** un **paso = 1 metro**. Oído oye un sonido de pisada por metro, así que "avanza 3 pasos" son tres pisadas.

**Voz del radio** (decidido 2026-11-19): el MVP usa **voz sintética** (`speechSynthesis` en español de México), con la estática del radio sonando aparte. El sistema de voz queda detrás de una interfaz para cambiar después a **clips grabados por el equipo** por frase ("gira a la izquierda", "avanza", "tres", "pasos"…), concatenados y pasados por un filtro de radio en WebAudio, sin tocar el resto del código.

## 5. El ruido y el monstruo

### 5.1 Medidor de ruido (el "decibelímetro")
- Al inicio, **5 segundos de silencio** para medir el ruido base del cuarto real.
- Se mide el volumen del micrófono (RMS en dBFS) contra esa base. En pantalla puede decir "dB", aunque no son decibeles reales.
- Tres zonas: **silencio**, **cuidado** y **peligro**. Umbrales en configuración.
- **Vista** lo ve como barra en su HUD. **Oído** lo oye: un **latido** que se acelera con el ruido (y con el monstruo cerca). En la fase 2, la pulsera también late.
- En la historia, el decibelímetro se encuentra al principio, en el tutorial.

**Fuentes de ruido:**
- Micrófono: la voz de Oído si habla fuerte y cualquier ruido del cuarto (en el MVP hay un solo micrófono para los dos).
- Dentro del juego: correr, chocar con una pared, tirar un objeto y los portazos de Vista.

### 5.2 Comportamiento del monstruo
| Estado | Qué hace | Cómo se percibe |
|---|---|---|
| **Patrulla** | Recorre una ruta fija por el pasillo | Oído: respiración lenta y pasos pesados en 3D. Vista: parpadeo en la cámara por donde pasa |
| **Escucha** | Ruido en zona de cuidado: se detiene y gira hacia el origen | Oído: la respiración se corta. Vista: la cámara se congela con estática |
| **Caza** | Ruido en zona de peligro: va rápido al último punto de ruido | Oído: gruñido y pasos rápidos. Vista: estática fuerte |
| **Atrapa** | Llega hasta Oído: **pierden** | Estática, grito y "Inténtenlo de nuevo". Sin gore |

Si nadie hace ruido un rato, vuelve a patrullar. Vista puede **encerrarlo** cerrando una puerta, pero el portazo hace ruido: es una apuesta.

## 6. Controles

### 6.1 MVP: una PC, pantalla y teclado divididos
Dos ventanas no sirven (el teclado solo llega a la ventana activa), así que es **una sola página**.

| Jugador | Teclas |
|---|---|
| **Vista** (lado izquierdo del teclado) | `1`–`5` cambian de cámara · `Tab` abre o cierra el detector de señas · `Retroceso` borra la última ficha · `Enter` envía · `P` abre o cierra la puerta de la cámara activa `[PROPUESTA]` · con el detector abierto, **teclear una letra** sustituye a la seña (respaldo sin cámara) |
| **Oído** (flechas y mouse) | `↑` `↓` avanzar y retroceder · `←` `→` girar 90° (una pulsación = una orden de "gira" del radio) · mouse: giro fino · **clic izquierdo**: interactuar (agarrar, usar, abrir) · `Shift` derecho: correr (hace ruido) |

| **Generales** | `F2` reintenta al ganar o perder · `N` y `M` (mantener) simulan ruido en zona de cuidado y de peligro, para probar sin micrófono |

Todas las teclas van en un archivo de configuración (`src/config.ts`). **Nunca Ctrl.**

La pantalla de inicio ofrece dos modos: **Empezar** (pide cámara y micrófono y calibra 5 s de silencio) y **solo teclado** (sin cámara ni micrófono).

### 6.2 Dos PC (hecho el 2026-11-23; falta probarlo con dos equipos reales)
- En la pantalla de inicio se elige **Una PC**, **Dos PC · soy Oído** o **Dos PC · soy Vista**. Cada PC muestra solo su mitad, a pantalla completa.
- La PC de Oído arranca el juego con `npm run red` y abre `https://localhost:5190`. La de Vista abre `https://<IP de la PC de Oído>:5190` en Chrome y acepta el aviso del certificado (es propio, de la red local). Las dos en la misma red: **hotspot o router propio**, no el wifi de la universidad.
- **Solo el micrófono de Oído cuenta como ruido.** La PC de Vista usa la cámara, no el micrófono, y no reproduce audio.
- La partida empieza cuando están las dos PC; si una se desconecta, la otra lo avisa y se reconecta sola.
- **PC de Vista:** teclado completo para ella (`Enter` para enviar, como pidió el equipo). Cámara web enfrente.
- **PC de Oído:** flechas, mouse y la pulsera por USB.
- Se comunican por un servidor WebSocket en la red local. La PC de Oído simula el mundo; la de Vista recibe el estado unas 15 veces por segundo y manda los mensajes de radio y las órdenes de puertas.

## 7. Pantallas

### 7.1 Pantalla de Vista
- Cámara activa en grande: vista fija desde una esquina, con filtro VHS (ruido, líneas, deformación, fecha y hora).
- Miniaturas de las demás cámaras y un **mapa** del ala este con la posición de Oído.
- **HUD:** medidor de ruido, objetos de Oído (decibelímetro, llave), estado de las puertas.
- **Panel del radio:** fichas del mensaje en construcción y vista previa de la cámara web con la mano detectada.

### 7.2 Pantalla de Oído
Oído no la ve, pero el público sí.
- **MVP:** casi negra, con la vista en primera persona en tinieblas. **No debe mostrar al monstruo**: en la versión de una PC, Vista ve esta mitad y se rompería el juego.
- **Fase 2, ecolocalización:** cada sonido revela un instante las formas que toca, como ondas. Los pasos dibujan el piso y un golpe dibuja la pared. La silueta del monstruo solo aparece cuando la pantalla de Oído está en otra PC.

## 8. Pulsera háptica (fase 2)

- **Hardware:** Arduino (el equipo ya tiene uno), 2 motores de vibración tipo moneda (lado izquierdo y derecho de la muñeca o dos pulseras), un transistor NPN por motor (2N2222 o similar) con diodo de protección y resistencia de base. Fuente: USB.
- **Conexión:** USB a la PC de Oído, con **Web Serial** desde Chrome. Protocolo de texto simple, por ejemplo `L200\n` (izquierda, 200 ms), `R200\n` y `H<bpm>\n` (latido).
- **Señales:**
  - Dirección: vibra del lado que Vista indica, a la vez que el radio.
  - Latido: según el ruido y la cercanía del monstruo.
  - Choque: un golpe corto al topar con una pared.
- **Después:** versión inalámbrica con ESP32 por Bluetooth.

## 9. Alcance del MVP

**Entra:**
- Una sola página: pantalla dividida (Oído a la izquierda, Vista a la derecha) y teclado dividido.
- El **ala este** en 3D estilo PSX (§10), con 5 cámaras.
- Movimiento de Oído con flechas y mouse, colisiones con paredes y pisadas por metro.
- Audio espacial: pasos, respiración del monstruo, tintineo de la llave, oclusión, reverberación por cuarto, corazón.
- Radio: señas **F B L R S D A** y números, con confirmación y voz sintética con estática de radio. Respaldo con teclado.
- Medidor de ruido con micrófono y calibración.
- Monstruo con los cuatro estados.
- Decibelímetro, llave, puerta de salida, y ganar o perder.
- Bus de mensajes local con la interfaz final (para pasar a red sin reescribir).
- Pruebas de lógica: movimiento, ruido, estados del monstruo y bus.

**No entra (fase 2):**
- Dos PC en red.
- Pulsera háptica.
- Ecolocalización.
- Transcripción de lo que dice Oído.
- Vosk.
- Seña U y escaleras.
- Más niveles.

## 10. Partida de ejemplo: «El ala este»

**Objetivo:** encontrar la llave en la bodega y salir. Dura unos 3 minutos.

```
        ┌───────────────────────┐
        │  CASETA DE VIGILANCIA │  ← Vista (piso de arriba, no está en el mapa)
        └───────────┬───────────┘
                    │ cámaras
 ┌─────┬────────────▼────────┬─────┐
 │  1  │      PASILLO        │  3  │   1 = Cuarto donde despierta Oído (cám. 1)
 │  O  │ · · · · · · · · · · │  🔑 │   Pasillo = cám. 2 (oeste) y cám. 3 (este)
 ├──▢──┴─────┬──▢──┬─────────┴──▢──┤   3 = Bodega, la llave en el piso (cám. 4)
 │           │  2  │      🚪       │   2 = Guarida del monstruo (SIN cámara)
 │           │  👹 │    SALIDA     │   🚪 = Salida, cerrada con llave (cám. 5)
 └───────────┴─────┴───────────────┘   ▢ = puertas que Vista controla
```

**Preparación (30 s):**
1. Jugador2 se venda los ojos y se pone los audífonos. Jugador1 se coloca frente a la cámara.
2. Calibración: 5 segundos de silencio y una pasada por las señas.

**La partida:**
1. **Despertar.**
   - Oído oye una narración: "Despiertas en la oscuridad. Algo respira en el edificio".
   - Vista ve la cámara 1: Oído en el piso y, a su derecha, una mesa con el decibelímetro.
2. **Tutorial del ruido.**
   - Vista arma `R` → Enter. Oído oye por el radio "Gira a la derecha" y gira 90° con una pulsación de `→`.
   - Vista manda `F` `1` → "Avanza 1 paso". Oído oye un pitido de estática enfrente y da clic para agarrarlo.
   - Aparece el medidor de ruido en el HUD de Vista y Oído empieza a oír su corazón.
   - Si Oído habla fuerte, el latido se acelera y la barra sube a "cuidado". Aprenden a susurrar sin riesgo todavía.
3. **Salir del cuarto.**
   - Vista ve la puerta detrás de Oído y manda `B` `2` → "Retrocede 2 pasos" (o `L` `L` y `F` `2`).
   - Oído camina; cada metro suena una pisada. Si choca con la pared, oye un golpe y el ruido sube un poco.
4. **El monstruo.**
   - Oído empieza a oír una respiración que se acerca por su izquierda.
   - Vista no ve nada, pero la cámara 2 parpadea y mete estática.
   - Vista sostiene **S**: "Quieto. No hagas ruido". Los dos aguantan en silencio unos 8 segundos mientras la respiración pasa.
   - Si alguien hace ruido, el monstruo entra en caza. Vista puede cerrar con `P` la puerta del cuarto 2 para encerrarlo, pero el portazo suena.
5. **La llave.**
   - Vista guía por el pasillo hasta la bodega (cámara 4). A dos metros, Oído empieza a oír un tintineo débil.
   - Vista manda `D` → "Agáchate, está en el piso". Oído baja la vista con el mouse y da clic.
   - Suena el tintineo en la mano y la llave aparece en el HUD de Vista.
6. **La salida.**
   - Vista guía hasta la puerta (cámara 5). Oído da clic: la llave gira y la puerta se abre. Entra aire de fuera, que se oye.
   - **Ganan:** "Ala este superada".
   - **Pierden:** el monstruo atrapa a Oído: estática, grito y "Inténtenlo de nuevo" desde el último punto de control.

**En resumen:**
- **Oído** escucha, decide y se mueve.
- **Vista** mira, traduce el mapa a señas y controla las puertas.

## 11. Fases posteriores
- Fase 2: dos PC, pulsera, ecolocalización, transcripción, Vosk, seña U con escaleras.
- Más niveles: sótano con agua (pasos que chapotean), elevador, segundo monstruo.
- **Cambio de roles** entre niveles: Jugador1 y Jugador2 se intercambian.
- Variante: el monstruo puede subir a la caseta si el cuarto real hace demasiado ruido.

## 12. Preguntas abiertas para el equipo
Resueltas el 2026-11-19: Oído a la izquierda y Vista a la derecha · giro de 90° por pulsación · voz sintética en el MVP y clips grabados después · la seña **A** entra en el MVP.

Resueltas el 2026-11-23: en dos PC solo cuenta el micrófono de Oído · en el foro las PC se conectan por hotspot o router propio.

Pendientes:
- Nombre definitivo del juego.
