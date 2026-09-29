# El widget 4×2

Una app Android diminuta cuyo único trabajo es enseñar el saldo del mes en la
pantalla de inicio. **No calcula nada**: carga `widget.html` en una `WebView`
que no se ve, espera a que la página diga «listo», le hace una captura y cuelga
esa imagen del escritorio.

## Por qué así y no en Kotlin

Los números del widget son los de la pantalla Mes: lo que entra, lo gastado, lo
que falta por cobrar y dónde queda el ahorro esperado. Escribirlos otra vez aquí
dejaba **tres** sitios decidiendo de qué mes es una compra —la app, el backend y
el widget—, y este repositorio ya ha pagado dos veces por tener solo dos que no
coincidían (`corte-que-no-reescribe`, `editar-no-refactura`).

Con este montaje el reparto es:

| | dónde | qué hace |
|---|---|---|
| Los números | `js/estado.js` → `ESTADO.resumen()` | el mismo que la pantalla Mes |
| El dibujo | `widget.html` + `css/widget.css` + `js/widget.js` | maqueta y pinta |
| Android | `android/` | mide, captura y cuelga |

Lo vigila `pruebas/widget-4x2.mjs`, que comprueba —entre otras cosas— que la
cifra grande del widget y el saldo de la app son el mismo número. Esa prueba
corre en `sh pruebas/todas.sh` como todas las demás: la parte que tiene lógica
está probada, y lo que queda aquí es pegamento.

## Compilarlo

Este proyecto **no** se compila en el contenedor donde se escribió: no hay SDK
de Android. Hace falta Android Studio.

1. Android Studio → **Open** → elegir la carpeta `android/`.
2. Dejar que sincronice Gradle. Si se queja de versiones, aceptar lo que
   proponga: no hay ninguna dependencia que se pueda romper —el proyecto no usa
   ni una— así que subir el plugin de Android o Kotlin es seguro.
3. **Build → Build APK(s)**, o conectar el teléfono con depuración USB y darle a
   ▶.

Para instalarlo sin Android Studio, con el APK ya hecho:

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Ponerlo

1. Mantener pulsado el escritorio → **Widgets** → *Gastos · widget* → arrastrar
   el 4×2.
2. Al soltarlo se abre la pantalla de conexión. Van los **mismos dos datos** que
   ya están en Ajustes → Conexión dentro de la app: el endpoint que acaba en
   `/exec` y el token.

Hay que pegarlos otra vez porque no hay forma de leerlos: la PWA los guarda en
el IndexedDB de Chrome y esta app tiene el suyo. Son almacenes distintos aunque
la dirección sea la misma. No salen del teléfono más que hacia la propia hoja, y
viajan en el fragmento de la URL —detrás del `#`— que no se manda en la
petición, así que el token no acaba en ningún registro de servidor.

La dirección de la app viene puesta y solo hay que tocarla si Pages cambia de
sitio.

## Cada cuánto se refresca

Media hora, que es el mínimo que respeta Android: por debajo lo redondea él
solo. No es para ver el gasto recién anotado —para eso se abre la app— sino para
que el día del mes y los fijos que caen de madrugada no se queden viejos.

Sin cobertura el widget sigue enseñando el último mes que trajo, porque
`ESTADO.iniciar()` lo lee de IndexedDB. Si esa lectura además es de otro día, el
encabezado lo dice: **ACTUALIZADO AYER** en lugar del día del mes. Un widget que
miente sin avisar es peor que uno vacío.

## Si sale en blanco

En el primer teléfono de verdad (un S24) salió en blanco por tres motivos que
ya están arreglados y explicados en `Pintor.kt` y `WidgetGastos.kt`: la captura
se pedía con `web.post`, que en una vista sin ventana no se ejecuta nunca; el
título «listo» llegaba antes que el dibujo; y sin `goAsync()` Samsung congelaba
el proceso a media carga. Una captura toda transparente ya no se cuelga: se
queda el dibujo anterior.

Si vuelve a pasar, lo siguiente es el tamaño del mapa de bits. `RemoteViews`
cruza al proceso del launcher por binder y por ahí no cabe cualquier cosa;
pasado el límite no da un error claro, deja el widget en blanco. Está recortado
en `Pintor.TOPE_PX`, y ese es el número que hay que bajar. En el S24, a 770×493,
cabe.

Lo segundo más probable, si sale el cartel pero sin datos: el endpoint o el
token mal pegados. Se corrigen abriendo *Conexión del widget* desde el cajón de
apps, sin tener que quitar el widget.

## Lo que no se puede hacer

**Pantalla de bloqueo, no.** Los widgets de bloqueo de Samsung son un conjunto
propio y cerrado; una app de terceros no puede meter el suyo. Lo único de
terceros que llega ahí es una notificación, y eso lo podría poner la propia PWA
desde su service worker sin nada de esto.
