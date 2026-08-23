/*
 * Dos toques seguidos en Guardar anotan UNA vez.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/no-anotar-dos-veces.mjs
 *
 * Cada toque generaba su propio uuid, así que la deduplicación del backend
 * —que existe justo para que un reintento no duplique un gasto— los veía como
 * dos apuntes distintos y escribía los dos. Comprobado en el teléfono antes de
 * arreglarlo: teclear 7777, dos toques, y dos movimientos de $7.777 en la hoja
 * con dos registros en la cola.
 *
 * No es un gesto raro. El botón de guardar queda debajo del teclado del sistema
 * en cuanto hay un campo con el foco, así que el segundo toque se da sin verlo.
 *
 * El cerrojo va en `confirmar` y no en el backend a propósito: el backend no
 * puede distinguir dos apuntes iguales a la vez —comprar dos cafés del mismo
 * importe el mismo día es normal— y no debe intentarlo. Quien sabe que es el
 * mismo toque repetido es la pantalla.
 *
 * Se prueban los dos guardados que escriben en la hoja: el de un movimiento y
 * el de un fijo.
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
await p.waitForTimeout(600);

/* Los dos toques van en el mismo turno del navegador, que es lo que hace un
   dedo rápido: el segundo llega antes de que el primero haya terminado de
   guardar. Dejar que el navegador respire entre uno y otro no reproduce nada. */
const dosVeces = texto => p.evaluate(t => {
  const n = [].slice.call(document.querySelectorAll('button'))
    .filter(x => (x.innerText || '').trim() === t && x.offsetParent !== null)[0];
  if (!n) return 'no encuentro «' + t + '»';
  n.click();
  n.click();
  return 'dos toques';
}, texto);

const teclear = async digitos => {
  for (const d of digitos) {
    await p.evaluate(k => {
      const t = [].slice.call(document.querySelectorAll('#pantalla-anotar .tecla'))
        .filter(x => (x.innerText || '').trim() === k)[0];
      if (t) t.click();
    }, d);
  }
};

const cuantos = importe => p.evaluate(i =>
  ESTADO.estado().datos.movimientos.filter(m => m.importe === i).length, importe);
const enCola = () => p.evaluate(async () => (await NUCLEO.todos()).length);
const esperaCola = async () => {
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(2000);
    if (await enCola() === 0) return;
  }
};

console.log('\nUn movimiento: dos toques en Guardar');
await p.evaluate(() => ANOTAR.abrir());
await p.waitForTimeout(500);
await teclear(['7', '7', '7', '7']);
console.log('  ' + await dosVeces('Guardar'));
await p.waitForTimeout(900);

ok(await cuantos(7777) === 1,
   'queda un solo movimiento de $7.777 en la app: ' + await cuantos(7777));
/* Como mucho uno: para cuando se mira, la cola puede haberse vaciado sola
   —el envío se programa al encolar—, pero dos nunca. */
const pendientes = await enCola();
ok(pendientes <= 1, 'y como mucho un registro en la cola: ' + pendientes);

await esperaCola();
await p.evaluate(() => ESTADO.sincronizar());
await p.waitForTimeout(700);
ok(await cuantos(7777) === 1,
   'y uno solo en la hoja: ' + await cuantos(7777));

console.log('\nUn fijo: dos toques en Guardar fijo');
const fijos = () => p.evaluate(() =>
  ESTADO.estado().datos.fijos.filter(f => f.importe === 5555).length);

await p.evaluate(() => ANOTAR.nuevoFijo());
await p.waitForTimeout(500);
await teclear(['5', '5', '5', '5']);
console.log('  ' + await dosVeces('Guardar fijo'));
await p.waitForTimeout(900);
ok(await fijos() === 1, 'queda un solo fijo de $5.555: ' + await fijos());

await esperaCola();
await p.evaluate(() => ESTADO.sincronizar());
await p.waitForTimeout(700);
ok(await fijos() === 1, 'y uno solo en la hoja: ' + await fijos());

/* El reparto es la misma puerta y duele más: la línea de Reparto no se puede
   quitar desde la app —no existe la acción, y reabrir el mes no las toca—, así
   que un reparto duplicado hay que borrarlo a mano en la hoja. */
console.log('\nUn reparto: dos toques en Guardar reparto');
{
  const repartos = [];
  p.on('request', r => {
    if (r.method() !== 'POST') return;
    try {
      const c = JSON.parse(r.postData() || '{}');
      if (c.accion === 'reparto') repartos.push(c.datos || c);
    } catch (e) { /* no era JSON */ }
  });

  const meta = await p.evaluate(() => {
    const m = ESTADO.estado().datos.metas[0];
    return m ? m.nombre : null;
  });
  ok(!!meta, 'hay una meta a la que repartir: ' + meta);

  /* Lo guardado de antes, que en el libro de mentira no es cero: lo que hay que
     mirar es cuánto SUBE, no cuánto hay. */
  const guardadoAntes = await p.evaluate(n => {
    const m = ESTADO.estado().datos.metas.filter(x => x.nombre === n)[0];
    return m ? Number(m.guardado) || 0 : 0;
  }, meta);

  await p.evaluate(n => {
    AHORRO.abrirReparto(300000, ESTADO.mesEnCurso());
    AHORRO.asignarA(n, 300000);
  }, meta);
  await p.waitForTimeout(600);

  console.log('  ' + await dosVeces('Guardar reparto'));
  await p.waitForTimeout(1200);
  await esperaCola();

  ok(repartos.length === 1,
     'sale una sola orden de reparto: ' + repartos.length
     + (repartos.length ? ' · ' + JSON.stringify(repartos.map(x => x.asignaciones)) : ''));

  await p.evaluate(() => ESTADO.sincronizar());
  await p.waitForTimeout(700);
  const guardado = await p.evaluate(n => {
    const m = ESTADO.estado().datos.metas.filter(x => x.nombre === n)[0];
    return m ? Number(m.guardado) || 0 : -1;
  }, meta);
  ok(guardado - guardadoAntes === 300000,
     'y la meta sube $300.000 una vez, no dos: subió '
     + (guardado - guardadoAntes) + ' (de ' + guardadoAntes + ' a ' + guardado + ')');
}

console.log('\nY guardar dos cosas de verdad seguidas sigue guardando las dos');
await p.evaluate(() => ANOTAR.abrir());
await p.waitForTimeout(500);
await teclear(['1', '1', '1', '1']);
await p.evaluate(() => {
  const g = [].slice.call(document.querySelectorAll('button'))
    .filter(x => (x.innerText || '').trim() === 'Guardar')[0];
  if (g) g.click();
});
await p.waitForTimeout(800);
await p.evaluate(() => ANOTAR.abrir());
await p.waitForTimeout(500);
await teclear(['2', '2', '2', '2']);
await p.evaluate(() => {
  const g = [].slice.call(document.querySelectorAll('button'))
    .filter(x => (x.innerText || '').trim() === 'Guardar')[0];
  if (g) g.click();
});
await p.waitForTimeout(800);

ok(await cuantos(1111) === 1 && await cuantos(2222) === 1,
   'los dos apuntes distintos se guardan: $1.111 y $2.222 → '
   + await cuantos(1111) + ' y ' + await cuantos(2222));

ok(errores.length === 0, 'sin errores en consola' + (errores.length ? ': ' + errores[0] : ''));

await b.close();
console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
