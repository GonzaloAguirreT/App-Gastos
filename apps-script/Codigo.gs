/**
 * Backend de la app de gastos. Se pega tal cual en el editor de Apps Script de
 * la hoja de cálculo y se despliega como aplicación web.
 *
 * El libro es la base de datos y este archivo, su contrato. Diez pestañas:
 *
 *   Panel        el mes en curso, en la misma jerarquía que la pantalla Mes
 *   Año          doce filas, una por mes, de donde leen los gráficos
 *   Movimientos  una fila por apunte. Es la tabla que crece
 *   Fijos        las reglas que escriben solas
 *   Metas        a qué se destina el ahorro
 *   Cierres      una fila por mes cerrado, con su Total Ahorrado
 *   Reparto      el libro mayor del ahorro: cada asignación, una línea
 *   Listas       personas, cuentas y categorías; la app las lee y las escribe
 *   Config       plan, límite y avisos: lo que es de los dos
 *   _uuids       oculta, para no escribir dos veces el mismo apunte
 *
 * Panel y Año son puro cálculo: no los escribe nadie.
 *
 * El token NO está en este archivo: vive en las Propiedades del Script. Así no
 * se te escapa si alguna vez copias este código a algún sitio.
 *
 * Para instalarlo: pegar, poner TOKEN en Configuración del proyecto →
 * Propiedades del script, ejecutar instalar() una vez, y desplegar como
 * aplicación web con acceso "Cualquier persona".
 */

/* ========================================================================
   Constantes del libro
   ======================================================================== */

const HOJA_PANEL = 'Panel';
const HOJA_ANIO = 'Año';
const HOJA_MOVIMIENTOS = 'Movimientos';
const HOJA_FIJOS = 'Fijos';
const HOJA_METAS = 'Metas';
const HOJA_CIERRES = 'Cierres';
const HOJA_REPARTO = 'Reparto';
const HOJA_LISTAS = 'Listas';
const HOJA_CONFIG = 'Config';

/* El plan del mes, tal y como lo citan las fórmulas de Panel y de Año. Es la
   celda y no el rango con nombre a propósito: ver ponerNombre(). */
const REF_PLAN = HOJA_CONFIG + '!$B$4';

/* Los UUID van en una hoja aparte y no en una columna oculta de Movimientos.
   Una columna oculta ensancha igual el rango que lee cualquier consulta
   externa y puede colarse donde no toca. */
const HOJA_UUIDS = '_uuids';

/* Las hojas del formato anterior, del que hay que migrar. Se leen una vez al
   instalar y luego se retiran. */
const HOJA_SUSCRIPCIONES_VIEJA = 'Suscripciones';
const MESES_VIEJOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/* El orden de estos arrays ES el contrato de columnas. No reordenar: hay
   fórmulas en Panel y en Año que apuntan a letras concretas. */
const CABECERAS_MOVIMIENTOS = ['FECHA', 'MES', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN',
                               'IMPORTE', 'CUENTA', 'PERSONA', 'REPARTO', 'ORIGEN', 'UUID'];

const CABECERAS_FIJOS = ['UUID', 'TIPO', 'CONCEPTO', 'IMPORTE', 'DÍA', 'CADA (MESES)',
                         'CUOTAS', 'RESTANTES', 'CUENTA', 'PERSONA', 'REPARTO', 'ACTIVO',
                         'PRÓXIMO CARGO', 'ÚLTIMO CARGO'];

const CABECERAS_METAS = ['META', 'OBJETIVO', 'GUARDADO', 'FALTA', 'AVANCE', 'ORDEN', 'ACTIVA', 'NOTAS'];
const CABECERAS_CIERRES = ['MES', 'ENTRADO', 'GASTADO', 'PLAN', 'TOTAL AHORRADO',
                           'REPARTIDO', 'SIN ASIGNAR', 'CERRADO EL'];
const CABECERAS_REPARTO = ['MES', 'FECHA', 'META', 'MONTO', 'ORIGEN', 'UUID'];
const CABECERAS_LISTAS = ['PERSONA', 'COLOR', 'CUENTA', 'ACTIVA', 'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'];

/* En Metas, Cierres, Reparto, Listas y Config la cabecera va en la fila 4: las
   dos primeras son el título y una frase que explica qué es cada hoja, y la
   tercera es aire. Movimientos y Fijos no la llevan porque son tablas para
   filtrar, y un autofiltro quiere la cabecera en la fila 1. */
const FILA_CABECERA = 4;
const FILA_DATOS = 5;

/* Cuántos meses de movimientos se le mandan a la app. Con esto le llega el mes
   en curso y todos los cerrados que puede abrir hacia atrás, sin traerse años
   de historia en cada arranque. */
const MESES_QUE_VIAJAN = 12;

/* Los colores de persona, en el orden en que se reparten. Los mismos que usa la
   app en la barra del mes; si cambias uno, cámbialo en config.js. */
const COLORES_PERSONA = ['#3D5A6C', '#A34E6B', '#5E7A52', '#9A7A3F'];

/* Semilla de las listas, solo para un libro vacío. En cuanto hay algo escrito,
   manda la hoja. */
const PERSONAS_SEMILLA = ['Gonzalo', 'Camila'];
const CUENTAS_SEMILLA = ['Cuenta Corriente', 'Tarjeta Credito', 'Tarjeta Debito', 'Efectivo'];
const CATEGORIAS_SEMILLA = [
  ['Alimentación', 'Gasto', 'Común'],
  ['Restaurantes', 'Gasto', 'Personal'],
  ['Transporte', 'Gasto', 'Común'],
  ['Salud', 'Gasto', 'Común'],
  ['Hogar', 'Gasto', 'Común'],
  ['Ocio', 'Gasto', 'Personal'],
  ['Compras', 'Gasto', 'Personal'],
  ['Viajes', 'Gasto', 'Personal'],
  ['Otros', 'Gasto', 'Personal'],
  ['Arriendo', 'Gasto', 'Común'],
  ['Suministros', 'Gasto', 'Común'],
  ['Suscripciones', 'Gasto', 'Común'],
  ['Seguros', 'Gasto', 'Personal'],
  ['Préstamos', 'Gasto', 'Personal'],
  ['Sueldo', 'Ingreso', 'Personal'],
  ['Bono', 'Ingreso', 'Personal'],
  ['Devolución', 'Ingreso', 'Personal'],
  ['Arriendo cobrado', 'Ingreso', 'Común']
];

const PLAN_SEMILLA = 1600000;
const LIMITE_SEMILLA = 200000;

/* Cuántas filas de cada tabla preparan las fórmulas. Son topes generosos y
   baratos: una fórmula sobre una fila vacía devuelve "" y no se ve. */
const TOPE_CATEGORIAS = 24;
const TOPE_PERSONAS = 4;
const TOPE_FIJOS = 60;
const TOPE_METAS = 10;
const TOPE_CIERRES = 12;

/* ========================================================================
   Instalación y migración
   ======================================================================== */

/**
 * Deja el libro con la forma que espera la app.
 *
 * Es idempotente y NO pierde datos: lo primero que hace es leerse lo que ya
 * hay —movimientos del formato antiguo, suscripciones— y lo vuelve a escribir
 * en el formato nuevo. Se puede ejecutar las veces que haga falta.
 */
function instalar() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();

  /* Leer ANTES de tocar nada. Si algo falla a mitad, el libro se queda como
     estaba en vez de a medio migrar. */
  const movimientos = leerMovimientosParaMigrar(libro);
  const fijos = leerFijosParaMigrar(libro);
  const listas = leerListasExistentes(libro);
  const metas = leerTablaExistente(libro, HOJA_METAS, 8);
  const cierres = leerTablaExistente(libro, HOJA_CIERRES, 8);
  const reparto = leerTablaExistente(libro, HOJA_REPARTO, 6);

  const config = leerConfigActual(libro);

  /* Panel y Año se retiran ANTES de reescribir los datos, y no es por orden:
     es lo que hace que una segunda instalación termine.

     Las dos hojas son cientos de SUMIFS sobre columnas enteras. Mientras
     existen, cada vez que se borra y se reescribe Movimientos, Sheets recalcula
     todas. La primera instalación tardó minuto y medio porque esas hojas aún no
     existían; la segunda se pasó de los seis minutos que da Apps Script y murió
     con "Exceeded maximum execution time". Sin nadie mirando, la reescritura de
     los datos vuelve a costar lo que costaba. */
  retirarHojas(libro, [HOJA_PANEL, HOJA_ANIO]);

  /* El orden de aquí abajo es el de las DEPENDENCIAS, no el de las pestañas.

     hojaLimpia borra la hoja y la vuelve a crear, y en Sheets borrar una hoja
     convierte en #REF! toda fórmula que la citaba —recrearla con el mismo
     nombre no las recupera—. Así que ninguna hoja puede escribirse antes que
     otra a la que apunte: Metas y Cierres citan Reparto, y Config cita
     Movimientos, Fijos, Metas y Cierres.

     Antes no era así, y solo se salvó de milagro: en la primera instalación
     esas hojas no existían todavía, así que no había nada que borrar. */
  escribirListas(libro, listas);
  escribirMovimientos(libro, movimientos, listas.categorias);
  escribirFijos(libro, fijos);
  escribirReparto(libro, reparto);
  escribirMetas(libro, metas);
  escribirCierres(libro, cierres);
  escribirConfig(libro, config);
  prepararUuids(libro);

  retirarHojasViejas(libro);
  crearPanel(libro);
  crearAnio(libro);
  ordenarPestanas(libro);
  instalarDisparadorDiario();

  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  const aviso = (token
    ? 'Listo. El libro ya tiene el formato nuevo.'
    : 'Listo, PERO falta el TOKEN en Configuración del proyecto → Propiedades del script.')
    + '\n\nMovimientos migrados: ' + movimientos.length
    + '\nFijos migrados: ' + fijos.length;

  /* El aviso es lo último y es solo un aviso: para cuando llega, el libro ya
     está hecho. getUi() no existe si la función se ejecuta sin una hoja abierta
     delante —desde un disparador, o desde el editor con la pestaña cerrada— y
     dejarlo pelado marcaría como fallida una instalación que salió bien. */
  try {
    SpreadsheetApp.getUi().alert(aviso);
  } catch (e) {
    Logger.log(aviso);
  }
}

/**
 * Los movimientos que ya hay, sea cual sea el formato en que estén.
 *
 * El formato viejo tenía siete columnas —Fecha, Concepto, Importe, Cuenta,
 * Tipo, Categoría, Usuario— y el nuevo tiene once. Lo que era "Concepto" pasa
 * a "Descripción", que es lo que siempre fue: texto libre. La categoría ya
 * estaba en su columna.
 */
function leerMovimientosParaMigrar(libro) {
  const hoja = libro.getSheetByName(HOJA_MOVIMIENTOS);
  if (!hoja || hoja.getLastRow() < 2) return [];

  const ancho = hoja.getLastColumn();
  const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, ancho).getValues();
  const nuevo = ancho >= 11 && String(hoja.getRange(1, 2).getValue()).toUpperCase().indexOf('MES') === 0;

  return filas
    .filter(f => f[0] instanceof Date)
    .map(f => nuevo
      ? { fecha: f[0], tipo: f[2], categoria: f[3], descripcion: f[4], importe: f[5],
          cuenta: f[6], persona: f[7], reparto: f[8], origen: f[9] || 'app', uuid: f[10] || '' }
      : { fecha: f[0], tipo: f[4], categoria: f[5], descripcion: f[1], importe: f[2],
          cuenta: f[3], persona: f[6], reparto: '', origen: 'app', uuid: '' });
}

/**
 * Los fijos, vengan de la hoja nueva o de la vieja `Suscripciones`.
 *
 * La hoja vieja guardaba la frecuencia como palabra ('Mensual') y el final
 * como fecha; la nueva guarda meses y cuotas, que es lo que la app sabe
 * calcular. La conversión es aquí y una sola vez.
 */
function leerFijosParaMigrar(libro) {
  const nueva = libro.getSheetByName(HOJA_FIJOS);
  if (nueva && nueva.getLastRow() > 1) {
    return nueva.getRange(2, 1, nueva.getLastRow() - 1, 14).getValues()
      .filter(f => f[2])
      .map(f => ({
        uuid: f[0] || nuevoUuid(), tipo: f[1] || 'Gasto', concepto: f[2], importe: Number(f[3]) || 0,
        dia: Number(f[4]) || 1, cada: Number(f[5]) || 1, cuotas: Number(f[6]) || 0,
        restantes: Number(f[7]) || 0, cuenta: f[8], persona: f[9], reparto: f[10] || 'Personal',
        activo: f[11] !== false, prox: f[12] instanceof Date ? f[12] : null,
        ultimo: f[13] instanceof Date ? f[13] : null
      }));
  }

  const vieja = libro.getSheetByName(HOJA_SUSCRIPCIONES_VIEJA);
  if (!vieja || vieja.getLastRow() < 2) return [];

  const MESES_DE = { 'Mensual': 1, 'Bimestral': 2, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12 };

  return vieja.getRange(2, 1, vieja.getLastRow() - 1, 13).getValues()
    .filter(f => f[2])
    .map(f => {
      const inicio = f[8] instanceof Date ? f[8] : new Date();
      const fin = f[9] instanceof Date ? f[9] : null;
      const cada = MESES_DE[String(f[7])] || 1;
      // "Hasta diciembre" pasa a ser "tantas cuotas": es el mismo dato dicho de
      // la forma que la app sabe descontar.
      const cuotas = fin ? Math.max(1, Math.round(mesesEntre(inicio, fin) / cada) + 1) : 0;
      const ultimo = f[11] instanceof Date ? f[11] : null;
      const restantes = cuotas
        ? Math.max(0, cuotas - (ultimo ? Math.round(mesesEntre(inicio, ultimo) / cada) + 1 : 0))
        : 0;
      return {
        uuid: f[0] || nuevoUuid(),
        tipo: f[12] || 'Gasto',
        concepto: f[5] || f[2],
        importe: Number(f[3]) || 0,
        dia: inicio.getDate(),
        cada: cada,
        cuotas: cuotas,
        restantes: restantes,
        cuenta: f[4],
        persona: f[6],
        reparto: '',
        activo: f[10] !== false,
        prox: null,
        ultimo: ultimo
      };
    });
}

/** Las listas que ya hay en el libro; si no hay ninguna, la semilla. */
function leerListasExistentes(libro) {
  const hoja = libro.getSheetByName(HOJA_LISTAS);
  const vacio = { personas: [], cuentas: [], categorias: [] };

  if (hoja && hoja.getLastRow() >= FILA_DATOS) {
    const filas = hoja.getRange(FILA_DATOS, 1, hoja.getLastRow() - FILA_CABECERA, 8).getValues();
    filas.forEach(f => {
      if (f[0]) vacio.personas.push({ nombre: String(f[0]), color: String(f[1] || '') });
      if (f[2]) vacio.cuentas.push(String(f[2]));
      if (f[4]) vacio.categorias.push({
        nombre: String(f[4]),
        tipo: f[5] === 'Ingreso' ? 'Ingreso' : 'Gasto',
        reparto: f[6] === 'Común' ? 'Común' : 'Personal'
      });
    });
  }

  if (!vacio.personas.length) {
    vacio.personas = PERSONAS_SEMILLA.map((n, i) => ({ nombre: n, color: COLORES_PERSONA[i] }));
  }
  if (!vacio.cuentas.length) vacio.cuentas = CUENTAS_SEMILLA.slice();
  if (!vacio.categorias.length) {
    vacio.categorias = CATEGORIAS_SEMILLA.map(c => ({ nombre: c[0], tipo: c[1], reparto: c[2] }));
  }
  return vacio;
}

/** Las filas de una hoja del formato nuevo, para volver a escribirlas igual. */
function leerTablaExistente(libro, nombre, ancho) {
  const hoja = libro.getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() < FILA_DATOS) return [];
  return hoja.getRange(FILA_DATOS, 1, hoja.getLastRow() - FILA_CABECERA, ancho)
    .getValues()
    .filter(f => f[0] !== '' && f[0] !== null);
}

/* ---------------------------------------------------------------- escribir */

function escribirListas(libro, listas) {
  const hoja = hojaLimpia(libro, HOJA_LISTAS);
  titular(hoja, 'Listas',
    'La app lee estas listas. Los textos deben coincidir palabra por palabra con los de Movimientos.');
  hoja.getRange(FILA_CABECERA, 1, 1, 8).setValues([CABECERAS_LISTAS]).setFontWeight('bold');

  const filas = [];
  const cuantas = Math.max(listas.personas.length, listas.cuentas.length,
                           listas.categorias.length, TOPE_CATEGORIAS);
  for (var i = 0; i < cuantas; i++) {
    const p = listas.personas[i];
    const c = listas.categorias[i];
    filas.push([
      p ? p.nombre : '',
      p ? (p.color || COLORES_PERSONA[i % COLORES_PERSONA.length]) : (i < TOPE_PERSONAS ? COLORES_PERSONA[i] : ''),
      listas.cuentas[i] || '',
      listas.cuentas[i] ? true : '',
      c ? c.nombre : '',
      c ? c.tipo : '',
      c ? c.reparto : '',
      c ? true : ''
    ]);
  }
  hoja.getRange(FILA_DATOS, 1, filas.length, 8).setValues(filas);
  hoja.setColumnWidth(1, 150).setColumnWidth(3, 170).setColumnWidth(5, 170);
}

/** `previo` llega de fuera: para cuando se llama a esto, Config ya se va a
 *  borrar, así que lo que había hay que haberlo leído antes. */
function escribirConfig(libro, previo) {
  const hoja = hojaLimpia(libro, HOJA_CONFIG);
  titular(hoja, 'Config',
    'Lo que la app lee al arrancar. El token NO va aquí: vive solo en el teléfono.');

  hoja.getRange('A4:C8').setValues([
    ['Plan del mes', previo.plan, 'común para todas las personas'],
    ['Moneda', 'CLP', 'sin decimales, miles con punto'],
    ['Símbolo', '$', ''],
    ['Límite de aviso', previo.limite, 'avisa cuando el saldo baja de aquí'],
    ['Día de cierre', 'último', 'la app cierra sola esa noche']
  ]);

  hoja.getRange('A10:C13').setValues([
    ['AVISO', 'ACTIVO', 'CUÁNDO'],
    ['El día que toca un fijo', previo.avisos.fijo, 'por la mañana'],
    ['Saldo bajo el límite', previo.avisos.saldo, 'una vez por mes'],
    ['Resumen semanal', previo.avisos.semanal, 'domingos por la noche']
  ]);
  hoja.getRange('A10:C10').setFontWeight('bold');
  hoja.getRange('B11:B13').insertCheckboxes();

  hoja.getRange('A15:C20').setValues([
    ['CONTROL', 'VALOR', 'QUÉ ES'],
    ['Movimientos escritos', '=COUNTA(' + HOJA_MOVIMIENTOS + '!$A$2:$A)', 'filas con fecha'],
    ['Fijos activos', '=COUNTIF(' + HOJA_FIJOS + '!$L$2:$L' + sep(hoja) + 'TRUE)', 'reglas que siguen cobrando'],
    ['Metas activas', '=COUNTIF(' + HOJA_METAS + '!$G$5:$G' + sep(hoja) + 'TRUE)', 'reciben reparto'],
    ['Meses cerrados', '=COUNTA(' + HOJA_CIERRES + '!$A$5:$A)', 'con Total Ahorrado escrito'],
    ['Descuadre de reparto', '=SUM(' + HOJA_CIERRES + '!$G$5:$G)', 'ahorro cerrado sin meta; 0 es lo esperado']
  ]);
  hoja.getRange('A15:C15').setFontWeight('bold');

  /* Los nombres definidos son una comodidad para quien escriba sus propias
     fórmulas en la hoja: PLAN se lee mejor que Config!$B$4. Las fórmulas que
     escribe este script NO los usan —usan la celda directamente— para que, si
     alguna vez no se pudieran crear, la consecuencia fuera perder una comodidad
     y no un panel entero lleno de #¿NOMBRE?. */
  ponerNombre(libro, 'PLAN', hoja.getRange('B4'));
  ponerNombre(libro, 'LIMITE', hoja.getRange('B7'));

  formatoSeguro(hoja.getRange('B4'), '#,##0');
  formatoSeguro(hoja.getRange('B7'), '#,##0');
  hoja.setColumnWidth(1, 190).setColumnWidth(3, 320);
}

/** Lo que había en Config antes de rehacerla, para no perder el plan. */
function leerConfigActual(libro) {
  const hoja = libro.getSheetByName(HOJA_CONFIG);
  const base = { plan: PLAN_SEMILLA, limite: LIMITE_SEMILLA,
                 avisos: { fijo: true, saldo: true, semanal: false } };
  if (!hoja) return base;
  const plan = Number(hoja.getRange('B4').getValue());
  const limite = Number(hoja.getRange('B7').getValue());
  if (plan > 0) base.plan = plan;
  if (limite > 0) base.limite = limite;
  const avisos = hoja.getRange('B11:B13').getValues();
  base.avisos = { fijo: avisos[0][0] !== false, saldo: avisos[1][0] !== false, semanal: avisos[2][0] === true };
  return base;
}

function escribirMovimientos(libro, movimientos, categorias) {
  const hoja = hojaLimpia(libro, HOJA_MOVIMIENTOS);
  hoja.getRange(1, 1, 1, 11).setValues([CABECERAS_MOVIMIENTOS]).setFontWeight('bold');
  hoja.setFrozenRows(1);

  const repartoDe = {};
  categorias.forEach(c => { repartoDe[c.nombre] = c.reparto; });

  if (movimientos.length) {
    const filas = movimientos.map(m => [
      m.fecha,
      '',                                   // la fórmula del mes se pone después
      m.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto',
      m.categoria || '',
      m.descripcion || '',
      Number(m.importe) || 0,
      m.cuenta || '',
      m.persona || '',
      m.reparto || repartoDe[m.categoria] || 'Personal',
      m.origen || 'app',
      m.uuid || ''
    ]);
    hoja.getRange(2, 1, filas.length, 11).setValues(filas);
  }

  /* La última fila se cuenta, no se pregunta. getLastRow() puede venir inflado
     por la sonda que sep() escribe en Z200 para averiguar el separador: aunque
     se borre acto seguido, Sheets no siempre encoge el rango usado, y entonces
     se escribirían doscientas fórmulas del mes sobre filas vacías. */
  const ultima = movimientos.length + 1;
  ponerFormulaMes(hoja, 2, ultima);
  formatoSeguro(hoja.getRange(2, 1, ultima - 1, 1), 'yyyy-mm-dd');
  formatoSeguro(hoja.getRange(2, 6, ultima - 1, 1), '#,##0');
  hoja.setColumnWidth(4, 140).setColumnWidth(5, 200).setColumnWidth(7, 150);
}

/** La columna Mes es una fórmula y no un dato: escrita a mano se desincroniza
 *  en cuanto alguien corrige una fecha, y nadie se entera. */
function ponerFormulaMes(hoja, desde, hasta) {
  if (hasta < desde) return;
  const s = sep(hoja);
  const formulas = [];
  for (var f = desde; f <= hasta; f++) {
    formulas.push(['=IF($A' + f + '=""' + s + '""' + s + 'TEXT($A' + f + s + '"yyyy-mm"))']);
  }
  hoja.getRange(desde, 2, formulas.length, 1).setFormulas(formulas);
}

function escribirFijos(libro, fijos) {
  const hoja = hojaLimpia(libro, HOJA_FIJOS);
  hoja.getRange(1, 1, 1, 14).setValues([CABECERAS_FIJOS]).setFontWeight('bold');
  hoja.setFrozenRows(1);

  if (fijos.length) {
    const filas = fijos.map(f => [
      f.uuid, f.tipo, f.concepto, f.importe, f.dia, f.cada, f.cuotas || '', f.restantes || '',
      f.cuenta, f.persona, f.reparto || 'Personal', f.activo !== false,
      f.prox || calcularProximo(f, hoy()), f.ultimo || ''
    ]);
    hoja.getRange(2, 1, filas.length, 14).setValues(filas);
  }

  hoja.getRange('L2:L' + (TOPE_FIJOS + 1)).insertCheckboxes();
  formatoSeguro(hoja.getRange('D2:D'), '#,##0');
  formatoSeguro(hoja.getRange('M2:N'), 'yyyy-mm-dd');
  hoja.setColumnWidth(1, 90).setColumnWidth(3, 170);
}

function escribirMetas(libro, metas) {
  const hoja = hojaLimpia(libro, HOJA_METAS);
  titular(hoja, 'Metas de ahorro',
    'Al cerrar el mes la app reparte lo ahorrado entre estas metas y lo anota en Reparto.');
  hoja.getRange(FILA_CABECERA, 1, 1, 8).setValues([CABECERAS_METAS]).setFontWeight('bold');

  const s = sep(hoja);

  /* Por bloques y no celda a celda. Cada getRange().setValue() es una operación
     que cruza al servicio de Sheets; entre esta función, Cierres, Panel y Año
     salían más de setecientas y la instalación no cabía en los seis minutos que
     da Apps Script. Un setValues por bloque son cuatro. */
  const datos = [], formulas = [];
  for (var i = 0; i < TOPE_METAS; i++) {
    const f = FILA_DATOS + i;
    const previa = metas[i];
    datos.push(previa
      ? [previa[0], previa[1], previa[5] || i + 1, previa[6] !== false, previa[7] || '']
      : ['', '', '', false, '']);
    /* Lo guardado NO es un campo: sale de sumar las líneas de Reparto de esa
       meta. Así el ahorro siempre se puede auditar y nunca hay un total que no
       cuadre con nada. */
    formulas.push([
      '=IF($A' + f + '=""' + s + '""' + s +
        'SUMIF(' + HOJA_REPARTO + '!$C:$C' + s + '$A' + f + s + HOJA_REPARTO + '!$D:$D))',
      '=IF($A' + f + '=""' + s + '""' + s + 'MAX(0' + s + '$B' + f + '-$C' + f + '))',
      '=IF(OR($A' + f + '=""' + s + '$B' + f + '=0)' + s + '""' + s +
        'MIN(1' + s + '$C' + f + '/$B' + f + '))'
    ]);
  }
  hoja.getRange(FILA_DATOS, 1, TOPE_METAS, 2).setValues(datos.map(d => [d[0], d[1]]));
  hoja.getRange(FILA_DATOS, 6, TOPE_METAS, 3).setValues(datos.map(d => [d[2], d[3], d[4]]));
  hoja.getRange(FILA_DATOS, 3, TOPE_METAS, 3).setFormulas(formulas);

  hoja.getRange('G5:G' + (FILA_DATOS + TOPE_METAS - 1)).insertCheckboxes();
  formatoSeguro(hoja.getRange('B5:D'), '#,##0');
  formatoSeguro(hoja.getRange('E5:E'), '0%');
  hoja.setColumnWidth(1, 200);
}

function escribirCierres(libro, cierres) {
  const hoja = hojaLimpia(libro, HOJA_CIERRES);
  titular(hoja, 'Meses cerrados', 'Una fila por mes cerrado. La escribe la app: no la edites a mano.');
  hoja.getRange(FILA_CABECERA, 1, 1, 8).setValues([CABECERAS_CIERRES]).setFontWeight('bold');

  const previos = cierres.slice(0, TOPE_CIERRES);
  if (previos.length) {
    hoja.getRange(FILA_DATOS, 1, previos.length, 4)
        .setValues(previos.map(c => [c[0], c[1], c[2], c[3]]));
    hoja.getRange(FILA_DATOS, 8, previos.length, 1)
        .setValues(previos.map(c => [c[7] || new Date()]));
  }

  ponerFormulasCierre(hoja, FILA_DATOS, FILA_DATOS + TOPE_CIERRES - 1);
  formatoSeguro(hoja.getRange('B5:G'), '#,##0');
  formatoSeguro(hoja.getRange('H5:H'), 'yyyy-mm-dd hh:mm');
  hoja.setColumnWidth(5, 130).setColumnWidth(8, 140);
}

function ponerFormulasCierre(hoja, desde, hasta) {
  const s = sep(hoja);
  const formulas = [];
  for (var f = desde; f <= hasta; f++) {
    formulas.push([
      '=IF($A' + f + '=""' + s + '""' + s + '$B' + f + '-$C' + f + ')',
      '=IF($A' + f + '=""' + s + '""' + s +
        'SUMIF(' + HOJA_REPARTO + '!$A:$A' + s + '$A' + f + s + HOJA_REPARTO + '!$D:$D))',
      '=IF($A' + f + '=""' + s + '""' + s + '$E' + f + '-$F' + f + ')'
    ]);
  }
  hoja.getRange(desde, 5, formulas.length, 3).setFormulas(formulas);
}

function escribirReparto(libro, lineas) {
  const hoja = hojaLimpia(libro, HOJA_REPARTO);
  titular(hoja, 'Reparto del ahorro',
    'Cada línea es una asignación de un mes cerrado a una meta. Lo escribe la app.');
  hoja.getRange(FILA_CABECERA, 1, 1, 6).setValues([CABECERAS_REPARTO]).setFontWeight('bold');
  if (lineas.length) hoja.getRange(FILA_DATOS, 1, lineas.length, 6).setValues(lineas);
  formatoSeguro(hoja.getRange('B5:B'), 'yyyy-mm-dd hh:mm');
  formatoSeguro(hoja.getRange('D5:D'), '#,##0');
  hoja.setColumnWidth(3, 200);
}

function prepararUuids(libro) {
  var hoja = libro.getSheetByName(HOJA_UUIDS);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA_UUIDS);
    hoja.getRange(1, 1, 1, 3).setValues([['UUID', 'RECIBIDO', 'QUÉ ERA']]).setFontWeight('bold');
  }
  hoja.hideSheet();
}

/** Quita las hojas que existan de una lista, y calla sobre las que no. */
function retirarHojas(libro, nombres) {
  nombres.forEach(nombre => {
    const hoja = libro.getSheetByName(nombre);
    if (hoja) libro.deleteSheet(hoja);
  });
}

/** Las pestañas del formato anterior, una vez migradas. Se retiran para que no
 *  queden dos sitios con la misma verdad. */
function retirarHojasViejas(libro) {
  retirarHojas(libro, [HOJA_SUSCRIPCIONES_VIEJA].concat(MESES_VIEJOS));
}

function ordenarPestanas(libro) {
  const orden = [HOJA_PANEL, HOJA_ANIO, HOJA_MOVIMIENTOS, HOJA_FIJOS, HOJA_METAS,
                 HOJA_CIERRES, HOJA_REPARTO, HOJA_LISTAS, HOJA_CONFIG];
  orden.forEach((nombre, i) => {
    const hoja = libro.getSheetByName(nombre);
    if (!hoja) return;
    libro.setActiveSheet(hoja);
    libro.moveActiveSheet(i + 1);
  });
  libro.setActiveSheet(libro.getSheetByName(HOJA_PANEL));
}

/* ========================================================================
   Panel y Año: puro cálculo
   ======================================================================== */

/**
 * El panel del mes, con la misma jerarquía que la pantalla Mes de la app.
 *
 * La única celda editable es B4: el primer día del mes que quieres mirar. Todo
 * lo demás son SUMIFS. Se rehace entera en cada instalación en vez de
 * limpiarla: `clear()` no deshace una columna que quedó con formato de texto, y
 * ahí el número escrito deja de sumar sin que nada avise.
 */
function crearPanel(libro) {
  const hoja = hojaLimpia(libro, HOJA_PANEL);
  const s = sep(hoja);
  titular(hoja, 'Panel del mes', 'Escribe el mes en B4. El resto son fórmulas: no toques nada más.');

  const M = HOJA_MOVIMIENTOS;
  const primero = new Date();
  primero.setDate(1);
  hoja.getRange('A4:C4').setValues([['MES', primero, 'primer día del mes']]);
  formatoSeguro(hoja.getRange('B4'), 'yyyy-mm-dd');

  // Rango del mes elegido, tal como lo quieren todos los SUMIFS de esta hoja.
  const desde = '">="&$B$4';
  const hasta = '"<"&EOMONTH($B$4' + s + '0)+1';
  const enElMes = M + '!$A:$A' + s + desde + s + M + '!$A:$A' + s + hasta;
  const suma = (tipo, extra) => '=SUMIFS(' + M + '!$F:$F' + s + M + '!$C:$C' + s + '"' + tipo + '"' +
    (extra ? s + extra : '') + s + enElMes + ')';

  hoja.getRange('A6:F8').setValues([
    ['SALDO DISPONIBLE', '', '', 'PLAN DEL MES', '', 'AHORRO PROYECTADO'],
    ['=' + REF_PLAN + '-B10-B11', '', '', '=' + REF_PLAN, '', '=B9-B10-B11'],
    ['plan − gastado − por venir', '', '', 'se edita en Config', '', 'entrado − gastado − por venir']
  ]);

  hoja.getRange('A9:B13').setValues([
    ['Entrado', suma('Ingreso')],
    ['Gastado', suma('Gasto')],
    ['Fijos por venir',
      '=SUMIFS(' + HOJA_FIJOS + '!$D:$D' + s + HOJA_FIJOS + '!$B:$B' + s + '"Gasto"' + s +
      HOJA_FIJOS + '!$L:$L' + s + 'TRUE' + s + HOJA_FIJOS + '!$M:$M' + s + '">="&TODAY()' + s +
      HOJA_FIJOS + '!$M:$M' + s + hasta + ')'],
    ['Común', suma('Gasto', M + '!$I:$I' + s + '"Común"')],
    ['Personal', suma('Gasto', M + '!$I:$I' + s + '"Personal"')]
  ]);

  hoja.getRange('A15:D15').setValues([['QUIÉN GASTÓ', 'GASTADO', '% DEL PLAN', 'MOVIMIENTOS']])
      .setFontWeight('bold');
  const porPersona = [];
  for (var i = 0; i < TOPE_PERSONAS; i++) {
    const f = 16 + i;
    const origen = HOJA_LISTAS + '!$A' + (FILA_DATOS + i);
    porPersona.push([
      '=IF(' + origen + '=""' + s + '""' + s + origen + ')',
      '=IF($A' + f + '=""' + s + '""' + s +
        'SUMIFS(' + M + '!$F:$F' + s + M + '!$C:$C' + s + '"Gasto"' + s + M + '!$H:$H' + s + '$A' + f + s +
        enElMes + '))',
      '=IF(OR($A' + f + '=""' + s + REF_PLAN + '=0)' + s + '""' + s + '$B' + f + '/' + REF_PLAN + ')',
      '=IF($A' + f + '=""' + s + '""' + s +
        'COUNTIFS(' + M + '!$H:$H' + s + '$A' + f + s + M + '!$C:$C' + s + '"Gasto"' + s + enElMes + '))'
    ]);
  }
  hoja.getRange(16, 1, TOPE_PERSONAS, 4).setFormulas(porPersona);

  const filaCat = 16 + TOPE_PERSONAS + 1;
  hoja.getRange(filaCat, 1, 1, 4).setValues([['POR CATEGORÍA', 'GASTADO', '% DEL GASTO', 'REPARTO']])
      .setFontWeight('bold');
  const porCategoria = [];
  for (var j = 0; j < TOPE_CATEGORIAS; j++) {
    const f = filaCat + 1 + j;
    const origen = HOJA_LISTAS + '!$E' + (FILA_DATOS + j);
    porCategoria.push([
      '=IF(' + origen + '=""' + s + '""' + s + origen + ')',
      '=IF($A' + f + '=""' + s + '""' + s +
        'SUMIFS(' + M + '!$F:$F' + s + M + '!$D:$D' + s + '$A' + f + s + M + '!$C:$C' + s + '"Gasto"' + s +
        enElMes + '))',
      '=IF(OR($A' + f + '=""' + s + '$B$10=0)' + s + '""' + s + '$B' + f + '/$B$10)',
      '=IF($A' + f + '=""' + s + '""' + s +
        'IFERROR(VLOOKUP($A' + f + s + HOJA_LISTAS + '!$E:$G' + s + '3' + s + 'FALSE)' + s + '""))'
    ]);
  }
  hoja.getRange(filaCat + 1, 1, TOPE_CATEGORIAS, 4).setFormulas(porCategoria);

  const filaFijos = filaCat + TOPE_CATEGORIAS + 2;
  hoja.getRange(filaFijos, 1, 1, 4).setValues([['FIJOS DE ESTE MES', 'DÍA', 'IMPORTE', 'ESTADO']])
      .setFontWeight('bold');
  const fijosDelMes = [];
  for (var k = 0; k < 12; k++) {
    const f = filaFijos + 1 + k;
    const fila = 2 + k;
    fijosDelMes.push([
      '=IF(' + HOJA_FIJOS + '!$C' + fila + '=""' + s + '""' + s + HOJA_FIJOS + '!$C' + fila + ')',
      '=IF($A' + f + '=""' + s + '""' + s + HOJA_FIJOS + '!$E' + fila + ')',
      '=IF($A' + f + '=""' + s + '""' + s + HOJA_FIJOS + '!$D' + fila + ')',
      '=IF($A' + f + '=""' + s + '""' + s +
        'IF(' + HOJA_FIJOS + '!$M' + fila + '<TODAY()' + s + '"cargado"' + s +
        '"pendiente · "&TEXT(' + HOJA_FIJOS + '!$M' + fila + s + '"dd/mm")))'
    ]);
  }
  hoja.getRange(filaFijos + 1, 1, 12, 4).setFormulas(fijosDelMes);

  formatoSeguro(hoja.getRange('A7'), '#,##0');
  formatoSeguro(hoja.getRange('D7:F7'), '#,##0');
  formatoSeguro(hoja.getRange('B9:B13'), '#,##0');
  formatoSeguro(hoja.getRange(16, 2, TOPE_PERSONAS, 1), '#,##0');
  formatoSeguro(hoja.getRange(16, 3, TOPE_PERSONAS, 1), '0%');
  formatoSeguro(hoja.getRange(filaCat + 1, 2, TOPE_CATEGORIAS, 1), '#,##0');
  formatoSeguro(hoja.getRange(filaCat + 1, 3, TOPE_CATEGORIAS, 1), '0%');
  formatoSeguro(hoja.getRange(filaFijos + 1, 3, 12, 1), '#,##0');

  hoja.getRange('A7').setFontSize(28);
  hoja.getRange('A6:F6').setFontWeight('bold');
  hoja.setColumnWidth(1, 220).setColumnWidth(2, 130).setColumnWidth(3, 130).setColumnWidth(4, 150);
}

/**
 * Doce filas, una por mes del año en curso, más el gasto por persona.
 *
 * El año sale de TODAY() y no de una celda: así el 1 de enero la tabla empieza
 * de cero sola, sin que nadie tenga que acordarse de nada.
 */
function crearAnio(libro) {
  const hoja = hojaLimpia(libro, HOJA_ANIO);
  const s = sep(hoja);
  titular(hoja, 'Año', 'Fórmulas sobre Movimientos y Cierres. Los gráficos leen de esta tabla.');

  const M = HOJA_MOVIMIENTOS;
  hoja.getRange(FILA_CABECERA, 1, 1, 8).setValues([
    ['MES', 'ENTRADO', 'GASTADO', 'AHORRO', 'PLAN', '% DEL PLAN', 'COMÚN', 'PERSONAL']
  ]).setFontWeight('bold');

  const meses = [];
  for (var m = 1; m <= 12; m++) {
    const f = FILA_DATOS + m - 1;
    /* El límite superior es el mes siguiente. Para diciembre eso es el mes 13,
       que Sheets entiende perfectamente como enero del año que viene. */
    const desde = 'DATE(YEAR(TODAY())' + s + m + s + '1)';
    const hasta = 'DATE(YEAR(TODAY())' + s + (m + 1) + s + '1)';
    const rango = M + '!$A:$A' + s + '">="&' + desde + s + M + '!$A:$A' + s + '"<"&' + hasta;
    const suma = (tipo, extra) => '=SUMIFS(' + M + '!$F:$F' + s + rango + s + M + '!$C:$C' + s +
      '"' + tipo + '"' + (extra ? s + extra : '') + ')';

    meses.push([
      '=' + desde,
      suma('Ingreso'),
      suma('Gasto'),
      '=B' + f + '-C' + f,
      '=IFERROR(VLOOKUP(TEXT(A' + f + s + '"yyyy-mm")' + s +
        HOJA_CIERRES + '!$A:$D' + s + '4' + s + 'FALSE)' + s + REF_PLAN + ')',
      '=IF(E' + f + '=0' + s + '""' + s + 'C' + f + '/E' + f + ')',
      suma('Gasto', M + '!$I:$I' + s + '"Común"'),
      suma('Gasto', M + '!$I:$I' + s + '"Personal"')
    ]);
  }
  hoja.getRange(FILA_DATOS, 1, 12, 8).setFormulas(meses);

  const total = FILA_DATOS + 12;
  hoja.getRange(total, 1).setValue('Total año');
  const sumaColumna = col => '=SUM(' + col + FILA_DATOS + ':' + col + (total - 1) + ')';
  hoja.getRange(total, 2, 1, 3)
      .setFormulas([[sumaColumna('B'), sumaColumna('C'), sumaColumna('D')]]);
  hoja.getRange(total, 7, 1, 2)
      .setFormulas([[sumaColumna('G'), sumaColumna('H')]]);

  const filaPersonas = total + 2;
  hoja.getRange(filaPersonas, 1, 1, 3).setValues([['POR PERSONA, EN EL AÑO', 'GASTADO', '% DEL TOTAL']])
      .setFontWeight('bold');
  const delAnio = [];
  for (var i = 0; i < TOPE_PERSONAS; i++) {
    const f = filaPersonas + 1 + i;
    const origen = HOJA_LISTAS + '!$A' + (FILA_DATOS + i);
    delAnio.push([
      '=IF(' + origen + '=""' + s + '""' + s + origen + ')',
      '=IF($A' + f + '=""' + s + '""' + s +
        'SUMIFS(' + M + '!$F:$F' + s + M + '!$C:$C' + s + '"Gasto"' + s + M + '!$H:$H' + s + '$A' + f + s +
        M + '!$A:$A' + s + '">="&DATE(YEAR(TODAY())' + s + '1' + s + '1)' + s +
        M + '!$A:$A' + s + '"<"&DATE(YEAR(TODAY())+1' + s + '1' + s + '1)))',
      '=IF(OR($A' + f + '=""' + s + '$C$' + total + '=0)' + s + '""' + s + '$B' + f + '/$C$' + total + ')'
    ]);
  }
  hoja.getRange(filaPersonas + 1, 1, TOPE_PERSONAS, 3).setFormulas(delAnio);

  formatoSeguro(hoja.getRange(FILA_DATOS, 1, 12, 1), 'mmmm');
  formatoSeguro(hoja.getRange(FILA_DATOS, 2, 13, 4), '#,##0');
  formatoSeguro(hoja.getRange(FILA_DATOS, 6, 12, 1), '0%');
  formatoSeguro(hoja.getRange(FILA_DATOS, 7, 13, 2), '#,##0');
  formatoSeguro(hoja.getRange(filaPersonas + 1, 2, TOPE_PERSONAS, 1), '#,##0');
  formatoSeguro(hoja.getRange(filaPersonas + 1, 3, TOPE_PERSONAS, 1), '0%');

  dibujarGraficos(hoja, total, filaPersonas);
  hoja.setColumnWidth(1, 190);
}

/** Dos gráficos: el año mes a mes y el reparto por persona. */
function dibujarGraficos(hoja, filaTotal, filaPersonas) {
  hoja.getCharts().forEach(g => hoja.removeChart(g));

  const columnas = hoja.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(hoja.getRange(FILA_CABECERA, 1, 13, 1))
    .addRange(hoja.getRange(FILA_CABECERA, 2, 13, 2))
    .setPosition(FILA_CABECERA, 10, 0, 0)
    .setOption('title', 'Entrado y gastado por mes')
    .setOption('colors', ['#5E7A52', '#A3341F'])
    .setOption('legend', { position: 'bottom' })
    .setOption('width', 620).setOption('height', 320)
    .build();
  hoja.insertChart(columnas);

  const torta = hoja.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(hoja.getRange(filaPersonas + 1, 1, TOPE_PERSONAS, 2))
    .setPosition(FILA_CABECERA + 18, 10, 0, 0)
    .setOption('title', 'Gasto por persona en el año')
    .setOption('colors', COLORES_PERSONA)
    .setOption('legend', { position: 'right' })
    .setOption('width', 620).setOption('height', 320)
    .build();
  hoja.insertChart(torta);
}

/* ========================================================================
   API: doPost
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
       cabeceras de CORS. Pasó de verdad. El POST con text/plain sí funciona. */
    if (peticion.accion === 'mes') return responder({ ok: true, datos: leerLibro() });

    /* Todo lo que escribe va bajo el mismo cerrojo. Sin él, dos reintentos que
       lleguen a la vez pueden comprobar el UUID antes de que ninguno lo haya
       escrito, los dos concluyen que es nuevo, y sale el gasto duplicado que
       precisamente queríamos evitar. */
    const bloqueo = LockService.getScriptLock();
    if (!bloqueo.tryLock(25000)) {
      return responder({ ok: false, error: 'El script está ocupado, reinténtalo' });
    }

    try {
      return responder(despachar(peticion));
    } finally {
      bloqueo.releaseLock();
    }

  } catch (error) {
    return responder({ ok: false, error: String(error) });
  }
}

function despachar(peticion) {
  const datos = peticion.datos || {};

  switch (peticion.accion) {
    case 'movimientos':  return altaMovimientos(peticion.movimientos || []);
    case 'movimiento-edita': return editarMovimiento(datos);
    case 'movimiento-baja':  return bajaMovimiento(datos);
    case 'fijo':         return guardarFijo(datos);
    case 'fijo-baja':    return bajaFijo(datos);
    case 'fijo-cargo':   return marcarCargo(datos);
    case 'cerrar-mes':   return cerrarMes(datos.mes, datos.uuid);
    case 'reparto':      return guardarReparto(datos);
    case 'metas':        return guardarMetas(datos.metas || []);
    case 'config':       return guardarConfig(datos);
    default:
      return { ok: false, error: 'Acción desconocida: ' + peticion.accion };
  }
}

/**
 * doGet queda para comprobar el despliegue a mano desde el navegador: pegas la
 * URL con ?token=... y ves el JSON. La app NO lo usa.
 */
function doGet(e) {
  const recibido = e && e.parameter ? e.parameter.token : '';
  if (!tokenValido(recibido)) return responder({ ok: false, error: 'Token no válido' });
  return responder({ ok: true, datos: leerLibro() });
}

/* ------------------------------------------------------------------ leer */

/**
 * Todo lo que la app necesita, en una sola petición.
 *
 * Una lectura y no cinco: cada llamada al Apps Script tarda medio segundo largo
 * y la app se abre para anotar un gasto, no para esperar. Los cálculos —saldo,
 * reparto por persona, común y personal— los hace la app con estos datos; aquí
 * solo se devuelve lo que está escrito.
 */
function leerLibro() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const listas = leerListasExistentes(libro);
  const config = leerConfigActual(libro);
  const desde = mesMas(mesDe(hoy()), -MESES_QUE_VIAJAN);

  return {
    hoy: iso(hoy()),
    config: { plan: config.plan, limite: config.limite, avisos: config.avisos },
    personas: listas.personas.map((p, i) => ({
      nombre: p.nombre,
      color: p.color || COLORES_PERSONA[i % COLORES_PERSONA.length]
    })),
    cuentas: listas.cuentas,
    categorias: listas.categorias,
    movimientos: leerMovimientos(libro, desde),
    fijos: leerFijos(libro),
    metas: leerMetas(libro),
    cierres: leerCierres(libro)
  };
}

function leerMovimientos(libro, desdeMes) {
  const hoja = libro.getSheetByName(HOJA_MOVIMIENTOS);
  if (!hoja || hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, 11).getValues()
    .filter(f => f[0] instanceof Date && iso(f[0]).slice(0, 7) >= desdeMes)
    .map(f => ({
      uuid: String(f[10] || ''),
      fecha: iso(f[0]),
      tipo: f[2] === 'Ingreso' ? 'Ingreso' : 'Gasto',
      categoria: String(f[3] || ''),
      descripcion: String(f[4] || ''),
      importe: Number(f[5]) || 0,
      cuenta: String(f[6] || ''),
      persona: String(f[7] || ''),
      reparto: f[8] === 'Común' ? 'Común' : 'Personal',
      origen: String(f[9] || 'app')
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function leerFijos(libro) {
  const hoja = libro.getSheetByName(HOJA_FIJOS);
  if (!hoja || hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, 14).getValues()
    .filter(f => f[2])
    .map(f => ({
      uuid: String(f[0] || ''),
      tipo: f[1] === 'Ingreso' ? 'Ingreso' : 'Gasto',
      concepto: String(f[2]),
      importe: Number(f[3]) || 0,
      dia: Number(f[4]) || 1,
      cada: Number(f[5]) || 1,
      cuotas: Number(f[6]) || 0,
      restantes: Number(f[7]) || 0,
      cuenta: String(f[8] || ''),
      persona: String(f[9] || ''),
      reparto: f[10] === 'Común' ? 'Común' : 'Personal',
      activo: f[11] !== false,
      prox: f[12] instanceof Date ? iso(f[12]) : '',
      ultimo: f[13] instanceof Date ? iso(f[13]) : ''
    }));
}

function leerMetas(libro) {
  const hoja = libro.getSheetByName(HOJA_METAS);
  if (!hoja) return [];
  return hoja.getRange(FILA_DATOS, 1, TOPE_METAS, 7).getValues()
    .filter(f => f[0])
    .map((f, i) => ({
      nombre: String(f[0]),
      objetivo: Number(f[1]) || 0,
      guardado: Number(f[2]) || 0,
      orden: Number(f[5]) || i + 1,
      activa: f[6] !== false
    }));
}

function leerCierres(libro) {
  const hoja = libro.getSheetByName(HOJA_CIERRES);
  if (!hoja) return [];
  return hoja.getRange(FILA_DATOS, 1, TOPE_CIERRES, 7).getValues()
    .filter(f => f[0])
    .map(f => {
      const entrado = Number(f[1]) || 0;
      const gastado = Number(f[2]) || 0;
      const repartido = Number(f[5]) || 0;
      /* Lo ahorrado se calcula aquí en vez de leer la celda, aunque la celda
         lo tenga: es una fórmula, y una fórmula puede estar rota, vacía o
         recién escrita y sin recalcular. Si eso pasara, la app enseñaría un
         "Ahorrado 0" muy convencido justo encima de un entrado y un gastado
         que no cuadran con él. Es la definición del número: no hace falta
         preguntársela a nadie. */
      return {
        mes: String(f[0]),
        entrado: entrado,
        gastado: gastado,
        plan: Number(f[3]) || 0,
        ahorrado: entrado - gastado,
        repartido: repartido,
        sinAsignar: (entrado - gastado) - repartido
      };
    })
    .sort((a, b) => b.mes.localeCompare(a.mes));
}

/* --------------------------------------------------------------- escribir */

function altaMovimientos(movimientos) {
  if (!movimientos.length) return { ok: false, error: 'Petición sin movimientos' };

  // Se valida todo antes de escribir nada: media operación escrita descuadra.
  for (var i = 0; i < movimientos.length; i++) {
    const problema = validarMovimiento(movimientos[i]);
    if (problema) return { ok: false, error: problema };
  }

  var escritos = 0, duplicados = 0;
  movimientos.forEach(m => {
    // Un UUID ya visto no es un error: es un reintento de algo guardado. La app
    // necesita un ok para poder sacarlo de la cola.
    if (uuidYaRegistrado(m.uuid)) { duplicados++; return; }
    escribirFilaMovimiento(m);
    registrarUuid(m.uuid, 'movimiento');
    escritos++;
  });

  return { ok: true, escritos: escritos, duplicados: duplicados };
}

function escribirFilaMovimiento(m) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOVIMIENTOS);
  if (!hoja) throw new Error('No existe la hoja ' + HOJA_MOVIMIENTOS + '. Ejecuta instalar().');

  hoja.appendRow([
    fechaDesdeISO(m.fecha), '',
    m.tipo, m.categoria, m.descripcion || '',
    Number(m.importe),   // número de verdad, no texto: los SUMIFS lo necesitan
    m.cuenta, m.persona, m.reparto || 'Personal', m.origen || 'app', m.uuid
  ]);

  /* El formato se fija en la fila recién escrita y no solo en la columna.
     Ponerlo únicamente en la columna al instalar no funcionó: las filas que
     añade appendRow se mostraban con el formato de fecha del sistema. */
  const fila = hoja.getLastRow();
  ponerFormulaMes(hoja, fila, fila);
  formatoSeguro(hoja.getRange(fila, 1), 'yyyy-mm-dd');
  formatoSeguro(hoja.getRange(fila, 6), '#,##0');
}

function editarMovimiento(datos) {
  const fila = buscarFilaPorUuid(HOJA_MOVIMIENTOS, 11, datos.objetivo);
  if (!fila) return { ok: true, escritos: 0, aviso: 'No se encontró el movimiento' };

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOVIMIENTOS);
  const columnas = { tipo: 3, categoria: 4, descripcion: 5, importe: 6,
                     cuenta: 7, persona: 8, reparto: 9 };
  Object.keys(datos.cambios || {}).forEach(clave => {
    if (!columnas[clave]) return;
    hoja.getRange(fila, columnas[clave]).setValue(datos.cambios[clave]);
  });
  return { ok: true, escritos: 1 };
}

function bajaMovimiento(datos) {
  const fila = buscarFilaPorUuid(HOJA_MOVIMIENTOS, 11, datos.objetivo);
  if (fila) SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOVIMIENTOS).deleteRow(fila);
  return { ok: true, escritos: fila ? 1 : 0 };
}

/**
 * Alta o edición de un fijo. La misma acción para las dos: la app manda el fijo
 * entero y aquí se busca por UUID.
 *
 * El próximo cargo lo calcula SIEMPRE el servidor. Es la única fuente fiable de
 * "qué cae en septiembre", y si lo mandara la app dos teléfonos con distinta
 * idea del calendario podrían pisarse.
 */
function guardarFijo(datos) {
  const f = datos.fijo || datos;
  const problema = validarFijo(f);
  if (problema) return { ok: false, error: problema };

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_FIJOS);
  const fila = buscarFilaPorUuid(HOJA_FIJOS, 1, f.uuid) || primeraFilaLibre(hoja);

  const anterior = fila <= hoja.getLastRow() ? hoja.getRange(fila, 14).getValue() : '';
  const ultimo = anterior instanceof Date ? anterior : (f.ultimo ? fechaDesdeISO(f.ultimo) : '');

  hoja.getRange(fila, 1, 1, 14).setValues([[
    f.uuid, f.tipo, f.concepto, Number(f.importe), Number(f.dia), Number(f.cada),
    Number(f.cuotas) || '', Number(f.restantes) || '',
    f.cuenta, f.persona, f.reparto || 'Personal', f.activo !== false,
    calcularProximo(f, hoy()), ultimo
  ]]);

  formatoSeguro(hoja.getRange(fila, 4), '#,##0');
  formatoSeguro(hoja.getRange(fila, 13, 1, 2), 'yyyy-mm-dd');
  return { ok: true, escritos: 1 };
}

function bajaFijo(datos) {
  const fila = buscarFilaPorUuid(HOJA_FIJOS, 1, datos.objetivo);
  if (fila) SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_FIJOS).deleteRow(fila);
  return { ok: true, escritos: fila ? 1 : 0 };
}

/**
 * Marcar un fijo como cobrado, o deshacer la marca.
 *
 * Cobrar un fijo es escribir su fila en Movimientos: no hay un campo "cargado"
 * que valga, porque lo que cuenta en el mes es la fila. El UUID es determinista
 * —fijo-<uuid>-<yyyy-mm>— y eso es lo que impide que el cargo del mes se
 * escriba dos veces, venga del disparador o de un toque en la app.
 */
function marcarCargo(datos) {
  const fila = buscarFilaPorUuid(HOJA_FIJOS, 1, datos.objetivo);
  if (!fila) return { ok: true, escritos: 0, aviso: 'No se encontró el fijo' };

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_FIJOS);
  const f = leerFilaFijo(hoja, fila);
  const marca = 'fijo-' + f.uuid + '-' + datos.mes;

  if (datos.cargado) {
    cobrarFijo(f, fila, datos.mes);
  } else {
    const filaMov = buscarFilaPorUuid(HOJA_MOVIMIENTOS, 11, marca);
    if (filaMov) SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOVIMIENTOS).deleteRow(filaMov);
    borrarUuid(marca);
    /* Al desmarcar hay que devolver la cuota y retrasar el próximo cargo, o el
       fijo se saltaría un mes por haberlo tocado. */
    if (f.cuotas) hoja.getRange(fila, 8).setValue(Number(f.restantes) + 1);
    hoja.getRange(fila, 13).setValue(fechaDesdeISO(diaDelMes(datos.mes, f.dia)));
    hoja.getRange(fila, 14).setValue('');
  }
  return { ok: true, escritos: 1 };
}

/** Escribe el cargo de un fijo en Movimientos y adelanta la regla. */
function cobrarFijo(f, fila, mes) {
  const marca = 'fijo-' + f.uuid + '-' + mes;
  if (uuidYaRegistrado(marca)) return false;

  escribirFilaMovimiento({
    uuid: marca,
    fecha: diaDelMes(mes, f.dia),
    tipo: f.tipo,
    categoria: f.concepto,
    descripcion: '',
    importe: f.importe,
    cuenta: f.cuenta,
    persona: f.persona,
    reparto: f.reparto,
    origen: 'fijo'
  });
  registrarUuid(marca, 'cargo de fijo');

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_FIJOS);
  const restantes = f.cuotas ? Math.max(0, Number(f.restantes) - 1) : 0;
  hoja.getRange(fila, 8).setValue(f.cuotas ? restantes : '');
  hoja.getRange(fila, 14).setValue(fechaDesdeISO(diaDelMes(mes, f.dia)));
  hoja.getRange(fila, 13).setValue(fechaDesdeISO(diaDelMes(mesMas(mes, f.cada), f.dia)));
  // Al agotar las cuotas, el fijo se apaga solo. No se borra: el histórico de
  // lo que se pagó sigue en Movimientos y la regla queda como referencia.
  if (f.cuotas && restantes === 0) hoja.getRange(fila, 12).setValue(false);
  return true;
}

/**
 * Cierra un mes: escribe su fila en Cierres con lo que entró y lo que salió.
 *
 * No se vacía Movimientos. El prototipo lo hacía porque no tenía dónde
 * guardarlo; aquí la hoja es la memoria y borrar el mes sería tirar el dato que
 * hace que el año cuadre.
 */
function cerrarMes(mes, uuid) {
  if (!/^\d{4}-\d{2}$/.test(String(mes))) return { ok: false, error: 'Mes no válido: ' + mes };
  if (uuid && uuidYaRegistrado(uuid)) return { ok: true, escritos: 0, duplicados: 1 };

  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(HOJA_CIERRES);
  const yaEsta = buscarEnColumna(hoja, 1, FILA_DATOS, TOPE_CIERRES, mes);
  if (yaEsta) return { ok: true, escritos: 0, duplicados: 1 };

  /* Antes de cerrar se cobran los fijos que quedaban del mes: si el mes se
     cierra el día 1 y quedaba el recibo del 28 sin marcar, el total tiene que
     incluirlo igual. */
  cobrarFijosDelMes(mes);

  const movimientos = leerMovimientos(libro, mes).filter(m => m.fecha.slice(0, 7) === mes);
  const entrado = movimientos.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + m.importe, 0);
  const gastado = movimientos.filter(m => m.tipo === 'Gasto').reduce((a, m) => a + m.importe, 0);
  const plan = leerConfigActual(libro).plan;

  // La fila 5 es la del mes más reciente: los cierres se leen de arriba abajo.
  hoja.insertRowBefore(FILA_DATOS);
  hoja.getRange(FILA_DATOS, 1, 1, 4).setValues([[mes, entrado, gastado, plan]]);
  hoja.getRange(FILA_DATOS, 8).setValue(new Date());
  ponerFormulasCierre(hoja, FILA_DATOS, FILA_DATOS);
  formatoSeguro(hoja.getRange(FILA_DATOS, 2, 1, 6), '#,##0');
  formatoSeguro(hoja.getRange(FILA_DATOS, 8), 'yyyy-mm-dd hh:mm');

  if (uuid) registrarUuid(uuid, 'cierre de ' + mes);
  return { ok: true, escritos: 1, ahorrado: entrado - gastado };
}

/** Los fijos del mes que aún no han escrito su fila. */
function cobrarFijosDelMes(mes) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_FIJOS);
  if (!hoja || hoja.getLastRow() < 2) return 0;
  var cobrados = 0;
  for (var fila = 2; fila <= hoja.getLastRow(); fila++) {
    const f = leerFilaFijo(hoja, fila);
    if (!f.uuid || !f.activo || !f.prox) continue;
    if (f.prox.slice(0, 7) !== mes) continue;
    if (cobrarFijo(f, fila, mes)) cobrados++;
  }
  return cobrados;
}

function guardarReparto(datos) {
  if (datos.uuid && uuidYaRegistrado(datos.uuid)) return { ok: true, escritos: 0, duplicados: 1 };

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_REPARTO);
  const ahora = new Date();
  const lineas = (datos.asignaciones || [])
    .filter(a => a.meta && Number(a.monto) > 0)
    .map((a, i) => [datos.mes, ahora, a.meta, Number(a.monto), 'cierre',
                    (datos.uuid || 'reparto') + '-' + i]);

  if (!lineas.length) return { ok: true, escritos: 0 };

  const fila = primeraFilaLibreDesde(hoja, FILA_DATOS);
  hoja.getRange(fila, 1, lineas.length, 6).setValues(lineas);
  formatoSeguro(hoja.getRange(fila, 2, lineas.length, 1), 'yyyy-mm-dd hh:mm');
  formatoSeguro(hoja.getRange(fila, 4, lineas.length, 1), '#,##0');

  if (datos.uuid) registrarUuid(datos.uuid, 'reparto de ' + datos.mes);
  return { ok: true, escritos: lineas.length };
}

/**
 * Reescribe la tabla de metas.
 *
 * Se manda entera y no meta a meta porque el orden importa —el reparto "por
 * orden" las recorre en él— y porque renombrar una meta hay que hacerlo también
 * en sus líneas de Reparto: si no, lo guardado se quedaría colgando del nombre
 * viejo y la meta aparecería a cero.
 */
function guardarMetas(metas) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(HOJA_METAS);

  metas.forEach(m => { if (m.antes && m.antes !== m.nombre) renombrarEnReparto(libro, m.antes, m.nombre); });

  hoja.getRange(FILA_DATOS, 1, TOPE_METAS, 2).clearContent();
  hoja.getRange(FILA_DATOS, 6, TOPE_METAS, 3).clearContent();

  metas.slice(0, TOPE_METAS).forEach((m, i) => {
    const fila = FILA_DATOS + i;
    hoja.getRange(fila, 1).setValue(m.nombre || '');
    hoja.getRange(fila, 2).setValue(Number(m.objetivo) || 0);
    hoja.getRange(fila, 6).setValue(i + 1);
    hoja.getRange(fila, 7).setValue(m.activa !== false);
    hoja.getRange(fila, 8).setValue(m.notas || '');
  });

  return { ok: true, escritos: metas.length };
}

function renombrarEnReparto(libro, antes, ahora) {
  const hoja = libro.getSheetByName(HOJA_REPARTO);
  if (!hoja || hoja.getLastRow() < FILA_DATOS) return;
  const rango = hoja.getRange(FILA_DATOS, 3, hoja.getLastRow() - FILA_CABECERA, 1);
  const valores = rango.getValues();
  var cambios = 0;
  valores.forEach(v => { if (v[0] === antes) { v[0] = ahora; cambios++; } });
  if (cambios) rango.setValues(valores);
}

/** Escribe en Config y en Listas lo que se edita desde Ajustes. */
function guardarConfig(datos) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();

  if (datos.config) {
    const hoja = libro.getSheetByName(HOJA_CONFIG);
    if (datos.config.plan !== undefined) hoja.getRange('B4').setValue(Number(datos.config.plan));
    if (datos.config.limite !== undefined) hoja.getRange('B7').setValue(Number(datos.config.limite));
    if (datos.config.avisos) {
      const a = datos.config.avisos;
      if (a.fijo !== undefined) hoja.getRange('B11').setValue(a.fijo === true);
      if (a.saldo !== undefined) hoja.getRange('B12').setValue(a.saldo === true);
      if (a.semanal !== undefined) hoja.getRange('B13').setValue(a.semanal === true);
    }
  }

  if (datos.personas || datos.cuentas || datos.categorias) {
    const listas = leerListasExistentes(libro);
    if (datos.personas) {
      listas.personas = datos.personas
        .filter(p => p && String(p.nombre || '').trim())
        .map((p, i) => ({ nombre: String(p.nombre).trim(), color: p.color || COLORES_PERSONA[i % 4] }));
    }
    if (datos.cuentas) listas.cuentas = datos.cuentas.filter(c => String(c || '').trim());
    if (datos.categorias) {
      listas.categorias = datos.categorias
        .filter(c => c && String(c.nombre || '').trim())
        .map(c => ({
          nombre: String(c.nombre).trim(),
          tipo: c.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto',
          reparto: c.reparto === 'Común' ? 'Común' : 'Personal'
        }));
    }
    escribirListas(libro, listas);
  }

  return { ok: true, escritos: 1 };
}

/* ========================================================================
   Disparador diario
   ======================================================================== */

/**
 * Lo que la app no puede hacer porque está cerrada.
 *
 * Corre de madrugada y hace dos cosas: cobrar los fijos que tocan hoy, y
 * cerrar el mes anterior la primera madrugada del mes. Ese es el "se cierra
 * solo la última noche" que promete la app: una PWA no se despierta sola, así
 * que quien lo hace es la hoja.
 */
function tareaDiaria() {
  const bloqueo = LockService.getScriptLock();
  if (!bloqueo.tryLock(30000)) return;
  try {
    cobrarFijosDeHoy();
    const hoyFecha = hoy();
    if (hoyFecha.getDate() === 1) {
      cerrarMes(mesMas(mesDe(hoyFecha), -1), 'cierre-automatico-' + mesMas(mesDe(hoyFecha), -1));
    }
  } finally {
    bloqueo.releaseLock();
  }
}

function cobrarFijosDeHoy() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_FIJOS);
  if (!hoja || hoja.getLastRow() < 2) return 0;
  const hoyISO = iso(hoy());
  var cobrados = 0;
  for (var fila = 2; fila <= hoja.getLastRow(); fila++) {
    const f = leerFilaFijo(hoja, fila);
    if (!f.uuid || !f.activo || !f.prox) continue;
    if (f.prox > hoyISO) continue;   // todavía no toca
    if (cobrarFijo(f, fila, f.prox.slice(0, 7))) cobrados++;
  }
  return cobrados;
}

function instalarDisparadorDiario() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const nombre = t.getHandlerFunction();
    // Se retiran también los del formato anterior, que ya no existen.
    if (['tareaDiaria', 'procesarSuscripciones'].indexOf(nombre) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tareaDiaria').timeBased().atHour(1).everyDays(1).create();
}

/* ========================================================================
   Utilidades
   ======================================================================== */

function leerFilaFijo(hoja, fila) {
  const f = hoja.getRange(fila, 1, 1, 14).getValues()[0];
  return {
    uuid: String(f[0] || ''), tipo: f[1] === 'Ingreso' ? 'Ingreso' : 'Gasto',
    concepto: String(f[2] || ''), importe: Number(f[3]) || 0, dia: Number(f[4]) || 1,
    cada: Number(f[5]) || 1, cuotas: Number(f[6]) || 0, restantes: Number(f[7]) || 0,
    cuenta: String(f[8] || ''), persona: String(f[9] || ''),
    reparto: f[10] === 'Común' ? 'Común' : 'Personal', activo: f[11] !== false,
    prox: f[12] instanceof Date ? iso(f[12]) : '',
    ultimo: f[13] instanceof Date ? iso(f[13]) : ''
  };
}

/**
 * El próximo cargo de un fijo.
 *
 * Si nunca se ha cobrado, es su día de este mes, o el del mes que viene si el
 * día ya pasó: cobrar hoy un recibo que salió el día 5 sería inventarse un
 * gasto. Si ya se cobró, es un salto de `cada` meses desde el último.
 */
function calcularProximo(f, referencia) {
  const dia = Number(f.dia) || 1;
  const cada = Math.max(1, Number(f.cada) || 1);

  if (f.ultimo) {
    const ultimo = f.ultimo instanceof Date ? f.ultimo : fechaDesdeISO(f.ultimo);
    return fechaDesdeISO(diaDelMes(mesMas(iso(ultimo).slice(0, 7), cada), dia));
  }
  if (f.prox) return f.prox instanceof Date ? f.prox : fechaDesdeISO(f.prox);

  const mes = mesDe(referencia);
  const candidato = diaDelMes(mes, dia);
  return fechaDesdeISO(candidato >= iso(referencia) ? candidato : diaDelMes(mesMas(mes, 1), dia));
}

/** El día `dia` del mes `mes`, recortado a lo que ese mes tenga. El 31 en
 *  febrero es el 28, o el 29: es lo que quiere decir "a fin de mes". */
function diaDelMes(mes, dia) {
  const partes = String(mes).split('-');
  const tope = new Date(Number(partes[0]), Number(partes[1]), 0).getDate();
  return mes + '-' + dosDigitos(Math.min(Number(dia) || 1, tope));
}

function mesDe(fecha) { return iso(fecha).slice(0, 7); }

function mesMas(mes, n) {
  const partes = String(mes).split('-').map(Number);
  const total = partes[0] * 12 + (partes[1] - 1) + Number(n);
  return Math.floor(total / 12) + '-' + dosDigitos((total % 12) + 1);
}

function mesesEntre(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function dosDigitos(n) { return (n < 10 ? '0' : '') + n; }

function hoy() { return new Date(); }

/** yyyy-MM-dd en la zona horaria de la hoja. Sin fijar la zona, una ejecución
 *  de madrugada puede fechar el cargo en el día anterior. */
function iso(fecha) {
  return Utilities.formatDate(fecha, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(),
                              'yyyy-MM-dd');
}

function fechaDesdeISO(texto) {
  const p = String(texto).split('-').map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
}

function nuevoUuid() { return Utilities.getUuid(); }

function buscarFilaPorUuid(nombreHoja, columna, uuid) {
  if (!uuid) return 0;
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombreHoja);
  if (!hoja || hoja.getLastRow() < 2) return 0;
  // createTextFinder busca en el servidor y no se trae la columna entera, que
  // con los años puede tener miles de filas.
  const encontrado = hoja.getRange(2, columna, hoja.getLastRow() - 1, 1)
    .createTextFinder(uuid).matchEntireCell(true).findNext();
  return encontrado ? encontrado.getRow() : 0;
}

function buscarEnColumna(hoja, columna, desde, cuantas, valor) {
  const valores = hoja.getRange(desde, columna, cuantas, 1).getValues();
  for (var i = 0; i < valores.length; i++) if (String(valores[i][0]) === String(valor)) return desde + i;
  return 0;
}

/**
 * La primera fila libre de verdad.
 *
 * No vale getLastRow(): una casilla de verificación cuenta como contenido,
 * así que una columna con casillas preparadas hasta la fila 60 hace que
 * getLastRow() diga 60 y la fila nueva se escriba en la 61, muy por debajo de
 * la tabla. Pasó, y las altas se escribían donde nadie las veía.
 */
function primeraFilaLibre(hoja) { return primeraFilaLibreDesde(hoja, 2); }

function primeraFilaLibreDesde(hoja, desde) {
  const ultima = Math.max(hoja.getLastRow(), desde);
  const alto = ultima - desde + 1;
  if (alto <= 0) return desde;
  const valores = hoja.getRange(desde, 1, alto, 1).getValues();
  for (var i = 0; i < valores.length; i++) {
    if (valores[i][0] === '' || valores[i][0] === null) return desde + i;
  }
  return desde + alto;
}

function registrarUuid(uuid, que) {
  if (!uuid) return;
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_UUIDS)
    .appendRow([uuid, new Date(), que || '']);
}

function uuidYaRegistrado(uuid) {
  if (!uuid) return false;
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_UUIDS);
  if (!hoja || hoja.getLastRow() < 2) return false;
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, 1)
    .createTextFinder(uuid).matchEntireCell(true).findNext() !== null;
}

function borrarUuid(uuid) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_UUIDS);
  if (!hoja || hoja.getLastRow() < 2) return;
  const encontrado = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1)
    .createTextFinder(uuid).matchEntireCell(true).findNext();
  if (encontrado) hoja.deleteRow(encontrado.getRow());
}

/** Borra la hoja y la vuelve a crear. Rehacerla es más seguro que limpiarla:
 *  `clear()` no deshace una columna que quedó con formato de texto, y ahí un
 *  número escrito deja de sumar sin que nada avise. */
function hojaLimpia(libro, nombre) {
  const vieja = libro.getSheetByName(nombre);
  if (vieja) libro.deleteSheet(vieja);
  return libro.insertSheet(nombre, libro.getNumSheets());
}

function titular(hoja, titulo, explicacion) {
  hoja.getRange('A1').setValue(titulo).setFontSize(14).setFontWeight('bold');
  hoja.getRange('A2').setValue(explicacion).setFontColor('#666666');
}

/**
 * Crea o rehace un rango con nombre.
 *
 * Se pregunta si existe en vez de intentar borrarlo y recoger los trozos, y no
 * es una manía: `removeNamedRange` sobre un nombre que no existe lanza
 * excepción, y un try/catch alrededor NO la atrapa. Apps Script agrupa las
 * escrituras y las manda en el siguiente flush, así que la excepción salta
 * lejos de aquí.
 *
 * Pasó de verdad en la primera instalación: el error apareció dentro de
 * `formatoSeguro` y el registro dijo «No se pudo dar formato "#,##0" a B4: el
 * intervalo denominado "PLAN" no existe», señalando a un sitio que no tenía
 * nada que ver. Y como el lote se aborta al fallar, se perdió todo lo que iba
 * detrás: los dos nombres y el bloque de controles de Config.
 *
 * El flush del final es para que, si alguna vez falla, falle aquí.
 */
function ponerNombre(libro, nombre, rango) {
  libro.getNamedRanges().forEach(function (existente) {
    if (existente.getName() === nombre) existente.remove();
  });
  libro.setNamedRange(nombre, rango);
  SpreadsheetApp.flush();
}

/**
 * Aplica un formato de número sin poder tumbar la instalación.
 *
 * El formato es cosmético: que los importes salgan con puntos de millar está
 * bien, pero no vale un panel a medias por ello. Si Sheets se niega, se anota
 * en el registro y se sigue.
 *
 * El flush() es la parte importante: Apps Script agrupa las escrituras y las
 * manda cuando le viene bien, así que sin él el error no salta aquí sino en la
 * siguiente llamada que fuerce el envío —en su día, el getRange() del gráfico—
 * y ni el try lo atrapa ni el rastro de pila señala al culpable.
 */
function formatoSeguro(rango, formato) {
  try {
    rango.setNumberFormat(formato);
    SpreadsheetApp.flush();
  } catch (e) {
    Logger.log('No se pudo dar formato "' + formato + '" a ' + rango.getA1Notation() + ': ' + e.message);
  }
}

/**
 * Averigua si esta hoja separa los argumentos de una fórmula con coma o con
 * punto y coma.
 *
 * Hace falta porque setFormula() escribe la cadena tal cual, y una hoja en
 * español espera ';': ahí la coma es el separador decimal, así que
 * =EOMONTH(TODAY(),0) no es "fin de mes" sino un error de sintaxis. El panel
 * entero salió con #ERROR! por esto.
 *
 * Se comprueba en vez de deducirlo del idioma: =SUM(1,1) da 2 donde la coma
 * separa argumentos, y 1,1 donde es el decimal. Así funciona con cualquier
 * configuración, incluidas las que no se me ocurran.
 */
var SEPARADOR = null;
function sep(hoja) {
  if (SEPARADOR !== null) return SEPARADOR;
  /* La sonda va en la última columna y en una fila alta para no pisar nada.
     Quien la llame debe contar sus filas en vez de preguntar por getLastRow:
     ver escribirMovimientos. */
  const sonda = hoja.getRange(200, 26);
  sonda.setFormula('=SUM(1,1)');
  SpreadsheetApp.flush();
  const resultado = sonda.getValue();
  sonda.clear();
  SEPARADOR = resultado === 2 ? ',' : ';';
  return SEPARADOR;
}

function tokenValido(recibido) {
  const esperado = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return Boolean(esperado) && String(recibido) === String(esperado);
}

function validarMovimiento(m) {
  if (!m) return 'Movimiento vacío';
  if (!m.uuid) return 'Falta el uuid';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha))) return 'Fecha no válida: ' + m.fecha;
  if (['Gasto', 'Ingreso'].indexOf(m.tipo) === -1) return 'Tipo no válido: ' + m.tipo;
  if (!m.categoria) return 'Falta la categoría';
  const importe = Number(m.importe);
  if (!isFinite(importe) || importe <= 0) return 'Importe no válido: ' + m.importe;
  return '';
}

function validarFijo(f) {
  if (!f || !f.uuid) return 'Fijo sin uuid';
  if (!f.concepto) return 'Falta el concepto';
  if (['Gasto', 'Ingreso'].indexOf(f.tipo) === -1) return 'Tipo no válido: ' + f.tipo;
  const importe = Number(f.importe);
  if (!isFinite(importe) || importe <= 0) return 'Importe no válido: ' + f.importe;
  const dia = Number(f.dia);
  if (!(dia >= 1 && dia <= 31)) return 'Día no válido: ' + f.dia;
  return '';
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
