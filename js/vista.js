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
      if (clave === 'onClick') { nodo.addEventListener('click', porGesto(valor)); return; }
      if (clave === 'onInput') { nodo.addEventListener('input', porGesto(valor)); return; }
      if (clave === 'onKeyDown') { nodo.addEventListener('keydown', porGesto(valor)); return; }
      if (clave === 'clase') { nodo.className = (nodo.className + ' ' + valor).trim(); return; }
      if (clave === 'estilo') { Object.assign(nodo.style, valor); return; }
      if (clave === 'texto') { nodo.textContent = valor; return; }
      if (clave === 'valor') { nodo.value = valor; return; }
      if (valor === true) { nodo.setAttribute(clave, ''); return; }
      nodo.setAttribute(clave, valor);
    });

    /* Una zona que se desliza tiene que poder alcanzarse con el teclado. Sin
       tabindex, un bloque con scroll y sin nada pulsable dentro —el Detalle del
       mes— no hay forma de recorrerlo sin ratón ni dedo. */
    if (nodo.classList.contains('desliza')) nodo.tabIndex = 0;

    poner(nodo, hijos);
    return nodo;
  }

  function poner(nodo, hijos) {
    if (hijos === null || hijos === undefined || hijos === false) return;
    if (Array.isArray(hijos)) { hijos.forEach(x => poner(nodo, x)); return; }
    nodo.appendChild(hijos instanceof Node ? hijos : document.createTextNode(String(hijos)));
  }

  /* Lo último que se quiso pintar en un contenedor que tenía el dedo dentro.
     Es un WeakMap y no un objeto porque la clave es el nodo: si la pantalla
     desaparece, la entrada se va con ella. */
  const enEspera = new WeakMap();

  /**
   * Envuelve un manejador para dejar dicho, mientras corre, que lo que pase
   * dentro lo ha pedido la persona.
   *
   * Un repintado dentro de un gesto es justo lo que se acaba de pedir —el
   * buscador filtrando la lista, un chip que se marca— y tiene que verse ya,
   * aunque haya un campo enfocado; quien lo pide se encarga de devolver el
   * foco. Los repintados que llegan solos —la cola que se vacía, una
   * sincronización, un guardado con retraso— son los que no pueden llevarse por
   * delante el campo en el que se está escribiendo.
   *
   * Es un contador y no un booleano porque los gestos se anidan: un manejador
   * que dispara un click sobre otro nodo devolvería el permiso demasiado
   * pronto. Y se suelta en el `finally` síncrono a propósito: si el manejador
   * es asíncrono, lo que ocurra después del primer `await` ya no es el gesto,
   * es lo que llegó luego.
   */
  let gestos = 0;
  function porGesto(fn) {
    return evento => {
      gestos++;
      try { return fn(evento); } finally { gestos--; }
    };
  }

  /* Los dos sitios donde algo se desliza: la columna de cada pantalla, que va en
     vertical, y las tiras de chips, que van en horizontal. */
  const DESLIZANTES = '.desliza, .chips.tira';

  function conScroll(contenedor) {
    const dentro = [].slice.call(contenedor.querySelectorAll(DESLIZANTES));
    // El propio contenedor cuenta si es él quien se desliza: querySelectorAll
    // solo mira hacia abajo.
    return contenedor.matches && contenedor.matches(DESLIZANTES)
      ? [contenedor].concat(dentro) : dentro;
  }

  /* Por dónde va bajada —o corrida— cada una, en orden de aparición.

     El orden basta como identidad porque el árbol se vuelve a construir con el
     mismo código: la tira de categorías sigue siendo la primera y la columna de
     la pantalla, la segunda. */
  function guardarScroll(contenedor) {
    return conScroll(contenedor).map(e => [e.scrollTop, e.scrollLeft]);
  }

  function devolverScroll(contenedor, guardado) {
    const ahora = conScroll(contenedor);
    for (var i = 0; i < ahora.length && i < guardado.length; i++) {
      ahora[i].scrollTop = guardado[i][0];
      ahora[i].scrollLeft = guardado[i][1];
    }
  }

  /* ¿Está la persona escribiendo dentro de este contenedor? Sólo cuentan los
     campos de texto: una casilla o un botón enfocados se pueden repintar sin
     que nadie note nada. */
  function tecleandoEn(contenedor) {
    const dedo = document.activeElement;
    if (!dedo || (dedo.tagName !== 'INPUT' && dedo.tagName !== 'TEXTAREA')) return false;
    if (['checkbox', 'radio', 'button', 'submit'].indexOf(dedo.type) !== -1) return false;
    return dedo !== contenedor && contenedor.contains(dedo);
  }

  /**
   * Vacía un contenedor y le mete lo nuevo. Salvo que dentro haya un dedo
   * escribiendo: entonces espera a que salga del campo.
   *
   * Repintar destruye los nodos, y con ellos el input enfocado. En el móvil eso
   * cierra el teclado a media palabra y el campo vuelve a salir con lo último
   * que se guardó —una letra, si el guardado iba por detrás—. Pasaba
   * escribiendo el nombre de una meta, pero le pasa igual a cualquier campo de
   * una pantalla que se repinte sola: los nombres de Quiénes, una categoría
   * nueva, la descripción de un gasto, el token de la conexión. Basta con que
   * la cola se vacíe o entre una sincronización mientras se teclea.
   *
   * Devolver el foco después de repintar no sirve: el teclado del móvil sólo se
   * abre con un gesto de la persona, así que un `focus()` a mano deja el cursor
   * puesto y el teclado cerrado. La única manera de no cerrarlo es no destruir
   * el input.
   *
   * Lo aplazado no se pierde: se guarda y se pinta en cuanto el campo pierde el
   * foco, así que la pantalla nunca se queda atrás más de lo que dura escribir.
   *
   * Y por lo mismo se guarda y se devuelve el desplazamiento: repintar
   * reconstruye la columna que se desliza, y una columna recién hecha empieza
   * por arriba. Bajabas hasta la conexión, tocabas un interruptor y Ajustes se
   * te iba otra vez al principio; en Anotar, la tira de categorías volvía a la
   * izquierda justo después de elegir una de las últimas.
   *
   * Esto no pisa el «cada pantalla empieza por arriba» de ir(): allí el
   * desplazamiento se pone a cero ANTES, sobre los nodos que todavía existen,
   * así que lo que se guarda aquí ya es cero.
   */
  function pintar(contenedor, contenido) {
    if (!gestos && tecleandoEn(contenedor)) {
      /* Un solo vigilante por contenedor aunque lleguen veinte repintados:
         sobrescribir lo que espera basta, y se queda el último. */
      if (!enEspera.has(contenedor)) {
        document.activeElement.addEventListener('blur', () => {
          /* Un setTimeout porque durante el blur el foco aún no ha llegado a su
             destino: sin él, tocar el campo de al lado parece salir de la
             pantalla y el repintado se comería ese segundo campo. */
          setTimeout(() => {
            const ultimo = enEspera.get(contenedor);
            if (!ultimo) return;
            enEspera.delete(contenedor);
            pintar(contenedor, ultimo);
          }, 0);
        }, { once: true });
      }
      enEspera.set(contenedor, contenido);
      return contenedor;
    }

    enEspera.delete(contenedor);
    const scroll = guardarScroll(contenedor);
    contenedor.textContent = '';
    poner(contenedor, contenido);
    devolverScroll(contenedor, scroll);
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

  /**
   * El color de una tarjeta de crédito: el de su dueño, rebajado.
   *
   * Sólido significa "gastado este mes"; claro, "factura que llega de otro
   * mes". La mezcla va hacia el papel en claro y hacia la tinta en oscuro:
   * mezclar siempre hacia el fondo deja el tramo casi igual que `hair`, que en
   * esta barra significa justo lo contrario —lo que NO se ha gastado—, y en
   * modo oscuro la tarjeta desaparecía.
   *
   * Lo hace `color-mix` y no aritmética de hexadecimales a mano porque el
   * navegador ya sabe mezclar colores y porque así la mezcla se recalcula sola
   * al cambiar de tema, sin repintar nada.
   */
  function rebajado(color) {
    return 'color-mix(in srgb, ' + color + ' 34%, var(--rebaja))';
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
    mostrarBarra(barra);
    const btn = document.getElementById('deshacer-boton');
    btn.hidden = false;          // avisar() lo esconde; aquí vuelve a hacer falta
    btn.onclick = () => { ocultarDeshacer(); alDeshacer(); };
    clearTimeout(temporizador);
    temporizador = setTimeout(ocultarDeshacer, NUCLEO.MS_DESHACER);
  }

  /* La barra entra deslizando y sale colapsando su alto, y las dos cosas las
     hace el CSS. Aquí solo se quita y se pone la clase, con un detalle: hay
     que quitarla ANTES de enseñarla otra vez, o el navegador reutiliza la
     animación de salida que ya estaba puesta y la barra nueva aparece
     desvaneciéndose. */
  const MS_SALIDA = 300;
  let saliendo = null;

  function mostrarBarra(barra) {
    clearTimeout(saliendo);
    barra.classList.remove('saliendo');
    barra.hidden = false;
  }

  function ocultarDeshacer() {
    clearTimeout(temporizador);
    const barra = document.getElementById('deshacer');
    if (barra.hidden || barra.classList.contains('saliendo')) return;
    barra.classList.add('saliendo');
    saliendo = setTimeout(() => {
      barra.hidden = true;
      barra.classList.remove('saliendo');
    }, MS_SALIDA);
  }

  /**
   * La misma barra, sin botón, para contar cómo ha ido algo que has pedido tú.
   *
   * Existe porque «Reintentar» no decía nada. Los envíos se reintentaban de
   * verdad, fallaban con un motivo que el backend explicaba, y la pantalla se
   * quedaba igual: parecía un botón roto cuando lo roto era el silencio.
   *
   * Un fallo se queda más tiempo que un acierto: si algo ha ido mal hay que
   * poder leerlo entero.
   */
  function avisar(texto, { mal = false } = {}) {
    const barra = document.getElementById('deshacer');
    document.getElementById('deshacer-texto').textContent = texto;
    document.getElementById('deshacer-boton').hidden = true;
    mostrarBarra(barra);
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      document.getElementById('deshacer-boton').hidden = false;
      ocultarDeshacer();
    }, mal ? 9000 : 3000);
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
    h, pintar, boton, chip, fila, seccion, rebajado,
    ir, actual, cuandoCambie,
    deshacer, ocultarDeshacer, avisar, vibrar, aplicarTema
  };
})();
