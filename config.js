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
  // Arranca en true para que la app funcione antes de tener el backend montado.
  MODO_PRUEBA: true,

  MONEDA: "€",

  // IMPORTANTE: estos textos deben coincidir palabra por palabra con las listas
  // de la hoja de configuración del Excel. Si aquí pone "Tarjeta de crédito" y
  // allí "Tarjeta crédito", el SUMIFS del panel devuelve cero y no te enteras.
  CUENTAS: [
    "Efectivo",
    "Cuenta corriente",
    "Tarjeta de crédito",
    "Ahorro",
    "PayPal"
  ],

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
    "Educación",
    "Regalos",
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
