/**
 * El widget 4×2 de la pantalla de inicio.
 *
 * Esta página no la abre nadie con el dedo: la carga una `WebView` de fuera de
 * la pantalla, dentro de una app Android diminuta, que espera a que el título
 * diga «listo», hace una captura y la cuelga del escritorio. Todo lo que hay en
 * `android/` es eso y nada más.
 *
 * **Por qué es una página y no Kotlin.** Los números del widget son los mismos
 * que los de la pantalla Mes: lo que entra, lo gastado, lo que falta por cobrar
 * y en qué punto queda el ahorro esperado. Escribirlos otra vez en Kotlin dejaba
 * TRES sitios donde decidir de qué mes es una compra —la app, el backend y el
 * widget—, y este proyecto ya ha pagado dos veces por tener solo dos que no
 * coincidían. Aquí se llama a `ESTADO.resumen()`, el de verdad, y el widget no
 * calcula nada: pinta.
 *
 * Por eso `estado.js` no puede tocar el DOM —no lo toca, ni una vez— y por eso
 * este archivo carga los mismos cuatro globales que la app y en el mismo orden.
 */
const WIDGET = (() => {

  /* El diseño está dibujado en una caja de 336 × 172. No son píxeles: son dp, y
     el launcher pide el tamaño real, que en un móvil de tres veces la densidad
     son 1008 × 516. La caja se dibuja siempre igual y se escala al final. */
  const ANCHO = 336;
  const ALTO = 172;

  /**
   * Lo que manda la app Android, en el fragmento de la URL.
   *
   * En el fragmento y no en la query a propósito: el `#` no viaja en la
   * petición, así que el token no acaba en el registro de ningún servidor ni en
   * el `Referer` de nada. Es el mismo token que ya está en Ajustes, pero esta
   * WebView tiene su propio almacén y no ve el de Chrome.
   */
  function opciones() {
    const p = new URLSearchParams(location.hash.slice(1));
    const n = (clave, porDefecto) => Number(p.get(clave)) || porDefecto;
    return {
      endpoint: p.get('endpoint') || '',
      token: p.get('token') || '',
      // El widget sigue al sistema: en el escritorio no hay dónde poner un
      // interruptor de tema, así que el de Ajustes no pinta nada aquí.
      tema: p.get('tema') === 'oscuro' ? 'oscuro' : 'claro',
      ancho: n('ancho', ANCHO),
      alto: n('alto', ALTO),
      radio: n('radio', 28)
    };
  }

  /**
   * El mismo rebajado que `VISTA.rebajado`, que aquí no se puede importar:
   * `vista.js` construye nodos y navega entre pantallas, y en esta página no hay
   * ninguna. Es una línea, pero es una línea duplicada, así que
   * `pruebas/widget-4x2.mjs` compara las dos y falla si alguien toca una sola.
   */
  function rebajado(color) {
    return 'color-mix(in srgb, ' + color + ' 34%, var(--rebaja))';
  }

  /**
   * Los tramos de la barra, en el orden del diseño:
   *
   *   persona 1 · su tarjeta · persona 2 · su tarjeta · por venir · (pista)
   *
   * La tarjeta de cada uno va pegada a su tramo sólido para que se lea de un
   * vistazo cuánto pesa esa persona en total. Es la misma construcción que
   * `js/mes.js`, recorte incluido: sin él, un mes en el que ya se ha gastado
   * todo empuja el tramo de «por venir» fuera de la barra y la barra dice «vas
   * bien» justo debajo de una cifra en rojo.
   */
  function tramosDe(r) {
    const usado = r.porPersona.reduce((a, p) => a + p.parte + p.parteTarjeta, 0);
    const porVenir = Math.max(0, Math.min(100 - usado, r.pctPorVenir));
    const tramos = [];
    r.porPersona.forEach(p => {
      if (p.parte > 0) tramos.push({ ancho: p.parte, color: p.color });
      if (p.parteTarjeta > 0) tramos.push({ ancho: p.parteTarjeta, color: rebajado(p.color) });
    });
    if (porVenir > 0) tramos.push({ ancho: porVenir, color: 'var(--acc)' });
    return tramos;
  }

  /**
   * Las entradas de la leyenda, en el orden en que las va a colocar la rejilla.
   *
   * Se genera sola: quien no tiene factura de tarjeta pendiente no saca entrada
   * `TC`, y si no queda ningún fijo por cobrar tampoco sale «Por venir». Con dos
   * personas y las dos cosas son seis, que es justo lo que cabe.
   */
  function leyendaDe(r) {
    const entradas = r.porPersona.map(p => ({ nombre: p.nombre, color: p.color }));

    if (r.porPersona.length > 2) {
      /* Con tres o cuatro personas, seis entradas ya no caben. Las tarjetas se
         juntan en una sola neutra y el desglose se queda en la app, que es
         donde hay sitio para leerlo. */
      if (r.porPersona.some(p => p.tarjeta > 0)) {
        entradas.push({ nombre: 'Tarjetas', color: 'var(--faint)' });
      }
    } else {
      r.porPersona.forEach(p => {
        if (p.tarjeta > 0) entradas.push({ nombre: 'TC ' + p.nombre, color: rebajado(p.color) });
      });
    }

    if (r.porVenir > 0) entradas.push({ nombre: 'Por venir', color: 'var(--acc)' });
    entradas.push({ nombre: 'Disponible', pista: true });
    return entradas;
  }

  /* -------------------------------------------------------------- pintar */

  function nodo(etiqueta, clase, texto) {
    const e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function pintarCartel({ r, dia, total, viejo, vacio }) {
    const caja = document.getElementById('widget');
    caja.innerHTML = '';
    caja.classList.toggle('viejo', Boolean(viejo));

    /* Encabezado. Cuando los datos son de otro día lo dice aquí en vez del día
       del mes: el día del mes de una lectura vieja es exactamente la clase de
       dato que parece fresco y no lo es. */
    const cabecera = nodo('div', 'w-cabecera');
    cabecera.appendChild(nodo('span', 'w-titulo', 'Saldo disponible'));
    /* El estado vacío no trae día: se llega a él también cuando `ESTADO`
       ha reventado, y pedirle la fecha otra vez sería volver a tropezar. */
    if (!vacio) {
      cabecera.appendChild(nodo('span', 'w-dia',
        viejo ? 'ACTUALIZADO AYER' : 'DÍA ' + dia + ' DE ' + total));
    }
    caja.appendChild(cabecera);

    if (vacio) {
      const cifra = nodo('div', 'w-cifra vacia');
      cifra.appendChild(nodo('span', 'w-monto', '—'));
      caja.appendChild(cifra);
      caja.appendChild(nodo('div', 'w-vacio', 'Abre la app para empezar'));
      return;
    }

    /* La cifra. El símbolo va aparte porque se pinta más pequeño, y el menos es
       el tipográfico que ya usa `FMT.dinero`: a 44px el guion del teclado se lee
       como un guion de partir palabras. */
    const cifra = nodo('div', 'w-cifra');
    if (r.queda < 0 || r.bajoAhorro) cifra.classList.add('acento');
    cifra.appendChild(nodo('span', 'w-signo', (r.queda < 0 ? '−' : '') + (CONFIG.SIMBOLO || '$')));
    cifra.appendChild(nodo('span', 'w-monto', FMT.miles(Math.abs(r.queda))));
    caja.appendChild(cifra);

    /* La barra. */
    const barra = nodo('div', 'w-barra');
    tramosDe(r).forEach(t => {
      const d = nodo('div');
      d.style.background = t.color;
      d.style.width = t.ancho.toFixed(1) + '%';
      barra.appendChild(d);
    });
    if (r.ahorroEsperado > 0 && r.entra > 0) {
      const marca = nodo('span', 'w-marca');
      marca.style.left = r.pctAhorro.toFixed(1) + '%';
      barra.appendChild(marca);
    }
    caja.appendChild(barra);

    /* La leyenda. */
    const leyenda = nodo('div', 'w-leyenda');
    leyendaDe(r).forEach(e => {
      const span = nodo('span');
      const cuadro = nodo('i', e.pista ? 'pista' : '');
      if (!e.pista) cuadro.style.background = e.color;
      span.appendChild(cuadro);
      span.appendChild(document.createTextNode(e.nombre));
      leyenda.appendChild(span);
    });
    caja.appendChild(leyenda);
  }

  /** El marco al tamaño de verdad, y la caja de dentro escalada hasta llenarlo. */
  function ajustar(o) {
    const escala = o.ancho / ANCHO;
    const marco = document.querySelector('.marco');
    const caja = document.getElementById('widget');
    marco.style.width = o.ancho + 'px';
    marco.style.height = o.alto + 'px';
    /* El alto se reparte en vez de dejar una franja vacía: si alguien estira el
       widget a lo alto, el `space-between` separa encabezado, cifra y leyenda en
       lugar de dejar la caja flotando arriba. */
    caja.style.height = (o.alto / escala) + 'px';
    caja.style.transform = 'scale(' + escala + ')';
    caja.style.setProperty('--radio', (o.radio / escala) + 'px');
  }

  /* ------------------------------------------------------------- arranque */

  /**
   * Trae los números y pinta. Devuelve lo pintado, que es lo que mira la prueba.
   *
   * Nunca lanza: un widget que revienta deja un rectángulo en blanco pegado al
   * escritorio hasta la siguiente actualización, media hora después. Ante
   * cualquier cosa rara, el estado vacío, que al menos dice qué hacer.
   */
  async function pintar() {
    const o = opciones();
    document.documentElement.dataset.tema = o.tema;
    ajustar(o);

    let pintado = { vacio: true };
    try {
      await ESTADO.iniciar();
      if (o.endpoint && o.token) {
        await ESTADO.guardarAjustes({ endpoint: o.endpoint, token: o.token });
      }
      const alDia = await ESTADO.sincronizar({ silencioso: true });

      /* ¿Hay algún mes que enseñar? El recién leído, o el que quedó guardado la
         última vez que sí hubo red — enseñar ese es justo lo que hace que el
         widget siga sirviendo sin cobertura.

         Preguntárselo a `datos.hoy` no vale, aunque lo ponga la hoja en cada
         lectura: la semilla de `estado.js` ya lo trae relleno con la fecha del
         teléfono, así que siempre contesta que sí y el estado vacío no se veía
         nunca. Lo que de verdad distingue «no hay datos» de «hay datos viejos»
         es si hay algo guardado. */
      const guardado = await NUCLEO.leerMes();
      if (!alDia && !guardado) {
        pintado = { vacio: true };
      } else {
        const mes = ESTADO.mesEnCurso();
        pintado = {
          r: ESTADO.resumen(mes),
          dia: Number(ESTADO.hoy().slice(8)),
          total: FMT.diasDelMes(mes),
          /* Sin red se pinta lo último que se guardó, pero solo se llama viejo
             si además es de otro día: una lectura fallida a las diez de la
             mañana sobre datos de las nueve no engaña a nadie. */
          viejo: !alDia && ESTADO.hoy() < FMT.iso(),
          vacio: false
        };
      }
    } catch (error) {
      pintado = { vacio: true };
    }

    pintarCartel(pintado);
    avisarDeQueEstá();
    return pintado;
  }

  /**
   * «Ya puedes hacer la captura».
   *
   * Por el título porque es lo que una `WebView` sabe contar sin que le pongas
   * un puente: `onReceivedTitle` llega sola. El puente se usa además si está,
   * porque el título puede llegar antes de que el navegador haya pintado el
   * fotograma y el puente se llama después de dos `requestAnimationFrame`.
   */
  function avisarDeQueEstá() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.title = 'listo';
      if (window.Android && typeof window.Android.listo === 'function') {
        window.Android.listo();
      }
    }));
  }

  document.addEventListener('DOMContentLoaded', pintar);

  return { pintar, tramosDe, leyendaDe, rebajado };
})();
