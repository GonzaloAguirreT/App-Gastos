/**
 * Service worker.
 *
 * Hace tres cosas: cachear el esqueleto para que la app arranque sin red,
 * existir —Chrome no ofrece instalar una PWA sin un service worker con
 * manejador de fetch—, y vaciar la cola de movimientos con la app cerrada.
 *
 * Lo último es la Background Sync API: sales del supermercado, el móvil pilla
 * cobertura, y la fila aparece en la hoja sin que abras nada. Solo la tiene
 * Chromium; donde no exista, la cola se vacía igual pero con la app abierta.
 */

/* Nombre fijo: ya no hay que subirlo a mano en cada despliegue. La frescura no
   depende de este nombre —depende de que el fetch vaya primero a la red, más
   abajo—; esto solo sirve para poder purgar cachés de nombres viejos si el
   propio nombre cambia alguna vez. */
const CACHE = 'gastos';

/* El mismo código de IndexedDB y de envío que usa la página. Se importa en vez
   de reescribirlo aquí: dos copias de la lógica de la cola acabarían
   divergiendo, y el día que lo hicieran perderíamos movimientos sin enterarnos.
   config.js va primero porque nucleo.js lee CONFIG. */
importScripts('config.js', 'js/nucleo.js');

const ESENCIALES = [
  './',
  './index.html',
  './config.js',
  './css/estilos.css',
  './css/fuentes.css',
  './css/fuentes/newsreader-400.woff2',
  './css/fuentes/newsreader-500.woff2',
  './css/fuentes/plex-mono-400.woff2',
  './css/fuentes/plex-mono-500.woff2',
  './js/formato.js',
  './js/nucleo.js',
  './js/vista.js',
  './js/estado.js',
  './js/mes.js',
  './js/fijos.js',
  './js/ahorro.js',
  './js/anotar.js',
  './js/ajustes.js',
  './js/app.js',
  './manifest.json',
  './iconos/icono.svg',
  './iconos/icono-48.png',
  './iconos/icono-72.png',
  './iconos/icono-96.png',
  './iconos/icono-144.png',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-monocromo-512.png'
];

/* cache: 'reload' en cada descarga, y no es un detalle.

   cache.addAll() pide los archivos como cualquier fetch, así que el navegador
   puede contestarlos desde SU caché HTTP sin salir a la red. GitHub Pages sirve
   el HTML con max-age=600, o sea diez minutos: si despliegas dos versiones
   seguidas en menos de ese rato —cosa que pasó—, el esqueleto que este install
   guarda podía ser el index.html VIEJO, con un app.js que buscaba un elemento
   que ese HTML no tenía y el arranque moría en silencio.

   'reload' obliga a ir a la red y a refrescar de paso la caché HTTP. */
self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(
        ESENCIALES.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(claves => Promise.all(
        claves.filter(c => c !== CACHE).map(c => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

/* Background Sync: el navegador nos despierta cuando vuelve a haber red,
   aunque la app esté cerrada. Es el único camino para que un gasto anotado sin
   cobertura llegue a la hoja sin que tengas que acordarte de abrir la app.

   Si la promesa se rechaza, el navegador reintenta el sync más tarde por su
   cuenta; por eso aquí no hay reintentos propios. */
self.addEventListener('sync', evento => {
  if (evento.tag === 'enviar-cola') {
    evento.waitUntil(
      NUCLEO.procesar({ ignorarDeshacer: true, ignorarBackoff: true }).then(resultado => {
        // Si queda algo, se falla a propósito para que el navegador lo
        // reprograme en vez de dar el trabajo por terminado.
        if (resultado.quedan > 0) throw new Error('Quedan ' + resultado.quedan + ' por enviar');
      })
    );
  }
});

self.addEventListener('fetch', evento => {
  const peticion = evento.request;

  // Solo se cachea lo propio. Las llamadas al Apps Script nunca pasan por aquí:
  // servir un movimiento desde caché sería mentir sobre si se ha enviado.
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== location.origin) {
    return;
  }

  /* Estrategia: red primero, caché solo cuando no hay red.

     La versión anterior servía SIEMPRE de caché, y actualizarla exigía subir
     `CACHE` a mano y abrir la app dos veces. Con red primero no hace falta
     ninguna de las dos cosas: cada carga pide los archivos de verdad y dejan
     su copia guardada de paso, así que en cuanto hay conexión se sirve lo que
     está desplegado ahora mismo, solo.

     `cache: 'reload'` salta la caché HTTP del navegador —GitHub Pages sirve el
     HTML con max-age=600, y sin esto se podía recibir una copia de hace diez
     minutos aunque la red funcionara—. Sin conexión, se cae a lo último que se
     guardó. Si eso tampoco existe —la primera visita, sin red—, el fallo sube
     tal cual y lo cachea el `install`, que sí trae el esqueleto entero de una
     vez.

     Sigue sin poder convivir un HTML nuevo con un JS viejo servidos DESDE ESTA
     caché porque cada carga los pide todos a la red casi a la vez; y si la red
     entrega una mezcla a mitad de un despliegue, `APP.iniciar` lo detecta —le
     faltará algún hueco del HTML nuevo— y lo dice en pantalla en vez de fallar
     en silencio. */
  evento.respondWith(
    caches.open(CACHE).then(async cache => {
      try {
        const fresca = await fetch(new Request(peticion.url, { cache: 'reload' }));
        cache.put(peticion, fresca.clone());
        return fresca;
      } catch (falloDeRed) {
        const cacheada = await cache.match(peticion);
        if (cacheada) return cacheada;
        throw falloDeRed;
      }
    })
  );
});
