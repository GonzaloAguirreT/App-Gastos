/**
 * Copia de referencia de config.js.
 *
 * config.js está versionado (Pages necesita servirlo), así que este archivo no
 * sirve para "arrancar la configuración" sino como punto de vuelta: si alguna
 * vez dejas config.js hecho un desastre, copia esto encima.
 *
 * Desde el rediseño, las listas de personas, cuentas y categorías viven en la
 * hoja y se editan desde Ajustes. Lo de aquí es la SEMILLA del primer arranque
 * y el respaldo sin red.
 */
const CONFIG = {
  // URL de la Web App de Google Apps Script. Se rellena desde la app, no aquí.
  ENDPOINT: "",

  // Token compartido. Se rellena desde la app, no aquí.
  TOKEN: "",

  // En modo prueba no se envía nada: los movimientos se escriben en la consola.
  // Ponlo en true si quieres trastear con el flujo sin tocar la hoja.
  MODO_PRUEBA: false,

  /* Moneda. El peso chileno no tiene decimales: nadie teclea centavos ni los
     mira. Por eso el teclado no tiene coma y todos los importes son enteros.
     Si algún día vuelves al euro, esto y DECIMALES son lo único que cambia. */
  SIMBOLO: "$",
  DECIMALES: 0,

  /* Cada cuánto se repite un fijo, en meses. Son los cinco de la ficha del
     fijo; no hay "cada 4 meses" porque no existe ningún recibo así. */
  FRECUENCIAS: [
    { etiqueta: "Mes",      meses: 1,  texto: "mensual" },
    { etiqueta: "2 meses",  meses: 2,  texto: "bimestral" },
    { etiqueta: "3 meses",  meses: 3,  texto: "trimestral" },
    { etiqueta: "6 meses",  meses: 6,  texto: "semestral" },
    { etiqueta: "Año",      meses: 12, texto: "anual" }
  ],

  /* Cuántas veces se cobra. `cuotas: 0` es "siempre": sigue cobrando hasta que
     lo borres. Con cuotas, al llegar a cero el fijo se desactiva solo. */
  DURACIONES: [
    { etiqueta: "Siempre",    cuotas: 0 },
    { etiqueta: "6 cuotas",   cuotas: 6 },
    { etiqueta: "12 cuotas",  cuotas: 12 },
    { etiqueta: "24 cuotas",  cuotas: 24 },
    { etiqueta: "48 cuotas",  cuotas: 48 }
  ],

  /* Días de cobro ofrecidos. No están todos los del mes a propósito: una
     rejilla de 31 números obliga a buscar, y estos siete cubren casi todos los
     recibos reales. El 31 significa "último día", y el backend lo recorta al
     que exista en cada mes. */
  DIAS: [1, 5, 10, 20, 24, 28, 31],

  /* Planes que se ofrecen en el onboarding. Solo son atajos para no tener que
     teclear siete cifras la primera vez. */
  PLANES_SUGERIDOS: [1200000, 1600000, 2000000, 2400000],

  /* Colores de persona, en el orden en que se reparten. Son los mismos del
     rediseño y los únicos colores de la app además del acento: aparecen en la
     barra del mes y en el cuadrado junto al nombre, nunca en texto corrido. */
  COLORES_PERSONA: ["#3D5A6C", "#A34E6B", "#5E7A52", "#9A7A3F"],

  /* --------------------------------------------------------------- semilla

     Estos textos tienen que coincidir palabra por palabra con la pestaña
     `Listas` de la hoja: los SUMIFS del panel comparan texto exacto. En cuanto
     la app habla con la hoja, mandan los de la hoja. */

  PERSONAS: ["Gonzalo", "Camila"],

  CUENTAS: [
    "Cuenta Corriente",
    "Tarjeta Credito",
    "Tarjeta Debito",
    "Efectivo"
  ],

  /* Categorías con su tipo y su reparto. `reparto` es la regla de "el arriendo
     sí, la ropa no": decide si un gasto de esa categoría se cuenta como común
     o como personal, sin tener que contestarlo en cada movimiento. */
  CATEGORIAS: [
    { nombre: "Alimentación",     tipo: "Gasto",   reparto: "Común" },
    { nombre: "Restaurantes",     tipo: "Gasto",   reparto: "Personal" },
    { nombre: "Transporte",       tipo: "Gasto",   reparto: "Común" },
    { nombre: "Salud",            tipo: "Gasto",   reparto: "Común" },
    { nombre: "Hogar",            tipo: "Gasto",   reparto: "Común" },
    { nombre: "Ocio",             tipo: "Gasto",   reparto: "Personal" },
    { nombre: "Compras",          tipo: "Gasto",   reparto: "Personal" },
    { nombre: "Viajes",           tipo: "Gasto",   reparto: "Personal" },
    { nombre: "Otros",            tipo: "Gasto",   reparto: "Personal" },
    { nombre: "Arriendo",         tipo: "Gasto",   reparto: "Común" },
    { nombre: "Suministros",      tipo: "Gasto",   reparto: "Común" },
    { nombre: "Suscripciones",    tipo: "Gasto",   reparto: "Común" },
    { nombre: "Seguros",          tipo: "Gasto",   reparto: "Personal" },
    { nombre: "Préstamos",        tipo: "Gasto",   reparto: "Personal" },
    { nombre: "Sueldo",           tipo: "Ingreso", reparto: "Personal" },
    { nombre: "Bono",             tipo: "Ingreso", reparto: "Personal" },
    { nombre: "Devolución",       tipo: "Ingreso", reparto: "Personal" },
    { nombre: "Arriendo cobrado", tipo: "Ingreso", reparto: "Común" }
  ],

  /* Lo que se ofrece en las pantallas de listas para añadir con un toque, sin
     teclear. No entran en la hoja hasta que las eliges. */
  SUGERENCIAS_CATEGORIAS: ["Ropa", "Regalos", "Mascotas", "Educación", "Bencina", "Gimnasio"],
  SUGERENCIAS_CUENTAS: ["Cuenta Vista", "Ahorro", "Transferencias"],

  // Valores del primer arranque, hasta que la hoja diga otra cosa.
  PLAN: 1600000,
  LIMITE: 200000
};
