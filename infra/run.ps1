# ================================================================
# GruaHub — Orquestrador local
# Uso: .\run.ps1 [up | down | build | logs | infra]
#
#   up     — compila backend + sobe todos os serviços (padrão)
#   infra  — sobe só a infra (postgres, keycloak, emqx, minio) sem backend
#   build  — só compila o backend no host
#   down   — para e remove containers
#   logs   — tail dos logs
# ================================================================

param(
    [string]$Command = "up"
)

$ErrorActionPreference = "Stop"
$RootDir  = Split-Path $PSScriptRoot -Parent
$BackendDir = Join-Path $RootDir "backend"
$InfraDir   = $PSScriptRoot

function Write-Step([string]$msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}
function Write-OK([string]$msg) {
    Write-Host "    OK: $msg" -ForegroundColor Green
}
function Write-Fail([string]$msg) {
    Write-Host "    ERRO: $msg" -ForegroundColor Red
}

# ----------------------------------------------------------------
# Garante que Maven está disponível e compila o backend no host
# (evita o problema de TLS Java dentro do Docker Desktop no Windows)
# ----------------------------------------------------------------
function Build-Backend {
    Write-Step "Compilando backend Quarkus no host..."

    $mvnCmd = $null

    # 1) Maven no PATH
    if (Get-Command mvn -ErrorAction SilentlyContinue) {
        $mvnCmd = "mvn"
        Write-Host "    Usando Maven do PATH: $(mvn -version 2>&1 | Select-Object -First 1)"
    }

    # 2) Maven Wrapper (mvnw.cmd) no diretório do backend
    if (-not $mvnCmd) {
        $mvnwPath = Join-Path $BackendDir "mvnw.cmd"
        if (Test-Path $mvnwPath) {
            $mvnCmd = $mvnwPath
            Write-Host "    Usando Maven Wrapper: $mvnwPath"
        }
    }

    # 3) Baixar Maven 3.9.6 com PowerShell (Invoke-WebRequest usa .NET, não Java TLS)
    if (-not $mvnCmd) {
        Write-Host "    Maven não encontrado. Baixando Maven 3.9.6 via PowerShell..."
        $MvnExtract = Join-Path $env:TEMP "apache-maven-3.9.6"
        $MvnBin     = Join-Path $MvnExtract "bin\mvn.cmd"

        if (-not (Test-Path $MvnBin)) {
            $url  = "https://archive.apache.org/dist/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.zip"
            $zip  = Join-Path $env:TEMP "apache-maven-3.9.6-bin.zip"
            Write-Host "    Baixando: $url"
            Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
            Write-Host "    Extraindo..."
            Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force
            Remove-Item $zip -ErrorAction SilentlyContinue
        }

        if (Test-Path $MvnBin) {
            $mvnCmd = $MvnBin
            Write-Host "    Maven 3.9.6 pronto: $MvnBin"
        } else {
            Write-Fail "Não foi possível obter Maven. Instale manualmente e adicione ao PATH."
            exit 1
        }
    }

    # Usar Windows Certificate Store → Java confia no cert do antivírus/VPN
    # (o JDK usa cacerts próprio por padrão; antivírus injeta cert apenas no Windows Store)
    $env:MAVEN_OPTS = "-Djavax.net.ssl.trustStoreType=Windows-ROOT " +
                      "-Djavax.net.ssl.trustStore=NONE " +
                      "-Djava.net.preferIPv4Stack=true"
    Write-Host "    MAVEN_OPTS=$env:MAVEN_OPTS"

    # Compila
    Push-Location $BackendDir
    try {
        & $mvnCmd package -DskipTests -B --no-transfer-progress
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "mvn package falhou (exit $LASTEXITCODE)"
            exit 1
        }
    } finally {
        Pop-Location
    }

    # Verifica artefato
    $jar = Join-Path $BackendDir "target\quarkus-app\quarkus-run.jar"
    if (-not (Test-Path $jar)) {
        Write-Fail "target/quarkus-app/quarkus-run.jar não encontrado após build"
        exit 1
    }
    Write-OK "Backend compilado: $jar"
}

# ----------------------------------------------------------------
# Main
# ----------------------------------------------------------------
Set-Location $InfraDir

switch ($Command.ToLower()) {

    "build" {
        Build-Backend
    }

    "up" {
        Build-Backend
        Write-Step "Construindo imagem Docker do backend..."
        docker compose build backend
        Write-Step "Subindo todos os serviços..."
        docker compose up -d
        Write-OK "Serviços iniciados. Aguarde health checks (~2 min)."
        Write-Host "`n  Backend:  http://localhost:8080/q/swagger-ui"
        Write-Host "  Web:      http://localhost:3000"
        Write-Host "  Keycloak: http://localhost:8180  (admin/admin)"
        Write-Host "  EMQX:     http://localhost:18083 (admin/public)"
        Write-Host "  MinIO:    http://localhost:9001  (minioadmin/minioadmin)`n"
    }

    "infra" {
        Write-Step "Subindo apenas infraestrutura (sem backend/web)..."
        docker compose up -d postgres keycloak emqx emqx-users minio minio-setup
        Write-OK "Infra iniciada."
        Write-Host "`n  Para rodar o backend em modo dev (hot-reload):"
        Write-Host "  cd backend && mvn quarkus:dev`n"
    }

    "down" {
        Write-Step "Parando serviços..."
        docker compose down
        Write-OK "Serviços parados."
    }

    "logs" {
        docker compose logs -f
    }

    default {
        Write-Host "Uso: .\run.ps1 [up | down | build | logs | infra]"
    }
}
