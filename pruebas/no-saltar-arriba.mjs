/*
 * Que marcar algo no te devuelva al principio de la pantalla.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/no-saltar-arriba.mjs
 *
 * Bajabas hasta la conexión, tocabas un interruptor, y la pantalla se iba de
 * golpe otra vez arriba del todo. Con Ajustes, que es larga, había que volver a
 * bajar después de cada toque.
 *
 * El motivo es el mismo que cerraba el teclado al escribir una meta: no hay
 * renderizado incremental, cada pantalla se repinta entera, y repintar destruye
 * los nodos. El scroll vive en `.desliza`, así que al reconstruirlo vuelve a
 * cero. No es un salto: es una pantalla nueva que empieza por arriba.
 *
 * Cambiar de pantalla SÍ tiene que empezar por arriba —heredar el
 * desplazamiento de la anterior te deja en mitad de una lista que no habías
 * abierto—, así que eso se comprueba también aquí: el arreglo no puede
 * llevárselo por delante.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://localhost:8300';
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };
const errores = [];

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 780 } })).newPage();
p.on('pageerror', e => errores.push(e.message));
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

await p.goto(B + '/index.html', { waitUntil: 'networkidle' });
await p.evaluate(async base => {
  await ESTADO.guardarAjustes({ endpoint: base, token: 'secreto', persona: 'Gonzalo', onboarding: true });
  await ESTADO.sincronizar();
  VISTA.ir('ajustes');
}, B);
await p.waitForTimeout(400);

const desliza = '#pantalla-ajustes .desliza';
const donde = () => p.evaluate(s => {
  const d = document.querySelector(s);
  return d ? d.scrollTop : -1;
}, desliza);

/* Que haya de verdad dónde bajar: si la pantalla cabe entera, esta prueba
   pasaría sin comprobar nada. */
const alto = await p.evaluate(s => {
  const d = document.querySelector(s);
  return d ? d.scrollHeight - d.clientHeight : 0;
}, desliza);
ok(alto > 200, 'Ajustes es más larga que la pantalla, así que hay dónde bajar ('
   + alto + 'px de sobra)');

await p.evaluate(s => { document.querySelector(s).scrollTop = 300; }, desliza);
await p.waitForTimeout(150);
ok(await donde() === 300, 'se baja hasta la mitad');

/* ------------------------------------------------- tocar un interruptor */

/* Los avisos son botones que guardan en la hoja: guardar emite, emitir repinta
   la pantalla entera. Es el caso exacto del que se queja el dedo. */
const antes = await donde();
await p.locator('#pantalla-ajustes .fila.baja').first().click();
await p.waitForTimeout(600);
const despues = await donde();
ok(despues === antes,
   'tras tocar un interruptor sigues donde estabas: ' + antes + ' → ' + despues);

/* ------------------------------------------------------ y tocar un chip */

/* El tema no pasa por la hoja: guarda en el teléfono y repinta igual. Dos
   caminos distintos hasta el mismo repintado.

   Este se toca desde dentro de la página y no con locator.click(): el botón del
   tema está arriba del todo, y Playwright sube solo para poder tocar lo que no
   se ve. Eso mueve el desplazamiento ANTES del click, y entonces la prueba
   estaría midiendo lo que hace Playwright y no lo que hace la app. */
await p.evaluate(s => { document.querySelector(s).scrollTop = 250; }, desliza);
await p.waitForTimeout(150);
await p.evaluate(() => {
  const b = [...document.querySelectorAll('#pantalla-ajustes button')]
    .find(x => x.textContent.trim() === 'Oscuro');
  if (!b) throw new Error('no está el botón del tema oscuro');
  b.click();
});
await p.waitForTimeout(500);
ok(await donde() === 250,
   'y tras cambiar el tema, también: ' + await donde());

/* ------------------------------------- pero cambiar de pantalla sí sube */

/* Lo que el arreglo NO puede romper: entrar en una pantalla te deja arriba.
   Se vuelve a Ajustes desde otra pestaña y tiene que estar por el principio. */
await p.evaluate(s => { document.querySelector(s).scrollTop = 300; }, desliza);
await p.waitForTimeout(150);
await p.evaluate(() => VISTA.ir('mes'));
await p.waitForTimeout(300);
await p.evaluate(() => VISTA.ir('ajustes'));
await p.waitForTimeout(400);
ok(await donde() === 0,
   'entrar en una pantalla sigue empezando por arriba: ' + await donde());

/* ------------------------------- y la tira de categorías, que va de lado */

/* El mismo fallo en horizontal, y en la pantalla donde más molesta: con
   dieciocho categorías, las últimas están a la derecha del todo. Arrastrabas
   hasta «Suscripciones», la tocabas, y la tira volvía al principio — así que
   para ver cuál habías elegido tenías que arrastrar otra vez. */
await p.evaluate(() => VISTA.ir('mes'));
await p.waitForTimeout(200);
await p.locator('#btn-anotar').click();
await p.waitForTimeout(500);

const tira = '#pantalla-anotar .chips.tira';
const ancho = await p.evaluate(s => {
  const t = document.querySelector(s);
  return t ? t.scrollWidth - t.clientWidth : 0;
}, tira);
ok(ancho > 100, 'la tira de categorías es más ancha que la pantalla ('
   + ancho + 'px de sobra)');

await p.evaluate(s => { document.querySelector(s).scrollLeft = 200; }, tira);
await p.waitForTimeout(150);

/* Se toca desde dentro, por el mismo motivo que el botón del tema: si el chip
   no se ve, Playwright corre la tira antes de tocarlo. */
await p.evaluate(s => {
  const t = document.querySelector(s);
  const chip = [...t.children].find(c => c.getBoundingClientRect().left > t.getBoundingClientRect().left);
  if (!chip) throw new Error('no hay chips en la tira');
  chip.click();
}, tira);
await p.waitForTimeout(500);

const corrida = await p.evaluate(s => {
  const t = document.querySelector(s);
  return t ? t.scrollLeft : -1;
}, tira);
ok(corrida === 200,
   'elegir una categoría no devuelve la tira al principio: ' + corrida);

console.log('\nerrores:', errores.length ? errores : 'ninguno');
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
await b.close();
process.exit(fallos ? 1 : 0);
