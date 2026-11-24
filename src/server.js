const app=require('./app');const bd=require('./services/sqlServer');const port=Number(process.env.PORT||3000);
bd.verificar().then(()=>{app.listen(port,'127.0.0.1',()=>{console.log('Versato: http://localhost:'+port+'/importaciones');require('./services/programadorGrillas').iniciar();});}).catch(()=>{console.error('No se pudo iniciar la app: SQL Server no está disponible o falta preparar FC_VERSATO_APP.');process.exitCode=1;});
process.once('SIGINT',()=>{require('./services/programadorGrillas').detener();bd.cerrar().finally(()=>process.exit(0));});
