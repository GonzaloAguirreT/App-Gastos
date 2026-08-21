/**
 * Fijos: las reglas que escriben solas.
 *
 * Un fijo no es un gasto, es una instrucción: "620.000 el día 1 de cada mes,
 * hasta que lo pare". El día que toca, el backend escribe la fila en
 * Movimientos y adelanta el próximo cargo. Aquí solo se ven y se editan las
 * reglas; lo que ya se cobró se ve en el mes, como cualquier otro gasto.
 */
const FIJOS = (() => {

  const { h, boton, chip, fila, seccion } = VISTA;

  let seleccionado = null;

  /** Ordenados por frecuencia y luego por día: primero lo de todos los meses,
   *  que es lo que se consulta, y los raros al final. */
  function ordenados(tipo) {
    return ESTADO.estado().datos.fijos
      .filter(f => f.activo !== false && f.tipo === tipo)
      .slice()
      .sort((a, b) => ((Number(a.cada) || 1) - (Number(b.cada) || 1))
                   || ((Number(a.dia) || 0) - (Number(b.dia) || 0)));
  }

  function pintarLista() {
    const mes = ESTADO.mesEnCurso();
    const totalDe = tipo => ESTADO.fijosDelMes(mes, tipo)
      .reduce((a, f) => a + (Number(f.importe) || 0), 0);

    const listaDe = tipo => ordenados(tipo).map(f => {
      const esteMes = ESTADO.caeEn(f, mes) || ESTADO.cargadoEn(f, mes);
      return boton('fijo' + (esteMes ? '' : ' dormido'), { onClick: () => abrirFicha(f.uuid) }, [
        h('span.fijo-nombre', f.concepto),
        h('span.fijo-monto', FMT.dinero(f.importe))
      ]);
    });

    const proximos = ESTADO.proximosMeses(mes).map(p => h('div.fijo-mes', {
      estilo: { gridTemplateColumns: '1fr auto', padding: '8px 0' }
    }, [
      h('div.fila-texto', [
        h('span', { estilo: { fontSize: '13px' } }, p.nombre),
        h('span.fila-nota', p.detalle)
      ]),
      h('span.cifra', {
        estilo: { fontSize: '18px', color: p.salta ? 'var(--acc)' : 'var(--ink)' }
      }, FMT.dinero(p.total))
    ]));

    VISTA.pintar(document.getElementById('pantalla-fijos'), [
      h('div.cabeza', h('h2.titulo', 'Fijos')),
      h('div.desliza.margen', [
        seccion('Gastos', FMT.dinero(totalDe('Gasto')) + ' en ' + FMT.nombreMes(mes), 'pegada'),
        listaDe('Gasto'),
        seccion('Ingresos', FMT.dinero(totalDe('Ingreso')) + ' en ' + FMT.nombreMes(mes)),
        listaDe('Ingreso'),
        h('div.techo-fuerte', { estilo: { marginTop: '20px', paddingTop: '12px' } }, [
          h('div.etiqueta', { estilo: { paddingBottom: '8px' } }, 'Los próximos meses'),
          proximos
        ]),
        boton('boton contorno', { estilo: { margin: '16px 0 20px' }, onClick: () => ANOTAR.nuevoFijo() },
              'Añadir fijo'),
        h('div.respiro')
      ])
    ]);
  }

  /* -------------------------------------------------------------- ficha */

  function abrirFicha(uuid) {
    seleccionado = uuid;
    pintarFicha();
    VISTA.ir('fijo');
  }

  /** El estado del fijo en una línea: si cae este mes y si ya se cobró, o
   *  cuándo vuelve. Es lo primero que se mira al abrir la ficha. */
  function estadoDe(f, mes) {
    if (!ESTADO.caeEn(f, mes) && !ESTADO.cargadoEn(f, mes)) {
      return {
        texto: 'no cae en ' + FMT.nombreMes(mes) + ' · próximo ' + FMT.nombreMesAnio(FMT.mesDe(f.prox)),
        alerta: false
      };
    }
    const cargado = ESTADO.cargadoEn(f, mes);
    const base = cargado ? 'cargado' : 'pendiente';
    if (!f.cuotas) return { texto: base + ' · sin término', alerta: !cargado };
    const ultimo = FMT.mesMas(FMT.mesDe(f.prox), ((Number(f.restantes) || 1) - 1) * (Number(f.cada) || 1));
    return {
      texto: base + ' · quedan ' + f.restantes + ' · hasta ' + FMT.nombreMesAnio(ultimo),
      alerta: !cargado
    };
  }

  function pintarFicha() {
    const { datos } = ESTADO.estado();
    const f = datos.fijos.find(x => x.uuid === seleccionado);
    if (!f) return;

    const mes = ESTADO.mesEnCurso();
    const est = estadoDe(f, mes);
    const cargado = ESTADO.cargadoEn(f, mes);
    const siguiente = (lista, actual) => lista[(lista.indexOf(actual) + 1) % lista.length];
    const cambiar = cambios => ESTADO.guardarFijo(Object.assign({}, f, cambios));

    /* Las duraciones ofrecidas son cinco redondas, pero un fijo que venga de la
       hoja puede tener 36 cuotas. Sin añadirla a la lista, su chip no aparece
       marcado y la ficha miente sobre lo que hay guardado. */
    const duraciones = CONFIG.DURACIONES.slice();
    if (f.cuotas && !duraciones.some(d => d.cuotas === f.cuotas)) {
      duraciones.push({ etiqueta: f.cuotas + ' cuotas', cuotas: f.cuotas });
    }

    VISTA.pintar(document.getElementById('pantalla-fijo'), [
      h('div.cabeza-hoja', [
        boton('salir', { onClick: () => VISTA.ir('fijos') }, 'Cerrar'),
        h('span.etiqueta', f.tipo === 'Ingreso' ? 'Ingreso fijo' : 'Gasto fijo')
      ]),
      h('div.desliza', [
        h('div.margen.regla-fuerte', { estilo: { padding: '20px 26px 14px' } }, [
          h('div.saldo-cifra', [
            h('span.saldo-signo', { estilo: { color: 'var(--mut)', fontSize: '26px' } }, CONFIG.SIMBOLO || '$'),
            h('span.saldo-numero', { estilo: { fontSize: '46px' } }, FMT.miles(f.importe))
          ]),
          h('p', { estilo: { marginTop: '8px', fontSize: '15px' } }, f.concepto),
          h('p.nota', {
            estilo: { marginTop: '4px', fontSize: '12px', color: est.alerta ? 'var(--acc)' : 'var(--mut)' }
          }, est.texto)
        ]),

        h('div.margen', { estilo: { padding: '14px 26px 0', display: 'flex', flexDirection: 'column', gap: '9px' } }, [
          h('div.chips-fila', [
            h('span.etiqueta.mini', 'Cada'),
            h('div.chips.apretados', CONFIG.FRECUENCIAS.map(x =>
              chip(x.etiqueta, Number(f.cada) === x.meses, () => cambiar({ cada: x.meses }), 'pequeno')))
          ]),
          h('div.chips-fila', [
            h('span.etiqueta.mini', 'Día'),
            h('div.chips.apretados', CONFIG.DIAS.map(d =>
              chip(String(d), Number(f.dia) === d, () => cambiar({ dia: d }), 'dia')))
          ]),
          h('div.chips-fila', [
            h('span.etiqueta.mini', 'Hasta'),
            h('div.chips.apretados', duraciones.map(d =>
              chip(d.etiqueta, Number(f.cuotas || 0) === d.cuotas,
                   () => cambiar({ cuotas: d.cuotas, restantes: d.cuotas }), 'pequeno')))
          ])
        ]),

        h('div.margen', { estilo: { paddingTop: '14px' } }, [
          fila('Cambiar importe', 'teclado ›', () => ANOTAR.editarFijo(f), { clases: 'baja' }),
          fila('Cuenta', f.cuenta + ' ›',
               () => cambiar({ cuenta: siguiente(datos.cuentas, f.cuenta) }), { clases: 'baja' }),
          fila('De quién es', f.persona + ' ›',
               () => cambiar({ persona: siguiente(datos.personas.map(p => p.nombre), f.persona) }),
               { clases: 'baja' }),
          fila('Cuenta como', (f.reparto === 'Común' ? 'común' : 'personal') + ' ›',
               () => cambiar({ reparto: f.reparto === 'Común' ? 'Personal' : 'Común' }), { clases: 'baja' }),
          fila(cargado ? 'Marcar como pendiente' : 'Marcar como cargado', '›',
               () => ESTADO.marcarFijo(f.uuid, mes, !cargado), { clases: 'baja' })
        ]),

        h('div.margen', { estilo: { padding: '16px 26px 26px' } },
          boton('boton peligro', { onClick: () => borrar(f) }, 'Borrar fijo'))
      ])
    ]);
  }

  async function borrar(f) {
    const restaurar = await ESTADO.borrarFijo(f.uuid);
    VISTA.ir('fijos');
    VISTA.vibrar();
    VISTA.deshacer('Fijo borrado: ' + f.concepto + ' ' + FMT.dinero(f.importe), restaurar);
  }

  function pintar() {
    pintarLista();
    if (seleccionado) pintarFicha();
  }

  return { pintar, abrirFicha };
})();
