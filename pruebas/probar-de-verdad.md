# Probar de verdad

Este archivo es para una sesión que corre **en la máquina de Gonzalo**, no en el
contenedor de Claude Code en la nube. Existe porque hay tres cosas que desde la
nube no se pueden hacer y que son justo por donde se han escapado los fallos.

Léelo entero antes de empezar. El orden es por valor, no por comodidad.

## Por qué hace falta esto

Todos los fallos que han llegado al teléfono de Gonzalo tienen la misma forma:
**mi imitación del backend era más permisiva que Apps Script**. La app hacía
algo que el servidor falso aceptaba y la hoja de verdad rechazaba en silencio.

Tres veces en dos días:

| lo que la app hacía | el servidor falso | Apps Script |
|---|---|---|
| leer Listas por posición fija | no aplica | devolvía la columna de al lado: cuentas llamadas `true` |
| `getRange(2, 1, 0, 1)` con cero movimientos | devolvía un rango vacío | **lanza** y dejó el libro a medias |
| guardar una meta con el nombre vacío | la guardaba tan contenta | la escribe y **no la vuelve a leer jamás** |

Los tres se descubrieron en el móvil, con datos reales, después de desplegar. Y
los tres eran invisibles para las pruebas porque las pruebas hablaban con una
mentira.

Las dos primeras ya están cerradas en el arnés: `pruebas/backend.mjs` ejecuta el
`Codigo.gs` de verdad y su hoja falsa lanza igual que Sheets. Pero sigue siendo
una imitación escrita por quien escribió el código: **solo una hoja de Google de
verdad cierra el agujero del todo**.

## Lo que ya está cubierto — no lo repitas

```sh
sh pruebas/todas.sh      # dieciocho pruebas, ~220 comprobaciones
```

Cubierto y verde: el calendario de la tarjeta y los topes, un mes recién
empezado, que nada se salga en 390×700, que nada pulsable esté muerto, el
vestido de la hoja, que repintar no cierre el teclado ni te devuelva al
principio, vaciar el libro sin llevarse las fórmulas, vaciar el teléfono sin
llevarse la conexión, leer las hojas por su cabecera, e `instalar()` sobre un
libro vacío, con datos y del formato viejo.

Empezar por rehacer esto sería tiempo tirado. Empieza por lo que sigue.

---

## Paso 1 — La hoja de pruebas desechable

Lo que más vale, con diferencia. Una copia del libro con su propio despliegue,
para poder escribirle basura sin miedo.

### Montarla

1. En Drive, duplicar el libro: **Archivo → Hacer una copia**. Llámala
   `Gastos — PRUEBAS`.
2. Abrir su editor: **Extensiones → Apps Script**. La copia trae su propio
   proyecto, separado del bueno.
3. Pegar `apps-script/Codigo.gs` y `apps-script/vestir-hoja.gs`.
4. **Configuración del proyecto → Propiedades del script**: `TOKEN` con
   cualquier cosa. Da igual que se filtre, no protege nada real.
5. Ejecutar `instalar()` una vez.
6. **Implementar → Nueva implementación → Aplicación web**, ejecutar como *yo*,
   acceso *cualquier persona*. Copiar la URL que acaba en `/exec`.

### Guardar las credenciales sin que entren en git

Variables de entorno, no un archivo. Así no hay nada que se pueda commitear por
descuido:

```sh
export GASTOS_ENDPOINT='https://script.google.com/macros/s/.../exec'
export GASTOS_TOKEN='loquesea'
```

### Qué construir

Una prueba nueva, `pruebas/contra-la-hoja.mjs`, que hable con ese endpoint en vez
de con el servidor falso. **No hace falta navegador**: es `fetch` contra
`/exec`, igual que hace `NUCLEO.enviar`. Recuerda las reglas del transporte, que
están en el README y no son negociables: `Content-Type: text/plain`, y **las
lecturas también van por POST**.

Lo que tiene que comprobar es la **ida y la vuelta**, que es donde vive esta
clase de fallo: escribir algo y volver a leerlo. Empieza por los tres casos de
la tabla de arriba, que ya sabemos que fallaban, y sigue por:

- una meta con nombre, y la misma meta renombrada — ¿se mueven sus líneas de
  Reparto?
- un movimiento con tarjeta de crédito el día del corte y el día anterior —
  ¿cae en el mes que toca en la columna «Se usa en»?
- un ingreso marcado «mes siguiente»
- cerrar un mes y reabrirlo
- un reparto que suma más de lo disponible
- el mismo `uuid` dos veces — la deduplicación de `_uuids`
- `vaciar()` y acto seguido `instalar()`

Si el endpoint no está en el entorno, la prueba debe **saltarse sola** con un
aviso claro y salir con 0. No puede romper `todas.sh` en el contenedor de la
nube, donde nunca habrá endpoint.

---

## Paso 2 — El teléfono de verdad

Segundo en valor. Es lo único que prueba el teclado del móvil, los toques y la
PWA instalada.

```sh
# En el móvil: Opciones de desarrollador → Depuración por USB
adb devices                                              # que aparezca
adb forward tcp:9222 localabstract:chrome_devtools_remote
```

Con Chrome abierto en el teléfono, Playwright se engancha por CDP:

```js
const navegador = await chromium.connectOverCDP('http://localhost:9222');
const pagina = navegador.contexts()[0].pages()[0];
```

(Existe también `playwright._android`, más directo pero experimental. Si CDP da
guerra, pruébalo.)

### Qué probar ahí y solo ahí

- **El teclado.** Escribir el nombre de una meta letra a letra y comprobar que
  el teclado no se cierra. Aquí se mide de verdad: en Chromium solo se puede
  mirar el foco. Fue el fallo que abrió todo esto.
- **Los toques.** Que las teclas del teclado propio y los chips se puedan pulsar
  con el pulgar sin fallar. En el escritorio siempre aciertas.
- **El alto real.** 780 px de alto no son los 844 del prototipo, y lo que se
  queda fuera es el teclado.
- **La PWA instalada**: arranque en frío desde el icono, sin barra de
  direcciones, y el atajo `?anotar=1`.
- **Background Sync**: anotar en modo avión, cerrar la app del todo, recuperar
  cobertura, y comprobar que la fila aparece en la hoja sin abrir nada.

---

## Paso 3 — El barrido exploratorio

Con los dos pasos anteriores montados, esto vale el doble. Sin ellos, también
sirve. La consigna es **romperla**, no comprobar que funciona.

Sitios donde esta app ya ha demostrado ser frágil:

**Fechas y meses.** El día del corte de la tarjeta y el día anterior. El día 1.
El 31 en un mes de 30. Febrero. Un mes sin nada anotado. Las flechas de mes en
el primero y en el último.

**Nombres.** Dos metas iguales. Dos categorías iguales. Una cuenta y una
categoría con el mismo nombre. Un nombre vacío. Un nombre larguísimo. Con emoji.
Con comillas. **Uno que empiece por `=`**, que en una celda es una fórmula. Uno
con `;` o `,`, que es lo que `sep()` usa para separar argumentos.

**Números.** Cero. Nueve cifras. Borrar todos los dígitos y guardar. Un reparto
mayor que lo disponible. Un objetivo menor que lo ya guardado.

**Borrar lo que está en uso.** Una categoría que tienen movimientos ya escritos.
Una cuenta que usa un fijo. Desmarcar «Activa» de las dos. ¿Cuadra el mes
después?

**La cola.** Anotar sin cobertura. Deshacer dentro de los siete segundos.
Recuperar cobertura. Cerrar la app con cosas pendientes. Dos escrituras del
mismo grupo. Y lo que ya mordió: **vaciar la hoja con algo pendiente en la cola**.

**El cierre.** Cerrar a mitad de mes. Cerrar dos veces. Reabrir y volver a
cerrar. Cerrar sin ingresos.

---

## Lo que salió del barrido del 22 de agosto de 2026

Contra la hoja de verdad, con un S24 conducido por adb + CDP.

**Un nombre que empieza por `=` se evalúa como fórmula.** Se guardó una meta
llamada `=A1` y la hoja la devolvió llamada «Metas de ahorro», que es lo que hay
en la celda A1 de esa hoja. El backend escribe con `setValues` y `appendRow`, y
las dos interpretan fórmulas.

Duele más de lo que parece porque **lo repartido a una meta se busca por su
nombre** —`SUMIF(Reparto!$C:$C, $A5, Reparto!$D:$D)`—, así que un nombre que
cambia solo desconecta el dinero de su meta. El arreglo está ya en casa: la
columna «Se usa en» de Movimientos se protege con `formatoSeguro(rango, '@')`,
y es lo mismo que hace falta en las columnas de texto libre. Sin verificar en
cuentas, categorías, descripciones y conceptos, pero escriben por la misma vía.

Lo demás aguantó: `+1`, `Cena; bebida` —el `;` que usa `sep()`—, `Café ☕`, y
120 caracteres vuelven intactos. Los espacios de los extremos no se recortan,
que es menor pero está.

**Una baja que no encuentra su fila contesta que sí.**

```js
function bajaMovimiento(datos) {                                   // :1792
  const fila = buscarFilaPorUuid(HOJA_MOVIMIENTOS, 11, datos.objetivo);
  if (fila) ...deleteRow(fila);
  return { ok: true, escritos: fila ? 1 : 0 };
}
```

Con `ok: true` la app saca el registro de la cola, así que un borrado que no
ocurrió es indistinguible de uno que sí. Encadenando bajas se ve: de cuatro
seguidas quedó una sin borrar, y de dos seguidas, otra. Sueltas siempre
funcionan. `marcarCargo` ya hace lo correcto en el mismo caso —devuelve
`aviso: 'No se encontró el fijo'`—, así que hay de dónde copiar.

No está averiguado *por qué* falla la búsqueda al encadenar. Lo que sí está
claro es que, falle por lo que falle, el backend lo tapa.

**Y lo que pasó y no era un fallo**, apuntado para que nadie lo vuelva a
perseguir: la cola manda de uno en uno y con su ventana de deshacer cada uno,
así que cinco apuntes tardan más de medio minuto en estar todos en la hoja.
Mirar antes de tiempo hace pensar que se han perdido escrituras. Antes de
declarar que algo no llegó, hay que esperar a que `NUCLEO.todos()` quede vacío
—y aun así darle unos segundos más a la hoja.

**Lo que pasó y está bien:** el teclado nativo no se cierra al escribir el
nombre de una meta letra a letra, y el foco no se va (`mInputShown=true` en cada
letra, medido con `adb shell dumpsys input_method`). Y la regla de la tarjeta
acierta los cuatro casos contra Apps Script: la víspera del corte cae en su mes,
el día del corte ya cae en el siguiente, y el débito no aplaza nunca.

## El barrido completo del 22 de agosto de 2026

Todas las pantallas, con datos sembrados en la hoja de verdad y el S24 conducido
por adb + CDP. Lo que sigue es lo que salió mal; lo que no está aquí, funcionó.

### No se puede anotar ningún ingreso

El más grave, y son tres piezas que se muerden la cola:

1. La pantalla Categorías **solo sabe crear categorías de gasto**. El alta es
   literal —`{ nombre: k, tipo: 'Gasto', reparto: 'Personal' }`— y las seis
   sugeridas también. No hay ningún sitio en la app donde elegir el tipo.
2. Con cero categorías de ingreso, Anotar en modo Ingreso **no pinta ninguna
   tira** de categorías, y guarda con `categoria: ""`.
3. `validarMovimiento` rechaza: `Falta la categoría`. El apunte se queda en la
   cola reintentando para siempre.

Así que en un libro sin categorías de ingreso —el que deja `instalar()`— los
ingresos son imposibles desde la app. Y los ingresos son de donde sale el techo
del mes, o sea todo el cálculo. Solo se ve entrando a Ajustes → Pendientes.

### Convertir un movimiento en fijo le cambia la cuenta y la persona

Un gasto de Camila en Efectivo se convirtió en un fijo de Gonzalo en Tarjeta
Débito. Concepto, importe y día sí se respetan; cuenta y persona se toman de los
ajustes de *este teléfono*. Si la cuenta que pone es de crédito y la original no
lo era, además cambia el mes al que se imputa cada cargo.

### El motivo que se enseña sin cobertura es «Failed to fetch»

En Ajustes → Pendientes, un apunte sin cobertura dice «Último intento hoy 16:15
· Failed to fetch». El comentario de `filaCola` dice que distinguir «sin
conexión» de «la hoja no respondió» es la mitad del valor de esa pantalla, y ahí
se enseña el error crudo del navegador, en inglés.

### «Día 22 de 31» en un mes que no es el de hoy

El contador de la cabecera de Mes es siempre el día de hoy. Navegando a julio
—que terminó— sigue diciendo «día 22 de 31», y en septiembre «día 22 de 30»
antes de que empiece. Un mes cerrado sí lo hace bien: pone «cerrado».

### La semilla de config.js no se parece al libro

`CONFIG.CUENTAS` son `Cuenta Corriente, Tarjeta Credito, Tarjeta Debito,
Efectivo`: una que no existe, dos sin tilde y falta `Ahorro`. Esa semilla es lo
que se usa antes de la primera lectura de la hoja, y **de ahí salió la «Cuenta
Corriente» huérfana** que costó la mañana. `sanearAjustes` ya lo corrige en la
primera sincronización, pero la semilla sigue mintiendo.

### Cosas menores, por si alguna vez toca

- En Historial, la cabecera de un día que solo tiene ingresos dice `$0`.
- Editando el importe, el cajetín de cuenta marcado es el del teléfono y no el
  del movimiento. No cambia el dato al guardar: es solo lo que se ve.
- Al borrar un fijo, el cargo que ya hizo se queda (razonable, pero no se dice).
- En el reparto, «faltan $1.000.000» no descuenta lo que acabas de asignar.
- `Conexión · correcta ✓` fuerza una sincronización y no da ninguna señal.
- Configurar cuotas en un fijo no se refleja en su cabecera hasta cargarlo.

### Lo que se probó y está bien

Navegación de meses y flechas que se apagan donde toca · Detalle del mes con sus
topes · Historial con filtros por persona y búsqueda · editar importe, cuenta y
persona de un movimiento (los tres ciclan y respetan el resto) · fijos: crear,
periodicidad, día, cuotas, reparto, cargar, descargar y borrar · cierre de mes y
reparto del ahorro a metas · reabrir · metas: crear, nombrar, objetivo, quitar ·
Anotar gasto e ingreso con su «se usa en» · el teclado propio · tema claro y
oscuro · avisos · ahorro esperado · días de cobro · cuentas de crédito ·
categorías y cuentas: añadir, quitar, sugeridas · atajo · la cola: motivo,
enviar ahora, descartar con deshacer, y **recuperación sola en 8 s al volver la
cobertura** · borrar con deshacer dentro de la ventana.

No se probó **Vaciar este teléfono**: habría cortado la sesión de QA. Tiene su
prueba en `vaciar-telefono.mjs`.

## Las reglas de la casa

Están en `CLAUDE.md`, pero estas tres son las que más se olvidan:

1. **Un fallo solo cuenta si trae una prueba** en `pruebas/` que falle con el
   código de ahora y pase con el arreglo. Compruébalo en las dos direcciones,
   siempre — más de una vez ha resultado que la prueba no medía lo que decía.
2. **Si el cambio toca la app** (`index.html`, `config.js`, `css/`, `js/`),
   sube `CACHE` en `sw.js` **y fusiona el PR**. Sin fusionar no llega a nadie:
   Pages sirve desde `main`.
3. `main` se fusiona en aplastado. Si una rama sobrevive a su PR, hay que
   rehacerla sobre `origin/main` con `cherry-pick`, no fusionar.

Y la de este archivo: **cuando encuentres un caso donde el servidor falso sea
más permisivo que Apps Script, arregla el servidor falso además del código.** Es
lo que convierte un fallo en dos fallos menos.

## Lo que está abierto ahora mismo

- ~~**Cuatro apuntes sin enviar** en el teléfono de Gonzalo~~. Cerrado: al
  abrir la app con cobertura la cola se vació sola y no dejó ninguno. No hay
  registro de lo que eran, así que no se pudo diagnosticar más.

- **El teléfono se puede conducir desde el PC**, y por ahí salió el fallo de la
  cuenta huérfana. Con la depuración USB puesta:

  ```sh
  adb forward tcp:9222 localabstract:chrome_devtools_remote
  curl http://127.0.0.1:9222/json/list          # las pestañas, con su ws
  ```

  Y desde ahí, CDP por WebSocket: `Runtime.evaluate` para leer el DOM y el
  estado de verdad, `Input.dispatchTouchEvent` para tocar como un dedo,
  `adb exec-out screencap -p > foto.png` para ver la pantalla. No hace falta
  Playwright: Node ya trae `fetch` y `WebSocket`.

  Dos cosas que costaron un rato: Chrome **solo crea el socket de depuración al
  arrancar**, así que si ya estaba abierto cuando pusiste la depuración USB hay
  que matarlo (`adb shell am force-stop com.android.chrome`); y en Git Bash las
  rutas del móvil se convierten solas —`/sdcard/x.png` acaba siendo una ruta de
  Windows—, por eso `exec-out` y no `screencap` a un archivo.

- **Medir los objetivos táctiles con `elementFromPoint`**, no con
  `getBoundingClientRect`: lo que importa es dónde acierta el dedo, y el padding
  del padre puede agrandar el área o no llegar a hacerlo. Las flechas de mes dan
  19×29 CSS de área real, un tercio del mínimo de 44×44.
- **`diagnosticar()`** está en `Codigo.gs` y nunca se llegó a ejecutar. No
  escribe nada: recorre las hojas una a una y dice cuál revienta. Es lo que
  hay que ejecutar si vuelve un `Sheet <id> not found`.

- **`instalar()` muere sobre un libro que ya tiene el formato de ahora.** Visto
  el 22 de agosto de 2026 en el libro de verdad:

  ```
  Exception: Sheet 1853955774 not found
  leerListasExistentes @ Código.gs:636
  instalar             @ Código.gs:170
  ```

  La línea 170 es la lectura previa —«leer ANTES de tocar nada»— y revienta en
  el primer `getLastRow()`. La causa es la misma familia que la trampa de
  `copy()`: `hojaLimpia` borra la hoja y la recrea, y la referencia que se pidió
  antes queda muerta. Se nota en que Listas aparece la última del libro, que es
  donde `insertSheet` la deja.

  El libro **no se rompe** —falla leyendo, antes de escribir nada— pero la
  migración no se hace. El arreglo previsible es volver a pedir el libro con
  `openById` después de borrar hojas, igual que ya se hace tras copiar.

  Cuidado al escribir la prueba: `instalar-el-libro.mjs` no lo pilla porque el
  libro de mentira de `backend.mjs` no invalida el id de una hoja borrada.
  Hacerlo fallar como Sheets es la mitad del trabajo, y es la mitad que importa:
  sin eso, la prueba pasa con y sin arreglo.

- **`instalar()` convierte sus propias filas de resumen en datos**, y esto ya
  escribió basura en el libro de verdad. `escribirMetas` deja debajo de las
  metas una fila «Total» y otra «SIN ASIGNAR»; `escribirCierres` deja otra
  «Total». Son resumen. Pero la lectura previa es

  ```js
  hoja.getRange(FILA_DATOS, 1, hoja.getLastRow() - FILA_CABECERA, ancho)
      .getValues().filter(f => f[0] !== '' && f[0] !== null)   // :728
  ```

  —hasta la última fila con algo escrito—, así que se las traga, y la pasada
  siguiente las reescribe arriba como metas y cierres de verdad. **Crece cada
  vez**: con «Total» en la 5 y en la 16, la lectura devuelve las dos.

  Lo que se ve hoy en el libro de Gonzalo: dos metas llamadas «Total» y «SIN
  ASIGNAR», editables desde Ahorro, y un cierre con `mes: ""`. Lo peor es el
  nombre: SIN ASIGNAR ya significa algo en la app —el ahorro cerrado que aún no
  tiene meta— y ahora existe además como meta. `Reparto` se salva porque
  `escribirReparto` no escribe fila de resumen.

  El arreglo previsible es leer solo las filas de datos —pasarle a
  `leerTablaExistente` el tope de la tabla, `TOPE_METAS` y `TOPE_CIERRES`— en
  vez de llegar hasta `getLastRow()`. La prueba se puede escribir en Node tal
  como está el arnés, sin tocarlo: **instalar() dos veces seguidas tiene que
  dejar el libro igual que una**. El libro de mentira guarda lo que le
  escriben, así que la segunda pasada ve las filas de resumen igual que Sheets.
