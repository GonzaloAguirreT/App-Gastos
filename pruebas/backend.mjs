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

  const rango = valores => ({
    getValues: () => valores,
    getValue: () => valores[0][0],
    setValues: () => rango(valores),
    setValue: () => rango(valores),
    setFormulas: () => rango(valores),
    setFontWeight: () => rango(valores),
    setNumberFormat: () => rango(valores),
    clearContent: () => rango(valores),
    insertCheckboxes: () => rango(valores)
  });

  return {
    /* getRange en sus dos formas: por números y en A1. Aquí solo hace falta la
       de números, que es con la que se lee. */
    getRange: (a, b, c, d) => typeof a === 'number'
      ? rango(trozo(a, b, c === undefined ? 1 : c, d === undefined ? 1 : d))
      : rango([['']]),
    getLastRow: () => alto,
    getLastColumn: () => ancho,
    hideSheet: () => {},
    setFrozenRows: () => {},
    setColumnWidth() { return this; },
    getFilter: () => null,
    getDataRange: () => rango(trozo(1, 1, alto, ancho))
  };
}

/** Un libro de mentira: `{Listas: hoja([...]), Movimientos: hoja([...])}`. */
export function libro(hojas) {
  return {
    getName: () => 'Gastos - libro de mentira',
    getId: () => '1i-libro-de-mentira',
    getSheetByName: nombre => hojas[nombre] || null,
    getNumSheets: () => Object.keys(hojas).length,
    getSpreadsheetTimeZone: () => 'America/Santiago',
    toast: () => {},
    copy: () => ({ getUrl: () => 'https://docs.google.com/copia' }),
    insertSheet: () => hoja([]),
    deleteSheet: () => {},
    getSheets: () => Object.keys(hojas).map(n => hojas[n])
  };
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
    Session: { getScriptTimeZone: () => 'America/Santiago' },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({}) },
    Logger: { log: () => {} },
    console: { log: () => {}, error: () => {} }
  };

  const claves = Object.keys(globales);
  const cuerpo = codigo + '\n;return {' + nombres.join(', ') + '};';
  return new Function(...claves, cuerpo)(...claves.map(k => globales[k]));
}
