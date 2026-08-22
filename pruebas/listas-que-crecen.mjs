/*
 * Una cuenta o una categoría que no estaba en Listas no se escribe suelta:
 * se añade a la lista.
 *
 *   node pruebas/listas-que-crecen.mjs        (no necesita servidor)
 *
 * El fallo que la trae salió en el teléfono de Gonzalo. Tenía guardada «Cuenta
 * Corriente» como cuenta por defecto, esa cuenta se quitó de Listas, y desde
 * entonces cada gasto viajaba a la hoja con una cuenta que no existía en
 * ninguna parte. El backend la escribía sin rechistar —validarMovimiento mira
 * la fecha, el tipo y el importe, pero nunca las listas— y no se enteraba
 * nadie: en Anotar no salía ningún cajetín marcado y en la hoja quedaba una
 * cuenta fantasma.
 *
 * Que no dé error es lo que lo hace caro. `esCredito()` pregunta por la lista
 * de crédito, y una cuenta que no está en ninguna lista no es de crédito, así
 * que las compras con tarjeta se imputaban al mes de la fecha en vez de al mes
 * que las paga. Es la regla central de la app rompiéndose en silencio.
 *
 * La otra mitad es lo que pidió Gonzalo: poder inventarse una cuenta o una
 * categoría y que la hoja la acepte. Las dos mitades se arreglan igual, porque
 * son la misma pregunta —¿qué hago con un nombre que no conozco?— y aquí la
 * respuesta es apuntarlo.
 */
import { cargar, hoja, libro } from './backend.mjs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

const CABECERA = ['PERSONA', 'COLOR', 'DÍA COBRO TC',
                  'CUENTA', 'ES CRÉDITO', 'ACTIVA',
                  'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'];

const CUENTAS = ['Tarjeta Débito', 'Tarjeta de Crédito', 'Efectivo'];
const CATEGORIAS = [
  ['Alimentación', 'Gasto', 'Común'],
  ['Arriendo', 'Gasto', 'Común'],
  ['Sueldo', 'Ingreso', 'Personal']
];

/* Un libro con las tres listas en paralelo, como las escribe instalar(). */
function libroDePruebas() {
  const filas = [
    ['Listas', '', '', '', '', '', '', '', '', ''],
    ['La app lee estas listas.', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    CABECERA
  ];
  const cuantas = Math.max(CUENTAS.length, CATEGORIAS.length, 2);
  for (let i = 0; i < cuantas; i++) {
    const c = CATEGORIAS[i];
    const cuenta = CUENTAS[i] || '';
    filas.push([
      ['Gonzalo', 'Camila'][i] || '',
      ['#3D5A6C', '#A34E6B'][i] || '',
      i < 2 ? 5 : '',
      cuenta,
      cuenta === 'Tarjeta de Crédito',
      cuenta ? true : '',
      c ? c[0] : '', c ? c[1] : '', c ? c[2] : '', c ? true : ''
    ]);
  }

  return libro({
    Listas: hoja(filas),
    Movimientos: hoja([['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
                        'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID']]),
    // Solo la cabecera: con menos de dos filas uuidYaRegistrado dice que no,
    // que es lo que hace falta para que el movimiento llegue a escribirse.
    _uuids: hoja([['UUID', 'QUÉ', 'CUÁNDO']])
  });
}

/* Manda un movimiento y devuelve las listas tal como quedan en la hoja. */
function trasAnotar(movimiento) {
  const elLibro = libroDePruebas();
  const { altaMovimientos, leerListasExistentes } =
    cargar(['altaMovimientos', 'leerListasExistentes'], elLibro);
  const respuesta = altaMovimientos([movimiento]);
  return { respuesta, listas: leerListasExistentes(elLibro) };
}

const base = {
  uuid: 'u-1', fecha: '2026-08-22', tipo: 'Gasto', categoria: 'Alimentación',
  descripcion: '', importe: 1234, cuenta: 'Efectivo', persona: 'Gonzalo',
  reparto: 'Común', origen: 'app'
};

console.log('\nUna cuenta que no estaba');
{
  const { respuesta, listas } = trasAnotar({ ...base, cuenta: 'Tarjeta Falabella' });
  ok(respuesta.ok, 'el movimiento se acepta');
  ok(listas.cuentas.indexOf('Tarjeta Falabella') !== -1,
     'la cuenta nueva queda en Listas');
  CUENTAS.forEach(c => ok(listas.cuentas.indexOf(c) !== -1, 'sigue estando ' + c));
  ok(listas.categorias.length === CATEGORIAS.length,
     'las categorías no se tocan');
  ok(listas.personas.length === 2, 'las personas no se tocan');
  ok(listas.credito.indexOf('Tarjeta de Crédito') !== -1,
     'la de crédito sigue siendo de crédito');
}

console.log('\nUna categoría que no estaba');
{
  const { listas } = trasAnotar({ ...base, categoria: 'Mascotas' });
  const nueva = listas.categorias.filter(c => c.nombre === 'Mascotas')[0];
  ok(!!nueva, 'la categoría nueva queda en Listas');
  ok(nueva && nueva.tipo === 'Gasto', 'y con el tipo del movimiento que la trajo');
  ok(nueva && nueva.reparto === 'Común', 'y con su reparto');
  ok(listas.cuentas.length === CUENTAS.length, 'las cuentas no se tocan');
}

console.log('\nUna categoría de ingreso');
{
  const { listas } = trasAnotar({
    ...base, tipo: 'Ingreso', categoria: 'Devolución', reparto: 'Personal'
  });
  const nueva = listas.categorias.filter(c => c.nombre === 'Devolución')[0];
  ok(!!nueva, 'queda en Listas');
  ok(nueva && nueva.tipo === 'Ingreso', 'con tipo Ingreso, no Gasto');
}

console.log('\nLo que ya estaba no se duplica');
{
  const { listas } = trasAnotar({ ...base, cuenta: 'Efectivo' });
  ok(listas.cuentas.filter(c => c === 'Efectivo').length === 1,
     'una cuenta que ya estaba sigue apareciendo una sola vez');
  ok(listas.cuentas.length === CUENTAS.length, 'y no ha crecido la lista');
}

console.log('\nNi cambiando las mayúsculas');
{
  // La pantalla de Cuentas ya compara sin distinguir caja al añadir a mano.
  // Si aquí se comparase con ==, un «efectivo» tecleado en otro sitio dejaría
  // dos cuentas que para la hoja son distintas y para una persona la misma.
  const { listas } = trasAnotar({ ...base, cuenta: 'efectivo' });
  ok(listas.cuentas.length === CUENTAS.length,
     '«efectivo» no crea una cuenta aparte de «Efectivo»');
}

console.log('\nUn movimiento sin cuenta');
{
  const { listas } = trasAnotar({ ...base, cuenta: '' });
  ok(listas.cuentas.length === CUENTAS.length,
     'no añade una cuenta en blanco');
  ok(listas.cuentas.every(c => String(c).trim()), 'ninguna cuenta queda vacía');
}

console.log('\nVarios movimientos de una vez');
{
  const elLibro = libroDePruebas();
  const { altaMovimientos, leerListasExistentes } =
    cargar(['altaMovimientos', 'leerListasExistentes'], elLibro);
  altaMovimientos([
    { ...base, uuid: 'u-a', cuenta: 'Cuenta Vista' },
    { ...base, uuid: 'u-b', cuenta: 'Cuenta Vista', categoria: 'Bencina' },
    { ...base, uuid: 'u-c', cuenta: 'Transferencias' }
  ]);
  const listas = leerListasExistentes(elLibro);
  ok(listas.cuentas.indexOf('Cuenta Vista') !== -1, 'entra la primera cuenta nueva');
  ok(listas.cuentas.indexOf('Transferencias') !== -1, 'y también la segunda');
  ok(listas.cuentas.filter(c => c === 'Cuenta Vista').length === 1,
     'la repetida dentro del mismo lote entra una sola vez');
  ok(listas.categorias.filter(c => c.nombre === 'Bencina').length === 1,
     'y la categoría nueva del lote también');
}

console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
