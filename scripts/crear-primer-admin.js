require('../src/config/entorno');
const fs=require('node:fs');
const bd=require('../src/services/sqlServer');
(async()=>{if(!bd.habilitada())throw Error('Los usuarios requieren SQL Server.');const usuarios=require('../src/services/usuariosSQL');await usuarios.verificar();const entrada=JSON.parse(fs.readFileSync(0,'utf8'));await usuarios.guardar({...entrada,perfil:'ADMINISTRADOR',activo:true},'INSTALACION',{inicial:true});console.log('Primer administrador creado en SQL. No se guardó ninguna contraseña en archivos.');})().catch(e=>{console.error(e.status?e.message:'No se pudo crear el administrador. Verificá SQL y la migración 008.');process.exitCode=1;}).finally(()=>bd.cerrar());
