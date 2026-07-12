#!/usr/bin/env bash
set -euo pipefail

name="${1:?Usage: $0 <project-name>}"
root="$(cd "$(dirname "$0")/../../.." && pwd)"

mkdir -p "$root/projects/$name/backgrounds" \
         "$root/projects/$name/gifs" \
         "$root/projects/$name/assets" \
         "$root/projects/$name/texts"

cat > "$root/projects/$name/texts/01_welcome.txt" <<-EOT
Welcome to $name.
EOT

cat > "$root/projects/$name/texts/02_reflection.txt" <<-EOT
A space for creativity.
EOT

cat > "$root/projects/$name/texts/03_invitation.txt" <<-EOT
Explore and enjoy.
EOT

echo "Created projects/$name"
echo "  Add background images to projects/$name/backgrounds/"
echo "  Add GIFs to projects/$name/gifs/"
echo "  Add assets (PNG/MP4) to projects/$name/assets/"
echo "  Edit texts in projects/$name/texts/"
echo ""
echo "AssetPack processes on next npm run dev/build."
echo "Hotkey $(ls "$root/projects/" | grep -v 'main{m}' | grep -v preload | wc -l) selects it."
