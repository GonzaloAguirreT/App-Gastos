/*
 * Una categoría puede ser de ingreso, y desde la app.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/categorias-de-ingreso.mjs
 *
 * El tipo de una categoría decide en cuál de las dos mitades de Anotar sale, y
 * no se podía cambiar desde ninguna pantalla: todo lo que se creaba en Ajustes
 * → Categorías nacía como gasto, sugeridas incluidas.
 *
 * En un libro sin ninguna categoría de ingreso —el que deja instalar()— eso
 * dejaba los ingresos fuera de la app entera:
 *
 *   · Anotar → Ingreso no pintaba ninguna tira de categorías;
 *   · Guardar mandaba la categoría vacía;
 *   · y el backend contestaba «Falta la categoría», así que el apunte se
 *     quedaba en la cola reintentando para siempre.
 *
 * Nada de eso se ve desde fuera: hay que entrar a Ajustes → Pendientes para
 * enterarse. Y los ingresos son de donde sale el techo del mes, o sea el
 * cálculo entero.
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
await p.waitForTimeout(400);

/* El libro de mentira trae «Sueldo» como ingreso. Se quita para reproducir el
   libro que deja instalar(): solo gastos. */
await p.evaluate(async () => {
  const soloGastos = ESTADO.estado().datos.categorias.filter(c => c.tipo !== 'Ingreso');
  await ESTADO.guardarConfig({ categorias: soloGastos });
  await ESTADO.sincronizar();
});
await p.waitForTimeout(600);

console.log('\nDe partida no hay ninguna categoría de ingreso');
{
  ok(await p.evaluate(() => ESTADO.categoriasDe('Ingreso').length) === 0,
     'el libro se queda sin categorías de ingreso');
  ok(await p.evaluate(() => ESTADO.categoriasDe('Gasto').length) > 0,
     'y con las de gasto de siempre');
}

console.log('\nY así, Anotar no puede guardar un ingreso');
{
  await p.evaluate(() => { VISTA.ir('mes'); });
  await p.locator('#btn-anotar').click();
  await p.waitForTimeout(400);
  await p.locator('.pantalla.activa').getByText('Ingreso', { exact: true }).click();
  await p.waitForTimeout(400);

  const tiras = await p.evaluate(() =>
    [...document.querySelectorAll('#pantalla-anotar .chips.tira.margen .chip')].map(c => c.textContent.trim()));
  ok(tiras.length === 0, 'no hay tira de categorías que elegir');
  await p.evaluate(() => { ANOTAR.cerrar ? ANOTAR.cerrar() : VISTA.ir('mes'); });
  await p.waitForTimeout(300);
}

console.log('\nEn Ajustes → Categorías se puede cambiar el tipo');
{
  await p.evaluate(async () => { VISTA.ir('ajustes'); AJUSTES.pintar(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    [...document.querySelectorAll('#pantalla-ajustes button.fila')]
      .find(x => x.textContent.trim().startsWith('Categorías')).click();
  });
  await p.waitForTimeout(500);

  const hayChip = await p.evaluate(() =>
    [...document.querySelectorAll('#pantalla-categorias button')]
      .some(x => /^(gasto|ingreso)$/.test(x.textContent.trim())));
  ok(hayChip, 'cada categoría tiene un cajetín que dice si es gasto o ingreso');

  /* Marcar la primera como ingreso. Si el cajetín no está, se dice y se sigue:
     una prueba que revienta con un TypeError no explica lo que falla. */
  const antes = await p.evaluate(() => ESTADO.estado().datos.categorias[0].nombre);
  const pulsado = await p.evaluate(() => {
    const fila = document.querySelectorAll('#pantalla-categorias .editable')[0];
    const chip = [...fila.querySelectorAll('button')].find(x => x.textContent.trim() === 'gasto');
    if (!chip) return false;
    chip.click();
    return true;
  });
  ok(pulsado, 'y se puede pulsar para cambiarlo');
  await p.waitForTimeout(900);

  const tipo = await p.evaluate(n => (ESTADO.estado().datos.categorias.find(c => c.nombre === n) || {}).tipo, antes);
  ok(tipo === 'Ingreso', '«' + antes + '» pasa a ser de ingreso: ' + tipo);
  ok(await p.evaluate(() => ESTADO.categoriasDe('Ingreso').length) === 1,
     'y ya hay una categoría de ingreso');
}

console.log('\nY entonces Anotar sí guarda el ingreso, con su categoría');
{
  await p.evaluate(() => { VISTA.ir('mes'); });
  await p.waitForTimeout(300);
  await p.locator('#btn-anotar').click();
  await p.waitForTimeout(400);
  const activa = () => p.locator('.pantalla.activa');
  await activa().getByText('Ingreso', { exact: true }).click();
  await p.waitForTimeout(400);

  const tiras = await p.evaluate(() =>
    [...document.querySelectorAll('#pantalla-anotar .chips.tira.margen .chip')].map(c => c.textContent.trim()));
  ok(tiras.length === 1, 'ahora sí hay una categoría que elegir: ' + JSON.stringify(tiras));

  /* Los uuids de antes, para reconocer el apunte nuevo. Buscarlo en la cola no
     vale: con el servidor aceptando puede haber salido ya, y entonces la
     comprobación falla por el reloj y no por el código. */
  const antes = await p.evaluate(() =>
    (ESTADO.estado().datos.movimientos || []).map(m => m.uuid));

  await p.evaluate(async () => {
    const espera = ms => new Promise(r => setTimeout(r, ms));
    const tecla = t => [...document.querySelectorAll('#pantalla-anotar .tecla')]
      .find(x => x.textContent.trim() === t).click();
    for (const d of ['5', '0', '0', '0', '0', '0']) { tecla(d); await espera(60); }
    await espera(200);
    [...document.querySelectorAll('#pantalla-anotar button')]
      .find(x => x.textContent.trim() === 'Guardar').click();
  });
  await p.waitForTimeout(1200);

  const apunte = await p.evaluate(vistos =>
    (ESTADO.estado().datos.movimientos || []).filter(m => vistos.indexOf(m.uuid) === -1)[0], antes);
  ok(!!apunte, 'el ingreso se registra');
  ok(apunte && Number(apunte.importe) === 500000,
     'con su importe: ' + (apunte && apunte.importe));
  ok(apunte && String(apunte.categoria || '').length > 0,
     'y con una categoría de verdad, no vacía: ' + JSON.stringify(apunte && apunte.categoria));
  ok(apunte && apunte.tipo === 'Ingreso', 'y como Ingreso');
}

ok(errores.length === 0, 'sin errores en consola' + (errores.length ? ': ' + errores[0] : ''));

await b.close();
console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
