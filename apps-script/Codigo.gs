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
  // Se fija el formato de la columna de fecha para que lo que ve Power Query
  // sea siempre yyyy-mm-dd, independientemente del idioma de la hoja.
  movimientos.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  movimientos.getRange('C2:C').setNumberFormat('0.00');

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

    const movimiento = peticion.movimiento;
    const problema = validar(movimiento);
    if (problema) {
      return responder({ ok: false, error: problema });
    }

    /* Sin bloqueo, dos reintentos que lleguen a la vez pueden comprobar el UUID
       antes de que ninguno lo haya escrito, y los dos concluyen que es nuevo.
       Resultado: el gasto duplicado que precisamente queríamos evitar. */
    const bloqueo = LockService.getScriptLock();
    if (!bloqueo.tryLock(20000)) {
      return responder({ ok: false, error: 'El script está ocupado, reinténtalo' });
    }

    try {
      if (uuidYaRegistrado(movimiento.uuid)) {
        // No es un error: es un reintento de algo que ya se guardó. La app
        // necesita que le digamos que todo va bien para sacarlo de la cola.
        return responder({ ok: true, duplicado: true });
      }
      escribirMovimiento(movimiento);
      registrarUuid(movimiento.uuid);
    } finally {
      bloqueo.releaseLock();
    }

    return responder({ ok: true });

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

function doGet(e) {
  try {
    const parametros = (e && e.parameter) || {};

    if (!tokenValido(parametros.token)) {
      return responder({ ok: false, error: 'Token no válido' });
    }

    const cuantos = Math.min(Number(parametros.n) || 10, 50);
    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOVIMIENTOS);
    if (!hoja) return responder({ ok: false, error: 'No existe la hoja ' + HOJA_MOVIMIENTOS });

    const ultimaFila = hoja.getLastRow();
    if (ultimaFila < 2) {
      return responder({ ok: true, mes: ceros(), ultimos: [] });
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

    return responder({ ok: true, mes: totales, ultimos: ultimos });

  } catch (error) {
    return responder({ ok: false, error: String(error) });
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
