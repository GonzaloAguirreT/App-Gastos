/*
 * Que el vestido caiga donde caen los datos.
 *
 *   node pruebas/hoja-y-vestido.mjs        (no necesita servidor)
 *
 * `apps-script/vestir-hoja.gs` solo pone formato: colores, anchos, degradados y
 * reglas condicionales sobre rangos A1. Eso quiere decir que cuando se
 * equivoca de columna **no da ningún error**: sale un libro con buena pinta,
 * el degradado sobre la columna de al lado y la regla roja apuntando a una
 * celda que no es la del descuadre.
 *
 * El archivo que venía en el paquete vestía el libro ANTERIOR al rediseño
 * —importe en la F cuando ahora está en la E, tipo en la C cuando ahora está en
 * la B, Fijos de catorce columnas cuando ahora son dieciséis, Listas de ocho
 * cuando ahora son diez— y nadie se habría enterado.
 *
 * Esta prueba lee los dos archivos como texto y comprueba que hablan del mismo
 * libro. No ejecuta Apps Script: no hace falta, porque lo que se desincroniza
 * son los números y las letras, y esos están escritos.
 */
import fs from 'node:fs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

const codigo = fs.readFileSync(new URL('../apps-script/Codigo.gs', import.meta.url), 'utf8');
const vestir = fs.readFileSync(new URL('../apps-script/vestir-hoja.gs', import.meta.url), 'utf8');

/* ------------------------------------------------- un solo nombre global */

/* En Apps Script todos los archivos comparten ámbito: dos funciones con el
   mismo nombre no dan error, la última cargada gana en silencio. */
const globalesVestir = [...vestir.matchAll(/^function\s+(\w+)/gm)].map(m => m[1]);
const globalesCodigo = new Set([...codigo.matchAll(/^function\s+(\w+)/gm)].map(m => m[1]));
const chocan = globalesVestir.filter(n => globalesCodigo.has(n));
ok(chocan.length === 0,
   'ningún nombre global de vestir-hoja.gs pisa uno de Codigo.gs'
   + (chocan.length ? ': ' + chocan.join(', ') : ''));
ok(globalesVestir.length === 1 && globalesVestir[0] === 'vestirLibro',
   'y solo declara uno: ' + globalesVestir.join(', '));

/* -------------------------------------------- las columnas de Movimientos */

const cabecera = nombre => {
  const m = codigo.match(new RegExp('const CABECERAS_' + nombre + ' = \\[([^;]+)\\];'));
  if (!m) throw new Error('no se encuentra CABECERAS_' + nombre);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};
const letra = i => String.fromCharCode(65 + i);
const columna = (nombre, campo) => {
  const i = cabecera(nombre).indexOf(campo);
  if (i === -1) throw new Error(campo + ' no está en CABECERAS_' + nombre);
  return letra(i);
};

const movs = cabecera('MOVIMIENTOS');
ok(movs.length === 11, 'Movimientos tiene once columnas (' + movs.length + ')');
ok(vestir.includes("cabecera(sh, 'A1:" + letra(movs.length - 1) + "1')"),
   'y vestir pinta la cabecera hasta la ' + letra(movs.length - 1));
ok(vestir.includes("cifra(sh, '" + columna('MOVIMIENTOS', 'IMPORTE') + "2:"),
   'el importe se formatea como cifra en su columna (' + columna('MOVIMIENTOS', 'IMPORTE') + ')');
ok(vestir.includes('$' + columna('MOVIMIENTOS', 'TIPO') + '2="Ingreso"'),
   'los ingresos se tiñen mirando la columna del tipo (' + columna('MOVIMIENTOS', 'TIPO') + ')');
ok(vestir.includes('$' + columna('MOVIMIENTOS', 'ORIGEN') + '2="fijo"'),
   'y las filas de un fijo, mirando la del origen (' + columna('MOVIMIENTOS', 'ORIGEN') + ')');
ok(vestir.includes('$' + columna('MOVIMIENTOS', 'SE USA EN') + '2="")'),
   'las filas sin «Se usa en» se marcan mirando su columna ('
   + columna('MOVIMIENTOS', 'SE USA EN') + ')');

/* --------------------------------------------------- las columnas de Fijos */

const fijos = cabecera('FIJOS');
ok(fijos.length === 16, 'Fijos tiene dieciséis columnas (' + fijos.length + ')');
ok(vestir.includes("cabecera(sh, 'A1:" + letra(fijos.length - 1) + "1')"),
   'y vestir pinta la cabecera hasta la ' + letra(fijos.length - 1));
ok(vestir.includes('$' + columna('FIJOS', 'PRÓXIMO CARGO') + '2>=TODAY()'),
   'lo que cae esta semana se mira en Próximo cargo ('
   + columna('FIJOS', 'PRÓXIMO CARGO') + ')');
ok(vestir.includes('$' + columna('FIJOS', 'ACTIVO') + '2=FALSE'),
   'y lo desactivado, en Activo (' + columna('FIJOS', 'ACTIVO') + ')');

/* -------------------------------------------------- las columnas de Listas */

const listas = cabecera('LISTAS');
ok(listas.length === 10, 'Listas tiene diez columnas (' + listas.length + ')');
ok(vestir.includes("cabecera(sh, 'A' + CAB + ':" + letra(listas.length - 1) + "' + CAB)"),
   'y vestir pinta la cabecera hasta la ' + letra(listas.length - 1));

/* ------------------------------------------------ las filas se derivan solas */

for (const tope of ['FILA_CABECERA', 'FILA_DATOS', 'TOPE_PERSONAS', 'TOPE_CATEGORIAS',
                    'TOPE_METAS', 'TOPE_CIERRES']) {
  ok(vestir.includes('return ' + tope + ';'),
     'vestir toma ' + tope + ' de Codigo.gs en vez de escribirlo a mano');
}

/* -------------------------------- las filas de total existen de verdad */

/* vestir pinta con fondo y filete una fila de total en Metas y en Cierres. Si
   instalar() no la escribe, ese formato cae sobre una fila vacía. */
ok(/hoja\.getRange\(filaTotal, 1, 1, 4\)/.test(codigo),
   'instalar() escribe la fila de Total en Metas');
ok(/hoja\.getRange\(filaTotal, 1\)\.setValue\('Total'\)/.test(codigo),
   'y la de Cierres');
ok(/'SIN ASIGNAR'/.test(codigo), 'y la celda de SIN ASIGNAR de Metas');
ok(vestir.includes("total(sh, 'A' + tot + ':H' + tot)"),
   'y vestir las viste derivando la fila del mismo tope');

/* ------------------------------------------------- nada de diálogos modales */

ok(!/getUi\(\)\s*\.\s*alert/.test(vestir),
   'no hay Ui.alert(): suspende el script hasta que alguien pulsa Aceptar');

console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
process.exit(fallos ? 1 : 0);
