/*
 * Un mes sin nada dentro todavía no ha ido mal.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/mes-recien-empezado.mjs
 *
 * El día 1, antes de que entre ningún sueldo, la pantalla Mes decía:
 *
 *     Has gastado de más un total de $200.000 sobre tu ahorro esperado
 *     de $200.000.
 *
 * ...sin un solo gasto anotado, y con el saldo en rojo. El aviso salta cuando
 * lo que queda baja del ahorro esperado, y con cero ingresos lo que queda es
 * cero, así que saltaba siempre. Es la primera pantalla que ve alguien recién
 * conectado: la app abría acusándole de algo que no ha hecho.
 *
 * El aviso solo tiene sentido cuando hay contra qué medirse. Sin ingresos no
 * hay techo, y sin techo no hay exceso: hay un mes que aún no ha empezado.
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
await p.waitForTimeout(300);

/* El mes en blanco: ni movimientos, ni fijos. Es lo que hay tras conectar una
   hoja recién instalada, y lo que hay el día 1 hasta que entra el primer
   sueldo. */
await p.evaluate(() => {
  const { datos } = ESTADO.estado();
  datos.movimientos.length = 0;
  datos.fijos.length = 0;
  MES.pintar();
});
await p.waitForTimeout(200);

const pantalla = await p.locator('#pantalla-mes').innerText();
console.log('--- lo que se ve ---\n' + pantalla.split('\n').slice(0, 8).join(' · ') + '\n');

ok(!/gastado de más/i.test(pantalla),
   'sin un solo gasto, NO acusa de haber gastado de más');
ok(!(await p.locator('#pantalla-mes .saldo.negativo').count()),
   'y el saldo no se pinta en rojo');

const r = await p.evaluate(() => ESTADO.resumen(ESTADO.mesEnCurso()));
ok(r.entra === 0 && r.gastado === 0, 'el mes está de verdad vacío');
ok(r.bajoAhorro === false, 'y no se da por debajo del ahorro esperado');
ok(r.porPersona.every(x => isFinite(x.tope) && isFinite(x.pctTope) && isFinite(x.cuota)),
   'los topes siguen siendo números y no una división por cero');

/* Y en cuanto entra un sueldo y se gasta de más, el aviso SÍ tiene que salir:
   la corrección no puede haberlo apagado del todo.
 *
 * Las dos filas se ponen en memoria y no con ESTADO.anotar: anotar las encola,
 * la cola sale hacia el servidor falso, y al volver la respuesta la app se
 * resincroniza y recupera los movimientos que esta prueba acababa de quitar.
 * El resultado era un mes con dos millones y medio dentro, que es justo el caso
 * que no se quería medir. */
await p.evaluate(() => {
  const { datos } = ESTADO.estado();
  const mes = ESTADO.mesEnCurso();
  datos.movimientos = [
    { uuid: 'p-1', fecha: mes + '-01', tipo: 'Ingreso', categoria: 'Sueldo', descripcion: '',
      importe: 1000000, cuenta: 'Cuenta Corriente', persona: 'Gonzalo', reparto: 'Personal',
      paraMes: mes, origen: 'app' },
    { uuid: 'p-2', fecha: mes + '-02', tipo: 'Gasto', categoria: 'Ocio', descripcion: '',
      importe: 900000, cuenta: 'Efectivo', persona: 'Gonzalo', reparto: 'Personal',
      paraMes: mes, origen: 'app' }
  ];
  MES.pintar();
});
await p.waitForTimeout(200);

const conExceso = await p.locator('#pantalla-mes').innerText();
ok(/gastado de más/i.test(conExceso),
   'con un millón entrando y novecientos mil gastados, el aviso sí sale');
ok(/\$100\.000/.test(conExceso),
   'y dice cuánto de más: ' + ((conExceso.match(/Has gastado de más[^\n]*/) || ['(no sale)'])[0]));
ok((await p.locator('#pantalla-mes .saldo.negativo').count()) > 0,
   'y entonces sí, el saldo en rojo');

console.log('\nerrores:', errores.length ? errores : 'ninguno');
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
await b.close();
process.exit(fallos ? 1 : 0);
