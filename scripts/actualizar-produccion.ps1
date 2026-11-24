param(
 [string]$RutaApp='C:\versato-import-app',
 [string]$Servicio='VersatoImportApp',
 [string]$Rama='apps/facturas-versato',
 [Parameter(Mandatory=$true)][string]$Python,
 [string]$UrlComprobacion='http://127.0.0.1:3100/stock'
)
$ErrorActionPreference='Stop'
function Git-App {param([string[]]$Argumentos)
 $salida=& git -C $RutaApp @Argumentos
 if($LASTEXITCODE -ne 0){throw "Git falló: $($Argumentos -join ' ')"};return $salida
}
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Abrí PowerShell como administrador.'}
foreach($comando in @('git','npm.cmd')){if(-not(Get-Command $comando -ErrorAction SilentlyContinue)){throw "Falta $comando."}}
$RutaApp=(Resolve-Path -LiteralPath $RutaApp).Path
if(-not(Test-Path -LiteralPath (Join-Path $RutaApp '.env'))){throw 'Falta el .env de producción.'}
$raiz=Git-App -Argumentos @('rev-parse','--show-toplevel')
if([IO.Path]::GetFullPath($raiz).TrimEnd('\') -ne $RutaApp.TrimEnd('\')){throw 'La carpeta no es la raíz del repositorio.'}
if((Git-App -Argumentos @('branch','--show-current')) -ne $Rama){throw "La instalación debe usar la rama $Rama."}
if(Git-App -Argumentos @('status','--porcelain','--untracked-files=no')){throw 'Hay cambios locales. No se sobrescribieron archivos.'}
$servicioActual=Get-Service -Name $Servicio
if($servicioActual.Status -ne 'Running'){throw 'El servicio debe estar iniciado antes de actualizar.'}
if(-not(Test-Path -LiteralPath $Python -PathType Leaf)){throw 'Indicá el python.exe instalado en el servidor.'}
'from PIL import Image, ImageOps' | & $Python -
if($LASTEXITCODE -ne 0){throw 'Falta Pillow en ese Python. No se detuvo el servicio.'}
Write-Host 'Python y Pillow: OK'
Git-App -Argumentos @('fetch','origin',"refs/heads/${Rama}:refs/remotes/origin/$Rama") | Out-Host
$anterior=Git-App -Argumentos @('rev-parse','HEAD');$destino=Git-App -Argumentos @('rev-parse',"refs/remotes/origin/$Rama")
& git -C $RutaApp merge-base --is-ancestor HEAD $destino
if($LASTEXITCODE -ne 0){throw 'Las ramas divergen. No se modificó la app.'}
if($anterior -eq $destino){Write-Host 'La app ya está actualizada.';return}
$archivos=@(Git-App -Argumentos @('diff','--name-only','HEAD',$destino))
if($archivos | Where-Object {$_ -match '(^|/)(data|storage|salidas|outputs|node_modules)(/|$)|(^|/)\.env($|\.)'}){throw 'La actualización incluye datos o configuración local. Revisá el commit.'}
Write-Host "Actualizando Facturas Versato: $anterior -> $destino"
Stop-Service -Name $Servicio
(Get-Service -Name $Servicio).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(60))
try{
 Git-App -Argumentos @('merge','--ff-only',$destino) | Out-Host
 Push-Location $RutaApp
 try{& npm.cmd ci --omit=dev;if($LASTEXITCODE -ne 0){throw 'No se pudieron instalar las dependencias.'}}finally{Pop-Location}
 Start-Service -Name $Servicio
 (Get-Service -Name $Servicio).WaitForStatus('Running',[TimeSpan]::FromSeconds(60))
 $correcta=$false
 for($i=0;$i -lt 15;$i++){
  try{$r=Invoke-WebRequest -Uri $UrlComprobacion -UseBasicParsing -TimeoutSec 5;if($r.StatusCode -eq 200){$correcta=$true;break}}catch{}
  Start-Sleep -Seconds 2
 }
 if(-not $correcta){throw 'El servicio inició, pero la app no respondió correctamente. Revisá los registros.'}
 Write-Host 'Actualización completada y acceso verificado. Datos, fotos y .env conservados.'
}catch{Write-Warning "Actualización incompleta. Versión anterior: $anterior. Revisá el servicio; no se hizo una reversión automática.";throw}
