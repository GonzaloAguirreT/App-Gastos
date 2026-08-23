/*
 * Editar un movimiento no lo cambia de factura, salvo que el cambio lo toque.
 *
 *   node pruebas/editar-no-refactura.mjs        (no necesita servidor)
 *
 * Es la puerta que quedó abierta al arreglar el día de corte. Cambiar el corte
 * ya no reescribe la columna «Se usa en» de lo ya anotado —eso lo vigila
 * corte-que-no-reescribe—, pero `editarMovimiento` la recalculaba SIEMPRE, con
 * el corte de hoy y desde la fila entera. Así que corregir una falta en la
 * descripción de una compra de hace meses la mandaba a otra factura, y devolver
 * el corte a su sitio ya no la traía de vuelta: el pasado quedaba reescrito por
 * una errata. Se vio contra la hoja de verdad, no aquí.
 *
 * Por el mismo sitio se perdía la reserva de un ingreso. Para saber si el
 * sueldo estaba guardado para el mes siguiente se comparaba contra
 * `String(actual[0]).slice(0, 7)`, y `actual[0]` es una celda de FECHA: eso da
 * «Tue Aug», la comparación no acertaba nunca, y cualquier edición devolvía el
 * sueldo a su propio mes. Por eso el libro de mentira guarda Dates de verdad en
 * esa columna, igual que Sheets: con un texto «2026-08-20» el fallo no aparece.
 *
 * Los dos son silenciosos: la edición se guarda, no salta nada, y el mes cambia
 * por debajo.
 *
 * Cambiar la cuenta o el dueño SÍ tiene que mover el movimiento —pasar una
 * compra del día 25 de efectivo a la tarjeta la manda a la factura siguiente—,
 * y eso también se comprueba aquí: el arreglo no puede ser dejar de calcular.
 */
import { cargar, hoja, libro } from './backend.mjs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

/* El corte llega como parámetro porque el fallo solo se ve cuando el corte de
   HOY no es el que había cuando se escribió la fila. */
function libroDePruebas(corte) {
  return libro({
    Movimientos: hoja([
      ['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE', 'CUENTA',
       'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID'],
      // Comprada el 10 con el corte en 5: se facturó al mes siguiente.
      [new Date(2026, 7, 10, 12), 'Gasto', 'Restaurantes', 'Sushi', 32000,
       'Tarjeta de Crédito', 'Gonzalo', 'Personal', '2026-09', 'app', 'm-credito'],
      // En efectivo el 25: se paga en su propio mes, venga el corte que venga.
      [new Date(2026, 7, 25, 12), 'Gasto', 'Restaurantes', 'Café', 4000,
       'Efectivo', 'Gonzalo', 'Personal', '2026-08', 'app', 'm-efectivo'],
      // Un sueldo de agosto que un dedo guardó para septiembre.
      [new Date(2026, 7, 20, 12), 'Ingreso', 'Sueldo', 'Sueldo', 900000,
       'Efectivo', 'Gonzalo', 'Personal', '2026-09', 'app', 'm-sueldo']
    ]),
    _uuids: hoja([['UUID', 'RECIBIDO', 'QUÉ ERA']]),
    Listas: hoja([[''], [''], [''],
      ['PERSONA', 'COLOR', 'DÍA COBRO TC', 'CUENTA', 'ES CRÉDITO', 'ACTIVA',
       'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'],
      ['Gonzalo', '#3D5A6C', corte, 'Tarjeta de Crédito', true, true,
       'Restaurantes', 'Gasto', 'Personal', true],
      ['', '', '', 'Efectivo', false, true, 'Sueldo', 'Ingreso', 'Personal', true]
    ])
  });
}

/* La columna «Se usa en» de una fila, leída de la hoja y no de lo que devuelva
   la función: lo que importa es lo que queda escrito. */
const seUsaEnDe = (elLibro, uuid) => {
  const filas = elLibro.getSheetByName('Movimientos').getDataRange().getValues();
  const fila = filas.filter(f => f[10] === uuid)[0];
  return fila && String(fila[8]);
};

console.log('\nCon el corte ya cambiado a 20, se corrige una falta y nada más');
{
  const elLibro = libroDePruebas(20);
  const { editarMovimiento } = cargar(['editarMovimiento'], elLibro);

  const r = editarMovimiento({ objetivo: 'm-credito', cambios: { descripcion: 'Sushi (corregido)' } });
  ok(r.ok === true && r.escritos === 1, 'la edición se guarda');
  ok(seUsaEnDe(elLibro, 'm-credito') === '2026-09',
     'y la compra sigue facturada en 2026-09: ' + seUsaEnDe(elLibro, 'm-credito'));
}

console.log('\nY tampoco la mueve tocarle el importe o la categoría');
{
  const elLibro = libroDePruebas(20);
  const { editarMovimiento } = cargar(['editarMovimiento'], elLibro);

  editarMovimiento({ objetivo: 'm-credito', cambios: { importe: 35000, categoria: 'Alimentación' } });
  ok(seUsaEnDe(elLibro, 'm-credito') === '2026-09',
     'sigue en 2026-09: ' + seUsaEnDe(elLibro, 'm-credito'));
}

console.log('\nUn sueldo guardado para el mes que viene sigue guardado');
{
  const elLibro = libroDePruebas(5);
  const { editarMovimiento } = cargar(['editarMovimiento'], elLibro);

  editarMovimiento({ objetivo: 'm-sueldo', cambios: { descripcion: 'Sueldo de agosto' } });
  ok(seUsaEnDe(elLibro, 'm-sueldo') === '2026-09',
     'sigue reservado a 2026-09: ' + seUsaEnDe(elLibro, 'm-sueldo'));
}

console.log('\nPero cambiar la cuenta sí la cambia de factura');
{
  const elLibro = libroDePruebas(5);
  const { editarMovimiento } = cargar(['editarMovimiento'], elLibro);

  editarMovimiento({ objetivo: 'm-efectivo', cambios: { cuenta: 'Tarjeta de Crédito' } });
  ok(seUsaEnDe(elLibro, 'm-efectivo') === '2026-09',
     'del 25 en efectivo (2026-08) a la tarjeta con corte 5: 2026-09, y dice '
     + seUsaEnDe(elLibro, 'm-efectivo'));
}

console.log('\nY cambiar la fecha también, sin perder la reserva del sueldo');
{
  const elLibro = libroDePruebas(5);
  const { editarMovimiento } = cargar(['editarMovimiento'], elLibro);

  editarMovimiento({ objetivo: 'm-sueldo', cambios: { fecha: '2026-09-20' } });
  ok(seUsaEnDe(elLibro, 'm-sueldo') === '2026-10',
     'el sueldo pasa a septiembre y su reserva le sigue a 2026-10: '
     + seUsaEnDe(elLibro, 'm-sueldo'));

  const otro = libroDePruebas(5);
  const edita = cargar(['editarMovimiento'], otro).editarMovimiento;
  edita({ objetivo: 'm-credito', cambios: { fecha: '2026-08-02' } });
  ok(seUsaEnDe(otro, 'm-credito') === '2026-08',
     'y la compra movida al día 2, con corte 5, baja a su propio mes: '
     + seUsaEnDe(otro, 'm-credito'));
}

console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
