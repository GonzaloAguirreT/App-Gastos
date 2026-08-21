/*
 * Escribir el nombre de una meta con el dedo, letra a letra.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/escribir-meta.mjs
 *
 * Tecleabas «Viaje», lo veías entero en pantalla, y de pronto el campo volvía a
 * «V» y el teclado del móvil se cerraba. Eran dos fallos encadenados:
 *
 *   1. `renombrar` buscaba la meta por su nombre ACTUAL. A la primera letra la
 *      meta pasaba a llamarse «V», así que a la segunda ya no había ninguna con
 *      el nombre viejo: el resto de lo que tecleabas no llegaba a `datos`.
 *
 *   2. A los 600 ms el guardado emitía, emitir repinta la pantalla entera, y
 *      repintar destruye el input. Se perdía el foco —de ahí el teclado que se
 *      cierra— y el campo se volvía a pintar con lo único que sí se había
 *      guardado: la primera letra.
 *
 * Los dos juntos daban justo el síntoma: escribes bien, y al soltar se queda
 * una letra. Cada uno por su lado habría sido más fácil de ver.
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
  VISTA.ir('ahorro');
}, B);
await p.waitForTimeout(400);

/* ------------------------------------------- una meta nueva, sin nombre */

/* El nombre vacío es el caso que rompía: es como empieza siempre una meta
   recién añadida, y era ahí donde la búsqueda por nombre dejaba de encontrarla. */
await p.locator('.pantalla.activa').getByText('+ Añadir meta').click();
await p.waitForTimeout(700);

const campo = () => p.locator('#pantalla-ahorro input.meta').last();
await campo().click();
for (const letra of 'Viaje') {
  await p.keyboard.type(letra);
  await p.waitForTimeout(120);
}
ok(await campo().inputValue() === 'Viaje', 'mientras escribes, el campo lleva lo tecleado');

/* La espera del guardado son 600 ms; con 1200 ha saltado seguro. Es el momento
   exacto en el que se perdía todo. */
await p.waitForTimeout(1200);

const enPantalla = await campo().inputValue().catch(() => '(el input ya no existe)');
ok(enPantalla === 'Viaje', 'tras guardar, el campo SIGUE con «Viaje» y no con «V»: ' + enPantalla);

const enfocado = await p.evaluate(() =>
  document.activeElement === document.querySelector('#pantalla-ahorro input.meta:last-of-type')
  || (document.activeElement || {}).tagName);
ok(await p.evaluate(() => (document.activeElement || {}).tagName) === 'INPUT',
   'y el foco sigue en el campo, así que el teclado del móvil no se cierra');

const metas = await p.evaluate(() => ESTADO.estado().datos.metas.map(m => m.nombre));
ok(metas.indexOf('Viaje') !== -1,
   'y la meta se llama «Viaje» en memoria: ' + JSON.stringify(metas));
ok(metas.indexOf('V') === -1, 'no ha quedado una meta llamada «V»');

/* ------------------------------- renombrar una que YA tenía nombre */

/* El otro camino: la meta existe y se le cambia el nombre. Aquí importa además
   que viaje el nombre viejo, porque en la hoja la meta es su nombre y renombrar
   significa mover también sus líneas de Reparto. */
const primero = p.locator('#pantalla-ahorro input.meta').first();
await primero.click();
await primero.press('End');
for (const letra of ' 26') {
  await p.keyboard.type(letra);
  await p.waitForTimeout(120);
}
await p.waitForTimeout(1200);

ok(await primero.inputValue() === 'Viaje a Japón 26',
   'renombrar una meta existente conserva todo lo tecleado: ' + await primero.inputValue());
const conAntes = await p.evaluate(() =>
  ESTADO.estado().datos.metas.filter(m => m.antes).map(m => m.antes + ' → ' + m.nombre));
ok(conAntes.some(x => x.indexOf('Viaje a Japón →') === 0),
   'y se recuerda el nombre viejo para mover sus líneas de Reparto: ' + JSON.stringify(conAntes));

/* ------------------------- cualquier campo, no sólo el de la meta */

/* El fallo se vio escribiendo una meta, pero no era de las metas: era de que
   repintar destruye el input enfocado. Le pasa igual a cualquier campo de una
   pantalla que se repinte sola, y repintar no lo pide sólo el guardado —basta
   con que la cola se vacíe o entre una sincronización mientras se teclea—.
   Aquí se fuerza justo eso: escribir un nombre en Quiénes y provocar un
   repintado a mitad de palabra. */
await p.evaluate(() => { VISTA.ir('ajustes'); VISTA.ir('quienes'); });
await p.waitForTimeout(300);

const nombre = p.locator('#pantalla-quienes input.entrada').first();
await nombre.click();
await p.keyboard.press('Control+a');
for (const letra of 'Gonzalo') {
  await p.keyboard.type(letra);
  await p.waitForTimeout(60);
}

/* Una sincronización a media palabra: emite, y emitir repinta la pantalla. */
await p.evaluate(() => ESTADO.sincronizar({ silencioso: true }));
await p.waitForTimeout(400);

ok(await nombre.inputValue() === 'Gonzalo',
   'un repintado a media palabra no se lleva lo tecleado en Quiénes: '
   + await nombre.inputValue());
ok(await p.evaluate(() => (document.activeElement || {}).tagName) === 'INPUT',
   'y el foco sigue en el campo, así que el teclado no se cierra');

/* Y lo aplazado no se pierde: al soltar el campo, la pantalla se pone al día. */
await p.evaluate(() => document.activeElement.blur());
await p.waitForTimeout(200);
ok(await p.locator('#pantalla-quienes input.entrada').first().inputValue() === 'Gonzalo',
   'y al soltar, el repintado aplazado llega y respeta lo escrito');

/* -------------------- pero un repintado que SÍ se ha pedido tiene que llegar */

/* No vale con no repintar nunca mientras hay un campo enfocado: el buscador del
   historial filtra la lista con cada tecla y se devuelve el foco él mismo. La
   diferencia no es que haya un campo enfocado, es quién pide el repintado: si lo
   pide la propia tecla, tiene que verse ya. */
await p.evaluate(() => VISTA.ir('historial'));
await p.waitForTimeout(300);

const buscador = p.locator('#pantalla-historial input.busca');
if (await buscador.count()) {
  const antes = await p.locator('#pantalla-historial .mov').count();
  await buscador.click();
  await p.keyboard.type('zzzzz');
  await p.waitForTimeout(300);
  const despues = await p.locator('#pantalla-historial .mov').count();
  /* Con `antes` a cero esto pasaría sin comprobar nada: hace falta que hubiera
     lista que filtrar. */
  ok(antes > 0 && despues < antes,
     'el buscador sigue filtrando la lista mientras escribes: ' + antes + ' → ' + despues);
  ok(await p.evaluate(() => (document.activeElement || {}).tagName) === 'INPUT',
     'y se queda el foco en el buscador');
} else {
  ok(false, 'no se ha encontrado el buscador del historial');
}

console.log('\nerrores:', errores.length ? errores : 'ninguno');
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
await b.close();
process.exit(fallos ? 1 : 0);
