/*
 * La regla de la tarjeta: un gasto se cuenta en el mes que lo PAGA.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/calendario-chileno.mjs
 *
 * Es la decisión que ordena el libro entero y la más fácil de romper sin
 * enterarse, porque un mes descuadrado sigue enseñando cifras con buena pinta.
 * Aquí se comprueban las tres cosas que pide el contrato:
 *
 *   1. una compra con tarjeta hecha DESDE el día de cobro salta al mes
 *      siguiente, y hecha antes se queda en el suyo;
 *   2. cambiar el día de cobro mueve el movimiento de mes y el saldo cambia;
 *   3. la barra sigue cuadrando con (gastado + por venir) / entra.
 *
 * El día de cobro es de CADA persona: el servidor falso arranca con Gonzalo el
 * 5 y Camila el 20, así que la misma compra el mismo día cae en meses
 * distintos según quién la anote. Esa es la prueba de que no es del hogar.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://localhost:8300';
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };
const errores = [];

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 384, height: 780 } })).newPage();
p.on('pageerror', e => errores.push(e.message));
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

await p.goto(B + '/index.html', { waitUntil: 'networkidle' });
await p.evaluate(async base => {
  await ESTADO.guardarAjustes({ endpoint: base, token: 'secreto', persona: 'Gonzalo', onboarding: true });
  await ESTADO.sincronizar();
  VISTA.ir('mes');
}, B);
await p.waitForTimeout(400);

/* --------------------------------------------------- 1. la regla, en seco */

const mesDe = (dia, quien) => p.evaluate(([d, q]) => {
  const mes = ESTADO.mesEnCurso();
  return ESTADO.mesImputado({
    fecha: mes + '-' + String(d).padStart(2, '0'),
    tipo: 'Gasto', cuenta: 'Tarjeta Credito', persona: q
  });
}, [dia, quien]);

const enCurso = await p.evaluate(() => ESTADO.mesEnCurso());
const siguiente = await p.evaluate(() => FMT.mesMas(ESTADO.mesEnCurso(), 1));

ok(await mesDe(3, 'Gonzalo') === enCurso,
   'Gonzalo factura el 5: el día 3 se paga este mes');
ok(await mesDe(5, 'Gonzalo') === siguiente,
   'y el día 5 —su día de cobro— ya salta al siguiente');
ok(await mesDe(12, 'Camila') === enCurso,
   'Camila factura el 20: el día 12 se paga este mes');
ok(await mesDe(25, 'Camila') === siguiente,
   'y el día 25 salta al siguiente');
/* El día 12 cae entre los dos cortes —después del 5 de Gonzalo y antes del 20
   de Camila—, que es donde se ve que el día es de cada uno y no del hogar. */
ok(await mesDe(12, 'Gonzalo') !== await mesDe(12, 'Camila'),
   'el mismo día con la misma tarjeta cae en meses distintos: el día es de cada uno');

const efectivo = await p.evaluate(() => ESTADO.mesImputado({
  fecha: ESTADO.mesEnCurso() + '-28', tipo: 'Gasto', cuenta: 'Efectivo', persona: 'Gonzalo'
}));
ok(efectivo === enCurso, 'una cuenta que no es de crédito no aplaza nada');

/* ------------------------- 2. cambiar el día NO mueve lo que ya está escrito */

/* El servidor falso arranca con una compra de Gonzalo del 25 del mes pasado,
   posterior a su día de cobro: su factura llega a este mes.

   Subirle el día de cobro por encima del 25 la devolvía a su mes, y este
   bloque comprobaba justo eso. Ya no: una compra facturada con el corte que
   había se facturó así de verdad, y reescribirla es inventarse un pasado que
   no ocurrió —la factura de septiembre no puede cambiar en diciembre—. El
   corte nuevo manda desde que se cambia y hacia delante.

   Así que lo que se comprueba ahora es lo contrario, y con el mismo montaje:
   que el mes y el saldo NO se mueven. Quien vigila la otra mitad —que el corte
   nuevo sí manda en lo que se anote después— es corte-que-no-reescribe.mjs. */
const saldo = () => p.evaluate(() => ESTADO.resumen(ESTADO.mesEnCurso()).queda);
const gastado = () => p.evaluate(() => ESTADO.resumen(ESTADO.mesEnCurso()).gastado);

const antesSaldo = await saldo();
const antesGasto = await gastado();
const tarjetaAntes = await p.evaluate(() =>
  ESTADO.resumen(ESTADO.mesEnCurso()).porPersona.reduce((a, x) => a + x.tarjeta, 0));
ok(tarjetaAntes > 0, 'de entrada hay una factura de tarjeta de otro mes en este mes');

await p.evaluate(async () => {
  const { datos } = ESTADO.estado();
  await ESTADO.guardarConfig({
    personas: datos.personas.map(x => x.nombre === 'Gonzalo'
      ? Object.assign({}, x, { diaCobro: 28 }) : x)
  });
});
await p.waitForTimeout(300);

const despuesSaldo = await saldo();
const despuesGasto = await gastado();
console.log('  ·  saldo ' + antesSaldo + ' → ' + despuesSaldo
            + ' · gastado ' + antesGasto + ' → ' + despuesGasto);
ok(despuesGasto === antesGasto,
   'subir el día de cobro no saca del mes una compra ya facturada');
ok(despuesSaldo === antesSaldo, 'y el saldo no se mueve');
ok(await p.evaluate(() =>
     ESTADO.resumen(ESTADO.mesEnCurso()).porPersona.reduce((a, x) => a + x.tarjeta, 0)) === tarjetaAntes,
   'el tramo de tarjeta de otro mes sigue donde estaba');

/* ------------------------------------------------- 3. la barra sigue cuadrando */

/* El relleno de la barra es la suma de todos sus tramos. Tiene que valer lo
   mismo que (gastado + por venir) / entra, o la barra contradice al saldo que
   tiene justo encima. */
const cuadra = async () => p.evaluate(() => {
  const r = ESTADO.resumen(ESTADO.mesEnCurso());
  if (!r.entra) return { relleno: 0, esperado: 0 };
  const usado = r.porPersona.reduce((a, x) => a + x.parte + x.parteTarjeta, 0);
  const porVenir = Math.max(0, Math.min(100 - usado, r.pctPorVenir));
  return {
    relleno: usado + porVenir,
    esperado: Math.min(100, ((r.gastado + r.porVenir) / r.entra) * 100)
  };
});

for (const dia of [5, 20, 28]) {
  await p.evaluate(async d => {
    const { datos } = ESTADO.estado();
    await ESTADO.guardarConfig({
      personas: datos.personas.map(x => x.nombre === 'Gonzalo'
        ? Object.assign({}, x, { diaCobro: d }) : x)
    });
  }, dia);
  await p.waitForTimeout(200);
  const { relleno, esperado } = await cuadra();
  ok(Math.abs(relleno - esperado) < 0.15,
     'con el cobro el día ' + dia + ', la barra cuadra: '
     + relleno.toFixed(1) + '% ≈ ' + esperado.toFixed(1) + '%');
}

/* ---------------------------------------- el ingreso que se usa el mes que viene */

const antesEntra = await p.evaluate(() => ESTADO.resumen(ESTADO.mesEnCurso()).entra);
await p.evaluate(() => ESTADO.anotar({
  tipo: 'Ingreso', categoria: 'Bono', descripcion: '', importe: 300000,
  cuenta: 'Cuenta Corriente', persona: 'Camila', usaEn: 'siguiente'
}));
await p.waitForTimeout(200);
const despuesEntra = await p.evaluate(() => ESTADO.resumen(ESTADO.mesEnCurso()).entra);
const entraSiguiente = await p.evaluate(() =>
  ESTADO.resumen(FMT.mesMas(ESTADO.mesEnCurso(), 1)).entra);
ok(despuesEntra === antesEntra, 'un ingreso marcado «mes siguiente» no suma a este mes');
ok(entraSiguiente >= 300000, 'y sí suma al siguiente');

console.log('\nerrores:', errores.length ? errores : 'ninguno');
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
await b.close();
process.exit(fallos ? 1 : 0);
