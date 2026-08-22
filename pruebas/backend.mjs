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

/**
 * Una hoja de mentira a partir de una tabla: `filas[0]` es la fila 1.
 *
 * Guarda lo que le escriben, que es lo que permite probar la ida y la vuelta:
 * escribir con guardarMetas y volver a leer con leerMetas. Sin eso el libro era
 * de solo lectura y no se podía ver, por ejemplo, que una meta sin nombre se
 * escribe pero no se vuelve a leer nunca.
 */
export function hoja(filas) {
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
  /* El formato de cada celda, solo para saber cuáles son texto plano. */
  const formatos = new Map();
  const marca = (f, c) => f + ':' + c;

  /**
   * Escribe como escribe Sheets: lo que empieza por «=» es una fórmula.
   *
   * `comoFormula` distingue setValues de setFormulas. En un setValues, un texto
   * que empieza por «=» NO se guarda: Sheets lo interpreta, lo calcula, y al
   * leerlo de vuelta sale el resultado. Salvo que la celda tenga formato texto
   * («@»), que es la única manera de guardar ese texto tal cual.
   *
   * Sin esto el libro de mentira era más tolerante que el de verdad justo en
   * esto: guardaba «=A1» y lo devolvía igual, mientras la hoja real devolvía el
   * contenido de A1. Una meta llamada «=A1» volvió llamándose «Metas de
   * ahorro», y lo repartido a una meta se busca por su nombre.
   *
   * No se calcula nada: basta con que lo que vuelve no sea lo que se escribió.
   */
  const evaluada = '#FÓRMULA EVALUADA#';
  const escribir = (fila, col, valores, comoFormula) => {
    valores.forEach((linea, i) => {
      const f = fila + i - 1;
      while (filas.length <= f) filas.push([]);
      linea.forEach((v, j) => {
        const c = col + j - 1;
        const esFormula = typeof v === 'string' && v.charAt(0) === '=';
        const texto = formatos.get(marca(f, c)) === '@';
        filas[f][c] = (esFormula && !comoFormula && !texto) ? evaluada : v;
      });
    });
  };

  const rango = (fila, col, nFilas, nCols) => encadenable({
    getValues: () => trozo(fila, col, nFilas, nCols),
    getValue: () => { const v = celda(fila, col); return v === undefined ? '' : v; },
    setValues: v => { escribir(fila, col, v); return rango(fila, col, nFilas, nCols); },
    setValue: v => { escribir(fila, col, [[v]]); return rango(fila, col, 1, 1); },
    setFormulas: v => { escribir(fila, col, v, true); return rango(fila, col, nFilas, nCols); },
    setFormula: v => { escribir(fila, col, [[v]], true); return rango(fila, col, 1, 1); },
    /* Solo interesa cuáles quedan en texto plano: es lo que decide si un «=»
       se guarda o se evalúa. */
    setNumberFormat: f => {
      for (let i = 0; i < nFilas; i++) {
        for (let j = 0; j < nCols; j++) formatos.set(marca(fila + i - 1, col + j - 1), f);
      }
      return rango(fila, col, nFilas, nCols);
    },
    clearContent: () => {
      escribir(fila, col, trozo(fila, col, nFilas, nCols).map(l => l.map(() => '')));
      return rango(fila, col, nFilas, nCols);
    },

    /* Buscar de verdad dentro del rango.

       Sin esto, `encadenable` devolvía el propio proxy para createTextFinder y
       para findNext, y un proxy nunca es null: TODA búsqueda por uuid
       encontraba algo. Así que `if (!fila) return 'no lo encontré'` no se
       ejecutaba jamás y las pruebas no podían ver la diferencia entre borrar
       una fila y no borrar ninguna. */
    createTextFinder: texto => {
      const buscado = String(texto);
      let donde = null;
      for (let f = fila; f < fila + nFilas && !donde; f++) {
        for (let c = col; c < col + nCols && !donde; c++) {
          const v = celda(f, c);
          if (v !== undefined && String(v) === buscado) donde = { f: f, c: c };
        }
      }
      const encontrador = encadenable({
        matchEntireCell: () => encontrador,
        matchCase: () => encontrador,
        findNext: () => donde
          ? encadenable({ getRow: () => donde.f, getColumn: () => donde.c })
          : null
      });
      return encontrador;
    }
  });

  const alto = () => filas.length;
  const ancho = () => filas.reduce((m, f) => Math.max(m, f.length), 0);

  /* getRange también en notación A1, porque el código la usa: Config se lee
     con getRange('B10:B12') y se escribe con getRange('B4').

     Antes cualquier cadena devolvía la celda A1, y eso miente en las dos
     direcciones: una lectura de tres filas devolvía una, y un setValue('B4')
     escribía en el título de la hoja. Es justo la clase de mentira que hace
     que una prueba pase con el código roto.

     'B5:D' —una columna entera desde una fila— no casa y cae en A1 como antes.
     Solo la usa formatoSeguro, que aquí no comprueba nada. */
  const A1 = /^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/;
  const columnaDe = letras =>
    letras.split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
  /* Hasta dónde llega «C:C» o «A5:A». En Sheets es la hoja entera; aquí basta
     con pasarse de lo que ninguna prueba va a escribir. */
  const HASTA_EL_FINAL = 1000;

  function rangoA1(texto) {
    const m = A1.exec(String(texto).trim().toUpperCase().replace(/\$/g, ''));
    if (!m) return rango(1, 1, 1, 1);
    const c1 = columnaDe(m[1]);
    const c2 = m[3] ? columnaDe(m[3]) : c1;
    const f1 = m[2] ? Number(m[2]) : 1;
    // Sin número al otro lado —«C:C», «A5:A»— el rango baja hasta el final.
    const f2 = m[4] ? Number(m[4]) : (m[3] ? HASTA_EL_FINAL : (m[2] ? f1 : HASTA_EL_FINAL));
    return rango(Math.min(f1, f2), Math.min(c1, c2),
                 Math.abs(f2 - f1) + 1, Math.abs(c2 - c1) + 1);
  }

  return encadenable({
    /* getRange en sus dos formas: por números y en A1.

       Y lanza igual que Sheets cuando le piden cero filas o cero columnas, que
       es lo que pasa al escribir una tabla vacía: `getRange(2, 1, 0, 1)` no
       devuelve un rango vacío, revienta. Sin esto el libro de mentira era más
       tolerante que el de verdad y dejaba pasar justo el fallo que sale al
       instalar sobre un libro recién vaciado. */
    getRange: (a, b, c, d) => {
      if (typeof a !== 'number') return rangoA1(a);
      const nFilas = c === undefined ? 1 : c;
      const nCols = d === undefined ? 1 : d;
      if (nFilas < 1) throw new Error('The number of rows in the range must be at least 1.');
      if (nCols < 1) throw new Error('The number of columns in the range must be at least 1.');
      return rango(a, b, nFilas, nCols);
    },
    /* appendRow escribe en la primera fila libre, y pasa por las mismas reglas
       que setValues: es como se escribe cada movimiento nuevo. Sin esto el
       libro se quedaba sin la fila y una prueba sobre lo que se guarda no
       comprobaba nada. */
    appendRow: valores => { escribir(alto() + 1, 1, [valores]); return encadenable({}); },
    getLastRow: alto,
    getLastColumn: ancho,
    getMaxRows: () => Math.max(alto(), 1000),
    getMaxColumns: () => Math.max(ancho(), 26),
    getFilter: () => null,
    getDataRange: () => rango(1, 1, Math.max(alto(), 1), Math.max(ancho(), 1))
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
