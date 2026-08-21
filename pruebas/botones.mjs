/*
 * Pulsa TODO lo que se puede pulsar y comprueba que cada cosa hace algo.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/botones.mjs
 *
 * Los manejadores de la app se enganchan con addEventListener, así que no
 * dejan rastro en el HTML y no hay selector que los encuentre. Aquí se
 * envuelve addEventListener antes de que cargue la página para que cada
 * elemento que reciba un 'click' se marque solo. Eso da la lista completa:
 * botones, filas de lista, chips y las cifras que se tocan para editarlas.
 *
 * Algo "hace algo" si al pulsarlo cambia la pantalla, cambia lo que hay dentro
 * de ella, o sale una petición hacia el backend. Lo que no provoca ninguna de
 * las tres se lista al final para mirarlo a mano: hay casos legítimos —volver
 * a elegir lo ya elegido— y hay callejones sin salida, que es lo que busco.
 *
 * No comprueba que hagan lo correcto; para eso están las otras pruebas. Esto
 * contesta a algo más básico y más fácil de romper en un rediseño: ¿queda
 * algún botón muerto?
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8300';
const PESTANAS = ['mes', 'historial', 'fijos', 'ahorro', 'ajustes'];

const errores = [];
const mudos = [];
let pulsados = 0, peticiones = 0;

const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await c.newPage();

/* Marcar lo pulsable. Va antes del goto para pillar también los manejadores
   que se enganchan durante el arranque de la app. */
await p.addInitScript(() => {
  const original = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (tipo, fn, opciones) {
    if (tipo === 'click' && this.setAttribute) this.setAttribute('data-pulsable', '');
    return original.call(this, tipo, fn, opciones);
  };
});

p.on('pageerror', e => errores.push('EXCEPCIÓN: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errores.push('CONSOLA: ' + m.text()); });
p.on('request', r => { if (r.method() === 'POST') peticiones++; });

const pantalla = () => p.evaluate(() => (document.querySelector('.pantalla.activa') || {}).id || '?');
/* La huella incluye el tema y el fondo, no solo la pantalla activa: los tres
   botones de Claro/Oscuro/Sistema cambian un atributo de <html> y el color del
   body, y mirando solo dentro de la pantalla parecían muertos. */
const cuerpo = () => p.evaluate(() => [
  ((document.querySelector('.pantalla.activa') || {}).innerHTML || '').length,
  document.documentElement.getAttribute('data-tema'),
  getComputedStyle(document.body).backgroundColor,
  (document.querySelector('meta[name=theme-color]') || {}).content
].join('|'));
const ir = nombre => p.evaluate(n => VISTA.ir(n), nombre);
const activa = () => p.locator('.pantalla.activa');

/** Los pulsables visibles de la pantalla activa, con su etiqueta. */
async function pulsables() {
  const fuera = [];
  for (const el of await activa().locator('[data-pulsable]').all()) {
    if (!(await el.isVisible().catch(() => false))) continue;
    const t = ((await el.textContent().catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    fuera.push({ el, texto: t || '(sin texto)' });
  }
  return fuera;
}

async function pulsar(el, etiqueta, desde) {
  const antesP = await pantalla(), antesC = await cuerpo(), antesR = peticiones;
  try { await el.click({ timeout: 2000 }); } catch (_) { return null; }
  await p.waitForTimeout(300);
  pulsados++;
  const ahora = await pantalla();
  if (ahora === antesP && (await cuerpo()) === antesC && peticiones === antesR) {
    mudos.push(desde + ' › ' + etiqueta);
  }
  return ahora;
}

/* ------------------------------------------------------------- arranque */

await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(700);

const campos = [];
for (const i of await p.locator('input').all()) if (await i.isVisible()) campos.push(i);
await campos[0].fill(BASE);
await campos[1].fill('secreto');
await activa().getByText('Continuar', { exact: true }).click();
await p.waitForTimeout(1000);
for (let i = 0; i < 4 && !(await p.locator('#pantalla-mes.activa').count()); i++) {
  const seguir = activa().getByText(/^(Continuar|Empezar|Listo|Terminar)$/).first();
  if (await seguir.count()) { await seguir.click(); await p.waitForTimeout(800); } else break;
}
if (!(await p.locator('#pantalla-mes.activa').count())) {
  console.log('No se llega a la pantalla Mes; el resto no se puede recorrer.');
  await b.close(); process.exit(1);
}

/* ------------------------------------------------------------ recorrido */

for (const pestana of PESTANAS) {
  await ir(pestana);
  await p.waitForTimeout(500);
  const id = await pantalla();
  const lista = await pulsables();
  console.log('\n' + id + ' — ' + lista.length + ' pulsables');

  for (let i = 0; i < lista.length; i++) {
    await ir(pestana);
    await p.waitForTimeout(300);
    const ahora = await pulsables();
    if (i >= ahora.length) continue;

    const destino = await pulsar(ahora[i].el, ahora[i].texto, id);

    // Si abrió otra pantalla, se recorre también, una capa.
    if (destino && destino !== id) {
      const dentro = await pulsables();
      for (let j = 0; j < dentro.length && j < 16; j++) {
        if (/borrar/i.test(dentro[j].texto)) continue;   // se prueba aparte
        if (!(await dentro[j].el.isVisible().catch(() => false))) continue;
        await pulsar(dentro[j].el, dentro[j].texto, destino);
        if ((await pantalla()) !== destino) break;
      }
    }
  }
}

/* Borrar sí se prueba, pero a propósito y en su sitio: es lo único que quita
   datos, y tiene que ofrecer deshacer. */
await ir('historial');
await p.waitForTimeout(400);
const filas = await pulsables();
if (filas.length) {
  await pulsar(filas[filas.length - 1].el, filas[filas.length - 1].texto, 'pantalla-historial');
  const borrar = activa().getByText(/Borrar/i).first();
  if (await borrar.count()) {
    await borrar.click();
    await p.waitForTimeout(500);
    const hayDeshacer = await p.locator('#deshacer').isVisible().catch(() => false);
    console.log('\nborrar ofrece deshacer: ' + (hayDeshacer ? 'sí' : 'NO'));
    if (!hayDeshacer) errores.push('Borrar no ofrece deshacer');
    await p.locator('#deshacer-boton').click().catch(() => {});
  }
}

/* -------------------------------------------------------------- informe */

console.log('\n──────────────────────────────');
console.log('pulsados: ' + pulsados + '   ·   peticiones al backend: ' + peticiones);

const unicos = [...new Set(mudos)];
if (unicos.length) {
  console.log('\nSin efecto visible (' + unicos.length + '), a revisar a mano:');
  unicos.forEach(m => console.log('  · ' + m));
} else {
  console.log('\nTodo lo pulsable hace algo.');
}

console.log('\nerrores: ' + (errores.length ? '' : 'ninguno'));
[...new Set(errores)].forEach(e => console.log('  ! ' + e));

await b.close();
process.exit(errores.length ? 1 : 0);
