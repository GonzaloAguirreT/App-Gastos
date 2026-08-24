package cl.gastos.widget

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView

/**
 * Carga `widget.html` sin enseñarla y devuelve la captura.
 *
 * Toda la app Android es esto. La cifra, la barra y la leyenda las calcula y las
 * dibuja la página, con el `ESTADO.resumen()` de la app de verdad; aquí no se
 * suma nada ni se sabe qué es un mes. Es a propósito: escribir esas cuentas otra
 * vez en Kotlin dejaba tres sitios donde decidir de qué mes es una compra, y
 * este proyecto ya sabe cómo acaba eso.
 */
object Pintor {

    /**
     * Tope de píxeles del mapa de bits.
     *
     * `RemoteViews` cruza al proceso del launcher por binder, y por ahí no cabe
     * cualquier cosa: un mapa de bits demasiado grande no da un error claro,
     * deja el widget en blanco. A 4×2 y tres veces la densidad salen 1008×516,
     * que en ARGB son 2 MB largos, así que se dibuja algo más pequeño y lo
     * estira el launcher. La diferencia no se ve; el widget en blanco sí.
     *
     * Si aparece en blanco en una pantalla muy densa, este es el número que hay
     * que bajar.
     */
    private const val TOPE_PX = 380_000

    /**
     * La página avisa de que ya está pintada llamando a `Android.listo()`.
     *
     * Lo hace después de dos `requestAnimationFrame`, o sea con el fotograma ya
     * dibujado. Sin esperar a eso la captura sale en blanco o a medias: la
     * WebView contesta que ha terminado de cargar mucho antes de haber pintado.
     */
    class Aviso(val cuando: () -> Unit) {
        @JavascriptInterface
        fun listo() = cuando()
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun pintar(contexto: Context, url: String, ancho: Int, alto: Int, entregar: (Bitmap?) -> Unit) {
        Handler(Looper.getMainLooper()).post {
            val web = WebView(contexto.applicationContext)
            var entregado = false

            /* Una sola entrega, venga por donde venga: el puente de JavaScript,
               el título o el plazo de seguridad. Los tres pueden llegar. */
            fun terminar(bmp: Bitmap?) {
                if (entregado) return
                entregado = true
                entregar(bmp)
                // Fuera de la devolución de llamada en curso: destruir una
                // WebView desde dentro de uno de sus propios avisos se cae.
                Handler(Looper.getMainLooper()).post { web.destroy() }
            }

            fun capturar() {
                val bmp = try {
                    val b = Bitmap.createBitmap(ancho, alto, Bitmap.Config.ARGB_8888)
                    web.measure(
                        View.MeasureSpec.makeMeasureSpec(ancho, View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(alto, View.MeasureSpec.EXACTLY)
                    )
                    web.layout(0, 0, ancho, alto)
                    web.draw(Canvas(b))
                    b
                } catch (e: Throwable) {
                    null
                }
                terminar(bmp)
            }

            web.settings.javaScriptEnabled = true
            web.settings.domStorageEnabled = true
            /* Clavado al 100 y no al del sistema. Por defecto la WebView estira
               el texto con el tamaño de fuente del teléfono, y el diseño tiene
               el alto contado: al 130 % la cifra de 44 px se sale de los 172 dp
               y se come la leyenda. El widget es un cartel, no un texto que
               haya que poder agrandar; quien necesite leerlo grande abre la
               app, que sí escala. */
            web.settings.textZoom = 100
            /* Transparente para que se vean las esquinas redondeadas: si el
               fondo de la WebView fuera blanco, saldrían cuatro picos blancos
               en las cuatro esquinas del widget. */
            web.setBackgroundColor(Color.TRANSPARENT)
            web.addJavascriptInterface(Aviso { web.post { capturar() } }, "Android")

            web.webChromeClient = object : WebChromeClient() {
                override fun onReceivedTitle(vista: WebView?, titulo: String?) {
                    if (titulo == "listo") web.post { capturar() }
                }
            }

            /* Hay que medirla y colocarla ANTES de cargar: una WebView que nunca
               ha tenido tamaño no dispara el diseño de la página, y `widget.js`
               calcula la escala con lo que le dice el fragmento, no con esto,
               pero el navegador necesita un lienzo donde pintar. */
            web.measure(
                View.MeasureSpec.makeMeasureSpec(ancho, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(alto, View.MeasureSpec.EXACTLY)
            )
            web.layout(0, 0, ancho, alto)
            web.loadUrl(url)

            /* Red de seguridad: sin cobertura y sin caché la página puede no
               llegar a decir «listo» nunca, y un widget que se queda esperando
               deja el anterior colgado hasta la siguiente actualización. A los
               veinte segundos se captura lo que haya. */
            Handler(Looper.getMainLooper()).postDelayed({
                if (!entregado) capturar()
            }, 20_000)
        }
    }

    /** El tamaño de dibujo, recortado para que quepa por el binder. */
    fun tamanoSeguro(ancho: Int, alto: Int): Pair<Int, Int> {
        if (ancho <= 0 || alto <= 0) return Pair(672, 344)
        val total = ancho.toLong() * alto.toLong()
        if (total <= TOPE_PX) return Pair(ancho, alto)
        val factor = Math.sqrt(TOPE_PX.toDouble() / total.toDouble())
        return Pair((ancho * factor).toInt(), (alto * factor).toInt())
    }
}
