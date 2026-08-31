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

