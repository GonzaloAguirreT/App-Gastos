/**
 * Service worker.
 *
 * En la fase 1 hace solo dos cosas: cachear el esqueleto de la app para que
 * arranque sin red, y existir. Lo segundo no es una broma: Chrome en Android no
 * ofrece "Añadir a la pantalla de inicio" como app instalable si no hay un
 * service worker con un manejador de fetch.
 *
 * La cola de envíos y la Background Sync API llegan en la fase 3.
 */

/* Subir esta versión invalida la caché entera y obliga a volver a descargar
   todos los archivos juntos. HAY QUE SUBIRLA EN CADA DESPLIEGUE que toque
   index.html, el CSS o el JS. Es el único mecanismo de actualización que hay. */
const CACHE = 'gastos-v4';

const ESENCIALES = [
  './',
  './index.html',
  './config.js',
  './css/estilos.css',
  './js/ui.js',
  './js/api.js',
  './js/ajustes.js',
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
