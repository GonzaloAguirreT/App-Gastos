/**
 * Capa de presentación: construir nodos, navegar entre pantallas y avisar.
 *
 * No hay framework ni plantillas: cada pantalla se pinta entera cada vez que
 * cambia algo. Con listas de decenas de filas eso es más barato que llevar la
 * cuenta de qué cambió, y no se puede desincronizar, que es el error caro.
 */
const VISTA = (() => {

  /**
   * Crea un nodo. `h('div.fila', {onClick}, [hijos])`.
   *
   * La etiqueta lleva las clases pegadas —`span.etiqueta.mini`— porque el 90 %
   * de los nodos de esta app son eso: un elemento con dos clases y un texto.
   * Escribirlo con objetos de atributos triplicaba el ruido.
   *
   * Los hijos pueden ser nodos, textos, números, o null: lo nulo se ignora,
   * que es lo que permite escribir `[hayNota && h('p', nota)]` sin más.
   */
  function h(etiqueta, props, hijos) {
    /* El segundo argumento puede ser el de propiedades o directamente los
       hijos. Hay que reconocer también un nodo suelto: sin esa comprobación se
       trataba como objeto de propiedades, Object.keys de un nodo del DOM
       devuelve una lista vacía, y el elemento salía sin contenido y sin error
       ninguno. */
    if (props instanceof Node || Array.isArray(props)
        || typeof props === 'string' || typeof props === 'number') {
      hijos = props; props = {};
    }
    props = props || {};

    const partes = etiqueta.split('.');
    const nodo = document.createElement(partes[0] || 'div');
    if (partes.length > 1) nodo.className = partes.slice(1).join(' ');

    Object.keys(props).forEach(clave => {
      const valor = props[clave];
      if (valor === null || valor === undefined || valor === false) return;
      if (clave === 'onClick') { nodo.addEventListener('click', valor); return; }
      if (clave === 'onInput') { nodo.addEventListener('input', valor); return; }
      if (clave === 'onKeyDown') { nodo.addEventListener('keydown', valor); return; }
      if (clave === 'clase') { nodo.className = (nodo.className + ' ' + valor).trim(); return; }
      if (clave === 'estilo') { Object.assign(nodo.style, valor); return; }
      if (clave === 'texto') { nodo.textContent = valor; return; }
      if (clave === 'valor') { nodo.value = valor; return; }
      if (valor === true) { nodo.setAttribute(clave, ''); return; }
      nodo.setAttribute(clave, valor);
    });

    poner(nodo, hijos);
    return nodo;
  }

  function poner(nodo, hijos) {
    if (hijos === null || hijos === undefined || hijos === false) return;
    if (Array.isArray(hijos)) { hijos.forEach(x => poner(nodo, x)); return; }
    nodo.appendChild(hijos instanceof Node ? hijos : document.createTextNode(String(hijos)));
  }

  /** Vacía un contenedor y le mete lo nuevo. */
  function pintar(contenedor, contenido) {
    contenedor.textContent = '';
    poner(contenedor, contenido);
    return contenedor;
  }

  /* Los botones de la app son <button>: se pueden enfocar con teclado, los lee
     el lector de pantalla y no se seleccionan al mantener el dedo. El type es
     obligatorio porque dentro de un formulario un botón sin type envía. */
  function boton(clases, props, hijos) {
    const nodo = h('button.' + clases, props, hijos);
    nodo.type = 'button';
    return nodo;
  }

  /** Un chip: la unidad de elección de toda la app. */
  function chip(etiqueta, activo, alTocar, clases = '') {
    return boton('chip' + (clases ? ' ' + clases : '') + (activo ? ' activo' : ''),
                 { onClick: alTocar }, etiqueta);
  }

  /** Fila de ajuste: nombre a la izquierda, valor a la derecha, y una raya. */
  function fila(nombre, valor, alTocar, { nota = null, clases = '' } = {}) {
    const izquierda = nota
      ? h('span.fila-texto', [h('span.fila-nombre', nombre), h('span.fila-nota', nota)])
      : h('span.fila-nombre', nombre);
    const derecha = h('span.fila-valor', valor);
    const contenido = [izquierda, derecha];
    return alTocar
      ? boton('fila' + (clases ? ' ' + clases : ''), { onClick: alTocar }, contenido)
      : h('div.fila' + (clases ? '.' + clases.split(' ').join('.') : ''), contenido);
  }

  /** Encabezado de sección: la etiqueta en versalitas y, si hace falta, un
   *  total a la derecha. */
  function seccion(titulo, derecha, clases = '') {
    return h('div.seccion' + (clases ? '.' + clases : ''), [
      h('span.etiqueta', titulo),
      derecha ? h('span.nota', { estilo: { color: 'var(--sec)' } }, derecha) : null
    ]);
  }

  /* -------------------------------------------------------- navegación */

  let pantallaActual = 'mes';
  const alCambiar = [];

  const CON_PESTANAS = ['mes', 'historial', 'fijos', 'ahorro', 'ajustes'];

  function ir(nombre) {
    pantallaActual = nombre;
    document.querySelectorAll('.pantalla').forEach(seccion => {
      seccion.classList.toggle('activa', seccion.id === 'pantalla-' + nombre);
    });
    document.getElementById('tabs').hidden = CON_PESTANAS.indexOf(nombre) === -1;
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('activo', tab.dataset.tab === nombre);
    });
    // Cada pantalla empieza por arriba: heredar el desplazamiento de la
    // anterior deja al usuario en mitad de una lista que no había abierto.
    const desliza = document.querySelector('#pantalla-' + nombre + ' .desliza');
    if (desliza) desliza.scrollTop = 0;
    alCambiar.forEach(f => f(nombre));
  }

  function actual() { return pantallaActual; }
  function cuandoCambie(f) { alCambiar.push(f); }

  /* ---------------------------------------------------------- deshacer */

  let temporizador = null;

  /**
   * La barra de deshacer. Borrar no pregunta —preguntar cada vez cansa más de
   * lo que protege—, así que lo que protege es esto: siete segundos con el
   * borrado a la vista y un botón para revertirlo.
   *
   * Los siete segundos no son un número redondo cualquiera: son los mismos que
   * la ventana de la cola, así que mientras el aviso está en pantalla el
   * borrado todavía no ha salido hacia la hoja.
   */
  function deshacer(texto, alDeshacer) {
    const barra = document.getElementById('deshacer');
    document.getElementById('deshacer-texto').textContent = texto;
    barra.hidden = false;
    const btn = document.getElementById('deshacer-boton');
    btn.onclick = () => { ocultarDeshacer(); alDeshacer(); };
    clearTimeout(temporizador);
    temporizador = setTimeout(ocultarDeshacer, NUCLEO.MS_DESHACER);
  }

  function ocultarDeshacer() {
    clearTimeout(temporizador);
    document.getElementById('deshacer').hidden = true;
  }

  /** La vibración es una cortesía: si el sistema la tiene desactivada o el
   *  navegador no la soporta, no pasa nada y no queremos un error en consola. */
  function vibrar(patron = 15) {
    if (navigator.vibrate) {
      try { navigator.vibrate(patron); } catch (_) { /* da igual */ }
    }
  }

  /* -------------------------------------------------------------- tema */

  /**
   * Aplica el tema y pone el mismo color en la barra del sistema.
   *
   * El <meta name="theme-color"> tiene que seguir al tema activo: si no, al
   * instalar la app la barra de estado se queda del color del tema oscuro
   * mientras la pantalla es papel, y se ve como una franja negra pegada arriba.
   */
  function aplicarTema(tema) {
    const raiz = document.documentElement;
    if (tema === 'claro' || tema === 'oscuro') raiz.setAttribute('data-tema', tema);
    else raiz.removeAttribute('data-tema');

    const oscuro = tema === 'oscuro' ||
      (tema !== 'claro' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', oscuro ? '#14100E' : '#F4F0E8');
  }

  return {
    h, pintar, boton, chip, fila, seccion,
    ir, actual, cuandoCambie,
    deshacer, ocultarDeshacer, vibrar, aplicarTema
  };
})();
