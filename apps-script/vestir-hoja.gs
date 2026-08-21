/**
 * Gastos · vestir el libro          ARCHIVO NUEVO — no toca tu Codigo.gs
 * ==================================================================
 *
 * En Apps Script todos los archivos comparten el mismo ámbito global: dos
 * funciones con el mismo nombre en archivos distintos NO dan error, la última
 * cargada gana en silencio. Por eso aquí solo existe UN nombre global,
 * `vestirLibro`, y todo lo demás vive dentro del objeto VESTIR.
 *
 * Tampoco define onOpen(): tu Codigo.gs seguramente ya tiene uno. Si quieres el
 * menú, añade esta línea DENTRO de tu onOpen existente:
 *
 *     ui.createMenu('Gastos').addItem('Vestir el libro', 'vestirLibro').addToUi();
 *
 * Cómo usarlo:
 *   1. Apps Script → + (Archivos) → Secuencia de comandos → nómbralo "Vestir".
 *   2. Pega este archivo completo.
 *   3. Guarda, elige `vestirLibro` en el desplegable de funciones → Ejecutar.
 *
 * Se puede reejecutar cuantas veces quieras: no lee ni escribe datos, solo
 * formato. Tarda unos segundos por hoja.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Las filas y los topes NO están escritos a mano: salen de las constantes de
 * Codigo.gs, que vive en este mismo proyecto y comparte ámbito global. El
 * archivo que venía en el paquete de diseño los tenía fijos y vestía el libro
 * ANTERIOR al rediseño —importe en la F, tipo en la C, Fijos de catorce
 * columnas, Listas de ocho—, así que pintaba el degradado sobre la columna
 * equivocada y coloreaba de rojo una celda que ya no era la del descuadre.
 * Nada de eso da error: sale un libro mal vestido y con buena pinta, que es
 * peor. Derivándolo de los topes, el vestido cae siempre donde caen los datos.
 */

function vestirLibro() {
  return VESTIR.todo();
}

var VESTIR = (function () {

  var C = {
    ink: '#1A1815', cream: '#F4F0E8', band: '#EFE7D6', hair: '#DCD5C6',
    mut: '#8A857C', sec: '#58544C', acc: '#A3341F',
    p1: '#3D5A6C', p2: '#A34E6B', p3: '#5E7A52', p4: '#9A7A3F'
  };

  // Si tu cuenta rechaza estas fuentes, cámbialas por 'Playfair Display' y
  // 'Roboto Mono': la proporción del diseño se mantiene.
  var TIPO_CIFRA = 'Newsreader';
  var TIPO_UI    = 'IBM Plex Mono';

  /* De Codigo.gs, que está en el mismo proyecto. Con try/catch para que este
     archivo siga sirviendo si alguien lo pega en un proyecto donde Codigo.gs
     todavía no está: en ese caso valen los valores por omisión, que son los
     mismos que trae el repositorio. */
  function constante(leer, porDefecto) {
    try { var v = leer(); return typeof v === 'number' ? v : porDefecto; }
    catch (e) { return porDefecto; }
  }
  var CAB = 4, DAT = 5, N_PERS = 4, N_CATS = 24, N_METAS = 10, N_CIERR = 12;

  /* Se resuelven al EJECUTAR, no al cargar este archivo.
     Apps Script no garantiza en qué orden evalúa los archivos del proyecto, y
     una constante de Codigo.gs leída antes de que Codigo.gs se haya evaluado
     lanza ReferenceError. El try/catch lo atraparía y se caería a los valores
     por omisión sin decir nada: un libro vestido con los topes de otro. */
  function resolverTopes() {
    CAB     = constante(function () { return FILA_CABECERA; }, CAB);
    DAT     = constante(function () { return FILA_DATOS; }, DAT);
    N_PERS  = constante(function () { return TOPE_PERSONAS; }, N_PERS);
    N_CATS  = constante(function () { return TOPE_CATEGORIAS; }, N_CATS);
    N_METAS = constante(function () { return TOPE_METAS; }, N_METAS);
    N_CIERR = constante(function () { return TOPE_CIERRES; }, N_CIERR);
  }

  var CLP = '"$"#,##0;[Red]-"$"#,##0';
  var POS = '"$"#,##0';
  var PCT = '0%';
  var ENT = '0';
  var MIL = '#,##0';
  var FECHA = 'dd/mm/yyyy';
  var FECHA_H = 'dd/mm/yyyy hh:mm';

  // ---- separador de argumentos (tu mismo problema con EOMONTH) ----
  // El formato condicional también guarda fórmulas, así que hay que escribirlas
  // con el separador que espera esta hoja: ',' o ';'.
  var SEP = null;
  function sep(hoja) {
    if (SEP !== null) return SEP;
    var sonda = hoja.getRange(hoja.getMaxRows(), hoja.getMaxColumns());
    var previo = sonda.getFormula();
    sonda.setFormula('=SUM(1,1)');
    SpreadsheetApp.flush();
    var v = sonda.getValue();
    if (previo) sonda.setFormula(previo); else sonda.clearContent();
    SEP = (v === 2) ? ',' : ';';
    return SEP;
  }
  /** f('AND(a$b$c)') → une los trozos con el separador correcto. */
  function fx(hoja, partes) {
    return partes.join(sep(hoja));
  }

  // ---------- utilidades de formato ----------

  function base(sh) {
    var filas = Math.max(sh.getMaxRows(), 1);
    var cols = Math.max(sh.getMaxColumns(), 1);
    sh.getRange(1, 1, filas, cols)
      .setBackground(C.cream).setFontFamily(TIPO_UI).setFontSize(10)
      .setFontColor(C.ink).setVerticalAlignment('middle')
      .setBorder(false, false, false, false, false, false);
    sh.setHiddenGridlines(true);
  }

  function titulo(sh) {
    sh.setRowHeight(1, 44);
    sh.getRange('A1').setFontFamily(TIPO_CIFRA).setFontSize(22).setFontColor(C.ink).setFontWeight('normal');
    sh.getRange('A2').setFontSize(9).setFontColor(C.mut);
  }

  function cabecera(sh, a1) {
    var r = sh.getRange(a1);
    r.setBackground(C.ink).setFontColor(C.cream).setFontSize(9)
     .setFontWeight('bold').setVerticalAlignment('middle');
    sh.setRowHeight(r.getRow(), 28);
  }

  function seccion(sh, a1) {
    sh.getRange(a1).setFontSize(9).setFontWeight('bold').setFontColor(C.sec);
  }

  function reglas(sh, a1) {
    sh.getRange(a1).setBorder(null, null, null, null, null, true, C.hair, SpreadsheetApp.BorderStyle.SOLID);
  }

  function cifra(sh, a1, fmt, tam) {
    sh.getRange(a1).setFontFamily(TIPO_CIFRA).setFontSize(tam || 11)
      .setHorizontalAlignment('right').setNumberFormat(fmt || POS);
  }

  function suave(sh, a1) {
    sh.getRange(a1).setFontSize(9).setFontColor(C.mut);
  }

  function total(sh, a1) {
    sh.getRange(a1).setBackground(C.band).setFontFamily(TIPO_CIFRA).setFontSize(12)
      .setFontWeight('bold')
      .setBorder(true, null, null, null, null, null, C.ink, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }

  var pendientes = [];   // las reglas se acumulan y se aplican de golpe
  function nuevaHoja() { pendientes = []; }
  function gradiente(sh, a1, color) {
    pendientes.push(SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpoint(C.cream).setGradientMaxpoint(color)
      .setRanges([sh.getRange(a1)]).build());
  }
  function tinta(sh, a1, formula, color) {
    pendientes.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formula).setFontColor(color || C.acc)
      .setRanges([sh.getRange(a1)]).build());
  }
  function aplicar(sh) {
    sh.setConditionalFormatRules(pendientes);
    pendientes = [];
  }

  function anchos(sh, pares) {
    for (var i = 0; i < pares.length; i++) sh.setColumnWidth(pares[i][0], pares[i][1]);
  }

  // ---------- hojas ----------

  function panel(sh) {
    titulo(sh);
    anchos(sh, [[1, 240], [2, 130], [3, 110], [4, 190], [5, 30], [6, 150]]);
    seccion(sh, 'A4');
    sh.getRange('B4').setFontFamily(TIPO_CIFRA).setFontSize(11).setNumberFormat('mmmm yyyy');
    suave(sh, 'C4');

    seccion(sh, 'A6:F6');
    sh.getRange('A7').setFontFamily(TIPO_CIFRA).setFontSize(32).setNumberFormat(CLP);
    cifra(sh, 'D7:F7', POS, 18);
    sh.getRange('D7:F7').setHorizontalAlignment('left');
    sh.setRowHeight(7, 52);
    suave(sh, 'A8:F8');
    tinta(sh, 'A7', '=$A$7<0');

    // Entrado, Gastado, Fijos por venir, Común, Personal y Gastable.
    cifra(sh, 'B9:B14');
    reglas(sh, 'A9:B14');

    /* Quién gastó: nombre, gastado, aporta, tope, % de su tope y movimientos.
       El % pasa del 100 cuando alguien se ha excedido, y ese es el número que
       la app pinta en rojo; aquí se pinta igual. */
    var pers = 17;                       // primera fila de personas
    var persFin = pers + N_PERS - 1;
    cabecera(sh, 'A16:F16');
    sh.getRange('B16:F16').setHorizontalAlignment('right');
    cifra(sh, 'B' + pers + ':D' + persFin);
    cifra(sh, 'E' + pers + ':E' + persFin, PCT);
    cifra(sh, 'F' + pers + ':F' + persFin, MIL);
    reglas(sh, 'A' + pers + ':F' + persFin);
    gradiente(sh, 'B' + pers + ':B' + persFin, C.p1);
    tinta(sh, 'A' + pers + ':F' + persFin, '=$E' + pers + '>1');

    var cat = pers + N_PERS + 1;         // cabecera de categorías
    var catFin = cat + N_CATS;
    cabecera(sh, 'A' + cat + ':D' + cat);
    sh.getRange('B' + cat + ':C' + cat).setHorizontalAlignment('right');
    sh.getRange('D' + cat).setHorizontalAlignment('center');
    cifra(sh, 'B' + (cat + 1) + ':B' + catFin);
    cifra(sh, 'C' + (cat + 1) + ':C' + catFin, PCT);
    sh.getRange('D' + (cat + 1) + ':D' + catFin)
      .setFontSize(9).setFontColor(C.sec).setHorizontalAlignment('center');
    reglas(sh, 'A' + (cat + 1) + ':D' + catFin);
    gradiente(sh, 'B' + (cat + 1) + ':B' + catFin, C.ink);

    var fij = catFin + 2;                // cabecera de fijos del mes
    var fijFin = fij + 12;
    cabecera(sh, 'A' + fij + ':D' + fij);
    sh.getRange('B' + fij).setHorizontalAlignment('center');
    sh.getRange('C' + fij).setHorizontalAlignment('right');
    cifra(sh, 'B' + (fij + 1) + ':B' + fijFin, ENT);
    sh.getRange('B' + (fij + 1) + ':B' + fijFin).setHorizontalAlignment('center');
    cifra(sh, 'C' + (fij + 1) + ':C' + fijFin);
    sh.getRange('D' + (fij + 1) + ':D' + fijFin).setFontSize(9).setFontColor(C.sec);
    reglas(sh, 'A' + (fij + 1) + ':D' + fijFin);
    // lo pendiente, en ladrillo
    tinta(sh, 'A' + (fij + 1) + ':D' + fijFin,
          '=' + fx(sh, ['REGEXMATCH($D' + (fij + 1) + '&""', '"pendiente")']));
  }

  function anio(sh) {
    titulo(sh);
    anchos(sh, [[1, 150], [2, 120], [3, 120], [4, 120], [5, 120], [6, 110], [7, 120], [8, 120]]);
    var fin = DAT + 11;                  // doce meses
    var tot = DAT + 12;
    cabecera(sh, 'A' + CAB + ':H' + CAB);
    sh.getRange('B' + CAB + ':H' + CAB).setHorizontalAlignment('right');
    sh.getRange('A' + DAT + ':A' + fin).setFontFamily(TIPO_CIFRA).setFontSize(11).setNumberFormat('mmmm yyyy');
    cifra(sh, 'B' + DAT + ':E' + fin);
    cifra(sh, 'G' + DAT + ':H' + fin);
    sh.getRange('D' + DAT + ':D' + fin).setNumberFormat(CLP);
    cifra(sh, 'F' + DAT + ':F' + fin, PCT);
    reglas(sh, 'A' + DAT + ':H' + fin);
    total(sh, 'A' + tot + ':H' + tot);
    sh.getRange('B' + tot + ':H' + tot).setHorizontalAlignment('right').setNumberFormat(POS);
    gradiente(sh, 'D' + DAT + ':D' + fin, C.p3);
    // Gastar más del 100 % de lo que entra en un mes, en ladrillo.
    tinta(sh, 'F' + DAT + ':F' + fin, '=$F' + DAT + '>1');

    var anio = tot + 2;                  // por persona, en el año
    cabecera(sh, 'A' + anio + ':C' + anio);
    sh.getRange('B' + anio + ':C' + anio).setHorizontalAlignment('right');
    cifra(sh, 'B' + (anio + 1) + ':B' + (anio + N_PERS));
    cifra(sh, 'C' + (anio + 1) + ':C' + (anio + N_PERS), PCT);
    reglas(sh, 'A' + (anio + 1) + ':C' + (anio + N_PERS));
    gradiente(sh, 'B' + (anio + 1) + ':B' + (anio + N_PERS), C.p1);
    sh.setFrozenRows(CAB);
  }

  function movimientos(sh) {
    /* A fecha · B tipo · C categoría · D descripción · E importe · F cuenta
       G persona · H reparto · I SE USA EN · J origen · K uuid */
    var n = sh.getMaxRows();
    cabecera(sh, 'A1:K1');
    sh.getRange('E1').setHorizontalAlignment('right');
    anchos(sh, [[1, 100], [2, 90], [3, 140], [4, 230], [5, 120], [6, 150],
                [7, 110], [8, 100], [9, 100], [10, 80], [11, 260]]);
    sh.getRange(2, 1, n - 1, 1).setFontSize(9).setFontColor(C.sec).setNumberFormat(FECHA);
    cifra(sh, 'E2:E' + n);
    /* «Se usa en» va suave pero centrado: es la columna que ordena el libro y
       hay que poder recorrerla de un vistazo buscando la que no cuadra. */
    sh.getRange(2, 9, n - 1, 1).setHorizontalAlignment('center').setFontSize(9).setFontColor(C.sec);
    suave(sh, sh.getRange(2, 10, n - 1, 2).getA1Notation());
    reglas(sh, 'A2:K' + n);
    sh.setFrozenRows(1);
    tinta(sh, 'B2:E' + n, '=$B2="Ingreso"', C.p3);
    tinta(sh, 'A2:K' + n, '=$J2="fijo"', C.mut);
    /* Una fila con fecha y sin «Se usa en» no aparece en ningún mes. Es el
       control que Config!B16 cuenta; aquí se ve cuál es. */
    tinta(sh, 'A2:K' + n, '=' + fx(sh, ['AND($A2<>""', '$I2="")']), C.acc);
  }

  function fijos(sh) {
    /* A uuid · B tipo · C concepto · D importe · E día · F cada · G cuotas
       H restantes · I cuenta · J persona · K reparto · L SE USA EN
       M activo · N próximo cargo · O último cargo · P mes imputado */
    var n = sh.getMaxRows();
    cabecera(sh, 'A1:P1');
    sh.getRange('D1:H1').setHorizontalAlignment('right');
    anchos(sh, [[1, 220], [2, 90], [3, 180], [4, 120], [5, 60], [6, 110], [7, 90],
                [8, 100], [9, 150], [10, 110], [11, 100], [12, 130], [13, 80],
                [14, 130], [15, 130], [16, 110]]);
    cifra(sh, 'D2:D' + n);
    cifra(sh, sh.getRange(2, 5, n - 1, 4).getA1Notation(), ENT);
    sh.getRange(2, 5, n - 1, 4).setHorizontalAlignment('center');
    suave(sh, sh.getRange(2, 11, n - 1, 1).getA1Notation());
    sh.getRange(2, 12, n - 1, 2).setHorizontalAlignment('center').setFontSize(9);
    sh.getRange(2, 14, n - 1, 2).setFontSize(9).setFontColor(C.sec).setNumberFormat(FECHA);
    sh.getRange(2, 16, n - 1, 1).setHorizontalAlignment('center').setFontSize(9).setFontColor(C.mut);
    suave(sh, sh.getRange(2, 1, n - 1, 1).getA1Notation());
    reglas(sh, 'A2:P' + n);
    sh.setFrozenRows(1);
    sh.setFrozenColumns(3);
    gradiente(sh, 'D2:D' + n, C.p4);
    // cae en los próximos siete días
    tinta(sh, 'C2:P' + n, '=' + fx(sh, ['AND($N2<>""', '$N2>=TODAY()', '$N2<=TODAY()+7)']));
    tinta(sh, 'A2:P' + n, '=$M2=FALSE', C.mut);
  }

  function metas(sh) {
    titulo(sh);
    anchos(sh, [[1, 220], [2, 130], [3, 130], [4, 130], [5, 110], [6, 80], [7, 80], [8, 260]]);
    var fin = DAT + N_METAS - 1;
    var tot = fin + 2;
    var libre = tot + 2;                 // la celda de «sin asignar»
    cabecera(sh, 'A' + CAB + ':H' + CAB);
    sh.getRange('B' + CAB + ':E' + CAB).setHorizontalAlignment('right');
    sh.getRange('F' + CAB + ':G' + CAB).setHorizontalAlignment('center');
    cifra(sh, 'B' + DAT + ':D' + fin);
    cifra(sh, 'E' + DAT + ':E' + fin, PCT);
    sh.getRange('F' + DAT + ':G' + fin).setHorizontalAlignment('center');
    reglas(sh, 'A' + DAT + ':H' + fin);
    gradiente(sh, 'C' + DAT + ':C' + fin, C.p3);
    total(sh, 'A' + tot + ':H' + tot);
    sh.getRange('B' + tot + ':D' + tot).setHorizontalAlignment('right').setNumberFormat(POS);
    seccion(sh, 'A' + libre);
    sh.getRange('B' + libre).setFontFamily(TIPO_CIFRA).setFontSize(18)
      .setNumberFormat(CLP).setHorizontalAlignment('left');
    suave(sh, 'C' + libre);
    sh.setRowHeight(libre, 34);
    // Ahorro cerrado que todavía no tiene meta: en ladrillo mientras lo haya.
    tinta(sh, 'B' + libre, '=$B$' + libre + '>0');
    sh.setFrozenRows(CAB);
  }

  function cierres(sh) {
    titulo(sh);
    anchos(sh, [[1, 110], [2, 130], [3, 130], [4, 130], [5, 150], [6, 130], [7, 130], [8, 160]]);
    var fin = DAT + N_CIERR - 1;
    var tot = fin + 2;
    cabecera(sh, 'A' + CAB + ':H' + CAB);
    sh.getRange('B' + CAB + ':G' + CAB).setHorizontalAlignment('right');
    cifra(sh, 'B' + DAT + ':G' + fin);
    sh.getRange('E' + DAT + ':E' + fin).setNumberFormat(CLP).setFontSize(12).setFontWeight('bold');
    sh.getRange('H' + DAT + ':H' + fin).setFontSize(9).setFontColor(C.sec).setNumberFormat(FECHA_H);
    reglas(sh, 'A' + DAT + ':H' + fin);
    gradiente(sh, 'E' + DAT + ':E' + fin, C.p3);
    // Un mes cerrado con ahorro sin repartir, en ladrillo.
    tinta(sh, 'G' + DAT + ':G' + fin, '=$G' + DAT + '>0');
    total(sh, 'A' + tot + ':H' + tot);
    sh.getRange('B' + tot + ':G' + tot).setHorizontalAlignment('right').setNumberFormat(POS);
    sh.setFrozenRows(CAB);
  }

  function reparto(sh) {
    titulo(sh);
    anchos(sh, [[1, 110], [2, 160], [3, 220], [4, 130], [5, 100], [6, 260]]);
    var fin = Math.max(sh.getMaxRows(), DAT + 59);
    cabecera(sh, 'A' + CAB + ':F' + CAB);
    sh.getRange('D' + CAB).setHorizontalAlignment('right');
    sh.getRange('B' + DAT + ':B' + fin).setFontSize(9).setFontColor(C.sec).setNumberFormat(FECHA_H);
    cifra(sh, 'D' + DAT + ':D' + fin);
    suave(sh, 'E' + DAT + ':F' + fin);
    reglas(sh, 'A' + DAT + ':F' + fin);
    sh.setFrozenRows(CAB);
  }

  function listas(sh) {
    titulo(sh);
    /* A persona · B color · C día cobro TC · D cuenta · E es crédito
       F activa · G categoría · H tipo · I reparto · J activa */
    var fin = DAT + N_CATS - 1;
    anchos(sh, [[1, 140], [2, 100], [3, 120], [4, 170], [5, 100], [6, 80],
                [7, 170], [8, 90], [9, 100], [10, 80]]);
    cabecera(sh, 'A' + CAB + ':J' + CAB);
    sh.getRange('B' + CAB + ':C' + CAB).setHorizontalAlignment('center');
    sh.getRange('E' + CAB + ':F' + CAB).setHorizontalAlignment('center');
    sh.getRange('H' + CAB + ':J' + CAB).setHorizontalAlignment('center');
    sh.getRange('B' + DAT + ':C' + fin).setHorizontalAlignment('center').setFontSize(9);
    sh.getRange('E' + DAT + ':F' + fin).setHorizontalAlignment('center');
    sh.getRange('H' + DAT + ':J' + fin).setHorizontalAlignment('center').setFontSize(9).setFontColor(C.sec);
    reglas(sh, 'A' + DAT + ':J' + fin);
    sh.setFrozenRows(CAB);
    // Lo desactivado, apagado: sigue en la hoja pero la app ya no lo ofrece.
    tinta(sh, 'D' + DAT + ':F' + fin, '=$F' + DAT + '=FALSE', C.mut);
    tinta(sh, 'G' + DAT + ':J' + fin, '=$J' + DAT + '=FALSE', C.mut);
    // el color de cada persona, pintado en su celda
    var v = sh.getRange(DAT, 2, N_PERS, 1).getValues();
    for (var i = 0; i < v.length; i++) {
      var hex = String(v[i][0] || '').trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) sh.getRange(DAT + i, 2).setBackground(hex).setFontColor(hex);
    }
  }

  function config(sh) {
    titulo(sh);
    anchos(sh, [[1, 200], [2, 140], [3, 320]]);
    /* B4 ahorro esperado · B5 moneda · B6 símbolo · B7 día de cierre
       A9 cabecera de avisos, B10:B12 las casillas
       A14 cabecera de controles, B15:B20 los seis */
    sh.getRange('A4:B4').setBackground(C.band).setFontWeight('bold');
    sh.getRange('B4').setFontFamily(TIPO_CIFRA).setFontSize(14)
      .setHorizontalAlignment('right').setNumberFormat(POS);
    sh.getRange('B5:B7').setHorizontalAlignment('right');
    suave(sh, 'C4:C7');
    reglas(sh, 'A4:C7');

    cabecera(sh, 'A9:C9');
    sh.getRange('B10:B12').setHorizontalAlignment('center');
    sh.getRange('C10:C12').setFontSize(9).setFontColor(C.sec);
    reglas(sh, 'A10:C12');

    cabecera(sh, 'A14:C14');
    sh.getRange('B14').setHorizontalAlignment('right');
    cifra(sh, 'B15:B20', MIL);
    sh.getRange('B20').setNumberFormat(CLP);
    sh.getRange('C15:C20').setFontSize(9).setFontColor(C.sec);
    reglas(sh, 'A15:C20');
    /* Los dos controles que tienen que dar 0 SIEMPRE: filas sin «Se usa en»
       —que no aparecen en ningún mes— y el descuadre del reparto. */
    tinta(sh, 'B16', '=$B$16<>0');
    tinta(sh, 'B20', '=$B$20<>0');
  }

  function generico(sh) {
    var n = Math.min(sh.getMaxRows(), 300);
    if (n < 2) return;
    cabecera(sh, sh.getRange(1, 1, 1, sh.getMaxColumns()).getA1Notation());
    reglas(sh, sh.getRange(2, 1, n - 1, sh.getMaxColumns()).getA1Notation());
    sh.setFrozenRows(1);
  }

  var RUTAS = {
    'Panel': panel, 'Año': anio, 'Ano': anio, 'Movimientos': movimientos,
    'Fijos': fijos, 'Metas': metas, 'Cierres': cierres, 'Reparto': reparto,
    'Listas': listas, 'Config': config
  };

  function una(sh) {
    resolverTopes();
    nuevaHoja();
    base(sh);
    (RUTAS[sh.getName()] || generico)(sh);
    aplicar(sh);
  }

  function todo() {
    var ss = SpreadsheetApp.getActive();
    var hechas = [];
    ss.getSheets().forEach(function (sh) {
      if (sh.isSheetHidden()) return;      // _uuids se queda como está
      una(sh);
      hechas.push(sh.getName());
    });
    SpreadsheetApp.flush();
    var msg = 'Vestidas: ' + hechas.join(', ') +
      '. Si las fuentes no cambiaron, edita TIPO_CIFRA y TIPO_UI arriba del archivo.';

    /* console.log y toast, nunca Ui.alert().
       Un alert es modal y SUSPENDE el script hasta que alguien pulsa Aceptar.
       Ejecutando desde el editor con la pestaña de la hoja cerrada no lo pulsa
       nadie: el trabajo termina en segundos y la ejecución se queda ahí parada
       hasta morir a los seis minutos. Le pasó a instalar() tres veces, y como
       alert() no lanza sino que bloquea, el try/catch no servía de nada. */
    console.log(msg);
    try { SpreadsheetApp.getActive().toast(msg, 'Vestir el libro', 15); } catch (e) { /* sin hoja delante */ }
    return hechas;
  }

  return { todo: todo, hoja: una };
})();
