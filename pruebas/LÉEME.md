# Pruebas

No hay marco de pruebas ni dependencias: son archivos de Node que se ejecutan a
mano, igual que la app no tiene build. Cada uno sale con código distinto de cero
si algo falla.

```sh
node pruebas/servidor-falso.mjs &          # backend que funciona, en el 8300
node pruebas/botones.mjs                   # nada de lo pulsable puede estar muerto
node pruebas/ahorro-proyectado.mjs         # la resta del ahorro, con el plan dentro
node pruebas/cerrar-y-reabrir.mjs         # cerrar a mitad de mes no, y reabrir sí

node pruebas/servidor-falso.mjs --rechaza & # backend de un despliegue viejo
node pruebas/cola-y-avisos.mjs             # un fallo de envío tiene que verse

node pruebas/servidor-falso.mjs --mes-como-fecha &
node pruebas/mes-como-fecha.mjs            # un mes guardado como fecha se lee igual

node pruebas/servidor-falso.mjs --mes-viejo &
node pruebas/meses-navegables.mjs          # a qué meses llegan las flechas
```

**El servidor hay que reiniciarlo entre pruebas.** Guarda el libro en memoria, y
una prueba que hereda el estado de la anterior deja de comprobar lo que dice
comprobar. Ya pasó: una tanda de repartos acumulados hizo fallar cuatro
comprobaciones que estaban bien.

## Qué es cada cosa

`servidor-falso.mjs` sirve la app y hace de Apps Script, con el libro en
memoria. Contesta a todas las acciones, calcula el próximo cargo de un fijo como
lo hace el backend real, y con `--rechaza` finge ser **un despliegue anterior**:
no conoce la acción `mes` y la rechaza con `Petición sin movimientos`.

Ese caso —app nueva contra backend viejo— es por donde pasa cualquiera entre
pegar el `Codigo.gs` y volver a implementar la aplicación web. Estuvo sin cubrir
y costó una mañana de diagnóstico: la app decía «Sin conexión» con cobertura de
sobra y «Reintentar» parecía no hacer nada cuando en realidad reintentaba y
fallaba en silencio.

`botones.mjs` pulsa todo lo pulsable de las cinco pestañas. Los manejadores se
enganchan con `addEventListener` y no dejan rastro en el HTML, así que la prueba
envuelve `addEventListener` antes de que cargue la página para que cada elemento
que reciba un `click` se marque solo.
