/*
 * Vaciar este teléfono: que se lleve los datos y no la conexión.
 *
 *   node pruebas/servidor-falso.mjs --rechaza &
 *   node pruebas/vaciar-telefono.mjs
 *
 * OJO con el --rechaza: es lo que deja algo en la cola. Con el servidor
 * aceptando, la cola se vacía sola a los siete segundos y no queda nada que
 * comprobar.
 *
 * «Limpiar la app entera» tiene dos mitades: la hoja la vacía `vaciar()` desde
 * el editor de Apps Script, y este teléfono lo vacía este botón. Lo que aquí
 * importa es dónde se para el borrado:
 *
 *   · la copia del mes y la cola se van —son datos—;
 *   · la conexión, el token y quién anota aquí se quedan, porque borrarlos
 *     obligaría a volver a pegar la URL y el token para recuperar lo que sigue
 *     estando escrito en la hoja;
 *   · y un apunte sin enviar se puede reponer, porque es lo único de todo esto
 *     que no está en ningún otro sitio.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://localhost:8300';
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };
const errores = [];

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on('pageerror', e => errores.push(e.message));
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

await p.goto(B + '/index.html', { waitUntil: 'networkidle' });
await p.evaluate(async base => {
  await ESTADO.guardarAjustes({ endpoint: base, token: 'secreto', persona: 'Gonzalo', onboarding: true });
  await ESTADO.sincronizar();
  /* Sin esto la app se queda en el onboarding y la barra de pestañas —con ella
     el botón de anotar— no está en pantalla. */
  VISTA.ir('mes');
}, B);
await p.waitForTimeout(400);

ok(await p.evaluate(() => ESTADO.estado().datos.movimientos.length) > 0,
   'de partida hay movimientos bajados de la hoja');
ok(await p.evaluate(async () => !!(await NUCLEO.leerMes())),
   'y una copia del mes guardada en el teléfono');

/* Algo en la cola. El servidor rechaza, así que se queda ahí. */
await p.locator('#btn-anotar').click();
await p.waitForTimeout(400);
const activa = () => p.locator('.pantalla.activa');
for (const d of ['5', '0', '0', '0']) await activa().getByText(d, { exact: true }).first().click();
await activa().getByText('Guardar', { exact: true }).click();
await p.waitForTimeout(1500);
ok(await p.evaluate(() => ESTADO.estado().pendientes) > 0, 'y un apunte sin enviar en la cola');

/* ------------------------------------------------------- vaciar de verdad */

await p.evaluate(() => { VISTA.ir('ajustes'); AJUSTES.pintar(); });
await p.waitForTimeout(300);
const boton = p.locator('#pantalla-ajustes').getByText('Vaciar este teléfono');
ok(await boton.count() > 0, 'Ajustes ofrece vaciar este teléfono');
await boton.click();
await p.waitForTimeout(1200);

ok(await p.evaluate(() => ESTADO.estado().pendientes) === 0,
   'tras vaciar no queda nada en la cola');

const ajustes = await p.evaluate(() => ESTADO.estado().ajustes);
ok(ajustes.endpoint === B && ajustes.token === 'secreto' && ajustes.persona === 'Gonzalo',
   'y la conexión sigue puesta: ' + JSON.stringify({
     endpoint: !!ajustes.endpoint, token: !!ajustes.token, persona: ajustes.persona }));
ok(await p.evaluate(() => ESTADO.configurada()),
   'así que la app sigue configurada y no vuelve al onboarding');

/* ------------------------------------------------------------- deshacer */

/* Lo único que no está en ningún otro sitio es lo que no se llegó a enviar, y
   por eso vaciar ofrece deshacer igual que borrar un movimiento. */
ok(await p.locator('#deshacer').isVisible(), 'vaciar ofrece deshacer');
await p.locator('#deshacer').getByText(/Deshacer/i).click();
await p.waitForTimeout(1200);
ok(await p.evaluate(() => ESTADO.estado().pendientes) > 0,
   'y deshacer devuelve el apunte sin enviar a la cola');

/* ------------------------------------------- la copia del mes, por su cuenta */

/* El botón sincroniza acto seguido —si no, la app se queda enseñando un mes
   vacío y parece que se ha perdido lo que sigue en la hoja—, así que para ver
   que la copia se borra de verdad hay que mirar antes de esa sincronización. */
const trasOlvidar = await p.evaluate(async () => {
  await NUCLEO.olvidarDatos();
  return {
    mes: await NUCLEO.leerMes(),
    cola: (await NUCLEO.todos()).length,
    ajustes: await NUCLEO.leerAjustes()
  };
});
ok(!trasOlvidar.mes, 'olvidarDatos() borra la copia del mes');
ok(trasOlvidar.cola === 0, 'y la cola entera');
ok(trasOlvidar.ajustes.endpoint === B && trasOlvidar.ajustes.token === 'secreto',
   'y deja la conexión intacta');

console.log('\nerrores:', errores.length ? errores : 'ninguno');
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
await b.close();
process.exit(fallos ? 1 : 0);
