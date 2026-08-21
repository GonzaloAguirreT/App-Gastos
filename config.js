/**
 * Configuración de la app. Único archivo que deberías tocar en el día a día.
 *
 * Este archivo SÍ está versionado, al contrario de lo que suele hacerse con los
 * archivos de configuración. El motivo: GitHub Pages sirve exactamente lo que hay
 * en el repositorio, así que si lo ignorásemos la app desplegada se quedaría sin
 * cuentas ni categorías. Lo que no puede estar aquí es el token: una página de
 * Pages es pública y cualquiera podría leerlo.
 *
 * Desde el rediseño, las listas de personas, cuentas y categorías viven en la
 * hoja (pestaña `Listas`) y se editan desde Ajustes. Lo que queda aquí es la
 * SEMILLA: lo que se usa el primer arranque, antes de haber hablado nunca con
 * la hoja, y el respaldo si un día la lectura falla. Que la app arranque sin
 * red y sin haberse conectado nunca no es un lujo: es la diferencia entre poder
 * anotar un gasto en el supermercado y no poder.
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

  /* Ahorros esperados que se ofrecen en el onboarding. Solo son atajos para no
     tener que teclear seis cifras la primera vez. */
  AHORROS_SUGERIDOS: [100000, 200000, 300000, 500000],

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

  /* Qué cuentas aplazan el cargo. Tienen que estar tambien en CUENTAS: esta
     lista solo marca cuáles de ellas facturan a fin de mes. */
  CREDITO: ["Tarjeta Credito"],

  /* Día en que factura la tarjeta, hasta que la hoja diga el de cada persona.
     Una compra anterior a ese día entra en la factura de este mes; desde ese
     día, en la del siguiente. */
  DIA_COBRO: 5,

  // Valor del primer arranque, hasta que la hoja diga otra cosa.
  AHORRO_ESPERADO: 200000
};
