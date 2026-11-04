#!/bin/bash
# Rejoint le réseau Tailscale une fois tailscaled démarré. Mode « userspace » (pas d'interface réseau à
# créer, ce qu'un Pod RunPod n'a pas le droit de faire). La clé devrait être ÉPHÉMÈRE : le nœud disparaît du
# réseau quand le Pod s'arrête, et on n'accumule pas de machines mortes. Si elle ne l'est pas, on le demande
# à la connexion (paramètre d'URL de la clé) ; si Tailscale refuse la clé ainsi modifiée, on réessaie telle quelle.
set -u
key="${TS_AUTHKEY:-}"
# Nettoyage : espaces, retours chariot, guillemets (un copier-coller dans un champ de formulaire en laisse parfois).
key="$(printf '%s' "$key" | tr -d ' \t\r\n"'"'")"
[ -z "$key" ] && { echo "TS_AUTHKEY absent : Tailscale non démarré."; exit 0; }
# Diagnostic sans dévoiler la clé : forme, longueur, fin.
echo "Tailscale : clé lue = ${key:0:11}… (${#key} caractères, fin …${key: -4})"
case "$key" in
  tskey-auth-*) ;;
  tskey-client-*) echo "Tailscale : c'est une clé OAuth (tskey-client-…), pas une clé d'authentification : elle exige des tags (--advertise-tags). Crée plutôt une « Auth key »." >&2 ;;
  tskey-api-*) echo "Tailscale : c'est une clé d'API (tskey-api-…), pas une clé d'authentification (tskey-auth-…) : Tailscale la refusera." >&2 ;;
  *) echo "Tailscale : la clé ne commence pas par tskey-auth- : elle sera probablement refusée." >&2 ;;
esac

for _ in $(seq 1 30); do [ -S /var/run/tailscale/tailscaled.sock ] && break; sleep 1; done

nom="${TS_HOSTNAME:-cadence-gpu}"
# Le nom d'hôte DNS n'accepte pas le tiret bas : « cadence_gpu » devient « cadence-gpu ».
nom="${nom//_/-}"

# Variantes de la clé, dans l'ordre : avec « éphémère + préapprouvé » demandés explicitement, puis telle quelle.
case "$key" in
  *\?*) variantes=("$key") ;;
  *) variantes=("${key}?ephemeral=true&preauthorized=true" "$key") ;;
esac

for essai in 1 2 3; do
  for k in "${variantes[@]}"; do
    if tailscale up --authkey="$k" --hostname="$nom" --accept-dns=false --accept-routes=false; then
      echo "Tailscale connecté : $(tailscale ip -4 2>/dev/null | head -1) ($nom)"
      exit 0
    fi
    if [ "$k" = "$key" ]; then v="clé telle quelle"; else v="clé + éphémère/préapprouvé"; fi
    echo "tailscale up a échoué (essai $essai/3, $v)…"
  done
  sleep 5
done
echo "Tailscale : connexion impossible. Le Pod tourne mais n'est pas joignable. Vérifie la clé (tskey-auth-…, réutilisable, non expirée) ; test à la main : tailscale up --authkey=\$TS_AUTHKEY --hostname=$nom" >&2
exit 1
