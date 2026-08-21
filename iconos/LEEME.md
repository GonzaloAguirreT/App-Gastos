# Icono de Gastos · Android

La barra del mes: tu tramo, el de la otra persona y lo que falta por salir.
Sin tipografía, así que se exporta idéntico a cualquier tamaño.

## Por qué está así

Android recorta el icono con la forma que tenga el launcher (círculo, squircle,
cuadrado redondeado, gota). Solo garantiza el **80 % central**, así que todos los
PNG llevan el 20 % de margen y el papel a sangre: se recorte como se recorte, las
dos bandas quedan enteras y nunca aparece un borde blanco.

| Archivo | Para qué |
| --- | --- |
| `icono-48.png` … `icono-512.png` | los seis tamaños del manifest, todos `"purpose": "any maskable"` |
| `icono-monocromo-512.png` | Android 13+ con iconos temáticos: silueta negra sobre transparente que el sistema tiñe |
| `icono.svg` | `<link rel="icon" type="image/svg+xml">` |
| `manifest-iconos.json` | el bloque `icons` listo para copiar en `manifest.json` |

Colores: papel `#F4F0E8`, azul `#3D5A6C`, rosa `#A34E6B`, ladrillo `#A3341F`,
línea `#DCD5C6`.

## Al instalarlo

1. Reemplaza el contenido de `iconos/` en el repo.
2. Copia el bloque `icons` de `manifest-iconos.json` en tu `manifest.json`, y pon
   `background_color` y `theme_color` en `#F4F0E8` (el `theme-color` del `index.html`
   sigue siendo `#14100E` si arrancas en oscuro).
3. Sube la versión del service worker y añade los archivos nuevos a su lista de
   cacheado: si no, el teléfono seguirá sirviendo el icono viejo.
4. En el móvil: desinstala el acceso directo y vuelve a añadirlo. Android cachea
   el icono de forma agresiva y no lo cambia solo.
