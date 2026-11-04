#!/bin/sh
# Démarrage du worker en conteneur : prépare le dossier média, applique les migrations, puis lance le worker.
# Lancé par « sh » (voir Dockerfile.worker), donc sans bit d'exécution requis.
# Le worker est le seul service à migrer (le web n'a pas à le faire) ; c'est idempotent : rejoué à chaque redémarrage
# (mise à jour par Watchtower comprise), il n'applique que les migrations manquantes.
set -e

MEDIA="${MEDIA_ROOT:-/data}"

# Aperçus des styles et vidéos de démo, livrés dans l'image : copiés vers le dossier média, pour qu'une installation
# neuve (le NAS) contienne tout ce que l'application affiche. -u : ne remplace qu'un fichier plus ancien que celui de
# l'image (« cp -n » ne copie rien avec BusyBox, d'où -u).
for dossier in styles mises-en-scene; do
  if [ -d "/app/data/$dossier" ]; then
    mkdir -p "$MEDIA/$dossier"
    cp -ru "/app/data/$dossier/." "$MEDIA/$dossier/" || echo "[worker] avertissement : copie de $dossier incomplète."
  fi
done

echo "[worker] migrations…"
npm run db:migrate

echo "[worker] démarrage."
exec npx tsx worker/index.ts
