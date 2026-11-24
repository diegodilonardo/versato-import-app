const {sql}=require('./sqlServer'),{gzipSync}=require('zlib');const XLSX=require('xlsx'),{leerLibro}=require('./leerLibro');
const tablas={
 PACKING_LIST:{nombre:'PackingListDatos',texto:['PRODUCTO','STYLE','MATERIAL_CODE','COLOR_CODE','SIZE_RUN','MARCA','DESCRIPCION','DESCRIPCION_MATERIAL','DESCRIPCION_COLOR','SHOP','TALLE','CANTIDAD'],numero:['BOXES','PAIRS']},
 CODIGOS_BARRA:{nombre:'CodigosBarraDatos',texto:['PRODUCTO','CAJA_MASTER','LINHA','REFERENCIA','CABEDAL','COR','FACTURA','CODIGO_BARRA','CODIGO_CAJA','LOJAS','TALLE','CANTIDAD'],numero:['PARES']},
 EAN:{nombre:'EansDatos',texto:['PRODUCTO','STYLE','CABEDAL','COR','MARCA','TALLE','EAN'],numero:['PARES']},
 FACTURA:{nombre:'FacturasDatos',texto:['PRODUCTO','STYLE','MATERIAL_CODE','COLOR_CODE','SIZE_RUN','MARCA'],numero:['BOXES','PAIRS','UNIT','AMOUNT']}
};
const numero=v=>v==null||String(v).trim()===''?null:Number.isFinite(Number(String(v).replace(',','.')))&&Math.abs(Number(String(v).replace(',','.')))<1e20?Number(String(v).replace(',','.')):null;
function prepararFila(tipo,r,archivo,hoja,preview){
 const d=r.datos,origen=archivo.deteccion.encabezados.map(h=>{const c=hoja[h.columna+r.fila];return{columna:h.columna,encabezado:h.texto,valor:c?.v??null,texto:c?XLSX.utils.format_cell(c):'',formula:c?.f||null};});
 const valorNumerico=k=>{if(r.valores&&k in r.valores)return numero(r.valores[k]);if(tipo==='EAN'&&k==='PARES')return numero(r.paresNumericos);const col=preview.mapeo?.find(m=>m.destino===k)?.columna;return numero(col?hoja[col+r.fila]?.v:d[k]);};
 const producto=tipo==='CODIGOS_BARRA'?[d.LINHA,d.REFERENCIA,d.CABEDAL,d.COR]:[d.STYLE,tipo==='EAN'?d.CABEDAL:d.MATERIAL_CODE,tipo==='EAN'?d.COR:d.COLOR_CODE];
 const tipados={...d,PRODUCTO:producto.every(v=>v!=null&&v!=='')?producto.join('.'):null,FACTURA:d.Factura||null};for(const k of tablas[tipo].numero)tipados[k]=valorNumerico(k);
 const talles=String(d.TALLE||'').trim().split(/\s+/).filter(Boolean),cantidades=String(d.CANTIDAD||'').trim().split(/\s+/).filter(Boolean);
 return{fila:r.fila,valida:!(r.errores||[]).length,errores:r.errores||[],advertencias:r.advertencias||[],origen,datos:d,tipados,talles:['PACKING_LIST','CODIGOS_BARRA'].includes(tipo)?talles.map((t,i)=>({posicion:i+1,talle:t,cantidad:numero(cantidades[i])})):[]};
}
async function guardarDatosArchivos(tx,id,resultado,files){
 const previews=resultado.datosPersistencia;if(!previews)return;let total=0;
 for(let i=0;i<resultado.archivos.length;i++){
  const a=resultado.archivos[i],file=files[i],preview=previews[a.tipo],tabla=tablas[a.tipo];if(!file||!preview||!tabla)throw new Error('Faltan los datos de origen del análisis.');
  await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('tipo',sql.NVarChar(40),a.tipo).input('contenido',sql.VarBinary(sql.MAX),gzipSync(file.buffer)).query('INSERT versato.ContenidoOrigen(AnalisisId,Tipo,Contenido)VALUES(@id,@tipo,@contenido)');
  const libro=leerLibro(file.buffer,{sheets:[a.hoja],sheetRows:50101}),hoja=libro.Sheets[a.hoja];
  const columnas=[...tabla.texto,...tabla.numero],withCols=[...tabla.texto.map(c=>`[${c}] nvarchar(max) '$.${c}'`),...tabla.numero.map(c=>`[${c}] decimal(28,8) '$.${c}'`)];
  for(let start=0;start<preview.registros.length;start+=500){const filas=preview.registros.slice(start,start+500).map(r=>prepararFila(a.tipo,r,a,hoja,preview));total+=filas.length;
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('tipo',sql.NVarChar(40),a.tipo).input('filas',sql.NVarChar(sql.MAX),JSON.stringify(filas)).query(`
    INSERT versato.FilasOrigen(AnalisisId,Tipo,FilaExcel,EsValida,Errores,Advertencias,Original,Normalizado)
    SELECT @id,@tipo,j.fila,j.valida,j.errores,j.advertencias,j.origen,j.datos FROM OPENJSON(@filas) WITH(fila int,valida bit,errores nvarchar(max) AS JSON,advertencias nvarchar(max) AS JSON,origen nvarchar(max) AS JSON,datos nvarchar(max) AS JSON)j;
    INSERT versato.${tabla.nombre}(FilaId,${columnas.map(c=>'['+c+']').join(',')})
    SELECT r.Id,${columnas.map(c=>'t.['+c+']').join(',')} FROM OPENJSON(@filas)WITH(fila int,tipados nvarchar(max) AS JSON)j CROSS APPLY OPENJSON(j.tipados)WITH(${withCols.join(',')})t JOIN versato.FilasOrigen r ON r.AnalisisId=@id AND r.Tipo=@tipo AND r.FilaExcel=j.fila;
    INSERT versato.TallesOrigen(FilaId,Posicion,TALLE,CANTIDAD) SELECT r.Id,t.posicion,t.talle,t.cantidad FROM OPENJSON(@filas)WITH(fila int,talles nvarchar(max) AS JSON)j CROSS APPLY OPENJSON(j.talles)WITH(posicion int,talle nvarchar(max),cantidad decimal(28,8))t JOIN versato.FilasOrigen r ON r.AnalisisId=@id AND r.Tipo=@tipo AND r.FilaExcel=j.fila;
   `);
  }
 }
 const cruces=(resultado.filas||[]).map((r,i)=>({posicion:i+1,PRODUCTO:[r.STYLE,r.MATERIAL,r.COLOR].join('.'),STYLE:r.STYLE,MATERIAL:r.MATERIAL,COLOR:r.COLOR,TALLE:r.TALLE,PACKING_LIST:r.PACKING_LIST,CODIGOS_BARRA:r.CODIGOS_BARRA,EAN:r.EAN,Estado:r.estado,Problemas:r.problemas,origen:Object.entries(r.filas||{}).flatMap(([tipo,filas])=>filas.map(fila=>({tipo,fila})))}));
 for(let start=0;start<cruces.length;start+=500)await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('cruces',sql.NVarChar(sql.MAX),JSON.stringify(cruces.slice(start,start+500))).query(`
  INSERT versato.CrucesCantidades SELECT @id,posicion,PRODUCTO,STYLE,MATERIAL,COLOR,TALLE,PACKING_LIST,CODIGOS_BARRA,EAN,Estado,Problemas FROM OPENJSON(@cruces)WITH(posicion int,PRODUCTO nvarchar(max),STYLE nvarchar(max),MATERIAL nvarchar(max),COLOR nvarchar(max),TALLE nvarchar(max),PACKING_LIST decimal(28,8),CODIGOS_BARRA decimal(28,8),EAN decimal(28,8),Estado nvarchar(max),Problemas nvarchar(max) AS JSON);
  INSERT versato.CruceOrigen SELECT @id,j.posicion,r.Id FROM OPENJSON(@cruces)WITH(posicion int,origen nvarchar(max) AS JSON)j CROSS APPLY OPENJSON(j.origen)WITH(tipo nvarchar(40),fila int)t JOIN versato.FilasOrigen r ON r.AnalisisId=@id AND r.Tipo=t.tipo AND r.FilaExcel=t.fila;
 `);
 await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('total',sql.Int,total).query('INSERT versato.ConjuntosDatos(AnalisisId,Filas)VALUES(@id,@total)');
}
module.exports={prepararFila,numero,guardarDatosArchivos};
