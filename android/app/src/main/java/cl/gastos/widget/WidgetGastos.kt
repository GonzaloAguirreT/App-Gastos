package cl.gastos.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.widget.RemoteViews

/**
 * El widget 4×2.
 *
 * No dibuja nada: le pide a `Pintor` la captura de `widget.html` y la cuelga. Lo
 * único que decide aquí es de qué tamaño la quiere y con qué tema.
 */
class WidgetGastos : AppWidgetProvider() {

    override fun onUpdate(contexto: Context, gestor: AppWidgetManager, ids: IntArray) {
        mientrasPinta(ids.size) { hecho -> ids.forEach { refrescar(contexto, gestor, it, hecho) } }
    }

    /* Sin `goAsync` el receptor acaba al volver de `onUpdate`, con la página aún
       cargando, y Android da el proceso por ocioso: Samsung lo congela en ese
       instante y ni la captura ni el plazo de seguridad llegan a ejecutarse.
       Así el proceso sigue vivo hasta que el último widget tiene su dibujo. */
    private fun mientrasPinta(cuantos: Int, trabajo: (hecho: () -> Unit) -> Unit) {
        val pendiente = goAsync()
        var faltan = cuantos
        if (faltan == 0) { pendiente.finish(); return }
        trabajo { if (--faltan == 0) pendiente.finish() }
    }

    /** Al estirarlo o encogerlo hay que volver a dibujar: cambia el lienzo. */
    override fun onAppWidgetOptionsChanged(
        contexto: Context,
        gestor: AppWidgetManager,
        id: Int,
        opciones: Bundle
    ) {
        mientrasPinta(1) { hecho -> refrescar(contexto, gestor, id, hecho) }
    }

    companion object {

        /**
         * Vuelve a pintar todos los widgets puestos. La usa ConfigActivity.
         *
         * Por un aviso a este mismo receptor y no llamando a `refrescar` aquí:
         * ConfigActivity se cierra en cuanto guarda, la app pasa a segundo plano
         * y a los cuatro segundos Samsung congela el proceso y le corta la red.
         * La consulta a la hoja tarda cinco, así que se cortaba a medias
         * —`ERR_CONNECTION_ABORTED` en la redirección de Google— y el widget
         * pintaba el mes guardado. Por el receptor pasa por `goAsync`, que es lo
         * que le dice a Android que el proceso sigue trabajando.
         */
        fun refrescarTodos(contexto: Context) {
            val ids = AppWidgetManager.getInstance(contexto).getAppWidgetIds(
                android.content.ComponentName(contexto, WidgetGastos::class.java)
            )
            contexto.sendBroadcast(
                Intent(contexto, WidgetGastos::class.java)
                    .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            )
        }

        fun refrescar(contexto: Context, gestor: AppWidgetManager, id: Int, hecho: () -> Unit = {}) {
            val ajustes = Ajustes(contexto)

            /* Sin conexión pegada no hay nada que pedir. Se deja el widget con
               lo que tenga y se abre la configuración al tocarlo, que es lo
               único útil que puede hacer en ese estado. */
            if (!ajustes.configurado()) {
                colgar(contexto, gestor, id, null, aConfigurar(contexto))
                hecho()
                return
            }

            val (ancho, alto) = medir(contexto, gestor, id)
            val oscuro = enOscuro(contexto)
            /* 28 dp de los 336 de ancho del diseño, en píxeles de ESTE mapa de
               bits. Sacarlo de la densidad de la pantalla parece equivalente y
               no lo es: cuando `tamanoSeguro` encoge el dibujo para que quepa
               por el binder, el launcher lo vuelve a estirar y con él el radio,
               y las esquinas salen más redondas que en el resto del sistema. */
            val radio = (28.0 / 336.0 * ancho).toInt()
            val url = ajustes.urlDelCartel(ancho, alto, oscuro, radio)

            Pintor.pintar(contexto, url, ancho, alto) { mapa ->
                /* Sin dibujo no se toca lo que hay: mejor el cartel de hace
                   media hora que un rectángulo vacío. */
                if (mapa != null) colgar(contexto, gestor, id, mapa, abrirLaApp(contexto, ajustes.appUrl))
                hecho()
            }
        }

        private fun colgar(
            contexto: Context,
            gestor: AppWidgetManager,
            id: Int,
            mapa: android.graphics.Bitmap?,
            alTocar: PendingIntent
        ) {
            val vistas = RemoteViews(contexto.packageName, R.layout.widget)
            if (mapa != null) vistas.setImageViewBitmap(R.id.imagen, mapa)
            vistas.setOnClickPendingIntent(R.id.imagen, alTocar)
            try {
                gestor.updateAppWidget(id, vistas)
            } catch (e: Throwable) {
                /* Si el mapa de bits no cupo por el binder, al menos que el
                   widget siga respondiendo al toque en vez de tirar al
                   launcher. Se reintenta solo en la siguiente actualización. */
                val pelado = RemoteViews(contexto.packageName, R.layout.widget)
                pelado.setOnClickPendingIntent(R.id.imagen, alTocar)
                gestor.updateAppWidget(id, pelado)
            }
        }

        /**
         * El tamaño real de la celda, en píxeles y ya recortado.
         *
         * Android da el mínimo en dp y cambia según la orientación; se usa el
         * que corresponde a como está el teléfono ahora. Los valores de reserva
         * son los del diseño por si el gestor no contesta.
         */
        private fun medir(contexto: Context, gestor: AppWidgetManager, id: Int): Pair<Int, Int> {
            val opciones = gestor.getAppWidgetOptions(id)
            val anchoDp = opciones.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 336)
            val altoDp = opciones.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 172)
            val d = contexto.resources.displayMetrics.density
            val ancho = ((if (anchoDp > 0) anchoDp else 336) * d).toInt()
            val alto = ((if (altoDp > 0) altoDp else 172) * d).toInt()
            return Pintor.tamanoSeguro(ancho, alto)
        }

        /* El widget sigue al sistema y no al interruptor de Ajustes de la app:
           en el escritorio no hay dónde poner un selector de tema, y un cartel
           claro sobre un escritorio oscuro se ve como un error. */
        private fun enOscuro(contexto: Context): Boolean {
            val modo = contexto.resources.configuration.uiMode and
                Configuration.UI_MODE_NIGHT_MASK
            return modo == Configuration.UI_MODE_NIGHT_YES
        }

        /** Tocar el widget abre la app instalada, o el navegador si no lo está. */
        private fun abrirLaApp(contexto: Context, url: String): PendingIntent {
            val intencion = Intent(Intent.ACTION_VIEW, Uri.parse(url.trimEnd('/') + "/index.html"))
            return PendingIntent.getActivity(
                contexto, 0, intencion,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun aConfigurar(contexto: Context): PendingIntent {
            val intencion = Intent(contexto, ConfigActivity::class.java)
            return PendingIntent.getActivity(
                contexto, 1, intencion,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }
}
