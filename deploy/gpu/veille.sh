#!/bin/bash
# Coupe-circuit : arrête le Pod RunPod après CADENCE_INACTIVITE_MIN minutes d'inactivité TOTALE (défaut 15 ; 0 = désactivé).
# Un Pod facture tant qu'il tourne, utilisé ou non.
#
# Le Pod est « actif » s'il se passe au moins une de ces choses (vérifié toutes les 30 s) :
#   - le GPU travaille (utilisation ≥ CADENCE_INACTIVITE_GPU_PCT, défaut 5 %) : couvre ComfyUI et le LLM ;
#   - ComfyUI a un travail en cours ou en attente (/queue) ;
#   - le téléchargement des modèles tourne.
# Sinon un compteur avance ; il repart à zéro dès qu'une activité reparaît. À échéance : arrêt via l'API RunPod
# (RUNPOD_POD_ID et RUNPOD_API_KEY, que RunPod injecte lui-même dans le Pod).
#
# Variables :
#   CADENCE_INACTIVITE_MIN      minutes d'inactivité avant l'arrêt (défaut 15, 0 = jamais)
#   CADENCE_INACTIVITE_ACTION   stop (défaut : le Pod s'arrête, son disque est conservé) ou terminate (le Pod est supprimé)
#   CADENCE_INACTIVITE_GPU_PCT  seuil d'utilisation GPU considéré comme « actif » (défaut 5)
#
# Si « stop » est refusé (certains Pods avec volume réseau ne peuvent pas être stoppés), le script retente avec
# « terminate » : le volume réseau, lui, n'est jamais touché.
set -u

MIN="${CADENCE_INACTIVITE_MIN:-15}"
ACTION="${CADENCE_INACTIVITE_ACTION:-stop}"
SEUIL_GPU="${CADENCE_INACTIVITE_GPU_PCT:-5}"
PAS=30

case "$MIN" in ''|*[!0-9]*) echo "[veille] CADENCE_INACTIVITE_MIN invalide (« $MIN ») : coupe-circuit désactivé." >&2; exit 0 ;; esac
if [ "$MIN" -eq 0 ]; then echo "[veille] désactivée (CADENCE_INACTIVITE_MIN=0)."; exit 0; fi
if [ -z "${RUNPOD_POD_ID:-}" ] || [ -z "${RUNPOD_API_KEY:-}" ]; then
  echo "[veille] RUNPOD_POD_ID / RUNPOD_API_KEY absents (hors RunPod ?) : coupe-circuit désactivé." >&2
  exit 0
fi

LIMITE=$((MIN * 60))
API="https://api.runpod.io/v2/pods/$RUNPOD_POD_ID"

actif() {
  # Téléchargement des modèles en cours
  pgrep -f telecharger-modeles.sh >/dev/null 2>&1 && return 0
  # GPU qui travaille
  local u
  u="$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | sort -n | tail -1 | tr -d ' ')"
  case "$u" in ''|*[!0-9]*) ;; *) [ "$u" -ge "$SEUIL_GPU" ] && return 0 ;; esac
  # Travail en cours ou en attente dans ComfyUI
  local q
  q="$(curl -s --max-time 5 http://127.0.0.1:8188/queue 2>/dev/null | tr -d ' \n')"
  case "$q" in *'"queue_running":[]'*'"queue_pending":[]'*|'') ;; *) return 0 ;; esac
  return 1
}

action() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST "$API/action" \
    -H "Authorization: Bearer $RUNPOD_API_KEY" -H "Content-Type: application/json" \
    -d "{\"action\":\"$1\"}"
}

echo "[veille] active : arrêt ($ACTION) après $MIN min d'inactivité totale (GPU < $SEUIL_GPU %, ComfyUI au repos, pas de téléchargement)."
inactif=0
prochain_rappel=300
while true; do
  sleep "$PAS"
  if actif; then
    [ "$inactif" -ge 300 ] && echo "[veille] activité détectée : compteur remis à zéro."
    inactif=0; prochain_rappel=300
    continue
  fi
  inactif=$((inactif + PAS))
  if [ "$inactif" -ge "$prochain_rappel" ] && [ "$inactif" -lt "$LIMITE" ]; then
    echo "[veille] inactif depuis $((inactif / 60)) min : arrêt dans $(((LIMITE - inactif + 59) / 60)) min sans activité."
    prochain_rappel=$((prochain_rappel + 300))
  fi
  if [ "$inactif" -ge "$LIMITE" ]; then
    echo "[veille] $MIN min d'inactivité : arrêt du Pod ($ACTION)."
    code="$(action "$ACTION")"
    if [ "${code:0:1}" != "2" ] && [ "$ACTION" = "stop" ]; then
      echo "[veille] « stop » refusé (HTTP $code) : essai avec « terminate » (le volume réseau est conservé)." >&2
      code="$(action terminate)"
    fi
    if [ "${code:0:1}" = "2" ]; then
      echo "[veille] demande acceptée (HTTP $code). Le Pod va s'éteindre."
      # Libère le nom Tailscale tout de suite (sinon le Pod suivant devient « cadence-gpu-1 »).
      timeout 10 tailscale logout >/dev/null 2>&1 || true
      sleep 600
    else
      echo "[veille] ÉCHEC de l'arrêt (HTTP $code) : le Pod continue de facturer. Arrête-le à la main dans RunPod. Nouvel essai dans 5 min." >&2
      inactif=$((LIMITE - 300))
    fi
  fi
done
