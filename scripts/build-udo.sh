#!/usr/bin/env bash
set -euo pipefail

# Standalone Linux frontend from UDO's own automake source list.
source_tree="$(realpath "${1:?usage: build-udo.sh UDO_CHECKOUT OUTPUT}")"
output="$(realpath -m "${2:?output path required}")"
expected="$(node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync("src/data/sources.json")).udo.revision)')"
test "$(git -C "$source_tree" rev-parse HEAD)" = "$expected"
mkdir -p "$(dirname "$output")"
cd "$source_tree/src"
mapfile -t files < <(awk '/^udo_SOURCES =/{in_sources=1} /^udo_LDADD/{in_sources=0} in_sources {for (i=1;i<=NF;i++) if ($i ~ /^[a-z_]+\.c$/) print $i}' Makefile.am)
cc -O2 -std=gnu11 -D_GNU_SOURCE -DHAVE_UNISTD_H=1 '-DBINDIR="/usr/bin"' "${files[@]}" -o "$output"
