/*
 * Una lectura que vuelve sin listas no puede llevarse las que ya hay.
 *
 *   node pruebas/servidor-falso.mjs --listas-rotas &
 *   node pruebas/lectura-rota.mjs
 *
 * `fusionar` sustituía una lista vacía por la semilla de config.js, con buen
 * motivo: una app sin categorías no deja anotar nada. El problema es de dónde
 * venían las listas vacías. El backend reescribía la hoja Listas borrándola y
 * recreándola, y las lecturas no pasan por el cerrojo, así que una lectura
 * podía caer en ese hueco y volver sin nada. La app se quedaba entonces con las
 * categorías de EJEMPLO y —esto es lo caro— las escribía encima de las de
 * verdad en el siguiente ajuste que tocaras.
 *
 * Le pasó a la hoja de Gonzalo: quedó con las 18 categorías de la semilla y las
 * cuentas renombradas a «Tarjeta de Débito», que es la grafía de config.js.
 *
 * La ventana la cerró el backend, que ya no borra la hoja. Esto vigila la otra
 * mitad: aunque una lectura vuelva rota por cualquier otro motivo, lo que la
 * app tiene en la mano manda sobre la semilla. Y una lista vacía nunca es
 * legítima: `leerListasExistentes` rellena las vacías con su propia semilla, así
 * que una lista sin nada solo puede venir de una lectura rota.
 *
 * La semilla sigue valiendo para lo que se puso: la primera vez, cuando no hay
 * nada de nada.
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

/* Lo que manda la app al backend, para ver si en algún momento le manda la
   semilla de vuelta. */
const escrituras = [];
p.on('request', r => {
  if (r.method() !== 'POST') return;
  try {
    const cuerpo = JSON.parse(r.postData() || '{}');
    if (cuerpo.accion === 'config') escrituras.push(cuerpo.datos || {});
  } catch (e) { /* no era JSON: no es asunto de esta prueba */ }
});

await p.goto(B + '/index.html', { waitUntil: 'networkidle' });
await p.evaluate(async base => {
  await ESTADO.guardarAjustes({ endpoint: base, token: 'secreto', persona: 'Gonzalo', onboarding: true });
  await ESTADO.sincronizar();
  VISTA.ir('mes');
}, B);
await p.waitForTimeout(600);

const listas = () => p.evaluate(() => {
  const d = ESTADO.estado().datos;
  return {
    categorias: d.categorias.map(c => c.nombre),
    cuentas: d.cuentas.slice(),
    credito: (d.credito || []).slice(),
    personas: d.personas.map(x => x.nombre)
  };
});

console.log('\nLa primera lectura trae las listas de la hoja');
const buenas = await listas();
ok(buenas.categorias.length > 0, 'hay categorías: ' + buenas.categorias.length);
ok(buenas.cuentas.length > 0, 'y cuentas: ' + JSON.stringify(buenas.cuentas));

console.log('\nLa siguiente vuelve rota, y no puede llevarse nada');
/* Se le pide al servidor falso que rompa la SIGUIENTE lectura, en vez de dar
   por hecho que sea la segunda: cuántas veces sincroniza la app al arrancar no
   es asunto de esta prueba, y atarla a eso la hacía fallar dentro de todas.sh
   sin que nada hubiera cambiado. */
console.log('  ' + JSON.stringify(await p.evaluate(async base => {
  const r = await fetch(base, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ token: 'secreto', accion: 'romper-listas' })
  });
  return r.json();
}, B)));
await p.evaluate(() => ESTADO.sincronizar());
await p.waitForTimeout(700);
const despues = await listas();

ok(JSON.stringify(despues.categorias) === JSON.stringify(buenas.categorias),
   'las categorías siguen siendo las de la hoja: ' + despues.categorias.length
   + ' (' + despues.categorias.slice(0, 3).join(', ') + '…)');
ok(JSON.stringify(despues.cuentas) === JSON.stringify(buenas.cuentas),
   'y las cuentas también: ' + JSON.stringify(despues.cuentas));
ok(JSON.stringify(despues.credito) === JSON.stringify(buenas.credito),
   'y qué cuentas son de crédito: ' + JSON.stringify(despues.credito));
ok(JSON.stringify(despues.personas) === JSON.stringify(buenas.personas),
   'y las personas: ' + JSON.stringify(despues.personas));

/* Lo que de verdad costaba los datos: que la app, con la semilla en la mano,
   la escribiera en la hoja al siguiente ajuste. */
console.log('\nY el siguiente ajuste no manda la semilla a la hoja');
await p.evaluate(async () => {
  const d = ESTADO.estado().datos;
  await ESTADO.guardarConfig({
    categorias: d.categorias.concat([{ nombre: 'Bencina', tipo: 'Gasto', reparto: 'Común' }])
  });
});
await p.waitForTimeout(600);

const mandadas = escrituras[escrituras.length - 1] || {};
const nombres = (mandadas.categorias || []).map(c => c.nombre);
ok(nombres.length === buenas.categorias.length + 1,
   'manda las de la hoja más la nueva: ' + nombres.length + ' categorías');
ok(nombres.indexOf('Bencina') !== -1, 'con la nueva dentro');
ok(buenas.categorias.every(n => nombres.indexOf(n) !== -1),
   'y sin perder ninguna de las que había');

console.log('\nCon la app recién abierta y sin nada, la semilla sí vale');
{
  const q = await (await b.newContext({ viewport: { width: 360, height: 700 } })).newPage();
  await q.goto(B + '/index.html', { waitUntil: 'networkidle' });
  const arranque = await q.evaluate(() => {
    const d = ESTADO.estado().datos;
    return { categorias: d.categorias.length, cuentas: d.cuentas.length };
  });
  ok(arranque.categorias > 0 && arranque.cuentas > 0,
     'sin conexión todavía, la app arranca con la semilla: '
     + arranque.categorias + ' categorías, ' + arranque.cuentas + ' cuentas');
  await q.close();
}

ok(errores.length === 0, 'sin errores en consola' + (errores.length ? ': ' + errores[0] : ''));

await b.close();
console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
