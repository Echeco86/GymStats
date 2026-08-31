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
