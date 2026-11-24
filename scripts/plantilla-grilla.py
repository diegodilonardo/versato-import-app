"""Actualizar datos OOXML sin reserializar estilos, temas, protecciones ni diseño.

La edición directa del paquete conserva las funciones nativas de la plantilla que
el motor de render no preserva: protección SHA-512, estilos y hojas auxiliares.
No abre ni actualiza las conexiones externas del libro.
"""
import base64
import copy
import io
import json
import posixpath
import re
import sys
import zipfile
import hashlib
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
from PIL import Image, ImageOps, UnidentifiedImageError

S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
D = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P = 'http://schemas.openxmlformats.org/package/2006/relationships'
NS = {'s': S, 'd': D, 'a': A, 'r': R}
for prefix, uri in [('xdr', D), ('a', A), ('r', R)]:
    ET.register_namespace(prefix, uri)

MARCAS = ['VIZZANO', 'MODARE', 'MOLECA', 'MOLEKINHA', 'MOLEKINHO', 'BEIRA_RIO', 'BR_SPORT', 'ACTVITTA']


def texto_celda(c, cadenas):
    if c is None:
        return ''
    if c.get('t') == 'inlineStr':
        return ''.join(c.itertext())
    v = c.find('s:v', NS)
    return cadenas[int(v.text)] if c.get('t') == 's' and v is not None else (v.text if v is not None else '')


def celda(col, row, value, style=None, formula=None):
    attrs = f' r="{col}{row}"' + (f' s="{style}"' if style is not None else '')
    if formula is not None:
        return f'<c{attrs}><f>{escape(formula)}</f><v>0</v></c>'
    if isinstance(value, (int, float)):
        return f'<c{attrs}><v>{value}</v></c>'
    return f'<c{attrs} t="inlineStr"><is><t xml:space="preserve">{escape(str(value or ""))}</t></is></c>'


def reemplazar_datos(xml, contenido):
    return re.sub(r'<sheetData>.*?</sheetData>', lambda _: '<sheetData>' + contenido + '</sheetData>', xml, flags=re.S)


def render_libro(original, datos, lista, filas):
    filas = [f for f in filas if f['cantidad'] > 0]
    activas = {m for m in MARCAS if any(f['marca'] == m.replace('_', ' ') for f in filas)}
    if not activas:
        raise ValueError('No hay stock disponible para exportar.')
    partes = dict(original)
    cadenas = [''.join(e.itertext()) for e in ET.fromstring(partes['xl/sharedStrings.xml']).findall('s:si', NS)]
    limites = {}
    for i, nombre in enumerate(MARCAS, 1):
        marca = nombre.replace('_', ' ')
        seleccion = [f for f in filas if f['marca'] == marca]
        parte = f'xl/worksheets/sheet{i}.xml'
        xml = partes[parte].decode('utf-8')
        root = ET.fromstring(xml)
        data = root.find('s:sheetData', NS)
        muestra = next(r for r in data if r.get('r') == '3')
        estilos = {re.sub(r'\d', '', c.get('r')): c.get('s') for c in muestra}
        muestra_raw = re.search(r'<row\b[^>]* r="3"[^>]*>', xml).group()
        cabeceras = re.search(r'<sheetData>(.*?)</sheetData>', xml, re.S).group(1)
        cabeceras = ''.join(re.findall(r'<row\b[^>]* r="[12]"[^>]*(?:/>|>.*?</row>)', cabeceras, re.S))

        # Reusar la foto exacta de la plantilla cuando el producto ya está presente.
        drawing_part = f'xl/drawings/drawing{i}.xml'
        dibujo = ET.fromstring(partes[drawing_part])
        dibujos_originales = list(dibujo)
        fotos_originales = {}
        productos = {int(r.get('r')): texto_celda(r.find("s:c[@r='C" + r.get('r') + "']", NS), cadenas).replace('-', '.') for r in data}
        for anchor in dibujos_originales:
            desde = anchor.find('d:from/d:row', NS)
            if desde is not None and productos.get(int(desde.text) + 1):
                fotos_originales[productos[int(desde.text) + 1]] = anchor
        for anchor in list(dibujo):
            dibujo.remove(anchor)
        rel_part = f'xl/drawings/_rels/drawing{i}.xml.rels'
        rels = ET.fromstring(partes[rel_part])
        celdas = []
        for offset, f in enumerate(seleccion or [None], 3):
            fila_xml = re.sub(r' r="3"', f' r="{offset}"', muestra_raw, count=1)
            fila_xml = re.sub(r' spans="[^"]*"', ' spans="2:16"', fila_xml)
            if f is None:
                valores = {c: '' for c in 'BCDEFGHIKLNOP'}
                valores['I'] = 0
            else:
                precio = f['precios'].get(lista)
                valido = isinstance(precio, (int, float)) and f['paresUnidad'] > 0
                valores = {'B': '', 'C': f['productoFoto'].replace('.', '-'), 'D': f.get('colorCompleto') or f['color'],
                           'E': f['curva'].replace(':', 'x'), 'F': f['codigo'], 'G': f['alfa'], 'H': f['cantidad'], 'I': 0,
                           'K': precio / f['paresUnidad'] if valido else 'Sin precio',
                           'L': precio / f['paresUnidad'] * 2 if valido else 'Sin precio',
                           'N': precio if valido else 'Sin precio', 'O': f['marca'], 'P': f['paresUnidad']}
                producto = f['productoFoto']
                anchor = copy.deepcopy(fotos_originales.get(producto))
                foto = datos['fotos'].get(producto)
                if foto and dibujos_originales:
                    anchor = copy.deepcopy(dibujos_originales[0])
                    content, encoded = foto['dataUrl'].split(',', 1)
                    ext = 'png' if 'image/png' in content else 'jpeg'
                    media = f'stock_{i}_{offset}.{ext}'
                    partes['xl/media/' + media] = base64.b64decode(encoded)
                    rid = f'rIdStock{offset}'
                    ET.SubElement(rels, '{' + P + '}Relationship', {'Id': rid, 'Type': R + '/image', 'Target': '../media/' + media})
                    anchor.find('.//a:blip', NS).set('{' + R + '}embed', rid)
                    # Mantener la proporción de la foto nueva dentro de la celda.
                    width, height = int(foto['width']) * 9525, int(foto['height']) * 9525
                    desde_anchor = anchor.find('d:from', NS)
                    hasta_anchor = anchor.find('d:to', NS)
                    alto_fila = float(muestra.get('ht', '129.95')) * 12700
                    desde_anchor.find('d:rowOff', NS).text = str(max(0, int((alto_fila-height)/2)))
                    hasta_anchor.find('d:col', NS).text = desde_anchor.find('d:col', NS).text
                    hasta_anchor.find('d:colOff', NS).text = str(int(desde_anchor.find('d:colOff', NS).text)+width)
                    hasta_anchor.find('d:row', NS).text = desde_anchor.find('d:row', NS).text
                    hasta_anchor.find('d:rowOff', NS).text = str(int(desde_anchor.find('d:rowOff', NS).text)+height)
                    extension = anchor.find('.//a:xfrm/a:ext', NS)
                    if extension is not None:
                        extension.set('cx', str(width)); extension.set('cy', str(height))
                if anchor is not None:
                    desde = int(anchor.find('d:from/d:row', NS).text)
                    delta = offset - 1 - desde
                    for v in anchor.findall('d:from/d:row', NS) + anchor.findall('d:to/d:row', NS):
                        v.text = str(int(v.text) + delta)
                    props = anchor.find('.//d:cNvPr', NS)
                    if props is not None:
                        props.set('id', str(offset))
                    dibujo.append(anchor)
                else:
                    valores['B'] = 'No Existe la Imagen'
            contenido = ''.join(celda(c, offset, valores.get(c), estilos.get(c, estilos.get('D'))) for c in 'BCDEFGHI')
            contenido += celda('J', offset, 0, estilos['J'], f'{nombre}[[#This Row],[PEDIDO]]*{nombre}[[#This Row],[PARES]]')
            contenido += ''.join(celda(c, offset, valores.get(c), estilos.get(c)) for c in 'KL')
            producto_importe = f'{nombre}[[#This Row],[PEDIDO]]*{nombre}[[#This Row],[PRECIO PAR MAYORISTA]]*{nombre}[[#This Row],[PARES]]'
            contenido += celda('M', offset, 0, estilos['M'], f'IF({nombre}[[#This Row],[PEDIDO]]=0,0,{producto_importe})')
            contenido += ''.join(celda(c, offset, valores.get(c), estilos.get(c)) for c in 'NOP')
            celdas.append(fila_xml + contenido + '</row>')
        ultimo = max(3, len(seleccion) + 2)
        limites[nombre] = ultimo
        xml = reemplazar_datos(xml, cabeceras + ''.join(celdas))
        xml = re.sub(r'<dimension ref="[^"]+"', f'<dimension ref="B1:P{ultimo}"', xml)
        xml = re.sub(r'sqref="I3:I\d+"', f'sqref="I3:I{ultimo}"', xml)
        xml = xml.replace('<formula1>H3</formula1>', '<formula1>IF(ISNUMBER(N3),H3,0)</formula1>')
        partes[parte] = xml.encode('utf-8')
        partes[drawing_part] = ET.tostring(dibujo, encoding='utf-8', xml_declaration=True)
        partes[rel_part] = ET.tostring(rels, encoding='utf-8', xml_declaration=True)
        table_part = f'xl/tables/table{i}.xml'
        tabla = partes[table_part].decode('utf-8')
        tabla = re.sub(r'ref="B2:P\d+"', f'ref="B2:P{ultimo}"', tabla)
        tabla = re.sub(r'ref="B3:P\d+"', f'ref="B3:P{ultimo}"', tabla)
        tabla = re.sub(r'ref="C2:C\d+"', f'ref="C2:C{ultimo}"', tabla)
        # El archivo descargado es una instantánea de la app, no un resultado de
        # la consulta externa original. Sus queryTableFieldId quedan obsoletos
        # al cambiar las filas y Excel intenta reparar el libro al abrirlo.
        tabla = tabla.replace(' tableType="queryTable"', '')
        tabla = re.sub(r' queryTableFieldId="[^"]*"', '', tabla)
        partes[table_part] = tabla.encode('utf-8')

    # Mantener las solapas y sus funciones de pedido, ajustando los rangos al lote.
    bloques = []
    inicio = 1
    for marca in MARCAS:
        if marca not in activas:
            continue
        fin = limites[marca]
        cells = ''
        for col, origen in [('A', 'F'), ('B', 'G'), ('C', 'I'), ('D', 'N')]:
            formula = f'_xlfn._xlws.FILTER({marca}!${origen}$3:${origen}${fin},{marca}!$I$3:$I${fin}>0,0)'
            if col == 'D':
                # N es el precio de la unidad completa: módulo o par suelto.
                # El mismo filtro de PEDIDO conserva la correspondencia por fila.
                formula = f'ROUND({formula}*1.21,2)'
            cells += f'<c r="{col}{inicio}" cm="1"><f t="array" ref="{col}{inicio}">{escape(formula)}</f><v>0</v></c>'
        bloques.append(f'<row r="{inicio}" spans="1:4">{cells}</row>')
        inicio += fin
    xml = partes['xl/worksheets/sheet10.xml'].decode('utf-8')
    xml = reemplazar_datos(xml, ''.join(bloques))
    xml = re.sub(r'<dimension ref="[^"]+"', f'<dimension ref="A1:D{inicio}"', xml)
    partes['xl/worksheets/sheet10.xml'] = xml.encode('utf-8')
    xml = partes['xl/worksheets/sheet11.xml'].decode('utf-8')
    # La fórmula original deja #VALUE! al no existir pedidos; el tercer argumento evita ese error inicial.
    xml = re.sub(r'(<f[^>]*>)(.*?)(</f>)', lambda m: m[1] + re.sub(r'\)$', ',&quot;&quot;)', m[2]) + m[3], xml)
    xml = re.sub(r' t="e"', '', xml)
    xml = xml.replace('<v>#VALUE!</v>', '<v></v>')
    xml = xml.replace('ref="A1:C2"', 'ref="A1:D2"')
    xml = xml.replace('spans="1:3"', 'spans="1:4"')
    xml = xml.replace('</cols>', '<col min="4" max="4" width="18.7109375" style="9" customWidth="1"/></cols>')
    xml = re.sub(r'(<row\b[^>]*r="1"[^>]*>)(.*?)(</row>)',
                 lambda m: m[1] + m[2] + celda('D', 1, 'PRECIO', '33') + m[3], xml, flags=re.S)
    formula_precio = '_xlfn._xlws.FILTER(CONSOLIDADO!$D$1:$D$70000,CONSOLIDADO!$A$1:$A$70000<>0,"")'
    precio = '<c r="D2" s="9" cm="1"><f t="array" ref="D2">' + escape(formula_precio) + '</f><v></v></c>'
    xml = re.sub(r'(<row\b[^>]*r="2"[^>]*>)(.*?)(</row>)', lambda m: m[1] + m[2] + precio + m[3], xml, flags=re.S)
    partes['xl/worksheets/sheet11.xml'] = xml.encode('utf-8')
    workbook = partes['xl/workbook.xml'].decode('utf-8')
    workbook = re.sub(r'<calcPr\b[^>]*/>', '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>', workbook)
    partes['xl/workbook.xml'] = workbook.encode('utf-8')
    # No conservar una cadena de cálculo con direcciones de filas que fueron reemplazadas.
    partes.pop('xl/calcChain.xml', None)
    for p in ['[Content_Types].xml', 'xl/_rels/workbook.xml.rels']:
        xml = partes[p].decode('utf-8')
        xml = re.sub(r'<(?:Override|Relationship)\b[^>]*(?:calcChain)[^>]*/>', '', xml)
        partes[p] = xml.encode('utf-8')
    content = partes['[Content_Types].xml'].decode('utf-8')
    for ext, tipo in [('jpeg', 'image/jpeg'), ('png', 'image/png')]:
        if f'Extension="{ext}"' not in content:
            content = content.replace('</Types>', f'<Default Extension="{ext}" ContentType="{tipo}"/></Types>')
    partes['[Content_Types].xml'] = content.encode('utf-8')
    for p in list(partes):
        if p.startswith('xl/queryTables/'):
            del partes[p]
        elif p.endswith('.rels') and p.startswith('xl/tables/'):
            xml = partes[p].decode('utf-8')
            xml = re.sub(r'<Relationship\b[^>]*Type="[^"]*/queryTable"[^>]*/>', '', xml)
            partes[p] = xml.encode('utf-8')
    content = partes['[Content_Types].xml'].decode('utf-8')
    content = re.sub(r'<Override\b[^>]*PartName="/xl/queryTables/[^"]*"[^>]*/>', '', content)
    # Ya no hay tablas que utilicen las conexiones de la plantilla. Evitar
    # que un archivo de stock estático siga ofreciendo ejecutar esas consultas.
    partes.pop('xl/connections.xml', None)
    content = re.sub(r'<Override\b[^>]*PartName="/xl/connections.xml"[^>]*/>', '', content)
    rel_workbook = partes['xl/_rels/workbook.xml.rels'].decode('utf-8')
    rel_workbook = re.sub(r'<Relationship\b[^>]*Type="[^"]*/connections"[^>]*/>', '', rel_workbook)
    partes['xl/_rels/workbook.xml.rels'] = rel_workbook.encode('utf-8')
    partes['[Content_Types].xml'] = content.encode('utf-8')
    omitir_marcas_sin_stock(partes, activas, cadenas)
    # Misma visualización al abrir cualquier solapa, incluidas las auxiliares.
    for parte in list(partes):
        if re.fullmatch(r'xl/worksheets/sheet\d+\.xml', parte):
            xml = partes[parte].decode('utf-8')
            def zoom_vista(m):
                tag = re.sub(r'\szoomScale(?:Normal|PageLayoutView|SheetLayoutView)?="[^"]*"', '', m.group())
                return re.sub(r'\s*/?>$', lambda fin: ' zoomScale="100" zoomScaleNormal="100"' + fin.group(), tag)
            xml = re.sub(r'<sheetView\b[^>]*>', zoom_vista, xml)
            partes[parte] = xml.encode('utf-8')
    optimizar_imagenes(partes)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as z:
        for p, b in partes.items():
            z.writestr(p, b)
    return buffer.getvalue()


def imagen_excel(contenido, extension):
    """Miniatura para la grilla; no modifica el original del repositorio."""
    try:
        with Image.open(io.BytesIO(contenido)) as origen:
            imagen = ImageOps.exif_transpose(origen)
            imagen.thumbnail((600, 600), Image.Resampling.LANCZOS)
            tiene_alpha = imagen.mode in ('RGBA', 'LA') or 'transparency' in imagen.info
            rgba = imagen.convert('RGBA') if tiene_alpha else None
            transparente = rgba is not None and rgba.getchannel('A').getextrema()[0] < 255
            salida = io.BytesIO()
            if transparente:
                rgba.save(salida, format='PNG', optimize=True)
                ext = 'png'
            else:
                imagen.convert('RGB').save(salida, format='JPEG', quality=82, optimize=True)
                ext = 'jpeg'
            resultado = salida.getvalue()
            # Una foto que ya es pequeña no debe terminar pesando más.
            return (resultado, ext) if len(resultado) < len(contenido) else (contenido, extension)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        return contenido, extension


def optimizar_imagenes(partes):
    """Conservar solo medios utilizados y compartir un binario por foto."""
    cache = {}
    generadas = {}
    for dibujo in list(partes):
        if not re.fullmatch(r'xl/drawings/drawing\d+\.xml', dibujo):
            continue
        root = ET.fromstring(partes[dibujo])
        usados = {v for nodo in root.iter() for k, v in nodo.attrib.items()
                  if k in ('{' + R + '}embed', '{' + R + '}link')}
        relaciones = posixpath.join(posixpath.dirname(dibujo), '_rels', posixpath.basename(dibujo) + '.rels')
        if relaciones not in partes:
            continue
        rels = ET.fromstring(partes[relaciones])
        for rel in list(rels):
            if not rel.get('Type', '').endswith('/image') or rel.get('TargetMode') == 'External':
                continue
            if rel.get('Id') not in usados:
                rels.remove(rel)
                continue
            destino = rel.get('Target', '')
            archivo = destino.lstrip('/') if destino.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(dibujo), destino))
            if not archivo.startswith('xl/media/') or archivo not in partes:
                continue
            contenido = partes[archivo]
            huella = hashlib.sha256(contenido).hexdigest()
            if huella not in cache:
                extension = posixpath.splitext(archivo)[1].lstrip('.').lower()
                if posixpath.basename(archivo).startswith('grilla_'):
                    reducido, ext = contenido, extension
                else:
                    reducido, ext = imagen_excel(contenido, extension)
                nuevo = 'xl/media/grilla_' + hashlib.sha256(reducido).hexdigest() + '.' + ext
                generadas[nuevo] = reducido
                cache[huella] = nuevo
            rel.set('Target', posixpath.relpath(cache[huella], posixpath.dirname(dibujo)))
        partes[relaciones] = ET.tostring(rels, encoding='utf-8', xml_declaration=True)
    partes.update(generadas)
    conservar = set()
    # Respetar también imágenes referidas por otras partes del archivo, si existen.
    for nombre in list(partes):
        if not nombre.endswith('.rels'):
            continue
        base = posixpath.dirname(posixpath.dirname(nombre))
        for rel in ET.fromstring(partes[nombre]):
            if rel.get('TargetMode') == 'External':
                continue
            destino = rel.get('Target', '')
            archivo = destino.lstrip('/') if destino.startswith('/') else posixpath.normpath(posixpath.join(base, destino))
            if archivo.startswith('xl/media/'):
                conservar.add(archivo)
    for nombre in list(partes):
        if nombre.startswith('xl/media/') and nombre not in conservar:
            del partes[nombre]
    content = partes['[Content_Types].xml'].decode('utf-8')
    for ext, tipo in [('jpeg', 'image/jpeg'), ('png', 'image/png')]:
        if f'Extension="{ext}"' not in content:
            content = content.replace('</Types>', f'<Default Extension="{ext}" ContentType="{tipo}"/></Types>')
    content = re.sub(r'<Override\b[^>]*PartName="/(xl/media/[^"]*)"[^>]*/>',
                     lambda m: m.group() if m[1] in partes else '', content)
    partes['[Content_Types].xml'] = content.encode('utf-8')


def omitir_marcas_sin_stock(partes, activas, cadenas):
    """Quitar solapas sin dejar fórmulas ni nombres locales apuntando a ellas."""
    nombres = MARCAS + ['RESUMEN', 'CONSOLIDADO', 'PEDIDO', 'RUTA_IMAGEN']
    conservadas = [n for n in nombres if n not in MARCAS or n in activas]
    indices = {i: conservadas.index(n) for i, n in enumerate(nombres) if n in conservadas}
    workbook = partes['xl/workbook.xml'].decode('utf-8')
    rels = partes['xl/_rels/workbook.xml.rels'].decode('utf-8')
    tipos = partes['[Content_Types].xml'].decode('utf-8')
    for i, nombre in enumerate(MARCAS, 1):
        if nombre in activas:
            continue
        workbook = re.sub(r'<sheet\b[^>]*name="' + nombre + r'"[^>]*/>', '', workbook)
        rels = re.sub(r'<Relationship\b[^>]*Id="rId' + str(i) + r'"[^>]*/>', '', rels)
        for p in [f'xl/worksheets/sheet{i}.xml', f'xl/worksheets/_rels/sheet{i}.xml.rels',
                  f'xl/tables/table{i}.xml', f'xl/tables/_rels/table{i}.xml.rels',
                  f'xl/drawings/drawing{i}.xml', f'xl/drawings/_rels/drawing{i}.xml.rels']:
            partes.pop(p, None)
            tipos = re.sub(r'<Override\b[^>]*PartName="/' + re.escape(p) + r'"[^>]*/>', '', tipos)
    def nombre_local(m):
        texto = m.group()
        local = re.search(r'localSheetId="(\d+)"', texto)
        if local:
            indice = int(local[1])
            if indice not in indices:
                return ''
            texto = texto.replace(local.group(), f'localSheetId="{indices[indice]}"')
        return texto
    workbook = re.sub(r'<definedName\b.*?</definedName>', nombre_local, workbook, flags=re.S)
    workbook = re.sub(r'activeTab="\d+"', 'activeTab="0"', workbook)
    workbook = re.sub(r'firstSheet="\d+"', 'firstSheet="0"', workbook)
    partes['xl/workbook.xml'] = workbook.encode('utf-8')
    partes['xl/_rels/workbook.xml.rels'] = rels.encode('utf-8')
    partes['[Content_Types].xml'] = tipos.encode('utf-8')

    # Compactar las filas de marcas del resumen conservando cada estilo original.
    xml = partes['xl/worksheets/sheet9.xml'].decode('utf-8')
    root = ET.fromstring(xml)
    etiquetas = {}
    for row in root.findall('s:sheetData/s:row', NS):
        numero = int(row.get('r'))
        if 6 <= numero <= 13:
            valor = texto_celda(row.find(f"s:c[@r='C{numero}']", NS), cadenas)
            etiquetas[numero] = valor.replace(' ', '_')
    siguiente = 6
    filas = []
    for m in re.finditer(r'<row\b[^>]*\br="(\d+)"[^>]*(?:/>|>.*?</row>)', re.search(r'<sheetData>(.*?)</sheetData>', xml, re.S)[1], re.S):
        numero = int(m[1]); texto = m.group()
        if 6 <= numero <= 13:
            if etiquetas.get(numero) not in activas:
                continue
            nuevo = siguiente; siguiente += 1
        elif numero == 14:
            nuevo = siguiente
            texto = re.sub(r'(?P<col>[D-G])6:(?P=col)13', lambda v: v['col'] + '6:' + v['col'] + str(max(6, siguiente-1)), texto)
        else:
            nuevo = numero
        texto = re.sub(r'\br="([A-Z]*)' + str(numero) + '"', lambda v: 'r="' + v[1] + str(nuevo) + '"', texto)
        filas.append(texto)
    xml = reemplazar_datos(xml, ''.join(filas))
    xml = re.sub(r'<dimension ref="[^"]+"', f'<dimension ref="C1:H{siguiente}"', xml)
    partes['xl/worksheets/sheet9.xml'] = xml.encode('utf-8')
    if 'docProps/app.xml' in partes:
        app = partes['docProps/app.xml'].decode('utf-8')
        app = re.sub(r'<TitlesOfParts>.*?</TitlesOfParts>',
                     '<TitlesOfParts><vt:vector size="' + str(len(conservadas)) + '" baseType="lpstr">' +
                     ''.join('<vt:lpstr>' + n + '</vt:lpstr>' for n in conservadas) + '</vt:vector></TitlesOfParts>', app, flags=re.S)
        app = re.sub(r'(<vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>)\d+', lambda m: m[1] + str(len(conservadas)), app)
        partes['docProps/app.xml'] = app.encode('utf-8')


def main():
    datos = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    with zipfile.ZipFile(sys.argv[1]) as z:
        original = {p: z.read(p) for p in z.namelist()}
    faltantes = {f['marca'] for f in datos['filas']} - {m.replace('_', ' ') for m in MARCAS}
    if faltantes:
        raise ValueError('La plantilla no contiene solapa para: ' + ', '.join(sorted(faltantes)))
    depositos = sorted({f['deposito'] for f in datos['filas']}) if datos.get('separar') else [None]
    archivos = []
    for deposito in depositos:
        filas = [f for f in datos['filas'] if deposito is None or f['deposito'] == deposito]
        for lista in datos['listas']:
            nombre = datos.get('nombreArchivo', 'Grilla Stock - Sin vista - Vendedores') + '.xlsx'
            if len(depositos)*len(datos['listas']) > 1:
                nombre = f'Lista {lista}/' + (f'Deposito {deposito}/' if deposito else '') + nombre
            archivos.append((nombre, render_libro(original, datos, lista, filas)))
    with open(sys.argv[2], 'wb') as f:
        if len(archivos) == 1:
            f.write(archivos[0][1])
        else:
            with zipfile.ZipFile(f, 'w', zipfile.ZIP_STORED) as z:
                for nombre, contenido in archivos:
                    z.writestr(nombre, contenido)


if __name__ == '__main__':
    main()
