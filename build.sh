#!/usr/bin/env bash
# Builds dist/final-days.exe from any OS that has Go. Cross-compiles, no C toolchain.
set -euo pipefail
cd "$(dirname "$0")"
TAG=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo v0.0.0)
NUM=${TAG#v}; NUM=${NUM%%-*}
VERSION=$(git describe --tags --always --dirty --match 'v*' 2>/dev/null || echo dev)
cd windows
# Icon, manifest and version info, embedded as a .syso the Go linker picks up.
go run github.com/tc-hib/go-winres@v0.3.3 make --in winres/winres.json --product-version "$NUM.0" --file-version "$NUM.0"
mkdir -p ../dist
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -X main.version=$VERSION" -o ../dist/final-days.exe .
(cd ../dist && sha256sum final-days.exe > SHA256SUMS)
echo "built dist/final-days.exe ($VERSION)"
