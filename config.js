/**
 * Configuración de la app. Único archivo que deberías tocar en el día a día.
 *
 * Este archivo SÍ está versionado, al contrario de lo que suele hacerse con los
 * archivos de configuración. El motivo: GitHub Pages sirve exactamente lo que hay
 * en el repositorio, así que si lo ignorásemos la app desplegada se quedaría sin
 * cuentas ni categorías. Lo que no puede estar aquí es el token: una página de
 * Pages es pública y cualquiera podría leerlo.
 *
 * Por eso ENDPOINT y TOKEN van vacíos. Si están vacíos, la app te los pide una
 * sola vez al arrancar y los guarda en el propio teléfono (fase 2). Si los
 * rellenas para trabajar en local, acuérdate de no commitear ese cambio.
 */
const CONFIG = {
  // URL de la Web App de Google Apps Script. Se rellena desde la app, no aquí.
  ENDPOINT: "",

  // Token compartido. Se rellena desde la app, no aquí.
  TOKEN: "",

  // En modo prueba no se envía nada: los movimientos se escriben en la consola.
  // Ponlo en true si quieres trastear con el flujo sin tocar la hoja.
  MODO_PRUEBA: false,

  MONEDA: "€",

  FRECUENCIAS: ["Mensual", "Trimestral", "Anual"],

  /* Duraciones ofrecidas. `meses: null` es "indefinida": sigue cobrando hasta
     que la desactives a mano en la hoja. */
  DURACIONES: [
    { etiqueta: "3 meses",    meses: 3 },
    { etiqueta: "6 meses",    meses: 6 },
    { etiqueta: "1 año",      meses: 12 },
    { etiqueta: "2 años",     meses: 24 },
    { etiqueta: "3 años",     meses: 36 },
    { etiqueta: "Indefinida", meses: null }
  ],

  /* Categoría de los traspasos entre cuentas propias. La app ya no los captura
     —se quitaron a propósito—, pero el texto sigue aquí por dos motivos: el
     resumen tiene que saber pintarlos si alguna vez escribes uno a mano en la
     hoja, y los totales del mes los descuentan. Mover dinero de la corriente al
     ahorro no es ni ingreso ni gasto: el dinero no entra ni sale, cambia de
     sitio. Si cambias el texto, cámbialo también en Codigo.gs. */
  CATEGORIA_TRASPASO: "Traspaso",

  // IMPORTANTE: estos textos deben coincidir palabra por palabra con las listas
  // de la hoja de configuración del Excel. Si aquí pone "Tarjeta de crédito" y
  // allí "Tarjeta crédito", el SUMIFS del panel devuelve cero y no te enteras.
  /* Quién puede gastar. El primero es el valor por defecto de un teléfono
     recién configurado; cada uno elige el suyo en Ajustes y a partir de ahí se
     estampa solo en cada movimiento.
     Estos textos también tienen que coincidir con Codigo.gs y con el Excel. */
  USUARIOS: [
    "Gonzalo",
    "Camila"
  ],

  // Escritas tal cual me las dictaste. Si un día cambias una, cámbiala también
  // en la hoja de configuración del Excel: los SUMIFS comparan texto exacto.
  CUENTAS: [
    "Cuenta Corriente",
    "Tarjeta Credito",
    "Bizum",
    "Ahorro",
    "Efectivo"
  ],

  /* ------------------------------------------------------------ categorías

     Todo se parte en dos desde el primer paso, y la división no es estética:
     un movimiento PUNTUAL es una fila y se acabó; uno FRECUENTE es una regla
     que sigue escribiendo filas sola cada mes. Preguntarlo al principio evita
     el error caro —anotar el alquiler como gasto suelto y tener que repetirlo
     los doce meses— y ahorra un paso, porque un frecuente no necesita que le
     digas si es gasto o ingreso hasta después.

     El límite práctico de cada lista es lo que cabe en dos columnas en la
     mitad inferior de la pantalla sin desplazar: unas nueve. Antes de añadir
     una categoría, plantéate si no cabe en "Otros". */

  // Lo que se repite solo hasta que lo canceles. Al elegir una de estas, la app
  // pregunta cada cuánto y hasta cuándo, y crea una regla en vez de un gasto.
  CATEGORIAS_FRECUENTES_GASTO: [
    "Suscripciones",   // Netflix, Spotify, gimnasio, iCloud
    "Arriendo",        // alquiler o hipoteca
    "Suministros",     // luz, agua, gas, internet, móvil
    "Seguros",         // coche, hogar, salud, vida
    "Préstamos",       // cuota del coche, crédito al consumo
    "Cuotas"           // colegio, comunidad, colegios profesionales
  ],

  CATEGORIAS_FRECUENTES_INGRESO: [
    "Nómina",
    "Arriendo",        // un piso que alquilas tú
    "Inversiones",
    "Pensión",
    "Otros"
  ],

  // El gasto de hoy, que no se repite. Nueve entran sin scroll.
  CATEGORIAS_GASTO: [
    "Alimentación",
    "Restaurantes",
    "Transporte",
    "Hogar",           // una reparación, un mueble, la ferretería
    "Salud",
    "Ocio",
    "Compras",
    "Viajes",
    "Otros"
  ],

  CATEGORIAS_INGRESO: [
    "Nómina",
    "Freelance",
    "Reembolsos",
    "Inversiones",
    "Regalos",
    "Otros"
  ]
};
