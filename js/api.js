/**
 * Lo que la página necesita del backend y no está ya en nucleo.js.
 *
 * El envío y la consulta viven en el núcleo porque los comparte el service
 * worker. Aquí queda solo lo que no tiene sentido fuera de la página.
 */
const API = (() => {

  /** crypto.randomUUID() no existe en contextos inseguros (http:// que no sea
   *  localhost) ni en navegadores viejos. El respaldo no es criptográfico, pero
   *  para desduplicar filas de una hoja personal sobra. */
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  return {
    uuid,
    // Se reexportan para que quien lea app.js o ajustes.js no tenga que saber
    // que por debajo hay un módulo compartido con el service worker.
    enviar: NUCLEO.enviar,
    consultar: NUCLEO.consultar
  };
})();
