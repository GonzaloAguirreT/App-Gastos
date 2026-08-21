/*
 * Ejecutar `apps-script/Codigo.gs` en Node, con una hoja de mentira.
 *
 * No es una prueba: es lo que usan las que prueban el backend.
 *
 * El backend no se podía probar sin subirlo a Apps Script y mirar el libro con
 * los ojos, y por eso los fallos de columna se descubrían en el teléfono. Y son
 * justo los que no dan ningún error: leer la columna de al lado devuelve un
 * valor perfectamente válido —un `true`, un «Común»— que se guarda, se pinta y
 * no se queja nadie.
 *
 * Codigo.gs es JavaScript normal: fuera de las funciones solo hay constantes, y
 * todo lo de Google —SpreadsheetApp, Utilities, DriveApp— se toca dentro. Así
 * que se puede evaluar entero pasándole esos nombres como argumentos, y luego
 * llamar a la función que se quiera con un libro fabricado a mano.
 */
import fs from 'node:fs';

/**
 * Lo que no esté escrito aquí devuelve el propio objeto.
 *
 * Casi toda la API de Sheets encadena —`getRange().setValues().setFontWeight()`—
 * y enumerarla entera sería copiarla. Con esto el libro de mentira acepta
 * cualquier método que no cambie lo que se está comprobando, y solo hay que
 * escribir los que devuelven datos o los que tienen que fallar como los de
 * verdad.
 */
function encadenable(base) {
  const p = new Proxy(base, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      // `then` no: un objeto con then() parece una promesa y `await` lo llama.
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return () => p;
    }
  });
  return p;
}

/** Una hoja de mentira a partir de una tabla: `filas[0]` es la fila 1. */
export function hoja(filas) {
  const alto = filas.length;
  const ancho = filas.reduce((m, f) => Math.max(m, f.length), 0);
  const celda = (f, c) => (filas[f - 1] || [])[c - 1];
  const trozo = (fila, col, nFilas, nCols) => {
    const salida = [];
    for (let f = fila; f < fila + nFilas; f++) {
      const linea = [];
      for (let c = col; c < col + nCols; c++) {
        const v = celda(f, c);
        linea.push(v === undefined ? '' : v);
      }
      salida.push(linea);
    }
    return salida;
  };

  const rango = valores => encadenable({
    getValues: () => valores,
    getValue: () => valores[0][0]
  });

  return encadenable({
    /* getRange en sus dos formas: por números y en A1.

       Y lanza igual que Sheets cuando le piden cero filas o cero columnas, que
       es lo que pasa al escribir una tabla vacía: `getRange(2, 1, 0, 1)` no
       devuelve un rango vacío, revienta. Sin esto el libro de mentira era más
       tolerante que el de verdad y dejaba pasar justo el fallo que sale al
       instalar sobre un libro recién vaciado. */
    getRange: (a, b, c, d) => {
      if (typeof a !== 'number') return rango([['']]);
      const nFilas = c === undefined ? 1 : c;
      const nCols = d === undefined ? 1 : d;
      if (nFilas < 1) throw new Error('The number of rows in the range must be at least 1.');
      if (nCols < 1) throw new Error('The number of columns in the range must be at least 1.');
      return rango(trozo(a, b, nFilas, nCols));
    },
    getLastRow: () => alto,
    getLastColumn: () => ancho,
    getMaxRows: () => Math.max(alto, 1000),
    getMaxColumns: () => Math.max(ancho, 26),
    getFilter: () => null,
    getDataRange: () => rango(trozo(1, 1, Math.max(alto, 1), Math.max(ancho, 1)))
  });
}

/** Un libro de mentira: `{Listas: hoja([...]), Movimientos: hoja([...])}`. */
export function libro(hojas) {
  /* Se lleva un registro propio porque instalar() borra y recrea hojas
     —`hojaLimpia`— y luego las vuelve a pedir por nombre. */
  const registro = Object.assign({}, hojas);
  return encadenable({
    getName: () => 'Gastos - libro de mentira',
    getId: () => '1i-libro-de-mentira',
    getSpreadsheetTimeZone: () => 'America/Santiago',
    getSheetByName: nombre => registro[nombre] || null,
    getSheets: () => Object.keys(registro).map(n => registro[n]),
    getNumSheets: () => Object.keys(registro).length,
    insertSheet: nombre => (registro[nombre] = hoja([])),
    deleteSheet: h => {
      Object.keys(registro).forEach(n => { if (registro[n] === h) delete registro[n]; });
    },
    copy: () => encadenable({ getUrl: () => 'https://docs.google.com/copia' })
  });
}

/**
 * Carga Codigo.gs y devuelve las funciones que se le pidan.
 *
 *   const { leerListasExistentes } = cargar(['leerListasExistentes'], miLibro);
 *
 * Los nombres se piden explícitamente porque en Apps Script todo es global y
 * devolverlo entero escondería que una prueba depende de media docena de cosas.
 */
export function cargar(nombres, elLibro) {
  const codigo = fs.readFileSync(new URL('../apps-script/Codigo.gs', import.meta.url), 'utf8');
  const activo = elLibro || libro({});
  const globales = {
    SpreadsheetApp: {
      getActive: () => activo,
      getActiveSpreadsheet: () => activo,
      // vaciar() vuelve a pedir el libro tras copiarlo. Aquí es el mismo.
      openById: () => activo,
      flush: () => {},
      newDataValidation: () => ({
        requireValueInList() { return this; },
        setAllowInvalid() { return this; },
        build: () => ({})
      })
    },
    Utilities: {
      formatDate: (fecha, zona, formato) => {
        const d = new Date(fecha);
        const p = n => String(n).padStart(2, '0');
        return formato
          .replace('yyyy', d.getFullYear())
          .replace('MM', p(d.getMonth() + 1))
          .replace('dd', p(d.getDate()))
          .replace('HH', p(d.getHours()))
          .replace('mm', p(d.getMinutes()));
      },
      getUuid: () => 'uuid-de-mentira'
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'secreto' }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: t => ({ setMimeType: () => t })
    },
    DriveApp: { getFileById: () => ({ makeCopy: () => ({}) }) },
    // Los gráficos del Panel. Cualquier tipo vale: aquí no se dibuja nada.
    Charts: { ChartType: new Proxy({}, { get: (o, t) => String(t) }) },
    Session: { getScriptTimeZone: () => 'America/Santiago' },
    ScriptApp: {
      getProjectTriggers: () => [],
      // El disparador diario encadena: newTrigger().timeBased().atHour()...
      newTrigger: () => encadenable({})
    },
    Logger: { log: () => {} },
    console: { log: () => {}, error: () => {} }
  };

  const claves = Object.keys(globales);
  const cuerpo = codigo + '\n;return {' + nombres.join(', ') + '};';
  return new Function(...claves, cuerpo)(...claves.map(k => globales[k]));
}
