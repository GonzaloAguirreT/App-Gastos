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

  /* Categoría con la que se marcan los traspasos entre cuentas propias. Mover
     dinero de la corriente al ahorro no es ni ingreso ni gasto, así que se
     guarda como dos filas con esta categoría y los totales del mes la
     descuentan. Si cambias el texto, cámbialo también en Codigo.gs y en la
     hoja de configuración del Excel. */
  CATEGORIA_TRASPASO: "Traspaso",

  // IMPORTANTE: estos textos deben coincidir palabra por palabra con las listas
  // de la hoja de configuración del Excel. Si aquí pone "Tarjeta de crédito" y
  // allí "Tarjeta crédito", el SUMIFS del panel devuelve cero y no te enteras.
  // Escritas tal cual me las dictaste. Si un día cambias una, cámbiala también
  // en la hoja de configuración del Excel: los SUMIFS comparan texto exacto.
  CUENTAS: [
    "Cuenta Corriente",
    "Tarjeta Credito",
    "Bizum",
    "Ahorro",
    "Efectivo"
  ],

  /* Doce categorías de gasto, y son doce por un motivo: en dos columnas caben
     seis filas en la mitad inferior de la pantalla sin obligar a desplazar. Si
     añades más, la rejilla empieza a hacer scroll y el paso deja de ser un solo
     toque. Antes de añadir una, plantéate si no cabe en "Otros".

     Los grupos vienen de la plantilla de presupuesto que ya tenías (facturas,
     suscripciones, deudas), para que el día que montes el panel cuadren. */
  CATEGORIAS_GASTO: [
    "Alimentación",
    "Restaurantes",
    "Transporte",
    "Vivienda",
    "Suministros",
    "Salud",
    "Ocio",
    "Compras",
    "Suscripciones",
    "Deudas",
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
