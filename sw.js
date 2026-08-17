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
const CACHE = 'gastos-v8';

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
  './js/nucleo.js',
  './js/ui.js',
  './js/api.js',
  './js/cola.js',
  './js/ajustes.js',
  './js/resumen.js',
  './js/app.js',
  './manifest.json',
  './iconos/icono.svg',
  './iconos/icono-192.png',
  './iconos/icono-512.png'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ESENCIALES))
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
