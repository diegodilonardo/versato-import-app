const fs=require('node:fs');
const path=require('node:path');
const archivo=path.join(__dirname,'../../.env');
if(fs.existsSync(archivo))process.loadEnvFile(archivo);
