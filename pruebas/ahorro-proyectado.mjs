/*
 * El "Proyectado al cierre" de la pestaña Ahorro.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/ahorro-proyectado.mjs
 *
 * El plan hace de ingreso: Gonzalo y Camila lo fijan cada mes a partir de lo
 * que van a cobrar, así que los sueldos NO se anotan en la app. Lo que se anote
 * aparte —un bono, una devolución— se suma encima.
 *
 *     ahorro = plan + entrado + por entrar − gastado − fijos por venir
 *
 * Antes era entrado − gastado, y sin sueldos anotados eso daba siempre un
 * negativo en rojo: un número correcto y sin sentido, que solo decía cuánto
 * habían gastado.
 *
 * La misma definición vive en ESTADO.resumen, en leerCierres y en la fórmula
 * de la columna E de Cierres. Si se cambia, se cambia en los cuatro sitios.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B='http://localhost:8300';
let fallos=0; const ok=(c,t)=>{console.log((c?'  ok  ':' FALLA ')+t); if(!c)fallos++;};
const errores=[];
const b = await chromium.launch();
const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
p.on('pageerror', e => errores.push(e.message));
await p.goto(B+'/index.html', {waitUntil:'networkidle'}); await p.waitForTimeout(700);
const activa = () => p.locator('.pantalla.activa');
const campos=[]; for (const i of await p.locator('input').all()) if (await i.isVisible()) campos.push(i);
await campos[0].fill(B); await campos[1].fill('secreto');
await activa().getByText('Continuar',{exact:true}).click(); await p.waitForTimeout(1000);
for (let i=0;i<4 && !(await p.locator('#pantalla-mes.activa').count());i++){
  const s = activa().getByText(/^(Continuar|Empezar|Listo|Terminar)$/).first();
  if (await s.count()) { await s.click(); await p.waitForTimeout(800); } else break;
}
await p.evaluate(() => VISTA.ir('ahorro')); await p.waitForTimeout(600);
/** El bloque del mes en curso. El encabezado se pinta en mayúsculas por CSS,
 *  así que se busca sin distinguirlas o no se encuentra nunca. */
const bloqueDelMes = async () => {
  const t = await activa().innerText();
  const i = t.toLowerCase().indexOf('en curso');
  /* El final se busca DESPUÉS del principio: "meses cerrados" también aparece
     arriba, en "Acumulado en meses cerrados", y buscándolo desde el origen el
     recorte salía vacío. */
  const j = t.toLowerCase().indexOf('meses cerrados', i);
  if (i === -1) throw new Error('no se encuentra el bloque "en curso" en la pantalla Ahorro');
  return t.slice(i + 8, j === -1 ? undefined : j);
};
const bloque = await bloqueDelMes();
console.log('--- lo que se ve ---\n' + bloque.split('Meses cerrados')[0].trim() + '\n');
/* Sin un solo ingreso anotado, la proyección tiene que ser positiva: el plan
   es lo que hace de ingreso. Antes salía en rojo y con un menos delante. */
ok(!/−\$|-\$/.test(bloque.split('\n').slice(0, 3).join('\n')),
   'sin sueldos anotados, la proyeccion NO es negativa');
ok(/de plan/.test(bloque), 'y la nota ensena el plan como parte de la resta');
ok(/gastado/.test(bloque), 'junto a lo gastado');

// Y con un ingreso configurado, la proyeccion tiene que volver.
await p.evaluate(async () => {
  await fetch('http://localhost:8300', { method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ token: 'secreto', accion: 'fijo', datos: { fijo: {
      uuid: 'f-sueldo', tipo: 'Ingreso', concepto: 'Bono', importe: 1500000, dia: 30,
      cada: 1, cuotas: 0, restantes: 0, cuenta: 'Cuenta Corriente', persona: 'Gonzalo',
      reparto: 'Personal', activo: true } } }) });
  await ESTADO.sincronizar();
});
await p.evaluate(() => VISTA.ir('ahorro')); await p.waitForTimeout(700);
const conSueldo = await bloqueDelMes();
console.log('\n--- con un sueldo configurado ---\n' + conSueldo.trim());
ok(/entraron aparte|por entrar/.test(conSueldo), 'un ingreso suelto aparece en la resta');
ok(/de plan/.test(conSueldo), 'y el plan sigue estando');

console.log('\nerrores:', errores.length ? errores : 'ninguno');
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
await b.close(); process.exit(fallos?1:0);
