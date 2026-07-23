#!/usr/bin/env bash
set -euo pipefail

name="${1:?Usage: $0 <project-name>}"
language="${2:-}"
root="$(cd "$(dirname "$0")/../../.." && pwd)"

if [ -z "$language" ]; then
  echo "Select language for $name:"
  echo "  1) EN (English)"
  echo "  2) DE (Deutsch)"
  read -rp "Choice [1]: " choice
  case "${choice:-1}" in
    2|de|DE|Deutsch) language="DE" ;;
    *) language="EN" ;;
  esac
fi

mkdir -p "$root/projects/$name/backgrounds" \
         "$root/projects/$name/assets" \
         "$root/projects/$name/texts"

cat > "$root/projects/$name/project.json" <<-EOT
{
  "language": "$language"
}
EOT

cat > "$root/projects/$name/texts/01_welcome.txt" <<-EOT
Welcome to $name.
EOT

cat > "$root/projects/$name/texts/02_reflection.txt" <<-EOT
A space for creativity.
EOT

cat > "$root/projects/$name/texts/03_invitation.txt" <<-EOT
Explore and enjoy.
EOT

echo "Created projects/$name (language: $language)"
echo "  Add background images to projects/$name/backgrounds/"
echo "  Add assets (PNG/MP4) to projects/$name/assets/"
echo "  Edit texts in projects/$name/texts/"
echo "  Edit language in projects/$name/project.json"
echo ""
echo "AssetPack processes on next npm run dev/build."
echo "Hotkey $(ls "$root/projects/" | grep -v 'main{m}' | grep -v preload | wc -l) selects it."
