# Gastos

App personal para llevar el mes entre dos: qué queda, qué falta por salir, qué
se repite todos los meses y cuánto se está ahorrando. Lo escribe todo en una
hoja de Google Sheets, que es la base de datos de verdad.

Sin build step, sin frameworks, sin dependencias. Son archivos estáticos: se
sirven tal cual desde GitHub Pages o desde `python3 -m http.server`.

---

## Qué hay dentro

Cinco pestañas y un botón.

| Pestaña | Para qué |
|---|---|
| **Mes** | El saldo disponible, cómo se reparte el gasto entre los dos y qué fijos faltan por cobrarse. También los meses ya cerrados, en modo lectura. |
| **Historial** | Lo anotado a mano, agrupado por día con el subtotal del día, con buscador y filtro por persona. Tocar una fila abre su detalle. |
| **Fijos** | Las reglas que escriben solas: arriendo, suministros, suscripciones, el sueldo. Con lo que cae en los próximos cuatro meses. |
| **Ahorro** | Lo acumulado en los meses cerrados, las metas con su avance, y lo que queda sin asignar. |
| **Ajustes** | Tema, plan del mes, avisos, las listas editables y el cierre del mes. |

**Anotar** es el bloque negro a la derecha de la barra: teclado propio, sin coma
decimal, con las categorías a un toque. El mismo teclado sirve para poner el
plan del mes, el límite de aviso, el objetivo de una meta o cuánto va a esa meta
en un reparto.

La moneda es el peso chileno: enteros, miles con punto, símbolo delante.

---

## Despliegue, en orden

Hazlo una vez y no vuelves a tocarlo. Tardas unos diez minutos.

### 1. Pegar el Apps Script

1. En la hoja de cálculo: **Extensiones → Apps Script**.
2. Borra lo que haya en `Código.gs` y pega entero el contenido de
   [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
3. Guarda.

### 2. El token

En **Configuración del proyecto → Propiedades del script**, añade una propiedad
llamada `TOKEN` con una cadena larga y aleatoria. Es la única contraseña entre
la app y la hoja.

No lo pongas en `config.js`: GitHub Pages sirve el repositorio tal cual y
cualquiera podría leerlo. Tampoco en la hoja, que se comparte. Vive solo en las
propiedades del script y en el IndexedDB de cada teléfono.

### 3. Ejecutar `instalar()`

En el editor de Apps Script, elige `instalar` y dale a ejecutar. Te pedirá
permisos la primera vez.

Tarda alrededor de **medio minuto**, y el registro de ejecución va diciendo por
dónde va:

```
leído el libro · 1853 ms
retirados Panel y Año · 2531 ms
Listas · 3608 ms
…
terminado · 30137 ms
```

Ese cronómetro está ahí porque `instalar()` se murió tres veces por tiempo y el
registro solo decía que se había muerto. Si vuelve a pasar, la última línea es
el sitio.

No sale ningún diálogo: el resumen va al registro y, si tienes la hoja abierta,
también como aviso flotante. **Un diálogo modal no puede estar aquí**: `alert()`
suspende el script hasta que alguien pulsa Aceptar, y ejecutando desde el editor
con la pestaña de la hoja cerrada no lo pulsa nadie. El trabajo terminaba en
treinta segundos y la ejecución se quedaba parada hasta morir a los seis
minutos.

Deja el libro con diez pestañas:

| Pestaña | Quién escribe | Qué es |
|---|---|---|
| `Panel` | nadie | El mes en curso, con la misma jerarquía que la pantalla Mes. La única celda editable es **B4**: el primer día del mes que quieres mirar. |
| `Año` | nadie | Doce filas, una por mes, más el gasto por persona. De aquí leen los dos gráficos. |
| `Movimientos` | la app | Una fila por apunte. Es la tabla que crece. |
| `Fijos` | la app | Una fila por regla. |
| `Metas` | la app | A qué se destina el ahorro. |
| `Cierres` | la app | Una fila por mes cerrado, con su Total Ahorrado. |
| `Reparto` | la app | Cada asignación de ahorro a una meta, una línea. |
| `Listas` | la app | Personas, cuentas y categorías. Se editan desde Ajustes. |
| `Config` | la app | Ahorro esperado, límite de aviso y qué avisos están activos. |
| `_uuids` | la app | Oculta. Los identificadores ya recibidos, para no escribir dos veces lo mismo. |

`instalar()` **migra y no borra**. Si el libro venía del formato anterior:

- los movimientos conservan fecha, importe, cuenta, tipo, categoría y persona;
  lo que era `Concepto` pasa a `Descripción`, que es lo que siempre fue;
- el reparto (común o personal) de cada fila se deduce de su categoría;
- las `Suscripciones` pasan a `Fijos`: la frecuencia en palabras se convierte a
  meses y el "hasta" en fecha se convierte a cuotas;
- las pestañas `Suscripciones` y `Enero`…`Diciembre` se retiran, ya migradas.

Se puede volver a ejecutar las veces que haga falta: primero se lee todo, luego
se reescribe. No duplica nada.

### 4. Desplegar como aplicación web

**Implementar → Nueva implementación → Aplicación web**:

- Ejecutar como: **yo**
- Quién tiene acceso: **Cualquier persona**

Copia la URL, la que acaba en `/exec`.

> "Cualquier persona" suena peor de lo que es: sin el token, la Web App contesta
> `Token no válido` y nada más. Es lo que permite que la app hable con la hoja
> sin obligar a iniciar sesión en Google desde el móvil.

**Cada vez que cambies `Codigo.gs` hay que crear una implementación nueva o
editar la existente.** Guardar en el editor no basta: la URL sigue sirviendo el
código del último despliegue. Es la causa más frecuente de "pero si ya lo
arreglé".

### 5. Servir la app

GitHub Pages, rama `main`, carpeta raíz. O en local:

```sh
python3 -m http.server 8000
```

### 6. Conectar el teléfono

Al abrirla por primera vez pide la URL del script y el token, comprueba la
conexión y sigue con dos pasos más: quiénes anotan y qué fijos ya hay en la
hoja. Se puede repetir desde **Ajustes → Conexión con la hoja**.

Para instalarla: Chrome → menú → **Añadir a pantalla de inicio**. Desde ahí se
abre a pantalla completa y con su propio icono, y el icono lleva un acceso
directo a **Anotar** que abre el teclado sin pasar por el mes.

---

## El contrato de la hoja

Si cambias un nombre de columna aquí, cámbialo también en `Codigo.gs`.

**`Movimientos`** — cabecera en la fila 1.

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| Fecha | Tipo | Categoría | Descripción | Importe | Cuenta | Persona | Reparto | Se usa en | Origen | UUID |

`Origen` es `app` si lo tecleó una persona y `fijo` si lo generó una regla.
`Reparto` es `Común` o `Personal`.

**`Se usa en` es la columna que ordena el libro entero.** Un movimiento tiene
dos fechas y confundirlas es el error clásico: el día en que ocurrió y el mes
que lo paga. Compras el 15 de agosto con la tarjeta y la factura llega el 5 de
septiembre: el gasto es de septiembre. Un sueldo cobrado el 30 de julio marcado
«mes siguiente» se gasta en agosto.

| Caso | Fecha | Se usa en |
|---|---|---|
| Gasto normal | 15/08 | `2026-08` |
| Compra con crédito el 15/08, día de cobro 5 | 15/08 | `2026-09` |
| Sueldo cobrado el 30/07 marcado «mes siguiente» | 30/07 | `2026-08` |

**Todas las fórmulas de `Panel` y de `Año` filtran por esa columna, nunca por la
fecha**: filtrando por la fecha, la factura aparecería en el mes en el que no la
vas a pagar. `Config!B16` vigila que no quede ninguna fila sin ella y tiene que
marcar 0.

La calcula el backend, en un solo sitio: si la calculara cada teléfono, dos
listas desincronizadas escribirían meses distintos para la misma compra.

**`Fijos`** — cabecera en la fila 1.

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| UUID | Tipo | Concepto | Importe | Día | Cada (meses) | Cuotas | Restantes |

| I | J | K | L | M | N | O | P |
|---|---|---|---|---|---|---|---|
| Cuenta | Persona | Reparto | Se usa en | Activo | Próximo cargo | Último cargo | Mes imputado |

`Próximo cargo` **lo calcula el backend**: es la fuente de "qué cae en
septiembre". `Mes imputado` es una fórmula derivada de él y de `Se usa en`; no
la escribas. `Cuotas` vacío es indefinido.

`Se usa en` de un fijo es `mismo mes` o `mes siguiente`, y **solo lo llevan los
ingresos**: un gasto sale el día que sale.

El `Concepto` de un fijo es una categoría de la lista y no texto libre: el día
que se cobre, esa palabra se escribe en la columna `Categoría` de
`Movimientos`, y si no existe en `Listas` el panel la suma en ninguna parte.

**`Metas`**, **`Cierres`**, **`Reparto`**, **`Listas`** y **`Config`** llevan la
cabecera en la fila 4 y los datos desde la 5.

`Listas` lleva tres listas en paralelo:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Persona | Color | Día cobro TC | Cuenta | Es crédito | Activa | Categoría | Tipo | Reparto | Activa |

La columna **I** decide si un gasto de esa categoría cuenta como común: es la
regla de "el arriendo sí, la ropa no", y evita tener que contestarlo en cada
movimiento. La **E** marca qué cuentas aplazan el cargo y la **C**, con qué día
lo hace **cada persona** —no el hogar: uno puede facturar el 5 y la otra el 25.

En `Config`, **B4 es el ahorro esperado**, no un plan del mes. El techo del mes
es lo que entra; el ahorro esperado es el colchón que se aparta antes de
repartir, y de él sale el tope de cada uno:

```
gastable = entra − ahorro esperado
tope(x)  = gastable × aporta(x) / entra
```

Lo guardado en cada meta **no es un campo**: sale de sumar sus líneas en
`Reparto`. Así el ahorro siempre se puede auditar y nunca hay un total que no
cuadre con nada.

---

## Vestir el libro

`apps-script/vestir-hoja.gs` es un segundo archivo del **mismo** proyecto de
Apps Script. No toca `Codigo.gs`, no lee ni escribe datos: solo pone formato
—papel crema, cifras en Newsreader, cabeceras en tinta, degradados y las reglas
que pintan en ladrillo lo que hay que mirar—. Se puede volver a ejecutar las
veces que haga falta.

1. Apps Script → **+** (Archivos) → *Secuencia de comandos* → llámalo `Vestir`.
2. Pega el archivo entero.
3. Elige `vestirLibro` en el desplegable de funciones → **Ejecutar**.

Si tu cuenta rechaza Newsreader o IBM Plex Mono, cambia `TIPO_CIFRA` y `TIPO_UI`
arriba del archivo por `Playfair Display` y `Roboto Mono`: la proporción del
diseño se mantiene.

Lo que pinta en ladrillo es lo que no debería estar ahí: una fila de
`Movimientos` con fecha y sin `Se usa en` —que no aparece en ningún mes—, un mes
cerrado con ahorro sin repartir, alguien por encima de su tope, y los dos
controles de `Config` que tienen que dar 0.

Las filas y los topes **no van escritos a mano**: salen de las constantes de
`Codigo.gs`, que comparten ámbito global. Con rangos fijos, cambiar
`TOPE_CATEGORIAS` deja el degradado sobre la columna de al lado sin dar ningún
error, y sale un libro con buena pinta y mal vestido. `pruebas/hoja-y-vestido.mjs`
comprueba que los dos archivos hablan del mismo libro.

---

## Cómo se cobran los fijos

Un fijo no escribe filas por adelantado. El día que llega `Próximo cargo`, un
disparador diario:

1. escribe una fila en `Movimientos` con `Origen = fijo` y el UUID
   `fijo-<uuid>-<yyyy-mm>`, que es lo que evita duplicados;
2. pone `Último cargo` en hoy y adelanta `Próximo cargo` tantos meses como diga
   `Cada`;
3. si tenía cuotas, descuenta una, y al llegar a cero desactiva la regla.

Un cargo trimestral aparece **entero en su mes**, sin prorratear: el dinero sale
de golpe y el mes en que sale es el que te deja sin saldo.

El mismo disparador cierra el mes anterior la primera madrugada de cada mes. Ese
es el "se cierra solo la última noche" que promete la app: una PWA no se
despierta sola, así que quien lo hace es la hoja. También se puede cerrar a mano
desde Ajustes.

---

## Las acciones del backend

Todas por `POST` con `Content-Type: text/plain`, incluida la lectura.

| Acción | Qué hace |
|---|---|
| `mes` | Devuelve todo lo que la app necesita: config, listas, movimientos, fijos, metas y cierres |
| `movimientos` | Escribe una o varias filas |
| `movimiento-edita` · `movimiento-baja` | Corrige o borra una fila |
| `fijo` · `fijo-baja` | Alta, edición o baja de una regla |
| `fijo-cargo` | Marca un fijo como cobrado del mes, o deshace la marca |
| `cerrar-mes` | Escribe la fila de `Cierres` con lo que entró y lo que salió |
| `reparto` | Escribe las líneas de asignación del ahorro |
| `metas` | Reescribe la tabla de metas |
| `config` | Escribe el ahorro esperado, los avisos y las listas |

Tres cosas que no se pueden cambiar:

- **`Content-Type: text/plain`**, porque Apps Script no contesta al preflight
  `OPTIONS` y la petición tiene que ser "simple" para el navegador.
- **Lectura por POST**, porque un `fetch` contra `doGet` muere en la redirección
  a `script.googleusercontent.com`, que se lleva por delante las cabeceras CORS.
- **Deduplicación por UUID**, porque la cola reintenta.

---

## Cómo está hecha la app

Sin empaquetador. El orden de los `<script>` en `index.html` es el de las
dependencias.

| Archivo | Qué hace |
|---|---|
| `config.js` | La semilla: listas, frecuencias, colores. En cuanto hay hoja, manda la hoja. |
| `js/formato.js` | Funciones puras: dinero, fechas, meses. |
| `js/nucleo.js` | IndexedDB, la cola y las peticiones. **Lo importa también el service worker**, así que no puede tocar el DOM. |
| `js/vista.js` | Constructor de nodos, navegación entre pantallas y barra de deshacer. |
| `js/estado.js` | El modelo y el cálculo del mes. |
| `js/mes.js` · `fijos.js` · `ahorro.js` · `anotar.js` · `ajustes.js` | Una pantalla, un módulo. |
| `js/app.js` | Arranque, pestañas y cuándo hablar con la hoja. |

Cada pantalla se repinta entera cuando cambia algo. Con listas de decenas de
filas cuesta menos que llevar la cuenta de qué cambió, y no se puede
desincronizar, que es el error que de verdad duele.

**Toda escritura hace dos cosas**: cambia el estado en memoria para que la
pantalla responda al instante, y encola la operación. La hoja es la verdad, pero
la verdad puede tardar; la app no.

### Offline

Los apuntes van a una cola en IndexedDB y salen cuando hay red. Si el navegador
soporta Background Sync, salen incluso con la app cerrada. Un banner en Mes dice
cuántos quedan y permite reintentar a mano.

Borrar no pide confirmación: sale una barra negra a ancho completo con
**Deshacer** durante siete segundos, que son los mismos que la orden espera en
la cola. Mientras el aviso está en pantalla, la hoja todavía no se ha enterado.

### El service worker

`sw.js` cachea el esqueleto entero de una vez. `CACHE` **hay que subirlo en cada
despliegue** que toque el HTML, el CSS o el JS: es el único mecanismo de
actualización que hay.

Todos los archivos entran juntos en el `install`, con `cache: 'reload'` para
saltarse la caché HTTP del navegador. O tienes la versión entera vieja, o la
entera nueva; nunca una mezcla. El precio es que tras un despliegue hay que
abrir la app dos veces: la primera la descarga, la segunda ya la sirve.

La versión que está sirviendo se ve en **Ajustes → Versión**.

---

## Cambiar cosas

**Categorías, cuentas y personas** se editan desde Ajustes y viven en la hoja.
Lo de `config.js` es solo la semilla del primer arranque y el respaldo sin red.

**El ahorro esperado, el límite y los avisos** también viven en la hoja: son de
los dos. El tema, quién anota en este teléfono y su cuenta habitual se quedan en el
móvil.

**La moneda**: `SIMBOLO` y `DECIMALES` en `config.js`, y el formato `#,##0` en
`Codigo.gs`.

**Los colores** son variables CSS en `css/estilos.css`. El tema claro se define
entero en `:root`; el oscuro solo redefine los mismos nombres, dos veces: en
`@media (prefers-color-scheme: dark)` para quien no ha elegido nada, y en
`[data-tema="oscuro"]` para quien sí. Ninguno puede tener su única definición
dentro de uno de esos bloques.

**Las fuentes** están autoalojadas en `css/fuentes/`. No se enlazan desde Google
Fonts porque una app que se abre sin red tiene que poder pintarse entera.

---

## Empezar de cero

Para dejarlo todo sin un solo dato hay que hacer las dos mitades, y en este
orden:

**1. La hoja.** En el editor de Apps Script, elegir `vaciar` en el desplegable
de funciones y ejecutar. Se ejecuta a mano a propósito: ninguna acción del
backend llega hasta ella, así que nada que se pueda tocar desde el teléfono
borra un año de gastos.

Se van los movimientos, los fijos, las metas, los cierres, el reparto y los
uuid. Se quedan las categorías, las cuentas, las personas con su día de cobro,
el ahorro esperado y todo el formato: cabeceras, fórmulas, casillas,
desplegables y el autofiltro. Panel y Año no se tocan porque no guardan nada,
son fórmulas, y a partir de ahí darán cero.

Antes de borrar nada hace una copia del libro entero en Drive y escribe su URL
en el registro (**Ver → Registros**). Es la única operación de todo el backend
que no se puede deshacer, y una copia cuesta una llamada.

**2. El teléfono.** En **Ajustes → Este teléfono → Vaciar este teléfono**. Borra
la copia del mes y la cola de pendientes; la conexión, el token y quién anota
aquí se quedan puestos, porque si no habría que volver a pegar la URL y el token
para recuperar lo que sigue estando en la hoja.

Hace falta aunque ya hayas vaciado la hoja: un apunte que no se llegó a enviar
sigue en la cola del móvil y se escribiría en el libro recién vaciado. Por eso
mismo el botón ofrece deshacer, igual que borrar un movimiento: es lo único de
todo esto que no está en ningún otro sitio.

---

## Lo que no hace

- **No calcula quién debe a quién.** Enseña quién gastó cuánto y qué es común,
  pero no liquida. El dato está, si algún día hace falta.
- **No prorratea.** Un cargo trimestral no se reparte entre tres meses.
- **No manda notificaciones al sistema.** Los avisos se pintan dentro de la app.
- **No lee tu banco.** Todo se teclea, o lo escribe un fijo.
