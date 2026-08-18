/**
 * Capa de presentación: todo lo que toca el DOM vive aquí.
 * app.js decide qué pasa; ui.js solo sabe pintarlo.
 */
const UI = (() => {

  const el = {
    migas: document.getElementById('migas'),
    btnFecha: document.getElementById('btn-fecha'),
    txtFecha: document.getElementById('txt-fecha'),
    inputFecha: document.getElementById('input-fecha'),
    pasos: document.querySelectorAll('.paso'),
    inputImporte: document.getElementById('input-importe'),
    btnFrecuentes: document.getElementById('btn-frecuentes'),
    btnPuntuales: document.getElementById('btn-puntuales'),
    moneda: document.getElementById('moneda'),
    preguntaCategoria: document.getElementById('pregunta-categoria'),
    preguntaCuenta: document.getElementById('pregunta-cuenta'),
    rejillaCategorias: document.getElementById('rejilla-categorias'),
    rejillaCuentas: document.getElementById('rejilla-cuentas'),
    rejillaFrecuencias: document.getElementById('rejilla-frecuencias'),
    preguntaDia: document.getElementById('pregunta-dia'),
    rejillaDias: document.getElementById('rejilla-dias'),
    rejillaDuraciones: document.getElementById('rejilla-duraciones'),
    ficha: document.getElementById('ficha'),
    fichaImporte: document.getElementById('ficha-importe'),
    fichaDatos: document.getElementById('ficha-datos'),
    inputConcepto: document.getElementById('input-concepto'),
    btnGuardar: document.getElementById('btn-guardar'),
    btnAtras: document.getElementById('btn-atras'),
    toast: document.getElementById('toast'),
    toastTexto: document.getElementById('toast-texto'),
    toastDeshacer: document.getElementById('toast-deshacer'),
    btnPendientes: document.getElementById('btn-pendientes'),
    numPendientes: document.getElementById('num-pendientes')
  };

  /**
   * Comprueba que el HTML servido sea de la misma versión que este JS.
   *
   * Si falta un elemento, lo que hay cargado es un index.html de otra versión.
   * Antes eso se manifestaba como una app que se quedaba muerta a mitad de un
   * paso, sin error visible y sin pista de por dónde mirar: el primer
   * `el.loQueSea.textContent` sobre un null tumbaba el módulo entero.
   *
   * Un fallo así no se puede arreglar desde dentro, pero sí se puede decir en
   * voz alta y dar la única instrucción que lo resuelve.
   */
  function elementosQueFaltan() {
    return Object.keys(el).filter(nombre => {
      const nodo = el[nombre];
      return !nodo || (typeof nodo.length === 'number' && nodo.length === 0);
    });
  }

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

  /**
   * Pinta la ficha del movimiento en curso, en el hueco de arriba.
   *
   * Ese espacio estaba vacío en todos los pasos: negro y nada. Ahora lleva lo
   * que ya has contestado, que es justo lo que quieres comprobar antes de
   * guardar sin tener que volver atrás a mirarlo.
   *
   * Se enseña solo lo contestado: una ficha con huecos reservados para lo que
   * falta sería un formulario, y esto no lo es.
   */
  function pintarFicha(movimiento, moneda, visible) {
    el.ficha.classList.toggle('oculta', !visible);
    if (!visible) return;

    const hayImporte = Boolean(movimiento.importe);
    const signo = !movimiento.tipo ? '' : (movimiento.tipo === 'Gasto' ? '−' : '+');
    el.fichaImporte.textContent = hayImporte
      ? signo + formatearImporte(movimiento.importe, moneda)
      : '';
    el.fichaImporte.className = 'ficha-importe' +
      (movimiento.tipo === 'Ingreso' ? ' es-ingreso' : movimiento.tipo === 'Gasto' ? ' es-gasto' : '');

    const datos = [];
    if (movimiento.frecuente) datos.push({ clase: 'rama', texto: 'Frecuente' });
    if (movimiento.categoria) datos.push({ clase: 'categoria', texto: movimiento.categoria });
    if (movimiento.frecuencia) {
      datos.push({ clase: 'ritmo', texto: movimiento.frecuencia.toLowerCase() +
        (movimiento.dia ? ', día ' + movimiento.dia : '') });
    }
    if (movimiento.duracion) datos.push({ clase: 'ritmo', texto: movimiento.duracion.etiqueta.toLowerCase() });
    if (movimiento.cuenta) datos.push({ clase: 'cuenta', texto: movimiento.cuenta });

    el.fichaDatos.innerHTML = '';
    datos.forEach(d => {
      const li = document.createElement('li');
      li.className = 'ficha-dato ' + d.clase;
      li.textContent = d.texto;
      el.fichaDatos.appendChild(li);
    });
  }

  /** Los dos botones del primer paso solo sirven con un importe válido escrito:
   *  avanzar sin importe dejaría un movimiento a medias que hay que abandonar. */
  function habilitarRamas(activos) {
    el.btnFrecuentes.disabled = !activos;
    el.btnPuntuales.disabled = !activos;
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
    mostrarPaso, pintarOpciones, pintarPendientes, habilitarRamas,
    pintarFicha,
    elementosQueFaltan,
    toast, ocultarToast, vibrar
  };
})();
