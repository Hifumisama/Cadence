#!/bin/bash
# Point d'entrée de l'image GPU : prépare le volume, choisit le profil, génère la config de
# llama-swap, puis passe la main à supervisord (ComfyUI, llama-swap, Tailscale).
set -euo pipefail

export CADENCE_PROFIL="${CADENCE_PROFIL:-16go}"
export CADENCE_VOLUME="${CADENCE_VOLUME:-/workspace}"
V="$CADENCE_VOLUME"
P=/opt/cadence/profils

if [ ! -f "$P/$CADENCE_PROFIL.env" ]; then
  echo "Profil inconnu : « $CADENCE_PROFIL ». Profils disponibles : $(cd "$P" && ls *.env | sed 's/\.env$//' | tr '\n' ' ')" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$P/$CADENCE_PROFIL.env"
set +a
export CADENCE_LLM_DIR="${CADENCE_LLM_DIR:-$V/llm}"

mkdir -p "$V/models" "$V/comfyui/input" "$V/comfyui/output" "$V/comfyui/user" "$V/comfyui/temp" \
         "$CADENCE_LLM_DIR" /etc/cadence /var/run/tailscale

# Les modèles de ComfyUI vivent sur le volume : /opt/ComfyUI/models n'est qu'un lien. Les dossiers vides
# d'origine (checkpoints, vae…) sont recopiés sans écraser ce que le volume contient déjà.
if [ ! -L /opt/ComfyUI/models ]; then
  cp -rn /opt/ComfyUI/models.dist/. "$V/models/"
  rm -rf /opt/ComfyUI/models
  ln -s "$V/models" /opt/ComfyUI/models
fi

# Config de llama-swap : celle du volume si elle existe (on peut y déposer son config.yaml tel quel),
# sinon celle du profil, avec le dossier des modèles de langage substitué.
if [ -f "$V/llama-swap.yaml" ]; then
  cp "$V/llama-swap.yaml" /etc/cadence/llama-swap.yaml
  SOURCE_LLM="$V/llama-swap.yaml (volume)"
else
  envsubst '${CADENCE_LLM_DIR}' < "$P/$CADENCE_PROFIL.llama-swap.yaml" > /etc/cadence/llama-swap.yaml
  SOURCE_LLM="profil $CADENCE_PROFIL"
fi

if [ -n "${TS_AUTHKEY:-}" ]; then export CADENCE_TS_AUTOSTART=true; else export CADENCE_TS_AUTOSTART=false; fi

echo "──────────────────────────────────────────────"
echo " Cadence GPU · profil $CADENCE_PROFIL"
echo " Volume         $V"
echo " Modèles LLM    $CADENCE_LLM_DIR"
echo " llama-swap     $SOURCE_LLM"
echo " Tailscale      $CADENCE_TS_AUTOSTART (nom : ${TS_HOSTNAME:-cadence-gpu})"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>/dev/null | sed 's/^/ GPU            /' \
  || echo " GPU            nvidia-smi indisponible (pas de GPU visible ?)"
echo "──────────────────────────────────────────────"

exec supervisord -n -c /opt/cadence/supervisord.conf
