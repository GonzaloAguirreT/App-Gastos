/*
 * El widget 4×2 dice lo mismo que la pantalla Mes.
 *
 *   node pruebas/servidor-falso.mjs &
 *   node pruebas/widget-4x2.mjs
 *
 * El widget se pinta en una WebView escondida dentro de una app Android que le
 * hace una captura. Lo único que puede fallar de verdad ahí es lo mismo que ya
 * ha fallado dos veces en este proyecto: que dos sitios calculen el mes y no
 * coincidan. Por eso `widget.html` llama a `ESTADO.resumen()`, el de la app, y
 * por eso la primera comprobación de aquí es que la cifra grande del widget y
 * la de la pantalla Mes son el MISMO número, sacado de la misma hoja.
 *
 * Lo demás son los estados que el servidor falso no sabe producir —un mes en
 * negativo, uno que se ha comido el ahorro, uno sin tarjetas— y que se
 * construyen sustituyendo `ESTADO.resumen` por uno de mentira. Se puede porque
 * `WIDGET.pintar()` lo llama en cada pintado y no se lo guarda.
 */
import fs from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://localhost:8300';
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };
const errores = [];

const hash = (extra = {}) => '#' + new URLSearchParams(Object.assign({
  endpoint: B, token: 'secreto', ancho: '1008', alto: '516', tema: 'claro'
}, extra)).toString();

/**
 * Abrir el widget de cero.
 *
 * El paso por `about:blank` no es adorno: dos URLs que solo se diferencian en
 * el `#` son la MISMA página para el navegador, así que un `goto` entre ellas
 * no recarga nada. Sin esto, la prueba del estado vacío seguía mirando el
 * `ESTADO.resumen` de mentira que le había puesto la prueba anterior, y pasaba
 * en verde sin haber cargado nada. Costó cinco fallos falsos averiguarlo.
 */
async function abrir(fragmento) {
  await p.goto('about:blank');
  await p.goto(B + '/widget.html' + fragmento, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.title === 'listo');
}

const b = await chromium.launch();
const contexto = await b.newContext({ viewport: { width: 1100, height: 700 } });
const p = await contexto.newPage();
/* La prueba de «sin red» apunta a un puerto donde no escucha nadie, así que el
   navegador se queja por la consola. Esa queja es el escenario, no un fallo: si
   no saliera, el widget habría llegado a alguna parte y no se estaría midiendo
   lo que dice el nombre. Cualquier otro error sí cuenta. */
const esperado = t => /ERR_CONNECTION_REFUSED|Failed to load resource/.test(t);
p.on('pageerror', e => errores.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !esperado(m.text())) errores.push(m.text()); });

/* ------------------------------------ el widget y la app dicen lo mismo */

console.log('\nLa cifra del widget es la de la pantalla Mes');

/* Primero la app, que es la fuente. Se le pregunta a `resumen()` directamente
   para no depender de cómo esté maquetada la pantalla hoy. */
await p.goto(B + '/index.html', { waitUntil: 'networkidle' });
await p.evaluate(async base => {
  await ESTADO.guardarAjustes({ endpoint: base, token: 'secreto', persona: 'Gonzalo', onboarding: true });
  await ESTADO.sincronizar();
}, B);
const enLaApp = await p.evaluate(() => {
  const r = ESTADO.resumen(ESTADO.mesEnCurso());
  return { queda: r.queda, entra: r.entra, gastado: r.gastado, porVenir: r.porVenir };
});
ok(enLaApp.entra > 0, 'la app trae un mes con datos: entra ' + enLaApp.entra);

await abrir(hash());

const enElWidget = await p.evaluate(() => ({
  monto: document.querySelector('.w-monto').textContent,
  signo: document.querySelector('.w-signo').textContent,
  dia: document.querySelector('.w-dia').textContent
}));
ok(enElWidget.monto === FMTmiles(Math.abs(enLaApp.queda)),
   'la cifra grande coincide con el saldo de la app: ' + enElWidget.monto
   + ' vs ' + FMTmiles(Math.abs(enLaApp.queda)));

function FMTmiles(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

ok(/^DÍA \d+ DE \d+$/.test(enElWidget.dia),
   'el encabezado dice qué día del mes es: ' + enElWidget.dia);

/* ------------------------------------------- la barra no puede mentir */

console.log('\nLa barra suma lo que dice la cifra');

/* La comprobación número uno del documento de diseño: la suma de los tramos
   tiene que ser (gastado + porVenir) / entra. Si no, sale una barra que dice
   «vas bien» justo debajo de una cifra en rojo. */
const barra = await p.evaluate(() => {
  const r = ESTADO.resumen(ESTADO.mesEnCurso());
  const anchos = [...document.querySelectorAll('.w-barra > div')]
    .map(d => parseFloat(d.style.width));
  return {
    suma: anchos.reduce((a, x) => a + x, 0),
    esperado: ((r.gastado + r.porVenir) / r.entra) * 100,
    tramos: anchos.length,
    marca: document.querySelector('.w-marca')
      ? parseFloat(document.querySelector('.w-marca').style.left) : null,
    pctAhorro: r.pctAhorro
  };
});
ok(Math.abs(barra.suma - barra.esperado) < 0.5,
   'los tramos suman (gastado + porVenir) / entra: ' + barra.suma.toFixed(1)
   + '% vs ' + barra.esperado.toFixed(1) + '%');
ok(barra.tramos > 0, 'y hay tramos que pintar: ' + barra.tramos);
ok(barra.marca !== null && Math.abs(barra.marca - barra.pctAhorro) < 0.2,
   'la marca del ahorro cae donde dice el resumen: ' + barra.marca + '%');

/* Ningún tramo puede desbordar la barra, ni siquiera con el mes gastado del
   todo: el recorte de «por venir» existe justo para eso. */
ok(barra.suma <= 100.5, 'y no se pasan del 100 %: ' + barra.suma.toFixed(1) + '%');

/* --------------------------------------------------- nada se sale de la caja */

console.log('\nTodo cabe en 336 × 172');

const cabe = await p.evaluate(() => {
  const caja = document.getElementById('widget');
  const suyo = caja.getBoundingClientRect();
  const fuera = [...caja.children].filter(h => {
    const r = h.getBoundingClientRect();
    return r.bottom > suyo.bottom + 0.5 || r.right > suyo.right + 0.5 || r.left < suyo.left - 0.5;
  }).map(h => h.className);
  return {
    desborda: caja.scrollHeight > caja.clientHeight + 1,
    fuera,
    ancho: Math.round(document.querySelector('.marco').getBoundingClientRect().width),
    alto: Math.round(document.querySelector('.marco').getBoundingClientRect().height)
  };
});
ok(!cabe.desborda, 'el contenido no desborda a lo alto');
ok(cabe.fuera.length === 0, 'ni ninguna pieza se sale por los lados'
   + (cabe.fuera.length ? ' — SE SALE ' + cabe.fuera.join(', ') : ''));
ok(cabe.ancho === 1008 && cabe.alto === 516,
   'y el marco mide los píxeles que se le pidieron: ' + cabe.ancho + '×' + cabe.alto);

/* ------------------------------------------- los estados que hay que forzar */

console.log('\nLos estados que el servidor falso no sabe dar');

/** Pinta el widget con un resumen de mentira y devuelve lo que salió. */
async function conResumen(resumen) {
  return p.evaluate(async falso => {
    ESTADO.resumen = () => falso;
    await WIDGET.pintar();
    const cifra = document.querySelector('.w-cifra');
    return {
      acento: cifra.classList.contains('acento'),
      signo: document.querySelector('.w-signo').textContent,
      monto: document.querySelector('.w-monto').textContent,
      leyenda: [...document.querySelectorAll('.w-leyenda > span')].map(s => s.textContent),
      anchos: [...document.querySelectorAll('.w-barra > div')].map(d => parseFloat(d.style.width))
    };
  }, resumen);
}

const base = {
  mes: '2026-08', entra: 1000000, ahorroEsperado: 200000, gastado: 300000,
  porVenir: 100000, queda: 600000, bajoAhorro: false, pctAhorro: 80,
  pctPorVenir: 10,
  porPersona: [
    { nombre: 'Gonzalo', color: '#3D5A6C', total: 200000, tarjeta: 50000, parte: 15, parteTarjeta: 5 },
    { nombre: 'Camila', color: '#A34E6B', total: 100000, tarjeta: 0, parte: 10, parteTarjeta: 0 }
  ]
};

const normal = await conResumen(base);
ok(!normal.acento, 'un mes que va bien pinta la cifra en tinta, no en acento');
ok(normal.leyenda.join(' | ') === 'Gonzalo | Camila | TC Gonzalo | Por venir | Disponible',
   'la leyenda solo saca la TC de quien tiene factura: ' + normal.leyenda.join(' | '));

const comido = await conResumen(Object.assign({}, base, { queda: 150000, bajoAhorro: true }));
ok(comido.acento,
   'comerse el ahorro esperado pone la cifra en acento aunque quede dinero');

const negativo = await conResumen(Object.assign({}, base, { queda: -45000, bajoAhorro: true }));
ok(negativo.acento && negativo.signo.startsWith('−'),
   'y en negativo sale el menos tipográfico delante: ' + negativo.signo + negativo.monto);

const pelado = await conResumen(Object.assign({}, base, {
  porVenir: 0, pctPorVenir: 0,
  porPersona: base.porPersona.map(x => Object.assign({}, x, { tarjeta: 0, parteTarjeta: 0 }))
}));
ok(pelado.leyenda.join(' | ') === 'Gonzalo | Camila | Disponible',
   'sin tarjetas ni fijos por cobrar, la leyenda se queda en tres: ' + pelado.leyenda.join(' | '));

/* Un mes gastado del todo, que es donde el recorte de «por venir» hace su
   trabajo. Sin él los tramos suman 125 % y el último se sale de la barra: la
   barra diría que aún queda sitio justo debajo de una cifra en rojo. Con los
   datos del servidor falso esto no se puede ver —allí los tramos suman 30 %—,
   así que hay que construirlo. */
const desbordado = await conResumen(Object.assign({}, base, {
  gastado: 950000, porVenir: 300000, queda: -250000, bajoAhorro: true,
  pctPorVenir: 30,
  porPersona: [
    { nombre: 'Gonzalo', color: '#3D5A6C', total: 600000, tarjeta: 0, parte: 60, parteTarjeta: 0 },
    { nombre: 'Camila', color: '#A34E6B', total: 350000, tarjeta: 0, parte: 35, parteTarjeta: 0 }
  ]
}));
const sumaDesbordada = desbordado.anchos.reduce((a, x) => a + x, 0);
ok(sumaDesbordada <= 100.5,
   'con el mes gastado del todo, «por venir» se recorta y la barra no se pasa de 100 %: '
   + sumaDesbordada.toFixed(1) + '% ' + JSON.stringify(desbordado.anchos));

/* Tres personas: las tarjetas se agrupan, porque seis entradas ya no caben. */
const tresPersonas = await conResumen(Object.assign({}, base, {
  porPersona: [
    { nombre: 'Gonzalo', color: '#3D5A6C', total: 200000, tarjeta: 50000, parte: 15, parteTarjeta: 5 },
    { nombre: 'Camila', color: '#A34E6B', total: 100000, tarjeta: 20000, parte: 10, parteTarjeta: 2 },
    { nombre: 'Ana', color: '#5E7A52', total: 50000, tarjeta: 0, parte: 5, parteTarjeta: 0 }
  ]
}));
ok(tresPersonas.leyenda.filter(x => x.startsWith('TC')).length === 0
   && tresPersonas.leyenda.includes('Tarjetas'),
   'con tres personas las tarjetas se juntan en una entrada: ' + tresPersonas.leyenda.join(' | '));

/* ------------------------------------------------ sin conexión y sin datos */

console.log('\nUn teléfono que no ha hablado nunca con la hoja');

/* En contexto nuevo a propósito: `ESTADO.iniciar()` lee el mes cacheado de
   IndexedDB, y ese cacheo es lo que hace que el widget siga diciendo algo sin
   cobertura. Reusar el contexto de arriba mediría el caché de la prueba
   anterior en vez del primer arranque de verdad. */
const virgen = await b.newContext({ viewport: { width: 1100, height: 700 } });
const pv = await virgen.newPage();
await pv.goto(B + '/widget.html#ancho=1008&alto=516', { waitUntil: 'networkidle' });
await pv.waitForFunction(() => document.title === 'listo');
const vacio = await pv.evaluate(() => ({
  monto: document.querySelector('.w-monto').textContent,
  aviso: document.querySelector('.w-vacio') ? document.querySelector('.w-vacio').textContent : '',
  hayBarra: Boolean(document.querySelector('.w-barra')),
  cabecera: document.querySelector('.w-cabecera').textContent
}));
ok(!vacio.cabecera.includes('undefined'),
   'la cabecera no dice «DÍA undefined»: ' + vacio.cabecera);
ok(vacio.monto === '—', 'sin datos sale un guion y no un $0: ' + vacio.monto);
ok(vacio.aviso === 'Abre la app para empezar', 'y dice qué hacer: ' + vacio.aviso);
ok(!vacio.hayBarra, 'sin barra, que no tendría nada que medir');
await virgen.close();

console.log('\nEn un teléfono de verdad, con tres píxeles por píxel');

/* Android manda el tamaño en píxeles de pantalla, y en su WebView un píxel de
   CSS son `devicePixelRatio` de ellos. Con ratio 1, como todo lo de arriba,
   las dos cosas coinciden y el fallo no se ve: en el S24 el cartel salía el
   triple de grande y la captura solo cogía «SALDO DISPONI». */
const denso = await b.newContext({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 3 });
const pd = await denso.newPage();
await pd.goto(B + '/widget.html#ancho=1008&alto=516', { waitUntil: 'networkidle' });
await pd.waitForFunction(() => document.title === 'listo');
const medidas = await pd.evaluate(() => {
  const r = document.getElementById('widget').getBoundingClientRect();
  return { ancho: Math.round(r.width), alto: Math.round(r.height) };
});
ok(medidas.ancho === 336 && medidas.alto === 172,
   'a densidad 3, 1008×516 píxeles son 336×172 de CSS: ' + medidas.ancho + '×' + medidas.alto);
await denso.close();

/* --------------------------------------------- pero con caché sí dice algo */

console.log('\nY uno que sí habló, pero ahora no tiene red');

/* Lo contrario del anterior, y el caso normal de un widget: la hoja no
   contesta, pero el mes de la última lectura sigue en IndexedDB. Enseñarlo es
   lo correcto; enseñar un guion sería perder información que se tiene. */
await abrir(hash({ endpoint: 'http://localhost:8399' }));
const sinRed = await p.evaluate(() => ({
  monto: document.querySelector('.w-monto').textContent,
  hayBarra: Boolean(document.querySelector('.w-barra')),
  dia: document.querySelector('.w-dia').textContent
}));
ok(sinRed.monto === FMTmiles(Math.abs(enLaApp.queda)),
   'sin red sigue enseñando el último mes que trajo: ' + sinRed.monto);
ok(sinRed.hayBarra, 'con su barra y todo');
ok(/^DÍA \d+ DE \d+$/.test(sinRed.dia),
   'y como la lectura vieja es de hoy, no se llama vieja: ' + sinRed.dia);

/* ------------------------------------------------------------- tema oscuro */

console.log('\nEn oscuro se distinguen los colores');

await abrir(hash({ tema: 'oscuro' }));

const oscuro = await p.evaluate(() => {
  const leer = s => getComputedStyle(document.querySelector(s));
  const caja = leer('.widget');
  const tramos = [...document.querySelectorAll('.w-barra > div')]
    .map(d => getComputedStyle(d).backgroundColor);
  return {
    tema: document.documentElement.dataset.tema,
    fondo: caja.backgroundColor,
    tinta: caja.color,
    pista: leer('.w-barra').backgroundColor,
    tramos
  };
});
ok(oscuro.tema === 'oscuro', 'el widget respeta el tema que le manda el sistema');
ok(oscuro.fondo === 'rgb(20, 16, 14)', 'con el fondo oscuro de la app: ' + oscuro.fondo);

/* La trampa que el propio documento de diseño señala: si la tarjeta se mezcla
   siempre hacia el fondo, en oscuro queda igual que la pista —que significa
   «no gastado»— y la tarjeta desaparece. `--rebaja` va a la tinta en oscuro. */
const iguales = oscuro.tramos.filter(c => c === oscuro.pista);
ok(iguales.length === 0,
   'y ningún tramo se confunde con la pista: ' + oscuro.tramos.length + ' tramos, '
   + oscuro.pista + ' de pista');
ok(new Set(oscuro.tramos).size === oscuro.tramos.length,
   'ni dos tramos entre sí: ' + JSON.stringify(oscuro.tramos));

/* ------------------------------------------- cuando los datos son de ayer */

console.log('\nY cuando lo guardado es de otro día');

/* «Un widget que miente sin avisar es peor que uno vacío». Sin red y con una
   lectura de otro día, el encabezado tiene que decirlo en vez de enseñar un día
   del mes que ya no es el de hoy — que es justo el dato que parece fresco sin
   serlo. Se fuerza porque no hay forma de esperar a mañana. */
await abrir(hash());
const anticuado = await p.evaluate(async () => {
  const ayer = new Date(Date.now() - 36e5 * 30).toISOString().slice(0, 10);
  ESTADO.sincronizar = async () => false;
  ESTADO.hoy = () => ayer;
  await WIDGET.pintar();
  return {
    dia: document.querySelector('.w-dia').textContent,
    apagado: document.getElementById('widget').classList.contains('viejo'),
    hayCifra: Boolean(document.querySelector('.w-monto'))
  };
});
ok(anticuado.dia === 'ACTUALIZADO AYER',
   'el encabezado avisa en vez de dar un día que ya pasó: ' + anticuado.dia);
ok(anticuado.apagado, 'y la leyenda se apaga, que se ve antes que el texto');
ok(anticuado.hayCifra, 'pero la cifra sigue ahí: es vieja, no inexistente');

/* --------------------------------- el rebajado no puede separarse del de la app */

console.log('\nEl rebajado es el mismo que el de la app');

/* `widget.js` no puede importar `vista.js` —construye pantallas y aquí no hay
   ninguna— así que la línea está duplicada a propósito. Esto es lo que impide
   que se separen: si alguien cambia el 34 % en un sitio y no en el otro, la
   tarjeta del widget deja de ser del color de la tarjeta de la app. */
const linea = archivo => {
  const t = fs.readFileSync(new URL('../js/' + archivo, import.meta.url), 'utf8');
  const m = t.match(/color-mix\(in srgb, '[^\n]*/);
  return m ? m[0].trim() : null;
};
ok(linea('vista.js') !== null && linea('vista.js') === linea('widget.js'),
   'la mezcla es idéntica en vista.js y widget.js: ' + linea('widget.js'));

console.log('\nerrores:', errores.length ? errores : 'ninguno');
if (errores.length) fallos++;
console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
await b.close();
process.exit(fallos ? 1 : 0);
