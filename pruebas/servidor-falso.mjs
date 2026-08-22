/*
 * Un Apps Script de mentira, y la app de verdad servida a su lado.
 *
 * Guarda el libro en memoria y contesta a todas las acciones del backend, así
 * que la app se comporta como contra la hoja real: lo que anotas aparece, lo
 * que borras desaparece, y un fijo cobrado se convierte en un movimiento.
 *
 *   node pruebas/servidor-falso.mjs              backend que funciona
 *   node pruebas/servidor-falso.mjs --rechaza    backend de un despliegue viejo
 *
 * El modo --rechaza contesta a todo lo que no sea 'mes' con "Petición sin
 * movimientos", que es literalmente lo que contesta una implementación anterior
 * al recibir una acción que no conoce. Ese estado —app nueva contra despliegue
 * viejo— es por donde pasa cualquiera entre pegar el Codigo.gs y volver a
 * implementar la aplicación web, y costó una mañana de diagnóstico.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* fileURLToPath y no .pathname: en Windows una URL de archivo da
   "/C:/Users/.../App%20Gastos/", con la barra de delante y el espacio sin
   descodificar, y con esa ruta no existe ningún archivo. El servidor arrancaba
   igual y contestaba 404 a todo, que parece un problema de la app. */
const RAIZ = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const RECHAZA = process.argv.includes('--rechaza');
/* Reproduce una hoja cuya columna de mes NO se forzó a texto: Sheets convirtió
   "2026-08" en el 1 de agosto y al leerlo vuelve como una fecha en crudo. Las
   filas escritas antes del arreglo del backend siguen así. */
const MES_COMO_FECHA = process.argv.includes('--mes-como-fecha');
/* Un mes pasado con gastos que nunca se cerró. Sus movimientos siguen en la
   hoja y el backend los manda, así que la app tiene que poder llegar a él. */
const MES_VIEJO = process.argv.includes('--mes-viejo');
const PUERTO = 8300;

const hoy = () => new Date().toISOString().slice(0, 10);
const mesDe = iso => iso.slice(0, 7);
const mesAtras = (m, n) => {
  const [a, x] = m.split('-').map(Number);
  const t = a * 12 + (x - 1) - n;
  return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0');
};
const mesSiguiente = m => {
  const [a, n] = m.split('-').map(Number);
  return n === 12 ? (a + 1) + '-01' : a + '-' + String(n + 1).padStart(2, '0');
};

/* El libro. Se rehace en cada arranque: una prueba que hereda el estado de la
   anterior deja de comprobar lo que dice comprobar. */
function libroNuevo() {
  return {
    hoy: hoy(),
    config: {
      ahorroEsperado: 200000, moneda: 'CLP', simbolo: '$',
      avisos: { fijo: true, saldo: true, semanal: false }, diaCierre: 'último'
    },
    personas: [{ nombre: 'Gonzalo', color: '#3D5A6C', diaCobro: 5 },
               { nombre: 'Camila', color: '#A34E6B', diaCobro: 20 }],
    cuentas: ['Cuenta Corriente', 'Tarjeta Credito', 'Efectivo'],
    credito: ['Tarjeta Credito'],
    categorias: [
      { nombre: 'Alimentación', tipo: 'Gasto', reparto: 'Común' },
      { nombre: 'Restaurantes', tipo: 'Gasto', reparto: 'Personal' },
      { nombre: 'Transporte', tipo: 'Gasto', reparto: 'Común' },
      { nombre: 'Ocio', tipo: 'Gasto', reparto: 'Personal' },
      { nombre: 'Suscripciones', tipo: 'Gasto', reparto: 'Común' },
      { nombre: 'Arriendo', tipo: 'Gasto', reparto: 'Común' },
      { nombre: 'Sueldo', tipo: 'Ingreso', reparto: 'Personal' }
    ],
    movimientos: [
      ...(MES_VIEJO ? [{
        uuid: 'm-viejo', fecha: mesAtras(mesDe(hoy()), 3) + '-14', tipo: 'Gasto',
        categoria: 'Viajes', descripcion: 'Vuelos', importe: 480000,
        cuenta: 'Tarjeta Credito', persona: 'Camila', reparto: 'Común', origen: 'app',
        paraMes: mesAtras(mesDe(hoy()), 3)
      }] : []),
      { uuid: 'm-1', fecha: hoy(), tipo: 'Gasto', categoria: 'Alimentación',
        descripcion: 'Feria', importe: 24000, cuenta: 'Cuenta Corriente',
        persona: 'Camila', reparto: 'Común', origen: 'app', paraMes: mesDe(hoy()) },
      { uuid: 'm-2', fecha: hoy(), tipo: 'Gasto', categoria: 'Restaurantes',
        descripcion: 'Almuerzo', importe: 12900, cuenta: 'Efectivo',
        persona: 'Gonzalo', reparto: 'Personal', origen: 'app', paraMes: mesDe(hoy()) },
      /* Los dos sueldos: sin ingresos no hay techo, y sin techo la pantalla Mes
         no tiene nada contra lo que medirse. */
      { uuid: 'm-s1', fecha: mesDe(hoy()) + '-01', tipo: 'Ingreso', categoria: 'Sueldo',
        descripcion: '', importe: 1400000, cuenta: 'Cuenta Corriente',
        persona: 'Gonzalo', reparto: 'Personal', origen: 'app', paraMes: mesDe(hoy()) },
      { uuid: 'm-s2', fecha: mesDe(hoy()) + '-01', tipo: 'Ingreso', categoria: 'Sueldo',
        descripcion: '', importe: 900000, cuenta: 'Cuenta Corriente',
        persona: 'Camila', reparto: 'Personal', origen: 'app', paraMes: mesDe(hoy()) },
      /* Una compra con tarjeta del mes pasado hecha DESPUÉS del día de cobro:
         su factura llega a este mes. Es el caso que ordena todo el libro. */
      { uuid: 'm-tc', fecha: mesAtras(mesDe(hoy()), 1) + '-25', tipo: 'Gasto',
        categoria: 'Ocio', descripcion: 'Entradas', importe: 38000,
        cuenta: 'Tarjeta Credito', persona: 'Gonzalo', reparto: 'Personal',
        origen: 'app', paraMes: mesDe(hoy()) }
    ],
    fijos: [
      { uuid: 'f-1', tipo: 'Gasto', concepto: 'Arriendo', importe: 620000, dia: 5,
        cada: 1, cuotas: 0, restantes: 0, cuenta: 'Cuenta Corriente',
        persona: 'Gonzalo', reparto: 'Común', activo: true,
        prox: mesDe(hoy()) + '-05', ultimo: '' },
      { uuid: 'f-2', tipo: 'Gasto', concepto: 'Suscripciones', importe: 11900, dia: 17,
        cada: 1, cuotas: 12, restantes: 8, cuenta: 'Tarjeta Credito',
        persona: 'Gonzalo', reparto: 'Común', activo: true,
        prox: mesDe(hoy()) + '-17', ultimo: '' }
    ],
    metas: [
      { nombre: 'Viaje a Japón', objetivo: 3000000, guardado: 400000, orden: 1, activa: true },
      { nombre: 'Fondo de emergencia', objetivo: 2000000, guardado: 150000, orden: 2, activa: true }
    ],
    cierres: MES_COMO_FECHA
      ? [{ mes: 'Sat Aug 01 2026 00:00:00 GMT+0200 (hora de verano de Europa central)',
           entrado: 0, gastado: 53376, ahorroEsperado: 200000,
           ahorrado: 1600000 - 53376, repartido: 0, sinAsignar: 1600000 - 53376,
           movimientos: [] }]
      : []
  };
}

let libro = libroNuevo();
export const peticiones = [];

const buscar = (lista, uuid) => lista.findIndex(x => x.uuid === uuid);

/* «Se usa en», calculado en un solo sitio, igual que en el Apps Script real: si
   dos teléfonos con listas distintas lo calcularan cada uno, la misma compra
   acabaría en meses distintos. Lo que manda la app llega como propuesta y aquí
   se recalcula, salvo en un ingreso, donde la elección es del dedo. */
function seUsaEn(m) {
  const mes = mesDe(m.fecha);
  if (m.tipo === 'Ingreso') return m.paraMes || mes;
  if (!libro.credito.includes(m.cuenta)) return mes;
  const p = libro.personas.find(x => x.nombre === m.persona);
  const corte = Number(p && p.diaCobro) || 0;
  if (!corte) return mes;
  return Number(m.fecha.slice(8)) < corte ? mes : mesSiguiente(mes);
}

function despachar(p) {
  const d = p.datos || {};
  switch (p.accion) {
    case 'mes':
      return { ok: true, datos: libro };

    case 'movimientos':
      (p.movimientos || []).forEach(m => {
        if (!libro.movimientos.some(x => x.uuid === m.uuid)) {
          libro.movimientos.push(Object.assign({}, m, { paraMes: seUsaEn(m) }));
        }
      });
      return { ok: true, escritos: (p.movimientos || []).length };

    case 'movimiento-edita': {
      const i = buscar(libro.movimientos, d.uuid);
      if (i === -1) return { ok: false, error: 'No existe ese movimiento' };
      const m = Object.assign({}, libro.movimientos[i], d.cambios || d);
      libro.movimientos[i] = Object.assign(m, { paraMes: seUsaEn(m) });
      return { ok: true };
    }

    case 'movimiento-baja': {
      const i = buscar(libro.movimientos, d.uuid);
      if (i === -1) return { ok: false, error: 'No existe ese movimiento' };
      libro.movimientos.splice(i, 1);
      return { ok: true };
    }

    case 'fijo': {
      const f = d.fijo || d;
      /* El próximo cargo lo calcula el servidor, igual que el backend real: la
         app decide el día, no la fecha. Sin esto un fijo recién dado de alta no
         "cae" en ningún mes y desaparece de los totales. */
      if (!f.prox) {
        const dia = String(f.dia || 1).padStart(2, '0');
        const esteMes = mesDe(libro.hoy) + '-' + dia;
        f.prox = esteMes >= libro.hoy ? esteMes : mesSiguiente(mesDe(libro.hoy)) + '-' + dia;
      }
      const i = buscar(libro.fijos, f.uuid);
      if (i === -1) libro.fijos.push(f); else libro.fijos[i] = Object.assign({}, libro.fijos[i], f);
      return { ok: true, fijo: f };
    }

    case 'fijo-baja': {
      const i = buscar(libro.fijos, d.uuid);
      if (i !== -1) libro.fijos.splice(i, 1);
      return { ok: true };
    }

    case 'fijo-cargo': {
      const i = buscar(libro.fijos, d.uuid);
      if (i === -1) return { ok: false, error: 'No existe ese fijo' };
      const f = libro.fijos[i];
      const fecha = (d.mes || mesDe(libro.hoy)) + '-' + String(f.dia).padStart(2, '0');
      const uuid = 'fijo-' + f.uuid + '-' + mesDe(fecha);
      const paraMes = f.tipo === 'Ingreso' && f.usaEn === 'siguiente'
        ? mesSiguiente(mesDe(fecha)) : mesDe(fecha);
      if (d.cargado === false) {
        libro.movimientos = libro.movimientos.filter(m => m.uuid !== uuid);
        f.ultimo = '';
      } else if (!libro.movimientos.some(m => m.uuid === uuid)) {
        libro.movimientos.push({
          uuid, fecha, tipo: f.tipo, categoria: f.concepto, descripcion: '',
          importe: f.importe, cuenta: f.cuenta, persona: f.persona,
          reparto: f.reparto, paraMes, origen: 'fijo'
        });
        f.ultimo = fecha;
      }
      return { ok: true, fijo: f };
    }

    case 'cerrar-mes': {
      const mes = d.mes || mesDe(libro.hoy);
      const suyos = libro.movimientos.filter(m => (m.paraMes || mesDe(m.fecha)) === mes);
      const entrado = suyos.filter(m => m.tipo === 'Ingreso').reduce((s, m) => s + m.importe, 0);
      const gastado = suyos.filter(m => m.tipo === 'Gasto').reduce((s, m) => s + m.importe, 0);
      if (!libro.cierres.some(c => c.mes === mes)) {
        // Misma definición que el backend real: el techo es lo que entra.
        const ahorrado = entrado - gastado;
        libro.cierres.push({ mes, entrado, gastado,
                             ahorroEsperado: libro.config.ahorroEsperado,
                             ahorrado, totalAhorrado: ahorrado, repartido: 0,
                             sinAsignar: ahorrado, movimientos: suyos });
      }
      libro.movimientos = libro.movimientos.filter(m => (m.paraMes || mesDe(m.fecha)) !== mes);
      return { ok: true, cierre: libro.cierres[libro.cierres.length - 1] };
    }

    case 'cierre-baja': {
      const antes = libro.cierres.length;
      libro.cierres = libro.cierres.filter(c => c.mes !== d.mes);
      return { ok: true, escritos: antes - libro.cierres.length };
    }

    case 'reparto':
      (d.lineas || []).forEach(l => {
        const m = libro.metas.find(x => x.nombre === l.meta);
        if (m) m.guardado += Number(l.monto) || 0;
      });
      return { ok: true, metas: libro.metas };

    case 'metas':
      /* Se descartan las metas sin nombre, igual que el backend de verdad.

         En la hoja una meta ES su nombre —«Guardado» es un SUMIF sobre él— y
         por eso `leerMetas` filtra las filas vacías. Este servidor las guardaba
         tan contento, así que era más permisivo que Apps Script y dejaba pasar
         que una meta recién añadida no llegara nunca a la hoja. */
      libro.metas = (d.metas || p.metas || [])
        .filter(m => String(m.nombre || '').trim())
        .map(m => Object.assign({}, m));
      return { ok: true, metas: libro.metas };

    case 'config':
      ['personas', 'cuentas', 'categorias', 'credito'].forEach(k => { if (d[k]) libro[k] = d[k]; });
      libro.config = Object.assign({}, libro.config, d.config || {});
      /* Igual que el backend real: cambiar un día de cobro NO rehace el «Se usa
         en» de los gastos ya escritos. Una compra facturada con el corte que
         había se facturó así de verdad, y el corte nuevo manda desde ahora.

         Aquí llegó a hacerse, copiando lo que hacía el backend, y por eso hay
         que cambiarlo a la vez: un servidor falso que imita el comportamiento
         viejo hace fallar la prueba del nuevo por un motivo que no es suyo. */
      return { ok: true, datos: libro };

    default:
      return { ok: false, error: 'Acción desconocida: ' + p.accion };
  }
}

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  if (req.method === 'POST') {
    let cuerpo = '';
    req.on('data', c => cuerpo += c);
    req.on('end', () => {
      let p = {};
      try { p = JSON.parse(cuerpo || '{}'); } catch (_) { /* da igual */ }
      peticiones.push(p.accion || '?');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      if (p.accion === 'reinicio') { libro = libroNuevo(); return res.end(JSON.stringify({ ok: true })); }
      if (p.accion === 'cuantas') return res.end(JSON.stringify({ ok: true, n: peticiones.length }));
      if (RECHAZA && p.accion !== 'mes') {
        return res.end(JSON.stringify({ ok: false, error: 'Petición sin movimientos' }));
      }
      res.end(JSON.stringify(despachar(p)));
    });
    return;
  }

  const rel = (req.url.split('?')[0] === '/') ? '/index.html' : req.url.split('?')[0];
  const f = path.join(RAIZ, rel);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('no está');
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(PUERTO, () => {
  console.log('servidor falso en http://localhost:' + PUERTO +
              (RECHAZA ? '  (modo despliegue viejo: rechaza todo menos "mes")' : '') +
              (MES_COMO_FECHA ? '  (con un mes cerrado guardado como fecha)' : '') +
              (MES_VIEJO ? '  (con un mes pasado sin cerrar)' : ''));
});
