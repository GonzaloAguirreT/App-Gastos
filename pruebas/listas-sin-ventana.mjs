/*
 * Escribir las listas no puede dejar el libro un instante sin ellas.
 *
 *   node pruebas/listas-sin-ventana.mjs        (no necesita servidor)
 *
 * `escribirListas` usaba `hojaLimpia`, que borra la hoja y la recrea. Entre las
 * dos cosas el libro no tiene hoja Listas. Y la lectura del mes NO pasa por el
 * cerrojo —`doPost` contesta a `mes` antes de pedirlo, a propósito, para que
 * leer no espere a escribir—, así que cualquier lectura que caiga en esa
 * ventana vuelve con las listas vacías.
 *
 * Lo que pasa después es lo caro, y no da ningún error: la app trata una lista
 * vacía como «no hay listas», se queda con la semilla de config.js para no
 * dejarte sin poder anotar, y en el siguiente ajuste que toques escribe esa
 * semilla ENCIMA de vuestras categorías y vuestras cuentas.
 *
 * Medido contra la hoja de verdad antes de arreglarlo: veinte lecturas
 * disparadas durante cuatro escrituras volvieron 8 vacías, 7 con la semilla y
 * solo 5 correctas. Y le pasó al libro de Gonzalo, que quedó con las 18
 * categorías de ejemplo y las cuentas renombradas.
 *
 * Aquí no se puede provocar la concurrencia —el libro de mentira es síncrono—,
 * así que se mide la causa: en CADA instante en que la escritura toca la
 * estructura del libro, una lectura tiene que seguir devolviendo las listas
 * enteras. Con hojaLimpia hay un instante en que no.
 *
 * Y se comprueba lo que hojaLimpia hacía gratis y ahora hay que hacer a mano:
 * una lista que se acorta no puede dejar sus filas viejas puestas.
 */
import { cargar, hoja, libro } from './backend.mjs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

const CATEGORIAS = [
  ['Alimentación', 'Gasto', 'Común'],
  ['Arriendo', 'Gasto', 'Común'],
  ['Suscripciones', 'Gasto', 'Común'],
  ['Restaurantes', 'Gasto', 'Personal'],
  ['Sueldo', 'Ingreso', 'Personal']
];
const CUENTAS = ['Tarjeta Débito', 'Tarjeta de Crédito', 'Efectivo', 'Ahorro'];
const PERSONAS = [['Gonzalo', '#3D5A6C', 5], ['Camila', '#A34E6B', 5]];

function libroDePruebas() {
  const filas = [
    [''], [''], [''],
    ['PERSONA', 'COLOR', 'DÍA COBRO TC', 'CUENTA', 'ES CRÉDITO', 'ACTIVA',
     'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA']
  ];
  const alto = Math.max(CATEGORIAS.length, CUENTAS.length, PERSONAS.length);
  for (var i = 0; i < alto; i++) {
    const p = PERSONAS[i], c = CATEGORIAS[i], cu = CUENTAS[i] || '';
    filas.push([
      p ? p[0] : '', p ? p[1] : '', p ? p[2] : '',
      cu, cu === 'Tarjeta de Crédito', cu ? true : '',
      c ? c[0] : '', c ? c[1] : '', c ? c[2] : '', c ? true : ''
    ]);
  }
  return libro({
    Listas: hoja(filas),
    Movimientos: hoja([['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
                        'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID']]),
    Config: hoja([['Config'], [''], [''], ['Ahorro esperado', 500000, '']]),
    _uuids: hoja([['UUID', 'RECIBIDO', 'QUÉ ERA']])
  });
}

/* Un libro que avisa cada vez que le tocan la estructura. Es el único momento
   en que la hoja puede no estar: si nadie la borra, no hay ventana. */
function conVigilante(elLibro, alTocar) {
  return new Proxy(elLibro, {
    get(o, prop) {
      if (prop === 'deleteSheet') {
        return h => { const r = o.deleteSheet(h); alTocar('deleteSheet'); return r; };
      }
      if (prop === 'insertSheet') {
        return (n, i) => { const r = o.insertSheet(n, i); alTocar('insertSheet ' + n); return r; };
      }
      return o[prop];
    }
  });
}

console.log('\nMientras se escriben las listas, una lectura las sigue viendo');
{
  const elLibro = libroDePruebas();
  const instantes = [];
  let leer = null;
  const vigilado = conVigilante(elLibro, etiqueta => {
    if (!leer) return;
    const d = leer();
    instantes.push({
      etiqueta,
      categorias: (d.categorias || []).length,
      categoria1: ((d.categorias || [])[0] || {}).nombre || '(ninguna)',
      cuenta1: (d.cuentas || [])[0] || '(ninguna)',
      persona1: ((d.personas || [])[0] || {}).nombre || '(ninguna)'
    });
  });

  const { guardarConfig, leerLibro } = cargar(['guardarConfig', 'leerLibro'], vigilado);
  leer = leerLibro;

  const antes = leerLibro();
  ok(antes.categorias.length === 5 && antes.cuentas.length === 4,
     'de partida la hoja tiene 5 categorías y 4 cuentas');

  guardarConfig({ categorias: CATEGORIAS.slice(0, 4).map(c => ({ nombre: c[0], tipo: c[1], reparto: c[2] })) });

  ok(instantes.every(i => i.etiqueta.indexOf('deleteSheet') !== 0),
     'no se borra ninguna hoja al escribir las listas'
     + (instantes.length ? ': ' + JSON.stringify(instantes.map(i => i.etiqueta)) : ''));

  /* Lo que hay que mirar NO es si la lectura vuelve vacía. `leerListasExistentes`
     rellena las listas vacías con su propia semilla, así que sin hoja Listas la
     lectura vuelve con 18 categorías de ejemplo y 4 cuentas: llena, y mentira.
     De las veinte lecturas que fallaron contra la hoja de verdad, siete tenían
     justo esa forma.

     Y se comparan los NOMBRES, no cuántos hay: la semilla del backend trae
     cuatro cuentas y dos personas, que son justo las cantidades de este libro,
     así que contando no se distingue de lo bueno. */
  const bueno = i => i.cuenta1 === 'Tarjeta Débito' && i.persona1 === 'Gonzalo'
                  && i.categoria1 === 'Alimentación' && i.categorias <= 5;
  const rotas = instantes.filter(i => !bueno(i));
  ok(rotas.length === 0,
     'y en ningún instante la lectura devuelve unas listas que no son las del libro'
     + (rotas.length ? ': ' + JSON.stringify(rotas) : ' (' + instantes.length + ' instantes mirados)'));

  const dsp = leerLibro();
  ok(dsp.categorias.length === 4,
     'y el cambio se escribe: quedan 4 categorías, ' + dsp.categorias.length);
  ok(dsp.cuentas.length === 4 && dsp.cuentas[0] === 'Tarjeta Débito',
     'sin tocar las cuentas: ' + JSON.stringify(dsp.cuentas));
}

console.log('\nUna lista que se acorta no deja sus filas viejas puestas');
{
  const elLibro = libroDePruebas();
  const { guardarConfig, leerLibro } = cargar(['guardarConfig', 'leerLibro'], elLibro);

  guardarConfig({ cuentas: ['Efectivo'], credito: [] });
  const d = leerLibro();
  ok(d.cuentas.length === 1 && d.cuentas[0] === 'Efectivo',
     'de cuatro cuentas a una: ' + JSON.stringify(d.cuentas));

  guardarConfig({ categorias: [{ nombre: 'Sola', tipo: 'Gasto', reparto: 'Común' }] });
  const e = leerLibro();
  ok(e.categorias.length === 1 && e.categorias[0].nombre === 'Sola',
     'de cinco categorías a una: ' + JSON.stringify(e.categorias.map(c => c.nombre)));
  ok(e.cuentas.length === 1, 'y la cuenta sigue siendo una: ' + JSON.stringify(e.cuentas));
}

/* El bloque escrito mide siempre al menos TOPE_CATEGORIAS filas (24), así que
   una lista de cinco que baja a una no deja nada por debajo: sobra hueco. El
   único caso en que hay filas de más que quitar es un libro que YA tenía más de
   24, y sin él esa mitad del arreglo entra sin que nadie la ejerza. Se comprobó
   sustituyendo el cuerpo por un `throw`: las pruebas seguían en verde. */
console.log('\nY con más de veinticuatro categorías, las que sobran se van');
{
  const filas = [
    [''], [''], [''],
    ['PERSONA', 'COLOR', 'DÍA COBRO TC', 'CUENTA', 'ES CRÉDITO', 'ACTIVA',
     'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA']
  ];
  for (var i = 0; i < 30; i++) {
    const p = PERSONAS[i], cu = CUENTAS[i] || '';
    filas.push([
      p ? p[0] : '', p ? p[1] : '', p ? p[2] : '',
      cu, cu === 'Tarjeta de Crédito', cu ? true : '',
      'Categoría ' + (i + 1), 'Gasto', 'Común', true
    ]);
  }
  const elLibro = libro({
    Listas: hoja(filas),
    Movimientos: hoja([['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
                        'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID']]),
    Config: hoja([['Config'], [''], [''], ['Ahorro esperado', 500000, '']]),
    _uuids: hoja([['UUID', 'RECIBIDO', 'QUÉ ERA']])
  });
  const { guardarConfig, leerLibro } = cargar(['guardarConfig', 'leerLibro'], elLibro);

  ok(leerLibro().categorias.length === 30, 'de partida hay 30 categorías');

  guardarConfig({ categorias: [{ nombre: 'Sola', tipo: 'Gasto', reparto: 'Común' }] });
  const d = leerLibro();
  ok(d.categorias.length === 1 && d.categorias[0].nombre === 'Sola',
     'de 30 a 1, sin dejar ninguna colgando: '
     + JSON.stringify(d.categorias.map(c => c.nombre)));
  ok(d.cuentas.length === 4, 'y las cuentas siguen enteras: ' + JSON.stringify(d.cuentas));
}

console.log('\nY sobre un libro que todavía no tiene hoja Listas, se crea');
{
  const elLibro = libro({
    Movimientos: hoja([['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
                        'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID']]),
    Config: hoja([['Config'], [''], [''], ['Ahorro esperado', 500000, '']]),
    _uuids: hoja([['UUID', 'RECIBIDO', 'QUÉ ERA']])
  });
  const { guardarConfig, leerLibro } = cargar(['guardarConfig', 'leerLibro'], elLibro);
  guardarConfig({ cuentas: ['Efectivo'], credito: [] });
  const d = leerLibro();
  ok(d.cuentas.length === 1 && d.cuentas[0] === 'Efectivo',
     'la hoja se crea y se escribe: ' + JSON.stringify(d.cuentas));
}

console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
