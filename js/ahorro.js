/**
 * Ahorro y reparto.
 *
 * El ahorro de esta app no es una cuenta: es lo que sobró de los meses que ya
 * están cerrados. Por eso el número grande solo cuenta meses cerrados y el mes
 * en curso aparece aparte, como proyección.
 *
 * Repartir es decidir a qué metas va ese dinero. Cada asignación se escribe
 * como una línea en la hoja, y lo guardado en cada meta sale de sumar sus
 * líneas: así el ahorro siempre se puede auditar y nunca hay un total que no
 * cuadre con nada.
 */
const AHORRO = (() => {

  const { h, boton, chip, fila, seccion } = VISTA;

  let asignado = {};      // nombre de meta → monto de este reparto
  let porRepartir = 0;
  let mesDelReparto = '';

  /* ------------------------------------------------------------- ahorro */

  function pintarAhorro() {
    const { datos } = ESTADO.estado();
    const mes = ESTADO.mesEnCurso();
    const acum = ESTADO.acumulado();
    const libre = ESTADO.sinAsignar();
    const r = ESTADO.resumen(mes);
    const metas = ESTADO.metasCalculadas();

    const maximo = Math.max(1, ...datos.cierres.map(c => Number(c.ahorrado) || 0));

    VISTA.pintar(document.getElementById('pantalla-ahorro'), [
      h('div.cabeza', { estilo: { display: 'block' } }, [
        h('h2.titulo', { estilo: { marginBottom: '10px' } }, 'Ahorro'),
        h('div.saldo-cifra', [
          h('span.saldo-signo', {
            estilo: { fontSize: '26px', color: acum < 0 ? 'var(--acc)' : 'var(--ink)' }
          }, (acum < 0 ? '−' : '') + (CONFIG.SIMBOLO || '$')),
          h('span.saldo-numero', {
            estilo: { fontSize: '46px', color: acum < 0 ? 'var(--acc)' : 'var(--ink)' }
          }, FMT.miles(acum))
        ]),
        h('p.etiqueta.corta', { estilo: { marginTop: '6px' } }, 'acumulado en meses cerrados')
      ]),

      h('div.desliza', [
        seccion('Metas'),
        h('div.margen.regla', {
          estilo: { paddingBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }
        }, [
          metas.map(m => filaMeta(m)),
          boton('boton-pequeno', { onClick: anadirMeta }, '+ Añadir meta')
        ]),

        boton('fila margen', {
          estilo: { padding: '14px 26px' },
          onClick: () => { if (libre > 0) abrirReparto(libre, ''); }
        }, [
          h('span.fila-texto', [
            h('span.fila-nombre', 'Sin asignar'),
            h('span.fila-nota', libre > 0 ? 'ahorro sin destino · toca para repartir'
              : libre < 0 ? 'has asignado más de lo ahorrado' : 'todo lo ahorrado tiene destino')
          ]),
          h('span.cifra', {
            estilo: { fontSize: '22px', color: libre > 0 ? 'var(--acc)' : 'var(--mut)' }
          }, FMT.dinero(libre))
        ]),

        seccion(FMT.nombreMes(mes) + ', en curso'),
        h('div.margen.regla', { estilo: { paddingBottom: '16px' } }, [
          h('div', { estilo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, [
            h('span.fila-nombre', 'Proyectado al cierre'),
            h('span.cifra', {
              estilo: { fontSize: '26px', color: r.queda < 0 ? 'var(--acc)' : 'var(--ink)' }
            }, FMT.dinero(r.queda))
          ]),
          /* La resta entera, no solo el total. El techo del mes es lo que entra
             —los ingresos anotados más los que el calendario dice que van a
             entrar—, así que enseñarla desglosada es lo que deja ver de dónde
             sale la cifra sin tener que explicarlo aparte. */
          h('p.nota', { estilo: { marginTop: '6px' } },
            (r.entrado ? FMT.dinero(r.entrado) + ' entraron' : 'nada ha entrado aún')
            + (r.porEntrar ? ' · ' + FMT.dinero(r.porEntrar) + ' por entrar' : '')
            + ' · ' + FMT.dinero(r.gastado) + ' gastado'
            + (r.porVenir ? ' · ' + FMT.dinero(r.porVenir) + ' de fijos por venir' : '')),
          /* Cerrar desde aquí y no solo desde Ajustes: esta es la pantalla en
             la que estás mirando cuánto has ahorrado, y es donde apetece
             repartirlo. En mitad de mes no aparece —cerrar entonces archiva un
             mes sin terminar— y la nota dice desde cuándo se puede. */
          ESTADO.sePuedeCerrar(mes)
            ? boton('boton contorno', { estilo: { marginTop: '12px', padding: '13px', fontSize: '13px' },
                                        onClick: () => cerrarMesYRepartir(mes) },
                    'Cerrar ' + FMT.nombreMes(mes) + ' y repartir')
            : h('p.nota', { estilo: { marginTop: '10px' } },
                'Se cierra solo la última noche del mes. Al cerrarlo eliges a qué metas va lo ahorrado.')
        ]),

        seccion('Meses cerrados'),
        h('div.margen', datos.cierres.map(c => {
          const ahorrado = Number(c.ahorrado) || 0;
          const alto = ahorrado <= 0 ? 0 : Math.max(2, (ahorrado / maximo) * 100);
          return boton('fila', {
            estilo: { flexDirection: 'column', alignItems: 'stretch', gap: '6px', padding: '11px 0' },
            onClick: () => { MES.verMes(c.mes); VISTA.ir('mes'); }
          }, [
            h('div', { estilo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, [
              h('span.fila-nombre', FMT.cap(FMT.nombreMesAnio(c.mes))),
              h('span.cifra', {
                estilo: { fontSize: '19px', color: ahorrado < 0 ? 'var(--acc)' : 'var(--ink)' }
              }, FMT.dinero(ahorrado))
            ]),
            h('div.progreso.fina', h('div', {
              estilo: { width: alto.toFixed(1) + '%', background: ahorrado < 0 ? 'var(--acc)' : 'var(--ink)' }
            })),
            h('span.fila-nota', FMT.dinero(c.entrado) + ' entraron · ' + FMT.dinero(c.gastado) + ' salieron')
          ]);
        })),

        h('p.nota.margen', { estilo: { margin: '14px 26px 24px' } },
          'Al cerrar el mes se escribe Total Ahorrado en tu hoja, junto al mes.'),
        h('div.respiro')
      ])
    ]);
  }

  function filaMeta(m) {
    const nombre = h('input.entrada.meta', {
      valor: m.nombre,
      placeholder: 'Para qué ahorras',
      onInput: e => renombrar(m.i, e.target.value)
    });

    return h('div.meta', [
      h('div.meta-cabeza', [
        nombre,
        boton('quitar', { onClick: () => quitarMeta(m.nombre) }, 'quitar')
      ]),
      h('div', { estilo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, [
        boton('salir', { onClick: () => ANOTAR.editarMeta(m) }, FMT.dinero(m.objetivo) + ' ›'),
        h('span.nota', { estilo: { color: m.completa ? 'var(--ink)' : 'var(--mut)' } },
          m.completa ? 'completa' : m.avance.toFixed(0) + '%')
      ]),
      h('div.progreso' + (m.completa ? '.completa' : ''),
        h('div', { estilo: { width: Math.max(1, m.avance).toFixed(1) + '%' } })),
      h('span.nota', m.completa
        ? 'Cubierta con ' + FMT.dinero(m.guardado) + ' de lo ahorrado.'
        : 'Llevas ' + FMT.dinero(m.guardado) + ' · faltan ' + FMT.dinero(m.falta)
          + (m.meses ? ' · a este ritmo, ' + m.meses + (m.meses === 1 ? ' mes' : ' meses')
                     : ' · aún sin meses cerrados'))
    ]);
  }

  /* El nombre es la clave de la meta en la hoja, así que renombrar es mover
     también sus líneas de reparto. Se manda el nombre viejo para que el
     backend sepa cuál está cambiando.

     Se escribe sobre el objeto, no se busca por nombre: el nombre es justo lo
     que está cambiando y no sirve de identidad mientras se teclea. */
  let esperaRenombre = null;
  function renombrar(i, nuevo) {
    /* Se busca por posición, no por nombre ni guardando el objeto: el nombre es
       lo que está cambiando, y una sincronización a media palabra reemplaza los
       objetos de `datos` por otros recién traídos de la hoja. La posición
       sobrevive a las dos cosas —se escriben y se leen en orden— y es la única
       identidad que tiene una meta hasta que la hoja le dé un id. */
    const metas = ESTADO.estado().datos.metas;
    const viva = metas[i];
    if (!viva) return;

    // El nombre de antes de empezar a teclear, apuntado una vez. `undefined` y
    // no un valor falso: una meta recién añadida se llama '' y eso es un nombre
    // viejo válido —vacío— que no hay que volver a pisar en la segunda letra.
    if (viva.antes === undefined) viva.antes = viva.nombre;
    viva.nombre = nuevo;

    // Sin espera se enviaría una escritura por cada tecla.
    clearTimeout(esperaRenombre);
    esperaRenombre = setTimeout(() => ESTADO.guardarMetas(metas.slice()), 600);
  }

  function anadirMeta() {
    const metas = ESTADO.estado().datos.metas.slice();
    metas.push({ nombre: '', objetivo: 1000000, guardado: 0, orden: metas.length + 1, activa: true });
    ESTADO.guardarMetas(metas);
  }

  function quitarMeta(nombre) {
    ESTADO.guardarMetas(ESTADO.estado().datos.metas.filter(m => m.nombre !== nombre));
  }

  /* ------------------------------------------------------------ reparto */

  function abrirReparto(cuanto, mes) {
    porRepartir = Math.max(0, Math.round(cuanto));
    mesDelReparto = mes || '';
    asignado = {};
    pintarReparto();
    VISTA.ir('reparto');
  }

  /** Cerrar el mes y, si sobró algo, ofrecer repartirlo en el acto. Preguntarlo
   *  más tarde es preguntarlo nunca. */
  async function cerrarMesYRepartir(mes) {
    const ahorrado = await ESTADO.cerrarMes(mes);
    VISTA.vibrar([15, 40, 15]);
    if (ahorrado > 0) abrirReparto(ahorrado, mes);
    else VISTA.ir('mes');
  }

  function totalAsignado() {
    return Object.keys(asignado).reduce((a, k) => a + (asignado[k] || 0), 0);
  }

  function asignarA(nombre, monto) {
    const otros = totalAsignado() - (asignado[nombre] || 0);
    const tope = Math.max(0, porRepartir - otros);
    asignado[nombre] = Math.min(Math.round(monto), tope);
    if (!asignado[nombre]) delete asignado[nombre];
    pintarReparto();
  }

  function pintarReparto() {
    const metas = ESTADO.metasCalculadas();
    const sinAsignar = Math.max(0, porRepartir - totalAsignado());

    VISTA.pintar(document.getElementById('pantalla-reparto'), [
      h('div.cabeza-hoja', [
        boton('salir', { onClick: () => VISTA.ir('mes') }, 'Más tarde'),
        h('span.etiqueta', mesDelReparto
          ? FMT.nombreMesAnio(mesDelReparto) + ' cerrado'
          : 'Repartir ahorro')
      ]),

      h('div.margen.regla-fuerte', { estilo: { padding: '20px 26px 16px' } }, [
        h('span.etiqueta', 'Por repartir'),
        h('div.saldo-cifra', { estilo: { paddingTop: '6px' } }, [
          h('span.saldo-signo', { estilo: { fontSize: '28px', color: 'var(--mut)' } }, CONFIG.SIMBOLO || '$'),
          h('span.saldo-numero', {
            estilo: { fontSize: '50px', color: sinAsignar > 0 ? 'var(--acc)' : 'var(--ink)' }
          }, FMT.miles(sinAsignar))
        ]),
        h('p.nota.suelta', { estilo: { marginTop: '8px' } },
          'Tienes ' + metas.length + (metas.length === 1 ? ' meta activa' : ' metas activas')
          + '. Elige a cuáles va el dinero y cuánto a cada una.')
      ]),

      h('div.margen', { estilo: { padding: '12px 26px 0' } },
        h('div.chips', [
          boton('boton-pequeno', { onClick: partesIguales }, 'Partes iguales'),
          boton('boton-pequeno', { onClick: porOrden }, 'Por orden'),
          boton('boton-pequeno', { onClick: () => { asignado = {}; pintarReparto(); } }, 'Limpiar')
        ])),

      h('div.desliza.margen', { estilo: { padding: '8px 26px 0' } }, [
        metas.map(m => {
          const monto = asignado[m.nombre] || 0;
          const otros = totalAsignado() - monto;
          const disponible = Math.max(0, porRepartir - otros);
          return h('div.reparto-meta', [
            boton('nombre', { onClick: () => ANOTAR.asignarReparto(m, disponible) },
                  m.nombre || 'Meta sin nombre'),
            boton('monto' + (monto ? '' : ' vacio'),
                  { onClick: () => ANOTAR.asignarReparto(m, disponible) },
                  monto ? FMT.dinero(monto) : '—'),
            h('span.pista', m.completa
              ? 'ya completa · ' + FMT.dinero(m.guardado)
              : 'faltan ' + FMT.dinero(m.falta) + ' de ' + FMT.dinero(m.objetivo)),
            boton('accion' + (monto ? ' quita' : ''), {
              onClick: () => monto
                ? asignarA(m.nombre, 0)
                : asignarA(m.nombre, Math.min(disponible, m.falta > 0 ? m.falta : disponible))
            }, monto ? 'quitar' : (disponible > 0 ? 'todo lo que queda' : ''))
          ]);
        }),
        h('div.respiro')
      ]),

      h('div.pie', [
        boton('boton tinta', { onClick: confirmar },
              sinAsignar > 0 && totalAsignado() === 0 ? 'Dejarlo sin asignar' : 'Guardar reparto'),
        h('span.nota.centrada', sinAsignar > 0
          ? FMT.dinero(sinAsignar) + ' quedará sin destino y podrás repartirlo después desde Ahorro.'
          : 'Todo repartido.')
      ])
    ]);
  }

  /** Partes iguales, redondeando a miles para que no salgan cifras con cola.
   *  El resto se lo lleva la última meta: repartir 100.001 entre tres no puede
   *  dar tres cifras redondas, y falsear el total sería peor. */
  function partesIguales() {
    const metas = ESTADO.estado().datos.metas;
    if (!metas.length) return;
    const base = Math.floor(porRepartir / metas.length / 1000) * 1000;
    asignado = {};
    metas.forEach((m, i) => {
      asignado[m.nombre] = i === metas.length - 1 ? porRepartir - base * (metas.length - 1) : base;
    });
    pintarReparto();
  }

  /** Llena la primera meta hasta completarla, luego la segunda, y así. Es cómo
   *  se ahorra de verdad cuando hay una prioridad clara. */
  function porOrden() {
    let queda = porRepartir;
    asignado = {};
    ESTADO.metasCalculadas().forEach(m => {
      const da = Math.min(queda, Math.max(0, m.falta));
      if (da > 0) { asignado[m.nombre] = da; queda -= da; }
    });
    pintarReparto();
  }

  async function confirmar() {
    const asignaciones = Object.keys(asignado)
      .filter(nombre => asignado[nombre] > 0)
      .map(nombre => ({ meta: nombre, monto: asignado[nombre] }));
    if (asignaciones.length) await ESTADO.repartir(mesDelReparto || ESTADO.mesEnCurso(), asignaciones);
    asignado = {};
    porRepartir = 0;
    VISTA.ir('ahorro');
  }

  function pintar() {
    pintarAhorro();
    if (VISTA.actual() === 'reparto') pintarReparto();
  }

  return { pintar, abrirReparto, cerrarMesYRepartir, asignarA };
})();
