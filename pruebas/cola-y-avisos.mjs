/*
 * La app, de verdad, en un navegador de verdad, contra un backend que dice que
 * no. Comprueba lo único que importa cuando algo falla: que la app lo CUENTE.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/cola-y-avisos.mjs
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const errores = [];
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await c.newPage();
p.on('pageerror', e => errores.push(e.message));
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

await p.goto('http://localhost:8300/index.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(600);

// Onboarding: conectar contra el mock.
const campos = [];
for (const i of await p.locator('input').all()) if (await i.isVisible()) campos.push(i);
await campos[0].fill('http://localhost:8300');
await campos[1].fill('secreto');
const activa = () => p.locator('.pantalla.activa');
await activa().getByText('Continuar', { exact: true }).click();
await p.waitForTimeout(900);
console.log('  ·  tras conectar, pantalla:', (await p.locator('h2, h1').first().textContent() || '').trim());

// Saltar el resto del onboarding hasta llegar al Mes.
for (let i = 0; i < 4 && !(await p.locator('#pantalla-mes.activa').count()); i++) {
  const seguir = activa().getByText(/^(Continuar|Empezar|Listo|Terminar)$/).first();
  if (await seguir.count()) { await seguir.click(); await p.waitForTimeout(800); } else break;
}
ok(await p.locator('#pantalla-mes.activa').count() > 0, 'llega a la pantalla Mes');

// Anotar un gasto: el mock lo rechaza, así que se queda en la cola.
await p.locator('#btn-anotar').click();
await p.waitForTimeout(400);
for (const d of ['5', '0', '0', '0']) await activa().getByText(d, { exact: true }).first().click();
await activa().getByText('Guardar', { exact: true }).click();
await p.waitForTimeout(1200);

const barra = await p.locator('text=/sin enviar/').first().textContent().catch(() => '');
console.log('  ·  la barra dice:', JSON.stringify((barra || '').trim()));
ok(/sin enviar/.test(barra || ''), 'avisa de que hay algo sin enviar');
ok(/Petición sin movimientos/.test(barra || ''), 'y DICE POR QUÉ, que es lo que faltaba');

// Reintentar tiene que contestar algo.
await activa().getByText('Reintentar', { exact: true }).click();
await p.waitForTimeout(1200);
const aviso = await p.locator('#deshacer-texto').textContent().catch(() => '');
const visible = await p.locator('#deshacer').isVisible().catch(() => false);
console.log('  ·  al reintentar sale:', JSON.stringify((aviso || '').trim()), 'visible:', visible);
ok(visible && /No se pudo enviar/.test(aviso || ''), 'reintentar cuenta el resultado en vez de callarse');
ok(!(await p.locator('#deshacer-boton').isVisible()), 'y no ofrece un "Deshacer" que no viene a cuento');

console.log('errores de consola:', errores.length ? errores : 'ninguno');
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
await b.close();
process.exit(fallos ? 1 : 0);
