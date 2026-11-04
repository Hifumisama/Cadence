#!/bin/bash
# Lance tailscaled et, à l'arrêt du Pod (SIGTERM de supervisord), quitte proprement le tailnet (« tailscale logout »).
# Sans cela, le nœud reste listé comme hors ligne un long moment (même éphémère) : le Pod suivant, au même nom, devient
# « cadence-gpu-1 », « -2 »… et les adresses configurées ne marchent plus.
tailscaled --tun=userspace-networking --state=mem: --socket=/var/run/tailscale/tailscaled.sock &
pid=$!
arret() {
  echo "[tailscale] arrêt : déconnexion du tailnet (le nom « ${TS_HOSTNAME:-cadence-gpu} » est libéré)."
  timeout 10 tailscale logout 2>&1 || true
  kill -TERM "$pid" 2>/dev/null
}
trap arret TERM INT
wait "$pid"
wait "$pid" 2>/dev/null
