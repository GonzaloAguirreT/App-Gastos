/*
 * instalar() dos veces seguidas tiene que dejar el libro igual que una.
 *
 *   node pruebas/instalar-dos-veces.mjs        (no necesita servidor)
 *
 * No lo dejaba. Metas y Cierres llevan debajo de sus datos una fila de resumen
 * —«Total» en las dos, y «SIN ASIGNAR» en Metas—, y la lectura previa de
 * instalar() llega hasta la última fila con algo escrito:
 *
 *     hoja.getRange(FILA_DATOS, 1, hoja.getLastRow() - FILA_CABECERA, ancho)
 *         .getValues().filter(f => f[0] !== '' && f[0] !== null)
 *
 * así que se las tragaba, y la pasada siguiente las reescribía arriba como
 * metas y cierres de verdad. Y crecía cada vez: con «Total» en la fila de datos
 * y en la de resumen, la lectura devolvía las dos.
 *
 * Salió en el libro de Gonzalo, que acabó con dos metas llamadas «Total» y «SIN
 * ASIGNAR» —editables desde Ahorro— y un cierre con el mes vacío. Lo peor es el
 * nombre: SIN ASIGNAR ya significa algo en la app, el ahorro cerrado que
 * todavía no tiene meta, y pasó a existir además como meta.
 *
 * La prueba es la definición de idempotente, que es lo que instalar() promete:
 * migra un libro a la forma de ahora, y volver a migrarlo no cambia nada.
 */
import { cargar, hoja, libro } from './backend.mjs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

/* Un libro con la forma de ahora y algo de vida: dos metas de verdad, un mes
   cerrado y un par de movimientos. */
function libroConDatos() {
  const relleno = (n, ancho) => Array.from({ length: n }, () => Array(ancho).fill(''));
  const titulo = ancho => [
    ['Título'].concat(Array(ancho - 1).fill('')),
    ['Explicación'].concat(Array(ancho - 1).fill('')),
    Array(ancho).fill('')
  ];

  return libro({
    Listas: hoja(titulo(10).concat([
      ['PERSONA', 'COLOR', 'DÍA COBRO TC', 'CUENTA', 'ES CRÉDITO', 'ACTIVA',
       'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'],
      ['Gonzalo', '#3D5A6C', 5, 'Tarjeta Débito', false, true, 'Alimentación', 'Gasto', 'Común', true],
      ['Camila', '#A34E6B', 5, 'Efectivo', false, true, 'Arriendo', 'Gasto', 'Común', true]
    ])),

    Movimientos: hoja([
      ['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE', 'CUENTA',
       'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID'],
      [new Date(2026, 6, 2, 12), 'Gasto', 'Arriendo', '', 620000, 'Tarjeta Débito',
       'Gonzalo', 'Común', '2026-07', 'app', 'm-1']
    ]),

    Fijos: hoja([['UUID', 'TIPO', 'CONCEPTO', 'IMPORTE', 'DÍA', 'CADA (MESES)',
                  'CUOTAS', 'RESTANTES', 'CUENTA', 'PERSONA', 'REPARTO',
                  'SE USA EN', 'ACTIVO', 'PRÓXIMO CARGO', 'ÚLTIMO CARGO', 'MES IMPUTADO']]),

    /* Metas tal y como las deja escribirMetas: diez filas de datos, la de Total
       dos más abajo, y SIN ASIGNAR dos más abajo todavía. */
    Metas: hoja(titulo(8).concat([
      ['META', 'OBJETIVO', 'GUARDADO', 'FALTA', 'AVANCE', 'ORDEN', 'ACTIVA', 'NOTAS'],
      ['Viaje', 1000000, 0, 0, '', 1, true, ''],
      ['Colchón', 2000000, 0, 0, '', 2, true, '']
    ]).concat(relleno(8, 8)).concat([
      ['Total', 3000000, 0, 0, '', '', '', ''],
      Array(8).fill(''),
      ['SIN ASIGNAR', 0, 'ahorro cerrado que aún no tiene meta', '', '', '', '', '']
    ])),

    Cierres: hoja(titulo(8).concat([
      ['MES', 'ENTRÓ', 'GASTÓ', 'AHORRO ESPERADO', 'TOTAL AHORRADO', 'REPARTIDO',
       'SIN ASIGNAR', 'CERRADO EL'],
      ['2026-07', 1000000, 300000, 500000, 700000, 700000, 0, new Date(2026, 7, 1, 12)]
    ]).concat(relleno(11, 8)).concat([
      ['Total', 1000000, 300000, '', 700000, 700000, 0, '']
    ])),

    Reparto: hoja(titulo(6).concat([
      ['MES', 'FECHA', 'META', 'MONTO', 'ORIGEN', 'UUID'],
      ['2026-07', new Date(2026, 7, 1, 12), 'Viaje', 700000, 'cierre', 'r-1']
    ])),

    Config: hoja([['Config', '', ''], ['', '', ''], ['', '', ''],
                  ['Ahorro esperado', 500000, '']]),
    _uuids: hoja([['UUID', 'RECIBIDO', 'QUÉ ERA']]),
    Panel: hoja([['Panel']]),
    'Año': hoja([['Año']])
  });
}

/* Lo que la app vería del libro: solo eso importa, y es lo que no puede cambiar
   entre una instalación y la siguiente. */
function retrato(elLibro) {
  const { leerTablaExistente, leerListasExistentes } =
    cargar(['leerTablaExistente', 'leerListasExistentes'], elLibro);
  /* Con su tope, que es como las lee instalar(): las filas de resumen que van
     debajo no son datos. Sin él, este retrato las contaría y la prueba
     terminaría comprobando el propio fallo que persigue. */
  const metas = leerTablaExistente(elLibro, 'Metas', 8, 10).map(f => String(f[0]));
  const cierres = leerTablaExistente(elLibro, 'Cierres', 8, 12).map(f => String(f[0]));
  const listas = leerListasExistentes(elLibro);
  return {
    metas, cierres,
    cuentas: listas.cuentas.slice(),
    categorias: listas.categorias.map(c => c.nombre),
    personas: listas.personas.map(p => p.nombre)
  };
}

const elLibro = libroConDatos();
const { instalar } = cargar(['instalar'], elLibro);

console.log('\nPrimera instalación');
instalar();
const primera = retrato(elLibro);
ok(primera.metas.indexOf('Viaje') !== -1, 'las metas de verdad siguen ahí');
ok(primera.metas.indexOf('Colchón') !== -1, 'las dos');
ok(primera.cierres.indexOf('2026-07') !== -1, 'y el mes cerrado también');

console.log('\nSegunda instalación, sin tocar nada en medio');
instalar();
const segunda = retrato(elLibro);

ok(JSON.stringify(segunda.metas) === JSON.stringify(primera.metas),
   'las metas son exactamente las mismas: ' + JSON.stringify(segunda.metas));
ok(JSON.stringify(segunda.cierres) === JSON.stringify(primera.cierres),
   'y los cierres también: ' + JSON.stringify(segunda.cierres));

console.log('\nY las filas de resumen no se han colado como datos');
ok(segunda.metas.indexOf('Total') === -1,
   '«Total» no es una meta');
ok(segunda.metas.indexOf('SIN ASIGNAR') === -1,
   '«SIN ASIGNAR» tampoco: en la app ya significa otra cosa');
ok(segunda.cierres.indexOf('Total') === -1,
   'ni «Total» es un mes cerrado');

console.log('\nNi las listas han crecido');
ok(JSON.stringify(segunda.cuentas) === JSON.stringify(primera.cuentas),
   'las cuentas no cambian');
ok(JSON.stringify(segunda.categorias) === JSON.stringify(primera.categorias),
   'las categorías tampoco');
ok(JSON.stringify(segunda.personas) === JSON.stringify(primera.personas),
   'ni las personas');

console.log('\nY una tercera tampoco añade nada');
instalar();
const tercera = retrato(elLibro);
ok(JSON.stringify(tercera.metas) === JSON.stringify(primera.metas),
   'las metas siguen siendo las de la primera vez');
ok(JSON.stringify(tercera.cierres) === JSON.stringify(primera.cierres),
   'y los cierres igual');

console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
