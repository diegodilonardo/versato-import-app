import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

// El motor se mantiene fuera del repositorio y puede configurarse en otra instalación.
const runtime=process.env.STOCK_EXCEL_RUNTIME || path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const resolve=createRequire(path.join(runtime,'__stock_loader.cjs'));
const {Workbook,SpreadsheetFile,FileBlob}=await import(pathToFileURL(resolve.resolve('@oai/artifact-tool')).href);
if(process.argv[2]==='referencia'){
 const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(process.argv[3]));
 const png=await wb.render({sheetName:'VIZZANO',range:'B1:M4',scale:1,format:'png'});
 await fs.writeFile(process.argv[4],new Uint8Array(await png.arrayBuffer()));
 process.exit(0);
}

export function construir(datos){
 const wb=Workbook.create(),resumen=wb.worksheets.add('RESUMEN');
 const monedas='"$" #,##0.00';
 const hojas=[];
 const estilo=(s,fin)=>{
  s.showGridLines=false;
  s.getRange(`B1:Q${fin}`).format.font={name:'Arial',size:10,color:'#233C35'};
  s.getRange(`B1:Q${fin}`).format.verticalAlignment='center';
  s.getRange(`B1:Q${fin}`).format.horizontalAlignment='center';
  s.getRange('A:A').format.columnWidth=3;
 };
 for(const marca of [...new Set(datos.filas.map(r=>r.marca))].sort())for(const lista of datos.listas){
  const filas=datos.filas.filter(r=>r.marca===marca);
  const nombre=(marca.replace(/[\\/?*\[\]:]/g,'_').slice(0,25)+' '+lista).slice(0,31);
  const s=wb.worksheets.add(nombre),ultimo=filas.length+4,total=ultimo+1;
  estilo(s,total);s.tabColor='#214D3F';
  s.mergeCells('B1:Q1');s.getRange('B1').values=[[`GRILLA PRODUCTOS INDUSTRIAS VERSATO · ${marca} · LISTA ${lista}`]];
  s.getRange('B1:Q1').format={fill:'#203D34',font:{name:'Arial',size:18,color:'#FFFFFF'},rowHeight:34};
  s.mergeCells('B2:Q2');s.getRange('B2').values=[[`Stock al ${datos.fechaTexto} · Precios Presea al ${datos.fechaPreciosTexto}`]];
  s.getRange('B2:Q2').format.rowHeight=24;
  s.mergeCells('B3:Q3');s.getRange('B3').values=[['Completá PEDIDO en módulos o unidades sueltas. Los precios por par incluyen la lista indicada.']];
  s.getRange('B3:Q3').format.rowHeight=24;
  const encabezados=['IMAGEN','PRODUCTO BEIRA','COLOR','CURVA / TALLE','CÓDIGO','COD_ALFA','STOCK','PEDIDO','TOTAL PARES','PRECIO PAR MAYORISTA','PRECIO PAR PÚBLICO','SUBTOTAL','PRECIO UNIDAD','PARES / UNIDAD','TIPO','DEPÓSITO'];
  s.getRange('B4:Q4').values=[encabezados];
  s.getRange('B4:Q4').format={fill:'#203D34',font:{name:'Arial',bold:true,color:'#FFFFFF'},wrapText:true,rowHeight:34};
  const matriz=filas.map(r=>{
   const precio=r.precios[lista],valido=typeof precio==='number'&&r.paresUnidad>0;
   return [datos.fotos[r.productoFoto]?'':'Sin foto',r.productoFoto.replace(/\./g,'-'),r.colorCompleto||r.color,r.curva,r.codigo,r.alfa,r.cantidad,0,null,
    valido?precio/r.paresUnidad:(typeof precio==='string'?precio:'Sin precio'),null,null,valido?precio:(typeof precio==='string'?precio:'Sin precio'),r.paresUnidad,r.tipo,r.depositoTexto];
  });
  s.getRange(`B5:Q${ultimo}`).values=matriz;
  s.getRange(`B5:Q${ultimo}`).format.rowHeight=90;
  s.getRange(`B5:Q${ultimo}`).format.wrapText=true;
  // Escribir cada columna completa evita recalcular el libro una vez por celda.
  s.getRange(`J5:J${ultimo}`).formulas=filas.map((_,i)=>[`=I${i+5}*O${i+5}`]);
  s.getRange(`L5:L${ultimo}`).formulas=filas.map((f,i)=>[typeof f.precios[lista]==='number'&&f.paresUnidad>0?`=K${i+5}*2`:'="Sin precio"']);
  s.getRange(`M5:M${ultimo}`).formulas=filas.map((f,i)=>[typeof f.precios[lista]==='number'&&f.paresUnidad>0?`=I${i+5}*N${i+5}`:`=IF(I${i+5}=0,0,"Sin precio")`]);
  s.getRange(`I5:I${ultimo}`).dataValidation={rule:{type:'whole',operator:'between',formula1:0,formula2:'IF(ISNUMBER(N5),MAX(0,INT(H5)),0)'}};
  for(let i=0;i<filas.length;i++){
   const r=i+5,f=filas[i];
   s.getRange(`B${r}:Q${r}`).format.fill=i%2?'#F4F7F2':'#E6EEDC';
   const foto=datos.fotos[f.productoFoto];
   if(foto)s.images.add({dataUrl:foto.dataUrl,anchor:{from:{row:r-1,col:1,colOffsetPx:4,rowOffsetPx:4},extent:{widthPx:foto.width,heightPx:foto.height}}});
  }
  s.getRange(`I5:I${ultimo}`).format.fill='#FFE6A6';
  s.getRange(`H5:J${total}`).setNumberFormat('#,##0');
  s.getRange(`K5:N${total}`).setNumberFormat(monedas);
  s.getRange(`O5:O${total}`).setNumberFormat('#,##0');
  s.getRange(`B${total}:Q${total}`).format={fill:'#203D34',font:{name:'Arial',bold:true,color:'#FFFFFF'},rowHeight:28};
  s.getRange(`C${total}`).values=[['TOTAL']];
  for(const col of ['I','J','M'])s.getRange(`${col}${total}`).formulas=[[`=SUM(${col}5:${col}${ultimo})`]];
  const widths={B:20,C:25,D:23,E:30,F:15,G:23,H:10,I:10,J:13,K:18,L:18,M:18,N:18,O:12,P:12,Q:28};
  for(const [col,w]of Object.entries(widths))s.getRange(`${col}:${col}`).format.columnWidth=w;
  s.freezePanes.freezeRows(4);
  s.getRange(`I5:I${ultimo}`).conditionalFormats.addCustom(`I5>H5`,{fill:'#FDE1DE',font:{color:'#A32323',bold:true}});
  hojas.push({s,nombre,marca,lista,ultimo});
 }
 estilo(resumen,hojas.length+10);resumen.tabColor='#214D3F';
 resumen.mergeCells('B1:H1');resumen.getRange('B1').values=[['RESUMEN DEL PEDIDO']];
 resumen.getRange('B1:H1').format={fill:'#203D34',font:{name:'Arial',size:18,color:'#FFFFFF'},rowHeight:34};
 resumen.getRange('B2').values=[['CLIENTE']];resumen.mergeCells('C2:E2');
 resumen.getRange('F2').values=[['SUCURSAL']];resumen.mergeCells('G2:H2');
 resumen.getRange('B3').values=[['OBSERVACIONES']];resumen.mergeCells('C3:H3');
 resumen.getRange('C2:E2').format.fill='#FFE6A6';resumen.getRange('G2:H2').format.fill='#FFE6A6';resumen.getRange('C3:H3').format.fill='#FFE6A6';
 resumen.mergeCells('B4:H4');resumen.getRange('B4').values=[['Si exportás varias listas, cargá el pedido solo en la lista que corresponda. Cada fila del resumen identifica su lista.']];
 resumen.getRange('B4:H4').format={rowHeight:30,wrapText:true};
 resumen.getRange('B6:H6').values=[['MARCA','LISTA','SKU PEDIDOS','MÓDULOS','SUELTOS','TOTAL PARES','IMPORTE']];
 resumen.getRange('B6:H6').format={fill:'#203D34',font:{bold:true,color:'#FFFFFF'},rowHeight:28};
 hojas.forEach((h,i)=>{
  const r=i+7,q="'"+h.nombre.replace(/'/g,"''")+"'!";
  resumen.getRange(`B${r}:C${r}`).values=[[h.marca,h.lista]];
  resumen.getRange(`D${r}:H${r}`).formulas=[[
   `=COUNTIF(${q}I5:I${h.ultimo},">0")`,
   `=SUMIF(${q}P5:P${h.ultimo},"Módulo",${q}I5:I${h.ultimo})`,
   `=SUMIF(${q}P5:P${h.ultimo},"Suelto",${q}I5:I${h.ultimo})`,
   `=SUM(${q}J5:J${h.ultimo})`,`=IF(COUNTIF(${q}M5:M${h.ultimo},"Sin precio")>0,"Revisar precios",SUM(${q}M5:M${h.ultimo}))`
  ]];
  resumen.getRange(`B${r}:H${r}`).format={fill:i%2?'#F4F7F2':'#E6EEDC',rowHeight:26};
 });
 const fin=hojas.length+7;
 resumen.getRange(`B${fin}:H${fin}`).format={fill:'#203D34',font:{bold:true,color:'#FFFFFF'},rowHeight:28};
 resumen.getRange(`B${fin}`).values=[['TOTAL']];
 for(const c of ['D','E','F','G','H'])resumen.getRange(`${c}${fin}`).formulas=[[`=SUM(${c}7:${c}${fin-1})`]];
 resumen.getRange(`H7:H${fin}`).setNumberFormat(monedas);
 resumen.getRange(`C7:C${fin-1}`).setNumberFormat('00');
 resumen.getRange(`H${fin}`).formulas=[[`=IF(COUNTIF(H7:H${fin-1},"Revisar precios")>0,"Revisar precios",SUM(H7:H${fin-1}))`]];
 resumen.getRange(`D7:G${fin}`).setNumberFormat('#,##0');
 for(const [col,w]of Object.entries({B:25,C:12,D:18,E:16,F:16,G:18,H:22}))resumen.getRange(`${col}:${col}`).format.columnWidth=w;
 wb.recalculate();
 return {wb,hojas};
}

if(process.argv[2]==='generar'){
 let entrada='';for await(const b of process.stdin)entrada+=b;
 const {wb,hojas}=construir(JSON.parse(entrada));
 if(process.env.STOCK_EXCEL_PREVIEW){
  for(const nombre of ['RESUMEN',hojas[0].nombre]){
   const png=await wb.render({sheetName:nombre,range:nombre==='RESUMEN'?'B1:H11':'B1:Q7',scale:1,format:'png'});
   await fs.writeFile(path.join(process.env.STOCK_EXCEL_PREVIEW,nombre==='RESUMEN'?'resumen-stock.png':'marca-stock.png'),new Uint8Array(await png.arrayBuffer()));
  }
 }
 const salida=await SpreadsheetFile.exportXlsx(wb);
 await salida.save(process.argv[3]);
}
