/*
 * Un nombre que empieza por «=» es un nombre, no una fórmula.
 *
 *   node pruebas/texto-que-empieza-por-igual.mjs        (no necesita servidor)
 *
 * Se guardó desde el teléfono una meta llamada «=A1» y la hoja la devolvió
 * llamada «Metas de ahorro», que es lo que hay en la celda A1 de esa hoja.
 * Sheets vio el «=», lo interpretó, lo calculó, y el nombre que había escrito
 * una persona dejó de existir.
 *
 * Duele más de lo que parece porque **lo repartido a una meta se busca por su
 * nombre**:
 *
 *     SUMIF(Reparto!$C:$C; $A5; Reparto!$D:$D)
 *
 * así que un nombre que cambia solo desconecta el dinero de su meta, y no salta
 * ningún error por ninguna parte.
 *
 * La única manera de guardar ese texto tal cual es que la celda tenga formato
 * de texto plano («@») ANTES de escribir. El truco ya estaba en casa —la
 * columna «Se usa en» de Movimientos y el mes de Cierres y Reparto se protegen
 * así— pero no llegaba a las columnas donde se escribe lo que teclea una
 * persona.
 *
 * El libro de mentira de backend.mjs evalúa como Sheets: un setValues con «=»
 * sobre una celda que no es texto ya no devuelve lo que se escribió.
 */
import { cargar, hoja, libro } from './backend.mjs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

const RAROS = ['=A1', '=1+1', '=SUM(A:A)'];

const titulo = ancho => [
  ['Título'].concat(Array(ancho - 1).fill('')),
  ['Explicación'].concat(Array(ancho - 1).fill('')),
  Array(ancho).fill('')
];

function libroDePruebas() {
  return libro({
    Listas: hoja(titulo(10).concat([
      ['PERSONA', 'COLOR', 'DÍA COBRO TC', 'CUENTA', 'ES CRÉDITO', 'ACTIVA',
       'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'],
      ['Gonzalo', '#3D5A6C', 5, 'Efectivo', false, true, 'Alimentación', 'Gasto', 'Común', true]
    ])),
    Movimientos: hoja([
      ['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE', 'CUENTA',
       'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID']
    ]),
    Fijos: hoja([['UUID', 'TIPO', 'CONCEPTO', 'IMPORTE', 'DÍA', 'CADA (MESES)',
                  'CUOTAS', 'RESTANTES', 'CUENTA', 'PERSONA', 'REPARTO',
                  'SE USA EN', 'ACTIVO', 'PRÓXIMO CARGO', 'ÚLTIMO CARGO', 'MES IMPUTADO']]),
    Metas: hoja(titulo(8).concat([CABECERAS_METAS_LOCAL()])),
    Cierres: hoja(titulo(8).concat([
      ['MES', 'ENTRÓ', 'GASTÓ', 'AHORRO ESPERADO', 'TOTAL AHORRADO', 'REPARTIDO',
       'SIN ASIGNAR', 'CERRADO EL']])),
    Reparto: hoja(titulo(6).concat([['MES', 'FECHA', 'META', 'MONTO', 'ORIGEN', 'UUID']])),
    _uuids: hoja([['UUID', 'RECIBIDO', 'QUÉ ERA']])
  });
}

function CABECERAS_METAS_LOCAL() {
  return ['META', 'OBJETIVO', 'GUARDADO', 'FALTA', 'AVANCE', 'ORDEN', 'ACTIVA', 'NOTAS'];
}

console.log('\nEl nombre de una meta');
{
  const elLibro = libroDePruebas();
  const { guardarMetas, leerTablaExistente } =
    cargar(['guardarMetas', 'leerTablaExistente'], elLibro);

  guardarMetas(RAROS.map((n, i) => ({ nombre: n, objetivo: 1000, orden: i + 1, activa: true })));
  const vuelven = leerTablaExistente(elLibro, 'Metas', 8, 10).map(f => String(f[0]));

  RAROS.forEach(n => ok(vuelven.indexOf(n) !== -1,
    'la meta «' + n + '» se vuelve a leer con su nombre'));
  ok(vuelven.length === RAROS.length,
     'y no hay ninguna de más ni de menos: ' + JSON.stringify(vuelven));
}

console.log('\nLa categoría, la descripción y la cuenta de un movimiento');
{
  const elLibro = libroDePruebas();
  const { altaMovimientos } = cargar(['altaMovimientos'], elLibro);

  altaMovimientos([{
    uuid: 'm-raro', fecha: '2026-08-10', tipo: 'Gasto',
    categoria: '=A1', descripcion: '=1+1', importe: 1234,
    cuenta: '=SUM(A:A)', persona: 'Gonzalo', reparto: 'Común', origen: 'app'
  }]);

  const hojaMov = elLibro.getSheetByName('Movimientos');
  const fila = hojaMov.getRange(2, 1, 1, 11).getValues()[0];
  ok(fila[2] === '=A1', 'la categoría se guarda tal cual: ' + JSON.stringify(fila[2]));
  ok(fila[3] === '=1+1', 'la descripción también: ' + JSON.stringify(fila[3]));
  ok(fila[5] === '=SUM(A:A)', 'y la cuenta: ' + JSON.stringify(fila[5]));
}

console.log('\nUna cuenta y una categoría de las listas');
{
  const elLibro = libroDePruebas();
  const { guardarConfig, leerListasExistentes } =
    cargar(['guardarConfig', 'leerListasExistentes'], elLibro);

  guardarConfig({
    cuentas: ['Efectivo', '=A1'],
    categorias: [
      { nombre: 'Alimentación', tipo: 'Gasto', reparto: 'Común' },
      { nombre: '=1+1', tipo: 'Gasto', reparto: 'Personal' }
    ]
  });
  const listas = leerListasExistentes(elLibro);
  ok(listas.cuentas.indexOf('=A1') !== -1,
     'la cuenta «=A1» sigue llamándose así: ' + JSON.stringify(listas.cuentas));
  ok(listas.categorias.some(c => c.nombre === '=1+1'),
     'y la categoría «=1+1» también: ' + JSON.stringify(listas.categorias.map(c => c.nombre)));
}

console.log('\nEl concepto de un fijo');
{
  const elLibro = libroDePruebas();
  const { guardarFijo } = cargar(['guardarFijo'], elLibro);

  guardarFijo({ uuid: 'f-raro', tipo: 'Gasto', concepto: '=A1', importe: 5000,
                dia: 5, cada: 1, cuotas: 0, restantes: 0, cuenta: 'Efectivo',
                persona: 'Gonzalo', reparto: 'Común', activo: true });

  const hojaFijos = elLibro.getSheetByName('Fijos');
  const fila = hojaFijos.getRange(2, 1, 1, 16).getValues()[0];
  ok(fila[2] === '=A1', 'el concepto se guarda tal cual: ' + JSON.stringify(fila[2]));
}

console.log('\nY una fórmula de verdad sigue siendo una fórmula');
{
  /* La otra mitad: forzar texto en las columnas de datos no puede romper las
     columnas que SÍ llevan fórmulas —«Guardado», «Falta», «Avance» de Metas—,
     que son las que hacen que el ahorro cuadre solo. */
  /* escribirMetas y no guardarMetas: las fórmulas de «Guardado», «Falta» y
     «Avance» las pone quien crea la hoja, no cada guardado. */
  const elLibro = libroDePruebas();
  const { escribirMetas } = cargar(['escribirMetas'], elLibro);
  escribirMetas(elLibro, [['=A1', 1000, '', '', '', 1, true, '']]);
  const fila = elLibro.getSheetByName('Metas').getRange(5, 1, 1, 5).getValues()[0];
  ok(String(fila[0]) === '=A1', 'el nombre es el nombre: ' + JSON.stringify(fila[0]));
  ok(String(fila[2]).charAt(0) === '=', 'y «Guardado» sigue siendo una fórmula: ' + fila[2]);
}

console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
