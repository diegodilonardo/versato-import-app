const {test}=require('node:test');const assert=require('node:assert/strict');const {parsearMarcas,completarDatosModulos,RUBROS}=require('../src/services/marcas');
test('Marca FTP, ceros, descripción y talles por módulo sin multiplicar cajas',()=>{
 const productos={modulos:{filas:[{PRODUCTO:'1.2.3.4',SIZE_RUN:'1',DMODC:'1-2-3',DMARCA:'VIZZANO',MODC:'V00001',COD_ALFA:'2611V0000181000'}],resumen:{},nota:''}};
 const datos={STYLE:'1.2',MATERIAL_CODE:'3',COLOR_CODE:'4',SIZE_RUN:'1',BOXES:'10',TALLE:'34 35 36/37',CANTIDAD:'1 2 3',DESCRIPCION_COLOR:'NEGRO'};
 const previews={PACKING_LIST:{registros:[{errores:[],datos},{errores:[],datos:{...datos,BOXES:'5'}}]}};
 const marcas={...parsearMarcas('9000|VIZZANO|VIZZANO'),disponible:true};completarDatosModulos(productos,previews,marcas);
 const r=productos.modulos.filas[0];assert.equal(r.MARCA,9000);assert.equal(r.COLORC,'00');assert.equal(r.TALLC,'00');assert.equal(r.DCOLORC,'NEGRO');assert.equal(r.DTALLC,'34:1 35:2 36/37:3');assert.equal(r.PARES,6);assert.equal(RUBROS.ACCESORIOS,3);
 assert.equal(r.NIVEL,950);assert.equal(r.ORIG_PRO,2);assert.equal(r.DET_ORIGEN,'IMPORTADO');assert.equal(r.COD_GRUPOC,'99');assert.equal(r.COD_SUBG,'99');assert.equal(r.LINEA,'9999');assert.equal(r.COD_TEM,1);assert.equal(r.DCOD_TEM,'IN');assert.equal(require('../src/config/reglasPresea').NIVELES.SUELTO,900);
 assert.equal(r.DETALLE,'1-2-3 NEGRO - SZ: 1');assert.equal(r.PAIS,4);assert.equal(r.NOMB_ART,'1-2-3 | NEGRO | 34:1 35:2 36/37:3');
 previews.PACKING_LIST.registros[1].datos.CANTIDAD='2 1 3';completarDatosModulos(productos,previews,marcas);assert.equal(r.DTALLC,null);assert.equal(r.estado,'REVISAR_DATOS_MODULO');
 assert.throws(()=>parsearMarcas('9000|VIZZANO|A\n9001|VIZZANO|B'),/duplicada/);
});
