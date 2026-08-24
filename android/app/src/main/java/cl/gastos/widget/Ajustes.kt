package cl.gastos.widget

import android.content.Context
import android.net.Uri

/**
 * La conexión, guardada en este teléfono.
 *
 * Son los dos mismos datos que ya están en Ajustes → Conexión dentro de la app,
 * y hay que pegarlos otra vez porque no hay forma de leerlos desde aquí: la PWA
 * los tiene en el IndexedDB de Chrome y esta app tiene el suyo. Son almacenes
 * distintos aunque la dirección sea la misma.
 *
 * No salen del teléfono más que hacia la propia hoja, igual que en la app.
 */
class Ajustes(contexto: Context) {

    private val prefs = contexto.getSharedPreferences("gastos-widget", Context.MODE_PRIVATE)

    var appUrl: String
        get() = prefs.getString(APP_URL, POR_DEFECTO) ?: POR_DEFECTO
        set(v) = prefs.edit().putString(APP_URL, v.trim()).apply()

    var endpoint: String
        get() = prefs.getString(ENDPOINT, "") ?: ""
        set(v) = prefs.edit().putString(ENDPOINT, v.trim()).apply()

    var token: String
        get() = prefs.getString(TOKEN, "") ?: ""
        set(v) = prefs.edit().putString(TOKEN, v.trim()).apply()

    fun configurado() = endpoint.isNotBlank() && token.isNotBlank()

    /**
     * La dirección del cartel, con todo lo que necesita para pintarse.
     *
     * Los datos van en el fragmento —detrás del `#`— y no en la query, y no es
     * un capricho: el fragmento no viaja en la petición HTTP. Así el token no
     * acaba en el registro de GitHub Pages ni en la cabecera `Referer` de nada.
     */
    fun urlDelCartel(ancho: Int, alto: Int, oscuro: Boolean, radio: Int): String {
        val base = appUrl.trimEnd('/')
        val fragmento = listOf(
            "endpoint=" + Uri.encode(endpoint),
            "token=" + Uri.encode(token),
            "tema=" + if (oscuro) "oscuro" else "claro",
            "ancho=$ancho",
            "alto=$alto",
            "radio=$radio"
        ).joinToString("&")
        return "$base/widget.html#$fragmento"
    }

    private companion object {
        const val APP_URL = "appUrl"
        const val ENDPOINT = "endpoint"
        const val TOKEN = "token"
        const val POR_DEFECTO = "https://gonzaloaguirret.github.io/App-Gastos"
    }
}
