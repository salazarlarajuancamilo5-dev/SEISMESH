# SEISMESH

**Cada teléfono cuenta. Juntos revelan el impacto.**
_Distributed awareness when every second matters._

Convierte temporalmente los teléfonos de un edificio en una red colaborativa de movimiento relativo y verificación humana: movimiento por planta + estado de los ocupantes + obstáculos reportados → prioridades de verificación y ruta de evacuación alternativa.

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build estática en dist/
```

## Demo en 60 segundos

1. Abre `/control` → pulsa **D** (o "Iniciar demo"). La secuencia automática dura ~33 s y se repite infinitamente.
2. Beats: normal → evento → pico anómalo en Piso 3 → comprobación de ocupantes → 2 confirman / 1 sin confirmar → escalera norte bloqueada → ruta alternativa → prioridades → resumen "Primeros 30 segundos".
3. Para añadir teléfonos reales: **Q** muestra el QR (`/sensor?room=CODE`).

### Atajos de teclado

`D` demo · `E` evento · `C` solicitar estado · `R` reiniciar · `Q` QR · `P` preparar presentación · `V` vista comparada · `F` pantalla completa · `M` silenciar

## Rutas

- `/` — pantalla inicial.
- `/control` — centro de control (diseñado para 1440×900).
- `/sensor?room=CODE&zone=z1` — experiencia móvil: zona, permiso, calibración de 3 s, envío a 10 Hz, "Estoy bien" / "Necesito ayuda" / reportar peligro.

## Cómo funciona

- **Transporte**: PeerJS (WebRTC DataChannel) con respaldo por `BroadcastChannel` para pestañas del mismo navegador. Si WebRTC falla, el dashboard sigue con **sensores virtuales** y muestra "Modo local".
- **Sensor**: `DeviceMotionEvent` (permiso solo tras gesto del usuario). Si no hay acelerómetro o se deniega el permiso, se activa el **sensor táctil de demostración**. Se resta el componente lento (EMA) para aproximar movimiento dinámico y se calcula RMS + pico sobre ventana corta.
- **Modos**: real, demo (3 sensores virtuales) e híbrido (reales + virtuales simultáneamente).
- **Prioridades**: reglas deterministas y transparentes — ayuda → sin confirmar → fuego/humo/fuga → salida bloqueada → pico relativo → normal.

## Desplegar en Vercel

Framework **Vite**, build `npm run build`, output `dist`. `vercel.json` ya incluye el rewrite SPA. HTTPS es necesario para que los móviles concedan el acelerómetro.

Sin backend, sin base de datos, sin autenticación, sin claves. No se guarda información personal ni ubicación GPS.

## Aviso

SEISMESH muestra **movimiento relativo no calibrado** y reportes humanos. No calcula magnitud sísmica, no sustituye acelerógrafos calibrados, no certifica rutas de evacuación ni diagnostica daño estructural. Es una herramienta de conciencia situacional inicial para orientar verificaciones e inspecciones.

> SEISMESH no sustituye una inspección. Hace visibles los primeros minutos de incertidumbre.
