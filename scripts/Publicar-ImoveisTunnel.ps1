#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Porta = 5186
)

$ErrorActionPreference = 'Stop'
$cf = 'C:\Cloudflared\bin\cloudflared.exe'
$config = 'C:\Windows\System32\config\systemprofile\.cloudflared\config.yml'
$tunnel = 'ddff2357-c88a-4c0e-8645-83a458548735'
$site = 'imoveis.ademartognasca.com.br'
$api = 'api-imoveis.ademartognasca.com.br'
$origin = "http://127.0.0.1:$Porta"
$project = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    (Get-Location).Path
} else {
    Split-Path -Parent $PSScriptRoot
}

function Test-Storefront {
    param([string]$Url)
    try {
        $page = Invoke-WebRequest -Uri "$Url/" -UseBasicParsing -TimeoutSec 8
        $script = Invoke-WebRequest -Uri "$Url/api/vitrine/recursos/js/app" -UseBasicParsing -TimeoutSec 8
        foreach ($style in @('styles', 'storefront', 'property-detail')) {
            $css = Invoke-WebRequest -Uri "$Url/api/vitrine/recursos/css/$style" -UseBasicParsing -TimeoutSec 8
            if ($css.StatusCode -ne 200 -or $css.Headers['Content-Type'] -notmatch '^text/css') { return $false }
        }
        $javascript = $script.Content
        if ($javascript -is [byte[]]) { $javascript = [System.Text.Encoding]::UTF8.GetString($javascript) }
        return ($page.StatusCode -eq 200 -and $page.Content -match 'id="app"' -and
            $script.StatusCode -eq 200 -and $javascript -match 'mountPdfImport')
    } catch {
        Write-Warning "Falha ao carregar a vitrine em ${Url}: $($_.Exception.Message)"
        return $false
    }
}

if (!(Test-Path -LiteralPath (Join-Path $project 'compose.yaml') -PathType Leaf)) {
    throw "Arquivo compose.yaml ausente em '$project'. Entre na pasta AdministracaoImoveis e rode o script novamente."
}
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Falhou ($LASTEXITCODE): $Executable $($Arguments -join ' ')"
    }
}

function Wait-Health {
    param([string]$Url, [int]$Attempts)
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri "$Url/health" -TimeoutSec 4
            if ($health.status -eq 'ok') { return $true }
        } catch {
            # O Docker ou o DNS ainda pode estar inicializando.
        }
        if ($attempt -lt $Attempts) { Start-Sleep -Seconds 2 }
    }
    return $false
}

if (!(Test-Path -LiteralPath $cf -PathType Leaf)) { throw "cloudflared.exe ausente: $cf" }
if (!(Test-Path -LiteralPath $config -PathType Leaf)) { throw "Config ausente: $config" }
if (!(Test-Path -LiteralPath (Join-Path $project '.env') -PathType Leaf)) {
    throw 'Configure o .env do projeto com as senhas antes de publicar.'
}
Get-Service -Name Cloudflared | Out-Null

$content = [System.IO.File]::ReadAllText($config)
$tunnelPattern = '(?m)^tunnel:[ \t]*[''"]?' + [regex]::Escape($tunnel) + '[''"]?[ \t]*(?:#.*)?\r?$'
if ($content -notmatch $tunnelPattern) { throw 'O config.yml nao aponta para o UUID de tunel esperado.' }

$managed = '(?ms)^[ \t]*# BEGIN ADMINISTRACAO IMOVEIS\r?\n.*?^[ \t]*# END ADMINISTRACAO IMOVEIS[ \t]*\r?\n'
$managedMatches = [regex]::Matches($content, $managed)
if ($managedMatches.Count -gt 1) { throw 'Ha mais de um bloco ADMINISTRACAO IMOVEIS no config.yml.' }
$base = [regex]::Replace($content, $managed, '')
if ($base -match '(?m)^[ \t]*# (BEGIN|END) ADMINISTRACAO IMOVEIS') {
    throw 'O bloco ADMINISTRACAO IMOVEIS esta incompleto.'
}
$hostPattern = '(?mi)^[ \t]*(?:-[ \t]*)?hostname:[ \t]*[''"]?(?:' +
    ([regex]::Escape($site)) + '|' + ([regex]::Escape($api)) + ')[''"]?[ \t]*(?:#.*)?\r?$'
if ($base -match $hostPattern) { throw 'Ja existe uma rota destes hostnames fora do bloco gerenciado.' }

$ingress = [regex]::Matches($base, '(?m)^ingress:[ \t]*(?:#[^\r\n]*)?\r?\n')
$fallback = [regex]::Matches($base, '(?m)^(?<indent>[ \t]*)-[ \t]*service:[ \t]*http_status:404[ \t]*(?:#[^\r\n]*)?\r?$')
if ($ingress.Count -ne 1 -or $fallback.Count -ne 1 -or $fallback[0].Index -lt $ingress[0].Index) {
    throw 'Esperado um bloco ingress com fallback http_status:404.'
}
$indent = $fallback[0].Groups['indent'].Value
$newline = if ($base.Contains("`r`n")) { "`r`n" } else { "`n" }
$routes = @(
    "${indent}# BEGIN ADMINISTRACAO IMOVEIS"
    "${indent}- hostname: $site"
    "${indent}  service: $origin"
    "${indent}- hostname: $api"
    "${indent}  path: '^/(api/|health$)'"
    "${indent}  service: $origin"
    "${indent}- hostname: $api"
    "${indent}  service: http_status:404"
    "${indent}# END ADMINISTRACAO IMOVEIS"
)
$updated = $base.Insert($ingress[0].Index + $ingress[0].Length, ($routes -join $newline) + $newline)
$candidate = "$config.imoveis-$([guid]::NewGuid().ToString('N')).tmp"
$backup = "$config.backup-imoveis-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$previousPort = $env:IMOVEIS_PORT
$previousEnvironment = $env:ASPNETCORE_ENVIRONMENT

Push-Location $project
try {
    [System.IO.File]::WriteAllText($candidate, $updated, $utf8)
    Invoke-Checked $cf @('tunnel','--config',$candidate,'ingress','validate')
    Invoke-Checked $cf @('tunnel','--config',$candidate,'ingress','rule',"https://$site/")
    Invoke-Checked $cf @('tunnel','--config',$candidate,'ingress','rule',"https://$api/api/imoveis")

    $env:IMOVEIS_PORT = [string]$Porta
    $env:ASPNETCORE_ENVIRONMENT = 'Production'
    Invoke-Checked 'docker' @('compose','--env-file','.env','config','--quiet')
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Porta -ErrorAction SilentlyContinue)
    if ($listeners.Count) {
        $binding = @(docker compose --env-file .env port web 8080)
        if ($LASTEXITCODE -ne 0 -or $binding -notcontains "127.0.0.1:$Porta") {
            throw "A porta $Porta esta em uso. Rode o script com -Porta especificando outra porta."
        }
        Write-Host "Porta $Porta ja pertence ao container web deste projeto."
    } else {
        Write-Host "Porta TCP $Porta sem listener. O Docker ainda vai confirmar o bind."
    }
    Invoke-Checked 'docker' @('compose','--env-file','.env','up','-d','--build')

    if (!(Wait-Health $origin 15)) {
        docker compose --env-file .env logs --tail=60 web
        throw "O Imoveis nao respondeu em $origin/health. O tunel ainda nao foi alterado."
    }
    if (!(Test-Storefront $origin)) {
        throw "O /health local respondeu, mas a vitrine em $origin falhou. O tunel ainda nao foi alterado."
    }
    $identity = Invoke-RestMethod -Uri "$origin/api/vitrine/configuracao" -TimeoutSec 8
    if (!$identity.name) { throw 'A resposta local nao corresponde ao Imoveis.' }

    Invoke-Checked $cf @('tunnel','route','dns',$tunnel,$site)
    Invoke-Checked $cf @('tunnel','route','dns',$tunnel,$api)

    if ([System.IO.File]::ReadAllText($config) -cne $content) {
        throw 'O config.yml mudou durante a publicacao. Rode o script novamente.'
    }
    if ($content -cne $updated) {
        [System.IO.File]::Replace($candidate, $config, $backup)
        try {
            Restart-Service -Name Cloudflared
        } catch {
            Copy-Item -LiteralPath $backup -Destination $config -Force
            Start-Service -Name Cloudflared -ErrorAction SilentlyContinue
            throw
        }
        Write-Host "Backup: $backup"
    } elseif ((Get-Service -Name Cloudflared).Status -ne 'Running') {
        Start-Service -Name Cloudflared
    }

    foreach ($url in @("https://$site", "https://$api")) {
        if (Wait-Health $url 6) { Write-Host "OK $url/health" -ForegroundColor Green }
        else { Write-Warning "Ainda sem resposta em $url/health. Confira DNS e o servico Cloudflared e teste novamente." }
    }
    if (Test-Storefront "https://$site") { Write-Host "OK https://$site/" -ForegroundColor Green }
    Get-Service -Name Cloudflared
} finally {
    $env:IMOVEIS_PORT = $previousPort
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
    Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue
    Pop-Location
}
