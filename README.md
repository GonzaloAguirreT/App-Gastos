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
| 2 | Apps Script, token y envío real | ⬜ pendiente |
| 3 | Offline, cola en IndexedDB y reintentos | ⬜ pendiente |
| 4 | Pantalla de resumen y pulido | ⬜ pendiente |

En la fase 1 la app **no envía nada**. Cada movimiento se escribe en la consola
del navegador. Todo lo demás —los 5 pasos, la fecha, deshacer, la vibración, la
instalación en el móvil— ya funciona.

---

## Probar la fase 1

### En el ordenador

```bash
python3 -m http.server 8000
```

Abre `http://localhost:8000` y la consola del navegador (F12). Cada vez que
guardes verás la fila que se enviaría.

`localhost` cuenta como origen seguro, así que el service worker se registra y
puedes simular el modo avión desde DevTools → Network → Offline.

### En el móvil

Dos caminos. **El único que vale para dar la fase por buena es el segundo**,
porque es donde va a vivir la app.

**a) Por cable, sin desplegar.** Con el servidor levantado en el ordenador,
conecta el móvil por USB, abre `chrome://inspect` en el ordenador y activa *Port
forwarding* 8000 → `localhost:8000`. En el móvil entra a `http://localhost:8000`.
Sigue siendo origen seguro, así que funcionan el service worker y la instalación.

> No sirve entrar desde el móvil a `http://192.168.x.x:8000`. Chrome considera
> esa IP un origen inseguro y no registra el service worker ni ofrece instalar.

**b) GitHub Pages.** Ver la sección siguiente.

---

## Desplegar en GitHub Pages

1. En GitHub: **Settings → Pages**.
2. En *Source* elige **Deploy from a branch**.
3. Branch: la rama donde esté el código (`main`, o la rama de trabajo mientras
   se desarrolla). Carpeta: `/ (root)`.
4. Guarda y espera un minuto. La URL queda como
   `https://<tu-usuario>.github.io/<repositorio>/`.

Es HTTPS, así que el service worker y la instalación funcionan sin más.

### Instalar en Android

1. Abre la URL de Pages en **Chrome** (no en el navegador de Instagram ni en
   Samsung Internet: el diálogo de instalación cambia o no aparece).
2. Menú ⋮ → **Añadir a la pantalla de inicio** / **Instalar aplicación**.
3. Ábrela desde el icono. No debe verse la barra de direcciones.

Si la opción dice "Añadir acceso directo" en vez de "Instalar", es que Chrome no
ha detectado el manifest o el service worker: recarga un par de veces y revisa
DevTools → Application.

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

---

## Configuración

Todo está en `config.js`:

```js
CUENTAS: [...],
CATEGORIAS_GASTO: [...],
CATEGORIAS_INGRESO: [...],
MONEDA: "€",
MODO_PRUEBA: true
```

> Estos textos tienen que coincidir **palabra por palabra** con las listas de la
> hoja de configuración del Excel. Si no coinciden, los SUMIFS del panel dan cero
> y no salta ningún error en ninguna parte.

`ENDPOINT` y `TOKEN` se quedan vacíos en el repositorio a propósito: una página
de GitHub Pages es pública y el token sería legible por cualquiera. A partir de
la fase 2 la app los pide una vez y los guarda en el teléfono.

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
index.html            una sola pantalla
config.js             cuentas, categorías, moneda
config.ejemplo.js     documentación del formato
sw.js                 service worker
manifest.json         instalación en Android
css/estilos.css
js/ui.js              DOM, transiciones, toast
js/api.js             envío al Apps Script
js/app.js             máquina de estados de los 5 pasos
iconos/               SVG, PNG y el generador
```
