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
| `npm test` | Tests unitaires (`node:test` via tsx) : contrôle verbatim des dialogues, mesure de durée audio, export |
| `npm run db:migrate` | Applique les migrations en attente |
| `npm run db:generate` | Génère une migration à partir de `db/schema.ts` |
| `npm run db:import` | Import ponctuel des docs markdown (outil jetable, voir `scripts/import-markdown.ts`) |

### Réinitialiser la base de dev

```bash
docker compose -f docker-compose.dev.yml down -v   # supprime aussi le volume
npm run dev:setup
```

## Génération d'images d'un asset

Sur la fiche d'un asset (hors voix), le panneau « Générer l'image » soumet le
prompt de génération au worker, qui lance `workflows/image-refs/IMG_01_TextToImage.json`
(Krea 2 Turbo) avec la clause de style du projet. Le résultat est un **candidat** :
« Utiliser » en fait l'image de l'asset. En mode `stub`, les images sont factices.
Variables optionnelles : `COMFYUI_WORKFLOW_IMAGE_PATH` (workflow texte → image) et
`COMFYUI_WORKFLOW_EDITION_PATH` (workflow d'édition à partir d'images) et
`COMFYUI_WORKFLOW_AUDIO_PATH` (workflow des bruitages, Stable Audio 3 : sur la fiche d'un
asset `sfx`, « Générer… » ouvre la popup audio — prompt court en anglais et durée).

## Miniatures

Les vignettes demandent `/api/media/<chemin>?w=192` (largeurs 96, 192, 384, 768) : un
WebP réduit par `sharp`, mis en cache sous `MEDIA_ROOT/_miniatures/` et renouvelé
quand l'image source change. Sans `?w=`, la route sert l'original (zoom, ComfyUI).
Le dossier `_miniatures/` est un cache : on peut le supprimer sans risque.

## Brique LLM (agents de génération)

`lib/llm/` exécute les skills d'agents de `agents/skills/<nom>/` sur un modèle de
langage, derrière une interface remplaçable. Aujourd'hui : un serveur compatible
OpenAI (llama.cpp derrière llama-swap, Ollama, LM Studio…). Aucune clé API.

Variables (voir `.env.example`) : `LLM_FOURNISSEUR=local`, `LLM_LOCAL_URL` (URL du
serveur), `LLM_LOCAL_MODELE` (défaut `gemma4-26b-A4B`), `LLM_MODELE_<SKILL>` pour un
modèle propre à un skill (ex. `LLM_MODELE_PLAN_H3`), `LLM_TIMEOUT_MS` (défaut 10 min),
`LLM_FLUX=0` pour désactiver le flux SSE.

Essai d'un skill (un vrai appel : il occupe le GPU du serveur LLM, donc pas pendant
une génération ComfyUI) :

```
npm run llm:essai -- --skills                # skills et taille de leur prompt
npm run llm:essai -- brief-projet            # entrée fictive intégrée
npm run llm:essai -- plan-h3 --entree plan.json [--modele qwen3.6-35b-A3B] [--sans-trace]
```

Chaque exécution laisse une ligne dans `agent_traces` (statut, jetons, durée, sortie
brute, erreurs de validation). Convention du chargeur : `docs/CONCEPTION_AGENTS.md` §9.

**Dans la file du worker.** Le serveur LLM et ComfyUI partagent le même GPU : un appel
LLM est une tâche de la file, au même titre qu'une image ou une vidéo (ordre : image,
puis LLM, puis vidéo ; une seule tâche à la fois ; le worker décharge l'autre côté quand
il change de domaine). Pour en poser un sans interface (le worker doit tourner,
`npm run dev:all`) :

```
npm run llm:tache -- brief-projet --projet 5 --suivre     # entrée fictive, suit jusqu'à la fin
npm run llm:tache -- plan-h3 --entree plan.json --modele qwen3.6-35b-A3B
```

La tâche apparaît dans le panneau du header (jetons reçus, annulation) ; son résultat
validé est dans `agent_runs.resultat`, la trace complète dans `agent_traces`.
