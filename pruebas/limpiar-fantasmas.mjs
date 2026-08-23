/*
 * Quitar las filas de resumen que se colaron como datos, sin llevarse nada más.
 *
 *   node pruebas/limpiar-fantasmas.mjs        (no necesita servidor)
 *
 * `instalar()` leía Metas y Cierres hasta `getLastRow()`, y debajo de sus datos
 * las dos tienen filas de resumen: «Total» en ambas y «SIN ASIGNAR» en Metas.
 * Se las tragaba como datos y la pasada siguiente las reescribía arriba
 * convertidas en metas y en meses cerrados de verdad. `leerTablaExistente` con
 * tope cerró la fábrica, pero en el libro de Gonzalo ya había cuatro metas y
 * dos cierres fantasma, y desde la app no hay forma de quitarlos: `reabrirMes`
 * exige un mes yyyy-mm y «Total» no lo es.
 *
 * Lo que hay que vigilar de una función que borra no es que borre: es que NO se
 * lleve nada más. Por eso el libro de pruebas trae fantasmas mezclados con
 * metas y cierres de verdad, y lo que se comprueba es lo que queda.
 *
 * Y que no borre por el nombre: una meta llamada «Total» con dinero guardado es
 * una meta, no un rótulo. Esa se respeta y se avisa.
 *
 * El bloque no se puede encoger. Las dos tablas tienen geometría fija y una
 * fila de resumen dos por debajo que suma exactamente ese bloque: quitar una
 * fila con deleteRow deja el SUM contando de menos y eso no da ningún error.
 * Aquí se comprueba que los diez huecos de Metas y los doce de Cierres siguen
 * estando, con los supervivientes arriba.
 */
import { cargar, hoja, libro } from './backend.mjs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

const FILA_DATOS = 5;
const TOPE_METAS = 10;
const TOPE_CIERRES = 12;

/* Las dos tablas con su forma de verdad: cabecera en la 4, datos desde la 5, y
   la fila de resumen dos por debajo del último hueco. */
function conFilas(cabecera, datos, tope, resumen) {
  const filas = [[''], [''], [''], cabecera];
  for (var i = 0; i < tope; i++) filas.push(datos[i] || []);
  filas.push([]);                       // el hueco entre los datos y el resumen
  resumen.forEach(r => { filas.push(r); filas.push([]); });
  return hoja(filas);
}

function libroDePruebas() {
  return libro({
    Metas: conFilas(
      ['META', 'OBJETIVO', 'GUARDADO', 'FALTA', 'AVANCE', 'ORDEN', 'ACTIVA', 'NOTAS'],
      [
        ['Total', 0, 0, 0, 0, 1, true, ''],              // fantasma
        ['Viaje a Japón', 3000000, 450000, 0, 0, 2, true, 'para 2027'],
        ['SIN ASIGNAR', 0, 0, 0, 0, 3, true, ''],        // fantasma
        ['Fondo de emergencia', 2000000, 800000, 0, 0, 4, true, '']
      ],
      TOPE_METAS,
      [['Total', 0, 0, 0], ['SIN ASIGNAR', 0, 'ahorro cerrado que aún no tiene meta']]
    ),
    Cierres: conFilas(
      ['MES', 'ENTRÓ', 'GASTÓ', 'AHORRO ESPERADO', 'TOTAL AHORRADO',
       'REPARTIDO', 'SIN ASIGNAR', 'CERRADO EL'],
      [
        ['2026-06', 1800000, 1200000, 500000, 600000, 600000, 0, new Date(2026, 6, 1, 12)],
        ['Total', 0, 0, 0, 0, 0, 0, ''],                 // fantasma
        ['2026-07', 1900000, 1300000, 500000, 600000, 0, 600000, new Date(2026, 7, 1, 12)]
      ],
      TOPE_CIERRES,
      [['Total', 0, 0, 0]]
    ),
    Reparto: hoja([[''], [''], [''], ['MES', 'FECHA', 'META', 'MONTO', 'ORIGEN', 'UUID']])
  });
}

const bloque = (elLibro, nombre, tope) =>
  elLibro.getSheetByName(nombre).getRange(FILA_DATOS, 1, tope, 8).getValues();

const elLibro = libroDePruebas();
const { limpiarFilasDeResumen } = cargar(['limpiarFilasDeResumen'], elLibro);
const r = limpiarFilasDeResumen();

console.log('\nDice lo que se ha llevado');
ok(r.metas.length === 2, 'dos metas fantasma: ' + JSON.stringify(r.metas));
ok(r.cierres.length === 1, 'un cierre fantasma: ' + JSON.stringify(r.cierres));

console.log('\nY en Metas quedan las de verdad, arriba y en orden');
{
  const filas = bloque(elLibro, 'Metas', TOPE_METAS);
  const nombres = filas.map(f => String(f[0] || '')).filter(n => n !== '');
  ok(nombres.length === 2, 'quedan dos: ' + JSON.stringify(nombres));
  ok(nombres[0] === 'Viaje a Japón' && nombres[1] === 'Fondo de emergencia',
     'y son las de verdad, sin huecos en medio');
  ok(Number(filas[0][1]) === 3000000, 'el objetivo del viaje sobrevive: ' + filas[0][1]);
  ok(filas.length === TOPE_METAS, 'y el bloque sigue teniendo ' + TOPE_METAS
     + ' huecos: ' + filas.length);
}

console.log('\nEn Cierres igual, y sin tocar los meses de verdad');
{
  const filas = bloque(elLibro, 'Cierres', TOPE_CIERRES);
  const meses = filas.map(f => String(f[0] || '')).filter(m => m !== '');
  ok(meses.length === 2, 'quedan dos: ' + JSON.stringify(meses));
  ok(meses[0] === '2026-06' && meses[1] === '2026-07', 'y son los de verdad, en orden');
  ok(Number(filas[1][1]) === 1900000, 'julio conserva lo que entró: ' + filas[1][1]);
  ok(filas[1][7] instanceof Date, 'y su sello de cerrado el, que es una fecha');
  ok(filas.length === TOPE_CIERRES, 'el bloque sigue teniendo ' + TOPE_CIERRES
     + ' huecos: ' + filas.length);
}

console.log('\nLas filas de resumen de debajo siguen donde estaban');
{
  const metas = elLibro.getSheetByName('Metas').getDataRange().getValues();
  const resumenMetas = metas.slice(FILA_DATOS + TOPE_METAS - 1).map(f => String(f[0] || ''));
  ok(resumenMetas.indexOf('Total') !== -1 && resumenMetas.indexOf('SIN ASIGNAR') !== -1,
     'Total y SIN ASIGNAR debajo de Metas: ' + JSON.stringify(resumenMetas.filter(Boolean)));

  const cierres = elLibro.getSheetByName('Cierres').getDataRange().getValues();
  const resumenCierres = cierres.slice(FILA_DATOS + TOPE_CIERRES - 1).map(f => String(f[0] || ''));
  ok(resumenCierres.indexOf('Total') !== -1,
     'y Total debajo de Cierres: ' + JSON.stringify(resumenCierres.filter(Boolean)));
}

console.log('\nUna meta llamada «Total» CON dinero es una meta, no un rótulo');
{
  const otro = libroDePruebas();
  otro.getSheetByName('Metas').getRange(FILA_DATOS, 1, 1, 3)
      .setValues([['Total', 500000, 120000]]);
  const limpia = cargar(['limpiarFilasDeResumen'], otro).limpiarFilasDeResumen;
  const s = limpia();

  const nombres = bloque(otro, 'Metas', TOPE_METAS)
    .map(f => String(f[0] || '')).filter(n => n !== '');
  ok(nombres.indexOf('Total') !== -1, 'sigue ahí: ' + JSON.stringify(nombres));
  ok(s.respetados.length === 1, 'y lo dice en voz alta: ' + JSON.stringify(s.respetados));
  ok(s.metas.length === 1, 'la otra fantasma sí se va: ' + JSON.stringify(s.metas));
}

console.log('\nSobre un libro ya limpio no hace nada');
{
  const s = cargar(['limpiarFilasDeResumen'], elLibro).limpiarFilasDeResumen();
  ok(s.metas.length === 0 && s.cierres.length === 0,
     'segunda pasada: ' + JSON.stringify([s.metas, s.cierres]));

  const nombres = bloque(elLibro, 'Metas', TOPE_METAS)
    .map(f => String(f[0] || '')).filter(n => n !== '');
  ok(nombres.length === 2, 'y deja las dos metas donde estaban: ' + JSON.stringify(nombres));
}

console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
