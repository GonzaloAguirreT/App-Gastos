#!/usr/bin/env python3
"""
Genera los PNG del icono a partir de las mismas formas que icono.svg.

Por qué no se convierte el SVG con una herramienta normal: eso obligaría a
depender de ImageMagick, Inkscape o Pillow, y la premisa del proyecto es no
depender de nada. Este script escribe los PNG a mano con la librería estándar
(zlib para comprimir, struct para las cabeceras) y dibuja las formas por
fuerza bruta con supermuestreo 3x3 para suavizar los bordes.

Uso:  python3 iconos/generar-iconos.py

Salen tres archivos, y el tercero no es un capricho:

  icono-192.png, icono-512.png   el icono normal, con esquinas redondeadas
  icono-maskable-512.png         para Android, a sangre y sin redondear

Android recorta los iconos "maskable" con la forma que tenga configurada el
lanzador —círculo, cuadrado, gota—. Si le das un PNG que YA lleva las esquinas
redondeadas, aplica su recorte encima y el dibujo acaba más pequeño y metido
hacia dentro. El maskable va con el fondo hasta el borde y las barras dentro
del círculo central del 80%, que es la zona que ningún recorte se come.

Si cambias el icono, edita a la vez icono.svg y las constantes de aquí: son dos
fuentes de verdad para el mismo dibujo, y no hay forma de evitarlo sin meter un
conversor de SVG.
"""

import struct
import zlib
from pathlib import Path

# Mismos valores que icono.svg, en un lienzo de referencia de 512x512.
LIENZO = 512

# El campo va en coral y las barras en oscuro, y no al revés. Un icono casi
# negro sobre un fondo de pantalla oscuro desaparece: hay que buscarlo entre
# los demás. Con el campo de color se localiza de un vistazo, y el coral ya es
# el color de la app, así que no inventa nada.
FONDO = (0xFF, 0x8A, 0x5B)
ACENTO = (0x14, 0x10, 0x0E)
RADIO_FONDO = 112

# (x, y, ancho, alto, radio)
BARRAS = [
    (112, 272, 72, 128, 26),
    (220, 192, 72, 208, 26),
    (328,  96, 72, 304, 26),
]

# Las mismas barras al 80% desde el centro, para el maskable: así el dibujo
# entero cabe en el círculo central que ningún recorte del lanzador toca.
BARRAS_MASKABLE = [
    (141, 269, 58, 102, 21),
    (227, 205, 58, 166, 21),
    (314, 128, 58, 243, 21),
]

MUESTRAS = 3  # 3x3 submuestras por píxel: suficiente para bordes limpios


def dentro_rect_redondeado(px, py, x, y, ancho, alto, radio):
    """Punto dentro de un rectángulo de esquinas redondeadas."""
    if px < x or px > x + ancho or py < y or py > y + alto:
        return False
    # Zona central: cualquier punto que no esté en el cuadrado de una esquina.
    cx = min(max(px, x + radio), x + ancho - radio)
    cy = min(max(py, y + radio), y + alto - radio)
    dx, dy = px - cx, py - cy
    return dx * dx + dy * dy <= radio * radio


def color_submuestra(px, py, maskable):
    """Devuelve (r, g, b, a) de una submuestra en coordenadas del lienzo 512."""
    for bx, by, ba, bh, br in (BARRAS_MASKABLE if maskable else BARRAS):
        if dentro_rect_redondeado(px, py, bx, by, ba, bh, br):
            return ACENTO + (255,)
    # En el maskable el fondo llega al borde: el redondeo lo pone Android.
    radio = 0 if maskable else RADIO_FONDO
    if dentro_rect_redondeado(px, py, 0, 0, LIENZO, LIENZO, radio):
        return FONDO + (255,)
    return (0, 0, 0, 0)


def dibujar(tamano, maskable=False):
    """Genera las filas RGBA del icono al tamaño pedido."""
    escala = LIENZO / tamano
    paso = escala / MUESTRAS
    filas = []
    for fila in range(tamano):
        linea = bytearray()
        for col in range(tamano):
            r = g = b = a = 0
            for sy in range(MUESTRAS):
                py = (fila * MUESTRAS + sy + 0.5) * paso
                for sx in range(MUESTRAS):
                    px = (col * MUESTRAS + sx + 0.5) * paso
                    cr, cg, cb, ca = color_submuestra(px, py, maskable)
                    # Se acumula premultiplicado para que el borde no tire a negro.
                    r += cr * ca
                    g += cg * ca
                    b += cb * ca
                    a += ca
            total = MUESTRAS * MUESTRAS
            alfa = a / total
            if alfa == 0:
                linea += bytes(4)
            else:
                linea += bytes((
                    round(r / a),
                    round(g / a),
                    round(b / a),
                    round(alfa),
                ))
        filas.append(bytes(linea))
    return filas


def escribir_png(ruta, tamano, filas):
    def trozo(tipo, datos):
        return (struct.pack('>I', len(datos)) + tipo + datos
                + struct.pack('>I', zlib.crc32(tipo + datos) & 0xFFFFFFFF))

    # Cada fila lleva delante su byte de filtro; 0 = sin filtro.
    crudo = b''.join(b'\x00' + fila for fila in filas)
    cabecera = struct.pack('>IIBBBBB', tamano, tamano, 8, 6, 0, 0, 0)

    ruta.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + trozo(b'IHDR', cabecera)
        + trozo(b'IDAT', zlib.compress(crudo, 9))
        + trozo(b'IEND', b'')
    )


if __name__ == '__main__':
    destino = Path(__file__).parent
    for tamano in (192, 512):
        ruta = destino / f'icono-{tamano}.png'
        escribir_png(ruta, tamano, dibujar(tamano))
        print(f'{ruta.name}: {ruta.stat().st_size} bytes')

    ruta = destino / 'icono-maskable-512.png'
    escribir_png(ruta, 512, dibujar(512, maskable=True))
    print(f'{ruta.name}: {ruta.stat().st_size} bytes')
