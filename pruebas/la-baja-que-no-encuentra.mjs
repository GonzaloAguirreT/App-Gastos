/*
 * Una baja que no encuentra su fila tiene que decirlo.
 *
 *   node pruebas/la-baja-que-no-encuentra.mjs        (no necesita servidor)
 *
 * `bajaMovimiento` y `bajaFijo` contestaban `{ ok: true, escritos: 0 }` cuando
 * no encontraban el uuid. Con ese `ok` la app saca el registro de la cola y da
 * el borrado por hecho, así que un borrado que no ocurrió es indistinguible de
 * uno que sí: el movimiento se queda en la hoja y nadie se entera.
 *
 * Se vio en el teléfono: encadenando bajas, alguna se quedaba sin aplicar y la
 * app decía que todo estaba al día.
 *
 * `editarMovimiento` y `marcarCargo` ya hacían lo correcto en el mismo caso
 * —`aviso: 'No se encontró...'`—, así que esto es alinear las cuatro.
 *
 * El `ok: true` se queda: si la fila no está, reintentar no la va a encontrar
 * nunca y el registro se quedaría en la cola para siempre. Lo que faltaba era
 * el aviso, que es lo que distingue «ya no estaba» de «lo he borrado».
 */
import { cargar, hoja, libro } from './backend.mjs';

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : ' FALLA ') + t); if (!c) fallos++; };

function libroDePruebas() {
  return libro({
    Movimientos: hoja([
      ['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'IMPORTE', 'CUENTA',
       'PERSONA', 'REPARTO', 'SE USA EN', 'ORIGEN', 'UUID'],
      [new Date(2026, 7, 10, 12), 'Gasto', 'Alimentación', 'Feria', 45000,
       'Efectivo', 'Camila', 'Común', '2026-08', 'app', 'm-existe']
    ]),
    Fijos: hoja([
      ['UUID', 'TIPO', 'CONCEPTO', 'IMPORTE', 'DÍA', 'CADA (MESES)', 'CUOTAS',
       'RESTANTES', 'CUENTA', 'PERSONA', 'REPARTO', 'SE USA EN', 'ACTIVO',
       'PRÓXIMO CARGO', 'ÚLTIMO CARGO', 'MES IMPUTADO'],
      ['f-existe', 'Gasto', 'Arriendo', 620000, 5, 1, '', '', 'Tarjeta Débito',
       'Gonzalo', 'Común', 'mismo', true, '', '', '']
    ]),
    // cobrarFijo apunta el uuid del cargo aquí; sin la hoja, revienta.
    _uuids: hoja([['UUID', 'RECIBIDO', 'QUÉ ERA']]),
    Listas: hoja([[''], [''], [''],
      ['PERSONA', 'COLOR', 'DÍA COBRO TC', 'CUENTA', 'ES CRÉDITO', 'ACTIVA',
       'CATEGORÍA', 'TIPO', 'REPARTO', 'ACTIVA'],
      ['Gonzalo', '#3D5A6C', 5, 'Tarjeta Débito', false, true, 'Arriendo', 'Gasto', 'Común', true]
    ])
  });
}

console.log('\nBorrar un movimiento que no está');
{
  const elLibro = libroDePruebas();
  const { bajaMovimiento } = cargar(['bajaMovimiento'], elLibro);
  const r = bajaMovimiento({ objetivo: 'm-no-existe' });

  ok(r.ok === true, 'contesta ok, para que la app no lo reintente eternamente');
  ok(r.escritos === 0, 'y dice que no ha escrito nada');
  ok(!!r.aviso, 'pero avisa de que no lo encontró: ' + JSON.stringify(r.aviso || null));
}

console.log('\nBorrar uno que sí está');
{
  const elLibro = libroDePruebas();
  const { bajaMovimiento } = cargar(['bajaMovimiento'], elLibro);
  const r = bajaMovimiento({ objetivo: 'm-existe' });

  ok(r.ok === true, 'contesta ok');
  ok(r.escritos === 1, 'y dice que ha borrado una fila');
  ok(!r.aviso, 'sin ningún aviso');
}

console.log('\nBorrar un fijo que no está');
{
  const elLibro = libroDePruebas();
  const { bajaFijo } = cargar(['bajaFijo'], elLibro);
  const r = bajaFijo({ objetivo: 'f-no-existe' });

  ok(r.ok === true, 'contesta ok');
  ok(r.escritos === 0, 'y dice que no ha escrito nada');
  ok(!!r.aviso, 'pero avisa: ' + JSON.stringify(r.aviso || null));
}

console.log('\nBorrar un fijo que sí está');
{
  const elLibro = libroDePruebas();
  const { bajaFijo } = cargar(['bajaFijo'], elLibro);
  const r = bajaFijo({ objetivo: 'f-existe' });

  ok(r.escritos === 1, 'dice que ha borrado una fila');
  ok(!r.aviso, 'y no avisa de nada');
}

console.log('\nY las que ya lo hacían bien siguen igual');
{
  const elLibro = libroDePruebas();
  const { editarMovimiento, marcarCargo } =
    cargar(['editarMovimiento', 'marcarCargo'], elLibro);

  const e = editarMovimiento({ objetivo: 'm-no-existe', cambios: { importe: 1 } });
  ok(e.ok === true && e.escritos === 0 && !!e.aviso,
     'editarMovimiento avisa: ' + JSON.stringify(e.aviso || null));

  const c = marcarCargo({ objetivo: 'f-no-existe', mes: '2026-08', cargado: true });
  ok(c.ok === true && c.escritos === 0 && !!c.aviso,
     'marcarCargo avisa: ' + JSON.stringify(c.aviso || null));
}

console.log(fallos ? '\n' + fallos + ' fallos\n' : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
