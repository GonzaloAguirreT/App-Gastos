/*
 * Cambiar el día de corte manda desde ahora, no hacia atrás.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/corte-que-no-reescribe.mjs
 *
 * La regla de la tarjeta es: una compra anterior al día de corte entra en la
 * factura de este mes, y desde ese día, en la del siguiente. Eso ya funcionaba.
 *
 * Lo que no: al cambiar el día de corte se reescribía el mes que paga TODAS las
 * compras del libro. Con el corte en 5, un gasto del 10 de septiembre se
 * facturaba en octubre; al pasar el corte a 20, ese mismo gasto —escrito hacía
 * semanas— se movía a septiembre. La factura de septiembre cambiaba en
 * diciembre.
 *
 * Pero esa compra se facturó de verdad con el corte que había. Si el banco te
 * cambia el corte, te lo cambia a partir de una fecha; lo cobrado ya está
 * cobrado, y reescribirlo es inventarse un pasado que no ocurrió.
 *
 * Se hacía por los dos lados a la vez, y por eso hacían falta dos arreglos:
 * `guardarConfig` rehacía la columna «Se usa en» de la hoja, y `mesImputado`
 * recalculaba en memoria con el corte de hoy. Con arreglar solo uno, la app y
 * la hoja habrían acabado diciendo cosas distintas, que es peor que el fallo.
 *
 * Y un mes cerrado no se toca nunca: su Total Ahorrado ya está escrito, y mover
 * sus movimientos a otro mes lo dejaría sin nada que lo respalde.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://localhost:8300';
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };
const errores = [];

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 360, height: 700 } })).newPage();
p.on('pageerror', e => errores.push(e.message));
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

await p.goto(B + '/index.html', { waitUntil: 'networkidle' });
await p.evaluate(async base => {
  await ESTADO.guardarAjustes({ endpoint: base, token: 'secreto', persona: 'Gonzalo', onboarding: true });
  await ESTADO.sincronizar();
  VISTA.ir('mes');
}, B);
await p.waitForTimeout(500);

/* Corte en 5 para los dos, y una cuenta de crédito conocida. */
await p.evaluate(async () => {
  const d = ESTADO.estado().datos;
  await ESTADO.guardarConfig({
    personas: d.personas.map(x => Object.assign({}, x, { diaCobro: 5 })),
    credito: ['Tarjeta Credito']
  });
  await ESTADO.sincronizar();
});
await p.waitForTimeout(700);

const esperaCola = async () => {
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(2000);
    if (await p.evaluate(async () => (await NUCLEO.todos()).length === 0)) return;
  }
};

/* Un gasto con tarjeta el día 10. Con el corte en 5, lo paga el mes siguiente. */
const mesDelGasto = await p.evaluate(() => FMT.mesDe(ESTADO.hoy()));
await p.evaluate(async mes => {
  await ESTADO.anotar({
    tipo: 'Gasto', categoria: 'Alimentación', descripcion: 'con tarjeta el 10',
    importe: 4444, cuenta: 'Tarjeta Credito', persona: 'Gonzalo',
    fecha: mes + '-10', usaEn: 'mismo'
  });
}, mesDelGasto);
await esperaCola();
await p.evaluate(() => ESTADO.sincronizar());
await p.waitForTimeout(600);

const mesSiguiente = await p.evaluate(m => FMT.mesMas(m, 1), mesDelGasto);

console.log('\nCon el corte en 5, un gasto del día 10 lo paga el mes siguiente');
const antes = await p.evaluate(() =>
  (ESTADO.estado().datos.movimientos || []).find(m => m.importe === 4444));
ok(!!antes, 'el gasto llega a la hoja');
ok(antes && antes.paraMes === mesSiguiente,
   'y queda facturado en ' + mesSiguiente + ': ' + (antes && antes.paraMes));
ok(await p.evaluate(m => ESTADO.mesImputado(m), antes) === mesSiguiente,
   'y la app dice lo mismo');

console.log('\nSe cambia el corte a 20, que dejaría el día 10 en su propio mes');
await p.evaluate(async () => {
  const d = ESTADO.estado().datos;
  await ESTADO.guardarConfig({ personas: d.personas.map(x => Object.assign({}, x, { diaCobro: 20 })) });
  await ESTADO.sincronizar();
});
await esperaCola();
await p.evaluate(() => ESTADO.sincronizar());
await p.waitForTimeout(700);

ok(await p.evaluate(() => ESTADO.diaCobroDe('Gonzalo')) === 20,
   'el corte nuevo llega a la hoja: el teléfono manda');

const despues = await p.evaluate(() =>
  (ESTADO.estado().datos.movimientos || []).find(m => m.importe === 4444));
ok(despues && despues.paraMes === mesSiguiente,
   'pero el gasto de antes sigue facturado en ' + mesSiguiente + ': ' + (despues && despues.paraMes));
ok(await p.evaluate(m => ESTADO.mesImputado(m), despues) === mesSiguiente,
   'y la app tampoco lo mueve: lo escrito manda');

console.log('\nY el corte nuevo sí manda en lo que se anote a partir de ahora');
await p.evaluate(async mes => {
  await ESTADO.anotar({
    tipo: 'Gasto', categoria: 'Alimentación', descripcion: 'otro del 10',
    importe: 5555, cuenta: 'Tarjeta Credito', persona: 'Gonzalo',
    fecha: mes + '-10', usaEn: 'mismo'
  });
}, mesDelGasto);
await esperaCola();
await p.evaluate(() => ESTADO.sincronizar());
await p.waitForTimeout(600);

const nuevo = await p.evaluate(() =>
  (ESTADO.estado().datos.movimientos || []).find(m => m.importe === 5555));
ok(nuevo && nuevo.paraMes === mesDelGasto,
   'un gasto del día 10 anotado ahora se paga en ' + mesDelGasto
   + ' (día 10 < corte 20): ' + (nuevo && nuevo.paraMes));

console.log('\nLos dos conviven, cada uno con el corte que tenía');
ok(despues && nuevo && despues.paraMes !== nuevo.paraMes,
   'dos gastos del mismo día caen en meses distintos, y está bien: '
   + despues.paraMes + ' y ' + nuevo.paraMes);

ok(errores.length === 0, 'sin errores en consola' + (errores.length ? ': ' + errores[0] : ''));

await b.close();
console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
