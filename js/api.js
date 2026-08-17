/**
 * Comunicación con el backend (Google Apps Script).
 *
 * El endpoint y el token no se leen de CONFIG sino de AJUSTES, que los saca del
 * almacenamiento del teléfono. CONFIG solo actúa de respaldo para cuando estás
 * trabajando en local y los has rellenado a mano.
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
    return AJUSTES.configurado();
  }

  /**
   * Envía una o varias filas. Lanza excepción si falla, para que quien llama
   * decida si encolarlas (fase 3) o avisar al usuario.
   *
   * Va una lista y no un movimiento suelto porque un traspaso son dos filas que
   * tienen que entrar juntas: media transferencia escrita descuadra el saldo de
   * las dos cuentas. El backend las mete bajo un mismo bloqueo.
   */
  async function enviar(filas) {
    const movimientos = Array.isArray(filas) ? filas : [filas];

    if (CONFIG.MODO_PRUEBA) {
      console.log('[MODO_PRUEBA] no se envía nada. Filas:', movimientos);
      console.table(movimientos);
      return { ok: true, prueba: true };
    }

    const ajustes = AJUSTES.leer();
    if (!ajustes.endpoint || !ajustes.token) {
      throw new Error('Falta configurar el endpoint o el token');
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
    const respuesta = await fetch(ajustes.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: ajustes.token, movimientos }),
      // Apps Script contesta con un redirect a script.googleusercontent.com.
      // Hay que seguirlo; es el comportamiento por defecto, se deja explícito
      // para que nadie lo cambie por error.
      redirect: 'follow'
    });

    return await interpretar(respuesta);
  }

  /**
   * Pide el resumen del mes y los últimos movimientos.
   * @param {object} ajustes opcional, para probar valores aún sin guardar.
   */
  async function consultar(ajustes = AJUSTES.leer(), cuantos = 10) {
    if (!ajustes.endpoint || !ajustes.token) {
      throw new Error('Falta configurar el endpoint o el token');
    }

    const url = `${ajustes.endpoint}?token=${encodeURIComponent(ajustes.token)}&n=${cuantos}`;
    const respuesta = await fetch(url, { method: 'GET', redirect: 'follow' });
    return await interpretar(respuesta);
  }

  async function interpretar(respuesta) {
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    const texto = await respuesta.text();
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch (_) {
      /* Apps Script devuelve una página HTML de error cuando el despliegue no
         es accesible o cuando pide iniciar sesión. Da la cara aquí en vez de
         soltar un "Unexpected token <" que no le dice nada a nadie. */
      throw new Error('El endpoint no devuelve JSON. Revisa que el despliegue sea "Cualquier persona" y que la URL acabe en /exec');
    }

    if (!datos.ok) throw new Error(datos.error || 'Error desconocido del backend');
    return datos;
  }

  return { uuid, enviar, consultar, configurado };
})();
