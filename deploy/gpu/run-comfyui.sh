#!/bin/bash
# Lance ComfyUI. Options de départ : celles du PC distant (--enable-manager --listen --vram-headroom 12
# --async-offload --fast-disk --disable-partner-nodes). --vram-headroom vient du profil (VRAM laissée au LLM).
# COMFY_EXTRA_ARGS (variable d'environnement du Pod) ajoute des options sans reconstruire l'image.
set -euo pipefail
V="${CADENCE_VOLUME:-/workspace}"
cd /opt/ComfyUI
# shellcheck disable=SC2086
exec python main.py --listen --port 8188 \
  --enable-manager --disable-partner-nodes --async-offload --fast-disk \
  --vram-headroom "${COMFY_VRAM_HEADROOM:-12}" \
  --input-directory "$V/comfyui/input" \
  --output-directory "$V/comfyui/output" \
  --user-directory "$V/comfyui/user" \
  --temp-directory "$V/comfyui/temp" \
  ${COMFY_EXTRA_ARGS:-}
