#!/bin/bash
# Télécharge sur le volume les modèles de models.manifest qui n'y sont pas encore. Relançable à volonté :
# un fichier déjà là est ignoré, un téléchargement interrompu reprend où il s'est arrêté (fichier « .part »).
# Une ligne de progression s'affiche toutes les 20 secondes : volume, pourcentage, fichiers, débit, temps restant.
#
#   telecharger-modeles.sh                  télécharge ce qui manque
#   telecharger-modeles.sh --lister         dit ce qui est là et ce qui manque, sans rien télécharger
#   telecharger-modeles.sh --seulement taeh3   ne traite que les lignes du manifeste contenant « taeh3 »
#
# Variables : CADENCE_VOLUME (défaut /workspace), CADENCE_MANIFEST, CADENCE_DL_PARALLELE (défaut 3),
# CADENCE_DL_INTERVALLE (secondes entre deux lignes de progression, défaut 20),
# HF_TOKEN (jeton Hugging Face, ajouté aux seules requêtes vers huggingface.co).
set -uo pipefail

V="${CADENCE_VOLUME:-/workspace}"
MANIFEST="${CADENCE_MANIFEST:-/opt/cadence/models.manifest}"
PARALLELE="${CADENCE_DL_PARALLELE:-3}"
INTERVALLE="${CADENCE_DL_INTERVALLE:-20}"
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
TAILLES="$(mktemp)"
SUIVI=""
trap 'rm -f "$LIGNES" "$TAILLES"; [ -n "$SUIVI" ] && kill "$SUIVI" 2>/dev/null' EXIT
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

# ── Progression ────────────────────────────────────────────────────────────────────────────────────────
# Taille d'un fichier distant (en-têtes seulement) ; 0 si le serveur ne la donne pas.
taille_distante() {
  local url="$1" auth=()
  case "$url" in https://huggingface.co/*) [ -n "${HF_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $HF_TOKEN") ;; esac
  curl -sIL --max-time 30 "${auth[@]}" "$url" | tr -d '\r' | awk 'tolower($1)=="content-length:" {v=$2} END {print v+0}'
}

# Octets présents sur le volume pour les fichiers du manifeste : terminés + « .part » en cours.
octets_presents() {
  local s=0 ligne chemin f
  while IFS= read -r ligne; do
    chemin="$(chemin_de "$ligne")"
    for f in "$V/$chemin" "$V/$chemin.part"; do
      [ -f "$f" ] && s=$((s + $(stat -c %s "$f")))
    done
  done < "$LIGNES"
  echo "$s"
}

fichiers_termines() {
  local n=0 ligne chemin
  while IFS= read -r ligne; do
    chemin="$(chemin_de "$ligne")"
    [ -s "$V/$chemin" ] && n=$((n + 1))
  done < "$LIGNES"
  echo "$n"
}

# Ligne de progression toutes les INTERVALLE secondes, jusqu'à ce qu'on la tue.
suivre() {
  local total="$1" n="$2" avant apres delta debit restant
  avant="$(octets_presents)"
  while sleep "$INTERVALLE"; do
    apres="$(octets_presents)"
    delta=$((apres - avant)); avant="$apres"
    debit=$((delta / INTERVALLE))
    awk -v a="$apres" -v t="$total" -v d="$debit" -v f="$(fichiers_termines)" -v n="$n" 'BEGIN {
      pct = (t > 0) ? 100 * a / t : 0; if (pct > 100) pct = 100
      reste = (d > 0 && t > a) ? (t - a) / d : -1
      eta = (reste < 0) ? "?" : (reste >= 3600 ? sprintf("%dh%02d", reste / 3600, (reste % 3600) / 60) : sprintf("%d min", reste / 60 + 0.5))
      printf "[progression] %.1f / %.1f Go (%d %%) · %d/%d fichiers · %.0f Mo/s · reste ~%s\n", a / 1e9, t / 1e9, pct, f, n, d / 1e6, eta
    }' | sed 's/\([0-9]\)\.\([0-9]\)/\1,\2/g'
  done
}

if [ "$LISTER" = 1 ]; then
  etat; manque=$?
  echo "$manque fichier(s) manquant(s) sur $(wc -l < "$LIGNES")."
  [ "$manque" -eq 0 ]; exit
fi

NB="$(wc -l < "$LIGNES")"
echo "Volume : $V · $NB fichier(s) au manifeste · $PARALLELE téléchargement(s) en parallèle"

# Taille totale attendue : la taille réelle des fichiers déjà là, la taille annoncée par le serveur pour les autres.
total=0; manquants=0
while IFS= read -r ligne; do
  chemin="$(chemin_de "$ligne")"
  if [ -s "$V/$chemin" ]; then
    total=$((total + $(stat -c %s "$V/$chemin")))
  else
    manquants=$((manquants + 1))
    total=$((total + $(taille_distante "$(url_de "$ligne")")))
  fi
done < "$LIGNES"

if [ "$manquants" -gt 0 ]; then
  echo "À télécharger : $manquants fichier(s) · total attendu $(awk -v t="$total" 'BEGIN {printf "%.1f", t / 1e9}' | sed 's/\./,/') Go"
  suivre "$total" "$NB" &
  SUIVI=$!
fi

export V HF_TOKEN
export -f telecharger chemin_de url_de
xargs -a "$LIGNES" -d '\n' -P "$PARALLELE" -I{} bash -c 'telecharger "$1"' _ {}

[ -n "$SUIVI" ] && { kill "$SUIVI" 2>/dev/null; SUIVI=""; sleep 0.5; }  # laisse finir une ligne de progression en cours
echo "── Bilan"
etat; manque=$?
if [ "$manque" -eq 0 ]; then echo "Tous les modèles sont en place."; else echo "$manque fichier(s) manquant(s)." >&2; fi
[ "$manque" -eq 0 ]
