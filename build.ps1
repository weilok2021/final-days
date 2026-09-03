# Builds dist\final-days.exe on Windows. Needs Go and git on PATH.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$tag = git describe --tags --abbrev=0 --match 'v*' 2>$null
if (-not $tag) { $tag = "v0.0.0" }
$num = ($tag.TrimStart("v") -split "-")[0]
$version = git describe --tags --always --dirty --match 'v*' 2>$null
if (-not $version) { $version = "dev" }
Set-Location windows
go run github.com/tc-hib/go-winres@v0.3.3 make --in winres/winres.json --product-version "$num.0" --file-version "$num.0"
New-Item -ItemType Directory -Force ../dist | Out-Null
$env:GOOS = "windows"; $env:GOARCH = "amd64"; $env:CGO_ENABLED = "0"
go build -trimpath -ldflags "-H windowsgui -X main.version=$version" -o ../dist/final-days.exe .
$hash = (Get-FileHash ../dist/final-days.exe -Algorithm SHA256).Hash.ToLower()
Set-Content ../dist/SHA256SUMS "$hash  final-days.exe"
"built dist/final-days.exe ($version)"
