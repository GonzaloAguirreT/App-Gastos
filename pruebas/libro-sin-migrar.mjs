/*
 * Que las hojas se lean por su cabecera y no por su posición.
 *
 *   node pruebas/libro-sin-migrar.mjs        (no necesita servidor)
 *
 * Toda esta prueba es de una sola familia de fallos: leer una hoja por posición
 * fija cuando el contrato de columnas ha cambiado. Nunca lanza, porque en la
 * columna de al lado hay un valor perfectamente válido, así que el fallo sale
 * en el teléfono y no en el registro.
 *
 * Listas ha tenido dos formas. La vieja eran ocho columnas —PERSONA, COLOR,
 * CUENTA, ACTIVA, CATEGORÍA, TIPO, REPARTO, ACTIVA— y la de ahora son diez, con
 * DÍA COBRO TC y ES CRÉDITO metidas en medio.
 *
 * Leerla por posición sobre un libro con la forma vieja **no da ningún error**:
 * devuelve la columna de al lado, que también tiene un valor perfectamente
 * válido. Las cuentas salían llamándose «true» —era la casilla Activa— y las
 * categorías «Común» y «Personal» —era el reparto—. Así se veía la pantalla de
 * anotar: cuatro cajetines que decían true y una tira de categorías que decía
 * Común, Personal, Común.
 *
 * Y lo peor no era verlo: instalar() lee las listas y las vuelve a escribir, de
 * modo que la basura se guardaba en la hoja y ya no quedaba cabecera vieja que
 * detectar. Por eso aquí se prueban las tres situaciones: el libro viejo, el
 * libro de ahora, y el libro que ya se estropeó.
 */
import { cargar, hoja, libro } from './backend.mjs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

const CUENTAS = ['Cuenta Corriente', 'Tarjeta Credito', 'Tarjeta Debito', 'Efectivo'];
const CATEGORIAS = [
  ['Alimentación', 'Gasto', 'Común'],
  ['Restaurantes', 'Gasto', 'Personal'],
  ['Transporte', 'Gasto', 'Común'],
  ['Sueldo', 'Ingreso', 'Personal']
];

const titulo = ancho => [
  ['Listas'].concat(Array(ancho - 1).fill('')),
  ['La app lee estas listas.'].concat(Array(ancho - 1).fill('')),
  Array(ancho).fill('')
];

/* Las mismas listas, escritas en cada una de las dos formas. */
const listasViejas = () => hoja(titulo(8).concat([
  ['PERSONA', 'COLOR', 'CUENTA', 'ACTIVA', 'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'],
  ...CATEGORIAS.map((c, i) => [
    ['Gonzalo', 'Camila'][i] || '', ['#3D5A6C', '#A34E6B'][i] || '',
    CUENTAS[i] || '', CUENTAS[i] ? true : '',
    c[0], c[1], c[2], true
  ])
]));

const listasDeAhora = () => hoja(titulo(10).concat([
  ['PERSONA', 'COLOR', 'DÍA COBRO TC', 'CUENTA', 'ES CRÉDITO', 'ACTIVA',
   'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'],
  ...CATEGORIAS.map((c, i) => [
    ['Gonzalo', 'Camila'][i] || '', ['#3D5A6C', '#A34E6B'][i] || '',
    [5, 12][i] || '',
    CUENTAS[i] || '', CUENTAS[i] === 'Tarjeta Credito', CUENTAS[i] ? true : '',
    c[0], c[1], c[2], true
  ])
]));

/* Y la hoja tal como la dejó el fallo: la cabecera ya es la nueva, pero donde
   iban las cuentas hay casillas y donde iban las categorías, repartos. */
const listasRotas = () => hoja(titulo(10).concat([
  ['PERSONA', 'COLOR', 'DÍA COBRO TC', 'CUENTA', 'ES CRÉDITO', 'ACTIVA',
   'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'],
  ...CATEGORIAS.map((c, i) => [
    ['Gonzalo', 'Camila'][i] || '', ['#3D5A6C', '#A34E6B'][i] || '', '',
    'true', false, true,
    c[2], 'Gasto', 'Personal', true
  ])
]));

/* Movimientos del formato de ahora: es donde siguen estando los nombres de
   verdad cuando Listas ya se ha perdido. */
const movimientos = () => hoja([
  ['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
   'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID'],
  [new Date(2026, 7, 3), 'Gasto', 'Alimentación', 'Feria', 15000,
   'Cuenta Corriente', 'Gonzalo', 'Común', '2026-08', 'app', 'u1'],
  [new Date(2026, 7, 4), 'Gasto', 'Restaurantes', '', 9000,
   'Tarjeta Credito', 'Camila', 'Personal', '2026-09', 'app', 'u2'],
  [new Date(2026, 7, 5), 'Ingreso', 'Sueldo', '', 900000,
   'Cuenta Corriente', 'Gonzalo', 'Personal', '2026-08', 'app', 'u3']
]);

const leer = hojas => {
  const l = libro(hojas);
  const { leerListasExistentes } = cargar(['leerListasExistentes'], l);
  return leerListasExistentes(l);
};

/* ------------------------------------------------------- el libro de ahora */

const ahora = leer({ Listas: listasDeAhora(), Movimientos: movimientos() });
ok(JSON.stringify(ahora.cuentas) === JSON.stringify(CUENTAS),
   'libro de ahora: las cuentas son las cuentas — ' + JSON.stringify(ahora.cuentas));
ok(JSON.stringify(ahora.categorias.map(c => c.nombre))
   === JSON.stringify(CATEGORIAS.map(c => c[0])),
   'y las categorías, las categorías — ' + JSON.stringify(ahora.categorias.map(c => c.nombre)));
ok(JSON.stringify(ahora.credito) === JSON.stringify(['Tarjeta Credito']),
   'la tarjeta sigue siendo de crédito');
ok(ahora.personas[0].diaCobro === 5 && ahora.personas[1].diaCobro === 12,
   'y cada persona conserva SU día de cobro: '
   + JSON.stringify(ahora.personas.map(p => p.diaCobro)));
ok(ahora.categorias[3].tipo === 'Ingreso' && ahora.categorias[0].reparto === 'Común',
   'con su tipo y su reparto');

/* --------------------------------------------------------- el libro viejo */

const viejo = leer({ Listas: listasViejas(), Movimientos: movimientos() });
ok(viejo.cuentas.indexOf('true') === -1,
   'libro viejo: NINGUNA cuenta se llama «true» — ' + JSON.stringify(viejo.cuentas));
ok(JSON.stringify(viejo.cuentas) === JSON.stringify(CUENTAS),
   'y son las de verdad');
const nombresViejos = viejo.categorias.map(c => c.nombre);
ok(nombresViejos.indexOf('Común') === -1 && nombresViejos.indexOf('Personal') === -1,
   'ninguna categoría se llama «Común» ni «Personal» — ' + JSON.stringify(nombresViejos));
ok(JSON.stringify(nombresViejos) === JSON.stringify(CATEGORIAS.map(c => c[0])),
   'y son las de verdad');
ok(viejo.categorias[0].reparto === 'Común' && viejo.categorias[1].reparto === 'Personal',
   'con su reparto, que en el libro viejo estaba dos columnas más a la izquierda');
ok(JSON.stringify(viejo.credito) === JSON.stringify(['Tarjeta Credito']),
   'y aunque el libro viejo no sabía de crédito, migrar no deja a nadie sin la '
   + 'regla de la tarjeta: ' + JSON.stringify(viejo.credito));
ok(viejo.personas.every(p => p.diaCobro > 0),
   'ni sin día de cobro: ' + JSON.stringify(viejo.personas.map(p => p.diaCobro)));

/* ------------------------------------------------- el libro ya estropeado */

/* A este ya no le queda cabecera vieja que mirar: instalar() escribió la basura
   con la cabecera nueva encima. Los nombres solo están en los movimientos. */
const roto = leer({ Listas: listasRotas(), Movimientos: movimientos() });
ok(roto.cuentas.indexOf('true') === -1,
   'libro estropeado: se le quitan las cuentas llamadas «true» — '
   + JSON.stringify(roto.cuentas));
ok(roto.cuentas.indexOf('Cuenta Corriente') !== -1
   && roto.cuentas.indexOf('Tarjeta Credito') !== -1,
   'y se recuperan de los movimientos, que llevan la cuenta escrita en cada fila');
const nombresRotos = roto.categorias.map(c => c.nombre);
ok(nombresRotos.indexOf('Común') === -1 && nombresRotos.indexOf('Personal') === -1,
   'las categorías dejan de llamarse como un reparto — ' + JSON.stringify(nombresRotos));
ok(nombresRotos.indexOf('Alimentación') !== -1 && nombresRotos.indexOf('Sueldo') !== -1,
   'y también salen de los movimientos');
ok((roto.categorias.find(c => c.nombre === 'Sueldo') || {}).tipo === 'Ingreso',
   'con el tipo que traían: el sueldo sigue siendo un ingreso');
ok((roto.categorias.find(c => c.nombre === 'Alimentación') || {}).reparto === 'Común',
   'y su reparto');

/* -------------------------------------------------- un libro sin nada aún */

const nuevo = leer({});
ok(nuevo.cuentas.length > 0 && nuevo.categorias.length > 0 && nuevo.personas.length > 0,
   'un libro vacío sigue arrancando con la semilla');
ok(nuevo.cuentas.indexOf('true') === -1 && nuevo.categorias.every(c => c.nombre !== 'Común'),
   'y la semilla no trae basura');

/* --------------------- lo desactivado se recuerda, que ya costó una vez */

const conApagadas = hoja(titulo(10).concat([
  ['PERSONA', 'COLOR', 'DÍA COBRO TC', 'CUENTA', 'ES CRÉDITO', 'ACTIVA',
   'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'],
  ['Gonzalo', '#3D5A6C', 5, 'Cuenta Corriente', false, true, 'Alimentación', 'Gasto', 'Común', true],
  ['', '', '', 'Efectivo', false, false, 'Ocio', 'Gasto', 'Personal', false]
]));
const apagadas = leer({ Listas: conApagadas, Movimientos: movimientos() });
ok(apagadas.inactivas.cuentas.indexOf('Efectivo') !== -1,
   'una cuenta desmarcada se recuerda como inactiva, no se tira');
ok(apagadas.inactivas.categorias.indexOf('Ocio') !== -1,
   'y una categoría desmarcada, igual');
ok(apagadas.cuentas.indexOf('Efectivo') !== -1,
   'pero siguen en la lista: filtrarlas aquí las borraría de la hoja al escribir');

/* ============================ los movimientos y los fijos ============= */

/* La misma familia de fallo, en las dos hojas grandes. Movimientos ganó «Se usa
   en» en la I y Fijos ganó «Se usa en» y «Mes imputado»; leídas por posición,
   un libro sin migrar daba importes a cero, cuentas que eran cantidades y fijos
   sin próximo cargo, todo sin un solo error. */

const movViejos = hoja([
  ['FECHA', 'MES', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
   'CUENTA', 'PERSONA', 'REPARTO', 'ORIGEN', 'UUID'],
  [new Date(2026, 7, 3), '2026-08', 'Gasto', 'Alimentación', 'Feria', 15000,
   'Cuenta Corriente', 'Gonzalo', 'Común', 'app', 'u1'],
  [new Date(2026, 7, 5), '2026-08', 'Ingreso', 'Sueldo', '', 900000,
   'Cuenta Corriente', 'Gonzalo', 'Personal', 'app', 'u2']
]);

const fijosViejos = hoja([
  ['UUID', 'TIPO', 'CONCEPTO', 'IMPORTE', 'DÍA', 'CADA (MESES)', 'CUOTAS',
   'RESTANTES', 'CUENTA', 'PERSONA', 'REPARTO', 'ACTIVO', 'PRÓXIMO CARGO', 'ÚLTIMO CARGO'],
  ['f1', 'Gasto', 'Arriendo', 450000, 1, 1, '', '', 'Cuenta Corriente',
   'Gonzalo', 'Común', true, new Date(2026, 8, 1), '']
]);

const sinMigrar = libro({ Movimientos: movViejos, Fijos: fijosViejos });
const lectores = cargar(['leerMovimientos', 'leerFijos'], sinMigrar);

const movs = lectores.leerMovimientos(sinMigrar, '2020-01');
const sueldo = movs.find(m => m.categoria === 'Sueldo') || {};
const feria = movs.find(m => m.categoria === 'Alimentación') || {};

ok(movs.length === 2, 'libro sin migrar: se leen los dos movimientos');
ok(feria.importe === 15000 && sueldo.importe === 900000,
   'con su importe y no a cero: ' + JSON.stringify(movs.map(m => m.importe)));
ok(feria.cuenta === 'Cuenta Corriente' && feria.persona === 'Gonzalo',
   'la cuenta es una cuenta y la persona una persona: '
   + JSON.stringify({ cuenta: feria.cuenta, persona: feria.persona }));
ok(sueldo.tipo === 'Ingreso' && feria.tipo === 'Gasto', 'y el tipo, el tipo');
ok(feria.reparto === 'Común' && sueldo.reparto === 'Personal', 'y el reparto, el reparto');
/* El libro viejo no tenía «Se usa en»: sin esa columna vale el mes de la fecha,
   que para un gasto en efectivo sigue siendo la respuesta correcta. */
ok(feria.paraMes === '2026-08',
   'sin «Se usa en», el mes que paga es el de la fecha: ' + feria.paraMes);

const fijo = lectores.leerFijos(sinMigrar)[0] || {};
ok(fijo.concepto === 'Arriendo' && fijo.importe === 450000,
   'los fijos también se leen enteros');
ok(fijo.prox === '2026-09-01',
   'y conservan su próximo cargo, que se perdía al correrse dos columnas: '
   + JSON.stringify(fijo.prox));
ok(fijo.activo === true, 'y siguen activos');
ok(fijo.usaEn === 'mismo',
   'sin la columna de «Se usa en», un fijo cae en su propio mes');

console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
process.exit(fallos ? 1 : 0);
