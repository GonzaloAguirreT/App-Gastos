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

const CABECERAS = ['Fecha', 'Concepto', 'Importe', 'Cuenta', 'Tipo', 'Categoría'];
const TIPOS_VALIDOS = ['Ingreso', 'Gasto'];

/* Los traspasos entre cuentas propias no son ni ingreso ni gasto: el dinero no
   entra ni sale de tu patrimonio, solo cambia de sitio. Se guardan como DOS
   filas —una de Gasto en la cuenta de origen y una de Ingreso en la de destino,
   ambas con esta categoría— para que los saldos por cuenta salgan bien, y los
   totales del mes las descuentan. Si cambias este texto, cámbialo también en
   config.js y en la hoja de configuración del Excel. */
const CATEGORIA_TRASPASO = 'Traspaso';

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
  movimientos.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  movimientos.getRange('C2:C').setNumberFormat('0.00');

  const ultima = movimientos.getLastRow();
  if (ultima >= 2) {
    movimientos.getRange(2, 1, ultima - 1, 1).setNumberFormat('yyyy-mm-dd');
    movimientos.getRange(2, 3, ultima - 1, 1).setNumberFormat('0.00');
  }

  let uuids = libro.getSheetByName(HOJA_UUIDS);
  if (!uuids) {
    uuids = libro.insertSheet(HOJA_UUIDS);
    uuids.appendRow(['UUID', 'Recibido']);
    uuids.hideSheet();
  }

  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  const aviso = token
    ? 'TOKEN configurado. Todo listo.'
    : 'FALTA EL TOKEN: ve a Configuración del proyecto → Propiedades del script y crea una propiedad llamada TOKEN.';

  Logger.log('Hojas preparadas. ' + aviso);
  return aviso;
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
    m.categoria
  ]);

  /* El formato se fija en la fila recién escrita, no solo en la columna.
     Haberlo puesto únicamente en la columna al instalar no funcionó: las filas
     que añade appendRow se mostraban como 17/08/2026 en vez de 2026-08-17. */
  const fila = hoja.getLastRow();
  hoja.getRange(fila, 1).setNumberFormat('yyyy-mm-dd');
  hoja.getRange(fila, 3).setNumberFormat('0.00');
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
      categoria: String(fila[5] || '')
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
