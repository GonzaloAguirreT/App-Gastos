/**
 * Formatos. Funciones puras: entra un dato, sale un texto.
 *
 * Está separado del resto porque lo usan todas las pantallas y porque así se
 * puede probar sin navegador. Nada de aquí toca el DOM ni el estado.
 */
const FMT = (() => {

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  /**
   * Un importe, tal como se lee en Chile: $1.472.000.
   *
   * Miles con punto y sin decimales, porque el peso no los tiene: nadie teclea
   * centavos ni los mira. El signo negativo es el menos tipográfico (−), no el
   * guion del teclado: en las cifras grandes el guion se lee como un guion.
   *
   * `conSigno` es para lo que puede entrar o salir; para un gasto suelto el
   * signo sobra, ya lo dice la pantalla.
   */
  function dinero(n, { conSigno = false, simbolo = null } = {}) {
    const s = simbolo === null ? (CONFIG.SIMBOLO || '$') : simbolo;
    const negativo = n < 0;
    const cuerpo = s + miles(Math.abs(n));
    if (negativo) return '−' + cuerpo;
    return conSigno ? '+' + cuerpo : cuerpo;
  }

  /** Solo los dígitos con sus puntos de millar, sin símbolo. Lo usa la cifra
   *  grande, que pinta el símbolo aparte y más pequeño. */
  function miles(n) {
    const entero = Math.round(Math.abs(Number(n) || 0));
    return String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /** yyyy-mm-dd de una fecha, en hora local. `toISOString()` da UTC y a partir
   *  de medianoche te apunta el gasto al día anterior: el tipo de error que no
   *  se ve hasta que cuadras el mes. */
  function iso(fecha = new Date()) {
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${mes}-${dia}`;
  }

  /** Fecha local a partir de un yyyy-mm-dd. `new Date('2026-08-20')` lo
   *  interpreta como UTC; con los tres números lo interpreta como local. */
  function fecha(texto) {
    const [a, m, d] = String(texto).split('-').map(Number);
    return new Date(a, (m || 1) - 1, d || 1);
  }

  function mesDe(isoFecha) { return String(isoFecha).slice(0, 7); }

  /**
   * Cualquier cosa que pretenda ser un mes, convertida en 'yyyy-mm'.
   *
   * La hoja no siempre devuelve el texto que se escribió. Al guardar "2026-08"
   * en una celda, Sheets lo reconoce como agosto de 2026 y lo guarda como FECHA
   * de verdad; al leerlo vuelve como "Sat Aug 01 2026 00:00:00 GMT+0200". Con
   * eso, nombreMes hacía split('-') sobre una cadena sin guiones, sacaba NaN, y
   * la pantalla de Ahorro enseñaba un mes cerrado llamado "Undefined Sat Aug 01
   * 2026 00:00:00 GMT+0200 (hora de verano de Europa central)".
   *
   * Se arregla aquí y no en cada pantalla porque por aquí pasan todas: quien
   * recibe un mes no tiene por qué saber de dónde vino ni con qué formato.
   */
  const MESES_JS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function aMes(valor) {
    if (valor instanceof Date) {
      return valor.getFullYear() + '-' + String(valor.getMonth() + 1).padStart(2, '0');
    }
    const texto = String(valor || '');
    if (/^\d{4}-\d{2}/.test(texto)) return texto.slice(0, 7);

    /* El mes se lee del propio texto, sin pasarlo por new Date().
       "Sat Aug 01 2026 00:00:00 GMT+0200" es la medianoche del 1 de agosto en
       la zona de la hoja; convertirlo a Date y preguntarle el mes al navegador
       devuelve JULIO si el teléfono está en otra zona, porque esa medianoche
       cae a las 22:00 del día anterior. El nombre del mes ya está escrito ahí:
       no hace falta calcularlo. */
    const partes = texto.match(/\b([A-Z][a-z]{2})\s+\d{1,2}\s+(\d{4})\b/);
    if (partes) {
      const i = MESES_JS.indexOf(partes[1]);
      if (i !== -1) return partes[2] + '-' + String(i + 1).padStart(2, '0');
    }
    return '';
  }

  /** El mes en curso desplazado n meses: mesMas('2026-11', 3) → '2027-02'. */
  function mesMas(mes, n) {
    const [a, m] = mes.split('-').map(Number);
    const total = (a * 12) + (m - 1) + n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  }

  function mesesEntre(desde, hasta) {
    const [a1, m1] = desde.split('-').map(Number);
    const [a2, m2] = hasta.split('-').map(Number);
    return (a2 * 12 + m2) - (a1 * 12 + m1);
  }

  function nombreMes(mes) { return MESES[Number(aMes(mes).split('-')[1]) - 1] || ''; }

  function nombreMesAnio(mes) {
    const m = aMes(mes);
    return m ? `${nombreMes(m)} ${m.split('-')[0]}` : '';
  }

  function diasDelMes(mes) {
    const [a, m] = aMes(mes).split('-').map(Number);
    return new Date(a, m, 0).getDate();
  }

  /** El día `dia` del mes `mes`, recortado a lo que ese mes tenga. El 31 en
   *  febrero es el 28, o el 29: es lo que quiere decir "a fin de mes". */
  function diaDelMes(mes, dia) {
    const tope = diasDelMes(mes);
    return `${mes}-${String(Math.min(dia, tope)).padStart(2, '0')}`;
  }

  function cap(texto) { return texto.charAt(0).toUpperCase() + texto.slice(1); }

  /** "Hoy · jueves 20", "Ayer · miércoles 19", "Lunes 17". El día relativo
   *  primero porque es lo que se busca al repasar lo de esta semana. */
  function etiquetaDia(isoFecha, hoy) {
    const d = fecha(isoFecha);
    const numero = d.getDate();
    const semana = DIAS_SEMANA[d.getDay()];
    const dias = Math.round((fecha(hoy) - d) / 86400000);
    if (dias === 0) return `Hoy · ${semana} ${numero}`;
    if (dias === 1) return `Ayer · ${semana} ${numero}`;
    return `${cap(semana)} ${numero}`;
  }

  function frecuencia(meses) {
    const f = (CONFIG.FRECUENCIAS || []).find(x => x.meses === meses);
    return f ? f.texto : `cada ${meses} meses`;
  }

  return {
    MESES, DIAS_SEMANA,
    dinero, miles, iso, fecha, mesDe, aMes, mesMas, mesesEntre,
    nombreMes, nombreMesAnio, diasDelMes, diaDelMes, cap, etiquetaDia, frecuencia
  };
})();
