/**
 * Copia de referencia de config.js.
 *
 * config.js está versionado (Pages necesita servirlo), así que este archivo no
 * sirve para "arrancar la configuración" sino como documentación de la forma
 * que debe tener el objeto CONFIG y de qué significa cada campo. Si alguna vez
 * dejas config.js hecho un desastre, vuelve aquí.
 */
const CONFIG = {
  // URL que te da Apps Script al desplegar como aplicación web.
  // Formato: https://script.google.com/macros/s/AKfycb.../exec
  // Déjalo vacío en el repositorio: la app lo pide y lo guarda en el teléfono.
  ENDPOINT: "",

  // Cadena aleatoria larga. Debe ser idéntica a la propiedad TOKEN del script.
  // Déjalo vacío en el repositorio por el mismo motivo que ENDPOINT.
  TOKEN: "",

  // true  = nada se envía, todo se escribe en la consola del navegador.
  // false = envío real al ENDPOINT.
  MODO_PRUEBA: false,

  // Símbolo que se muestra junto al importe. No afecta a lo que se guarda.
  MONEDA: "€",

  // Listas cerradas. Deben coincidir literalmente con las del Excel.
  CUENTAS: ["Efectivo", "Cuenta corriente"],
  CATEGORIAS_GASTO: ["Alimentación", "Transporte"],
  CATEGORIAS_INGRESO: ["Nómina"]
};
