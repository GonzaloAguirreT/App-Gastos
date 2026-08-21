/*
 * Que instalar() sobreviva a las tres formas de libro que va a encontrarse.
 *
 *   node pruebas/instalar-el-libro.mjs        (no necesita servidor)
 *
 * `instalar()` no se había probado nunca: hacía falta subirlo a Apps Script,
 * ejecutarlo contra un libro de verdad y mirar el registro. Por eso un libro
 * VACÍO —el que queda justo después de vaciar()— lo tumbaba:
 *
 *   Exception: The number of rows in the range must be at least 1.
 *     escribirMovimientos @ Código.gs:896
 *
 * Con cero movimientos, `getRange(2, 1, 0, 1)` no devuelve un rango vacío:
 * lanza. Y como instalar() borra Panel y Año antes de llegar ahí, el libro se
 * quedaba a medias, sin esas dos pestañas.
 *
 * Las tres formas: el libro vacío, el que ya tiene datos, y el del formato
 * viejo, que es del que hay que migrar.
 */
import { cargar, hoja, libro } from './backend.mjs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

/** Ejecuta instalar() sobre un libro y devuelve el error, o null si fue bien. */
function instalarSobre(hojas) {
  const l = libro(hojas);
  const { instalar } = cargar(['instalar'], l);
  try {
    instalar();
    return null;
  } catch (e) {
    return e.message;
  }
}

/* ------------------------------------------------------- el libro vacío */

/* El que deja vaciar(): las hojas están, con sus cabeceras y sus fórmulas, pero
   sin una sola fila de datos. Es el caso de «empezar de cero», así que instalar
   tiene que poder correr justo después. */
const vacio = {
  Movimientos: hoja([['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
                      'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID']]),
  Fijos: hoja([['UUID', 'TIPO', 'CONCEPTO', 'IMPORTE', 'DÍA', 'CADA (MESES)', 'CUOTAS',
                'RESTANTES', 'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ACTIVO',
                'PRÓXIMO CARGO', 'ÚLTIMO CARGO', 'MES IMPUTADO']])
};
ok(instalarSobre(vacio) === null,
   'instalar() corre sobre un libro vacío: ' + instalarSobre(vacio));

/* Y sobre uno del todo pelado, sin ninguna hoja, que es la primera instalación
   de alguien que acaba de crear la hoja de cálculo. */
ok(instalarSobre({}) === null,
   'y sobre uno sin ninguna hoja todavía: ' + instalarSobre({}));

/* --------------------------------------------------- el libro con datos */

const conDatos = {
  Movimientos: hoja([
    ['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
     'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID'],
    [new Date(2026, 7, 3), 'Gasto', 'Alimentación', 'Feria', 15000,
     'Cuenta Corriente', 'Gonzalo', 'Común', '2026-08', 'app', 'u1'],
    [new Date(2026, 7, 5), 'Ingreso', 'Sueldo', '', 900000,
     'Cuenta Corriente', 'Gonzalo', 'Personal', '2026-08', 'app', 'u2']
  ]),
  Fijos: hoja([
    ['UUID', 'TIPO', 'CONCEPTO', 'IMPORTE', 'DÍA', 'CADA (MESES)', 'CUOTAS',
     'RESTANTES', 'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ACTIVO',
     'PRÓXIMO CARGO', 'ÚLTIMO CARGO', 'MES IMPUTADO'],
    ['f1', 'Gasto', 'Arriendo', 450000, 1, 1, '', '', 'Cuenta Corriente',
     'Gonzalo', 'Común', 'mismo mes', true, new Date(2026, 8, 1), '', '2026-09']
  ]),
  Listas: hoja([
    ['Listas', '', '', '', '', '', '', '', '', ''],
    ['La app lee estas listas.', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    ['PERSONA', 'COLOR', 'DÍA COBRO TC', 'CUENTA', 'ES CRÉDITO', 'ACTIVA',
     'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'],
    ['Gonzalo', '#3D5A6C', 5, 'Cuenta Corriente', false, true,
     'Alimentación', 'Gasto', 'Común', true],
    ['Camila', '#A34E6B', 12, 'Tarjeta Credito', true, true,
     'Sueldo', 'Ingreso', 'Personal', true]
  ])
};
ok(instalarSobre(conDatos) === null,
   'instalar() corre sobre un libro con datos: ' + instalarSobre(conDatos));

/* --------------------------------------------------- el libro del formato viejo */

/* El que hay que migrar: Movimientos con MES en la B y Fijos de catorce
   columnas. instalar() los lee antes de tocar nada y los reescribe. */
const viejo = {
  Movimientos: hoja([
    ['FECHA', 'MES', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
     'CUENTA', 'PERSONA', 'REPARTO', 'ORIGEN', 'UUID'],
    [new Date(2026, 7, 3), '2026-08', 'Gasto', 'Alimentación', 'Feria', 15000,
     'Cuenta Corriente', 'Gonzalo', 'Común', 'app', 'u1']
  ]),
  Fijos: hoja([
    ['UUID', 'TIPO', 'CONCEPTO', 'IMPORTE', 'DÍA', 'CADA (MESES)', 'CUOTAS',
     'RESTANTES', 'CUENTA', 'PERSONA', 'REPARTO', 'ACTIVO',
     'PRÓXIMO CARGO', 'ÚLTIMO CARGO'],
    ['f1', 'Gasto', 'Arriendo', 450000, 1, 1, '', '', 'Cuenta Corriente',
     'Gonzalo', 'Común', true, new Date(2026, 8, 1), '']
  ]),
  Listas: hoja([
    ['Listas', '', '', '', '', '', '', ''],
    ['La app lee estas listas.', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['PERSONA', 'COLOR', 'CUENTA', 'ACTIVA', 'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'],
    ['Gonzalo', '#3D5A6C', 'Cuenta Corriente', true, 'Alimentación', 'Gasto', 'Común', true]
  ])
};
ok(instalarSobre(viejo) === null,
   'instalar() corre sobre un libro del formato viejo: ' + instalarSobre(viejo));

/* ------------------------------------- y vaciar seguido de instalar */

/* La secuencia de verdad, que es la que falló: se vacía el libro y acto seguido
   se instala. Son las dos operaciones manuales del editor, una detrás de otra. */
const paraVaciar = libro({
  Movimientos: hoja([['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE',
                      'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID'],
                     [new Date(2026, 7, 3), 'Gasto', 'Alimentación', '', 15000,
                      'Cuenta Corriente', 'Gonzalo', 'Común', '2026-08', 'app', 'u1']])
});
const dos = cargar(['vaciar', 'instalar'], paraVaciar);
var seguido = null;
try { dos.vaciar(); dos.instalar(); } catch (e) { seguido = e.message; }
ok(seguido === null, 'vaciar() y luego instalar() en la misma hoja: ' + seguido);

console.log(fallos ? `\n${fallos} fallan` : '\nTodo pasa');
process.exit(fallos ? 1 : 0);
