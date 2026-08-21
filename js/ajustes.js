/**
 * Ajustes y todo lo que cuelga de él: listas editables, el atajo y los tres
 * pasos de la primera vez.
 *
 * La división que manda aquí: lo que es de los dos (ahorro esperado, avisos,
 * categorías, cuentas, personas) se escribe en la hoja; lo que es de este
 * teléfono (conexión, quién anota aquí, su cuenta habitual, el tema) se queda
 * en el móvil. Por eso el token no viaja nunca: una hoja se comparte.
 */
const AJUSTES = (() => {

  const { h, boton, chip, fila, seccion } = VISTA;

  let nuevaCategoria = '';
  let nuevaCuenta = '';
  let fuera = [];           // fijos descartados en el paso 3 del onboarding
  let borrador = { endpoint: '', token: '' };
  let probando = '';

  /* ----------------------------------------------------------- ajustes */

  function pintarAjustes() {
    const { datos, ajustes, pendientes, enLinea } = ESTADO.estado();
    const mes = ESTADO.mesEnCurso();
    const puedeCerrar = ESTADO.sePuedeCerrar(mes);
    const cerradoYa = datos.cierres.some(c => c.mes === mes);
    const avisos = datos.config.avisos || {};

    const interruptor = (clave, titulo, cuando) => {
      const encendido = avisos[clave] !== false;
      return boton('fila baja', {
        onClick: () => ESTADO.guardarConfig({
          config: { avisos: Object.assign({}, avisos, { [clave]: !encendido }) }
        })
      }, [
        h('span.fila-texto', [h('span.fila-nombre', titulo), h('span.fila-nota', cuando)]),
        h('span.estado' + (encendido ? '.encendido' : ''), encendido ? 'activo' : 'apagado')
      ]);
    };

    VISTA.pintar(document.getElementById('pantalla-ajustes'), [
      h('div.cabeza', h('h2.titulo', 'Ajustes')),
      h('div.desliza', [

        seccion('Apariencia'),
        h('div.margen', h('div.tres', ['claro', 'oscuro', 'sistema'].map(m =>
          boton(ajustes.tema === m ? 'activo' : '', {
            onClick: () => { ESTADO.guardarAjustes({ tema: m }); VISTA.aplicarTema(m); }
          }, FMT.cap(m))))),

        seccion('Ahorro esperado'),
        h('div.margen', [
          boton('fila', { estilo: { padding: '4px 0 13px' }, onClick: () => ANOTAR.editarAhorroEsperado() }, [
            h('span.titulo', FMT.dinero(datos.config.ahorroEsperado)),
            h('span.fila-valor', 'cambiar ›')
          ]),
          h('p.nota', { estilo: { marginTop: '9px' } },
            'El colchón que no queréis tocar. El techo del mes es lo que entra; esto es lo '
            + 'que se aparta antes de repartir, y de ahí sale el tope de cada uno.')
        ]),

        seccion('Tarjeta de crédito'),
        h('div.margen', [
          /* El día de cobro es de CADA persona, no del hogar: uno puede
             facturar el 5 y la otra el 25, y de eso depende en qué mes cae
             cada compra. Por eso hay una tira por persona, con su color. */
          datos.personas.map(p => h('div.chips-fila.dias-cobro', [
            h('span.etiqueta.corta', [
              h('span.marca', { estilo: { background: ESTADO.colorPersona(p.nombre) } }),
              p.nombre
            ]),
            h('div.chips.apretados', CONFIG.DIAS.map(d =>
              chip(String(d), Number(p.diaCobro) === d, () => cambiarDiaCobro(p.nombre, d), 'dia')))
          ])),
          h('p.nota', { estilo: { margin: '4px 0 14px' } },
            'Una compra anterior a ese día entra en la factura de este mes; desde ese día, '
            + 'en la del siguiente.'),
          seccion('Cuentas de crédito'),
          h('div.chips', datos.cuentas.map(c =>
            chip(c, ESTADO.esCredito(c), () => alternarCredito(c), 'ancho'))),
          h('p.nota', { estilo: { marginTop: '9px' } },
            'Las marcadas aplazan el cargo al mes que las factura. Las demás salen el día '
            + 'que se gastan.')
        ]),

        seccion('Avisos'),
        h('div.margen', [
          interruptor('fijo', 'El día que toca un fijo', 'aviso por la mañana'),
          interruptor('saldo', 'Saldo bajo el ahorro esperado', 'una sola vez por mes'),
          interruptor('semanal', 'Resumen semanal', 'domingos por la noche')
        ]),

        seccion('Listas'),
        h('div.margen', [
          fila('Categorías', datos.categorias.length + ' ›', () => { VISTA.ir('categorias'); pintarCategorias(); }),
          fila('Cuentas', datos.cuentas.length + ' ›', () => { VISTA.ir('cuentas'); pintarCuentas(); }),
          fila('Quién anota aquí', (ajustes.persona || datos.personas[0].nombre) + ' ›', cambiarPersona),
          fila('Metas de ahorro',
               datos.metas.length + (datos.metas.length === 1 ? ' meta ›' : ' metas ›'),
               () => VISTA.ir('ahorro')),
          fila('Atajo en pantalla de inicio', 'ver ›', () => { VISTA.ir('atajo'); pintarAtajo(); })
        ]),

        seccion('Hoja de cálculo'),
        h('div.margen', [
          fila('Conexión', h('span.fila-valor', {
            estilo: { color: enLinea ? 'var(--mut)' : 'var(--acc)' }
          }, enLinea ? 'correcta ✓' : 'sin conexión'), () => ESTADO.sincronizar()),
          fila('Pendientes de enviar (' + pendientes + ')', h('span.fila-valor', {
            estilo: { color: pendientes ? 'var(--acc)' : 'var(--mut)' }
          }, pendientes ? 'ver ›' : 'todo al día ›'),
            () => { VISTA.ir('cola'); pintarCola(); }),
          fila('Repetir onboarding', '3 pasos ›', () => abrirOnboarding()),
          fila('Versión', APP.versionServida() || '—', null)
        ]),

        seccion('Cierre del mes'),
        h('div.margen', cerradoYa
          ? [
              /* Un mes cerrado por error deja la app en un callejón: la pantalla
                 Mes pasa a solo lectura y, si no hay ningún otro mes, las dos
                 flechas se apagan. Tiene que poder deshacerse desde aquí. */
              fila('Reabrir ' + FMT.nombreMes(mes), 'volver a anotar ›',
                   () => ESTADO.reabrirMes(mes)),
              h('p.nota', { estilo: { marginTop: '9px' } },
                FMT.cap(FMT.nombreMes(mes)) + ' está cerrado, así que la pantalla Mes es de '
                + 'solo lectura. Reabrirlo borra su fila de Cierres y lo devuelve a en curso.')
            ]
          : [
              /* Sin acción, fila() la pinta como un div en vez de un botón: no
                 hace falta ninguna clase nueva para que se note que no se puede
                 tocar, y el "—" de la derecha lo dice. */
              fila('Cerrar ' + FMT.nombreMes(mes) + ' ahora', puedeCerrar ? 'repartir ›' : '—',
                   puedeCerrar ? () => AHORRO.cerrarMesYRepartir(mes) : null),
              h('p.nota', { estilo: { marginTop: '9px' } }, puedeCerrar
                ? 'Al cerrarlo eliges a qué metas va lo ahorrado.'
                : 'Se cierra solo la última noche del mes, y a mano solo desde los '
                  + 'últimos días. Cerrarlo a mitad lo archivaría con el mes sin terminar.')
            ]),
        h('div.respiro')
      ])
    ]);
  }

  /* ------------------------------------------------------------- la cola

     "3 sin enviar" no dice nada útil: quedarse sin cobertura y que la hoja
     rechace la petición son problemas distintos, se arreglan de forma distinta
     y hasta ahora se contaban igual. Aquí cada apunte enseña qué es, cuándo se
     intentó por última vez y POR QUÉ no salió. */

  function pintarCola() {
    NUCLEO.todos().then(registros => {
      const enLinea = ESTADO.estado().enLinea;

      /* Un grupo, una petición, una fila en esta pantalla: las filas de un
         mismo grupo viajan juntas y no tiene sentido ofrecer enviar media. */
      const grupos = [];
      registros.forEach(r => {
        let g = grupos.find(x => x.grupo === r.grupo);
        if (!g) { g = { grupo: r.grupo, registros: [] }; grupos.push(g); }
        g.registros.push(r);
      });
      grupos.sort((a, b) => (a.registros[0].creado || 0) - (b.registros[0].creado || 0));

      VISTA.pintar(document.getElementById('pantalla-cola'), [
        h('div.cabeza-hoja', [
          boton('salir', { onClick: () => VISTA.ir('ajustes') }, '‹ Ajustes'),
          h('span.etiqueta', 'Pendientes')
        ]),
        h('div.margen.regla-fuerte', { estilo: { padding: '22px 26px 18px' } }, [
          h('div.editorial', { estilo: { color: grupos.length ? 'var(--acc)' : 'var(--ink)' } },
            grupos.length === 0 ? 'Todo al día'
              : grupos.length === 1 ? 'Uno sin enviar' : grupos.length + ' sin enviar'),
          h('p.nota.suelta', { estilo: { marginTop: '10px', maxWidth: '300px' } },
            grupos.length === 0
              ? 'No queda nada en la cola: todo lo anotado está escrito en la hoja.'
              : 'Están guardados en el teléfono y no se pierden. Salen solos cuando la hoja '
                + 'vuelva a contestar, o ahora mismo si los empujas.')
        ]),
        h('div.desliza.margen', [
          grupos.map(g => filaCola(g, enLinea)),
          grupos.length
            ? h('div', { estilo: { padding: '20px 0 26px' } },
                boton('boton tinta', { onClick: enviarTodo }, 'Enviar todo a la hoja'))
            : h('div', { estilo: { padding: '20px 0 26px' } },
                boton('boton suave', { onClick: () => VISTA.ir('ajustes') }, 'Volver a Ajustes')),
          h('div.respiro')
        ])
      ]);
    });
  }

  function filaCola(g, enLinea) {
    const r = g.registros[0];
    const fila = r.fila || {};
    const cuantos = g.registros.length;

    return h('div.pendiente', [
      h('div.pendiente-cabeza', [
        h('span.pendiente-nombre', nombreDeCola(r.accion, fila, cuantos)),
        h('span.pendiente-monto', fila.importe != null ? FMT.dinero(fila.importe) : ''),
        h('span.pendiente-meta',
          [fila.cuenta, fila.persona].filter(Boolean).join(' · ') || accionEnClaro(r.accion))
      ]),
      /* El motivo, en acento y con su punto. Distinguir "sin conexión" de "la
         hoja no respondió" es la mitad del valor de esta pantalla: la primera
         se arregla sola y la segunda casi nunca. */
      h('div.pendiente-motivo', [
        h('span.cuadro'),
        (r.ultimoIntento ? 'Último intento ' + FMT.momento(r.ultimoIntento) : 'Aún sin intentar')
          + ' · ' + (r.ultimoError || (enLinea ? 'esperando su turno' : 'sin conexión'))
      ]),
      h('div.pendiente-acciones', [
        boton('boton-cola', { onClick: () => enviarUno(g.grupo) }, 'Enviar ahora'),
        boton('boton-cola peligro', { onClick: () => descartar(g) }, 'Descartar')
      ])
    ]);
  }

  function nombreDeCola(accion, fila, cuantos) {
    if (accion === 'movimientos') return fila.categoria || 'Movimiento';
    if (cuantos > 1) return accionEnClaro(accion) + ' · ' + cuantos + ' filas';
    return accionEnClaro(accion);
  }

  function accionEnClaro(accion) {
    return ({
      'movimientos': 'Movimiento anotado',
      'movimiento-edita': 'Cambio en un movimiento',
      'movimiento-baja': 'Borrado de un movimiento',
      'fijo': 'Alta o cambio de un fijo',
      'fijo-baja': 'Borrado de un fijo',
      'fijo-cargo': 'Marca de fijo cargado',
      'cerrar-mes': 'Cierre del mes',
      'cierre-baja': 'Reapertura del mes',
      'reparto': 'Reparto del ahorro',
      'metas': 'Cambio en las metas',
      'config': 'Cambio de ajustes'
    })[accion] || accion;
  }

  async function enviarUno(grupo) {
    const r = await NUCLEO.enviarGrupo(grupo);
    await ESTADO.refrescarPendientes();
    pintarCola();
    if (r.enviados) VISTA.avisar(r.enviados === 1 ? 'Enviada.' : r.enviados + ' enviadas.');
    else VISTA.avisar('No se pudo enviar: ' + (r.motivo || 'sin motivo'), { mal: true });
  }

  async function enviarTodo() {
    const r = await APP.vaciarCola({ aMano: true });
    pintarCola();
    if (r.enviados && !r.quedan) VISTA.avisar(r.enviados + ' enviadas.');
    else if (r.motivo) VISTA.avisar('No se pudo enviar: ' + r.motivo, { mal: true });
    else if (r.quedan) VISTA.avisar(r.quedan + ' siguen en cola.', { mal: true });
    else VISTA.avisar('No queda nada por enviar.');
  }

  /** Descartar también ofrece deshacer: es la misma clase de acción que borrar
   *  un movimiento —irreversible y sin preguntar— y merece la misma red. */
  async function descartar(g) {
    const copia = g.registros.slice();
    await NUCLEO.borrarGrupo(g.grupo);
    await ESTADO.refrescarPendientes();
    pintarCola();
    VISTA.vibrar();
    VISTA.deshacer('Descartado: ' + nombreDeCola(copia[0].accion, copia[0].fila || {}, copia.length),
      async () => {
        await NUCLEO.reponer(copia);
        await ESTADO.refrescarPendientes();
        pintarCola();
      });
  }

  function cambiarDiaCobro(nombre, dia) {
    const { datos } = ESTADO.estado();
    ESTADO.guardarConfig({
      personas: datos.personas.map(p => p.nombre === nombre
        // Volver a tocar el día elegido lo quita: sin día no hay aplazamiento,
        // que es lo que quiere quien paga la tarjeta al contado.
        ? Object.assign({}, p, { diaCobro: Number(p.diaCobro) === dia ? 0 : dia })
        : p)
    });
  }

  function alternarCredito(cuenta) {
    const { datos } = ESTADO.estado();
    const lista = datos.credito || [];
    ESTADO.guardarConfig({
      credito: ESTADO.esCredito(cuenta)
        ? lista.filter(c => c !== cuenta)
        : lista.concat([cuenta])
    });
  }

  function cambiarPersona() {
    const { datos, ajustes } = ESTADO.estado();
    const nombres = datos.personas.map(p => p.nombre);
    const actual = ajustes.persona || nombres[0];
    ESTADO.guardarAjustes({ persona: nombres[(nombres.indexOf(actual) + 1) % nombres.length] });
  }

  /* --------------------------------------------------------- categorías */

  function usoCategoria(nombre) {
    return ESTADO.movimientosDe(ESTADO.mesEnCurso()).filter(m => m.categoria === nombre).length;
  }

  function pintarCategorias() {
    const { datos } = ESTADO.estado();

    const guardar = categorias => ESTADO.guardarConfig({ categorias });

    const filas = datos.categorias.map(c => {
      const comun = c.reparto === 'Común';
      const n = usoCategoria(c.nombre);
      return h('div.editable', [
        h('span.nombre', c.nombre),
        boton('chip pequeno' + (comun ? ' activo' : ''), {
          onClick: () => guardar(datos.categorias.map(x => x.nombre === c.nombre
            ? Object.assign({}, x, { reparto: comun ? 'Personal' : 'Común' }) : x))
        }, comun ? 'común' : 'personal'),
        boton('quitar', {
          onClick: () => guardar(datos.categorias.filter(x => x.nombre !== c.nombre))
        }, 'quitar'),
        h('span.uso', (n ? n + (n === 1 ? ' movimiento este mes' : ' movimientos este mes') : 'sin usar este mes')
          + (comun ? ' · se reparte entre los dos' : ' · gasto de cada uno'))
      ]);
    });

    const entrada = h('input.entrada.fuerte', {
      valor: nuevaCategoria,
      placeholder: 'Bencina, farmacia…',
      onInput: e => { nuevaCategoria = e.target.value; refrescarBoton(); },
      onKeyDown: e => { if (e.key === 'Enter') anadirCategoria(); }
    });

    const botonAnadir = boton('boton' + (nuevaCategoria.trim() ? ' listo' : ''),
                              { onClick: anadirCategoria }, 'Añadir');

    function refrescarBoton() {
      botonAnadir.className = 'boton' + (entrada.value.trim() ? ' listo' : '');
      nuevaCategoria = entrada.value;
    }

    function anadirCategoria() {
      const bruto = (entrada.value || '').trim();
      if (!bruto) return;
      const nombre = FMT.cap(bruto);
      nuevaCategoria = '';
      if (datos.categorias.some(x => x.nombre.toLowerCase() === nombre.toLowerCase())) {
        pintarCategorias();
        return;
      }
      guardar(datos.categorias.concat([{ nombre, tipo: 'Gasto', reparto: 'Personal' }]));
    }

    const sugeridas = (CONFIG.SUGERENCIAS_CATEGORIAS || [])
      .filter(k => !datos.categorias.some(x => x.nombre === k));

    VISTA.pintar(document.getElementById('pantalla-categorias'), [
      h('div.cabeza-hoja', [
        boton('salir', { onClick: () => VISTA.ir('ajustes') }, '‹ Ajustes'),
        h('span.etiqueta', 'Categorías')
      ]),
      h('div.desliza', [
        seccion('En uso'),
        h('div.margen', filas),
        seccion('Escribir una nueva'),
        h('div.margen.anadir', [entrada, botonAnadir]),
        sugeridas.length ? seccion('O de las sugeridas') : null,
        h('div.margen.chips', { estilo: { paddingBottom: '24px' } }, sugeridas.map(k =>
          boton('boton-pequeno', {
            onClick: () => guardar(datos.categorias.concat([{ nombre: k, tipo: 'Gasto', reparto: 'Personal' }]))
          }, '+ ' + k))),
        h('div.respiro')
      ])
    ]);
  }

  /* ------------------------------------------------------------ cuentas */

  function pintarCuentas() {
    const { datos, ajustes } = ESTADO.estado();
    const guardar = cuentas => ESTADO.guardarConfig({ cuentas });
    const habitual = ajustes.cuenta || datos.cuentas[0];

    const uso = nombre => ESTADO.estado().datos.movimientos.filter(m => m.cuenta === nombre).length
                        + ESTADO.estado().datos.fijos.filter(f => f.cuenta === nombre).length;

    const filas = datos.cuentas.map(c => h('div.editable', [
      boton('nombre', { onClick: () => ESTADO.guardarAjustes({ cuenta: c }) }, c),
      h('span.nota', uso(c) ? uso(c) + (uso(c) === 1 ? ' cargo' : ' cargos') : 'sin usar'),
      boton('quitar', { onClick: () => guardar(datos.cuentas.filter(x => x !== c)) }, 'quitar'),
      h('span.uso', { estilo: { color: c === habitual ? 'var(--ink)' : 'var(--mut)' } },
        c === habitual ? 'por defecto en este teléfono' : 'toca el nombre para hacerla la de siempre')
    ]));

    const entrada = h('input.entrada.fuerte', {
      valor: nuevaCuenta,
      placeholder: 'Tarjeta Falabella…',
      onInput: e => { nuevaCuenta = e.target.value; refrescarBoton(); },
      onKeyDown: e => { if (e.key === 'Enter') anadir(); }
    });

    /* El botón se enciende al escribir, igual que en Categorías: el mismo gesto
       contestaba distinto en dos pantallas gemelas. */
    const botonAnadir = boton('boton' + (nuevaCuenta.trim() ? ' listo' : ''),
                              { onClick: anadir }, 'Añadir');

    function refrescarBoton() {
      botonAnadir.className = 'boton' + (entrada.value.trim() ? ' listo' : '');
      nuevaCuenta = entrada.value;
    }

    function anadir() {
      const bruto = (entrada.value || '').trim();
      if (!bruto) return;
      const nombre = FMT.cap(bruto);
      nuevaCuenta = '';
      if (datos.cuentas.some(x => x.toLowerCase() === nombre.toLowerCase())) { pintarCuentas(); return; }
      guardar(datos.cuentas.concat([nombre]));
    }

    const sugeridas = (CONFIG.SUGERENCIAS_CUENTAS || []).filter(k => datos.cuentas.indexOf(k) === -1);

    VISTA.pintar(document.getElementById('pantalla-cuentas'), [
      h('div.cabeza-hoja', [
        boton('salir', { onClick: () => VISTA.ir('ajustes') }, '‹ Ajustes'),
        h('span.etiqueta', 'Cuentas')
      ]),
      h('div.desliza', [
        seccion('En uso'),
        h('div.margen', filas),
        seccion('Escribir una nueva'),
        h('div.margen.anadir', [entrada, botonAnadir]),
        sugeridas.length ? seccion('O de las sugeridas') : null,
        h('div.margen.chips', { estilo: { paddingBottom: '24px' } }, sugeridas.map(k =>
          boton('boton-pequeno', { onClick: () => guardar(datos.cuentas.concat([k])) }, '+ ' + k))),
        h('div.respiro')
      ])
    ]);
  }

  /* -------------------------------------------------------------- atajo */

  function pintarAtajo() {
    const { datos, ajustes } = ESTADO.estado();
    const mes = ESTADO.mesEnCurso();
    const r = ESTADO.resumen(mes);

    const uso = k => ESTADO.movimientosDe(mes).filter(m => m.categoria === k).length;
    const masUsadas = ESTADO.categoriasDe('Gasto').slice().sort((a, b) => uso(b) - uso(a)).slice(0, 3);

    VISTA.pintar(document.getElementById('pantalla-atajo'), [
      h('div.cabeza-hoja', [
        boton('salir', { onClick: () => VISTA.ir('ajustes') }, '‹ Ajustes'),
        h('span.etiqueta', 'Atajo')
      ]),
      h('div.desliza', [
        h('p.nota.suelta.margen', { estilo: { padding: '16px 26px 0' } },
          'Así se ve en la pantalla de inicio del teléfono: un toque en la categoría y otro en el '
          + 'importe, sin abrir la app.'),
        h('div.tarjeta-atajo', [
          h('div.fila-alta', [
            h('span.etiqueta.tenue', 'Gastos · ' + FMT.cap(FMT.nombreMes(mes))),
            h('span.cifra', { estilo: { fontSize: '22px' } }, FMT.dinero(r.queda))
          ]),
          h('div.rejilla', masUsadas.concat(['Otro…']).map(k =>
            boton('', { onClick: () => ANOTAR.abrir(k === 'Otro…' ? null : k) }, k))),
          h('span.nota.tenue', { estilo: { fontSize: '10px' } },
            'Se anota como ' + (ajustes.persona || datos.personas[0].nombre)
            + ' en ' + (ajustes.cuenta || datos.cuentas[0]) + '.')
        ]),
        h('div.margen', { estilo: { paddingTop: '22px' } }, [
          fila('Categorías que muestra', 'las 3 más usadas', null),
          fila('Cómo se instala', 'Chrome › Añadir a inicio', null)
        ]),
        h('div.respiro')
      ])
    ]);
  }

  /* ------------------------------------------------------- onboarding */

  function abrirOnboarding() {
    const { ajustes } = ESTADO.estado();
    borrador = { endpoint: ajustes.endpoint, token: ajustes.token };
    probando = '';
    pintarConectar();
    VISTA.ir('conectar');
  }

  /**
   * Paso 1: la conexión.
   *
   * El token se escribe aquí y se queda aquí. No está en config.js —GitHub
   * Pages sirve el repositorio tal cual y cualquiera podría leerlo— ni en la
   * hoja, que se comparte. Vive en el IndexedDB de este teléfono y punto.
   */
  function pintarConectar() {
    const campoUrl = h('input.entrada.fuerte', {
      valor: borrador.endpoint,
      placeholder: 'https://script.google.com/…/exec',
      onInput: e => { borrador.endpoint = e.target.value.trim(); }
    });
    const campoToken = h('input.entrada.fuerte', {
      valor: borrador.token,
      type: 'password',
      placeholder: '••••••••••••',
      onInput: e => { borrador.token = e.target.value.trim(); }
    });

    VISTA.pintar(document.getElementById('pantalla-conectar'), [
      h('div.desliza', [
        h('div.margen', { estilo: { padding: '44px 26px 0' } }, [
          h('h2.editorial.grande', { estilo: { marginBottom: '14px' } },
            ['Tus gastos', h('br'), 'siguen siendo', h('br'), 'tu hoja.']),
          h('p.nota.suelta',
            'Nada se guarda aquí. Esta app escribe en la hoja de cálculo que ya usas y la lee '
            + 'para armar el mes.')
        ]),
        h('div.margen', { estilo: { padding: '30px 26px 0' } }, [
          h('div.etiqueta', { estilo: { paddingBottom: '6px' } }, 'URL del script'),
          campoUrl,
          h('div.etiqueta', { estilo: { padding: '20px 0 6px' } }, 'Token'),
          campoToken,
          h('p', { estilo: { padding: '18px 0 0', fontSize: '13px' } }, probando || '')
        ]),
        h('div.respiro')
      ]),
      h('div.pie', [
        boton('boton tinta', { onClick: comprobar }, 'Continuar'),
        h('span.nota.centrada', 'El token se queda en este teléfono. No sube a la hoja ni al repositorio.')
      ])
    ]);
  }

  async function comprobar() {
    if (!borrador.endpoint || !borrador.token) {
      probando = 'Faltan la URL o el token.';
      pintarConectar();
      return;
    }
    probando = 'Comprobando…';
    pintarConectar();
    await ESTADO.guardarAjustes({ endpoint: borrador.endpoint, token: borrador.token });
    const bien = await ESTADO.sincronizar();
    if (!bien) {
      probando = 'No se pudo conectar: ' + ESTADO.estado().ultimoFallo;
      pintarConectar();
      return;
    }
    probando = '';
    pintarQuienes();
    VISTA.ir('quienes');
  }

  /** Paso 2: quiénes anotan y cuánto quieren ahorrar. Los nombres son los de la
   *  hoja: el color se asigna por orden y es el que llevará esa persona en la
   *  barra del mes. */
  function pintarQuienes() {
    const { datos } = ESTADO.estado();
    const personas = datos.personas.slice();

    const guardar = () => ESTADO.guardarConfig({ personas });

    const filas = personas.map((p, i) => h('div', {
      estilo: { display: 'flex', flexDirection: 'column', gap: '2px' }
    }, [
      h('div', { estilo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, [
        h('span.etiqueta.mini', i === 0 ? 'Este teléfono' : 'Persona ' + (i + 1)),
        personas.length > 2 && i > 0
          ? boton('quitar', {
              onClick: () => { personas.splice(i, 1); guardar(); pintarQuienes(); }
            }, 'quitar')
          : null
      ]),
      h('div', { estilo: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
        h('span.marca', { estilo: { background: ESTADO.colorPersona(p.nombre), width: '10px', height: '10px' } }),
        h('input.entrada.fuerte.grande', {
          valor: p.nombre,
          placeholder: i === 0 ? 'Tu nombre' : 'Su nombre',
          onInput: e => { p.nombre = e.target.value; }
        })
      ])
    ]));

    VISTA.pintar(document.getElementById('pantalla-quienes'), [
      h('div.margen.regla-fuerte', { estilo: { padding: '34px 26px 18px' } }, [
        h('h2.editorial', { estilo: { marginBottom: '12px' } }, ['Quiénes', h('br'), 'anotan']),
        h('p.nota.suelta',
          'Cada gasto queda a nombre de quien lo anota, y el mes se reparte entre todos los que anotan.')
      ]),
      h('div.desliza', [
        h('div.margen', {
          estilo: { padding: '16px 26px 0', display: 'flex', flexDirection: 'column', gap: '12px' }
        }, filas.concat([
          personas.length < 4
            ? boton('boton-pequeno', {
                onClick: () => {
                  personas.push({ nombre: '', color: CONFIG.COLORES_PERSONA[personas.length] });
                  pintarQuienes();
                }
              }, '+ Añadir persona')
            : null
        ])),
        h('div.margen', { estilo: { padding: '26px 26px 0' } }, [
          h('div.etiqueta', { estilo: { paddingBottom: '8px' } }, 'Ahorro esperado, común'),
          h('div.chips.apretados', CONFIG.AHORROS_SUGERIDOS.map(v =>
            chip(FMT.dinero(v), Number(datos.config.ahorroEsperado) === v,
                 () => ESTADO.guardarConfig({ config: { ahorroEsperado: v } })))),
          h('p.nota', { estilo: { marginTop: '10px' } }, 'Lo puedes cambiar cuando quieras en Ajustes.')
        ]),
        h('div.respiro')
      ]),
      h('div.pie', h('div.pie-fila', [
        boton('boton tinta', {
          onClick: () => { guardar(); fuera = []; pintarDetectados(); VISTA.ir('detectados'); }
        }, 'Continuar'),
        boton('boton contorno estrecho', { onClick: () => VISTA.ir('conectar') }, 'Atrás')
      ]))
    ]);
  }

  /** Paso 3: los fijos que ya hay en la hoja. Descartar uno no lo borra: lo
   *  desactiva, que es reversible desde su ficha. */
  function pintarDetectados() {
    const { datos } = ESTADO.estado();
    const mes = ESTADO.mesEnCurso();
    const todos = datos.fijos.slice();
    const dentro = f => fuera.indexOf(f.uuid) === -1;

    const total = todos
      .filter(f => dentro(f) && f.tipo === 'Gasto' && (ESTADO.caeEn(f, mes) || ESTADO.cargadoEn(f, mes)))
      .reduce((a, f) => a + (Number(f.importe) || 0), 0);

    VISTA.pintar(document.getElementById('pantalla-detectados'), [
      h('div.margen.regla-fuerte', { estilo: { padding: '24px 26px 16px' } }, [
        h('h2.editorial', { estilo: { marginBottom: '12px', fontSize: '32px' } },
          ['Qué sale', h('br'), 'todos los meses']),
        h('p.nota.suelta', todos.length
          ? 'Encontramos estos cargos repetidos en tu hoja. Toca para incluirlos o dejarlos fuera.'
          : 'Todavía no hay fijos en tu hoja. Los puedes añadir cuando quieras desde la pestaña Fijos.')
      ]),
      h('div.desliza.margen', [
        todos.map(f => boton('fijo-mes', {
          estilo: { gridTemplateColumns: '1fr auto 22px', padding: '12px 0', width: '100%' },
          onClick: () => {
            fuera = dentro(f) ? fuera.concat([f.uuid]) : fuera.filter(x => x !== f.uuid);
            pintarDetectados();
          }
        }, [
          h('div.fila-texto', [
            h('span.fila-nombre', { estilo: { color: dentro(f) ? 'var(--ink)' : 'var(--faint)' } }, f.concepto),
            h('span.fila-nota', (f.tipo === 'Ingreso' ? 'ingreso · ' : '')
              + FMT.frecuencia(Number(f.cada) || 1) + ' · día ' + f.dia
              + (f.cuotas ? ' · ' + f.restantes + ' cuotas' : ''))
          ]),
          h('span.cifra', {
            estilo: { fontSize: '18px', color: dentro(f) ? 'var(--ink)' : 'var(--faint)' }
          }, FMT.dinero(f.importe)),
          h('span', {
            estilo: { fontSize: '14px', textAlign: 'right', color: dentro(f) ? 'var(--ink)' : 'var(--faint)' }
          }, dentro(f) ? '✓' : '○')
        ])),
        h('div', { estilo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '16px 0 0' } }, [
          h('span.nota.suelta', (todos.length - fuera.length) + ' de ' + todos.length
            + ' incluidos · gastos del mes'),
          h('span.cifra', { estilo: { fontSize: '22px' } }, FMT.dinero(total))
        ]),
        h('div.respiro')
      ]),
      h('div.pie', h('div.pie-fila', [
        boton('boton tinta', { onClick: terminar }, 'Empezar'),
        boton('boton contorno estrecho', { onClick: () => VISTA.ir('quienes') }, 'Atrás')
      ]))
    ]);
  }

  async function terminar() {
    if (fuera.length) {
      for (const uuid of fuera) {
        const f = ESTADO.estado().datos.fijos.find(x => x.uuid === uuid);
        if (f) await ESTADO.guardarFijo(Object.assign({}, f, { activo: false }));
      }
    }
    await ESTADO.guardarAjustes({ onboarding: true });
    fuera = [];
    VISTA.ir('mes');
  }

  function pintar() {
    pintarAjustes();
    const donde = VISTA.actual();
    if (donde === 'categorias') pintarCategorias();
    if (donde === 'cuentas') pintarCuentas();
    if (donde === 'atajo') pintarAtajo();
    if (donde === 'quienes') pintarQuienes();
    if (donde === 'detectados') pintarDetectados();
    if (donde === 'cola') pintarCola();
  }

  return { pintar, abrirOnboarding };
})();
