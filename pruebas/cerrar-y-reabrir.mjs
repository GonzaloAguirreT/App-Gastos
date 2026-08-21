/*
 * Cerrar un mes a mitad ya no se puede, y el que quedó cerrado se puede reabrir.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/cerrar-y-reabrir.mjs
 *
 * Cerrar el mes en curso antes de que termine dejaba la app en un callejón sin
 * salida: la hoja lo archiva y lo vacía, la pantalla Mes pasa a solo lectura y,
 * como no existe ningún otro mes, las dos flechas del título se apagan. La app
 * entera se quedaba mirando un agosto cerrado hasta el 1 de septiembre.
 *
 * Pasó de verdad, y el botón de Ajustes estaba siempre disponible sin avisar de
 * nada.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8300';
const errores = [];
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on('pageerror', e => errores.push(e.message));
p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(700);
const activa = () => p.locator('.pantalla.activa');
const campos = [];
for (const i of await p.locator('input').all()) if (await i.isVisible()) campos.push(i);
await campos[0].fill(BASE);
await campos[1].fill('secreto');
await activa().getByText('Continuar', { exact: true }).click();
await p.waitForTimeout(1000);
for (let i = 0; i < 4 && !(await p.locator('#pantalla-mes.activa').count()); i++) {
  const s = activa().getByText(/^(Continuar|Empezar|Listo|Terminar)$/).first();
  if (await s.count()) { await s.click(); await p.waitForTimeout(800); } else break;
}

/* 1. A mitad de mes, cerrar no debe ofrecerse. */
await p.evaluate(() => VISTA.ir('ajustes'));
await p.waitForTimeout(500);
const diaDeHoy = await p.evaluate(() => Number(ESTADO.hoy().slice(8)));
const ultimos = await p.evaluate(() => {
  const m = ESTADO.mesEnCurso();
  return Number(ESTADO.hoy().slice(8)) >= FMT.diasDelMes(m) - 1;
});
const cierre = (await activa().innerText()).split(/cierre del mes/i)[1] || '';
console.log('  ·  hoy es día ' + diaDeHoy + (ultimos ? ' (últimos del mes)' : ' (a mitad)'));

if (!ultimos) {
  ok(/—/.test(cierre), 'a mitad de mes, cerrar no se ofrece');
  ok(/últimos días|ultimos dias/i.test(cierre), 'y explica desde cuándo se puede');
  const boton = activa().getByText(/^Cerrar .* ahora$/).first();
  ok(await boton.evaluate(e => e.tagName.toLowerCase()) !== 'button',
     'la fila no es un botón, así que no se puede tocar');
}

/* 2. Un mes ya cerrado se puede reabrir desde Ajustes. */
await p.evaluate(async () => {
  await ESTADO.cerrarMes(ESTADO.mesEnCurso());
  await ESTADO.sincronizar();
});
await p.evaluate(() => VISTA.ir('mes'));
await p.waitForTimeout(600);
ok(/cerrado/i.test(await activa().innerText()), 'con el mes cerrado, Mes queda en solo lectura');
const flechas = await p.evaluate(() =>
  [...document.querySelectorAll('#pantalla-mes .flecha')].map(f => f.disabled));
ok(flechas.every(Boolean), 'y las dos flechas apagadas: no hay adónde ir (' + flechas + ')');

await p.evaluate(() => VISTA.ir('ajustes'));
await p.waitForTimeout(500);
const reabrir = activa().getByText(/^Reabrir /).first();
ok(await reabrir.count() > 0, 'Ajustes ofrece reabrirlo');

await reabrir.click();
await p.waitForTimeout(800);
await p.evaluate(() => VISTA.ir('mes'));
await p.waitForTimeout(600);
const texto = await activa().innerText();
ok(!/cerrado/i.test(texto), 'tras reabrirlo, Mes vuelve a estar en curso');
ok(/saldo disponible/i.test(texto), 'con su saldo disponible otra vez');

console.log('\nerrores: ' + (errores.length ? '' : 'ninguno'));
[...new Set(errores)].forEach(e => console.log('  ! ' + e));
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
await b.close();
process.exit(fallos ? 1 : 0);
