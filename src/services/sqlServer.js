require('../config/entorno');const sql=require('mssql');let promesa;
const habilitada=()=>process.env.SQL_ENABLED==='true';
function configuracion(){return{server:process.env.SQL_SERVER||'127.0.0.1',port:Number(process.env.SQL_PORT||1433),database:process.env.SQL_DATABASE||'FC_VERSATO_APP',user:process.env.SQL_USER,password:process.env.SQL_PASSWORD,options:{encrypt:process.env.SQL_ENCRYPT==='true',trustServerCertificate:process.env.SQL_TRUST_CERTIFICATE==='true'},pool:{max:5,min:0,idleTimeoutMillis:30000},connectionTimeout:10000,requestTimeout:30000};}
async function conectar(){if(!promesa)promesa=new sql.ConnectionPool(configuracion()).connect().catch(e=>{promesa=null;throw e;});return promesa;}
async function verificar(){if(!habilitada())return{habilitada:false};const pool=await conectar();const r=await pool.request().query('SELECT Version FROM versato.VersionEsquema WHERE Version=3');if(!r.recordset.length)throw new Error('Falta la migración inicial.');return{habilitada:true,base:process.env.SQL_DATABASE};}
async function cerrar(){if(promesa){const pool=await promesa;promesa=null;await pool.close();}}
module.exports={sql,habilitada,conectar,verificar,cerrar};
