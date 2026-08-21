/*
 * A qué meses se puede llegar con las flechas del título.
 *
 *   node pruebas/servidor-falso.mjs --mes-viejo &
 *   node pruebas/meses-navegables.mjs
 *
 * Son tres cosas: el mes en curso, los cerrados, y cualquiera que tenga
 * movimientos. Lo tercero faltaba, y era un agujero: el backend manda DOCE
 * meses de movimientos, así que un mes pasado con gastos que nunca se cerró
 * estaba en memoria de la app y no había forma de llegar a él.
 *
 * Los meses vacíos no aparecen, a propósito. El servidor arranca con un gasto
 * de hace tres meses, así que desde el mes en curso la flecha izquierda debe
 * saltar directamente hasta ese mes, sin pasar por los dos vacíos de en medio.
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

const titulo = async () => (await activa().locator('h2').first().textContent()).trim();
const flechas = () => p.evaluate(() =>
  [...document.querySelectorAll('#pantalla-mes .flecha')].map(f => f.disabled));
const izquierda = p.locator('#pantalla-mes .flecha').first();
const derecha = p.locator('#pantalla-mes .flecha').last();

const enCurso = await titulo();
console.log('  ·  mes en curso: ' + enCurso);

const [izqOff, derOff] = await flechas();
ok(!izqOff, 'la flecha ‹ está viva: hay un mes pasado con gastos');
ok(derOff, 'la › está apagada: no hay nada por delante del mes en curso');

/* Un salto, y tiene que caer en el mes del gasto viejo — tres atrás— sin
   detenerse en los dos vacíos de en medio. */
await izquierda.click();
await p.waitForTimeout(600);
const viejo = await titulo();
console.log('  ·  tras una flecha: ' + viejo);
ok(viejo !== enCurso, 'la flecha lleva a otro mes');

const esperado = await p.evaluate(() => {
  const m = ESTADO.estado().datos.movimientos
    .map(x => FMT.mesDe(x.fecha)).sort()[0];
  return FMT.cap(FMT.nombreMes(m));
});
ok(viejo === esperado, 'y es el mes del gasto viejo, saltándose los vacíos: ' + esperado);

const [izq2, der2] = await flechas();
ok(izq2, 'allí la ‹ se apaga: no hay más hacia atrás');
ok(!der2, 'y la › se enciende para volver');

await derecha.click();
await p.waitForTimeout(600);
ok((await titulo()) === enCurso, 'y volver deja donde estabas');

console.log('\nerrores: ' + (errores.length ? '' : 'ninguno'));
[...new Set(errores)].forEach(e => console.log('  ! ' + e));
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');

await b.close();
process.exit(fallos ? 1 : 0);
