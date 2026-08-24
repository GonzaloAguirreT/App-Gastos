package cl.gastos.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.EditText
import android.widget.Toast

/**
 * La única pantalla de esta app: dónde está la hoja y con qué token.
 *
 * Sale sola al soltar el widget en el escritorio, y también desde el cajón de
 * apps para poder corregir el token sin borrar el widget y volver a ponerlo.
 */
class ConfigActivity : Activity() {

    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(guardado: Bundle?) {
        super.onCreate(guardado)

        /* Cancelado por defecto, y a propósito: si el usuario se sale con el
           botón de atrás sin guardar, Android tiene que quitar el widget a
           medio poner en vez de dejar un rectángulo muerto en el escritorio. */
        setResult(RESULT_CANCELED)

        widgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        setContentView(R.layout.config)

        val ajustes = Ajustes(this)
        val campoApp = findViewById<EditText>(R.id.campo_app)
        val campoEndpoint = findViewById<EditText>(R.id.campo_endpoint)
        val campoToken = findViewById<EditText>(R.id.campo_token)

        campoApp.setText(ajustes.appUrl)
        campoEndpoint.setText(ajustes.endpoint)
        campoToken.setText(ajustes.token)

        findViewById<android.widget.Button>(R.id.guardar).setOnClickListener {
            val endpoint = campoEndpoint.text.toString().trim()
            val token = campoToken.text.toString().trim()
            if (endpoint.isBlank() || token.isBlank()) {
                Toast.makeText(this, R.string.falta, Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            ajustes.appUrl = campoApp.text.toString()
            ajustes.endpoint = endpoint
            ajustes.token = token

            /* Todos y no solo el que se acaba de poner: si hay dos widgets
               puestos y se corrige el token desde el cajón de apps, los dos
               tienen que enterarse. */
            WidgetGastos.refrescarTodos(this)

            if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
            }
            finish()
        }
    }
}
