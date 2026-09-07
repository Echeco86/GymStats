'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load-app');

test('estimateOneRM: fórmula de Epley', () => {
    const { estimateOneRM } = loadApp();
    assert.equal(estimateOneRM(100, 1), 100);
    assert.equal(Math.round(estimateOneRM(100, 10) * 10) / 10, 133.3);
    assert.equal(estimateOneRM(0, 10), 0);
    assert.equal(estimateOneRM(100, 0), 0);
});

test('escapeHtml neutraliza caracteres especiales de HTML', () => {
    const { escapeHtml } = loadApp();
    assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(escapeHtml(`O'Brien "Press"`), 'O&#39;Brien &quot;Press&quot;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
});

test('checkStagnation detecta 3 sesiones sin subir el 1RM estimado', () => {
    const { app } = loadApp();
    app.exercises = [{ name: 'Press banca' }];
    app.history = [
        { date: '2026-08-01', records: { 'Press banca': [{ weight: 40, reps: 8, rir: 2 }] } },
        { date: '2026-08-08', records: { 'Press banca': [{ weight: 40, reps: 8, rir: 2 }] } },
        { date: '2026-08-15', records: { 'Press banca': [{ weight: 40, reps: 8, rir: 2 }] } }
    ];
    assert.equal(app.checkStagnation('Press banca'), true);

    app.history[2].records['Press banca'][0].weight = 45;
    assert.equal(app.checkStagnation('Press banca'), false);
});

test('suggestNextTarget usa el RIR para autoregular la progresión', () => {
    const { app } = loadApp();
    app.exercises = [{ name: 'Press banca', repMin: 8, repMax: 12, sets: 3, unit: 'reps', bodyweight: false }];

    function withLastSet(rir, reps, weight) {
        app.history = [{ date: '2026-08-01', records: { 'Press banca': [{ weight, reps, rir }] } }];
        return app.suggestNextTarget('Press banca');
    }

    // RIR 0 sin llegar al techo de reps: no empuja más reps.
    const failed = withLastSet(0, 8, 40);
    assert.equal(failed.weight, 40);
    assert.equal(failed.reps, 8);

    // RIR en rango objetivo, sin llegar al techo: progresión normal (+1 rep).
    const normal = withLastSet(2, 8, 40);
    assert.equal(normal.reps, 9);

    // Con margen de sobra (RIR alto), el salto de reps es mayor.
    const roomToSpare = withLastSet(5, 8, 40);
    assert.equal(roomToSpare.reps, 10);
});

test('classifyMuscleGroup agrupa ejercicios comunes en español', () => {
    const { classifyMuscleGroup } = loadApp();
    assert.equal(classifyMuscleGroup('Sentadilla libre').muscleGroup, 'piernas');
    assert.equal(classifyMuscleGroup('Press de banca plano').muscleGroup, 'pecho');
    assert.equal(classifyMuscleGroup('Remo con barra').muscleGroup, 'espalda');
    assert.equal(classifyMuscleGroup('Press militar').muscleGroup, 'hombro');
    assert.equal(classifyMuscleGroup('Curl de bíceps').muscleGroup, 'brazos');
    assert.equal(classifyMuscleGroup('Ejercicio inventado xyz').muscleGroup, 'otro');
});

test('classifyVolumeStatus respeta los umbrales del spec (12-18 objetivo, <10 o >22 alerta)', () => {
    const { classifyVolumeStatus } = loadApp();
    assert.equal(classifyVolumeStatus(5).label.includes('Muy bajo'), true);
    assert.equal(classifyVolumeStatus(11).label.includes('Bajo objetivo'), true);
    assert.equal(classifyVolumeStatus(15).label.includes('En objetivo'), true);
    assert.equal(classifyVolumeStatus(20).label.includes('Alto'), true);
    assert.equal(classifyVolumeStatus(25).label.includes('Muy alto'), true);
});

test('extractExercisesByDay parsea un bloque de rutina con formato típico', () => {
    const { extractExercisesByDay } = loadApp();
    const text = 'PUSH DIA 1 Ord. Ejercicio Series Rep Pausa PRESS BANCA 4 8-12 SENTADILLA 3 10 OBSERVACIONES GENERALES Notas';
    const days = extractExercisesByDay(text);

    assert.equal(days.length, 1);
    assert.equal(days[0].label, 'Push Dia 1');
    const names = days[0].exercises.map(e => e.name);
    assert.ok(names.includes('PRESS BANCA'), `esperaba PRESS BANCA en ${JSON.stringify(names)}`);
    assert.ok(names.includes('SENTADILLA'), `esperaba SENTADILLA en ${JSON.stringify(names)}`);

    const press = days[0].exercises.find(e => e.name === 'PRESS BANCA');
    assert.equal(press.sets, 4);
    assert.equal(press.repMin, 8);
    assert.equal(press.repMax, 12);
});

test('extractExercisesByDay no pega encabezados de columna (RPE, OBSERVACIONES) al nombre del ejercicio', () => {
    const { extractExercisesByDay } = loadApp();
    // En este layout no hay ningún token en minúscula entre el encabezado de
    // columna y el ejercicio siguiente, así que sin el recorte de stopwords
    // "RPE" y "OBSERVACIONES" quedarían fundidos con el nombre real.
    const text = 'PUSH DIA 1 Ord. Ejercicio Series Rep RPE PRESS BANCA 4 8-12 OBSERVACIONES SENTADILLA 3 10';
    const days = extractExercisesByDay(text);
    // Array.from() para obtener un array del realm del test: el array que
    // devuelve el código evaluado en el vm.Context es de otro realm, y
    // assert.deepEqual en modo estricto compara también el tipo del objeto.
    const names = Array.from(days[0].exercises, e => e.name);

    assert.deepEqual(names, ['PRESS BANCA', 'SENTADILLA']);
});

test('calculateRatioAnalysis marca un remo débil frente al teórico banca/sentadilla', () => {
    const { app, calculateRatioAnalysis } = loadApp();
    app.history = [{
        date: '2026-08-01',
        records: {
            'Sentadilla': [{ weight: 100, reps: 5, rir: 2 }],
            'Press banca': [{ weight: 65, reps: 5, rir: 2 }],
            'Remo barra': [{ weight: 25, reps: 5, rir: 2 }]
        }
    }];

    const analysis = calculateRatioAnalysis();
    assert.ok(analysis, 'calculateRatioAnalysis no debería devolver null con historial cargado');
    assert.equal(analysis.exercises.barRow.status, 'weak');
    assert.ok(analysis.recommendations.some(r => r.type === 'weakness'));
});

test('getWeeklyVolumeByMuscleGroup solo cuenta series de los últimos 7 días', () => {
    const { app } = loadApp();
    const today = new Date();
    const daysAgo = (n) => {
        const d = new Date(today);
        d.setDate(d.getDate() - n);
        return d.toISOString().split('T')[0];
    };

    app.history = [
        { date: daysAgo(1), records: { 'Press banca': [{ weight: 40, reps: 8, rir: 2 }, { weight: 40, reps: 8, rir: 2 }] } },
        { date: daysAgo(10), records: { 'Press banca': [{ weight: 40, reps: 8, rir: 2 }] } }
    ];

    const counts = app.getWeeklyVolumeByMuscleGroup();
    assert.equal(counts.pecho, 2, 'la sesión de hace 10 días no debería contar');
});

test('getDeloadStatus cuenta las semanas de acumulación desde la última descarga', () => {
    const { app } = loadApp();
    const mondayOf = (weeksAgo) => {
        const d = new Date();
        d.setDate(d.getDate() - weeksAgo * 7);
        return d.toISOString().split('T')[0];
    };
    const buildHistory = (weekVolumes) => {
        const n = weekVolumes.length;
        return weekVolumes.map((vol, idx) => ({
            date: mondayOf(n - 1 - idx),
            records: { 'Press banca': Array.from({ length: vol }, () => ({ weight: 40, reps: 8, rir: 2 })) }
        }));
    };

    app.history = buildHistory([15, 15, 15, 15, 15, 15, 15]);
    assert.equal(app.getDeloadStatus().weeksSinceDeload, 7);

    app.history = buildHistory([15, 15, 4, 15, 15, 15, 15, 15, 15]);
    assert.equal(app.getDeloadStatus().weeksSinceDeload, 6);
});

function loadAppWithBackupIO(confirmQueue, backupJson) {
    class FakeFileReader {
        readAsText() { this.onload({ target: { result: backupJson } }); }
    }
    let capturedExport = null;
    const { app, exportData, importData, BACKUP_SCHEMA_VERSION } = loadApp({
        sandbox: {
            confirm: () => confirmQueue.shift(),
            FileReader: FakeFileReader,
            URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
            Blob: function Blob(parts) { capturedExport = parts[0]; }
        }
    });
    return {
        app, exportData, importData, BACKUP_SCHEMA_VERSION,
        getExportedJson: () => capturedExport
    };
}

test('exportData estampa la versión de esquema del backup', () => {
    const { app, exportData, getExportedJson, BACKUP_SCHEMA_VERSION } = loadAppWithBackupIO([]);
    app.exercises = [{ name: 'Sentadilla' }];
    app.history = [];

    exportData();

    const exported = JSON.parse(getExportedJson());
    assert.equal(exported.schemaVersion, BACKUP_SCHEMA_VERSION);
});

test('importData avisa antes de importar un backup de una versión de esquema futura, y respeta la cancelación', () => {
    const { BACKUP_SCHEMA_VERSION } = loadAppWithBackupIO([]);
    const futureBackup = JSON.stringify({
        schemaVersion: BACKUP_SCHEMA_VERSION + 1,
        exercises: [{ name: 'Peso muerto' }],
        history: []
    });

    // El usuario cancela el aviso de versión futura: no debería tocar los datos existentes.
    const { app, importData } = loadAppWithBackupIO([false], futureBackup);
    app.exercises = [{ name: 'Sentadilla' }];
    app.history = [];

    importData({ target: { files: [{}], value: '' } });

    assert.deepEqual(Array.from(app.exercises, e => e.name), ['Sentadilla']);
});

test('importData reemplaza los datos si el usuario acepta el aviso de versión futura y elige reemplazar', () => {
    const { BACKUP_SCHEMA_VERSION } = loadAppWithBackupIO([]);
    const futureBackup = JSON.stringify({
        schemaVersion: BACKUP_SCHEMA_VERSION + 1,
        exercises: [{ name: 'Peso muerto' }],
        history: []
    });

    // true = seguir a pesar del aviso de versión futura; false = "Cancelar" en el
    // diálogo fusionar/reemplazar, que en esa confirmación significa REEMPLAZAR.
    const { app, importData } = loadAppWithBackupIO([true, false], futureBackup);
    app.exercises = [{ name: 'Sentadilla' }];
    app.history = [];

    importData({ target: { files: [{}], value: '' } });

    assert.deepEqual(Array.from(app.exercises, e => e.name), ['Peso muerto']);
});

// Stub de document que resuelve getElementById por id contra un mapa fijo de
// valores, para testear funciones que leen varios inputs sueltos del DOM
// (el editor de ejercicio, el formulario de alta) sin depender de querySelector.
function makeFieldStubDocument(fields) {
    const store = {};
    for (const [id, val] of Object.entries(fields)) {
        store[id] = typeof val === 'boolean'
            ? { checked: val, value: '', style: {}, innerHTML: '' }
            : { value: String(val), checked: false, style: {}, innerHTML: '' };
    }
    return {
        getElementById: (id) => store[id] || (store[id] = { value: '', checked: false, style: {}, innerHTML: '' }),
        querySelectorAll: () => [],
        addEventListener: () => {},
        createElement: () => ({ style: {}, click() {}, remove() {} }),
        body: { appendChild() {}, removeChild() {} }
    };
}

test('addExerciseToToday agrega un ejercicio nuevo al día seleccionado', () => {
    const fields = {
        newExerciseName: 'Remo en polea baja',
        newExerciseSets: '4',
        newExerciseRepMin: '10',
        newExerciseRepMax: '15',
        newExerciseBodyweight: false,
        newExerciseTimeBased: false
    };
    const { app, addExerciseToToday } = loadApp({ sandbox: { document: makeFieldStubDocument(fields) } });
    app.exercises = [{ name: 'Press banca', day: 'Push', sets: 3, repMin: 8, repMax: 12, unit: 'reps', bodyweight: false }];
    app.selectedDay = 'Push';

    addExerciseToToday();

    const added = app.exercises.find(e => e.name === 'Remo en polea baja');
    assert.ok(added, 'el ejercicio nuevo debería estar en app.exercises');
    assert.equal(added.day, 'Push');
    assert.equal(added.sets, 4);
    assert.equal(added.repMin, 10);
    assert.equal(added.repMax, 15);
    assert.equal(app.exercises.length, 2, 'no debería tocar el ejercicio existente');
});

test('saveExerciseEdits reemplaza el ejercicio de la rutina (ej. lo cambiaron por un tirón)', () => {
    const fields = {
        'exercise-editor-name-0': 'Remo en polea baja',
        'exercise-editor-sets-0': '4',
        'exercise-editor-repmin-0': '10',
        'exercise-editor-repmax-0': '15',
        'exercise-editor-bw-0': false,
        'exercise-editor-time-0': false
    };
    const { app, saveExerciseEdits } = loadApp({ sandbox: { document: makeFieldStubDocument(fields) } });
    const original = { name: 'Press militar', day: 'Push', sets: 3, repMin: 8, repMax: 12, unit: 'reps', bodyweight: false };
    app.exercises = [original];
    app._trackExercises = [original];
    app.trackSetsCount = { 'Press militar': 3 };

    saveExerciseEdits(0);

    assert.equal(app.exercises.length, 1);
    assert.equal(app.exercises[0].name, 'Remo en polea baja');
    assert.equal(app.exercises[0].sets, 4);
    assert.equal(app.exercises[0].repMin, 10);
    assert.equal(app.trackSetsCount['Remo en polea baja'], 4, 'el contador de series debería migrar al nombre nuevo');
    assert.equal('Press militar' in app.trackSetsCount, false, 'no debería quedar basura con el nombre viejo');
});

test('removeExerciseFromRoutine saca el ejercicio de app.exercises tras confirmar', () => {
    const { app, removeExerciseFromRoutine } = loadApp({ sandbox: { confirm: () => true } });
    const ex = { name: 'Press banca', day: 'Push', sets: 3, repMin: 8, repMax: 12, unit: 'reps', bodyweight: false };
    app.exercises = [ex];
    app._trackExercises = [ex];
    app.trackSetsCount = { 'Press banca': 3 };

    removeExerciseFromRoutine(0);

    assert.equal(app.exercises.length, 0);
    assert.equal('Press banca' in app.trackSetsCount, false);
});

test('removeExerciseFromRoutine no hace nada si el usuario cancela la confirmación', () => {
    const { app, removeExerciseFromRoutine } = loadApp({ sandbox: { confirm: () => false } });
    const ex = { name: 'Press banca', day: 'Push', sets: 3, repMin: 8, repMax: 12, unit: 'reps', bodyweight: false };
    app.exercises = [ex];
    app._trackExercises = [ex];

    removeExerciseFromRoutine(0);

    assert.equal(app.exercises.length, 1);
});

test('sessionSortKey usa hora_inicio real, o el mediodía de la fecha como fallback', () => {
    const { sessionSortKey } = loadApp();
    assert.equal(sessionSortKey({ date: '2026-08-01', hora_inicio: '2026-08-01T07:30:00.000Z' }), '2026-08-01T07:30:00.000Z');
    assert.equal(sessionSortKey({ date: '2026-08-01' }), '2026-08-01T12:00:00.000Z');
});

test('runMigrations agrega hora_inicio estimada a sesiones viejas sin tocar las que ya la tienen', () => {
    const { app } = loadApp();
    app.history = [
        { date: '2026-07-01', day: 'Push', records: {} },
        { date: '2026-07-08', hora_inicio: '2026-07-08T09:00:00.000Z', hora_estimada: false, day: 'Push', records: {} }
    ];

    app.runMigrations();

    assert.equal(app.history[0].hora_inicio, '2026-07-01T12:00:00.000Z');
    assert.equal(app.history[0].hora_estimada, true);
    // La sesión que ya tenía hora real no se toca.
    assert.equal(app.history[1].hora_inicio, '2026-07-08T09:00:00.000Z');
    assert.equal(app.history[1].hora_estimada, false);
});

test('getExerciseSessionPoints combina en un punto ambiguo dos sesiones estimadas del mismo día', () => {
    const { app } = loadApp();
    app.history = [
        { date: '2026-08-01', hora_inicio: '2026-08-01T12:00:00.000Z', hora_estimada: true, day: 'Push', records: { 'Dominadas': [{ weight: 0, reps: 6, rir: 2 }] } },
        { date: '2026-08-01', hora_inicio: '2026-08-01T12:00:00.000Z', hora_estimada: true, day: 'Push', records: { 'Dominadas': [{ weight: 0, reps: 9, rir: 1 }] } },
        { date: '2026-08-08', hora_inicio: '2026-08-08T12:00:00.000Z', hora_estimada: true, day: 'Push', records: { 'Dominadas': [{ weight: 0, reps: 8, rir: 2 }] } }
    ];

    const points = app.getExerciseSessionPoints('Dominadas');

    assert.equal(points.length, 2, 'las 2 sesiones ambiguas del 1/8 deberían colapsar en un solo punto');
    assert.equal(points[0].date, '2026-08-01');
    assert.equal(points[0].ambiguous, true);
    assert.equal(points[1].date, '2026-08-08');
    assert.equal(points[1].ambiguous, false);
});

test('getExerciseSessionPoints NO combina dos sesiones del mismo día si ambas tienen hora real', () => {
    const { app } = loadApp();
    app.history = [
        { date: '2026-08-01', hora_inicio: '2026-08-01T08:00:00.000Z', hora_estimada: false, day: 'Push', records: { 'Press banca': [{ weight: 40, reps: 8, rir: 2 }] } },
        { date: '2026-08-01', hora_inicio: '2026-08-01T19:00:00.000Z', hora_estimada: false, day: 'Push', records: { 'Press banca': [{ weight: 42.5, reps: 6, rir: 1 }] } }
    ];

    const points = app.getExerciseSessionPoints('Press banca');

    assert.equal(points.length, 2, 'con hora real conocida, dos sesiones el mismo día son puntos distintos');
    assert.equal(points.every(p => !p.ambiguous), true);
});

test('importData ya NO descarta una segunda sesión real del mismo día (bug de fusión por fecha)', () => {
    const morningSesion = { date: '2026-09-01', hora_inicio: '2026-09-01T08:00:00.000Z', hora_estimada: false, day: 'Push', records: { 'Press banca': [{ weight: 40, reps: 8, rir: 2 }] } };
    const eveningSesion = { date: '2026-09-01', hora_inicio: '2026-09-01T19:00:00.000Z', hora_estimada: false, day: 'Push', records: { 'Sentadilla': [{ weight: 80, reps: 5, rir: 1 }] } };

    const { app, importData } = loadAppWithBackupIO([true], JSON.stringify({ exercises: [], history: [eveningSesion] }));
    app.exercises = [];
    app.history = [morningSesion];

    importData({ target: { files: [{}], value: '' } });

    assert.equal(app.history.length, 2, 'las dos sesiones reales del mismo día deben conservarse por separado');
});

test('importData sigue deduplicando si se re-importa exactamente el mismo backup', () => {
    const sesion = { date: '2026-09-01', hora_inicio: '2026-09-01T08:00:00.000Z', hora_estimada: false, day: 'Push', records: { 'Press banca': [{ weight: 40, reps: 8, rir: 2 }] } };

    const { app, importData } = loadAppWithBackupIO([true], JSON.stringify({ exercises: [], history: [sesion] }));
    app.exercises = [];
    app.history = [sesion];

    importData({ target: { files: [{}], value: '' } });

    assert.equal(app.history.length, 1, 'reimportar la sesión idéntica no debería duplicarla');
});

test('topSetOf desempata por reps cuando el peso es igual (ej. 0kg en peso corporal)', () => {
    const { app } = loadApp();
    const best = app.topSetOf([{ weight: 0, reps: 6, rir: 2 }, { weight: 0, reps: 9, rir: 1 }, { weight: 0, reps: 4, rir: 3 }]);
    assert.equal(best.reps, 9, 'con todo el peso empatado en 0, la mejor marca es la de más reps');

    // Sigue priorizando peso por sobre reps cuando el peso SÍ difiere (comportamiento previo intacto).
    const bestWeighted = app.topSetOf([{ weight: 40, reps: 10 }, { weight: 42.5, reps: 6 }]);
    assert.equal(bestWeighted.weight, 42.5);
});

test('estimateEffectiveOneRM da 0 solo por falta de datos, nunca por peso_kg=0 en un ejercicio a peso corporal', () => {
    const { app, estimateEffectiveOneRM } = loadApp();
    app.bodyweightLog = [{ date: '2026-07-01', weight: 80 }];
    const dominadas = { name: 'Dominadas', bodyweight: true };

    const sinLastre = estimateEffectiveOneRM(dominadas, { weight: 0, reps: 8 });
    assert.ok(sinLastre > 0, 'peso_kg=0 en un ejercicio a peso corporal no debería dar e1RM=0');

    const masReps = estimateEffectiveOneRM(dominadas, { weight: 0, reps: 10 });
    assert.ok(masReps > sinLastre, 'más reps al mismo peso corporal debería reflejar más progreso');

    const conLastre = estimateEffectiveOneRM(dominadas, { weight: 5, reps: 8 });
    assert.ok(conLastre > sinLastre, 'agregar lastre a las mismas reps debería subir el e1RM efectivo');

    // Un ejercicio NO marcado como bodyweight sigue usando el peso tal cual (sin sumar peso corporal).
    const banca = { name: 'Press banca', bodyweight: false };
    assert.equal(estimateEffectiveOneRM(banca, { weight: 0, reps: 8 }), 0);
});

test('getExerciseE1RMSeries no descarta las series sin lastre de un ejercicio a peso corporal', () => {
    const { app } = loadApp();
    app.exercises = [{ name: 'Dominadas', bodyweight: true }];
    app.bodyweightLog = [{ date: '2026-07-01', weight: 80 }];
    app.history = [
        { date: '2026-07-05', hora_inicio: '2026-07-05T08:00:00.000Z', hora_estimada: false, records: { 'Dominadas': [{ weight: 0, reps: 6, rir: 2 }] } },
        { date: '2026-07-12', hora_inicio: '2026-07-12T08:00:00.000Z', hora_estimada: false, records: { 'Dominadas': [{ weight: 5, reps: 6, rir: 2 }] } }
    ];

    const series = app.getExerciseE1RMSeries('Dominadas');

    assert.equal(series.length, 2, 'la serie sin lastre no debería desaparecer de la curva');
    assert.ok(series.every(p => p.e1rm > 0));
    assert.ok(series[1].e1rm > series[0].e1rm, 'agregar lastre debería seguir subiendo la misma curva, no una serie nueva');
});
