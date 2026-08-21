# Pruebas

No hay marco de pruebas ni dependencias: son dos archivos de Node que se
ejecutan a mano, igual que la app no tiene build.

```sh
node pruebas/servidor-falso.mjs &      # el backend de mentira, en el 8300
node pruebas/cola-y-avisos.mjs         # la app en Chromium contra él
```

`servidor-falso.mjs` sirve la app y hace de Apps Script. Contesta a la acción
`mes` y rechaza el resto con `Petición sin movimientos`, que es lo que contesta
de verdad un despliegue anterior del backend al recibir una acción que no
conoce.

Ese caso —la app nueva hablando con un despliegue viejo— es por donde pasa
cualquiera entre pegar `Codigo.gs` y volver a implementar la aplicación web.
Estuvo sin cubrir y costó una mañana de diagnóstico: la app decía «Sin
conexión» con cobertura de sobra, y «Reintentar» parecía no hacer nada cuando
en realidad reintentaba y fallaba en silencio.

Lo que se comprueba es eso: que un fallo se vea y diga su motivo.
