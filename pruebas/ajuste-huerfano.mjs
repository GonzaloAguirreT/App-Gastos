/*
 * Un ajuste que señala a algo que ya no está en Listas vuelve a la realidad.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/ajuste-huerfano.mjs
 *
 * «La cuenta de siempre» y «quién anota aquí» son de este teléfono, pero
 * apuntan por nombre a cosas que viven en la hoja, y esas se pueden quitar
 * desde Ajustes o desde el otro teléfono. Cuando eso pasa, el ajuste se queda
 * señalando a un nombre que ya no existe.
 *
 * Lo que hacía antes: como el nombre viejo no es vacío, el
 * `ajustes.cuenta || datos.cuentas[0]` de las pantallas no lo sustituía por
 * nada. En Anotar no se marcaba ningún cajetín —no había forma de ver qué se
 * iba a guardar— y el gasto llegaba a la hoja con una cuenta que no estaba en
 * ninguna lista.
 *
 * Y no daba ningún error, que es lo que lo hizo caro: una cuenta que no está
 * en las listas tampoco está en la de crédito, así que sus compras se
 * imputaban al mes de la fecha en vez de al mes que las paga. Es la regla de
 * la que cuelga todo el cálculo del mes, rompiéndose en silencio.
 *
 * Salió en el teléfono de Gonzalo, con «Cuenta Corriente» guardada de un libro
 * anterior. La otra mitad del arreglo está en el backend y la prueba
 * pruebas/listas-que-crecen.mjs: lo que llega y no se conoce, se apunta.
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

/* El servidor falso sirve cuentas ['Cuenta Corriente', 'Tarjeta Credito',
   'Efectivo'] y personas Gonzalo y Camila. */
const conectar = async cuenta => p.evaluate(async ({ base, cuenta }) => {
  await ESTADO.guardarAjustes({
    endpoint: base, token: 'secreto', persona: 'Gonzalo', cuenta, onboarding: true
  });
  await ESTADO.sincronizar();
  VISTA.ir('mes');
}, { base: B, cuenta });

console.log('\nUna cuenta que ya no está en la hoja');
{
  await conectar('Tarjeta Falabella');
  await p.waitForTimeout(400);

  const ajustes = await p.evaluate(() => ESTADO.estado().ajustes);
  const cuentas = await p.evaluate(() => ESTADO.estado().datos.cuentas);
  ok(cuentas.indexOf('Tarjeta Falabella') === -1,
     'de partida la cuenta guardada no está en la hoja');
  ok(cuentas.indexOf(ajustes.cuenta) !== -1,
     'tras sincronizar el ajuste señala a una cuenta que existe');
  ok(ajustes.cuenta === cuentas[0], 'y es la primera de la lista');
}

console.log('\nY en Anotar se ve cuál se va a usar');
{
  await p.locator('#btn-anotar').click();
  await p.waitForTimeout(400);

  /* En Anotar hay dos tiras de cajetines: las categorías llevan además la clase
     «margen», las cuentas no. */
  const marcadas = await p.evaluate(() =>
    [...document.querySelectorAll('.chips.tira:not(.margen) .chip')]
      .filter(c => c.classList.contains('activo'))
      .map(c => c.textContent.trim()));
  ok(marcadas.length === 1, 'hay exactamente un cajetín de cuenta marcado');

  const cuentas = await p.evaluate(() => ESTADO.estado().datos.cuentas);
  ok(marcadas.length === 1 && cuentas.indexOf(marcadas[0]) !== -1,
     'y el marcado es una cuenta de la hoja: ' + (marcadas[0] || '(ninguno)'));
}

console.log('\nY lo que se manda no es la cuenta fantasma');
{
  const activa = () => p.locator('.pantalla.activa');
  /* Los uuids de antes, para reconocer después cuál es el apunte nuevo.

     Buscarlo por su importe no vale: el libro de mentira puede traer otro que
     valga lo mismo —y lo trae, si el servidor falso viene usado de una prueba
     anterior—, así que el bloque encontraba un movimiento cualquiera y pasaba
     igual sin el arreglo. Una comprobación que pasa en las dos direcciones no
     está comprobando nada. */
  const antes = await p.evaluate(() =>
    (ESTADO.estado().datos.movimientos || []).map(m => m.uuid));

  for (const d of ['7', '0', '0']) await activa().getByText(d, { exact: true }).first().click();
  await activa().getByText('Guardar', { exact: true }).click();
  await p.waitForTimeout(600);

  const cuentas = await p.evaluate(() => ESTADO.estado().datos.cuentas);
  const apunte = await p.evaluate(vistos =>
    (ESTADO.estado().datos.movimientos || []).filter(m => vistos.indexOf(m.uuid) === -1)[0], antes);
  ok(!!apunte, 'el apunte queda registrado');
  ok(apunte && apunte.cuenta !== 'Tarjeta Falabella',
     'y no lleva la cuenta que ya no existía');
  ok(apunte && cuentas.indexOf(apunte.cuenta) !== -1,
     'sino una de las de la hoja: ' + (apunte && apunte.cuenta));
}

console.log('\nUna cuenta que sí está no se toca');
{
  await conectar('Efectivo');
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => ESTADO.estado().ajustes.cuenta) === 'Efectivo',
     'la cuenta elegida a propósito sigue siendo la elegida');
}

console.log('\nY lo mismo con quién anota');
{
  await p.evaluate(async base => {
    await ESTADO.guardarAjustes({ endpoint: base, token: 'secreto', persona: 'Fulanito' });
    await ESTADO.sincronizar();
  }, B);
  await p.waitForTimeout(400);

  const ajustes = await p.evaluate(() => ESTADO.estado().ajustes);
  const personas = await p.evaluate(() => ESTADO.estado().datos.personas.map(x => x.nombre));
  ok(personas.indexOf(ajustes.persona) !== -1,
     'una persona que ya no está se cambia por una que sí: ' + ajustes.persona);

  await p.evaluate(() => ESTADO.guardarAjustes({ persona: 'Camila' }));
  await p.evaluate(() => ESTADO.sincronizar());
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => ESTADO.estado().ajustes.persona) === 'Camila',
     'y una que sí está se respeta');
}

ok(errores.length === 0, 'sin errores en consola' + (errores.length ? ': ' + errores[0] : ''));

await b.close();
console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
