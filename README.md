# Cadence

Assistant de réalisation de projet vidéo.

## Développement local

Prérequis : Node.js 22+, Docker Desktop (uniquement pour Postgres).

```bash
cp .env.example .env      # première fois seulement
npm install
npm run dev:setup         # démarre Postgres (Docker) + applique les migrations
npm run dev:all            # lance web (next dev) et worker ensemble
```

`npm run dev:all` affiche les deux processus dans un seul terminal, préfixés
`[web]` / `[worker]`. Le site est sur http://localhost:3000 (ou le premier
port libre si occupé).

En mode dev, `COMFYUI_MODE=stub` (par défaut dans `.env.example`) : le worker
traite les jobs sans appeler de vraie instance ComfyUI, utile pour tester le
pipeline sans matériel de génération disponible.

### Pourquoi Docker seulement pour Postgres ?

`docker-compose.yml` (racine) décrit le déploiement de **production** sur le
mini PC — web + worker + Postgres en conteneurs, avec le stockage média
monté depuis le partage NFS. En dev, reconstruire une image à chaque
modification de code serait plus lent que le hot-reload de `next dev` : web
et worker tournent donc directement sur la machine, contre un Postgres
dockerisé isolé de la prod (`docker-compose.dev.yml`, volume
`cadence_postgres_dev_data` distinct de `cadence_postgres_data`).

### Commandes utiles

| Commande | Effet |
|---|---|
| `npm run dev:db` | Démarre (ou redémarre) le Postgres de dev |
| `npm run dev:db:down` | Arrête le Postgres de dev (les données restent dans le volume Docker) |
| `npm run dev:setup` | `dev:db` + migrations — à relancer après un `git pull` qui ajoute des migrations |
| `npm run dev` | Web seul (`next dev`) |
| `npm run worker` | Worker seul, avec rechargement à chaud |
| `npm run dev:all` | Web + worker ensemble, sortie combinée |
| `npm run db:migrate` | Applique les migrations en attente |
| `npm run db:generate` | Génère une migration à partir de `db/schema.ts` |
| `npm run db:import` | Import ponctuel des docs markdown (outil jetable, voir `scripts/import-markdown.ts`) |

### Réinitialiser la base de dev

```bash
docker compose -f docker-compose.dev.yml down -v   # supprime aussi le volume
npm run dev:setup
```
