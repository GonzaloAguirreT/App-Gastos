/**
 * Pantalla de resumen: totales del mes y últimos movimientos.
 *
 * Nunca se pone por delante de la captura. Se abre a propósito desde la
 * cabecera y se cierra igual de rápido; la app siempre arranca en el paso del
 * importe, pase lo que pase aquí.
 */
const RESUMEN = (() => {

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const el = {
    pantalla: document.getElementById('pantalla-resumen'),
    abrir: document.getElementById('btn-resumen'),
    cerrar: document.getElementById('btn-cerrar-resumen'),
    titulo: document.getElementById('titulo-resumen'),
    avisoCache: document.getElementById('aviso-cache'),
    ingresos: document.getElementById('total-ingresos'),
    gastos: document.getElementById('total-gastos'),
    ahorro: document.getElementById('total-ahorro'),
    etiquetaAhorro: document.getElementById('etiqueta-ahorro'),
    lista: document.getElementById('lista-movimientos'),
    reintentar: document.getElementById('btn-reintentar'),
    ajustes: document.getElementById('btn-abrir-ajustes')
  };

  function dinero(cantidad) {
    const n = Number(cantidad) || 0;
    /* El menos tipográfico (−) y no el guion (-): en la misma pantalla conviven
       esta cifra y las de la lista, y con dos signos distintos —uno más corto y
       más alto que el otro— la diferencia se nota. */
    return n.toFixed(2).replace('-', '−').replace('.', ',') + ' ' + CONFIG.MONEDA;
  }

  function pintarTotales(mes) {
    el.ingresos.textContent = dinero(mes.ingresos);
    el.gastos.textContent = dinero(mes.gastos);
    const enNumeros = Number(mes.ahorro);
    el.ahorro.textContent = dinero(mes.ahorro);
    // El ahorro es el único que puede ser negativo, y entonces hay que verlo.
    el.ahorro.classList.toggle('negativo', enNumeros < 0);
    /* Y deja de llamarse ahorro: un número negativo bajo la palabra "Ahorro" es
       una etiqueta que miente. Cuando gastas más de lo que entra, eso es lo que
       pone. */
    if (el.etiquetaAhorro) el.etiquetaAhorro.textContent = enNumeros < 0 ? 'Déficit' : 'Ahorro';
  }

  function pintarMovimientos(movimientos) {
    el.lista.innerHTML = '';

    if (!movimientos.length) {
      const vacio = document.createElement('li');
      vacio.className = 'lista-vacia';
      vacio.textContent = 'Todavía no hay movimientos.';
      el.lista.appendChild(vacio);
      return;
    }

    movimientos.forEach(m => {
      const fila = document.createElement('li');
      fila.className = 'movimiento';

      const esTraspaso = m.categoria === CONFIG.CATEGORIA_TRASPASO;
      const signo = esTraspaso ? '' : (m.tipo === 'Gasto' ? '−' : '+');

      // El concepto manda sobre la categoría: si te molestaste en escribirlo,
      // es lo que te va a permitir reconocer el movimiento de un vistazo.
      const principal = m.concepto || m.categoria;

      /* Las dos filas de un traspaso tienen el mismo importe y el mismo texto,
         y sin decir cuál sale y cuál entra se leen exactamente igual. Como no
         llevan signo —no son ni gasto ni ingreso—, la dirección hay que
         escribirla. */
      const cuenta = esTraspaso
        ? (m.tipo === 'Gasto' ? 'sale de ' : 'entra en ') + m.cuenta
        : m.cuenta;

      /* Solo el nombre de pila: en una línea de detalle no cabe "Gonzalo
         Aguirre" además de la fecha y la cuenta, y con dos personas el nombre
         basta para saber de quién es. */
      const quien = m.usuario ? ' · ' + escapar(String(m.usuario).split(' ')[0]) : '';

      fila.innerHTML =
        `<span class="mov-texto">` +
          `<span class="mov-principal">${escapar(principal)}</span>` +
          `<span class="mov-detalle">${UI.formatearFecha(m.fecha)} · ${escapar(cuenta)}${quien}</span>` +
        `</span>` +
        `<span class="mov-importe ${esTraspaso ? 'traspaso' : (m.tipo === 'Gasto' ? 'gasto' : 'ingreso')}">` +
          `${signo}${dinero(m.importe)}</span>`;

      el.lista.appendChild(fila);
    });
  }

  /** Los conceptos los escribes tú, pero van al DOM como HTML. Escapar cuesta
   *  cuatro líneas y evita que un concepto con un "<" rompa la lista. */
  function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto == null ? '' : texto);
    return div.innerHTML;
  }

  function avisar(texto) {
    el.avisoCache.textContent = texto;
    el.avisoCache.hidden = !texto;
  }

  function hace(marca) {
    const minutos = Math.round((Date.now() - marca) / 60000);
    if (minutos < 1) return 'hace un momento';
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;
    return `hace ${Math.round(horas / 24)} días`;
  }

  async function abrir() {
    const hoy = new Date();
    el.titulo.textContent = MESES[hoy.getMonth()][0].toUpperCase() +
                            MESES[hoy.getMonth()].slice(1);
    el.pantalla.hidden = false;

    await pintarBotonReintentar();

    // Primero lo que haya guardado, para que la pantalla no aparezca vacía
    // mientras se espera al backend.
    const cacheado = await NUCLEO.leerResumen();
    if (cacheado && cacheado.datos) {
      pintarTotales(cacheado.datos.mes);
      pintarMovimientos(cacheado.datos.ultimos);
      avisar(`Datos de ${hace(cacheado.recibido)}. Actualizando…`);
    } else {
      avisar('Cargando…');
    }

    try {
      const datos = await NUCLEO.consultar(undefined, 10);
      pintarTotales(datos.mes);
      pintarMovimientos(datos.ultimos);
      avisar('');
      await NUCLEO.guardarResumen(datos);
    } catch (error) {
      /* Sin red se enseña lo cacheado, pero marcado: un resumen viejo sin avisar
         es peor que no enseñar nada, porque se toman decisiones con él. */
      if (cacheado && cacheado.datos) {
        avisar(`Sin conexión. Datos de ${hace(cacheado.recibido)}, puede que desactualizados.`);
      } else {
        avisar('Sin conexión y no hay datos guardados todavía.');
        pintarMovimientos([]);
      }
    }
  }

  function cerrar() {
    el.pantalla.hidden = true;
  }

  async function pintarBotonReintentar() {
    const pendientes = await NUCLEO.contar();
    el.reintentar.hidden = pendientes === 0;
    el.reintentar.textContent = pendientes === 1
      ? 'Reintentar 1 movimiento'
      : `Reintentar ${pendientes} movimientos`;
  }

  function iniciar() {
    el.abrir.addEventListener('click', abrir);
    el.cerrar.addEventListener('click', cerrar);
    el.ajustes.addEventListener('click', () => AJUSTES.abrir());
    el.reintentar.addEventListener('click', async () => {
      await COLA.forzar();
      await pintarBotonReintentar();
      abrir();   // se recarga: si se enviaron, los totales han cambiado
    });
  }

  return { iniciar, abrir, cerrar };
})();
