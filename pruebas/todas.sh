#!/bin/bash
#
# Las nueve pruebas, cada una con el modo de servidor que necesita.
#
#   sh pruebas/todas.sh
#
# Existe por dos motivos, los dos aprendidos a golpes:
#
#   · cada prueba quiere un arranque distinto del servidor falso (--rechaza,
#     --mes-viejo, --mes-como-fecha) y ejecutarla con el que no es da fallos
#     que no significan nada;
#   · un servidor heredado de la prueba anterior trae su libro ya tocado —el
#     mes cerrado, los movimientos borrados— y la siguiente falla por eso. Aquí
#     se espera a que el puerto quede libre antes de arrancar el siguiente.
#
# Sale con código distinto de cero si algo falla, que es lo único que hay que
# mirar. Playwright vive en /opt/node22/lib/node_modules, fuera del proyecto.
cd "$(dirname "$0")/.." || exit 1

fallos=0
PUERTO=8300

espera_libre() {
  for _ in $(seq 1 40); do
    curl -s --noproxy '*' -o /dev/null "http://localhost:$PUERTO/" || return 0
    sleep 0.25
  done
  return 1
}

espera_arriba() {
  for _ in $(seq 1 40); do
    curl -s --noproxy '*' -o /dev/null "http://localhost:$PUERTO/index.html" && return 0
    sleep 0.25
  done
  return 1
}

corre() {
  prueba=$1; shift
  node pruebas/servidor-falso.mjs "$@" >/dev/null 2>&1 &
  servidor=$!
  espera_arriba || { echo "!!! el servidor falso no arrancó para $prueba"; fallos=$((fallos + 1)); return; }

  echo
  echo "════════ $prueba $* ════════"
  node "pruebas/$prueba.mjs"
  codigo=$?
  [ "$codigo" -ne 0 ] && { echo "!!! $prueba salió con $codigo"; fallos=$((fallos + 1)); }

  kill -9 $servidor 2>/dev/null
  wait $servidor 2>/dev/null
  espera_libre || { echo "!!! el puerto $PUERTO sigue ocupado tras $prueba"; fallos=$((fallos + 1)); }
}

corre botones
corre cola-y-avisos --rechaza
corre calendario-chileno
corre mes-recien-empezado
corre alto-700
corre ahorro-proyectado
corre cerrar-y-reabrir
corre meses-navegables --mes-viejo
corre mes-como-fecha --mes-como-fecha

echo
if [ "$fallos" -eq 0 ]; then
  echo "════════ todo pasa ════════"
else
  echo "════════ pruebas con fallo: $fallos ════════"
fi
exit $fallos
