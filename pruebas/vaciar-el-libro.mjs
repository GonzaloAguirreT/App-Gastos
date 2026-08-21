/*
 * Que vaciar el libro se lleve los datos y no las fórmulas.
 *
 *   node pruebas/vaciar-el-libro.mjs        (no necesita servidor)
 *
 * `vaciar()` limpia rangos A1. Igual que el vestido, cuando se equivoca de
 * columna **no da ningún error**: se lleva por delante una columna de fórmulas
 * y lo que queda es un libro con buena pinta en el que «Guardado» ya no suma
 * nada, «Total Ahorrado» está en blanco y ningún fijo tiene mes imputado. Y no
 * se nota hasta el primer cierre de mes.
 *
 * Las columnas de fórmula están intercaladas entre las de datos —en Metas la
 * C, la D y la E; en Cierres la E, la F y la G; en Fijos la P— porque el orden
 * de las cabeceras es el contrato de la hoja y no se reordena. Así que vaciar
 * no puede ser «de la A a la última»: hay que saltárselas, y saltárselas a
 * mano es justo lo que se desincroniza cuando alguien añade una columna.
 *
 * Esta prueba ejecuta `vaciar()` contra un libro de mentira que apunta qué
 * rangos le mandan limpiar, y saca del propio `Codigo.gs` en qué columna
 * escribe las fórmulas cada función. Luego comprueba que no se pisan. No hace
 * falta Apps Script: lo que se desincroniza son las letras y los números, y
 * esos están escritos.
 */
import fs from 'node:fs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

const codigo = fs.readFileSync(new URL('../apps-script/Codigo.gs', import.meta.url), 'utf8');

const numero = nombre => {
  const m = codigo.match(new RegExp('const ' + nombre + ' = (\\d+);'));
  if (!m) throw new Error('no se encuentra ' + nombre);
  return Number(m[1]);
};
const FILA_DATOS = numero('FILA_DATOS');
const TOPE_METAS = numero('TOPE_METAS');
const TOPE_CIERRES = numero('TOPE_CIERRES');

const cabecera = nombre => {
  const m = codigo.match(new RegExp('const CABECERAS_' + nombre + ' = \\[([^;]+)\\];'));
  if (!m) throw new Error('no se encuentra CABECERAS_' + nombre);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};

/* ------------------------------------------- qué limpia vaciar(), de verdad */

/* Se ejecuta `vaciar()` de verdad, con un libro de mentira que apunta qué
   rangos le mandan limpiar. Ejecutarla en vez de leerla es lo que hace que la
   prueba siga valiendo cuando los rangos se escriban de otra forma: lo que
   importa son las celdas que salen, no cómo se construyen.

   El libro de mentira devuelve una hoja para CUALQUIER nombre, también para las
   que no hay que tocar: así se ve si alguna vez se cuela una. */
const cuerpo = codigo.match(/function vaciar\(\) \{([\s\S]*?)\n\}/);
if (!cuerpo) throw new Error('no se encuentra function vaciar()');

const limpiado = {};
const libroFalso = {
  getName: () => 'Gastos - libro de la app',
  copy: () => ({ getUrl: () => 'https://docs.google.com/copia' }),
  toast: () => {},
  getSheetByName: nombre => ({
    getRange: a1 => ({
      clearContent: () => { limpiado[nombre] = (limpiado[nombre] || []).concat([a1]); }
    })
  })
};

new Function('SpreadsheetApp', 'Utilities', 'hoy', 'zonaDeLaHoja', 'console',
             'FILA_DATOS', 'TOPE_METAS', 'TOPE_CIERRES',
             'HOJA_MOVIMIENTOS', 'HOJA_FIJOS', 'HOJA_METAS', 'HOJA_CIERRES',
             'HOJA_REPARTO', 'HOJA_UUIDS', cuerpo[1])(
  { getActive: () => libroFalso },
  { formatDate: () => '2026-08-21 12:00' },
  () => new Date(), () => 'UTC', { log: () => {} },
  FILA_DATOS, TOPE_METAS, TOPE_CIERRES,
  'Movimientos', 'Fijos', 'Metas', 'Cierres', 'Reparto', '_uuids');

ok(Object.keys(limpiado).length > 0, 'vaciar() ha pedido limpiar algo');

/* Un rango A1 —'A5:B14', 'A2:K'— a las columnas y filas que toca. Sin fila
   final significa «hasta abajo», que aquí es infinito. */
const indice = letra => letra.charCodeAt(0) - 64;
function trozos(a1) {
  const [ini, fin] = a1.split(':');
  const a = ini.match(/^([A-Z]+)(\d*)$/);
  const b = fin.match(/^([A-Z]+)(\d*)$/);
  return {
    columnas: { desde: indice(a[1]), hasta: indice(b[1]) },
    filas: { desde: Number(a[2] || 1), hasta: b[2] ? Number(b[2]) : Infinity }
  };
}
const rangosDe = hoja => (limpiado[hoja] || []).map(trozos);
const columnaLimpia = (hoja, col) =>
  rangosDe(hoja).some(r => col >= r.columnas.desde && col <= r.columnas.hasta);

/* ------------------------------ las columnas de fórmula NO se pueden limpiar */

/* De dónde sale cada una: el `getRange(fila, columna, alto, ancho)` que las
   escribe. Se lee del propio Codigo.gs para que mover una fórmula de columna
   mueva también lo que esta prueba espera. */
const columnasDeFormula = (funcion, ancla) => {
  const trozo = codigo.match(new RegExp('function ' + funcion + '\\([\\s\\S]*?\\n\\}'));
  if (!trozo) throw new Error('no se encuentra ' + funcion);
  const m = trozo[0].match(new RegExp('getRange\\(' + ancla + ',\\s*(\\d+),[^)]*\\)\\.setFormulas'));
  if (!m) throw new Error('no se encuentra el setFormulas de ' + funcion);
  const desde = Number(m[1]);
  const ancho = Number(trozo[0].match(
    new RegExp('getRange\\(' + ancla + ',\\s*\\d+,[^,]+,\\s*(\\d+)\\)\\.setFormulas'))[1]);
  const cols = [];
  for (let c = desde; c < desde + ancho; c++) cols.push(c);
  return cols;
};

const formulas = {
  Metas: columnasDeFormula('escribirMetas', 'FILA_DATOS'),
  Cierres: columnasDeFormula('ponerFormulasCierre', 'desde'),
  Fijos: columnasDeFormula('ponerFormulaMesImputado', 'desde')
};

const letra = i => String.fromCharCode(64 + i);
for (const hoja of Object.keys(formulas)) {
  const pisadas = formulas[hoja].filter(c => columnaLimpia(hoja, c));
  ok(pisadas.length === 0,
     hoja + ': vaciar no toca sus columnas de fórmula ('
     + formulas[hoja].map(letra).join(', ') + ')'
     + (pisadas.length ? ' — PISA ' + pisadas.map(letra).join(', ') : ''));
}

/* -------------------------------- y las de datos sí tienen que quedar vacías */

/* El otro lado del mismo error: saltarse una columna de más deja un dato
   escrito en un libro que se pidió vacío. */
const datosDe = (hoja, nombre) => {
  const cols = [];
  for (let c = 1; c <= cabecera(nombre).length; c++) {
    if ((formulas[hoja] || []).indexOf(c) === -1) cols.push(c);
  }
  return cols;
};
for (const [hoja, nombre] of [['Movimientos', 'MOVIMIENTOS'], ['Fijos', 'FIJOS'],
                              ['Metas', 'METAS'], ['Cierres', 'CIERRES'],
                              ['Reparto', 'REPARTO']]) {
  const sinLimpiar = datosDe(hoja, nombre).filter(c => !columnaLimpia(hoja, c));
  ok(sinLimpiar.length === 0,
     hoja + ': todas sus columnas de datos quedan vacías'
     + (sinLimpiar.length ? ' — SE QUEDA ' + sinLimpiar.map(letra).join(', ') : ''));
}

/* ------------------------------- ni las filas de Total, que también son suma */

/* En Metas y en Cierres hay una fila de Total dos por debajo de la última de
   datos, y en Metas una de SIN ASIGNAR dos más abajo. Limpiar «hasta abajo» en
   estas dos hojas se las llevaría. */
for (const [hoja, tope] of [['Metas', TOPE_METAS], ['Cierres', TOPE_CIERRES]]) {
  const ultima = FILA_DATOS + tope - 1;
  const seExcede = rangosDe(hoja).filter(r => r.filas.hasta > ultima);
  ok(seExcede.length === 0,
     hoja + ': no baja de la fila ' + ultima + ', donde acaban los datos y '
     + 'empiezan los totales');
}

/* ------------------------------------------------ vaciar no es una acción */

/* Nada que se pueda tocar desde el teléfono puede borrar un año de gastos: se
   ejecuta a mano desde el editor, como instalar(). */
const despachar = codigo.match(/function despachar\([\s\S]*?\n\}/)[0];
ok(!/vaciar/.test(despachar), 'ninguna acción del backend llama a vaciar()');
ok(/libro\.copy\(/.test(cuerpo[1]), 'vaciar() hace una copia del libro antes de nada');
ok(cuerpo[1].indexOf('libro.copy(') < cuerpo[1].indexOf('limpiar('),
   'y la hace ANTES de limpiar, que es cuando todavía sirve de algo');
ok(!/getUi\(\)\s*\.\s*alert/.test(cuerpo[1]),
   'no hay Ui.alert(): suspende el script hasta que alguien pulsa Aceptar');

/* --------------------------------- lo que NO se vacía sigue sin vaciarse */

/* «Que quede sin ningún dato» son los gastos, no la configuración: sin
   categorías ni personas la app no deja anotar nada, y habría que montarla
   entera otra vez para volver a empezar. */
for (const hoja of ['Listas', 'Config', 'Panel', 'Año']) {
  ok(!limpiado[hoja], hoja + ' no se toca');
}

console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
process.exit(fallos ? 1 : 0);
