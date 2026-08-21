# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

App personal de gastos para dos personas. Es una PWA que escribe en una hoja de
Google Sheets a través de un Apps Script. **El código y los comentarios van en
español**, y los comentarios explican el *porqué* de lo no evidente, no el qué.

## Restricciones que no se negocian

Sin build, sin frameworks, sin dependencias, sin npm, sin CDN. Son archivos
estáticos servidos tal cual por GitHub Pages. Antes de añadir cualquier cosa:
mira si ya existe en el repositorio, si lo hace la plataforma, y si de verdad
hace falta. Las skills de `ponytail` (en `.claude/skills/`) están para eso.

## Comandos

```sh
python3 -m http.server 8000          # servir la app sin backend

sh pruebas/todas.sh                  # las quince, cada una con su servidor

node pruebas/servidor-falso.mjs &    # backend de mentira + la app, en el 8300
node pruebas/calendario-chileno.mjs  # la regla de la tarjeta y los topes
node pruebas/mes-recien-empezado.mjs # un mes vacío no ha ido mal todavía
node pruebas/alto-700.mjs            # nada se sale en un móvil de verdad
node pruebas/botones.mjs             # nada de lo pulsable puede estar muerto
node pruebas/hoja-y-vestido.mjs      # el vestido cae donde caen los datos
node pruebas/escribir-meta.mjs       # repintar no puede cerrarte el teclado
node pruebas/no-saltar-arriba.mjs    # ni devolverte al principio de la pantalla
node pruebas/vaciar-el-libro.mjs     # vaciar se lleva los datos, no las fórmulas
node pruebas/libro-sin-migrar.mjs    # las hojas se leen por su cabecera

node pruebas/servidor-falso.mjs --rechaza   # simula un despliegue viejo
node pruebas/vaciar-telefono.mjs            # vaciar el teléfono no borra la conexión
```

No hay marco de pruebas: son archivos de Node que se ejecutan a mano y salen con
código distinto de cero si algo falla. Playwright vive en
`/opt/node22/lib/node_modules/playwright`, fuera del proyecto.

Cada prueba quiere un arranque distinto del servidor falso, y un servidor
heredado de la anterior trae su libro ya tocado —el mes cerrado, los movimientos
borrados— y hace fallar a la siguiente por un motivo que no es el suyo. Para eso
está `todas.sh`: espera a que el puerto quede libre entre prueba y prueba.

## Arquitectura

Módulos IIFE que dejan un global cada uno. **El orden de `<script>` en
`index.html` es el orden de dependencia**, no alfabético: `config` → `FMT` →
`NUCLEO` → `VISTA` → `ESTADO` → pantallas → `APP`. Un archivo nuevo hay que
añadirlo ahí *y* a la lista `ESENCIALES` de `sw.js`.

| Global | Archivo | Responsabilidad |
|---|---|---|
| `FMT` | `formato.js` | Funciones puras de formato y calendario. No toca DOM ni estado. |
| `NUCLEO` | `nucleo.js` | IndexedDB, la cola y la única función que habla con el backend. |
| `VISTA` | `vista.js` | Construir nodos, navegar entre pantallas, barra de deshacer, tema. |
| `ESTADO` | `estado.js` | El modelo y todo el cálculo del mes. |
| `MES`, `FIJOS`, `AHORRO`, `ANOTAR`, `AJUSTES` | una pantalla, un archivo | |
| `APP` | `app.js` | Arranque y pegamento. Sin lógica de negocio. |

Tres cosas que hay que tener en la cabeza:

**`nucleo.js` lo cargan dos mundos.** La página con `<script>` y el service
worker con `importScripts`. No puede tocar el DOM ni `window`: un
`document.getElementById` ahí dentro revienta el service worker al importarlo.

**No hay renderizado incremental.** Cada pantalla se repinta entera cuando algo
cambia. Con listas de decenas de filas sale más barato que llevar la cuenta, y
no se puede desincronizar.

**`datos` y `ajustes` no se mezclan.** `datos` es lo que hay en la hoja (lo trae
la acción `mes`, se cachea en IndexedDB). `ajustes` es de *este* teléfono:
conexión, quién anota aquí, tema. El token vive solo ahí, nunca en la hoja ni en
el repositorio.

**Un movimiento se cuenta en el mes que lo PAGA, nunca en el de su fecha.** Una
compra con tarjeta hecha desde el día de cobro de esa persona se paga el mes
siguiente; un sueldo puede declarar que se usa el mes que viene. Eso es
`ESTADO.mesImputado`, y por ahí pasa `movimientosDe`, el resumen del mes, el
cierre y las fórmulas del Panel. Filtrar por la fecha en cualquier sitio nuevo
vuelve a descuadrar el mes en silencio.

**El techo del mes es lo que entra**, no un presupuesto escrito a mano. `Config!B4`
es el *ahorro esperado*: el colchón que se aparta antes de repartir, del que sale
el tope proporcional de cada persona.

## La cola

Todo lo que escribe pasa por `NUCLEO.encolar`, que espera `MS_DESHACER` (7 s)
antes de salir — la misma ventana que la barra de deshacer, así que mientras el
aviso está en pantalla nada ha viajado aún. Los fallos se reintentan con backoff
exponencial; un reintento a mano (`vaciarCola({aMano:true})`) se salta los dos
temporizadores. El service worker vacía la cola con la app cerrada vía Background
Sync.

Las filas de un mismo grupo viajan en la misma petición: medio reparto escrito
descuadraría el ahorro.

## El backend

`apps-script/Codigo.gs` **no se despliega desde el repositorio**: se pega a mano
en el editor de Apps Script. El contrato completo de la hoja está en el README.

`apps-script/vestir-hoja.gs` es un archivo aparte del mismo proyecto y solo pone
formato: no lee ni escribe datos. Toma las filas y los topes de las constantes
de `Codigo.gs` —comparten ámbito global— en vez de llevarlos escritos a mano.
Con rangos fijos, cambiar `TOPE_CATEGORIAS` deja el degradado sobre la columna
de al lado y la regla roja apuntando a una celda que no es, y eso **no da
ningún error**: sale un libro con buena pinta y mal vestido. Lo vigila
`pruebas/hoja-y-vestido.mjs`.

Acciones: `mes` (una lectura con todo), `movimientos`, `movimiento-edita`,
`movimiento-baja`, `fijo`, `fijo-baja`, `fijo-cargo`, `cerrar-mes`, `reparto`,
`metas`, `config`.

Reglas del transporte, todas por un motivo: `Content-Type: text/plain` (Apps
Script no contesta al preflight de CORS), **las lecturas también van por POST**
(el `doGet` redirige a `script.googleusercontent.com` y ese salto se lleva las
cabeceras CORS), y deduplicación por `uuid` contra la hoja `_uuids`.

`vaciar()` se ejecuta a mano desde el editor, igual que `instalar()`, y ninguna
acción del backend llega hasta ella: nada que se pueda tocar desde el teléfono
borra un año de gastos. Deja el libro sin datos pero con la misma forma —hace
antes una copia en Drive— y respeta las listas, Config y las columnas de
fórmula, que están intercaladas entre las de datos. Lo vigila
`pruebas/vaciar-el-libro.mjs`, porque limpiar un rango de más no da ningún
error: se lleva las fórmulas y no se nota hasta el primer cierre de mes.

`tareaDiaria` es un disparador que corre de madrugada: cobra los fijos que tocan
ese día y, el día 1, cierra el mes anterior. Es el "se cierra solo" que promete
la app; una PWA no se despierta sola.

## Trampas que ya han costado tiempo

**Guardar en el editor de Apps Script no despliega nada.** La URL `/exec` sirve
la última *implementación*. Hay que editar la implementación y elegir **versión
nueva**. Síntoma: la app manda `accion: 'mes'`, el backend viejo no la conoce y
contesta `Petición sin movimientos`.

**Leer una hoja por posición fija se rompe en silencio.** Si el contrato de
columnas cambia y el lector sigue contando, devuelve la columna de al lado, que
también tiene un valor válido: no lanza nada. Listas pasó de ocho columnas a
diez y las cuentas salieron llamándose `true` —era la casilla Activa— y las
categorías «Común» y «Personal» —era el reparto—. Y `instalar()` lee las listas
y las reescribe, así que escribió esa basura en la hoja y se llevó por delante
los nombres de verdad. Los lectores preguntan a la cabecera (`columnasPor`, y
`columnasDeListas` para Listas, que tiene dos columnas ACTIVA). Lo vigila
`pruebas/libro-sin-migrar.mjs`, que ejecuta el backend en Node contra libros de
las dos formas.

**Apps Script agrupa las escrituras.** Una excepción salta en el siguiente
`flush()`, lejos de su causa, y un `try/catch` alrededor de la llamada no la
atrapa. Si un lote falla se pierde todo lo que iba detrás.

**`copy()` deja obsoleto el libro desde el que lo llamaste.** `getSheetByName`
sigue devolviendo una hoja, pero es una hoja cuyo id ya no resuelve, y la
primera operación revienta con «Sheet 196448985 not found». Le pasó a `vaciar()`
en la primera limpieza, con la copia de seguridad ya hecha. Después de copiar
hay que volver a pedir el libro con `SpreadsheetApp.openById`.

**Nada de diálogos modales en el backend.** `Ui.alert()` suspende el script
hasta que alguien pulsa Aceptar, y desde el editor con la hoja cerrada no lo
pulsa nadie: la ejecución muere a los seis minutos. Usa `console.log` (sale al
registro al instante, sobrevive a un timeout) o `toast()`.

**Borrar una hoja deja `#REF!`** en toda fórmula que la citaba, y recrearla con
el mismo nombre no las recupera. En `instalar()` el orden de escritura es el de
las dependencias: Metas y Cierres citan Reparto, y Config cita Movimientos,
Fijos, Metas y Cierres.

**Las fechas se construyen a mediodía.** `new Date(a,m,d)` da medianoche en la
zona del *script* y la celda se lee en la zona de la *hoja*; si no coinciden,
todo el libro aparece corrido un día.

**Escribe por bloques, no celda a celda.** Cada `getRange().setValue()` cruza al
servicio de Sheets. `instalar()` pasó de 868 llamadas a 207 así.

**Subir `CACHE` en `sw.js` en cada despliegue** que toque HTML, CSS o JS. Es el
único mecanismo de actualización que hay: los archivos entran todos juntos o
ninguno, para que nunca convivan dos versiones. El precio es que hay que abrir
la app **dos veces** tras desplegar.

## Al terminar un cambio

Ejecuta las tres pruebas, sube la versión de `sw.js` si tocaste la app, y ten en
cuenta que `main` se fusiona en aplastado: si una rama sobrevive a su PR, hay que
rehacerla sobre `origin/main` con `cherry-pick` en vez de fusionar.
