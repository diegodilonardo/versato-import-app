import importlib.util
import pathlib
import re
import unittest
import zipfile
import io
import base64
import xml.etree.ElementTree as ET
from PIL import Image

BASE = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('plantilla', BASE / 'scripts/plantilla-grilla.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class PlantillaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with zipfile.ZipFile(BASE / 'src/config/plantillas/Grilla Versato Stock - Vendedores.xlsx') as z:
            cls.original = {f: z.read(f) for f in z.namelist()}
        cls.fila = dict(marca='VIZZANO', codigo='123', alfa='ALFA_TEST', productoFoto='1122.806.7286.15745',
                        color='NEGRO', curva='35:1 36:2 37:3 38:3 39:2 40:1', paresUnidad=12, cantidad=4,
                        precios={'03':1200, '04':1260}, deposito='203')

    def libro(self, filas, lista='03'):
        data = p.render_libro(self.original, {'fotos':{}}, lista, filas)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return {f:z.read(f) for f in z.namelist()}

    def test_formato_y_solapas_originales(self):
        libro = self.libro([{**self.fila,'marca':m.replace('_',' ')} for m in p.MARCAS])
        for parte in ['xl/styles.xml','xl/theme/theme1.xml']:
            self.assertEqual(libro[parte], self.original[parte])
        for parte in ['xl/worksheets/sheet9.xml','xl/worksheets/sheet12.xml']:
            self.assertEqual(re.search(rb'<sheetData>.*?</sheetData>',libro[parte]).group(),re.search(rb'<sheetData>.*?</sheetData>',self.original[parte]).group())
        self.assertEqual(re.search(rb'<sheets>.*?</sheets>',libro['xl/workbook.xml']).group(),
                         re.search(rb'<sheets>.*?</sheets>',self.original['xl/workbook.xml']).group())
        for i in range(1,9):
            a=self.original[f'xl/worksheets/sheet{i}.xml'].decode()
            b=libro[f'xl/worksheets/sheet{i}.xml'].decode()
            for tag in ['cols','sheetProtection','pageSetup','headerFooter']:
                patron='<'+tag+r'\b.*?(?:/>|</'+tag+'>)'
                x=re.search(patron,a,re.S); y=re.search(patron,b,re.S)
                self.assertEqual(x.group() if x else None,y.group() if y else None)
        for parte,data in libro.items():
            if re.fullmatch(r'xl/worksheets/sheet\d+\.xml',parte):
                for vista in ET.fromstring(data).findall('s:sheetViews/s:sheetView',{'s':p.S}):
                    self.assertEqual(vista.get('zoomScale'),'100')
                    self.assertEqual(vista.get('zoomScaleNormal'),'100')

    def test_datos_precios_y_tablas_sin_productos_anteriores(self):
        libro=self.libro([self.fila], '04'); ns={'s':p.S}
        root=ET.fromstring(libro['xl/worksheets/sheet1.xml'])
        cells={c.get('r'):c for c in root.findall('.//s:sheetData/s:row/s:c',ns)}
        self.assertEqual(cells['F3'].find('s:is/s:t',ns).text,'123')
        self.assertEqual(float(cells['K3'].find('s:v',ns).text),105)
        self.assertEqual(float(cells['N3'].find('s:v',ns).text),1260)
        self.assertEqual(cells['I3'].find('s:v',ns).text,'0')
        self.assertNotIn('F4',cells)
        self.assertEqual(ET.fromstring(libro['xl/tables/table1.xml']).get('ref'),'B2:P3')
        for parte,data in libro.items():
            if parte.endswith(('.xml','.rels')):
                ET.fromstring(data)

    def test_sin_consultas_obsoletas_que_excel_intenta_reparar(self):
        libro=self.libro([self.fila])
        self.assertFalse(any(p.startswith('xl/queryTables/') for p in libro))
        self.assertNotIn('xl/connections.xml',libro)
        self.assertNotIn('xl/calcChain.xml',libro)
        for parte,data in libro.items():
            if parte.endswith('.rels'):
                self.assertNotIn(b'/queryTable"',data)
                self.assertNotIn(b'/connections"',data)
            if parte.startswith('xl/tables/')and parte.endswith('.xml'):
                root=ET.fromstring(data)
                self.assertNotEqual(root.get('tableType'),'queryTable')
                self.assertNotIn(b'queryTableFieldId=',data)

    def test_pedido_precio_con_iva_por_modulo_o_suelto_alineado_con_su_codigo(self):
        modulo=self.fila
        suelto={**self.fila,'codigo':'456','alfa':'SUELTO','paresUnidad':1,'precios':{'03':100},'cantidad':5}
        libro=self.libro([modulo,suelto]);ns={'s':p.S}
        pedido=ET.fromstring(libro['xl/worksheets/sheet11.xml'])
        self.assertEqual(pedido.find("s:sheetData/s:row[@r='1']/s:c[@r='D1']/s:is/s:t",ns).text,'PRECIO')
        formula=pedido.find("s:sheetData/s:row[@r='2']/s:c[@r='D2']/s:f",ns).text
        self.assertIn('CONSOLIDADO!$D$1:$D$70000',formula)
        self.assertIn('CONSOLIDADO!$A$1:$A$70000<>0',formula)
        helper=ET.fromstring(libro['xl/worksheets/sheet10.xml'])
        formula=helper.find("s:sheetData/s:row[@r='1']/s:c[@r='D1']/s:f",ns).text
        self.assertEqual(formula,'ROUND(_xlfn._xlws.FILTER(VIZZANO!$N$3:$N$4,VIZZANO!$I$3:$I$4>0,0)*1.21,2)')
        self.assertEqual(1200*1.21,1452)
        self.assertEqual(100*1.21,121)

    def test_comprime_comparte_y_conserva_solo_las_fotos_de_las_filas_exportadas(self):
        imagen=Image.effect_noise((1800,1200),40).convert('RGB')
        buffer=io.BytesIO();imagen.save(buffer,format='JPEG',quality=95)
        foto=buffer.getvalue()
        fotos={self.fila['productoFoto']:{'dataUrl':'data:image/jpeg;base64,'+base64.b64encode(foto).decode(),'width':130,'height':87}}
        datos=p.render_libro(self.original,{'fotos':fotos},'03',[self.fila,{**self.fila,'codigo':'456','alfa':'OTRO'}])
        with zipfile.ZipFile(io.BytesIO(datos))as z:
            medios=[n for n in z.namelist()if n.startswith('xl/media/')]
            self.assertEqual(len(medios),1)
            self.assertLess(len(z.read(medios[0])),len(foto))
            im=Image.open(io.BytesIO(z.read(medios[0])))
            self.assertEqual(im.size,(600,400))
            dibujo=ET.fromstring(z.read('xl/drawings/drawing1.xml'))
            self.assertEqual(len(dibujo),2)
            rels=ET.fromstring(z.read('xl/drawings/_rels/drawing1.xml.rels'))
            destinos={r.get('Target')for r in rels if r.get('Type','').endswith('/image')}
            self.assertEqual(len(destinos),1)
            partes={n:z.read(n)for n in z.namelist()}
            antes=dict(partes);p.optimizar_imagenes(partes)
            self.assertEqual([v for n,v in antes.items()if n.startswith('xl/media/')],
                             [v for n,v in partes.items()if n.startswith('xl/media/')])

    def test_conserva_transparencia_en_las_miniaturas_png(self):
        im=Image.new('RGBA',(1800,1200),(30,80,60,0))
        im.paste((20,50,100,255),(100,100,1500,1000))
        buffer=io.BytesIO();im.save(buffer,format='PNG')
        data,ext=p.imagen_excel(buffer.getvalue(),'png')
        self.assertEqual(ext,'png')
        salida=Image.open(io.BytesIO(data))
        self.assertEqual(salida.size,(600,400))
        self.assertEqual(salida.getextrema()[3][0],0)

    def test_omite_marcas_sin_stock_y_ajusta_resumen_y_nombres_locales(self):
        libro=self.libro([{**self.fila,'marca':'MODARE'}, {**self.fila,'cantidad':0}, {**self.fila,'marca':'MOLECA','cantidad':-1}])
        ns={'s':p.S}
        wb=ET.fromstring(libro['xl/workbook.xml'])
        nombres=[s.get('name')for s in wb.find('s:sheets',ns)]
        self.assertEqual(nombres,['MODARE','RESUMEN','CONSOLIDADO','PEDIDO','RUTA_IMAGEN'])
        self.assertNotIn('xl/worksheets/sheet1.xml',libro)
        self.assertNotIn('xl/tables/table1.xml',libro)
        for nombre in wb.findall('s:definedNames/s:definedName',ns):
            if nombre.text.startswith('MODARE!'):self.assertEqual(nombre.get('localSheetId'),'0')
            if nombre.text.startswith('RESUMEN!'):self.assertEqual(nombre.get('localSheetId'),'1')
        resumen=ET.fromstring(libro['xl/worksheets/sheet9.xml'])
        self.assertEqual(resumen.find("s:sheetData/s:row[@r='6']/s:c[@r='C6']/s:v",ns).text,
                         ET.fromstring(self.original['xl/worksheets/sheet9.xml']).find("s:sheetData/s:row[@r='7']/s:c[@r='C7']/s:v",ns).text)
        for parte in ['xl/worksheets/sheet9.xml','xl/worksheets/sheet10.xml']:
            for formula in ET.fromstring(libro[parte]).findall('.//s:f',ns):
                self.assertNotIn('VIZZANO!',formula.text)
                self.assertNotIn('MOLECA!',formula.text)
        self.assertEqual(resumen.find("s:sheetData/s:row[@r='7']/s:c[@r='D7']/s:f",ns).text,'SUM(D6:D6)')


if __name__=='__main__':
    unittest.main()
