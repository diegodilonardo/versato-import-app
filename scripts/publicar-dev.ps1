param(
 [Parameter(Mandatory=$true)][string]$Mensaje,
 [string]$Repositorio='file:///C:/productos-app',
 [string]$Rama='apps/facturas-versato',
 [switch]$Inicializar
)
$ErrorActionPreference='Stop'
$rutaDev=Split-Path -Parent $PSScriptRoot
function Git-Dev {param([string[]]$Argumentos)
 $salida=& git -C $rutaDev @Argumentos
 if($LASTEXITCODE -ne 0){throw "Git falló: $($Argumentos -join ' ')"};return $salida
}
if([string]::IsNullOrWhiteSpace($Mensaje)){throw 'Indicá una descripción del cambio.'}
foreach($comando in @('git','npm.cmd')){if(-not(Get-Command $comando -ErrorAction SilentlyContinue)){throw "Falta $comando."}}
if(-not(Test-Path -LiteralPath (Join-Path $rutaDev '.git'))){
 if(-not $Inicializar){throw 'Primera publicación: ejecutá este script con -Inicializar.'}
 Git-Dev -Argumentos @('init',('--initial-branch='+$Rama)) | Out-Host
}
$raiz=Git-Dev -Argumentos @('rev-parse','--show-toplevel')
if([IO.Path]::GetFullPath($raiz).TrimEnd('\') -ne $rutaDev.TrimEnd('\')){throw 'La carpeta no es la raíz Git de Facturas Versato.'}
if('origin' -notin @(Git-Dev -Argumentos @('remote'))){
 if(-not $Inicializar){throw 'Falta el remoto origin. Volvé a ejecutar con -Inicializar para completar la preparación.'}
 Git-Dev -Argumentos @('remote','add','origin',$Repositorio) | Out-Host
}
if((Git-Dev -Argumentos @('branch','--show-current')) -ne $Rama){throw "Usá la rama exclusiva de esta app: $Rama."}
if((Git-Dev -Argumentos @('remote','get-url','origin')) -ne $Repositorio){throw 'El remoto no coincide con el repositorio indicado.'}
if(Git-Dev -Argumentos @('diff','--cached','--name-only')){throw 'Hay archivos preparados. Revisalos antes de publicar.'}
$archivos=@(Git-Dev -Argumentos @('-c','core.quotePath=false','ls-files','--modified','--others','--exclude-standard'))
$permitidos=@($archivos | Where-Object {
 ($_ -match '^(src/|public/|scripts/|test/|docs/|sql/)' -or $_ -in @('package.json','package-lock.json','README.md','.gitignore','.gitattributes')) -and
 $_ -notmatch '(^|/)(\.env[^/]*|node_modules|data|storage|salidas|tmp|outputs|__pycache__)(/|$)' -and
 ($_ -notmatch '\.(xlsx?|xlsm|zip|rar|7z|png|jpe?g|gif|webp|DBI|DBF|log|pyc)$' -or $_ -eq 'src/config/plantillas/Grilla Versato Stock - Vendedores.xlsx')
})
if(-not $permitidos.Count){Write-Host 'No hay cambios de código para publicar.';return}
Write-Host "Se publicará Facturas Versato en origin/$Rama. Archivos:"
$permitidos | Out-Host
Write-Host 'Revisá que el código y los scripts no contengan credenciales.'
Push-Location $rutaDev
try{& npm.cmd test;if($LASTEXITCODE -ne 0){throw 'Fallaron las pruebas. No se hizo commit ni push.'}}finally{Pop-Location}
if((Read-Host '¿Publicar estos archivos? Escribí SI') -cne 'SI'){Write-Host 'Cancelado.';return}
Git-Dev -Argumentos (@('add','--')+$permitidos) | Out-Host
Git-Dev -Argumentos @('diff','--cached','--stat') | Out-Host
Git-Dev -Argumentos @('commit','-m',$Mensaje) | Out-Host
Git-Dev -Argumentos @('push','--set-upstream','origin',"HEAD:refs/heads/$Rama") | Out-Host
Write-Host 'Publicado. Ejecutá actualizar-produccion.ps1 en el servidor.'
