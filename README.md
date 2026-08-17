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
| 3 | Offline, cola en IndexedDB y reintentos | ⬜ pendiente |
| 4 | Pantalla de resumen y pulido | ⬜ pendiente |

**Aviso de la fase 2:** todavía no hay cola. Si guardas un movimiento sin
cobertura, **se pierde** y la app te avisa con un mensaje largo diciéndolo. Eso
lo arregla la fase 3.

---

## Despliegue, en orden

Hazlo una vez y no vuelves a tocarlo. Tardas unos diez minutos.

### 1. La hoja de cálculo

Abre la hoja de Google Sheets que alimenta tu Excel, o crea una nueva. No hace
falta que crees las pestañas ni las cabeceras a mano: lo hace el script en el
paso 3.

Lo que va a crear:

- Una hoja **`Movimientos`** con estas seis columnas, en este orden:

  | Fecha | Concepto | Importe | Cuenta | Tipo | Categoría |
  |---|---|---|---|---|---|
  | `yyyy-mm-dd` | texto libre | número positivo | texto | `Ingreso` o `Gasto` | texto |

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

1. Abre la app (ver más abajo) y entra en **Ajustes** con el engranaje.
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
| `Failed to fetch` | La URL está mal escrita, o no hay red |
| `No existe la hoja Movimientos` | Falta ejecutar `instalar()` (paso 3) |

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

Cinco pasos encadenados, cada uno avanza solo al elegir:

1. **Importe** — teclado numérico, foco automático. Acepta coma o punto. Enter o
   "Siguiente".
2. **Tipo** — Gasto / Ingreso. Un toque.
3. **Categoría** — rejilla, según el tipo elegido. Un toque.
4. **Cuenta** — rejilla. Un toque. La última usada aparece resaltada, pero el
   paso no se salta.
5. **Concepto** — opcional. "Guardar" o Enter.

Total: **teclear el importe + 5 toques**.

La fecha se asume hoy y se cambia tocándola en la cabecera. "Atrás" está visible
en todos los pasos menos el primero.

Al guardar hay 5 segundos para deshacer. Si sales de la app durante esa ventana,
el movimiento se envía en vez de perderse.

### Traspasos entre cuentas

Debajo de Gasto e Ingreso hay un tercer botón, **Traspaso entre cuentas**, para
cuando mueves dinero de un sitio tuyo a otro sitio tuyo.

Mover 200 € de la corriente al ahorro no es un gasto ni un ingreso: ese dinero
no ha entrado ni salido de tu patrimonio, solo ha cambiado de sitio. Anotarlo
como gasto te haría el mes 200 € más caro de lo que fue.

El flujo son los mismos cinco pasos, pero los dos del medio preguntan otra cosa:

| | Movimiento normal | Traspaso |
|---|---|---|
| Paso 3 | Categoría | **Desde qué cuenta** |
| Paso 4 | Cuenta | **A qué cuenta** (sin la de origen) |

Se guarda como **dos filas**: un `Gasto` en la cuenta de origen y un `Ingreso`
en la de destino, ambas con la categoría `Traspaso`. Así el saldo de cada cuenta
sale bien, y los totales del mes que devuelve `doGet` descuentan esa categoría.

Las dos filas viajan en la misma petición y se escriben bajo el mismo bloqueo:
media transferencia escrita descuadraría las dos cuentas a la vez.

> Si montas el panel en el Excel, acuérdate de excluir la categoría `Traspaso`
> de los SUMIFS de ingresos y gastos. Para los saldos por cuenta, en cambio,
> tiene que contar.

---

## Detalles que conviene no romper

**El `Content-Type` del envío es `text/plain`, y es a propósito.** Apps Script no
contesta a las peticiones OPTIONS de preflight. Usar `application/json` haría que
el navegador mandara ese preflight, y el envío fallaría con un error de CORS que
no dice nada útil. Está comentado en [`js/api.js`](js/api.js).

**El importe siempre viaja positivo.** El signo lo da la columna Tipo. El campo
de importe filtra el signo menos según escribes, así que no hay forma de meter
un negativo.

**Los duplicados se rechazan por UUID.** Cada movimiento lleva un identificador
generado en el móvil. Si el mismo llega dos veces, el script responde que todo
va bien pero escribe una sola fila. Sin esto, un reintento duplicaría un gasto.

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
js/ui.js                DOM, transiciones, toast
js/api.js               envío y consulta al Apps Script
js/ajustes.js           endpoint, token y su pantalla
js/app.js               máquina de estados de los 5 pasos
iconos/                 SVG, PNG y el generador
apps-script/Codigo.gs   backend: doPost, doGet e instalar()
```
