'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'docs', 'index.html');

// Nombres expuestos desde el <script> inline de docs/index.html para poder
// testearlos directamente, sin levantar un navegador. Se agregan acá a
// medida que hace falta testear algo nuevo.
const EXPORTS = [
    'app',
    'escapeHtml',
    'estimateOneRM',
    'classifyExercise',
    'classifyMuscleGroup',
    'classifyVolumeStatus',
    'classifyWeightTrend',
    'extractExercisesByDay',
    'slugifyExercise',
    'calculateRatioAnalysis',
    'buildSparklineSvg',
    'exportData',
    'importData',
    'BACKUP_SCHEMA_VERSION'
];

function makeLocalStorage() {
    let store = {};
    return {
        getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
}

// Extrae el <script> inline (sin src) de docs/index.html y lo ejecuta en un
// contexto vm aislado, con stubs mínimos de document/navigator/localStorage.
// Cada llamada devuelve una instancia nueva e independiente: nada se comparte
// entre tests.
//
// `overrides.sandbox` permite agregar/pisar globals del contexto (por ej.
// confirm, FileReader, Blob, URL) para tests que ejercitan flujos como
// exportar/importar un backup.
function loadApp(overrides = {}) {
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!match) {
        throw new Error('No se encontró un <script> inline (sin src) en docs/index.html');
    }

    // app.init() toca el DOM real (drag&drop, service worker, etc.) y no hace
    // falta para testear funciones puras.
    const body = match[1].replace('app.init();', '');

    const sandbox = {
        console,
        // No-ops: nada en los tests depende de que un setTimeout/setInterval
        // real llegue a dispararse (p. ej. el auto-hide de showAlert), y
        // dejarlos "reales" mantiene vivo el proceso de test innecesariamente.
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        navigator: {},
        localStorage: makeLocalStorage(),
        document: {
            // Un elemento "de mentira" genérico alcanza para código que solo
            // hace show/hide o pisa innerHTML (p. ej. showAlert). Los tests que
            // necesitan inspeccionar el HTML resultante de un id puntual pasan
            // su propio stub via overrides.sandbox.document.
            getElementById: () => ({ style: {}, innerHTML: '', value: '' }),
            querySelectorAll: () => [],
            addEventListener: () => {},
            createElement: () => ({ style: {}, click() {}, remove() {} }),
            body: { appendChild() {}, removeChild() {} }
        },
        ...overrides.sandbox
    };
    vm.createContext(sandbox);

    const exportsList = EXPORTS.join(', ');
    const script = `
        var window = this;
        ${body}
        var __testExports = { ${exportsList} };
    `;

    vm.runInContext(script, sandbox, { filename: 'docs/index.html (inline script)' });
    return sandbox.__testExports;
}

module.exports = { loadApp };
