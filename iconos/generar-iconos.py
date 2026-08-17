#!/usr/bin/env python3
"""
Genera icono-192.png e icono-512.png a partir de las mismas formas que icono.svg.

Por qué no se convierte el SVG con una herramienta normal: eso obligaría a
depender de ImageMagick, Inkscape o Pillow, y la premisa del proyecto es no
depender de nada. Este script escribe los PNG a mano con la librería estándar
(zlib para comprimir, struct para las cabeceras) y dibuja las formas por
fuerza bruta con supermuestreo 3x3 para suavizar los bordes.

Uso:  python3 iconos/generar-iconos.py

Si cambias el icono, edita a la vez icono.svg y las constantes FORMAS de aquí:
son dos fuentes de verdad para el mismo dibujo, no hay forma de evitarlo sin
meter un conversor de SVG.
"""

import struct
import zlib
from pathlib import Path

# Mismos valores que icono.svg, en un lienzo de referencia de 512x512.
LIENZO = 512
FONDO = (0x0E, 0x10, 0x13)
ACENTO = (0x4A, 0xDE, 0x80)
RADIO_FONDO = 112

# (x, y, ancho, alto, radio)
BARRAS = [
    (152, 276, 56, 96, 20),
    (228, 212, 56, 160, 20),
    (304, 140, 56, 232, 20),
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


def color_submuestra(px, py, escala):
    """Devuelve (r, g, b, a) de una submuestra en coordenadas del lienzo 512."""
    for bx, by, ba, bh, br in BARRAS:
        if dentro_rect_redondeado(px, py, bx, by, ba, bh, br):
            return ACENTO + (255,)
    if dentro_rect_redondeado(px, py, 0, 0, LIENZO, LIENZO, RADIO_FONDO):
        return FONDO + (255,)
    return (0, 0, 0, 0)


def dibujar(tamano):
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
                    cr, cg, cb, ca = color_submuestra(px, py, escala)
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
