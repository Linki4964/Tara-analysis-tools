param(
    [string]$HostName = "localhost",
    [int]$Port = 5433,
    [string]$User = "postgres",
    [string]$Database = "tara_analysis",
    [string]$Password = $env:PGPASSWORD
)

$ErrorActionPreference = "Stop"

if (-not $Password) {
    $securePassword = Read-Host "PostgreSQL password" -AsSecureString
    $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
    }
}
else {
    $env:PGPASSWORD = $Password
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$schemaPath = Join-Path $scriptDir "init_database.sql"
$pythonInitPath = Join-Path $scriptDir "init_database.py"

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    & python $pythonInitPath --host $HostName --port $Port --user $User --password $env:PGPASSWORD --database $Database
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to initialize database with Python fallback."
    }
    exit 0
}

$exists = & psql -h $HostName -p $Port -U $User -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to connect to PostgreSQL. Please check host, port, user, and password."
}

if ($exists.Trim() -ne "1") {
    & createdb -h $HostName -p $Port -U $User $Database
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create database '$Database'."
    }
}

& psql -h $HostName -p $Port -U $User -d $Database -f $schemaPath
if ($LASTEXITCODE -ne 0) {
    throw "Failed to initialize database schema."
}

Write-Host "Database '$Database' is ready on ${HostName}:${Port}."
