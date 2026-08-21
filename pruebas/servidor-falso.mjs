import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Un Apps Script de mentira, y la app de verdad servida a su lado.
 *
 * Contesta a la acción 'mes' con un libro mínimo y RECHAZA todo lo demás con
 * "Petición sin movimientos", que es literalmente lo que contesta un despliegue
 * anterior del backend cuando le llega una acción que no conoce.
 *
 * Ese estado —app nueva contra despliegue viejo— es por donde pasa cualquiera
 * entre pegar el Codigo.gs y volver a implementar la aplicación web, y no
 * estaba cubierto por ninguna prueba. Costó una mañana.
 *
 *   node pruebas/servidor-falso.mjs        (queda escuchando en el 8300)
 */
const LIBRO = {
  config: { plan: 1600000, limite: 200000, moneda: 'CLP', simbolo: '$',
            avisos: { fijo: true, saldo: true, semanal: false }, diaCierre: 'último' },
  personas: [{ nombre: 'Gonzalo', color: '#3D5A6C' }, { nombre: 'Camila', color: '#A34E6B' }],
  cuentas: ['Cuenta Corriente', 'Efectivo'],
  categorias: [{ nombre: 'Alimentación', tipo: 'Gasto', reparto: 'Común' },
               { nombre: 'Ocio', tipo: 'Gasto', reparto: 'Personal' }],
  movimientos: [], fijos: [], metas: [], cierres: []
};

http.createServer((req, res) => {
  if (req.method === 'POST') {
    let cuerpo = '';
    req.on('data', c => cuerpo += c);
    req.on('end', () => {
      const p = JSON.parse(cuerpo || '{}');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      if (p.accion === 'mes') return res.end(JSON.stringify({ ok: true, datos: LIBRO }));
      res.end(JSON.stringify({ ok: false, error: 'Petición sin movimientos' }));
    });
    return;
  }
  const rel = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
  const f = path.join(new URL('..', import.meta.url).pathname, rel);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
  const tipos = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };
  res.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(8300, () => console.log('mock en 8300'));
