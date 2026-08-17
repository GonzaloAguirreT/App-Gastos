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

// Subir la versión invalida la caché entera. Es la forma más simple de
// asegurarse de que un despliegue nuevo llega al teléfono.
const CACHE = 'gastos-v2';

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

  /* Estrategia: responder desde caché al instante y refrescar por detrás.
     Así la app abre igual de rápido con red que sin ella, y el despliegue
     siguiente ya trae los archivos nuevos. El precio es ir siempre un arranque
     por detrás, asumible para una app de un solo usuario. */
  evento.respondWith(
    caches.match(peticion).then(cacheada => {
      const desdeRed = fetch(peticion).then(respuesta => {
        if (respuesta && respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then(cache => cache.put(peticion, copia));
        }
        return respuesta;
      }).catch(() => cacheada);

      return cacheada || desdeRed;
    })
  );
});
