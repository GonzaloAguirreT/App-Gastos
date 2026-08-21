/**
 * El modelo: qué sabe la app y cómo se calcula el mes.
 *
 * Dos mundos que no hay que mezclar:
 *
 *   `datos`   es lo que hay en la hoja. Lo lee la acción `mes` del backend y se
 *             guarda en IndexedDB para poder pintar la app sin red.
 *   `ajustes` es lo de ESTE teléfono: la conexión, quién anota aquí, su cuenta
 *             habitual y el tema. No viaja a la hoja.
 *
 * El plan del mes, el límite de aviso y los avisos NO son ajustes del teléfono
 * aunque lo parezcan: son de los dos, y por eso viven en la hoja. Si Camila
 * sube el plan, Gonzalo tiene que verlo subido.
 *
 * Toda escritura hace dos cosas, en este orden: cambia `datos` en memoria para
 * que la pantalla responda al instante, y encola la operación para el backend.
 * La hoja es la verdad, pero la verdad puede tardar; la app no.
 */
const ESTADO = (() => {

  const oyentes = [];
  /* Alguien tiene que enterarse de que hay algo nuevo en la cola para intentar
     enviarlo. Antes no lo hacía nadie: el gasto se quedaba en el teléfono hasta
     que salías de la app y volvías, y mientras tanto la hoja no sabía nada. */
  let alEncolar = null;

  const datosVacios = {
    hoy: FMT.iso(),
    config: { plan: CONFIG.PLAN, limite: CONFIG.LIMITE, avisos: { fijo: true, saldo: true, semanal: false } },
    personas: CONFIG.PERSONAS.map((nombre, i) => ({ nombre, color: CONFIG.COLORES_PERSONA[i] || CONFIG.COLORES_PERSONA[0] })),
    cuentas: CONFIG.CUENTAS.slice(),
    categorias: CONFIG.CATEGORIAS.map(c => Object.assign({}, c)),
    movimientos: [],
    fijos: [],
    metas: [],
    cierres: []
  };

  let datos = clonar(datosVacios);
  let ajustes = { endpoint: '', token: '', persona: '', cuenta: '', tema: 'sistema', onboarding: false };
  let pendientes = 0;
  let enLinea = navigator.onLine !== false;
  let ultimoFallo = '';
  let sincronizando = false;

  function clonar(x) { return JSON.parse(JSON.stringify(x)); }

  /** Identificador de una operación. `crypto.randomUUID` necesita contexto
   *  seguro; en Pages lo hay, pero en un `file://` de pruebas no, y sin el
   *  respaldo la app moría al guardar el primer gasto. */
  function uuid() {
    if (self.crypto && self.crypto.randomUUID) return self.crypto.randomUUID();
    return 'x-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function emitir() { oyentes.forEach(f => f()); }
  function suscribir(f) { oyentes.push(f); }
  function cuandoSeEncole(f) { alEncolar = f; }

  /* ------------------------------------------------------------ lectura */

  function estado() {
    return { datos, ajustes, pendientes, enLinea, ultimoFallo, sincronizando };
  }

  function configurada() { return Boolean(ajustes.endpoint && ajustes.token); }

  function hoy() { return datos.hoy || FMT.iso(); }
  function mesEnCurso() { return FMT.mesDe(hoy()); }

  /**
   * ¿Se puede cerrar este mes ya?
   *
   * Solo si ya terminó, o si le quedan uno o dos días. Cerrar un mes a mitad no
   * tiene ningún uso y sí un efecto feo: la hoja lo archiva y lo vacía, la
   * pantalla Mes pasa a solo lectura, y como no existe ningún otro mes las dos
   * flechas se quedan apagadas. La app entera se queda mirando un agosto
   * cerrado hasta el 1 de septiembre.
   *
   * Pasó de verdad. El botón estaba siempre disponible y no avisaba de nada.
   */
  function sePuedeCerrar(mes) {
    const actual = mesEnCurso();
    if (mes < actual) return true;               // un mes pasado, siempre
    if (mes > actual) return false;              // uno que no ha empezado, nunca
    const total = FMT.diasDelMes(mes);
    return Number(hoy().slice(8)) >= total - 1;  // el actual, en sus últimos días
  }

  /** Deshacer un cierre: borra su fila y el mes vuelve a estar en curso. */
  async function reabrirMes(mes) {
    datos.cierres = datos.cierres.filter(c => c.mes !== mes);
    emitir();
    await encolar('cierre-baja', { uuid: uuid(), mes: mes });
  }

  function persona(nombre) {
    return datos.personas.find(p => p.nombre === nombre) || null;
  }

  function colorPersona(nombre) {
    const i = datos.personas.findIndex(p => p.nombre === nombre);
    const guardado = i >= 0 ? datos.personas[i].color : null;
    return guardado || CONFIG.COLORES_PERSONA[(i < 0 ? 0 : i) % CONFIG.COLORES_PERSONA.length];
  }

  /** El reparto de una categoría: la regla de "el arriendo sí, la ropa no".
   *  Se pregunta a la lista, no al movimiento, para no tener que contestarlo
   *  cada vez. */
  function repartoDe(categoria) {
    const c = datos.categorias.find(x => x.nombre === categoria);
    return c && c.reparto === 'Común' ? 'Común' : 'Personal';
  }

  function categoriasDe(tipo) {
    return datos.categorias.filter(c => c.tipo === tipo).map(c => c.nombre);
  }

  /* -------------------------------------------------------------- fijos */

  /**
   * ¿Cae este fijo en ese mes?
   *
   * `prox` es la fecha del siguiente cargo y la calcula el backend: es la única
   * fuente fiable de "qué cae en septiembre". Desde ahí se va sumando `cada`
   * meses; si con eso se llega justo a `mes`, cae. Con cuotas, además, hay que
   * no haberlas agotado antes de llegar.
   *
   * Un cargo trimestral aparece ENTERO en su mes, sin prorratear. Es una
   * decisión explícita: el dinero sale de golpe y el mes en que sale es el que
   * te deja sin saldo.
   */
  function caeEn(fijo, mes) {
    if (!fijo.activo || !fijo.prox) return false;
    const cada = Math.max(1, Number(fijo.cada) || 1);
    const salto = FMT.mesesEntre(FMT.mesDe(fijo.prox), mes);
    if (salto < 0 || salto % cada !== 0) return false;
    const vueltas = salto / cada;
    if (fijo.cuotas > 0 && vueltas >= (Number(fijo.restantes) || 0)) return false;
    return true;
  }

  /** ¿Ya está cobrado en ese mes? Lo dice la fila que el fijo escribió en
   *  Movimientos, que es el hecho; `ultimo` es solo el respaldo si esa fila
   *  todavía no ha llegado del backend. */
  function cargadoEn(fijo, mes) {
    const marca = 'fijo-' + fijo.uuid + '-' + mes;
    if (datos.movimientos.some(m => m.uuid === marca)) return true;
    return Boolean(fijo.ultimo && FMT.mesDe(fijo.ultimo) === mes);
  }

  /** Los fijos que tocan en un mes: los que aún tienen que salir y los que ya
   *  salieron. Sin los segundos, la lista de agosto se vaciaría sola a medida
   *  que avanza el mes. */
  function fijosDelMes(mes, tipo = null) {
    return datos.fijos
      .filter(f => f.activo !== false)
      .filter(f => tipo === null || f.tipo === tipo)
      .filter(f => caeEn(f, mes) || cargadoEn(f, mes));
  }

  function diaDeCargo(fijo, mes) {
    return FMT.diaDelMes(mes, Number(fijo.dia) || 1);
  }

  /* ------------------------------------------------------ el mes en curso */

  function movimientosDe(mes) {
    return datos.movimientos.filter(m => FMT.mesDe(m.fecha) === mes);
  }

  /**
   * Las cifras del mes. Es el cálculo del que cuelga toda la pantalla Mes.
   *
   * Lo que ya salió está en Movimientos —los fijos escriben su fila el día que
   * se cobran—, así que `gastado` no hay que componerlo: es la suma de los
   * gastos del mes. Lo que falta por salir son los fijos que aún no han
   * escrito su fila. Sumar las dos cosas sería contarlo dos veces.
   */
  function resumen(mes) {
    const movs = movimientosDe(mes);
    const gastos = movs.filter(m => m.tipo === 'Gasto');
    const gastado = suma(gastos);
    const entrado = suma(movs.filter(m => m.tipo === 'Ingreso'));

    const porVenir = suma(fijosDelMes(mes, 'Gasto').filter(f => !cargadoEn(f, mes)), 'importe');
    const porEntrar = suma(fijosDelMes(mes, 'Ingreso').filter(f => !cargadoEn(f, mes)), 'importe');

    const plan = Number(datos.config.plan) || 0;
    const comun = suma(gastos.filter(m => m.reparto === 'Común'));

    return {
      mes,
      plan,
      gastado,
      entrado,
      porVenir,
      porEntrar,
      queda: plan - gastado - porVenir,
      comun,
      personal: gastado - comun,
      /* El plan ES el ingreso. Gonzalo y Camila lo fijan cada mes a partir de
         lo que van a cobrar, así que el sueldo no se anota en la app: ya está
         dentro del plan. Lo que sí se anota —un bono, una devolución— se suma
         encima, porque eso es dinero que el plan no contemplaba.
         Si algún día se anotara un sueldo se contaría dos veces; por eso la
         nota de la pantalla enseña la resta entera en vez de solo el total. */
      ahorro: plan + entrado + porEntrar - gastado - porVenir,
      porPersona: datos.personas.map(p => {
        const suyos = gastos.filter(m => m.persona === p.nombre);
        return {
          nombre: p.nombre,
          color: colorPersona(p.nombre),
          total: suma(suyos),
          cuantos: suyos.length,
          parte: plan ? Math.max(0, Math.min(100, (suma(suyos) / plan) * 100)) : 0
        };
      })
    };
  }

  function suma(lista, campo = 'importe') {
    return lista.reduce((a, x) => a + (Number(x[campo]) || 0), 0);
  }

  /** Los cuatro meses siguientes, con lo que cae en cada uno. Sin prorratear:
   *  el mes del trimestral se ve más caro porque lo es. */
  function proximosMeses(desde, cuantos = 4) {
    const referencia = fijosDelMes(desde, 'Gasto').length;
    return Array.from({ length: cuantos }, (_, i) => {
      const mes = FMT.mesMas(desde, i + 1);
      const caen = datos.fijos.filter(f => f.activo !== false && f.tipo === 'Gasto' && caeEn(f, mes));
      const nombres = caen.map(f => f.concepto);
      return {
        mes,
        nombre: FMT.cap(FMT.nombreMes(mes)),
        detalle: nombres.length
          ? nombres.slice(0, 2).join(', ') + (nombres.length > 2 ? ' +' + (nombres.length - 2) : '')
          : 'nada previsto',
        total: suma(caen, 'importe'),
        // Se marca el mes que trae más cargos que este: es el del salto.
        salta: caen.length > referencia
      };
    });
  }

  /* -------------------------------------------------------------- ahorro */

  function acumulado() { return datos.cierres.reduce((a, c) => a + (Number(c.ahorrado) || 0), 0); }

  /** Lo ahorrado que todavía no tiene meta. Es el número que abre el reparto. */
  function sinAsignar() {
    const guardado = datos.metas.reduce((a, m) => a + (Number(m.guardado) || 0), 0);
    return acumulado() - guardado;
  }

  /**
   * Las metas con su avance y el plazo estimado.
   *
   * El plazo acumula lo que falta de las metas anteriores, no solo lo suyo: si
   * el ahorro va por orden, la segunda meta no empieza hasta que la primera
   * esté cubierta, y decir lo contrario sería mentir con buenas intenciones.
   */
  function metasCalculadas() {
    const cerrados = datos.cierres.length;
    const ritmo = cerrados ? acumulado() / cerrados : 0;
    let faltaAcumulada = 0;
    return datos.metas.map(m => {
      const objetivo = Number(m.objetivo) || 0;
      const guardado = Math.max(0, Math.min(Number(m.guardado) || 0, objetivo));
      const falta = objetivo - guardado;
      faltaAcumulada += falta;
      return {
        nombre: m.nombre,
        objetivo,
        guardado,
        falta,
        completa: falta <= 0,
        avance: objetivo ? Math.max(0, Math.min(100, (guardado / objetivo) * 100)) : 0,
        meses: ritmo > 0 ? Math.ceil(faltaAcumulada / ritmo) : null
      };
    });
  }

  /* ------------------------------------------------------------ arranque */

  async function iniciar() {
    ajustes = await NUCLEO.leerAjustes();
    const guardado = await NUCLEO.leerMes();
    if (guardado && guardado.datos) datos = fusionar(guardado.datos);
    pendientes = await NUCLEO.contar();
    emitir();
  }

  /** Lo que llega de la hoja manda, pero si una lista viene vacía nos quedamos
   *  con la semilla: una app sin categorías no deja anotar nada, y eso es peor
   *  que una lista desactualizada. */
  function fusionar(nuevos) {
    const base = clonar(datosVacios);
    const salida = Object.assign(base, nuevos);
    if (!salida.personas || !salida.personas.length) salida.personas = base.personas;
    if (!salida.cuentas || !salida.cuentas.length) salida.cuentas = base.cuentas;
    if (!salida.categorias || !salida.categorias.length) salida.categorias = base.categorias;
    salida.config = Object.assign({}, base.config, nuevos.config || {});
    /* El mes de un cierre viene de una celda, y Sheets convierte "2026-08" en
       una fecha de verdad al guardarla. Se normaliza al entrar para que ninguna
       pantalla tenga que preguntarse de qué tipo es lo que le han dado. */
    salida.cierres = (salida.cierres || []).map(c => Object.assign({}, c, { mes: FMT.aMes(c.mes) }));
    return salida;
  }

  /** Trae el mes de la hoja. Si falla, se sigue con lo que había: la app tiene
   *  que servir sin cobertura, y quedarse en blanco por un fallo de red sería
   *  peor que enseñar los números de ayer. */
  async function sincronizar({ silencioso = false } = {}) {
    if (!configurada() || sincronizando) return false;
    sincronizando = true;
    if (!silencioso) emitir();
    try {
      const respuesta = await NUCLEO.consultarMes();
      datos = fusionar(respuesta.datos || respuesta);
      await NUCLEO.guardarMes(datos);
      enLinea = true;
      ultimoFallo = '';
      return true;
    } catch (error) {
      /* Si el error lo manda el backend, hay conexión: la petición ha llegado y
         ha vuelto con un "no". Marcarlo como sin conexión hacía que la app
         culpara a la cobertura de un problema que estaba contando el servidor. */
      enLinea = Boolean(error.delServidor);
      ultimoFallo = String(error.message || error);
      return false;
    } finally {
      sincronizando = false;
      pendientes = await NUCLEO.contar();
      emitir();
    }
  }

  async function refrescarPendientes() {
    pendientes = await NUCLEO.contar();
    ultimoFallo = await NUCLEO.ultimoError();
    emitir();
  }

  /* ---------------------------------------------------------- escrituras */

  /** Encola una operación y repinta. Todo lo que escribe pasa por aquí. */
  async function encolar(accion, fila, { esperarDeshacer = false } = {}) {
    fila.uuid = fila.uuid || uuid();
    await NUCLEO.encolar([fila], fila.uuid, accion, esperarDeshacer);
    pendientes = await NUCLEO.contar();
    emitir();
    if (alEncolar) alEncolar();
    return fila.uuid;
  }

  async function anotar({ tipo, categoria, descripcion, importe, cuenta, persona: quien, fecha }) {
    const fila = {
      uuid: uuid(),
      fecha: fecha || hoy(),
      tipo,
      categoria,
      descripcion: (descripcion || '').trim(),
      importe: Math.round(importe),
      cuenta,
      persona: quien,
      reparto: repartoDe(categoria),
      origen: 'app'
    };
    datos.movimientos.unshift(fila);
    // La ventana de deshacer solo tiene sentido en lo que se puede deshacer, y
    // un movimiento recién anotado se borra desde su propio detalle.
    await NUCLEO.encolar([fila], fila.uuid, 'movimientos', false);
    pendientes = await NUCLEO.contar();
    emitir();
    if (alEncolar) alEncolar();
    return fila;
  }

  async function editarMovimiento(uuidMov, cambios) {
    const m = datos.movimientos.find(x => x.uuid === uuidMov);
    if (!m) return;
    Object.assign(m, cambios);
    if (cambios.categoria) m.reparto = repartoDe(cambios.categoria);
    await encolar('movimiento-edita', { uuid: uuid(), objetivo: uuidMov, cambios: Object.assign({}, cambios, { reparto: m.reparto }) });
  }

  /**
   * Borra un movimiento con red debajo.
   *
   * La fila desaparece de la pantalla ya, pero la orden de borrado espera en la
   * cola los mismos siete segundos que dura el aviso. Si tocas Deshacer, la
   * orden se retira antes de salir y la hoja no llega a enterarse.
   */
  async function borrarMovimiento(uuidMov) {
    const i = datos.movimientos.findIndex(x => x.uuid === uuidMov);
    if (i < 0) return null;
    const [quitado] = datos.movimientos.splice(i, 1);
    const orden = uuid();
    await NUCLEO.encolar([{ uuid: orden, objetivo: uuidMov }], orden, 'movimiento-baja', true);
    pendientes = await NUCLEO.contar();
    emitir();
    if (alEncolar) alEncolar();

    return async () => {
      await NUCLEO.borrarGrupo(orden);
      datos.movimientos.splice(i, 0, quitado);
      pendientes = await NUCLEO.contar();
      emitir();
    };
  }

  async function guardarFijo(fijo) {
    const existente = datos.fijos.find(f => f.uuid === fijo.uuid);
    if (existente) Object.assign(existente, fijo);
    else datos.fijos.push(Object.assign({ activo: true, ultimo: '' }, fijo));
    await encolar('fijo', Object.assign({ uuid: uuid() }, { fijo: fijo }));
  }

  async function borrarFijo(uuidFijo) {
    const i = datos.fijos.findIndex(f => f.uuid === uuidFijo);
    if (i < 0) return null;
    const [quitado] = datos.fijos.splice(i, 1);
    const orden = uuid();
    await NUCLEO.encolar([{ uuid: orden, objetivo: uuidFijo }], orden, 'fijo-baja', true);
    pendientes = await NUCLEO.contar();
    emitir();
    if (alEncolar) alEncolar();

    return async () => {
      await NUCLEO.borrarGrupo(orden);
      datos.fijos.splice(i, 0, quitado);
      pendientes = await NUCLEO.contar();
      emitir();
    };
  }

  /**
   * Marca un fijo como cobrado, o deshace la marca.
   *
   * Cobrar un fijo es escribir su fila en Movimientos: no hay un campo
   * "cargado" que valga, porque lo que cuenta en el mes es la fila. Aquí se
   * escribe la versión optimista con el mismo uuid determinista que usará el
   * backend, `fijo-<uuid>-<mes>`, para que cuando llegue la hoja de verdad no
   * aparezca dos veces.
   */
  async function marcarFijo(uuidFijo, mes, cargado) {
    const fijo = datos.fijos.find(f => f.uuid === uuidFijo);
    if (!fijo) return;
    const marca = 'fijo-' + uuidFijo + '-' + mes;

    if (cargado) {
      if (!datos.movimientos.some(m => m.uuid === marca)) {
        datos.movimientos.unshift({
          uuid: marca,
          fecha: diaDeCargo(fijo, mes),
          tipo: fijo.tipo,
          categoria: fijo.concepto,
          descripcion: '',
          importe: Number(fijo.importe) || 0,
          cuenta: fijo.cuenta,
          persona: fijo.persona,
          reparto: fijo.reparto,
          origen: 'fijo'
        });
      }
    } else {
      datos.movimientos = datos.movimientos.filter(m => m.uuid !== marca);
      if (fijo.ultimo && FMT.mesDe(fijo.ultimo) === mes) fijo.ultimo = '';
    }

    await encolar('fijo-cargo', { uuid: uuid(), objetivo: uuidFijo, mes, cargado });
  }

  async function cerrarMes(mes) {
    const r = resumen(mes);
    datos.cierres.unshift({
      mes,
      entrado: r.entrado + r.porEntrar,
      gastado: r.gastado + r.porVenir,
      plan: r.plan,
      ahorrado: r.ahorro,
      repartido: 0,
      sinAsignar: r.ahorro
    });
    await encolar('cerrar-mes', { uuid: uuid(), mes });
    return r.ahorro;
  }

  /** Asignaciones: [{meta, monto}]. Se escriben como líneas en Reparto, que es
   *  el libro mayor del ahorro: lo guardado en cada meta se deduce de ahí, no
   *  se apunta a mano, y por eso siempre cuadra. */
  async function repartir(mes, asignaciones) {
    asignaciones.forEach(a => {
      const meta = datos.metas.find(m => m.nombre === a.meta);
      if (meta) meta.guardado = (Number(meta.guardado) || 0) + a.monto;
    });
    const cierre = datos.cierres.find(c => c.mes === mes);
    if (cierre) {
      const total = asignaciones.reduce((a, x) => a + x.monto, 0);
      cierre.repartido = (Number(cierre.repartido) || 0) + total;
      cierre.sinAsignar = (Number(cierre.ahorrado) || 0) - cierre.repartido;
    }
    await encolar('reparto', { uuid: uuid(), mes, asignaciones });
  }

  async function guardarMetas(metas) {
    datos.metas = metas;
    await encolar('metas', { uuid: uuid(), metas });
  }

  /** Escribe en la pestaña Config o en Listas. Lo que se toca desde Ajustes y
   *  es de los dos pasa por aquí. */
  async function guardarConfig(cambios) {
    if (cambios.config) Object.assign(datos.config, cambios.config);
    if (cambios.categorias) datos.categorias = cambios.categorias;
    if (cambios.cuentas) datos.cuentas = cambios.cuentas;
    if (cambios.personas) datos.personas = cambios.personas;
    await encolar('config', Object.assign({ uuid: uuid() }, cambios));
  }

  async function guardarAjustes(cambios) {
    ajustes = await NUCLEO.guardarAjustes(cambios);
    emitir();
    return ajustes;
  }

  function marcarConexion(hay) {
    enLinea = hay;
    emitir();
  }

  return {
    suscribir, cuandoSeEncole, estado, configurada, uuid,
    hoy, mesEnCurso, persona, colorPersona, repartoDe, categoriasDe,
    caeEn, cargadoEn, fijosDelMes, diaDeCargo, movimientosDe, resumen,
    proximosMeses, acumulado, sinAsignar, metasCalculadas,
    iniciar, sincronizar, refrescarPendientes, marcarConexion,
    sePuedeCerrar, reabrirMes,
    anotar, editarMovimiento, borrarMovimiento,
    guardarFijo, borrarFijo, marcarFijo,
    cerrarMes, repartir, guardarMetas, guardarConfig, guardarAjustes
  };
})();
