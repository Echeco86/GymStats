# Proyecto: App de seguimiento de entrenamiento (GYM Tracker)

Documento de contexto. Sirve como instrucciones base de un Proyecto en Claude: describe al usuario, la lógica de entrenamiento que la app debe encarnar, el alcance funcional y las restricciones técnicas.

---

## 1. Objetivo

Construir una aplicación personal de registro y seguimiento de entrenamiento de fuerza que haga cumplible la progresión de cargas y muestre, en pocos números, si el plan está funcionando.

No es un catálogo de ejercicios ni una app social. Es una herramienta de registro + feedback.

---

## 2. Perfil del usuario (fuente de los requisitos)

- Hombre, 40 años. Entrena en gimnasio, esquema Push / Pull / Piernas, 3–4 días por semana.
- Dificultad marcada para ganar peso y masa muscular (respondedor lento, propenso a subestimar la ingesta).
- Grasa abdominal baja pero es su objetivo estético actual.
- Perfil técnico alto: trabaja con datos, scripts y visualización. Espera exportabilidad y datos crudos accesibles, no solo tarjetas bonitas.

**Implicancia de diseño:** la app debe empujar hacia la recomposición (mantenimiento o superávit leve + progresión de cargas), no hacia el déficit calórico. Debe hacer visible el estancamiento de cargas, que es el verdadero riesgo en este perfil.

---

## 3. Reglas de dominio que la app debe implementar

Estas reglas son la lógica de negocio, no texto decorativo.

| Regla | Implementación esperada |
|---|---|
| Progresión de cargas | Comparar cada serie con la mejor marca previa del mismo ejercicio. Señalar si no hubo progreso en 3 sesiones consecutivas. |
| Volumen semanal | Contar series efectivas por grupo muscular. Rango objetivo 12–18 semanales. Alertar por debajo de 10 o por encima de 22. |
| Intensidad | Campo RIR (repeticiones en reserva) por serie, objetivo 1–3. |
| Frecuencia | 4 días fijos por semana. Marcar cada grupo muscular entrenado ≥2 veces por semana. |
| Descarga (deload) | Sugerir semana de descarga cada 6–8 semanas de acumulación. |
| Peso corporal | Tendencia semanal (media móvil de 7 días), no el dato diario. Objetivo: entre 0 y +0.25% semanal en fase de ganancia; máximo −0.5% semanal si se elige fase de pérdida. |
| Proteína | Registro diario simple con objetivo 1.8–2.2 g/kg. Solo proteína y peso; no contador completo de calorías en la v1. |
| Recuperación | Registro rápido de horas de sueño y pasos diarios (objetivo 8–10k). Correlacionarlos con el rendimiento en el gimnasio. |

---

## 4. Modelo de datos

```
Ejercicio      { id, nombre, grupo_muscular, patron (empuje/tracción/pierna/core), unilateral }
Sesion         { id, fecha, rutina (push/pull/piernas/upper), duracion_min, notas }
Serie          { id, sesion_id, ejercicio_id, orden, peso_kg, reps, rir }
MedicionCorporal { fecha, peso_kg, cintura_cm, foto_opcional }
RegistroDiario { fecha, proteina_g, sueno_hs, pasos }
```

La serie es la unidad atómica. Todo indicador (tonelaje, series por grupo, récords) se deriva de ahí; nada se almacena precalculado.

---

## 5. Alcance funcional

**v1 — Registro**
- Alta de sesión desde una plantilla de rutina (push / pull / piernas / upper).
- Carga rápida de series: peso, reps, RIR, con prellenado desde la última sesión del mismo ejercicio.
- Cronómetro de descanso.
- Historial por ejercicio con la mejor marca visible mientras se entrena.

**v2 — Feedback**
- Panel semanal: series por grupo muscular, tonelaje total, adherencia (sesiones hechas / planificadas).
- Curva de progresión por ejercicio (peso × reps estimado, e1RM con fórmula de Epley).
- Alerta de estancamiento y sugerencia de descarga.
- Tendencia de peso corporal con media móvil, superpuesta al tonelaje semanal.

**v3 — Extras**
- Exportación a CSV / JSON de todas las tablas.
- Editor de plantillas de rutina.
- Registro de medidas y fotos de progreso comparadas por fecha.

---

## 6. Restricciones técnicas en esta plataforma

- Artifact React de un solo archivo, con Tailwind (solo clases base) y Recharts para gráficos.
- **No usar `localStorage` ni `sessionStorage`**: no funcionan en los artifacts de Claude. La persistencia se hace con la API `window.storage` (`get` / `set` / `delete` / `list`), con claves jerárquicas del tipo `sesiones:2026-08-30`, `ejercicios:catalogo`, `diario:2026-08-30`.
- Agrupar en una misma clave todo lo que se escribe junto (una sesión completa con sus series en un solo `set`), para evitar cascadas de llamadas.
- Todas las operaciones de storage dentro de `try/catch`, con estado de carga visible y opción de reset.
- Diseño pensado para el teléfono: la carga de datos ocurre entre serie y serie, con una mano. Botones grandes, mínima escritura, nada de formularios largos.

---

## 7. Criterio de éxito

La app sirve si a las 8 semanas responde de un vistazo tres preguntas:

1. ¿Estoy levantando más que hace un mes en los básicos?
2. ¿Cada grupo muscular recibió el volumen previsto?
3. ¿El peso corporal se movió en la dirección elegida?

Si alguna respuesta requiere exportar datos y abrirlos en otro lado, la app falló.
