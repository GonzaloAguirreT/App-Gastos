/**
 * Comunicación con el backend (Google Apps Script).
 *
 * En la fase 1 esto solo se ejercita con MODO_PRUEBA: el movimiento se escribe
 * en la consola y no sale nada a la red. El envío real queda ya escrito para no
 * tener que rehacerlo, pero no se ha probado contra un despliegue hasta la fase 2.
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

  function configurado() {
    return Boolean(CONFIG.ENDPOINT && CONFIG.TOKEN);
  }

  /**
   * Envía un movimiento. Lanza excepción si el envío falla, para que quien
   * llama decida si encolarlo (fase 3) o avisar al usuario.
   */
  async function enviar(movimiento) {
    if (CONFIG.MODO_PRUEBA) {
      console.log('[MODO_PRUEBA] no se envía nada. Movimiento:', movimiento);
      console.table([movimiento]);
      return { ok: true, prueba: true };
    }

    if (!configurado()) {
      throw new Error('Falta ENDPOINT o TOKEN');
    }

    /* ---------------------------------------------------------------------
       AQUÍ ES DONDE ESTO SE ROMPE SI SE TOCA.

       Apps Script no responde a las peticiones OPTIONS de preflight. Si el
       navegador considera que la petición es "compleja" —y usar
       Content-Type: application/json la vuelve compleja— manda un preflight,
       Apps Script no contesta y el fetch falla con un error de CORS que no
       dice nada útil.

       La forma de evitarlo es que la petición sea "simple": text/plain como
       Content-Type y el JSON serializado a mano en el cuerpo. Del otro lado,
       el script lo recupera con JSON.parse(e.postData.contents).

       No cambiar a application/json aunque parezca lo correcto.
       --------------------------------------------------------------------- */
    const respuesta = await fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: CONFIG.TOKEN, movimiento }),
      redirect: 'follow'
    });

    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    const datos = await respuesta.json();
    if (!datos.ok) throw new Error(datos.error || 'Error desconocido del backend');
    return datos;
  }

  return { uuid, enviar, configurado };
})();
