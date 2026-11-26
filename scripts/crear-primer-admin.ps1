$ErrorActionPreference='Stop'
$codificacionVersato=$OutputEncoding
$OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
 $usuarioVersato=Read-Host 'Usuario del primer administrador'
 $nombreVersato=Read-Host 'Nombre completo'
 $claveSeguraVersato=Read-Host 'Contraseña (mínimo 12 caracteres)' -AsSecureString
 $claveRepetidaVersato=Read-Host 'Repetir contraseña' -AsSecureString
 $claveVersato=[System.Net.NetworkCredential]::new('', $claveSeguraVersato).Password
 $confirmacionVersato=[System.Net.NetworkCredential]::new('', $claveRepetidaVersato).Password
 if($claveVersato -cne $confirmacionVersato){throw 'Las contraseñas no coinciden.'}
 # La contraseña viaja por stdin: no forma parte de los argumentos del proceso ni del historial.
 @{usuario=$usuarioVersato;nombre=$nombreVersato;clave=$claveVersato} | ConvertTo-Json -Compress | & node scripts/crear-primer-admin.js
 if($LASTEXITCODE -ne 0){throw 'No se pudo crear el administrador.'}
} finally {
 $claveVersato=$null;$confirmacionVersato=$null;$claveSeguraVersato=$null;$claveRepetidaVersato=$null
 $OutputEncoding=$codificacionVersato
 Pop-Location
}
