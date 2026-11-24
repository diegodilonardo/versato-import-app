param(
 [string]$RutaApp='C:\versato-import-app',
 [string]$Servicio='ProcesosVersatoFC',
 [string]$Instancia,
 [string]$BaseDatos='FC_VERSATO_APP',
 [string]$Destino='C:\Backups\Versato',
 [string]$DirectorioPrecios,
 [Parameter(Mandatory=$true)][string]$DirectorioSql
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
function Valor-Env([string]$Nombre){
 $linea=Get-Content -LiteralPath (Join-Path $RutaApp '.env') | Where-Object {$_ -match ('^\s*'+[regex]::Escape($Nombre)+'\s*=')} | Select-Object -Last 1
 if($linea){return (($linea -split '=',2)[1]).Trim().Trim('"',"'")};return ''
}
function Carpeta-Absoluta([string]$Ruta){
 if($Ruta -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)'){throw "Se requiere una ruta absoluta: $Ruta"}
 return [IO.Path]::GetFullPath($Ruta).TrimEnd('\')
}
function Copiar-Carpeta([string]$Origen,[string]$DestinoCopia){
 if(-not(Test-Path -LiteralPath $Origen -PathType Container)){return}
 $enlaces=@(Get-Item -LiteralPath $Origen;Get-ChildItem -LiteralPath $Origen -Recurse -Force) | Where-Object {($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0}
 if($enlaces){throw "La carpeta contiene enlaces o junctions. Respaldalos por separado: $Origen"}
 New-Item -ItemType Directory -Path $DestinoCopia -Force | Out-Null
 Get-ChildItem -LiteralPath $Origen -Force | Copy-Item -Destination $DestinoCopia -Recurse -Force
 foreach($f in Get-ChildItem -LiteralPath $Origen -File -Recurse -Force){
  $relativa=$f.FullName.Substring($Origen.TrimEnd('\').Length+1)
  $copia=Join-Path $DestinoCopia $relativa
  if((Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $copia -Algorithm SHA256).Hash){throw "La copia no coincide: $relativa"}
 }
}
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Ejecutá PowerShell como administrador.'}
if(-not(Get-Command sqlcmd -ErrorAction SilentlyContinue)){throw 'Falta sqlcmd. Instalá las herramientas de SQL Server antes de continuar.'}
$RutaApp=Carpeta-Absoluta (Resolve-Path -LiteralPath $RutaApp).Path
if(-not(Test-Path -LiteralPath (Join-Path $RutaApp '.env'))){throw 'No se encontró .env.'}
if(-not $Instancia){$Instancia=Valor-Env 'SQL_SERVER';$puerto=Valor-Env 'SQL_PORT';if($puerto){$Instancia+=','+$puerto}}
if(-not $Instancia){throw 'Indicá la instancia SQL mediante -Instancia.'}
if($BaseDatos -notmatch '^[A-Za-z0-9_]+$'){throw 'Nombre de base inválido.'}
if(-not $DirectorioPrecios){$DirectorioPrecios=Valor-Env 'PRECIOS_DIR';if(-not $DirectorioPrecios){$DirectorioPrecios=Join-Path $RutaApp 'precios'}}
$DirectorioPrecios=Carpeta-Absoluta $DirectorioPrecios
$Destino=Carpeta-Absoluta $Destino
foreach($origen in @($RutaApp,$DirectorioPrecios)){if($Destino -eq $origen -or $Destino.StartsWith($origen+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'La carpeta de backup debe estar fuera de la app y de las listas FOB.'}}
$actual=Get-Service -Name $Servicio
if($actual.Status -ne 'Running'){throw 'El servicio debe estar iniciado antes de generar el respaldo.'}
$id=(Get-Date -Format 'yyyyMMdd_HHmmss')+'_'+[guid]::NewGuid().ToString('N').Substring(0,8)
$carpeta=Join-Path $Destino ('Versato_'+$id)
New-Item -ItemType Directory -Path $carpeta -Force | Out-Null
# .env contiene contraseñas: limitar el acceso de esta nueva carpeta a administradores y SYSTEM.
$acl=Get-Acl -LiteralPath $carpeta;$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @('S-1-5-32-544','S-1-5-18')){$identidad=New-Object Security.Principal.SecurityIdentifier($sid);$regla=New-Object Security.AccessControl.FileSystemAccessRule($identidad,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($regla)}
Set-Acl -LiteralPath $carpeta -AclObject $acl
$bakNombre=$BaseDatos+'_'+$id+'.bak'
if($DirectorioSql){$DirectorioSql=Carpeta-Absoluta $DirectorioSql}else{$DirectorioSql=$carpeta}
$bakSql=Join-Path $DirectorioSql $bakNombre
$detenido=$false
try{
 Write-Host 'Deteniendo temporalmente el servicio para obtener un respaldo consistente...'
 Stop-Service -Name $Servicio;$detenido=$true
 (Get-Service -Name $Servicio).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60))
 # SQL interpreta esta ruta en SU servidor, no en el equipo que ejecuta PowerShell.
 $rutaSql=$bakSql.Replace("'","''")
 $consulta="BACKUP DATABASE [$BaseDatos] TO DISK=N'$rutaSql' WITH COPY_ONLY,CHECKSUM,STATS=10; RESTORE VERIFYONLY FROM DISK=N'$rutaSql' WITH CHECKSUM;"
 Write-Host 'Generando y verificando el backup SQL con la cuenta de Windows actual...'
 & sqlcmd -S $Instancia -d master -E -C -b -Q $consulta
 if($LASTEXITCODE -ne 0){throw 'Falló el backup SQL. La cuenta de Windows necesita permiso de backup y SQL debe poder escribir en DirectorioSql.'}
 $bakLocal=Join-Path $carpeta $bakNombre
 if(-not(Test-Path -LiteralPath $bakSql -PathType Leaf)){throw 'El .bak no es accesible desde este equipo. Usá -DirectorioSql con una ruta compartida accesible tanto por SQL como por PowerShell.'}
 if($bakSql -ne $bakLocal){Copy-Item -LiteralPath $bakSql -Destination $bakLocal}
 if((Get-FileHash -LiteralPath $bakSql -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $bakLocal -Algorithm SHA256).Hash){throw 'La copia del .bak no coincide.'}
 Copy-Item -LiteralPath (Join-Path $RutaApp '.env') -Destination (Join-Path $carpeta '.env')
 Copiar-Carpeta (Join-Path $RutaApp 'data') (Join-Path $carpeta 'data')
 Copiar-Carpeta $DirectorioPrecios (Join-Path $carpeta 'precios')
 Copiar-Carpeta (Join-Path $RutaApp 'src\config\plantillas') (Join-Path $carpeta 'plantillas')
 $version='No disponible';if(Get-Command git -ErrorAction SilentlyContinue){$salida=& git -C $RutaApp rev-parse HEAD 2>$null;if($LASTEXITCODE -eq 0){$version=[string]$salida}}
 $archivos=@(Get-ChildItem -LiteralPath $carpeta -File -Recurse -Force | ForEach-Object {@{archivo=$_.FullName.Substring($carpeta.Length+1);bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}})
 @{fecha=(Get-Date).ToString('o');base=$BaseDatos;version=$version;servicio=$Servicio;archivos=$archivos} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $carpeta 'manifiesto.json') -Encoding UTF8
 'Backup SQL verificado, archivos copiados y manifiesto generado.' | Set-Content -LiteralPath (Join-Path $carpeta 'COMPLETO.txt') -Encoding UTF8
 Write-Host "Backup completo: $carpeta"
}catch{
 $_.Exception.Message | Set-Content -LiteralPath (Join-Path $carpeta 'ERROR.txt') -Encoding UTF8
 throw
}finally{
 if($detenido){Start-Service -Name $Servicio;(Get-Service -Name $Servicio).WaitForStatus('Running',[TimeSpan]::FromSeconds(60));Write-Host 'Servicio reiniciado.'}
}
