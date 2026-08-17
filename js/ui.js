/**
 * Capa de presentación: todo lo que toca el DOM vive aquí.
 * app.js decide qué pasa; ui.js solo sabe pintarlo.
 */
const UI = (() => {

  const el = {
    migas: document.getElementById('migas'),
    btnFecha: document.getElementById('btn-fecha'),
    btnUsuario: document.getElementById('btn-usuario'),
    txtUsuario: document.getElementById('txt-usuario'),
    txtFecha: document.getElementById('txt-fecha'),
    inputFecha: document.getElementById('input-fecha'),
    pasos: document.querySelectorAll('.paso'),
    inputImporte: document.getElementById('input-importe'),
    btnImporteSiguiente: document.getElementById('btn-importe-siguiente'),
    moneda: document.getElementById('moneda'),
    preguntaCategoria: document.getElementById('pregunta-categoria'),
    preguntaCuenta: document.getElementById('pregunta-cuenta'),
    rejillaCategorias: document.getElementById('rejilla-categorias'),
    rejillaCuentas: document.getElementById('rejilla-cuentas'),
    resumenMovimiento: document.getElementById('resumen-movimiento'),
    inputConcepto: document.getElementById('input-concepto'),
    btnGuardar: document.getElementById('btn-guardar'),
    btnAtras: document.getElementById('btn-atras'),
    toast: document.getElementById('toast'),
    toastTexto: document.getElementById('toast-texto'),
    toastDeshacer: document.getElementById('toast-deshacer'),
    btnPendientes: document.getElementById('btn-pendientes'),
    numPendientes: document.getElementById('num-pendientes')
  };

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /** yyyy-mm-dd de hoy en hora local. new Date().toISOString() da UTC y a
   *  partir de la una de la madrugada en España te apunta el gasto al día
   *  anterior, que es exactamente el tipo de error que no se detecta. */
  function hoyISO(fecha = new Date()) {
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${mes}-${dia}`;
  }

  function formatearFecha(iso) {
    if (iso === hoyISO()) return 'hoy';
    const [a, m, d] = iso.split('-').map(Number);
    const esteAnio = new Date().getFullYear() === a;
    return esteAnio ? `${d} ${MESES[m - 1]}` : `${d} ${MESES[m - 1]} ${a}`;
  }

  function pintarFecha(iso) {
    el.txtFecha.textContent = formatearFecha(iso);
    el.btnFecha.classList.toggle('fecha-cambiada', iso !== hoyISO());
    el.inputFecha.value = iso;
  }

  /** Con nombres cortos cabe el nombre entero, y un nombre se lee sin pensar
   *  mientras que una inicial hay que descifrarla. Si algún día son largos, se
   *  recorta a la inicial antes que romper la cabecera. */
  function pintarUsuario(nombre, esElDefecto) {
    const texto = (nombre || '?').trim();
    el.txtUsuario.textContent = texto.length <= 8 ? texto : texto.charAt(0).toUpperCase();
    el.btnUsuario.setAttribute('aria-label', 'Gasta ' + (nombre || 'nadie') + '. Tocar para cambiar');
    // Se resalta solo cuando NO es el dueño del teléfono: así el caso raro
    // —anotar algo del otro— se ve, y el habitual no mete ruido.
    el.btnUsuario.classList.toggle('ajeno', !esElDefecto);
  }

  function pintarMigas(indiceActual, total) {
    if (el.migas.children.length !== total) {
      el.migas.innerHTML = '';
      for (let i = 0; i < total; i++) el.migas.appendChild(document.createElement('li'));
    }
    [...el.migas.children].forEach((li, i) => {
      li.classList.toggle('hecho', i < indiceActual);
      li.classList.toggle('actual', i === indiceActual);
    });
  }

  /** Muestra un paso y devuelve el foco donde toca. `atras` solo cambia el
   *  sentido de la transición, para que el gesto de corregir se note distinto. */
  function mostrarPaso(nombre, atras = false) {
    el.pasos.forEach(seccion => {
      const activo = seccion.id === `paso-${nombre}`;
      seccion.classList.toggle('activo', activo);
      seccion.classList.toggle('atras', atras && !activo);
    });

    // El botón "Atrás" es uno solo y se muda al paso activo, en lugar de
    // repetirlo cinco veces en el HTML. Va dentro del bloque de acciones para
    // que no se solape con los botones grandes de la mitad inferior.
    document.querySelector(`#paso-${nombre} .paso-acciones`).prepend(el.btnAtras);
    el.btnAtras.classList.toggle('hueco', nombre === 'importe');
  }

  /** Rellena una rejilla de opciones. Devuelve el contenedor por comodidad. */
  function pintarOpciones(contenedor, valores, alElegir, sugerido = null) {
    contenedor.innerHTML = '';
    valores.forEach(valor => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'btn btn-opcion';
      boton.textContent = valor;
      if (valor === sugerido) boton.classList.add('sugerido');
      boton.addEventListener('click', () => alElegir(valor));
      contenedor.appendChild(boton);
    });
    contenedor.scrollTop = 0;
    return contenedor;
  }

  /** El dato que viaja a la hoja lleva punto decimal porque así lo exige el
   *  contrato, pero en pantalla se lee con coma. Solo para mostrar. */
  function formatearImporte(importe, moneda) {
    return `${String(importe).replace('.', ',')} ${moneda}`;
  }

  function pintarResumen(movimiento, moneda) {
    // En un traspaso el signo sobra: no se gana ni se pierde nada, solo se
    // mueve. Se enseña el recorrido entre cuentas en su lugar.
    if (movimiento.tipo === 'Traspaso') {
      el.resumenMovimiento.innerHTML =
        formatearImporte(movimiento.importe, moneda) +
        `<span class="detalle">${movimiento.cuenta} → ${movimiento.cuentaDestino}</span>`;
      return;
    }

    const signo = movimiento.tipo === 'Gasto' ? '−' : '+';
    el.resumenMovimiento.innerHTML =
      `${signo}${formatearImporte(movimiento.importe, moneda)}` +
      `<span class="detalle">${movimiento.categoria} · ${movimiento.cuenta}</span>`;
  }

  /** El contador de pendientes solo existe cuando hay algo pendiente. Un "0"
   *  permanente en la cabecera sería ruido diario para avisar de una situación
   *  que casi nunca se da. */
  function pintarPendientes(cuantos) {
    el.btnPendientes.hidden = cuantos === 0;
    el.numPendientes.textContent = cuantos;
    el.btnPendientes.title = cuantos === 1
      ? '1 movimiento sin enviar. Tocar para reintentar.'
      : `${cuantos} movimientos sin enviar. Tocar para reintentar.`;
  }

  let temporizadorToast = null;

  /**
   * @param {string} texto
   * @param {object} opciones {ms, alDeshacer}. Si hay alDeshacer, sale el botón.
   */
  function toast(texto, { ms = 2500, alDeshacer = null } = {}) {
    clearTimeout(temporizadorToast);
    el.toastTexto.textContent = texto;
    el.toast.hidden = false;

    el.toastDeshacer.hidden = !alDeshacer;
    el.toastDeshacer.onclick = alDeshacer
      ? () => { ocultarToast(); alDeshacer(); }
      : null;

    temporizadorToast = setTimeout(ocultarToast, ms);
  }

  function ocultarToast() {
    clearTimeout(temporizadorToast);
    el.toast.hidden = true;
  }

  /** La vibración es una cortesía: si el sistema la tiene desactivada o el
   *  navegador no la soporta, no pasa nada y no queremos un error en consola. */
  function vibrar(patron = 20) {
    if (navigator.vibrate) {
      try { navigator.vibrate(patron); } catch (_) { /* da igual */ }
    }
  }

  return {
    el, hoyISO, formatearFecha, formatearImporte, pintarFecha, pintarMigas,
    mostrarPaso, pintarOpciones, pintarResumen, pintarPendientes, pintarUsuario,
    toast, ocultarToast, vibrar
  };
})();
