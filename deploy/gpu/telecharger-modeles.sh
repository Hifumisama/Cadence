#!/bin/bash
# Télécharge sur le volume les modèles de models.manifest qui n'y sont pas encore. Relançable à volonté :
# un fichier déjà là est ignoré, un téléchargement interrompu reprend où il s'est arrêté (fichier « .part »).
#
#   telecharger-modeles.sh                  télécharge ce qui manque
#   telecharger-modeles.sh --lister         dit ce qui est là et ce qui manque, sans rien télécharger
#   telecharger-modeles.sh --seulement taeh3   ne traite que les lignes du manifeste contenant « taeh3 »
#
# Variables : CADENCE_VOLUME (défaut /workspace), CADENCE_MANIFEST, CADENCE_DL_PARALLELE (défaut 3),
# HF_TOKEN (jeton Hugging Face, ajouté aux seules requêtes vers huggingface.co).
set -uo pipefail

V="${CADENCE_VOLUME:-/workspace}"
MANIFEST="${CADENCE_MANIFEST:-/opt/cadence/models.manifest}"
PARALLELE="${CADENCE_DL_PARALLELE:-3}"
MOTIF=""
LISTER=0
while [ $# -gt 0 ]; do
  case "$1" in
    --seulement) MOTIF="${2:-}"; shift 2 ;;
    --lister) LISTER=1; shift ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
done
[ -f "$MANIFEST" ] || { echo "Manifeste introuvable : $MANIFEST" >&2; exit 2; }

LIGNES="$(mktemp)"
trap 'rm -f "$LIGNES"' EXIT
grep -vE '^\s*(#|$)' "$MANIFEST" | { if [ -n "$MOTIF" ]; then grep -- "$MOTIF" || true; else cat; fi; } > "$LIGNES"

chemin_de() { echo "${1%%|*}" | xargs; }
url_de() { echo "${1#*|}" | cut -d'|' -f1 | xargs; }

telecharger() {
  local ligne="$1" chemin url dest
  chemin="$(chemin_de "$ligne")"
  url="$(url_de "$ligne")"
  dest="$V/$chemin"
  if [ -s "$dest" ]; then echo "= $chemin (déjà là)"; return 0; fi
  mkdir -p "$(dirname "$dest")"
  local auth=()
  case "$url" in https://huggingface.co/*) [ -n "${HF_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $HF_TOKEN") ;; esac
  echo "↓ $chemin"
  if curl -fL -sS --retry 5 --retry-delay 5 --retry-all-errors -C - "${auth[@]}" -o "$dest.part" "$url"; then
    mv "$dest.part" "$dest"
    echo "✓ $chemin"
  else
    echo "✗ $chemin : échec (relancer le script reprend où il s'est arrêté)" >&2
    return 1
  fi
}

etat() {
  local manque=0 ligne chemin
  while IFS= read -r ligne; do
    chemin="$(chemin_de "$ligne")"
    if [ -s "$V/$chemin" ]; then echo "  ✓ $chemin"; else echo "  ✗ $chemin"; manque=$((manque + 1)); fi
  done < "$LIGNES"
  return $manque
}

if [ "$LISTER" = 1 ]; then
  etat; manque=$?
  echo "$manque fichier(s) manquant(s) sur $(wc -l < "$LIGNES")."
  [ "$manque" -eq 0 ]; exit
fi

echo "Volume : $V · $(wc -l < "$LIGNES") fichier(s) au manifeste · $PARALLELE téléchargement(s) en parallèle"
export V HF_TOKEN
export -f telecharger chemin_de url_de
xargs -a "$LIGNES" -d '\n' -P "$PARALLELE" -I{} bash -c 'telecharger "$1"' _ {}

echo "── Bilan"
etat; manque=$?
if [ "$manque" -eq 0 ]; then echo "Tous les modèles sont en place."; else echo "$manque fichier(s) manquant(s)." >&2; fi
[ "$manque" -eq 0 ]
