# GYM Tracker

App personal de seguimiento de entrenamiento (PWA). Registro de series, progresión de cargas, análisis de estancamiento y exportación de datos.

Ver `contexto-proyecto-app-gym.md` para el modelo de dominio y las reglas de negocio completas.

## Estructura del repo

```
docs/                    ← esto es lo que se publica (GitHub Pages sirve desde acá)
├── index.html            app principal (HTML + JS, sin frameworks)
├── manifest.json          metadata de la PWA
├── service-worker.js      cache offline
├── pdf.min.js             parser de PDF (extracción de rutinas)
└── pdf.worker.min.js      worker de pdf.js
```

## Publicar en GitHub Pages (primera vez)

1. En GitHub, andá a **Settings → Pages**.
2. En "Build and deployment" → Source: **Deploy from a branch**.
3. Branch: **main**, carpeta: **/docs**. Guardar.
4. Esperá 1-2 minutos. La URL queda en `https://<tu-usuario>.github.io/<nombre-repo>/`.
5. Abrí esa URL en Chrome del celular → menú → **Instalar app** (o "Agregar a pantalla de inicio").

## Actualizar la app (cada vez que mejores algo)

```bash
git add .
git commit -m "Descripción del cambio"
git push
```

GitHub Pages redespliega solo en 1-2 minutos. En el celular, cerrá y volvé a abrir la PWA (o hacé pull-to-refresh) para que el service worker traiga la versión nueva.

## Datos de entrenamiento

Los datos se guardan en `localStorage` del navegador, **en el dispositivo**, no en este repo ni en GitHub. Actualizar el código (push a GitHub) **no borra los datos guardados** en el celular, siempre que:

- La PWA se siga sirviendo desde el mismo dominio/URL (`https://<tu-usuario>.github.io/<nombre-repo>/`).
- No se borre el sitio desde la configuración del navegador ("Borrar datos de navegación" para ese sitio sí los borraría).

### Backup recomendado

Antes de cambios grandes, exportá un CSV desde la app (función de exportación) y guardalo aparte, como respaldo.

## Requisito de HTTPS

Chrome exige HTTPS (no `file://`) para poder instalar una PWA. GitHub Pages sirve todo por HTTPS automáticamente, así que no hace falta Netlify ni ningún otro paso extra para esto.
