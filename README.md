# Gastos

PWA personal para anotar gastos e ingresos en menos de 10 segundos y mandarlos a
una hoja de Google Sheets.

Sin build step, sin frameworks, sin dependencias. Son archivos estáticos: se
sirven tal cual desde GitHub Pages o desde `python3 -m http.server`.

---

## Estado

| Fase | Qué incluye | Estado |
|---|---|---|
| 1 | Captura completa en local con `MODO_PRUEBA` | ✅ hecha |
| 2 | Apps Script, token y envío real | ✅ hecha |
| 3 | Offline, cola en IndexedDB y reintentos | ✅ hecha |
| 4 | Pantalla de resumen y pulido | ✅ hecha |

---

## Despliegue, en orden

Hazlo una vez y no vuelves a tocarlo. Tardas unos diez minutos.

### 1. La hoja de cálculo

Abre la hoja de Google Sheets que alimenta tu Excel, o crea una nueva. No hace
falta que crees las pestañas ni las cabeceras a mano: lo hace el script en el
paso 3.

Lo que va a crear:

- Una hoja **`Movimientos`** con estas seis columnas, en este orden:

  | Fecha | Concepto | Importe | Cuenta | Tipo | Categoría | Usuario |
  |---|---|---|---|---|---|---|
  | `yyyy-mm-dd` | texto libre | número positivo | texto | `Ingreso` o `Gasto` | texto | texto |

- Una hoja **`Año`** y doce hojas de mes, **`Enero`** a **`Diciembre`**:

  | Hoja | Qué lleva |
  |---|---|
  | `Año` | Gasto de cada persona en cada mes, con el total del año y un gráfico de barras |
  | `Enero`…`Diciembre` | Ingresos, gastos y lo que queda; el desglose por categoría de cada persona; y tres tortas: una por persona y otra del conjunto |

  Son fórmulas, no datos volcados: se recalculan solas con cada fila que entra.
  No escribas nada en ellas.

  **Miran siempre el año en curso.** El 1 de enero las trece se ponen a cero y
  empiezan el año nuevo. Lo anterior no se pierde —sigue entero en
  `Movimientos`—, pero deja de verse en los paneles; si algún año quieres
  conservarlo a la vista, duplica las hojas antes de que cambie el año.

- Una hoja **`Suscripciones`** con los gastos recurrentes dados de alta. Ver
  abajo.

- Una hoja **`_uuids`**, oculta, donde se apuntan los identificadores de cada
  movimiento para rechazar duplicados. No la borres ni la toques.

> El identificador va en una hoja aparte y no en una séptima columna oculta de
> `Movimientos` a propósito: una columna de más ensancha el rango que lee Power
> Query y puede colarse en la tabla del Excel.

### 2. Pegar el Apps Script

1. En la hoja: **Extensiones → Apps Script**.
2. Borra lo que haya en `Código.gs` y pega entero el contenido de
   [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
3. Guarda (💾).

### 3. Crear las hojas

En el editor de Apps Script, elige la función **`instalar`** en el desplegable
de arriba y pulsa **▷ Ejecutar**.

La primera vez Google te pedirá permisos: *Revisar permisos* → tu cuenta →
*Configuración avanzada* → *Ir a (nombre del proyecto)* → *Permitir*. La
pantalla de "Google no ha verificado esta aplicación" es normal: la aplicación
sin verificar eres tú.

Al terminar, vuelve a la hoja y comprueba que existe la pestaña `Movimientos`
con sus cabeceras.

### 4. Desplegar como aplicación web

1. **Implementar → Nueva implementación**.
2. Engranaje ⚙ → **Aplicación web**.
3. *Ejecutar como*: **Yo**.
4. *Quién tiene acceso*: **Cualquier persona**.
5. **Implementar**, y copia la **URL de la aplicación web**.

Esa URL acaba en `/exec`. Es la que necesitas.

> Cuidado con dos URLs que se parecen y no valen: la que acaba en `/dev` (solo
> funciona con tu sesión iniciada) y la de la barra de direcciones del editor.

### 5. El token

El token sustituye a la autenticación: sin él, cualquiera que diera con tu URL
podría escribir en tu hoja.

1. Abre la app (ver más abajo), toca el icono de barras de la cabecera y,
   abajo del resumen, **Ajustes**.
2. Pulsa **Generar un token nuevo** y **copia** lo que sale.
3. En el editor de Apps Script: **Configuración del proyecto** (el engranaje de
   la izquierda) → abajo del todo, **Propiedades del script** → *Añadir
   propiedad*.
   - Propiedad: `TOKEN`
   - Valor: lo que copiaste
4. **Guardar propiedades del script**.

> Si cambias el token, hay que cambiarlo en los dos sitios. Si no coinciden, el
> script rechaza todo y no escribe nada.

### 6. Configurar la app

De vuelta en Ajustes, en el móvil o en el ordenador:

1. Pega la URL del paso 4 en **URL del Apps Script**.
2. El token del paso 5 ya debería estar en su campo.
3. Pulsa **Probar conexión**. Tiene que decir "Conectado".
4. **Guardar**.

Estos dos valores se quedan guardados en ese dispositivo y no salen de él. Si
usas la app en el móvil y en el ordenador, hay que configurar los dos.

**Si "Probar conexión" falla**, el mensaje te dice por dónde va:

| Mensaje | Qué mirar |
|---|---|
| `Token no válido` | El token de la app y el de las Propiedades del Script no coinciden |
| `El endpoint no devuelve JSON` | El despliegue no es "Cualquier persona", o la URL acaba en `/dev` |
| `Failed to fetch` | La URL está mal escrita, no hay red, o el despliegue pide iniciar sesión |
| `No existe la hoja Movimientos` | Falta ejecutar `instalar()` (paso 3) |

Para distinguir un `Failed to fetch` de un problema de despliegue: **pega la URL
del `/exec` en el navegador con `?token=TU_TOKEN` al final**. Si sale un JSON, el
despliegue está bien. Si te pide iniciar sesión, el acceso no quedó en
"Cualquier persona" — corrígelo y vuelve a implementar **con versión nueva**, que
si no sigue publicada la anterior.

### 7. Tus cuentas y categorías

Edita [`config.js`](config.js) y sustituye las listas de ejemplo por las tuyas.

> Tienen que coincidir **palabra por palabra** con las listas de la hoja de
> configuración de tu Excel. Si aquí pone "Tarjeta de crédito" y allí "Tarjeta
> crédito", los SUMIFS del panel dan cero y no salta ningún error en ninguna
> parte.

`ENDPOINT` y `TOKEN` se quedan vacíos en ese archivo a propósito: GitHub Pages
sirve páginas públicas y el token sería legible por cualquiera.

---

## Servir la app

### GitHub Pages

**Settings → Pages → Deploy from a branch → `main` / `(root)`**. La URL queda en
`https://<tu-usuario>.github.io/<repositorio>/`. Es HTTPS, así que el service
worker y la instalación funcionan.

Cada vez que se fusiona un cambio en `main`, Pages lo republica en un par de
minutos.

### En local

```bash
python3 -m http.server 8000
```

`http://localhost:8000` en el ordenador. `localhost` cuenta como origen seguro,
así que el service worker se registra y puedes simular el modo avión desde
DevTools → Network → Offline.

Para verlo en el móvil sin desplegar: cable USB, `chrome://inspect` en el
ordenador, *Port forwarding* 8000 → `localhost:8000`, y en el móvil entras a
`http://localhost:8000`.

> No sirve entrar desde el móvil a `http://192.168.x.x:8000`. Chrome considera
> esa IP un origen inseguro y no registra el service worker ni ofrece instalar.

### Instalar en Android

1. Abre la URL de Pages en **Chrome**.
2. Menú ⋮ → **Instalar aplicación**.
3. Ábrela desde el icono. No debe verse la barra de direcciones.

Si pone "Añadir acceso directo" en vez de "Instalar", Chrome no ha detectado el
manifest o el service worker: recarga un par de veces y mira DevTools →
Application.

---

## Cómo funciona la captura

Pasos encadenados, cada uno avanza solo al elegir:

1. **Importe** — teclado numérico, foco automático. Acepta coma o punto. Debajo,
   dos botones que además **eligen la rama**: `Frecuentes` (se repite solo) o
   `Puntuales` (solo esta vez). Enter equivale a `Puntuales`.
2. **Tipo** — Gasto / Ingreso. Un toque.
3. **Categoría** — rejilla, distinta según la rama y el tipo. Un toque.
4. **Cuenta** — rejilla. Un toque. La última usada aparece resaltada, pero el
   paso no se salta.
5. **Concepto** — opcional. "Guardar" o Enter.

Total en un puntual: **teclear el importe + 5 toques**. Los frecuentes meten tres
preguntas más entre la categoría y la cuenta —cada cuánto, qué día y hasta
cuándo—, y a cambio no vuelves a anotarlo nunca.

### Frecuentes y puntuales

La pregunta va en el primer paso, con el importe recién tecleado y el pulgar ya
abajo, porque es la que cambia lo que ocurre después:

| | Puntual | Frecuente |
|---|---|---|
| Qué es | una fila | una regla |
| Qué escribe | un movimiento | uno cada mes, trimestre o año |
| Dónde vive | `Movimientos` | `Suscripciones`, y de ahí a `Movimientos` |
| Categorías | Alimentación, Restaurantes… | Suscripciones, Arriendo, Suministros… |

Los dos admiten gasto e ingreso: la nómina se da de alta una vez como ingreso
frecuente y aparece sola cada mes.

Preguntarlo al principio evita el error caro —anotar el alquiler como gasto
suelto y tener que repetirlo los doce meses— sin costar ningún toque de más: los
dos botones ocupan el sitio del antiguo "Siguiente".

La fecha se asume hoy y se cambia tocándola en la cabecera. "Atrás" está visible
en todos los pasos menos el primero.

Al guardar hay 5 segundos para deshacer. Si sales de la app durante esa ventana,
el movimiento se envía en vez de perderse.

### Resumen del mes

El icono de barras de la cabecera abre el resumen: ingresos, gastos y ahorro del
mes en curso, y los diez últimos movimientos. Nunca se pone por delante de la
captura — la app siempre arranca en el paso del importe.

Los traspasos no cuentan en los totales, y en la lista se distingue cuál sale y
cuál entra: sin eso, las dos filas de una misma transferencia se leen idénticas.

**Sin conexión enseña lo último que recibió, y lo dice**: *"Sin conexión. Datos
de hace 2 h, puede que desactualizados."* Un resumen viejo sin avisar es peor
que no enseñar nada, porque se toman decisiones con él.

Si hay movimientos en la cola aparece un botón para reintentar el envío, y desde
aquí se entra a los Ajustes.

### Sin cobertura

**Un movimiento anotado no se pierde nunca.** Al pulsar Guardar se escribe en
IndexedDB *antes* de intentar nada más: aunque se apague el móvil en el instante
siguiente, la fila sigue ahí al volver a abrir la app.

Si no hay red, el movimiento se queda en la cola y aparece un **contador ámbar
en la cabecera** con cuántos quedan por enviar. Tocarlo fuerza un intento.

La cola se vacía sola en cuanto hay conexión, por cuatro caminos:

| Cuándo | Qué pasa |
|---|---|
| Al arrancar la app | Se intenta lo que quedara de la sesión anterior |
| Al volver la red (`online`) | Se intenta 2 segundos después |
| Cada minuto, con la app abierta | Se intenta lo que ya haya cumplido su espera |
| Al recuperar la red **con la app cerrada** | Background Sync despierta al service worker |

Los dos segundos de espera tras `online` no son un capricho: ese evento salta en
cuanto hay interfaz de red, que saliendo del metro es antes de que haya conexión
de verdad.

Tras un fallo, cada movimiento espera cada vez más antes del siguiente intento
—5, 10, 20 segundos… hasta 5 minutos— para no gastar batería reintentando sin
cobertura. Esa espera **se ignora** cuando vuelve la red o cuando fuerzas tú el
envío: existe para no machacar, no para retrasar.

> El último de esos cuatro caminos, Background Sync, solo lo tiene Chromium. En
> Firefox la cola se vacía igual, pero hay que abrir la app.

### Quién gasta

La columna `Usuario` **no se toca desde la captura**. Cada teléfono se configura
una vez en Ajustes —Gonzalo en el suyo, Camila en el suyo— y a partir de ahí se
estampa solo en cada movimiento, hasta que se cambie en Ajustes.

Es deliberado: la app existe para no tener que decidir nada más que el importe, y
una decisión que se repite en cada gasto es exactamente lo que hay que quitar de
en medio. Si un día anotas algo del otro, se corrige en la hoja, que tiene lista
desplegable en esa columna.

La lista de usuarios está en `config.js` y **tiene que decir lo mismo** que la
constante `USUARIOS` de `Codigo.gs`: de ahí salen las columnas del panel.

> Al cambiar los nombres, el que cada teléfono tenga guardado deja de existir. La
> app lo detecta al arrancar y lo reemplaza emparejando por el nombre de pila;
> `instalar()` hace lo propio con las filas ya escritas en la hoja. Sin eso, los
> movimientos se seguirían escribiendo con un usuario que ya no está en la lista
> y el panel los sumaría como cero sin dar ningún error.

### Movimientos frecuentes

Al elegir `Frecuentes` en el primer paso, la app pregunta tres cosas más: **cada
cuánto se repite** (mensual, trimestral o anual), **qué día del mes** cae, y
**durante cuánto tiempo** (de 3 meses a 3 años, o indefinida).

El día se pregunta —en vez de deducirlo de la fecha de la cabecera, que es la de
hoy— porque dar de alta el alquiler un día 17 lo dejaba cobrándose todos los 17,
y para corregirlo había que acordarse de tocar la fecha *antes* de empezar. La
pregunta cambia según el tipo: *¿Qué día se paga?* en un gasto, *¿Qué día se
cobra?* en un ingreso. Viene sugerido el día de la fecha elegida.

> El 31 vale para todos los meses: las fechas se recortan al último día del mes
> que toque —31 ene, 28 feb, 31 mar— y se calculan siempre desde el inicio, así
> que no se desvían con los años.

Si el día elegido **ya pasó** este mes, el primer cobro se escribe en el acto:
si hoy es 17 y el alquiler se paga el 3, el de este mes ya lo has pagado. Si aún
no ha llegado, espera al disparador.

Lo que se guarda **no es un movimiento**, es una definición en la hoja
`Suscripciones`. Un disparador diario del Apps Script escribe el cobro el día
que toca, y el primero se escribe en el acto al darla de alta.

La columna `Tipo` de esa hoja decide el signo de cada cobro, así que un ingreso
frecuente —la nómina— escribe filas de `Ingreso` y no de `Gasto`. Vacía se
interpreta como `Gasto`, que es lo que eran todas antes de que existiera.

Se hace así y no escribiendo todos los cobros por adelantado por dos motivos:
con duración indefinida no hay un número de filas que escribir, y si cancelas la
suscripción te quedarían meses de gastos fantasma que borrar a mano.

**Para cancelar un frecuente**, desmarca su casilla `Activa` en la hoja. Deja
de cobrar a partir de ese momento y los cobros ya escritos se quedan como están,
que es lo correcto: ocurrieron.

Cada cobro lleva un identificador derivado de la suscripción y de su fecha, así
que el disparador puede ejecutarse mil veces sin duplicar nada.

> Las fechas se calculan siempre desde el día de inicio, nunca sumando un mes al
> cobro anterior. Encadenar sumas desvía la fecha —31 de enero pasa a 28 de
> febrero y de ahí a 28 de marzo— y a los dos años estarías cobrando el día que
> no es.

### Traspasos entre cuentas

**La app ya no los captura.** Existieron —un tercer botón junto a Gasto e
Ingreso— y se quitaron a petición: en el uso real no aparecían, y el botón
ocupaba sitio en el paso que más se toca.

Lo que sí sigue en pie es el tratamiento de la categoría `Traspaso`, para las
filas que escribas a mano en la hoja. Mover 200 € de la corriente al ahorro no
es un gasto ni un ingreso: ese dinero no ha entrado ni salido de tu patrimonio,
solo ha cambiado de sitio, y contarlo como gasto te haría el mes 200 € más caro
de lo que fue. Por eso los totales del mes y las fórmulas del panel descuentan
esa categoría, y el resumen la pinta sin signo.

> Si montas el panel en el Excel, acuérdate de excluir la categoría `Traspaso`
> de los SUMIFS de ingresos y gastos. Para los saldos por cuenta, en cambio,
> tiene que contar.

---

## Detalles que conviene no romper

**El `Content-Type` del envío es `text/plain`, y es a propósito.** Apps Script no
contesta a las peticiones OPTIONS de preflight. Usar `application/json` haría que
el navegador mandara ese preflight, y el envío fallaría con un error de CORS que
no dice nada útil. Está comentado en [`js/api.js`](js/api.js).

**Las lecturas también van por POST, aunque suene al revés.** El `doGet` existe y
funciona si pegas la URL en el navegador con `?token=…`, pero un `fetch` contra
él desde la app muere con `Failed to fetch`: Apps Script responde con una
redirección a `script.googleusercontent.com` y ese salto se lleva por delante las
cabeceras de CORS. Por eso el resumen se pide con un POST y `accion: 'resumen'`,
que al ser petición simple sí llega. `doGet` se queda como herramienta de
diagnóstico manual.

**El importe siempre viaja positivo.** El signo lo da la columna Tipo. El campo
de importe filtra el signo menos según escribes, así que no hay forma de meter
un negativo.

**Los duplicados se rechazan por UUID.** Cada movimiento lleva un identificador
generado en el móvil. Si el mismo llega dos veces, el script responde que todo
va bien pero escribe una sola fila. Sin esto, un reintento duplicaría un gasto.

**Hay que subir la versión de caché en cada despliegue.** En [`sw.js`](sw.js),
la constante `CACHE` (`gastos-v3`, `gastos-v4`…). Es el único mecanismo de
actualización que tiene la app: mientras esa cadena no cambie, los móviles que
ya la tengan instalada seguirán con la versión que tienen, aunque Pages sirva
otra cosa.

Los archivos se cachean todos juntos en el `install` y **no se refrescan por
separado**. Esto es deliberado y viene de un fallo real: la versión anterior
refrescaba cada archivo por su cuenta en segundo plano, y la app acabó con el
`index.html` de una versión y el `app.js` de otra — mostraba el botón de ajustes
pero ejecutaba código que no sabía qué hacer con él. O toda la versión vieja, o
toda la nueva; nunca una mezcla.

Al detectar una versión nueva, la app se recarga sola. Si estás a media captura
no lo hace: avisa con un aviso y espera al siguiente arranque, porque recargar
te borraría el importe tecleado.

---

## Regenerar los iconos

```bash
python3 iconos/generar-iconos.py
```

Escribe `icono-192.png` e `icono-512.png` sin dependencias externas. Si cambias
el dibujo hay que tocar `icono.svg` y las constantes del script a la vez.

---

## Estructura

```
index.html              una sola pantalla
config.js               cuentas, categorías, moneda
config.ejemplo.js       documentación del formato
sw.js                   service worker
manifest.json           instalación en Android
css/estilos.css
js/nucleo.js            IndexedDB y envío. Lo comparten la página y el sw
js/ui.js                DOM, transiciones, toast
js/api.js               lo que solo necesita la página
js/cola.js              reintentos, indicador de pendientes
js/ajustes.js           endpoint, token y su pantalla
js/resumen.js           totales del mes y últimos movimientos
js/app.js               máquina de estados de los pasos
iconos/                 SVG, PNG y el generador
apps-script/Codigo.gs   backend: doPost, doGet e instalar()
```
