/*
 * Que nada se salga de la pantalla en un móvil de verdad.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/alto-700.mjs
 *
 * El prototipo se diseñó sobre 390×844. Un S24 tiene ~384×780 una vez
 * descontadas la barra de estado y la de navegación, y con el teclado del
 * sistema abierto se queda en la mitad. Sesenta píxeles menos bastaron para que
 * el teclado de Anotar se saliera por abajo y cortara una fila entera de
 * categorías: no era un problema de escala, era que nada tenía permiso para
 * encogerse ni para deslizarse.
 *
 * Se prueba a 700 px de alto, que es más apretado que cualquier teléfono real:
 * si algo se corta a 700 se cortará en algún móvil.
 *
 * Las tres cosas que se miran son las tres reglas de ANDROID_LAYOUT.md:
 *   1. la pantalla mide la ventana, no 844 px;
 *   2. hay UNA zona flexible y el resto está anclado;
 *   3. las categorías van en una tira que se desliza, no envueltas en filas.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://localhost:8300';
const ALTO = 700;
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };
const errores = [];

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 360, height: ALTO } })).newPage();
p.on('pageerror', e => errores.push(e.message));
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

await p.goto(B + '/index.html', { waitUntil: 'networkidle' });
await p.evaluate(async base => {
  await ESTADO.guardarAjustes({ endpoint: base, token: 'secreto', persona: 'Gonzalo', onboarding: true });
  await ESTADO.sincronizar();
  VISTA.ir('mes');
}, B);
await p.waitForTimeout(400);

/** ¿Se sale este elemento por debajo del borde de la ventana? */
const cabe = async selector => p.evaluate(([sel, alto]) => {
  const n = document.querySelector(sel);
  if (!n) return { existe: false };
  const r = n.getBoundingClientRect();
  return { existe: true, abajo: Math.round(r.bottom), alto: Math.round(r.height), tope: alto };
}, [selector, ALTO]);

/* ------------------------------------------------ la pantalla mide la ventana */

const app = await cabe('.app');
ok(app.abajo <= ALTO + 1, 'la app entera cabe en la ventana (' + app.abajo + ' ≤ ' + ALTO + ')');
ok(await p.evaluate(() => getComputedStyle(document.querySelector('.app')).height)
     === ALTO + 'px', 'y mide exactamente la ventana, no un alto fijo');

/* Nada de scroll horizontal: si el cuerpo se desplaza a lo ancho, algo se ha
   salido por el lado y el dedo lo va a encontrar antes que los ojos. */
for (const pantalla of ['mes', 'historial', 'fijos', 'ahorro', 'ajustes']) {
  await p.evaluate(t => VISTA.ir(t), pantalla);
  await p.waitForTimeout(150);
  const ancho = await p.evaluate(() => {
    const n = document.querySelector('.pantalla.activa');
    return { scroll: n.scrollWidth, visible: n.clientWidth };
  });
  ok(ancho.scroll <= ancho.visible + 1, pantalla + ' no se desborda a lo ancho');
}

/* ------------------------------------------- Anotar: el teclado nunca se sale */

await p.evaluate(() => ANOTAR.abrir());
await p.waitForTimeout(300);

const teclado = await cabe('#pantalla-anotar .teclado');
const guardar = await cabe('#pantalla-anotar .bloque-guardar');
ok(teclado.existe && teclado.abajo <= ALTO + 1,
   'el teclado cabe entero (' + teclado.abajo + ' ≤ ' + ALTO + ')');
ok(guardar.existe && guardar.abajo <= ALTO + 1,
   'y los botones de guardar también (' + guardar.abajo + ' ≤ ' + ALTO + ')');

// Con "Es fijo" entran tres tiras de chips más: es el caso que rompió el S24.
await p.locator('#pantalla-anotar').getByText('Es fijo', { exact: true }).click();
await p.waitForTimeout(300);
const conFijo = await cabe('#pantalla-anotar .teclado');
const guardarFijo = await cabe('#pantalla-anotar .bloque-guardar');
ok(conFijo.abajo <= ALTO + 1,
   'con «Es fijo» y sus tres tiras de chips, el teclado sigue dentro (' + conFijo.abajo + ')');
ok(guardarFijo.abajo <= ALTO + 1, 'y los botones de guardar siguen dentro');

/* -------------------------------------- las categorías, en una sola fila */

await p.evaluate(() => ANOTAR.abrir());
await p.waitForTimeout(300);
const tira = await p.evaluate(() => {
  const n = document.querySelector('#pantalla-anotar .chips.tira');
  if (!n) return null;
  const e = getComputedStyle(n);
  const hijos = [...n.children].map(c => Math.round(c.getBoundingClientRect().top));
  return {
    wrap: e.flexWrap, overflow: e.overflowX,
    filas: [...new Set(hijos)].length,
    cuantos: n.children.length,
    desliza: n.scrollWidth > n.clientWidth,
    toque: Math.min(...[...n.children].map(c => Math.round(c.getBoundingClientRect().height)))
  };
});
ok(tira !== null, 'las categorías van en una tira');
ok(tira && tira.wrap === 'nowrap', 'que no envuelve (flex-wrap: ' + (tira && tira.wrap) + ')');
ok(tira && tira.filas === 1,
   'y ocupa UNA sola fila con ' + (tira && tira.cuantos) + ' categorías');
ok(tira && tira.desliza, 'se desliza a lo ancho para llegar al resto');
ok(tira && tira.toque >= 44,
   'con 44 px de zona de toque en cada chip (' + (tira && tira.toque) + ' px)');

/* ------------------------------------------- una sola zona flexible */

const bandas = await p.evaluate(() => {
  const hijos = [...document.querySelectorAll('#pantalla-anotar > *')];
  return hijos.map(n => {
    const e = getComputedStyle(n);
    return { clase: n.className, grow: e.flexGrow, min: e.minHeight, margen: e.marginTop };
  });
});
const flexibles = bandas.filter(x => x.grow !== '0');
ok(flexibles.length === 1,
   'solo una banda de Anotar puede crecer: ' + flexibles.map(x => x.clase).join(', '));
ok(flexibles[0] && flexibles[0].min === '0px',
   'y lleva min-height: 0, sin lo cual se niega a encogerse y echa fuera al teclado');
ok(!bandas.some(x => x.margen === 'auto'),
   'nada se ancla con margin-top:auto, que solo funciona cuando sobra sitio');

/* --------------------------- con la fuente del sistema al 130 %, nada se corta */

await p.evaluate(() => { document.documentElement.style.fontSize = '130%'; });
await p.waitForTimeout(300);
const grande = await cabe('#pantalla-anotar .teclado');
const teclaAlta = await p.evaluate(() => {
  const t = document.querySelector('#pantalla-anotar .tecla');
  return { alto: Math.round(t.getBoundingClientRect().height), scroll: t.scrollHeight };
});
ok(grande.abajo <= ALTO + 1, 'con la fuente al 130 % el teclado sigue dentro');
ok(teclaAlta.alto >= teclaAlta.scroll,
   'y las teclas crecen en vez de cortar el número (' + teclaAlta.alto + ' ≥ ' + teclaAlta.scroll + ')');

console.log('\nerrores:', errores.length ? errores : 'ninguno');
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
await b.close();
process.exit(fallos ? 1 : 0);
