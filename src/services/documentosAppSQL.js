const {sql,conectar}=require('./sqlServer');
function traducir(e){if(e.number===208)return Object.assign(Error('Falta aplicar sql/007_configuracion_y_clientes.sql en FC_VERSATO_APP.'),{status:503});return e;}
async function cambiar(clave,inicializar,modificar){
 const p=await conectar(),tx=new sql.Transaction(p);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try{
  const r=await new sql.Request(tx).input('clave',sql.VarChar(60),clave).query('SELECT Contenido FROM versato.DocumentosApp WITH(UPDLOCK,HOLDLOCK) WHERE Clave=@clave');
  const existe=!!r.recordset.length,anterior=existe?JSON.parse(r.recordset[0].Contenido):await inicializar();
  const siguiente=modificar?await modificar(anterior):anterior;
  if(!existe||modificar)await new sql.Request(tx).input('clave',sql.VarChar(60),clave).input('contenido',sql.NVarChar(sql.MAX),JSON.stringify(siguiente)).query(existe?'UPDATE versato.DocumentosApp SET Contenido=@contenido,Actualizado=SYSUTCDATETIME() WHERE Clave=@clave':'INSERT versato.DocumentosApp(Clave,Contenido)VALUES(@clave,@contenido)');
  await tx.commit();return siguiente;
 }catch(e){await tx.rollback().catch(()=>{});throw traducir(e);}
}
// La importación local solo ocurre si la clave aún no existe: una restauración SQL siempre gana.
const leer=(clave,inicializar)=>cambiar(clave,inicializar);
module.exports={leer,cambiar};

