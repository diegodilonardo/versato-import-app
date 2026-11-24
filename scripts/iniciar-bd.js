require('../src/config/entorno');
const sql=require('mssql'),fs=require('fs'),path=require('path'),{randomBytes}=require('crypto');
async function iniciar(){
 const db=process.env.SQL_DATABASE||'FC_VERSATO_APP';if(!/^[A-Za-z0-9_]+$/.test(db))throw new Error('Nombre de base inválido.');
 const admin={server:process.env.SQL_SERVER||'127.0.0.1',port:Number(process.env.SQL_PORT||1433),user:process.env.SQL_USER,password:process.env.SQL_PASSWORD,database:'master',options:{encrypt:process.env.SQL_ENCRYPT==='true',trustServerCertificate:true},connectionTimeout:10000};
 const master=await new sql.ConnectionPool(admin).connect();let pool;
 try{
  const existe=await master.request().input('db',sql.NVarChar(128),db).query('SELECT DB_ID(@db) AS Id');
  if(!existe.recordset[0].Id)await master.request().batch(`CREATE DATABASE [${db}]`);
  pool=await new sql.ConnectionPool({...admin,database:db}).connect();for(const file of fs.readdirSync(path.join(__dirname,'../sql')).filter(n=>/^\d+.*\.sql$/.test(n)).sort())for(const batch of fs.readFileSync(path.join(__dirname,'../sql',file),'utf8').split(/^GO\s*$/m))if(batch.trim())await pool.request().batch(batch);
  const login='versato_fc_app';const actual=await master.request().input('login',sql.NVarChar(128),login).query('SELECT SUSER_ID(@login) AS Id');
  if(actual.recordset[0].Id){console.log('Base y esquema listos. El usuario de aplicación ya existe; no se modificó su contraseña.');return;}
  const password='V3!'+randomBytes(30).toString('base64url');
  await master.request().input('password',sql.NVarChar(128),password).query("DECLARE @s nvarchar(max)=N'CREATE LOGIN [versato_fc_app] WITH PASSWORD = '+QUOTENAME(@password,'''')+N', CHECK_POLICY=ON'; EXEC sys.sp_executesql @s;");
  await pool.request().batch("IF USER_ID(N'versato_fc_app') IS NULL CREATE USER [versato_fc_app] FOR LOGIN [versato_fc_app]; GRANT SELECT, INSERT, UPDATE ON SCHEMA::versato TO [versato_fc_app]; GRANT EXECUTE ON OBJECT::versato.GuardarConsolidadoFOB TO [versato_fc_app];");
  const envPath=path.join(__dirname,'../.env');let texto=fs.readFileSync(envPath,'utf8');for(const [k,v]of Object.entries({SQL_USER:login,SQL_PASSWORD:password,SQL_ENABLED:'true'})){const re=new RegExp('^'+k+'=.*$','m');texto=re.test(texto)?texto.replace(re,k+'='+v):texto+'\n'+k+'='+v;}fs.writeFileSync(envPath,texto);
  console.log('Base FC_VERSATO_APP creada; esquema versión 3 y usuario de aplicación configurados.');
 }finally{await pool?.close();await master.close();}
}
iniciar().catch(()=>{console.error('No se pudo inicializar SQL Server. Revisá acceso y permisos administrativos.');process.exitCode=1;});
