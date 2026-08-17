/**
 * Backend de la app de gastos. Se pega tal cual en el editor de Apps Script de
 * la hoja de cálculo y se despliega como aplicación web.
 *
 * Hace tres cosas:
 *   - doPost: recibe un movimiento, valida el token, y escribe una fila.
 *   - doGet:  devuelve los últimos movimientos y los totales del mes.
 *   - instalar(): crea las hojas y las cabeceras la primera vez.
 *
 * El token NO está en este archivo: vive en las Propiedades del Script. Así no
 * se te escapa si alguna vez copias este código a algún sitio.
 */

const HOJA_MOVIMIENTOS = 'Movimientos';

/* Los UUID van en una hoja aparte y no en una columna oculta de Movimientos.
   Una séptima columna, aunque esté oculta, ensancha el rango que lee Power
   Query y puede colarse en la tabla del Excel. Mejor no tocar esa hoja. */
const HOJA_UUIDS = '_uuids';

/* La séptima columna, Usuario, se añadió después. Va al final a propósito: así
   ninguna de las seis originales cambia de sitio y nada de lo que ya apuntaba a
   ellas se rompe. */
const CABECERAS = ['Fecha', 'Concepto', 'Importe', 'Cuenta', 'Tipo', 'Categoría', 'Usuario'];

/* Quién puede gastar. Tiene que decir exactamente lo mismo que CONFIG.USUARIOS
   en config.js: de aquí salen las columnas del panel y la lista desplegable de
   la columna Usuario. */
const USUARIOS = ['Gonzalo', 'Camila'];

/* Las categorías de gasto, para las filas del panel y la torta. Tienen que
   decir lo mismo que CONFIG.CATEGORIAS_GASTO en config.js.

   Se listan aquí en vez de sacarlas de la hoja con UNIQUE a propósito: así el
   panel enseña las doce SIEMPRE, también las que este mes están a cero, y de un
   vistazo se ve en qué no has gastado. Con UNIQUE aparecerían y desaparecerían
   filas según el mes, y el gráfico cambiaría de colores cada vez. */
const CATEGORIAS_GASTO = [
  'Alimentación', 'Restaurantes', 'Transporte', 'Vivienda',
  'Suministros', 'Salud', 'Ocio', 'Compras',
  'Suscripciones', 'Deudas', 'Viajes', 'Otros'
];

const HOJA_PANEL = 'Panel';

/* Además del panel global hay uno por persona. Se llaman "Panel Gonzalo" y
   "Panel Camila": el prefijo los agrupa al ordenar las pestañas. */
function nombrePanelDe(usuario) { return HOJA_PANEL + ' ' + usuario; }
const TIPOS_VALIDOS = ['Ingreso', 'Gasto'];

/* Los traspasos entre cuentas propias no son ni ingreso ni gasto: el dinero no
   entra ni sale de tu patrimonio, solo cambia de sitio. Se guardan como DOS
   filas —una de Gasto en la cuenta de origen y una de Ingreso en la de destino,
   ambas con esta categoría— para que los saldos por cuenta salgan bien, y los
   totales del mes las descuentan. Si cambias este texto, cámbialo también en
   config.js y en la hoja de configuración del Excel. */
const CATEGORIA_TRASPASO = 'Traspaso';

/* Las suscripciones no se guardan como gastos futuros sino como definiciones.
   Un disparador diario escribe el cobro el día que toca.

   La alternativa —escribir de golpe todos los cobros al darla de alta— no vale:
   con duración indefinida no hay un número de filas que escribir, y si la
   cancelas te quedan meses de gastos fantasma que hay que borrar a mano. */
const HOJA_SUSCRIPCIONES = 'Suscripciones';

const CABECERAS_SUSCRIPCIONES = [
  'UUID', 'Alta', 'Concepto', 'Importe', 'Cuenta', 'Categoría',
  'Usuario', 'Frecuencia', 'Inicio', 'Fin', 'Activa', 'Último cobro'
];

const MESES_POR_FRECUENCIA = { 'Mensual': 1, 'Trimestral': 3, 'Anual': 12 };

/* ========================================================================
   Instalación
   ======================================================================== */

/**
 * Ejecútala UNA vez desde el editor (botón ▷ con "instalar" seleccionado).
 * Crea las dos hojas con sus cabeceras si no existen. No toca nada de lo que
 * ya haya escrito.
 */
function instalar() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();

  let movimientos = libro.getSheetByName(HOJA_MOVIMIENTOS);
  if (!movimientos) {
    movimientos = libro.insertSheet(HOJA_MOVIMIENTOS);
  }
  if (movimientos.getLastRow() === 0) {
    movimientos.appendRow(CABECERAS);
    movimientos.getRange(1, 1, 1, CABECERAS.length).setFontWeight('bold');
    movimientos.setFrozenRows(1);
  }
  /* Formato de las columnas de fecha e importe. Se aplica a la columna entera
     y ADEMÁS a las filas que ya existan: fijar solo la columna no bastó, las
     filas escritas con appendRow acababan mostrándose como dd/mm/yyyy. Volver
     a ejecutar instalar() repara las filas viejas. */
  formatoSeguro(movimientos.getRange('A2:A'), 'yyyy-mm-dd');
  formatoSeguro(movimientos.getRange('C2:C'), '0.00');

  const ultima = movimientos.getLastRow();
  if (ultima >= 2) {
    formatoSeguro(movimientos.getRange(2, 1, ultima - 1, 1), 'yyyy-mm-dd');
    formatoSeguro(movimientos.getRange(2, 3, ultima - 1, 1), '0.00');
  }

  /* La columna Usuario llegó después de las seis primeras. Si la hoja es de
     antes, se le pone la cabecera que falta. Las filas viejas se quedan con la
     celda vacía: rellenarlas a ciegas sería inventarse quién gastó. */
  if (movimientos.getRange(1, 7).getValue() !== 'Usuario') {
    movimientos.getRange(1, 7).setValue('Usuario').setFontWeight('bold');
  }

  normalizarUsuarios(movimientos);
  ponerListaDeUsuarios(movimientos);

  let uuids = libro.getSheetByName(HOJA_UUIDS);
  if (!uuids) {
    uuids = libro.insertSheet(HOJA_UUIDS);
    uuids.appendRow(['UUID', 'Recibido']);
    uuids.hideSheet();
  }

  prepararSuscripciones(libro);
  instalarDisparadorDiario();
  crearPanel(libro);

  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  const aviso = token
    ? 'TOKEN configurado. Todo listo.'
    : 'FALTA EL TOKEN: ve a Configuración del proyecto → Propiedades del script y crea una propiedad llamada TOKEN.';

  Logger.log('Hojas preparadas. ' + aviso);
  return aviso;
}

/**
 * Crea (o rehace) la hoja Panel: gasto por persona y mes, y un gráfico de torta
 * con el reparto del mes en curso.
 *
 * Todo son fórmulas, no valores volcados. Es lo que hace que sea dinámico: cada
 * fila nueva que escribe la app recalcula la tabla y el gráfico sin que nadie
 * ejecute nada. Un volcado con datos habría que refrescarlo a mano, y el día que
 * se te olvidara estarías mirando un panel viejo sin saberlo.
 *
 * Volver a ejecutar instalar() rehace las fórmulas pero no toca Movimientos.
 */
function crearPanel(libro) {
  crearHojaPanel(libro, HOJA_PANEL, USUARIOS, 'Gastos');
  USUARIOS.forEach(function (usuario) {
    crearHojaPanel(libro, nombrePanelDe(usuario), [usuario], 'Gastos de ' + usuario);
  });
}

/**
 * Pinta una hoja de panel para las personas que se le pasen.
 *
 * La misma función sirve para el panel global —con todos— y para el de cada
 * uno —con uno solo—, en vez de tener tres copias que se desincronicen a la
 * primera de cambio.
 *
 * @param {string} titulo cabecera de la hoja
 * @param {string[]} personas columnas de las tablas
 */
function crearHojaPanel(libro, nombreHoja, personas, titulo) {
  const MESES_MOSTRADOS = 12;
  const FILA_CABECERA = 4;
  const COL_USUARIO_1 = 2;
  /* Con una sola persona la columna Total repetiría la anterior, así que no se
     pone: una cifra duplicada al lado de sí misma solo hace dudar. */
  const hayTotal = personas.length > 1;
  const colTotal = COL_USUARIO_1 + personas.length;
  const colUltima = hayTotal ? colTotal : colTotal - 1;
  const colGrafico = colUltima + 2;

  const panel = hojaPanelLimpia(libro, nombreHoja);

  const sep = separadorDeFormulas(panel);

  panel.getRange(1, 1).setValue(titulo).setFontSize(14).setFontWeight('bold');
  panel.getRange(2, 1).setValue('Se actualiza solo. No escribas nada en esta hoja: son fórmulas.')
       .setFontColor('#888888');

  // ---- Tabla 1: cuánto se gasta cada mes
  panel.getRange(FILA_CABECERA, 1).setValue('Mes');
  personas.forEach(function (nombre, i) {
    panel.getRange(FILA_CABECERA, COL_USUARIO_1 + i).setValue(nombre);
  });
  if (hayTotal) panel.getRange(FILA_CABECERA, colTotal).setValue('Total');
  panel.getRange(FILA_CABECERA, 1, 1, colUltima).setFontWeight('bold');

  /* Los meses se calculan hacia atrás desde el actual, así que la tabla se
     desplaza sola con el calendario y nunca hay que añadir filas a mano. */
  const filaPrimerMes = FILA_CABECERA + 1;
  panel.getRange(filaPrimerMes, 1).setFormula('=EOMONTH(TODAY()' + sep + '-1)+1');
  for (var i = 1; i < MESES_MOSTRADOS; i++) {
    panel.getRange(filaPrimerMes + i, 1)
         .setFormula('=EDATE(A' + (filaPrimerMes + i - 1) + sep + '-1)');
  }
  formatoSeguro(panel.getRange(filaPrimerMes, 1, MESES_MOSTRADOS, 1), 'yyyy-mm');

  for (var f = 0; f < MESES_MOSTRADOS; f++) {
    const fila = filaPrimerMes + f;
    personas.forEach(function (nombre, u) {
      panel.getRange(fila, COL_USUARIO_1 + u).setFormula(
        formulaGasto('$A' + fila, letra(COL_USUARIO_1 + u) + '$' + FILA_CABECERA, sep));
    });
    if (hayTotal) {
      panel.getRange(fila, colTotal).setFormula(
        '=SUM(' + letra(COL_USUARIO_1) + fila + ':' + letra(colTotal - 1) + fila + ')');
    }
  }
  formatoSeguro(
    panel.getRange(filaPrimerMes, COL_USUARIO_1, MESES_MOSTRADOS, colUltima - COL_USUARIO_1 + 1),
    '#,##0.00 \u20ac');

  // ---- Tabla 2: en qué se va el dinero este mes
  const filaCabCategorias = filaPrimerMes + MESES_MOSTRADOS + 2;
  const filaPrimerCategoria = filaCabCategorias + 1;

  panel.getRange(filaCabCategorias, 1).setValue('Categoría (este mes)');
  personas.forEach(function (nombre, i) {
    panel.getRange(filaCabCategorias, COL_USUARIO_1 + i).setValue(nombre);
  });
  if (hayTotal) panel.getRange(filaCabCategorias, colTotal).setValue('Total');
  panel.getRange(filaCabCategorias, 1, 1, colUltima).setFontWeight('bold');

  CATEGORIAS_GASTO.forEach(function (categoria, i) {
    const fila = filaPrimerCategoria + i;
    panel.getRange(fila, 1).setValue(categoria);
    personas.forEach(function (nombre, u) {
      panel.getRange(fila, COL_USUARIO_1 + u).setFormula(
        formulaGastoCategoria('$A$' + filaPrimerMes,
                              letra(COL_USUARIO_1 + u) + '$' + filaCabCategorias,
                              '$A' + fila, sep));
    });
    if (hayTotal) {
      panel.getRange(fila, colTotal).setFormula(
        '=SUM(' + letra(COL_USUARIO_1) + fila + ':' + letra(colTotal - 1) + fila + ')');
    }
  });
  formatoSeguro(
    panel.getRange(filaPrimerCategoria, COL_USUARIO_1, CATEGORIAS_GASTO.length,
                   colUltima - COL_USUARIO_1 + 1),
    '#,##0.00 \u20ac');

  /* La torta va sobre las categorías y no sobre las personas: saber que te has
     gastado 400 € no dice nada; saber que 250 fueron en restaurantes, sí.

     Se le pasan dos rangos sueltos —los nombres y la columna de importes—
     porque en el panel global hay columnas de cada persona entre medias. */
  const grafico = panel.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(panel.getRange(filaCabCategorias, 1, CATEGORIAS_GASTO.length + 1, 1))
    .addRange(panel.getRange(filaCabCategorias, colUltima, CATEGORIAS_GASTO.length + 1, 1))
    .setPosition(FILA_CABECERA, colGrafico, 0, 0)
    .setOption('title', 'En qué se va el dinero este mes')
    .setOption('pieSliceText', 'percentage')
    .setOption('legend', { position: 'right' })
    .setOption('width', 480)
    .setOption('height', 320)
    .build();
  panel.insertChart(grafico);

  panel.setColumnWidth(1, 160);
  return panel;
}

/**
 * Devuelve la hoja del panel realmente vacía: la borra y la vuelve a crear.
 *
 * Antes se reutilizaba con clear(), y eso fue un error. clear() vacía el
 * contenido y el formato, pero no deshace lo que la hoja "es": si en algún
 * momento una columna quedó marcada como texto —o Sheets convirtió el rango en
 * una tabla, que fija el tipo de cada columna—, eso sobrevive al clear(). Al
 * reinstalar, setNumberFormat fallaba con "No puedes configurar el formato de
 * número de las celdas de una columna con texto" y se llevaba por delante el
 * instalar() entero, dejando unas hojas creadas y otras no.
 *
 * Una hoja nueva no arrastra nada. Se pierde solo lo que había dentro, que son
 * fórmulas que este mismo código vuelve a escribir dos líneas después.
 *
 * Se reinserta en la posición que ocupaba para que las pestañas no cambien de
 * sitio en cada reinstalación.
 */
function hojaPanelLimpia(libro, nombreHoja) {
  const vieja = libro.getSheetByName(nombreHoja);
  // getIndex() es 1-based; insertSheet() cuenta desde 0.
  let posicion = libro.getNumSheets();
  if (vieja) {
    posicion = vieja.getIndex() - 1;
    libro.deleteSheet(vieja);
  }
  return libro.insertSheet(nombreHoja, posicion);
}

/**
 * Aplica un formato de número sin poder tumbar la instalación.
 *
 * El formato es cosmético: que los euros salgan con dos decimales está bien,
 * pero no vale un panel a medias por ello. Si Sheets se niega, se anota en el
 * registro y se sigue.
 *
 * El flush() es la parte importante: Apps Script agrupa las escrituras y las
 * manda cuando le viene bien, así que sin él el error no salta aquí sino en la
 * siguiente llamada que fuerce el envío —en nuestro caso, el getRange() del
 * gráfico— y ni el try lo atrapa ni el rastro de pila señala al culpable.
 */
function formatoSeguro(rango, formato) {
  try {
    rango.setNumberFormat(formato);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log('No se pudo dar formato "' + formato + '" a ' +
               rango.getA1Notation() + ': ' + e.message);
  }
}

/**
 * Averigua si esta hoja separa los argumentos de una fórmula con coma o con
 * punto y coma.
 *
 * Hace falta porque setFormula() escribe la cadena tal cual, y una hoja en
 * español espera ';': ahí la coma es el separador decimal, así que
 * =EOMONTH(TODAY(),-1) no es "el mes anterior" sino un error de sintaxis. Este
 * panel salió entero con #ERROR! por eso.
 *
 * Se comprueba en vez de deducirlo del idioma: =SUM(1,1) da 2 donde la coma
 * separa argumentos, y 1,1 donde es el decimal. Así funciona con cualquier
 * configuración, incluidas las que no se me ocurran.
 */
function separadorDeFormulas(hoja) {
  const sonda = hoja.getRange(100, 20);
  sonda.setFormula('=SUM(1,1)');
  SpreadsheetApp.flush();
  const resultado = sonda.getValue();
  sonda.clear();
  return resultado === 2 ? ',' : ';';
}

/**
 * Suma los gastos de una persona en un mes.
 *
 * Excluye los traspasos: mover dinero de una cuenta propia a otra no es gasto
 * de nadie, y sin esta condición cada traspaso de 300 € aparecería como 300 €
 * gastados por quien lo hizo.
 *
 * @param {string} celdaMes celda con el día 1 del mes (referencia A1)
 * @param {string} celdaUsuario celda con el nombre de la persona
 * @param {string} sep separador de argumentos de esta hoja
 */
function formulaGasto(celdaMes, celdaUsuario, sep) {
  return '=SUMIFS(' + HOJA_MOVIMIENTOS + '!$C:$C' + sep +
         HOJA_MOVIMIENTOS + '!$E:$E' + sep + '"Gasto"' + sep +
         HOJA_MOVIMIENTOS + '!$F:$F' + sep + '"<>' + CATEGORIA_TRASPASO + '"' + sep +
         HOJA_MOVIMIENTOS + '!$G:$G' + sep + celdaUsuario + sep +
         HOJA_MOVIMIENTOS + '!$A:$A' + sep + '">="&' + celdaMes + sep +
         HOJA_MOVIMIENTOS + '!$A:$A' + sep + '"<"&EDATE(' + celdaMes + sep + '1))';
}

/**
 * Como formulaGasto, pero además filtrando por categoría. Es la que alimenta la
 * tabla de "en qué se va el dinero" y, con ella, el gráfico de torta.
 */
function formulaGastoCategoria(celdaMes, celdaUsuario, celdaCategoria, sep) {
  return '=SUMIFS(' + HOJA_MOVIMIENTOS + '!$C:$C' + sep +
         HOJA_MOVIMIENTOS + '!$E:$E' + sep + '"Gasto"' + sep +
         HOJA_MOVIMIENTOS + '!$F:$F' + sep + celdaCategoria + sep +
         HOJA_MOVIMIENTOS + '!$G:$G' + sep + celdaUsuario + sep +
         HOJA_MOVIMIENTOS + '!$A:$A' + sep + '">="&' + celdaMes + sep +
         HOJA_MOVIMIENTOS + '!$A:$A' + sep + '"<"&EDATE(' + celdaMes + sep + '1))';
}

/**
 * Deja la columna Usuario con los nombres actuales.
 *
 * Los nombres pasaron de "Gonzalo Aguirre" a "Gonzalo", y las filas ya escritas
 * se habrían quedado fuera de todas las sumas del panel sin que nada avisara:
 * los SUMIFS comparan texto exacto y simplemente no habrían encontrado nada.
 * Se emparejan por el nombre de pila, que es lo único que cambió.
 */
function normalizarUsuarios(hoja) {
  const ultima = hoja.getLastRow();
  if (ultima < 2) return 0;

  const rango = hoja.getRange(2, 7, ultima - 1, 1);
  const valores = rango.getValues();
  var cambiadas = 0;

  for (var i = 0; i < valores.length; i++) {
    const actual = String(valores[i][0] || '').trim();
    if (!actual || USUARIOS.indexOf(actual) !== -1) continue;

    const pila = actual.split(' ')[0];
    for (var u = 0; u < USUARIOS.length; u++) {
      if (USUARIOS[u].split(' ')[0] === pila) {
        valores[i][0] = USUARIOS[u];
        cambiadas++;
        break;
      }
    }
  }

  if (cambiadas) rango.setValues(valores);
  return cambiadas;
}

/** Lista desplegable en la columna Usuario, para cuando edites la hoja a mano y
 *  no tengas que acordarte de cómo se escribe exactamente cada nombre. */
function ponerListaDeUsuarios(hoja) {
  const regla = SpreadsheetApp.newDataValidation()
    .requireValueInList(USUARIOS, true)
    .setAllowInvalid(true)     // no bloquea: una fila vieja con otro nombre no debe dar error
    .setHelpText('Elige quién gastó')
    .build();
  hoja.getRange('G2:G').setDataValidation(regla);
}

/** Número de columna a letra: 2 → B. Hace falta porque las fórmulas se escriben
 *  en notación A1 y las columnas dependen de cuántos usuarios haya. */
function letra(columna) {
  var nombre = '';
  var n = columna;
  while (n > 0) {
    const resto = (n - 1) % 26;
    nombre = String.fromCharCode(65 + resto) + nombre;
    n = Math.floor((n - resto - 1) / 26);
  }
  return nombre;
}

/* ========================================================================
   Suscripciones
   ======================================================================== */

function prepararSuscripciones(libro) {
  let hoja = libro.getSheetByName(HOJA_SUSCRIPCIONES);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA_SUSCRIPCIONES);
    hoja.appendRow(CABECERAS_SUSCRIPCIONES);
    hoja.getRange(1, 1, 1, CABECERAS_SUSCRIPCIONES.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  formatoSeguro(hoja.getRange('I2:J'), 'yyyy-mm-dd');
  formatoSeguro(hoja.getRange('D2:D'), '0.00');

  /* Para cancelar una suscripción se pone Activa en FALSO. Una casilla evita
     tener que acordarse de si se escribe "no", "NO" o "false". */
  const casilla = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  hoja.getRange('K2:K').setDataValidation(casilla);
  return hoja;
}

/**
 * Disparador diario que escribe los cobros que toquen.
 *
 * Sin él las suscripciones no se cobran solas, que es todo el sentido de esto.
 * Se borran los que hubiera antes para que ejecutar instalar() varias veces no
 * acabe con cinco disparadores escribiendo lo mismo.
 */
function instalarDisparadorDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesarSuscripciones') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('procesarSuscripciones')
    .timeBased().everyDays(1).atHour(4).create();
}

function altaSuscripcion(s) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = prepararSuscripciones(libro);

  const problema = validarSuscripcion(s);
  if (problema) return { ok: false, error: problema };

  if (uuidYaRegistrado('alta-' + s.uuid)) return { ok: true, duplicado: true };

  const inicio = fechaDesdeISO(s.inicio);
  /* El fin se calcula aquí y no en el móvil: sumar meses tiene trampas —el 31
     de enero más un mes no existe— y prefiero una sola implementación. Se resta
     un día para que "3 meses" sean exactamente 3 cobros mensuales y no 4. */
  const fin = s.duracionMeses
    ? new Date(sumarMeses(inicio, Number(s.duracionMeses)).getTime() - 86400000)
    : '';

  hoja.appendRow([
    s.uuid, new Date(), s.concepto || '', Number(s.importe), s.cuenta,
    s.categoria, s.usuario || '', s.frecuencia, inicio, fin, true, ''
  ]);
  registrarUuid('alta-' + s.uuid);

  // Se cobra ya lo que corresponda, para que el primer cargo no espere a mañana.
  const escritos = procesarSuscripciones();
  return { ok: true, cobrosEscritos: escritos };
}

function validarSuscripcion(s) {
  if (!s || typeof s !== 'object') return 'Suscripción ausente';
  if (!s.uuid) return 'Falta el uuid';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.inicio))) return 'Fecha de inicio incorrecta';
  const importe = Number(s.importe);
  if (!isFinite(importe) || importe <= 0) return 'Importe no válido';
  if (!MESES_POR_FRECUENCIA[s.frecuencia]) return 'Frecuencia no válida';
  if (!s.cuenta) return 'Falta la cuenta';
  if (!s.categoria) return 'Falta la categoría';
  return null;
}

/**
 * Escribe los cobros pendientes de todas las suscripciones activas.
 *
 * Cada cobro lleva un UUID derivado de la suscripción y de su fecha, así que
 * ejecutar esto dos veces el mismo día no duplica nada: el segundo pasa por el
 * mismo control de duplicados que los movimientos normales.
 */
function procesarSuscripciones() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(HOJA_SUSCRIPCIONES);
  if (!hoja || hoja.getLastRow() < 2) return 0;

  const bloqueo = LockService.getScriptLock();
  if (!bloqueo.tryLock(30000)) return 0;

  var escritos = 0;
  try {
    const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1,
                                CABECERAS_SUSCRIPCIONES.length).getValues();
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);

    for (var i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (f[10] !== true) continue;                 // Activa desmarcada
      const paso = MESES_POR_FRECUENCIA[f[7]];
      if (!paso || !(f[8] instanceof Date)) continue;

      const inicio = f[8];
      const fin = f[9] instanceof Date ? f[9] : null;
      var ultimo = '';
      var terminada = false;

      /* Cada fecha se calcula desde el inicio, no sumando meses a la anterior.
         Encadenar sumas desvía la fecha: 31 de enero pasa a 28 de febrero y de
         ahí a 28 de marzo, y a los dos años cobras el día que no es. */
      for (var n = 0; n < 600; n++) {
        const fecha = sumarMeses(inicio, paso * n);

        /* El fin se mira ANTES que hoy: pasado el fin ya no habrá más cobros
           nunca, y es lo que permite desactivarla. Al revés, una suscripción
           acabada se recorrería entera todos los días para nada. */
        if (fin && fecha > fin) { terminada = true; break; }
        if (fecha > hoy) break;

        const iso = formatearISO(fecha);
        const uuid = 'sub-' + f[0] + '-' + iso;
        if (!uuidYaRegistrado(uuid)) {
          escribirMovimiento({
            fecha: iso, concepto: f[2], importe: f[3], cuenta: f[4],
            tipo: 'Gasto', categoria: f[5], usuario: f[6], uuid: uuid
          });
          registrarUuid(uuid);
          escritos++;
        }
        ultimo = iso;
      }

      if (ultimo) hoja.getRange(i + 2, 12).setValue(ultimo);
      if (terminada) hoja.getRange(i + 2, 11).setValue(false);
    }
  } finally {
    bloqueo.releaseLock();
  }

  Logger.log('Cobros de suscripción escritos: ' + escritos);
  return escritos;
}

/** Suma meses respetando los meses cortos: 31 de enero + 1 mes es 28 de
 *  febrero, no el 3 de marzo. */
function sumarMeses(fecha, meses) {
  const dia = fecha.getDate();
  const destino = new Date(fecha.getFullYear(), fecha.getMonth() + meses, 1);
  const ultimoDiaDelMes = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(dia, ultimoDiaDelMes));
  return destino;
}

/* ========================================================================
   Escritura
   ======================================================================== */

function doPost(e) {
  try {
    /* El cuerpo llega como texto plano, no como JSON, y es a propósito.
       Apps Script no contesta a las peticiones OPTIONS de preflight, así que la
       PWA manda Content-Type: text/plain para que el navegador la trate como
       petición simple y no haya preflight. Por eso aquí hay que parsear a mano
       en vez de leer e.postData como JSON. */
    if (!e || !e.postData || !e.postData.contents) {
      return responder({ ok: false, error: 'Petición sin cuerpo' });
    }

    const peticion = JSON.parse(e.postData.contents);

    if (!tokenValido(peticion.token)) {
      return responder({ ok: false, error: 'Token no válido' });
    }

    /* Las lecturas también entran por aquí, y no por doGet, aunque suene raro.

       El doGet funciona si abres la URL en el navegador, pero un fetch desde la
       PWA falla con "Failed to fetch": Apps Script contesta con una redirección
       a script.googleusercontent.com y ese salto se lleva por delante las
       cabeceras de CORS. Pasó de verdad en el despliegue de Gonzalo.

       El POST con Content-Type text/plain sí funciona, porque el navegador lo
       trata como petición simple. Así que la lectura viaja como POST. doGet se
       queda solo para comprobar a mano desde el navegador. */
    if (peticion.accion === 'suscripcion') {
      return responder(altaSuscripcion(peticion.suscripcion));
    }

    if (peticion.accion === 'resumen') {
      return responder(resumenDelMes(Number(peticion.n) || 10));
    }

    /* Se acepta un movimiento suelto o una lista. La lista existe por los
       traspasos, que son dos filas que tienen que entrar juntas o no entrar:
       media transferencia escrita descuadra los saldos de las dos cuentas. */
    const movimientos = peticion.movimientos ||
                        (peticion.movimiento ? [peticion.movimiento] : []);

    if (!movimientos.length) {
      return responder({ ok: false, error: 'Petición sin movimientos' });
    }

    // Se valida todo antes de escribir nada, por lo mismo.
    for (var i = 0; i < movimientos.length; i++) {
      const problema = validar(movimientos[i]);
      if (problema) return responder({ ok: false, error: problema });
    }

    /* Sin bloqueo, dos reintentos que lleguen a la vez pueden comprobar el UUID
       antes de que ninguno lo haya escrito, y los dos concluyen que es nuevo.
       Resultado: el gasto duplicado que precisamente queríamos evitar. */
    const bloqueo = LockService.getScriptLock();
    if (!bloqueo.tryLock(20000)) {
      return responder({ ok: false, error: 'El script está ocupado, reinténtalo' });
    }

    var escritos = 0, duplicados = 0;
    try {
      for (var j = 0; j < movimientos.length; j++) {
        const m = movimientos[j];
        // Un UUID ya visto no es un error: es un reintento de algo guardado. La
        // app necesita un ok para poder sacarlo de la cola.
        if (uuidYaRegistrado(m.uuid)) { duplicados++; continue; }
        escribirMovimiento(m);
        registrarUuid(m.uuid);
        escritos++;
      }
    } finally {
      bloqueo.releaseLock();
    }

    return responder({ ok: true, escritos: escritos, duplicados: duplicados });

  } catch (error) {
    return responder({ ok: false, error: String(error) });
  }
}

function escribirMovimiento(m) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOVIMIENTOS);
  if (!hoja) throw new Error('No existe la hoja ' + HOJA_MOVIMIENTOS + '. Ejecuta instalar().');

  // El orden de este array ES el contrato de columnas. No reordenar.
  hoja.appendRow([
    fechaDesdeISO(m.fecha),
    m.concepto || '',
    Number(m.importe),   // número de verdad, no texto: los SUMIFS lo necesitan
    m.cuenta,
    m.tipo,
    m.categoria,
    m.usuario || ''
  ]);

  /* El formato se fija en la fila recién escrita, no solo en la columna.
     Haberlo puesto únicamente en la columna al instalar no funcionó: las filas
     que añade appendRow se mostraban como 17/08/2026 en vez de 2026-08-17. */
  const fila = hoja.getLastRow();
  /* Va por formatoSeguro porque la fila ya está escrita: si el formato fallara
     y dejara reventar esta función, la app recibiría un error por un gasto que
     sí está en la hoja, lo reintentaría y el usuario vería un fallo por algo
     puramente estético. */
  formatoSeguro(hoja.getRange(fila, 1), 'yyyy-mm-dd');
  formatoSeguro(hoja.getRange(fila, 3), '0.00');
}

function registrarUuid(uuid) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_UUIDS);
  hoja.appendRow([uuid, new Date()]);
}

function uuidYaRegistrado(uuid) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_UUIDS);
  if (!hoja || hoja.getLastRow() < 2) return false;

  // createTextFinder busca en el servidor y no se trae la columna entera, que
  // con los años puede tener miles de filas.
  const rango = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1);
  return rango.createTextFinder(uuid).matchEntireCell(true).findNext() !== null;
}

/* ========================================================================
   Lectura (pantalla de resumen)
   ======================================================================== */

/**
 * doGet queda para comprobar el despliegue a mano desde el navegador: pegas la
 * URL con ?token=... y ves el JSON. La app NO lo usa, porque un fetch contra él
 * muere en la redirección de Apps Script; sus lecturas van por doPost con
 * accion: 'resumen'.
 */
function doGet(e) {
  try {
    const parametros = (e && e.parameter) || {};

    if (!tokenValido(parametros.token)) {
      return responder({ ok: false, error: 'Token no válido' });
    }

    return responder(resumenDelMes(Number(parametros.n) || 10));

  } catch (error) {
    return responder({ ok: false, error: String(error) });
  }
}

/** Totales del mes en curso y últimos movimientos. Lo comparten doGet y doPost. */
function resumenDelMes(cuantosPedidos) {
  try {
    const cuantos = Math.min(cuantosPedidos || 10, 50);
    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOVIMIENTOS);
    if (!hoja) return { ok: false, error: 'No existe la hoja ' + HOJA_MOVIMIENTOS };

    const ultimaFila = hoja.getLastRow();
    if (ultimaFila < 2) {
      return { ok: true, mes: ceros(), ultimos: [] };
    }

    const filas = hoja.getRange(2, 1, ultimaFila - 1, CABECERAS.length).getValues();

    const hoy = new Date();
    const mes = hoy.getMonth();
    const anio = hoy.getFullYear();
    const totales = ceros();

    filas.forEach(fila => {
      const fecha = fila[0];
      if (!(fecha instanceof Date)) return;
      if (fecha.getMonth() !== mes || fecha.getFullYear() !== anio) return;

      /* Los traspasos se saltan: mover 200 € de la corriente al ahorro no es un
         gasto de 200 € ni un ingreso de 200 €. Sus dos filas siguen contando
         para el saldo de cada cuenta, pero no para lo que has ganado o gastado
         este mes. Sin esto, un traspaso te infla ingresos y gastos a la vez. */
      if (fila[5] === CATEGORIA_TRASPASO) return;

      const importe = Number(fila[2]) || 0;
      if (fila[4] === 'Ingreso') totales.ingresos += importe;
      else if (fila[4] === 'Gasto') totales.gastos += importe;
    });

    totales.ahorro = redondear(totales.ingresos - totales.gastos);
    totales.ingresos = redondear(totales.ingresos);
    totales.gastos = redondear(totales.gastos);

    const ultimos = filas.slice(-cuantos).reverse().map(fila => ({
      fecha: fila[0] instanceof Date ? formatearISO(fila[0]) : String(fila[0]),
      concepto: String(fila[1] || ''),
      importe: Number(fila[2]) || 0,
      cuenta: String(fila[3] || ''),
      tipo: String(fila[4] || ''),
      categoria: String(fila[5] || ''),
      usuario: String(fila[6] || '')
    }));

    return { ok: true, mes: totales, ultimos: ultimos };

  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/* ========================================================================
   Utilidades
   ======================================================================== */

function tokenValido(recibido) {
  const esperado = PropertiesService.getScriptProperties().getProperty('TOKEN');
  // Si no hay token configurado se rechaza todo. Un script desplegado "para
  // cualquiera con el enlace" y sin token es una hoja abierta a internet.
  if (!esperado) return false;
  return typeof recibido === 'string' && recibido === esperado;
}

function validar(m) {
  if (!m || typeof m !== 'object') return 'Movimiento ausente';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha))) return 'Fecha con formato incorrecto';

  const importe = Number(m.importe);
  // El signo lo da la columna Tipo. Un importe negativo aquí significaría que
  // algo se ha roto en el cliente, y guardarlo estropearía los totales.
  if (!isFinite(importe) || importe <= 0) return 'Importe no válido';

  if (TIPOS_VALIDOS.indexOf(m.tipo) === -1) return 'Tipo debe ser Ingreso o Gasto';
  if (!m.cuenta) return 'Falta la cuenta';
  if (!m.categoria) return 'Falta la categoría';
  if (!m.uuid) return 'Falta el uuid';
  // El usuario no se exige: las filas anteriores a esta columna no lo tienen, y
  // rechazarlas ahora rompería la cola de un móvil sin actualizar.
  return null;
}

/** new Date('2026-08-17') se interpreta como medianoche UTC, que en España es
 *  el día anterior a las dos de la mañana. Construyéndola por partes no. */
function fechaDesdeISO(iso) {
  const partes = String(iso).split('-').map(Number);
  return new Date(partes[0], partes[1] - 1, partes[2]);
}

function formatearISO(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return fecha.getFullYear() + '-' + mes + '-' + dia;
}

function ceros() {
  return { ingresos: 0, gastos: 0, ahorro: 0 };
}

function redondear(n) {
  return Math.round(n * 100) / 100;
}

function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
