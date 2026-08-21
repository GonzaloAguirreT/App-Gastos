/*
 * Un mes cerrado cuya celda volvió como fecha, no como texto.
 *
 *   node pruebas/servidor-falso.mjs --mes-como-fecha &
 *   node pruebas/mes-como-fecha.mjs
 *
 * "2026-08" es un mes para nosotros y una fecha para Sheets: guardado sin
 * forzar la columna a texto se convierte en el 1 de agosto de 2026, y al leerlo
 * vuelve como "Sat Aug 01 2026 00:00:00 GMT+0200 (hora de verano de Europa
 * central)". La pantalla de Ahorro enseñaba entonces un mes cerrado llamado
 * "Undefined Sat Aug 01 2026 00:00:00 GMT+0200 (...)" ocupando tres líneas.
 *
 * La causa está arreglada en el backend —la columna se fuerza a texto— pero las
 * filas ya escritas siguen ahí, así que la app tiene que saber leerlas. Esto
 * comprueba lo segundo.
 *
 * Ojo con la zona horaria: esa cadena es la medianoche del 1 de agosto en la
 * zona de la HOJA. Convertirla con new Date() y preguntarle el mes al navegador
 * devuelve JULIO si el teléfono está en otra zona. El nombre del mes ya está
 * escrito en el texto; no hay que calcularlo.
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

await p.evaluate(() => VISTA.ir('ahorro'));
await p.waitForTimeout(600);
const texto = await activa().innerText();
console.log('--- meses cerrados ---');
console.log(texto.slice(texto.toLowerCase().lastIndexOf('meses cerrados')).split('\n').slice(0, 4).join('\n'));

ok(!/undefined/i.test(texto), 'no aparece "Undefined" en ninguna parte');
ok(!/GMT/.test(texto), 'ni la fecha en crudo con su GMT');
ok(/agosto 2026/i.test(texto), 'el mes cerrado se llama "agosto 2026"');

// Y tocarlo tiene que abrir ese mes, no dejarte en el actual.
const fila = activa().getByText(/agosto 2026/i).first();
if (await fila.count()) {
  await fila.click();
  await p.waitForTimeout(600);
  const enMes = await p.locator('#pantalla-mes.activa').count();
  ok(enMes > 0, 'tocarlo abre la pantalla Mes');
  ok(/agosto/i.test(await activa().innerText()), 'y en agosto');
}

console.log('\nerrores: ' + (errores.length ? '' : 'ninguno'));
[...new Set(errores)].forEach(e => console.log('  ! ' + e));
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');

await b.close();
process.exit(fallos ? 1 : 0);
