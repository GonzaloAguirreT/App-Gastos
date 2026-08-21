/**
 * Backend de la app de gastos. Se pega tal cual en el editor de Apps Script de
 * la hoja de cálculo y se despliega como aplicación web.
 *
 * El libro es la base de datos y este archivo, su contrato. Diez pestañas:
 *
 *   Panel        el mes en curso, en la misma jerarquía que la pantalla Mes
 *   Año          doce filas, una por mes, de donde leen los gráficos
 *   Movimientos  una fila por apunte, con el mes que lo PAGA en «Se usa en»
 *   Fijos        las reglas que escriben solas
 *   Metas        a qué se destina el ahorro
 *   Cierres      una fila por mes cerrado, con su Total Ahorrado
 *   Reparto      el libro mayor del ahorro: cada asignación, una línea
 *   Listas       personas con su día de cobro, cuentas con su crédito, categorías
 *   Config       ahorro esperado y avisos: lo que es de los dos
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

/* El ahorro esperado, tal y como lo citan las fórmulas de Panel y de Año. Es
   la celda y no el rango con nombre a propósito: ver ponerNombre().

   Config!B4 dejó de ser "el plan del mes" y pasó a ser el colchón que no se
   quiere tocar: el techo del mes ya no se escribe a mano, es lo que entra. */
const REF_AHORRO = HOJA_CONFIG + '!$B$4';

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
/* SE USA EN es la columna que ordena el libro entero: el mes que PAGA la fila,
   que no es el mes de su fecha. Todas las fórmulas de Panel y de Año filtran
   por ella y ninguna por la fecha; si filtraran por la fecha, la factura de la
   tarjeta aparecería en el mes en el que no la vas a pagar. */
const CABECERAS_MOVIMIENTOS = ['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
                               'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID'];

const CABECERAS_FIJOS = ['UUID', 'TIPO', 'CONCEPTO', 'IMPORTE', 'DÍA', 'CADA (MESES)',
                         'CUOTAS', 'RESTANTES', 'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN',
                         'ACTIVO', 'PRÓXIMO CARGO', 'ÚLTIMO CARGO', 'MES IMPUTADO'];

const CABECERAS_METAS = ['META', 'OBJETIVO', 'GUARDADO', 'FALTA', 'AVANCE', 'ORDEN', 'ACTIVA', 'NOTAS'];
const CABECERAS_CIERRES = ['MES', 'ENTRÓ', 'GASTÓ', 'AHORRO ESPERADO', 'TOTAL AHORRADO',
                           'REPARTIDO', 'SIN ASIGNAR', 'CERRADO EL'];
const CABECERAS_REPARTO = ['MES', 'FECHA', 'META', 'MONTO', 'ORIGEN', 'UUID'];
/* Tres listas en paralelo. La de personas lleva su día de cobro de tarjeta —es
   de cada uno, no del hogar— y la de cuentas, cuáles aplazan el cargo. */
const CABECERAS_LISTAS = ['PERSONA', 'COLOR', 'DÍA COBRO TC',
                          'CUENTA', 'ES CRÉDITO', 'ACTIVA',
                          'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'];

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
/* Cuáles de esas cuentas aplazan el cargo al mes que las factura. */
const CREDITO_SEMILLA = ['Tarjeta Credito'];
/* Y con qué día, hasta que cada persona ponga el suyo en Listas!C. */
const DIA_COBRO_SEMILLA = 5;
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

/* El colchón del mes. Ya no hay «plan»: el techo es lo que entra. */
const AHORRO_SEMILLA = 200000;

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

  /* Cronómetro por fases.
   *
   * Va con console.log y no con Logger.log a propósito: console.log sale al
   * registro en cuanto se escribe, así que sobrevive a que la ejecución muera;
   * Logger.log se vuelca al final y en un "Exceeded maximum execution time" no
   * llega a volcarse nunca.
   *
   * Existe porque esto ya se ha muerto dos veces por tiempo y el registro solo
   * decía que se había muerto, no dónde. Con esto, la última línea del registro
   * es el sitio. */
  const arranque = Date.now();
  const paso = nombre => console.log(nombre + ' · ' + (Date.now() - arranque) + ' ms');

  /* Leer ANTES de tocar nada. Si algo falla a mitad, el libro se queda como
     estaba en vez de a medio migrar. */
  const movimientos = leerMovimientosParaMigrar(libro);
  const fijos = leerFijosParaMigrar(libro);
  const listas = leerListasExistentes(libro);
  const metas = leerTablaExistente(libro, HOJA_METAS, 8);
  const cierres = leerTablaExistente(libro, HOJA_CIERRES, 8);
  const reparto = leerTablaExistente(libro, HOJA_REPARTO, 6);

  const config = leerConfigActual(libro);
  paso('leído el libro');

  /* Panel y Año se retiran ANTES de reescribir los datos, y no es por orden:
     es lo que hace que una segunda instalación termine.

     Las dos hojas son cientos de SUMIFS sobre columnas enteras. Mientras
     existen, cada vez que se borra y se reescribe Movimientos, Sheets recalcula
     todas. La primera instalación tardó minuto y medio porque esas hojas aún no
     existían; la segunda se pasó de los seis minutos que da Apps Script y murió
     con "Exceeded maximum execution time". Sin nadie mirando, la reescritura de
     los datos vuelve a costar lo que costaba. */
  retirarHojas(libro, [HOJA_PANEL, HOJA_ANIO]);
  paso('retirados Panel y Año');

  /* El orden de aquí abajo es el de las DEPENDENCIAS, no el de las pestañas.

     hojaLimpia borra la hoja y la vuelve a crear, y en Sheets borrar una hoja
     convierte en #REF! toda fórmula que la citaba —recrearla con el mismo
     nombre no las recupera—. Así que ninguna hoja puede escribirse antes que
     otra a la que apunte: Metas y Cierres citan Reparto, y Config cita
     Movimientos, Fijos, Metas y Cierres.

     Antes no era así, y solo se salvó de milagro: en la primera instalación
     esas hojas no existían todavía, así que no había nada que borrar. */
  escribirListas(libro, listas);
  paso('Listas');
  escribirMovimientos(libro, movimientos, listas.categorias);
  paso('Movimientos');
  escribirFijos(libro, fijos, listas.categorias);
  paso('Fijos');
  escribirReparto(libro, reparto);
  paso('Reparto');
  escribirMetas(libro, metas);
  paso('Metas');
  escribirCierres(libro, cierres);
  paso('Cierres');
  escribirConfig(libro, config);
  paso('Config');
  prepararUuids(libro);

  retirarHojasViejas(libro);
  paso('retiradas las hojas viejas');
  crearPanel(libro);
  paso('Panel');
  crearAnio(libro);
  paso('Año');
  ordenarPestanas(libro);
  instalarDisparadorDiario();
  paso('pestañas y disparador');

  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  const resumen = (token
    ? 'Listo. El libro ya tiene el formato nuevo.'
    : 'Listo, PERO falta el TOKEN en Configuración del proyecto → Propiedades del script.')
    + ' Movimientos migrados: ' + movimientos.length
    + '. Fijos migrados: ' + fijos.length + '.';

  /* AQUÍ NO PUEDE HABER UN SpreadsheetApp.getUi().alert().
   *
   * Un alert es modal y SUSPENDE el script hasta que alguien pulsa Aceptar.
   * Ejecutando desde el editor con la pestaña de la hoja cerrada no lo pulsa
   * nadie: el trabajo terminaba en treinta segundos y la ejecución se quedaba
   * parada hasta morir a los seis minutos con "Exceeded maximum execution
   * time". Pasó tres veces seguidas, y como alert() no lanza sino que bloquea,
   * el try/catch que tenía alrededor no servía de nada.
   *
   * console.log sale al registro siempre. toast() es un aviso flotante que no
   * bloquea: si hay alguien mirando la hoja lo ve, y si no, no pasa nada. */
  console.log(resumen);
  try {
    libro.toast(resumen, 'Instalación', 15);
  } catch (e) {
    /* Sin hoja delante no hay dónde enseñarlo, y da igual: está en el registro. */
  }

  paso('terminado');
}

/**
 * Los movimientos que ya hay, sea cual sea el formato en que estén.
 *
 * Han existido tres. El primero tenía siete columnas —Fecha, Concepto,
 * Importe, Cuenta, Tipo, Categoría, Usuario—; el segundo once, con una columna
 * MES en la B que era una fórmula sobre la fecha; el de ahora también once,
 * pero sin MES y con SE USA EN en la I, que es un dato y no una fórmula porque
 * el mes que paga una compra no siempre es el de su fecha.
 *
 * Se distinguen por la cabecera de la B, que es lo único que dice de verdad
 * qué formato hay delante. Un movimiento del formato intermedio se queda sin
 * «Se usa en»: se lo pone escribirMovimientos, que lo calcula.
 */
function leerMovimientosParaMigrar(libro) {
  const hoja = libro.getSheetByName(HOJA_MOVIMIENTOS);
  if (!hoja || hoja.getLastRow() < 2) return [];

  const ancho = hoja.getLastColumn();
  const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, ancho).getValues();
  const cabeceraB = String(hoja.getRange(1, 2).getValue()).toUpperCase();
  const conMes = ancho >= 11 && cabeceraB.indexOf('MES') === 0;
  const actual = ancho >= 11 && cabeceraB.indexOf('TIPO') === 0;

  return filas
    .filter(f => f[0] instanceof Date)
    .map(f => {
      if (actual) {
        return { fecha: f[0], tipo: f[1], categoria: f[2], descripcion: f[3], importe: f[4],
                 cuenta: f[5], persona: f[6], reparto: f[7], paraMes: mesDeCelda(f[8]),
                 origen: f[9] || 'app', uuid: f[10] || '' };
      }
      if (conMes) {
        return { fecha: f[0], tipo: f[2], categoria: f[3], descripcion: f[4], importe: f[5],
                 cuenta: f[6], persona: f[7], reparto: f[8], origen: f[9] || 'app', uuid: f[10] || '' };
      }
      return { fecha: f[0], tipo: f[4], categoria: f[5], descripcion: f[1], importe: f[2],
               cuenta: f[3], persona: f[6], reparto: '', origen: 'app', uuid: '' };
    });
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
    /* La L era ACTIVO y ahora es SE USA EN, con todo lo de detrás corrido una
       columna. Se mira la cabecera y no el ancho: una hoja del formato viejo
       puede tener columnas de sobra a la derecha por cualquier motivo. */
    const conUsaEn = String(nueva.getRange(1, 12).getValue()).toUpperCase().indexOf('SE USA') === 0;
    const d = conUsaEn ? 1 : 0;
    return nueva.getRange(2, 1, nueva.getLastRow() - 1, conUsaEn ? 16 : 14).getValues()
      .filter(f => f[2])
      .map(f => ({
        uuid: f[0] || nuevoUuid(), tipo: f[1] || 'Gasto', concepto: f[2], importe: Number(f[3]) || 0,
        dia: Number(f[4]) || 1, cada: Number(f[5]) || 1, cuotas: Number(f[6]) || 0,
        restantes: Number(f[7]) || 0, cuenta: f[8], persona: f[9], reparto: f[10] || 'Personal',
        usaEn: conUsaEn && f[11] === 'mes siguiente' ? 'siguiente' : 'mismo',
        activo: f[11 + d] !== false,
        prox: f[12 + d] instanceof Date ? f[12 + d] : null,
        ultimo: f[13 + d] instanceof Date ? f[13 + d] : null
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
  /* `inactivas` no filtra nada: solo recuerda qué está desmarcado. Filtrar aquí
     sería tirarlo, porque escribirListas vuelca de vuelta lo que esta función
     devuelve y la siguiente escritura de Listas lo borraría de la hoja. Quien
     filtra es leerLibro, que es lo que ve la app. */
  const vacio = { personas: [], cuentas: [], credito: [], categorias: [],
                  inactivas: { cuentas: [], categorias: [] } };

  if (hoja && hoja.getLastRow() >= FILA_DATOS) {
    const filas = hoja.getRange(FILA_DATOS, 1, hoja.getLastRow() - FILA_CABECERA, 10).getValues();
    filas.forEach(f => {
      if (f[0]) vacio.personas.push({
        nombre: String(f[0]),
        color: String(f[1] || ''),
        // El día de cobro de SU tarjeta. Vacío o cero significa que no aplaza.
        diaCobro: Number(f[2]) || 0
      });
      /* «Activa» en FALSE retira la cuenta o la categoría de la app sin
         borrarla: lo que ya se escribió con ella sigue sumando y el panel sigue
         cuadrando, pero deja de ofrecerse al anotar. Desmarcar la casilla desde
         la hoja no hacía absolutamente nada. */
      if (f[3]) {
        vacio.cuentas.push(String(f[3]));
        if (f[4] === true) vacio.credito.push(String(f[3]));
        if (f[5] === false) vacio.inactivas.cuentas.push(String(f[3]));
      }
      if (f[6]) {
        vacio.categorias.push({
          nombre: String(f[6]),
          tipo: f[7] === 'Ingreso' ? 'Ingreso' : 'Gasto',
          reparto: f[8] === 'Común' ? 'Común' : 'Personal'
        });
        if (f[9] === false) vacio.inactivas.categorias.push(String(f[6]));
      }
    });
  }

  if (!vacio.personas.length) {
    vacio.personas = PERSONAS_SEMILLA.map((n, i) => ({
      nombre: n, color: COLORES_PERSONA[i], diaCobro: DIA_COBRO_SEMILLA
    }));
  }
  if (!vacio.cuentas.length) {
    vacio.cuentas = CUENTAS_SEMILLA.slice();
    vacio.credito = CREDITO_SEMILLA.slice();
  }
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
  hoja.getRange(FILA_CABECERA, 1, 1, 10).setValues([CABECERAS_LISTAS]).setFontWeight('bold');

  const credito = listas.credito || [];
  const apagadas = (listas.inactivas || {}).cuentas || [];
  const apagadasCat = (listas.inactivas || {}).categorias || [];
  const filas = [];
  const cuantas = Math.max(listas.personas.length, listas.cuentas.length,
                           listas.categorias.length, TOPE_CATEGORIAS);
  for (var i = 0; i < cuantas; i++) {
    const p = listas.personas[i];
    const c = listas.categorias[i];
    const cuenta = listas.cuentas[i] || '';
    filas.push([
      p ? p.nombre : '',
      p ? (p.color || COLORES_PERSONA[i % COLORES_PERSONA.length]) : (i < TOPE_PERSONAS ? COLORES_PERSONA[i] : ''),
      p ? (Number(p.diaCobro) || '') : '',
      cuenta,
      cuenta ? credito.indexOf(cuenta) !== -1 : '',
      cuenta ? apagadas.indexOf(cuenta) === -1 : '',
      c ? c.nombre : '',
      c ? c.tipo : '',
      c ? c.reparto : '',
      c ? apagadasCat.indexOf(c.nombre) === -1 : ''
    ]);
  }
  hoja.getRange(FILA_DATOS, 1, filas.length, 10).setValues(filas);
  // Casillas de verdad: «es crédito» se marca con el dedo desde la hoja igual
  // que desde la app, y una casilla no se puede escribir mal.
  hoja.getRange(FILA_DATOS, 5, filas.length, 1).insertCheckboxes();
  hoja.setColumnWidth(1, 150).setColumnWidth(4, 170).setColumnWidth(7, 170);
}

/** `previo` llega de fuera: para cuando se llama a esto, Config ya se va a
 *  borrar, así que lo que había hay que haberlo leído antes. */
function escribirConfig(libro, previo) {
  const hoja = hojaLimpia(libro, HOJA_CONFIG);
  titular(hoja, 'Config',
    'Lo que la app lee al arrancar. El token NO va aquí: vive solo en el teléfono.');

  const s = sep(hoja);

  hoja.getRange('A4:C7').setValues([
    ['Ahorro esperado', previo.ahorroEsperado, 'el colchón: de aquí sale el tope de cada uno'],
    ['Moneda', 'CLP', 'sin decimales, miles con punto'],
    ['Símbolo', '$', ''],
    ['Día de cierre', 'último', 'la app cierra sola esa noche']
  ]);

  hoja.getRange('A9:C12').setValues([
    ['AVISO', 'ACTIVO', 'CUÁNDO'],
    ['El día que toca un fijo', previo.avisos.fijo, 'por la mañana'],
    ['Saldo bajo el ahorro esperado', previo.avisos.saldo, 'una vez por mes'],
    ['Resumen semanal', previo.avisos.semanal, 'domingos por la noche']
  ]);
  hoja.getRange('A9:C9').setFontWeight('bold');
  hoja.getRange('B10:B12').insertCheckboxes();

  /* Dos de estos controles tienen que dar 0 SIEMPRE. Un movimiento sin «Se usa
     en» no aparece en ningún mes: no es un aviso, es una fila perdida. */
  hoja.getRange('A14:C20').setValues([
    ['CONTROL', 'VALOR', 'QUÉ ES'],
    ['Movimientos escritos', '=COUNTA(' + HOJA_MOVIMIENTOS + '!$A$2:$A)', 'filas con fecha'],
    ['Sin Se usa en',
      '=COUNTIFS(' + HOJA_MOVIMIENTOS + '!$A$2:$A' + s + '"<>"' + s +
      HOJA_MOVIMIENTOS + '!$I$2:$I' + s + '"")',
      'filas que no aparecen en ningún mes; 0 es lo esperado'],
    ['Fijos activos', '=COUNTIF(' + HOJA_FIJOS + '!$M$2:$M' + s + 'TRUE)', 'reglas que siguen cobrando'],
    ['Metas activas', '=COUNTIF(' + HOJA_METAS + '!$G$5:$G' + s + 'TRUE)', 'reciben reparto'],
    ['Meses cerrados', '=COUNTA(' + HOJA_CIERRES + '!$A$5:$A)', 'con Total Ahorrado escrito'],
    ['Descuadre de reparto', '=SUM(' + HOJA_CIERRES + '!$G$5:$G)', 'ahorro cerrado sin meta; 0 es lo esperado']
  ]);
  hoja.getRange('A14:C14').setFontWeight('bold');

  /* El nombre definido es una comodidad para quien escriba sus propias fórmulas
     en la hoja: AHORRO_ESPERADO se lee mejor que Config!$B$4. Las fórmulas que
     escribe este script NO lo usan —usan la celda directamente— para que, si
     alguna vez no se pudiera crear, la consecuencia fuera perder una comodidad
     y no un panel entero lleno de #¿NOMBRE?. */
  ponerNombre(libro, 'AHORRO_ESPERADO', hoja.getRange('B4'));

  formatoSeguro(hoja.getRange('B4'), '#,##0');
  hoja.setColumnWidth(1, 220).setColumnWidth(3, 320);
}

/** Lo que había en Config antes de rehacerla, para no perder lo que valía. */
function leerConfigActual(libro) {
  const hoja = libro.getSheetByName(HOJA_CONFIG);
  const base = { ahorroEsperado: AHORRO_SEMILLA,
                 avisos: { fijo: true, saldo: true, semanal: false } };
  if (!hoja) return base;

  /* B4 cambió de significado: era «plan del mes» y ahora es el ahorro
     esperado. En una hoja del formato anterior, B4 trae el plan —una cifra de
     siete dígitos que como colchón no tiene sentido— y B7 el viejo límite de
     aviso, que ES el colchón. Se distingue por la etiqueta de A4, que es lo
     único que dice de verdad qué hay en la celda. */
    const etiqueta = String(hoja.getRange('A4').getValue() || '').toLowerCase();
  const b4 = Number(hoja.getRange('B4').getValue());
  if (etiqueta.indexOf('plan') !== -1) {
    const viejoLimite = Number(hoja.getRange('B7').getValue());
    if (viejoLimite > 0) base.ahorroEsperado = viejoLimite;
  } else if (b4 > 0) {
    base.ahorroEsperado = b4;
  }

  /* Los avisos subieron una fila al desaparecer el límite. Se leen las dos
     posiciones y gana la que tenga algo: durante la migración conviven. */
  const filaNueva = hoja.getRange('B10:B12').getValues();
  const filaVieja = hoja.getRange('B11:B13').getValues();
  const avisos = etiqueta.indexOf('plan') !== -1 ? filaVieja : filaNueva;
  base.avisos = { fijo: avisos[0][0] !== false, saldo: avisos[1][0] !== false, semanal: avisos[2][0] === true };
  return base;
}

function escribirMovimientos(libro, movimientos, categorias) {
  const hoja = hojaLimpia(libro, HOJA_MOVIMIENTOS);
  hoja.getRange(1, 1, 1, 11).setValues([CABECERAS_MOVIMIENTOS]).setFontWeight('bold');
  hoja.setFrozenRows(1);

  const repartoDe = repartoPorCategoria(categorias);
  const listas = leerListasExistentes(libro);

  /* «Se usa en» se fuerza a texto ANTES de escribir nada. Sin eso Sheets
     reconoce "2026-08" como el 1 de agosto y lo guarda como fecha de verdad; al
     leerlo vuelve "Sat Aug 01 2026 00:00:00 GMT+0200" y ningún SUMIFS casa con
     él. Es la misma trampa que ya costó un mes cerrado llamado "Undefined". */
  formatoSeguro(hoja.getRange('I:I'), '@');

  if (movimientos.length) {
    const filas = movimientos.map(m => {
      const fila = {
        fecha: m.fecha instanceof Date ? iso(m.fecha) : String(m.fecha),
        tipo: m.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto',
        cuenta: m.cuenta || '', persona: m.persona || '', usaEn: m.usaEn
      };
      return [
        m.fecha,
        fila.tipo,
        m.categoria || '',
        m.descripcion || '',
        Number(m.importe) || 0,
        fila.cuenta,
        fila.persona,
        m.reparto || repartoDe[m.categoria] || 'Personal',
        m.paraMes || seUsaEn(fila, listas),
        m.origen || 'app',
        m.uuid || ''
      ];
    });
    hoja.getRange(2, 1, filas.length, 11).setValues(filas);
  }

  /* La última fila se cuenta, no se pregunta. getLastRow() puede venir inflado
     por la sonda que sep() escribe en Z200 para averiguar el separador: aunque
     se borre acto seguido, Sheets no siempre encoge el rango usado, y entonces
     se daría formato a doscientas filas vacías. */
  const ultima = movimientos.length + 1;
  formatoSeguro(hoja.getRange(2, 1, ultima - 1, 1), 'yyyy-mm-dd');
  formatoSeguro(hoja.getRange(2, 5, ultima - 1, 1), '#,##0');
  hoja.setColumnWidth(3, 140).setColumnWidth(4, 200).setColumnWidth(6, 150);

  ponerFiltroYDesplegables(hoja, listas);
}

/**
 * El autofiltro de Movimientos y los desplegables de sus columnas de lista.
 *
 * Los desplegables no son un adorno: los SUMIFS del Panel comparan texto
 * exacto, así que una fila escrita a mano en la hoja con "Alimentacion" sin
 * tilde no la suma nadie y no lo dice ningún error. Con la lista delante, eso
 * no pasa.
 *
 * Va en su propia función y con try/catch porque un libro puede tener ya un
 * filtro puesto a mano, y en Apps Script crear un segundo lanza. Perder el
 * filtro es una molestia; perder la instalación entera por eso, no.
 */
function ponerFiltroYDesplegables(hoja, listas) {
  const desde = 2;
  const hasta = Math.max(400, hoja.getMaxRows());

  const lista = (columna, valores) => {
    if (!valores.length) return;
    const regla = SpreadsheetApp.newDataValidation()
      .requireValueInList(valores, true).setAllowInvalid(false).build();
    hoja.getRange(desde, columna, hasta - desde + 1, 1).setDataValidation(regla);
  };
  lista(2, ['Gasto', 'Ingreso']);
  lista(6, listas.cuentas);
  lista(7, listas.personas.map(p => p.nombre));
  lista(8, ['Común', 'Personal']);

  try {
    const previo = hoja.getFilter();
    if (previo) previo.remove();
    hoja.getRange(1, 1, hasta, 11).createFilter();
  } catch (e) {
    console.log('No se pudo poner el autofiltro de Movimientos: ' + e);
  }
}

/**
 * Qué categorías cuentan como comunes, en forma de tabla para consultarla.
 *
 * Es la regla de "el arriendo sí, la ropa no" que vive en Listas!G, y la usan
 * tanto los movimientos como los fijos: un fijo de Suscripciones tiene que
 * repartirse igual que un gasto suelto de Suscripciones, o el panel acaba
 * contando en Personal lo mismo que ya contaba en Común.
 */
/**
 * El mes que PAGA una fila: «Se usa en», en `yyyy-mm`.
 *
 * Lo calcula el backend y no el teléfono, y está en una sola función, porque es
 * la decisión que ordena el libro entero: dos teléfonos con las listas
 * desincronizadas escribirían meses distintos para la misma compra.
 *
 * Tres casos:
 *   gasto normal            → el mes de su fecha;
 *   gasto con crédito       → el de su fecha si compró ANTES del día de cobro
 *                             de esa persona, el siguiente desde ese día;
 *   ingreso                 → el mes en que se cobra, o el siguiente si la fila
 *                             lo declara (`usaEn: 'siguiente'`).
 */
function seUsaEn(m, listas) {
  const mes = String(m.fecha).slice(0, 7);
  if (m.tipo === 'Ingreso') return m.usaEn === 'siguiente' ? mesMas(mes, 1) : mes;

  const datos = listas || leerListasExistentes(SpreadsheetApp.getActiveSpreadsheet());
  if (datos.credito.indexOf(m.cuenta) === -1) return mes;

  const persona = datos.personas.filter(p => p.nombre === m.persona)[0];
  const corte = Number(persona && persona.diaCobro) || 0;
  // Sin día de cobro no se aplaza nada: mientras la hoja no traiga la columna,
  // imputar todo al mes de la compra se parece más a la verdad que aplazarlo.
  if (!corte) return mes;
  return Number(String(m.fecha).slice(8, 10)) < corte ? mes : mesMas(mes, 1);
}

function repartoPorCategoria(categorias) {
  const tabla = {};
  (categorias || []).forEach(c => { tabla[c.nombre] = c.reparto; });
  return tabla;
}

function escribirFijos(libro, fijos, categorias) {
  const hoja = hojaLimpia(libro, HOJA_FIJOS);
  hoja.getRange(1, 1, 1, 16).setValues([CABECERAS_FIJOS]).setFontWeight('bold');
  hoja.setFrozenRows(1);

  /* El concepto de un fijo ES una categoría, así que de ahí sale su reparto
     cuando la regla viene sin él —que es lo que pasa al migrar desde la
     Suscripciones antigua, donde esa columna no existía—. Antes caía en
     'Personal' a secas, y quedaban dos suscripciones marcadas Personal en Fijos
     mientras sus propios movimientos, ya escritos, decían Común. */
  const repartoDe = repartoPorCategoria(categorias);

  if (fijos.length) {
    const filas = fijos.map(f => [
      f.uuid, f.tipo, f.concepto, f.importe, f.dia, f.cada, f.cuotas || '', f.restantes || '',
      f.cuenta, f.persona, f.reparto || repartoDe[f.concepto] || 'Personal',
      textoUsaEn(f), f.activo !== false,
      f.prox || calcularProximo(f, hoy()), f.ultimo || '', ''
    ]);
    hoja.getRange(2, 1, filas.length, 16).setValues(filas);
  }

  hoja.getRange('M2:M' + (TOPE_FIJOS + 1)).insertCheckboxes();
  formatoSeguro(hoja.getRange('D2:D'), '#,##0');
  formatoSeguro(hoja.getRange('N2:O'), 'yyyy-mm-dd');
  ponerFormulaMesImputado(hoja, 2, TOPE_FIJOS + 1);
  hoja.setColumnWidth(1, 90).setColumnWidth(3, 170);
}

/** «Mes siguiente» solo lo llevan los ingresos: un gasto sale el día que sale. */
function textoUsaEn(f) {
  return f.tipo === 'Ingreso' && f.usaEn === 'siguiente' ? 'mes siguiente' : 'mismo mes';
}

/**
 * El mes al que imputa un fijo, derivado de su próximo cargo y de su «Se usa
 * en». Es fórmula y no dato porque los dos de los que depende cambian solos:
 * escrito a mano se desincroniza en cuanto el fijo cobra, y nadie se entera.
 */
function ponerFormulaMesImputado(hoja, desde, hasta) {
  if (hasta < desde) return;
  const s = sep(hoja);
  const formulas = [];
  for (var f = desde; f <= hasta; f++) {
    formulas.push(['=IF($N' + f + '=""' + s + '""' + s +
      'TEXT(EDATE($N' + f + s + 'IF($L' + f + '="mes siguiente"' + s + '1' + s + '0))' + s +
      '"yyyy-mm"))']);
  }
  hoja.getRange(desde, 16, formulas.length, 1).setFormulas(formulas);
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

  /* La fila de total y, dos más abajo, lo que se ha ahorrado y todavía no tiene
     meta. Sin ese número hay que restar a mano dos columnas de dos hojas para
     saber si el reparto cuadra, que es justo lo que nadie hace. */
  const ultima = FILA_DATOS + TOPE_METAS - 1;
  const filaTotal = ultima + 2;
  const suma = col => '=SUM(' + col + FILA_DATOS + ':' + col + ultima + ')';
  hoja.getRange(filaTotal, 1, 1, 4)
      .setValues([['Total', '', '', '']]);
  hoja.getRange(filaTotal, 2, 1, 3)
      .setFormulas([[suma('B'), suma('C'), suma('D')]]);

  const filaLibre = filaTotal + 2;
  hoja.getRange(filaLibre, 1, 1, 3).setValues([
    ['SIN ASIGNAR',
     '=SUM(' + HOJA_CIERRES + '!$E:$E)-SUM($C' + FILA_DATOS + ':$C' + ultima + ')',
     'ahorro cerrado que aún no tiene meta']
  ]);

  formatoSeguro(hoja.getRange('B5:D'), '#,##0');
  formatoSeguro(hoja.getRange('E5:E'), '0%');
  formatoSeguro(hoja.getRange(filaTotal, 2, 1, 3), '#,##0');
  formatoSeguro(hoja.getRange(filaLibre, 2), '#,##0');
  hoja.setColumnWidth(1, 200);
}

function escribirCierres(libro, cierres) {
  const hoja = hojaLimpia(libro, HOJA_CIERRES);
  /* La columna del mes, como TEXTO y antes de escribir nada.
     "2026-08" es un mes para nosotros y una fecha para Sheets: guardado sin
     más se convierte en el 1 de agosto de 2026, y al leerlo vuelve como
     "Sat Aug 01 2026 00:00:00 GMT+0200". La app enseñaba entonces un mes
     cerrado llamado "Undefined Sat Aug 01 2026...". */
  formatoSeguro(hoja.getRange('A' + FILA_DATOS + ':A'), '@');
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

  /* La fila de total, dos por debajo de la última. La columna del ahorro
     esperado se queda vacía a propósito: sumar colchones de meses distintos no
     da un número que signifique nada. */
  const ultima = FILA_DATOS + TOPE_CIERRES - 1;
  const filaTotal = ultima + 2;
  const suma = col => '=SUM(' + col + FILA_DATOS + ':' + col + ultima + ')';
  hoja.getRange(filaTotal, 1).setValue('Total');
  hoja.getRange(filaTotal, 2, 1, 2).setFormulas([[suma('B'), suma('C')]]);
  hoja.getRange(filaTotal, 5, 1, 3).setFormulas([[suma('E'), suma('F'), suma('G')]]);

  formatoSeguro(hoja.getRange('B5:G'), '#,##0');
  formatoSeguro(hoja.getRange('H5:H'), 'yyyy-mm-dd hh:mm');
  formatoSeguro(hoja.getRange(filaTotal, 2, 1, 6), '#,##0');
  hoja.setColumnWidth(5, 130).setColumnWidth(8, 140);
}

function ponerFormulasCierre(hoja, desde, hasta) {
  const s = sep(hoja);
  const formulas = [];
  for (var f = desde; f <= hasta; f++) {
    formulas.push([
      /* Total Ahorrado = entrado − gastado. La D ya no es un plan que haga de
         ingreso: es el ahorro esperado de ese mes, que es una referencia y no
         un ingreso, y sumarla aquí inflaría el ahorro por el colchón.
         Si se cambia aquí, hay que cambiarlo también en ESTADO.resumen. */
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
  // Mismo motivo que en Cierres: el mes es texto, no una fecha.
  formatoSeguro(hoja.getRange('A' + FILA_DATOS + ':A'), '@');
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

  /* El mes elegido se compara contra «Se usa en» y NUNCA contra la fecha. Es
     la decisión que ordena el libro: una compra con tarjeta del 25 de julio la
     paga agosto, y filtrando por la fecha aparecería en el mes en el que no la
     vas a pagar. */
  const elMes = 'TEXT($B$4' + s + '"yyyy-mm")';
  const enElMes = M + '!$I:$I' + s + elMes;
  const suma = (tipo, extra) => '=SUMIFS(' + M + '!$E:$E' + s + M + '!$B:$B' + s + '"' + tipo + '"' +
    (extra ? s + extra : '') + s + enElMes + ')';

  hoja.getRange('A6:F8').setValues([
    ['SALDO DISPONIBLE', '', '', 'LO QUE ENTRA', '', 'AHORRO ESPERADO'],
    ['=B9-B10-B11', '', '', '=B9', '', '=' + REF_AHORRO],
    ['entra − gastado − por venir', '', '', 'ingresos imputados a este mes', '', 'se edita en Config']
  ]);

  hoja.getRange('A9:B14').setValues([
    ['Entrado', suma('Ingreso')],
    ['Gastado', suma('Gasto')],
    ['Fijos por venir',
      '=SUMIFS(' + HOJA_FIJOS + '!$D:$D' + s + HOJA_FIJOS + '!$B:$B' + s + '"Gasto"' + s +
      HOJA_FIJOS + '!$M:$M' + s + 'TRUE' + s + HOJA_FIJOS + '!$N:$N' + s + '">="&TODAY()' + s +
      HOJA_FIJOS + '!$N:$N' + s + '"<"&EOMONTH($B$4' + s + '0)+1)'],
    ['Común', suma('Gasto', M + '!$H:$H' + s + '"Común"')],
    ['Personal', suma('Gasto', M + '!$H:$H' + s + '"Personal"')],
    // Lo que se puede repartir entre todos: lo que entra menos el colchón.
    ['Gastable', '=MAX(0' + s + 'B9-' + REF_AHORRO + ')']
  ]);

  /* El tope de cada uno es proporcional a lo que aporta: si entran 60 de uno y
     40 de la otra y se quieren ahorrar 20, los topes son el 60 % y el 40 % de
     los 80 que quedan. Pasar del 100 % es lo que la app pinta en rojo. */
  hoja.getRange('A16:F16').setValues([
    ['QUIÉN GASTÓ', 'GASTADO', 'APORTA', 'TOPE', '% DE SU TOPE', 'MOVIMIENTOS']
  ]).setFontWeight('bold');
  const porPersona = [];
  for (var i = 0; i < TOPE_PERSONAS; i++) {
    const f = 17 + i;
    const origen = HOJA_LISTAS + '!$A' + (FILA_DATOS + i);
    porPersona.push([
      '=IF(' + origen + '=""' + s + '""' + s + origen + ')',
      '=IF($A' + f + '=""' + s + '""' + s +
        'SUMIFS(' + M + '!$E:$E' + s + M + '!$B:$B' + s + '"Gasto"' + s + M + '!$G:$G' + s + '$A' + f + s +
        enElMes + '))',
      '=IF($A' + f + '=""' + s + '""' + s +
        'SUMIFS(' + M + '!$E:$E' + s + M + '!$B:$B' + s + '"Ingreso"' + s + M + '!$G:$G' + s + '$A' + f + s +
        enElMes + '))',
      '=IF(OR($A' + f + '=""' + s + '$B$9=0)' + s + '""' + s + '$B$14*$C' + f + '/$B$9)',
      '=IF(OR($A' + f + '=""' + s + '$D' + f + '=0)' + s + '""' + s + '$B' + f + '/$D' + f + ')',
      '=IF($A' + f + '=""' + s + '""' + s +
        'COUNTIFS(' + M + '!$G:$G' + s + '$A' + f + s + M + '!$B:$B' + s + '"Gasto"' + s + enElMes + '))'
    ]);
  }
  hoja.getRange(17, 1, TOPE_PERSONAS, 6).setFormulas(porPersona);

  const filaCat = 17 + TOPE_PERSONAS + 1;
  hoja.getRange(filaCat, 1, 1, 4).setValues([['POR CATEGORÍA', 'GASTADO', '% DEL GASTO', 'REPARTO']])
      .setFontWeight('bold');
  const porCategoria = [];
  for (var j = 0; j < TOPE_CATEGORIAS; j++) {
    const f = filaCat + 1 + j;
    const origen = HOJA_LISTAS + '!$G' + (FILA_DATOS + j);
    porCategoria.push([
      '=IF(' + origen + '=""' + s + '""' + s + origen + ')',
      '=IF($A' + f + '=""' + s + '""' + s +
        'SUMIFS(' + M + '!$E:$E' + s + M + '!$C:$C' + s + '$A' + f + s + M + '!$B:$B' + s + '"Gasto"' + s +
        enElMes + '))',
      '=IF(OR($A' + f + '=""' + s + '$B$10=0)' + s + '""' + s + '$B' + f + '/$B$10)',
      '=IF($A' + f + '=""' + s + '""' + s +
        'IFERROR(VLOOKUP($A' + f + s + HOJA_LISTAS + '!$G:$I' + s + '3' + s + 'FALSE)' + s + '""))'
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
        'IF(' + HOJA_FIJOS + '!$N' + fila + '<TODAY()' + s + '"cargado"' + s +
        '"pendiente · "&TEXT(' + HOJA_FIJOS + '!$N' + fila + s + '"dd/mm")))'
    ]);
  }
  hoja.getRange(filaFijos + 1, 1, 12, 4).setFormulas(fijosDelMes);

  formatoSeguro(hoja.getRange('A7'), '#,##0');
  formatoSeguro(hoja.getRange('D7:F7'), '#,##0');
  formatoSeguro(hoja.getRange('B9:B14'), '#,##0');
  formatoSeguro(hoja.getRange(17, 2, TOPE_PERSONAS, 3), '#,##0');
  formatoSeguro(hoja.getRange(17, 5, TOPE_PERSONAS, 1), '0%');
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
    ['MES', 'ENTRADO', 'GASTADO', 'AHORRO', 'AHORRO ESPERADO', '% DE LO QUE ENTRA',
     'COMÚN', 'PERSONAL']
  ]).setFontWeight('bold');

  const meses = [];
  for (var m = 1; m <= 12; m++) {
    const f = FILA_DATOS + m - 1;
    const primero = 'DATE(YEAR(TODAY())' + s + m + s + '1)';
    /* Una fila por mes IMPUTADO, no por mes de calendario: se compara «Se usa
       en» con el texto del mes, igual que en el Panel. */
    const rango = M + '!$I:$I' + s + 'TEXT($A' + f + s + '"yyyy-mm")';
    const suma = (tipo, extra) => '=SUMIFS(' + M + '!$E:$E' + s + rango + s + M + '!$B:$B' + s +
      '"' + tipo + '"' + (extra ? s + extra : '') + ')';

    meses.push([
      '=' + primero,
      suma('Ingreso'),
      suma('Gasto'),
      // Lo ahorrado es lo que entró menos lo que salió. Ya no hay plan que sumar.
      '=B' + f + '-C' + f,
      '=IFERROR(VLOOKUP(TEXT(A' + f + s + '"yyyy-mm")' + s +
        HOJA_CIERRES + '!$A:$D' + s + '4' + s + 'FALSE)' + s + REF_AHORRO + ')',
      '=IF(B' + f + '=0' + s + '""' + s + 'C' + f + '/B' + f + ')',
      suma('Gasto', M + '!$H:$H' + s + '"Común"'),
      suma('Gasto', M + '!$H:$H' + s + '"Personal"')
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
        'SUMIFS(' + M + '!$E:$E' + s + M + '!$B:$B' + s + '"Gasto"' + s + M + '!$G:$G' + s + '$A' + f + s +
        M + '!$I:$I' + s + '">="&TEXT(YEAR(TODAY())' + s + '"0000")&"-01"' + s +
        M + '!$I:$I' + s + '"<="&TEXT(YEAR(TODAY())' + s + '"0000")&"-12"))',
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
    case 'cierre-baja':  return reabrirMes(datos.mes);
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
    config: { ahorroEsperado: config.ahorroEsperado, avisos: config.avisos },
    personas: listas.personas.map((p, i) => ({
      nombre: p.nombre,
      color: p.color || COLORES_PERSONA[i % COLORES_PERSONA.length],
      diaCobro: Number(p.diaCobro) || 0
    })),
    // La app solo ve lo activo; en la hoja sigue estando todo.
    cuentas: listas.cuentas.filter(c => (listas.inactivas.cuentas || []).indexOf(c) === -1),
    credito: listas.credito,
    categorias: listas.categorias.filter(
      c => (listas.inactivas.categorias || []).indexOf(c.nombre) === -1),
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
    .map(f => ({
      uuid: String(f[10] || ''),
      fecha: f[0] instanceof Date ? iso(f[0]) : '',
      tipo: f[1] === 'Ingreso' ? 'Ingreso' : 'Gasto',
      categoria: String(f[2] || ''),
      descripcion: String(f[3] || ''),
      importe: Number(f[4]) || 0,
      cuenta: String(f[5] || ''),
      persona: String(f[6] || ''),
      reparto: f[7] === 'Común' ? 'Común' : 'Personal',
      /* El mes que la paga. Una fila escrita por un despliegue anterior no lo
         trae, y entonces vale el de su fecha: es lo que hacía la app antes y
         para un gasto en efectivo sigue siendo la respuesta correcta. */
      paraMes: mesDeCelda(f[8]) || (f[0] instanceof Date ? iso(f[0]).slice(0, 7) : ''),
      origen: String(f[9] || 'app')
    }))
    /* Se recorta por el mes que PAGA y no por la fecha: una compra de
       diciembre que se cobra en enero tiene que viajar al teléfono aunque su
       fecha se haya quedado fuera de la ventana. */
    .filter(m => m.fecha && m.paraMes >= desdeMes)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function leerFijos(libro) {
  const hoja = libro.getSheetByName(HOJA_FIJOS);
  if (!hoja || hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, 16).getValues()
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
      usaEn: f[11] === 'mes siguiente' ? 'siguiente' : 'mismo',
      activo: f[12] !== false,
      prox: f[13] instanceof Date ? iso(f[13]) : '',
      ultimo: f[14] instanceof Date ? iso(f[14]) : ''
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
      const ahorroEsperado = Number(f[3]) || 0;
      const repartido = Number(f[5]) || 0;
      /* Lo ahorrado es lo que entró menos lo que salió. Misma definición que la
         fórmula de la columna E y que ESTADO.resumen: si se cambia, se cambia
         en los tres sitios. */
      const ahorrado = entrado - gastado;
      /* Lo ahorrado se calcula aquí en vez de leer la celda, aunque la celda
         lo tenga: es una fórmula, y una fórmula puede estar rota, vacía o
         recién escrita y sin recalcular. Si eso pasara, la app enseñaría un
         "Ahorrado 0" muy convencido justo encima de un entrado y un gastado
         que no cuadran con él. Es la definición del número: no hace falta
         preguntársela a nadie. */
      return {
        mes: mesDeCelda(f[0]),
        entrado: entrado,
        gastado: gastado,
        ahorroEsperado: ahorroEsperado,
        ahorrado: ahorrado,
        repartido: repartido,
        sinAsignar: ahorrado - repartido
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

  /* El mes que la paga se calcula AQUÍ y no se copia de lo que mande la app.
     La app lo manda ya resuelto para poder pintar el saldo sin esperar a la
     hoja, pero quien decide es el backend: es el único sitio donde el cálculo
     es el mismo para los dos teléfonos. Un ingreso es la excepción —el «se usa
     en» lo eligió un dedo, no una regla—, y seUsaEn() ya lo respeta. */
  hoja.appendRow([
    fechaDesdeISO(m.fecha),
    m.tipo, m.categoria, m.descripcion || '',
    Number(m.importe),   // número de verdad, no texto: los SUMIFS lo necesitan
    m.cuenta, m.persona, m.reparto || 'Personal',
    seUsaEn(m), m.origen || 'app', m.uuid
  ]);

  /* El formato se fija en la fila recién escrita y no solo en la columna.
     Ponerlo únicamente en la columna al instalar no funcionó: las filas que
     añade appendRow se mostraban con el formato de fecha del sistema. */
  const fila = hoja.getLastRow();
  formatoSeguro(hoja.getRange(fila, 1), 'yyyy-mm-dd');
  formatoSeguro(hoja.getRange(fila, 5), '#,##0');
  formatoSeguro(hoja.getRange(fila, 9), '@');
}

function editarMovimiento(datos) {
  const fila = buscarFilaPorUuid(HOJA_MOVIMIENTOS, 11, datos.objetivo);
  if (!fila) return { ok: true, escritos: 0, aviso: 'No se encontró el movimiento' };

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOVIMIENTOS);
  const columnas = { fecha: 1, tipo: 2, categoria: 3, descripcion: 4, importe: 5,
                     cuenta: 6, persona: 7, reparto: 8 };
  Object.keys(datos.cambios || {}).forEach(clave => {
    if (!columnas[clave]) return;
    // La fecha viaja como yyyy-mm-dd y tiene que entrar como fecha de verdad,
    // o la celda se queda con un texto que ningún SUMIFS sabe comparar.
    const valor = clave === 'fecha' ? fechaDesdeISO(datos.cambios[clave]) : datos.cambios[clave];
    hoja.getRange(fila, columnas[clave]).setValue(valor);
  });

  /* Cambiar la cuenta o el dueño cambia el mes que la paga: pasar una compra
     del día 20 de efectivo a la tarjeta la manda a la factura del mes
     siguiente. Se recalcula desde la fila ya escrita, no desde lo que mandó la
     app, para que valga también cuando el cambio venía solo del importe. */
  const actual = hoja.getRange(fila, 1, 1, 11).getValues()[0];
  hoja.getRange(fila, 9).setValue(seUsaEn({
    fecha: actual[0] instanceof Date ? iso(actual[0]) : String(actual[0]),
    tipo: actual[1] === 'Ingreso' ? 'Ingreso' : 'Gasto',
    cuenta: String(actual[5] || ''),
    persona: String(actual[6] || ''),
    // Un ingreso ya tenía su mes elegido a mano: se respeta el que hay escrito.
    usaEn: String(actual[8] || '') === mesMas(String(actual[0]).slice(0, 7), 1) ? 'siguiente' : 'mismo'
  }));
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

  const anterior = fila <= hoja.getLastRow() ? hoja.getRange(fila, 15).getValue() : '';
  const ultimo = anterior instanceof Date ? anterior : (f.ultimo ? fechaDesdeISO(f.ultimo) : '');

  hoja.getRange(fila, 1, 1, 15).setValues([[
    f.uuid, f.tipo, f.concepto, Number(f.importe), Number(f.dia), Number(f.cada),
    Number(f.cuotas) || '', Number(f.restantes) || '',
    f.cuenta, f.persona, f.reparto || 'Personal', textoUsaEn(f), f.activo !== false,
    calcularProximo(f, hoy()), ultimo
  ]]);

  formatoSeguro(hoja.getRange(fila, 4), '#,##0');
  formatoSeguro(hoja.getRange(fila, 14, 1, 2), 'yyyy-mm-dd');
  ponerFormulaMesImputado(hoja, fila, fila);
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
    hoja.getRange(fila, 14).setValue(fechaDesdeISO(diaDelMes(datos.mes, f.dia)));
    hoja.getRange(fila, 15).setValue('');
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
    // Un ingreso fijo marcado «mes siguiente» alimenta al mes de después del
    // que lo cobra; seUsaEn() se encarga a partir de aquí.
    usaEn: f.usaEn,
    origen: 'fijo'
  });
  registrarUuid(marca, 'cargo de fijo');

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_FIJOS);
  const restantes = f.cuotas ? Math.max(0, Number(f.restantes) - 1) : 0;
  hoja.getRange(fila, 8).setValue(f.cuotas ? restantes : '');
  hoja.getRange(fila, 15).setValue(fechaDesdeISO(diaDelMes(mes, f.dia)));
  hoja.getRange(fila, 14).setValue(fechaDesdeISO(diaDelMes(mesMas(mes, f.cada), f.dia)));
  // Al agotar las cuotas, el fijo se apaga solo. No se borra: el histórico de
  // lo que se pagó sigue en Movimientos y la regla queda como referencia.
  if (f.cuotas && restantes === 0) hoja.getRange(fila, 13).setValue(false);
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
  /* Se compara mes contra mes, no texto contra texto: las filas escritas antes
     de forzar la columna a texto guardan una fecha de verdad, y comparar
     "2026-08" con "Sat Aug 01 2026..." no casa nunca. Sin esto, el mismo mes se
     cerraría dos veces. */
  const meses = hoja.getRange(FILA_DATOS, 1, TOPE_CIERRES, 1).getValues();
  if (meses.some(f => f[0] && mesDeCelda(f[0]) === mes)) {
    return { ok: true, escritos: 0, duplicados: 1 };
  }

  /* Antes de cerrar se cobran los fijos que quedaban del mes: si el mes se
     cierra el día 1 y quedaba el recibo del 28 sin marcar, el total tiene que
     incluirlo igual. */
  cobrarFijosDelMes(mes);

  /* Por el mes que PAGA, no por la fecha: la factura de la tarjeta que se cobra
     en agosto cierra con agosto aunque se comprara en julio. */
  const movimientos = leerMovimientos(libro, mes).filter(m => m.paraMes === mes);
  const entrado = movimientos.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + m.importe, 0);
  const gastado = movimientos.filter(m => m.tipo === 'Gasto').reduce((a, m) => a + m.importe, 0);
  const ahorroEsperado = leerConfigActual(libro).ahorroEsperado;

  // La fila 5 es la del mes más reciente: los cierres se leen de arriba abajo.
  hoja.insertRowBefore(FILA_DATOS);
  // Texto antes de escribir, o Sheets guarda "2026-08" como el 1 de agosto.
  formatoSeguro(hoja.getRange(FILA_DATOS, 1), '@');
  hoja.getRange(FILA_DATOS, 1, 1, 4).setValues([[mes, entrado, gastado, ahorroEsperado]]);
  hoja.getRange(FILA_DATOS, 8).setValue(new Date());
  ponerFormulasCierre(hoja, FILA_DATOS, FILA_DATOS);
  formatoSeguro(hoja.getRange(FILA_DATOS, 2, 1, 6), '#,##0');
  formatoSeguro(hoja.getRange(FILA_DATOS, 8), 'yyyy-mm-dd hh:mm');

  if (uuid) registrarUuid(uuid, 'cierre de ' + mes);
  // Lo ahorrado es lo que entró menos lo que salió. Ya no hay plan que sumar:
  // el techo del mes son sus propios ingresos.
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

/**
 * Deshacer un cierre: quita su fila de Cierres y el mes vuelve a estar en curso.
 *
 * Existe porque cerrar un mes a mitad deja la app en un callejón sin salida —la
 * pantalla Mes pasa a solo lectura y, sin ningún otro mes, las dos flechas se
 * apagan—. La app ya no deja cerrar a mitad, pero quien lo hizo antes necesita
 * poder salir sin editar la hoja a mano.
 *
 * Las líneas de Reparto de ese mes NO se tocan: si se repartió el ahorro, ese
 * dinero ya está asignado a metas y borrarlo aquí descuadraría el libro mayor.
 * Se quitan a mano si hace falta, que es una decisión, no un efecto secundario.
 */
function reabrirMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes))) return { ok: false, error: 'Mes no válido: ' + mes };
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(HOJA_CIERRES);
  if (!hoja) return { ok: false, error: 'No existe la hoja ' + HOJA_CIERRES };

  const meses = hoja.getRange(FILA_DATOS, 1, TOPE_CIERRES, 1).getValues();
  for (var i = 0; i < meses.length; i++) {
    if (meses[i][0] && mesDeCelda(meses[i][0]) === mes) {
      hoja.deleteRow(FILA_DATOS + i);
      return { ok: true, escritos: 1, mes: mes };
    }
  }
  return { ok: true, escritos: 0, mes: mes };
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
  // Igual que en Cierres: el mes es texto, o Sheets lo convierte en una fecha.
  formatoSeguro(hoja.getRange(fila, 1, lineas.length, 1), '@');
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

  /* Por bloques y no celda a celda: cada setValue cruza al servicio de Sheets,
     y con diez metas esto eran cincuenta viajes para escribir cinco columnas.
     Es la misma trampa que llevó instalar() de 868 llamadas a 207. */
  const nombres = [];
  const cola = [];
  for (var i = 0; i < TOPE_METAS; i++) {
    const m = metas[i];
    nombres.push([m ? (m.nombre || '') : '', m ? Number(m.objetivo) || 0 : '']);
    cola.push(m ? [i + 1, m.activa !== false, m.notas || ''] : ['', '', '']);
  }
  hoja.getRange(FILA_DATOS, 1, TOPE_METAS, 2).setValues(nombres);
  hoja.getRange(FILA_DATOS, 6, TOPE_METAS, 3).setValues(cola);

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
    if (datos.config.ahorroEsperado !== undefined) {
      hoja.getRange('B4').setValue(Number(datos.config.ahorroEsperado));
    }
    if (datos.config.avisos) {
      const a = datos.config.avisos;
      if (a.fijo !== undefined) hoja.getRange('B10').setValue(a.fijo === true);
      if (a.saldo !== undefined) hoja.getRange('B11').setValue(a.saldo === true);
      if (a.semanal !== undefined) hoja.getRange('B12').setValue(a.semanal === true);
    }
  }

  if (datos.personas || datos.cuentas || datos.categorias || datos.credito) {
    const listas = leerListasExistentes(libro);
    if (datos.personas) {
      listas.personas = datos.personas
        .filter(p => p && String(p.nombre || '').trim())
        .map((p, i) => ({
          nombre: String(p.nombre).trim(),
          color: p.color || COLORES_PERSONA[i % 4],
          diaCobro: Number(p.diaCobro) || 0
        }));
    }
    if (datos.cuentas) listas.cuentas = datos.cuentas.filter(c => String(c || '').trim());
    /* Una lista de crédito vacía es una respuesta válida: quitar la última
       tarjeta tiene que llegar a la hoja, no confundirse con "no lo mandaron".
       Por eso se comprueba contra undefined y no por si es cierto. */
    if (datos.credito !== undefined) {
      listas.credito = (datos.credito || []).filter(c => String(c || '').trim());
    }
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
    /* Cambiar un día de cobro o marcar una cuenta como de crédito cambia el mes
       que paga las compras YA escritas. Si la columna no se rehace, el Panel
       sigue sumando con el reparto de antes del cambio y contradice a la app,
       que sí recalcula. */
    if (datos.personas || datos.credito !== undefined) recalcularSeUsaEn(libro, listas);
  }

  return { ok: true, escritos: 1 };
}

/**
 * Rehace la columna «Se usa en» de todos los gastos.
 *
 * Solo los gastos: el de un ingreso lo eligió una persona en la app —«este
 * dinero se usa en septiembre»— y no hay regla que pueda deducirlo, así que
 * recalcularlo sería pisarle la decisión.
 *
 * Se lee y se escribe la columna entera de una vez. Celda a celda serían
 * cuatrocientas llamadas al servicio de Sheets y este script ya se ha muerto
 * dos veces por tiempo.
 */
function recalcularSeUsaEn(libro, listas) {
  const hoja = libro.getSheetByName(HOJA_MOVIMIENTOS);
  if (!hoja || hoja.getLastRow() < 2) return 0;

  const alto = hoja.getLastRow() - 1;
  const filas = hoja.getRange(2, 1, alto, 11).getValues();
  const columna = [];
  var cambios = 0;

  filas.forEach(f => {
    const actual = String(f[8] || '');
    if (!(f[0] instanceof Date) || f[1] === 'Ingreso') { columna.push([actual]); return; }
    const nuevo = seUsaEn({
      fecha: iso(f[0]), tipo: 'Gasto',
      cuenta: String(f[5] || ''), persona: String(f[6] || '')
    }, listas);
    if (nuevo !== actual) cambios++;
    columna.push([nuevo]);
  });

  if (cambios) hoja.getRange(2, 9, alto, 1).setValues(columna);
  return cambios;
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
  const f = hoja.getRange(fila, 1, 1, 16).getValues()[0];
  return {
    uuid: String(f[0] || ''), tipo: f[1] === 'Ingreso' ? 'Ingreso' : 'Gasto',
    concepto: String(f[2] || ''), importe: Number(f[3]) || 0, dia: Number(f[4]) || 1,
    cada: Number(f[5]) || 1, cuotas: Number(f[6]) || 0, restantes: Number(f[7]) || 0,
    cuenta: String(f[8] || ''), persona: String(f[9] || ''),
    reparto: f[10] === 'Común' ? 'Común' : 'Personal',
    usaEn: f[11] === 'mes siguiente' ? 'siguiente' : 'mismo',
    activo: f[12] !== false,
    prox: f[13] instanceof Date ? iso(f[13]) : '',
    ultimo: f[14] instanceof Date ? iso(f[14]) : ''
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

/**
 * El mes de una celda, venga como texto o como fecha.
 *
 * Las filas escritas antes de forzar la columna A a texto quedaron con una
 * fecha de verdad dentro. Se leen igual en vez de obligar a rehacerlas.
 */
function mesDeCelda(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, zonaDeLaHoja(), 'yyyy-MM');
  }
  return String(valor || '').slice(0, 7);
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
/* La zona horaria de la hoja se pregunta una vez. Parece un detalle y no lo es:
   iso() se llama dos veces por cada fila al leer el libro, así que con
   cuatrocientos movimientos serían ochocientas consultas al servicio para
   averiguar ochocientas veces lo mismo. */
var ZONA = null;
function zonaDeLaHoja() {
  if (ZONA === null) ZONA = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return ZONA;
}

function iso(fecha) {
  return Utilities.formatDate(fecha, zonaDeLaHoja(), 'yyyy-MM-dd');
}

/**
 * Un yyyy-mm-dd convertido en la fecha que hay que escribir en la celda.
 *
 * A MEDIODÍA, no a medianoche, y esto no es un capricho: `new Date(a, m, d)`
 * da medianoche en la zona horaria DEL SCRIPT, mientras que la celda se
 * interpreta y se lee en la zona horaria DE LA HOJA. Si el proyecto de Apps
 * Script quedara en UTC y la hoja en Santiago, medianoche UTC son las ocho de
 * la tarde del día ANTERIOR en Chile, y todas las fechas del libro aparecerían
 * corridas un día sin que nada avisara.
 *
 * Con las doce del mediodía haría falta un desfase de más de doce horas para
 * cambiar de día, y eso no existe entre dos zonas habitadas. La hora no se ve:
 * la columna lleva formato yyyy-mm-dd.
 */
function fechaDesdeISO(texto) {
  const p = String(texto).split('-').map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1, 12, 0, 0);
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
