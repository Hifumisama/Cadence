#!/bin/bash
# Rejoint le réseau Tailscale une fois tailscaled démarré. Mode « userspace » (pas d'interface réseau à
# créer, ce qu'un Pod RunPod n'a pas le droit de faire). La clé doit être ÉPHÉMÈRE : le nœud disparaît du
# réseau quand le Pod s'arrête, et on n'accumule pas de machines mortes (ajouté à la clé si elle n'en dit rien).
set -u
key="${TS_AUTHKEY:-}"
[ -z "$key" ] && { echo "TS_AUTHKEY absent : Tailscale non démarré."; exit 0; }
case "$key" in *\?*) ;; *) key="${key}?ephemeral=true&preauthorized=true" ;; esac

for _ in $(seq 1 30); do [ -S /var/run/tailscale/tailscaled.sock ] && break; sleep 1; done

for essai in 1 2 3 4 5; do
  if tailscale up --authkey="$key" --hostname="${TS_HOSTNAME:-cadence-gpu}" --accept-dns=false --accept-routes=false; then
    echo "Tailscale connecté : $(tailscale ip -4 2>/dev/null | head -1) (${TS_HOSTNAME:-cadence-gpu})"
    exit 0
  fi
  echo "tailscale up a échoué (essai $essai/5), nouvelle tentative…"
  sleep 5
done
echo "Tailscale : connexion impossible. Le Pod tourne mais n'est pas joignable." >&2
exit 1
