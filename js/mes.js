/**
 * Mes, Historial y el detalle de un movimiento.
 *
 * Las tres van juntas porque son la misma pregunta a distinta distancia: cómo
 * va el mes, qué se anotó, y qué fue exactamente ese apunte.
 */
const MES = (() => {

  const { h, boton, chip, fila, seccion } = VISTA;

  /* Qué mes se está mirando. El actual, o uno cerrado si has tocado la flecha
     izquierda. Los cerrados son de solo lectura: ya están escritos en la hoja. */
  let mesVisto = null;
  let filtro = '';        // '' es todas las personas
  let busca = '';
  let seleccionado = null;

  /**
   * Los meses a los que se puede llegar con las flechas, del más nuevo al más
   * viejo.
   *
   * Son tres cosas: el mes en curso, los que están cerrados, y CUALQUIERA que
   * tenga movimientos. Lo tercero faltaba, y era un agujero: el backend manda
   * doce meses de movimientos, así que un mes pasado con gastos que nunca se
   * cerró estaba en memoria y no había forma de llegar a él.
   *
   * Los meses vacíos no salen, y es a propósito: pasar por siete pantallas en
   * blanco para llegar a enero no enseña nada que no diga ya la hoja. Un mes
   * aparece en cuanto tiene algo dentro.
   *
   * Sin repetidos, además: al cerrar el mes a mano el que está en curso y el
   * recién cerrado son el mismo, y la lista lo traía dos veces —la flecha
   * izquierda quedaba encendida apuntando a donde ya estabas.
   */
  function mesesDisponibles() {
    const { datos } = ESTADO.estado();
    const meses = new Set([ESTADO.mesEnCurso()]);
    datos.cierres.forEach(c => meses.add(FMT.aMes(c.mes)));
    datos.movimientos.forEach(m => meses.add(FMT.mesDe(m.fecha)));
    return [...meses].filter(Boolean).sort().reverse();
  }

  function verMes(mes) { mesVisto = mes; pintarMes(); }

  /* Al entrar se enseña el mes en curso, no el primero de la lista: un
     movimiento con fecha futura pondría su mes el primero y la app abriría en
     un mes que todavía no ha empezado. */
  function mesActual() {
    return mesesDisponibles().indexOf(mesVisto) === -1 ? ESTADO.mesEnCurso() : mesVisto;
  }

  /* ------------------------------------------------------------- banners

     De cero a cuatro, apilados y en orden de urgencia. Son la única parte de
     la pantalla que aparece y desaparece sola, así que van arriba del todo:
     un aviso que se cuela entre dos cifras las desplaza y se lee como un
     error de maquetación. */
  /**
   * Reintentar a mano y CONTAR el resultado.
   *
   * Un botón que no dice nada al pulsarlo se lee como un botón roto, aunque por
   * dentro haya hecho su trabajo. Aquí siempre sale una respuesta: cuántas han
   * salido, o por qué no ha podido ninguna.
   */
  async function reintentar() {
    const r = await APP.vaciarCola({ aMano: true });
    if (r.enviados && !r.quedan) {
      VISTA.avisar(r.enviados === 1 ? 'Enviada.' : r.enviados + ' enviadas.');
    } else if (r.motivo) {
      VISTA.avisar('No se pudo enviar: ' + r.motivo, { mal: true });
    } else if (r.quedan) {
      VISTA.avisar(r.quedan + ' siguen en cola.', { mal: true });
    } else {
      VISTA.avisar('No queda nada por enviar.');
    }
  }

  function banners() {
    const { datos, pendientes, enLinea, ultimoFallo } = ESTADO.estado();
    const mes = ESTADO.mesEnCurso();
    const r = ESTADO.resumen(mes);
    const lista = [];

    if (!enLinea || pendientes) {
      const cuantas = pendientes + (pendientes === 1 ? ' anotación' : ' anotaciones');

      /* El motivo, cuando lo hay, va en el propio aviso.
       *
       * Antes decía "3 anotaciones sin enviar" y nada más. El backend explica
       * en claro por qué las rechaza —un despliegue viejo que no entiende la
       * petición, un token cambiado— y ese texto se guardaba en la cola sin que
       * lo leyera nadie: había que ir a buscarlo al registro de ejecuciones de
       * Google. Y al pulsar Reintentar no pasaba nada visible, así que el botón
       * parecía roto cuando lo roto era el silencio. */
      const texto = !enLinea
        ? 'Sin conexión. ' + (pendientes ? cuantas + ' en cola.' : 'Lo que anotes se enviará luego.')
        : cuantas + ' sin enviar' + (ultimoFallo ? ': ' + ultimoFallo : '.');

      lista.push({
        urgente: true,
        texto: texto,
        accion: 'Reintentar',
        al: reintentar
      });
    }

    const avisos = datos.config.avisos || {};
    const hoyISO = ESTADO.hoy();
    if (avisos.fijo !== false) {
      const deHoy = ESTADO.fijosDelMes(mes, 'Gasto')
        .filter(f => !ESTADO.cargadoEn(f, mes) && ESTADO.diaDeCargo(f, mes) === hoyISO);
      if (deHoy.length) {
        lista.push({
          texto: 'Hoy sale ' + deHoy[0].concepto + ' · ' + FMT.dinero(deHoy[0].importe) + '.',
          accion: 'Marcar',
          al: () => ESTADO.marcarFijo(deHoy[0].uuid, mes, true)
        });
      }
    }

    if (avisos.saldo !== false && r.queda < (Number(datos.config.limite) || 0)) {
      lista.push({
        urgente: true,
        texto: 'Quedan ' + FMT.dinero(r.queda) + ', por debajo de tu límite de '
             + FMT.dinero(datos.config.limite) + '.',
        accion: 'Ver plan',
        al: () => VISTA.ir('ajustes')
      });
    }

    const total = FMT.diasDelMes(mes);
    const dia = Number(hoyISO.slice(8));
    if (dia >= total - 1) {
      const faltan = total - dia;
      lista.push({
        texto: FMT.cap(FMT.nombreMes(mes))
             + (faltan <= 0 ? ' termina hoy' : faltan === 1 ? ' termina mañana' : ' termina en ' + faltan + ' días')
             + '. Se cierra solo esta noche.',
        accion: 'Cerrar ya',
        al: () => AHORRO.cerrarMesYRepartir(mes)
      });
    }

    return lista.map(b => h('div.banner' + (b.urgente ? '.urgente' : ''), [
      h('span.banner-texto', b.texto),
      boton('banner-accion', { onClick: b.al }, b.accion)
    ]));
  }

  /* ----------------------------------------------------------- pantalla */

  function pintarMes() {
    const mes = mesActual();
    const disponibles = mesesDisponibles();
    const i = disponibles.indexOf(mes);
    const cerrado = ESTADO.estado().datos.cierres.find(c => c.mes === mes) || null;

    const cabeza = h('div.cabeza', [
      h('div.mes-nav', [
        boton('flecha', {
          disabled: i >= disponibles.length - 1,
          onClick: () => verMes(disponibles[Math.min(disponibles.length - 1, i + 1)])
        }, '‹'),
        h('h2.titulo', FMT.cap(FMT.nombreMes(mes))),
        boton('flecha', {
          disabled: i <= 0,
          onClick: () => verMes(disponibles[Math.max(0, i - 1)])
        }, '›')
      ]),
      h('span.etiqueta.corta', cerrado
        ? 'cerrado'
        : 'día ' + Number(ESTADO.hoy().slice(8)) + ' de ' + FMT.diasDelMes(mes))
    ]);

    VISTA.pintar(document.getElementById('pantalla-mes'),
      [cabeza, cerrado ? cuerpoCerrado(cerrado) : cuerpoEnCurso(mes)]);
  }

  function cuerpoEnCurso(mes) {
    const r = ESTADO.resumen(mes);
    const fijos = ESTADO.fijosDelMes(mes, 'Gasto')
      .slice()
      .sort((a, b) => (Number(a.dia) || 0) - (Number(b.dia) || 0));
    const sinCargar = fijos.filter(f => !ESTADO.cargadoEn(f, mes)).length;

    /* La barra: un tramo por persona con lo que ha gastado y, al final, en
       acento, lo que todavía tiene que salir. El tramo de "por venir" se
       recorta a lo que quede libre para que la suma no se pase del 100 % y el
       último tramo desborde la barra. */
    const usado = r.porPersona.reduce((a, p) => a + p.parte, 0);
    const partePorVenir = r.plan
      ? Math.max(0, Math.min(100 - usado, (r.porVenir / r.plan) * 100))
      : 0;

    const saldo = h('div.saldo' + (r.queda < 0 ? '.negativo' : ''), [
      h('span.etiqueta', 'Saldo disponible'),
      h('div.saldo-cifra', [
        h('span.saldo-signo', r.queda < 0 ? '−' + (CONFIG.SIMBOLO || '$') : (CONFIG.SIMBOLO || '$')),
        h('span.saldo-numero', FMT.miles(r.queda))
      ]),
      h('div.barra', r.porPersona.map(p =>
        h('div', { estilo: { background: p.color, width: p.parte.toFixed(1) + '%' } })
      ).concat([
        h('div', { estilo: { background: 'var(--acc)', width: partePorVenir.toFixed(1) + '%' } })
      ])),
      h('div.leyenda', [
        h('span', FMT.dinero(r.gastado) + ' gastado'),
        h('span', [h('span.cuadro'), FMT.dinero(r.porVenir) + ' por venir']),
        h('span', FMT.dinero(r.plan) + ' plan')
      ])
    ]);

    /* Con un número impar de personas la rejilla de dos columnas dejaría ver
       el fondo gris en el hueco de la última fila. La celda vacía lo tapa. */
    const celdas = r.porPersona.map(p => h('div.persona', [
      h('div.persona-nombre', [
        h('span.marca', { estilo: { background: p.color } }),
        h('span.etiqueta.corta', p.nombre)
      ]),
      h('span.persona-total', FMT.dinero(p.total)),
      h('span.persona-detalle',
        p.cuantos + (p.cuantos === 1 ? ' cargo · ' : ' cargos · ') + p.parte.toFixed(0) + '%')
    ]));
    if (celdas.length % 2) celdas.push(h('div.persona'));

    return h('div.desliza', [
      banners(),
      saldo,
      h('div.personas', celdas),
      h('div.reparto-linea', [
        h('span.etiqueta.corta', 'Común ' + FMT.dinero(r.comun)),
        h('span.etiqueta.corta', 'Personal ' + FMT.dinero(r.personal))
      ]),
      seccion('Fijos de ' + FMT.nombreMes(mes),
              sinCargar === 0 ? 'todos cargados' : sinCargar + ' sin cargar', 'pegada'),
      h('div.margen', fijos.map(f => {
        const cargado = ESTADO.cargadoEn(f, mes);
        return h('div.fijo-mes' + (cargado ? '' : '.pendiente'), [
          h('span.fijo-dia', String(Number(f.dia) || 1).padStart(2, '0')),
          h('div.fila-texto', [
            h('span.fila-nombre', f.concepto),
            h('span.fila-nota', FMT.frecuencia(Number(f.cada) || 1)
              + (f.cuotas ? ' · quedan ' + f.restantes : ''))
          ]),
          h('span.fijo-importe', FMT.dinero(f.importe) + (cargado ? ' ✓' : ''))
        ]);
      })),
      h('div.respiro')
    ]);
  }

  /** Un mes cerrado no se edita ni se recalcula: se lee. Lo que enseña es lo
   *  que quedó escrito en la hoja el día que se cerró. */
  function cuerpoCerrado(cierre) {
    const movs = ESTADO.movimientosDe(cierre.mes);
    return h('div.desliza', [
      h('div.saldo.lectura', [
        h('span.etiqueta', 'Ahorrado ese mes'),
        h('div.saldo-cifra', [
          h('span.saldo-signo', (cierre.ahorrado < 0 ? '−' : '') + (CONFIG.SIMBOLO || '$')),
          h('span.saldo-numero', FMT.miles(cierre.ahorrado))
        ])
      ]),
      h('div.margen', [
        fila('Entró', h('span.cifra', FMT.dinero(cierre.entrado)), null, { clases: 'alta' }),
        fila('Salió', h('span.cifra', FMT.dinero(cierre.gastado)), null, { clases: 'alta' }),
        fila('Plan de ese mes', h('span.cifra', FMT.dinero(cierre.plan)), null, { clases: 'alta' })
      ]),
      /* Aquí sí entran las filas que escribieron los fijos, al revés que en el
         Historial. Un mes cerrado se mira para auditarlo, y una lista que se
         dejara fuera el arriendo no explicaría el "Salió" que tiene justo
         encima. Por eso tampoco se llama "lo anotado": no lo anotó nadie. */
      seccion('Todo lo del mes'),
      h('div.margen', movs.map(m => h('div.mov', [
        h('span.mov-nombre', m.categoria),
        h('span.mov-importe' + (m.tipo === 'Ingreso' ? '.entra' : ''),
          FMT.dinero(m.importe, { conSigno: m.tipo === 'Ingreso' })),
        h('span.mov-meta', (m.descripcion ? m.descripcion + ' · ' : '')
          + 'día ' + Number(m.fecha.slice(8)) + ' · ' + m.persona)
      ]))),
      h('p.nota.margen', { estilo: { marginTop: '14px', marginBottom: '20px' } },
        FMT.cap(FMT.nombreMesAnio(cierre.mes)) + ' quedó cerrado y su Total Ahorrado ya está '
        + 'escrito en la hoja. No se puede editar desde aquí.'),
      h('div.respiro')
    ]);
  }

  /* ---------------------------------------------------------- historial */

  function pintarHistorial() {
    const mes = ESTADO.mesEnCurso();
    const { datos } = ESTADO.estado();
    const q = busca.trim().toLowerCase();

    /* Solo lo anotado a mano. Las filas que escriben los fijos ya están
       contadas en el mes y tienen su propia pestaña; repetirlas aquí llenaría
       el historial de cargos que nadie tecleó y que no se editan desde aquí. */
    const filtrados = ESTADO.movimientosDe(mes)
      .filter(m => m.origen !== 'fijo')
      .filter(m => !filtro || m.persona === filtro)
      .filter(m => !q || (m.categoria + ' ' + (m.descripcion || '')).toLowerCase().indexOf(q) !== -1)
      .slice()
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    /* Agrupado por día, con el subtotal del día a la derecha. El subtotal solo
       suma gastos: mezclar el sueldo con la compra daría un número que no
       significa nada. */
    const grupos = [];
    filtrados.forEach(m => {
      let g = grupos.find(x => x.fecha === m.fecha);
      if (!g) { g = { fecha: m.fecha, items: [], suma: 0 }; grupos.push(g); }
      g.items.push(m);
      if (m.tipo === 'Gasto') g.suma += Number(m.importe) || 0;
    });

    const filtros = [{ nombre: 'Todo', valor: '' }]
      .concat(datos.personas.map(p => ({ nombre: p.nombre, valor: p.nombre })));

    const entrada = h('input.entrada.busca', {
      valor: busca,
      placeholder: 'Buscar por categoría o descripción',
      onInput: e => { busca = e.target.value; pintarHistorial(); e.target.focus(); }
    });

    VISTA.pintar(document.getElementById('pantalla-historial'), [
      h('div.cabeza', [
        h('h2.titulo', FMT.cap(FMT.nombreMes(mes))),
        h('span.nota', { estilo: { color: 'var(--sec)', fontSize: '12px' } },
          filtrados.length + (filtrados.length === 1 ? ' movimiento' : ' movimientos'))
      ]),
      h('div.margen.regla', { estilo: { padding: '10px 26px' } },
        h('div.chips.apretados', filtros.map(f =>
          chip(f.nombre, filtro === f.valor, () => { filtro = f.valor; pintarHistorial(); }, 'filtro')))),
      h('div.margen.regla', { estilo: { padding: '10px 26px' } }, entrada),
      h('div.desliza.margen', [
        filtrados.length ? null : h('div.vacio-lista', [
          h('span.titulo', 'Nada anotado todavía'),
          h('span.nota.suelta', filtro
            ? 'Nada anotado por ' + filtro + ' este mes.'
            : 'Los fijos de ' + FMT.nombreMes(mes) + ' ya están contados en el mes. '
              + 'Aquí aparece lo que anotes a mano.'),
          boton('boton tinta', { onClick: () => ANOTAR.abrir() }, 'Anotar el primero')
        ]),
        grupos.map(g => h('div', [
          h('div.grupo-dia', [
            h('span.etiqueta', FMT.etiquetaDia(g.fecha, ESTADO.hoy())),
            h('span.grupo-total', FMT.dinero(g.suma))
          ]),
          g.items.map(m => boton('mov', { onClick: () => abrirDetalle(m.uuid) }, [
            h('span.mov-nombre', m.categoria),
            h('span.mov-importe' + (m.tipo === 'Ingreso' ? '.entra' : ''),
              FMT.dinero(m.importe, { conSigno: m.tipo === 'Ingreso' })),
            h('span.mov-meta', (m.descripcion ? m.descripcion + ' · ' : '')
              + m.cuenta + ' · ' + m.persona)
          ]))
        ])),
        h('div.respiro')
      ])
    ]);

    // Escribir en el buscador repinta la lista entera, y repintar destruye el
    // input: hay que devolverle el foco y el cursor donde estaba.
    if (document.activeElement !== entrada && q) {
      entrada.focus();
      entrada.setSelectionRange(busca.length, busca.length);
    }
  }

  /* ------------------------------------------------------------ detalle */

  function abrirDetalle(uuid) {
    seleccionado = uuid;
    pintarDetalle();
    VISTA.ir('detalle');
  }

  function pintarDetalle() {
    const { datos } = ESTADO.estado();
    const m = datos.movimientos.find(x => x.uuid === seleccionado);
    if (!m) return;

    const siguiente = (lista, actual) => lista[(lista.indexOf(actual) + 1) % lista.length];

    VISTA.pintar(document.getElementById('pantalla-detalle'), [
      h('div.cabeza-hoja', [
        boton('salir', { onClick: () => VISTA.ir('historial') }, 'Cerrar'),
        h('span.etiqueta', m.tipo)
      ]),
      h('div.margen.regla-fuerte', { estilo: { padding: '26px 26px 18px' } }, [
        h('div.saldo-cifra', [
          h('span.saldo-signo', { estilo: { color: 'var(--mut)', fontSize: '28px' } }, CONFIG.SIMBOLO || '$'),
          h('span.saldo-numero', { estilo: { fontSize: '52px' } }, FMT.miles(m.importe))
        ]),
        h('p', { estilo: { marginTop: '10px', fontSize: '14px' } },
          m.descripcion ? m.categoria + ' · ' + m.descripcion : m.categoria),
        h('p.nota', { estilo: { marginTop: '4px', fontSize: '12px' } },
          FMT.etiquetaDia(m.fecha, ESTADO.hoy()).toLowerCase() + ' · ' + m.cuenta + ' · '
          + m.persona + ' · ' + (m.reparto === 'Común' ? 'común' : 'personal'))
      ]),
      h('div.margen', [
        fila('Cambiar importe', 'teclado ›', () => ANOTAR.editarMovimiento(m), { clases: 'alta' }),
        fila('Cuenta', m.cuenta + ' ›',
          () => ESTADO.editarMovimiento(m.uuid, { cuenta: siguiente(datos.cuentas, m.cuenta) }),
          { clases: 'alta' }),
        fila('Quién lo anotó', m.persona + ' ›',
          () => ESTADO.editarMovimiento(m.uuid, {
            persona: siguiente(datos.personas.map(p => p.nombre), m.persona) }),
          { clases: 'alta' }),
        fila('Convertir en fijo', '›', () => ANOTAR.desdeMovimiento(m), { clases: 'alta' })
      ]),
      h('div.pie', boton('boton peligro', { onClick: () => borrar(m) }, 'Borrar movimiento'))
    ]);
  }

  async function borrar(m) {
    const restaurar = await ESTADO.borrarMovimiento(m.uuid);
    VISTA.ir('historial');
    VISTA.vibrar();
    VISTA.deshacer('Movimiento borrado: ' + m.categoria + ' ' + FMT.dinero(m.importe), restaurar);
  }

  function pintar() {
    pintarMes();
    pintarHistorial();
    if (seleccionado) pintarDetalle();
  }

  return { pintar, verMes, abrirDetalle };
})();
