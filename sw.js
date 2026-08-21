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

/* Subir esta versión invalida la caché entera y obliga a volver a descargar
   todos los archivos juntos. HAY QUE SUBIRLA EN CADA DESPLIEGUE que toque
   index.html, el CSS o el JS. Es el único mecanismo de actualización que hay. */
const CACHE = 'gastos-v29';

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
   seguidas en menos de ese rato —cosa que pasó—, el service worker nuevo se
   guarda el index.html VIEJO dentro de su caché nueva.

   El resultado es justo la mezcla de versiones que este service worker existe
   para impedir: Ajustes decía v14 mientras la pantalla era la v13, el app.js
   buscaba un elemento que ese HTML no tenía y el paso moría en silencio.

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

/* La app pregunta qué versión está sirviendo para enseñarla en Ajustes. Sin
   esto no hay forma de saber, mirando el móvil, si tiene la última versión o
   una cacheada de hace tres despliegues, y eso ha costado ya un buen rato de
   diagnósticos a ciegas. */
self.addEventListener('message', evento => {
  if (evento.data === 'version' && evento.source) {
    evento.source.postMessage({ version: CACHE });
  }
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

  /* Estrategia: lo cacheado manda, y NO se refresca por detrás.

     La versión anterior servía de caché y refrescaba cada archivo en segundo
     plano. Parecía lo mejor de los dos mundos y era un error: cada archivo se
     actualizaba por su cuenta, así que se podía acabar con el index.html nuevo
     y el app.js viejo a la vez. Pasó de verdad — la app mostraba el botón de
     ajustes de una versión y ejecutaba el código de otra que no sabía qué hacer
     con él.

     Ahora todos los archivos entran juntos en el install, de una sola vez, y
     nadie los toca hasta el siguiente cambio de versión de caché. O tienes la
     versión entera vieja, o la entera nueva; nunca una mezcla.

     El precio: tras un despliegue hace falta abrir la app dos veces. En la
     primera se detecta el sw.js nuevo y se descarga todo por detrás; en la
     segunda ya se sirve. Prefiero eso a una app incoherente. */
  evento.respondWith(
    caches.match(peticion).then(cacheada => cacheada || fetch(peticion))
  );
});
