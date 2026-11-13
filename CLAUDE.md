# Cadence

Interface web de production de vidéos via IA :  
(conception d'un projet, scénario, plans, assets, voix, montage, export) avec des agents LLM et ComfyUI.  
Mono-utilisateur, pas d'authentification. Identité visuelle : fond anthracite, écarlate/or en accents  
uniquement (statuts, validation).

## Architecture en bref

- `app/`, `components/` : front Next.js. `lib/` : logique métier. `db/` : schéma Drizzle + migrations.
- `worker/` : processus séparé qui exécute les tâches longues (GPU, ComfyUI, LLM, export ffmpeg).
- `agents/skills/` : prompts d'exécution des agents de l'application (format Agent Skills).
  Ce ne sont PAS des skills de développement.
- `workflows/` : graphes ComfyUI (format API). `deploy/gpu/` : image Docker GPU (RunPod).
- Pas de dossier `docs/` pour l'instant : l'ancienne documentation est dans l'historique git (`git log -- docs/`), sa recréation est prévue plus tard. Les renvois à `docs/…` ou « FRICTIONS » dans les commentaires sont des repères historiques.

- `BACKLOG.md` : ce qui est décidé, en attente ou refusé (à tenir à jour à chaque point d'étape).

## Commandes

- `npm run dev:setup` (Postgres Docker + migrations), puis `npm run dev:all` (web + worker sur l'hôte).
- `npm run typecheck`, `npm test`, `npm run lint`.
- `npm run db:generate` / `npm run db:migrate`.

## Règles non négociables

- **Deux ordres.** `plans.ordre` = ordre du scénario. L'ordre du montage final vit dans `montage_entrees`
  (un plan y a 0, 1 ou plusieurs entrées). Retirer du montage ne supprime ni le plan ni ses rendus.
- **Pas de versionnage d'assets.** Une retouche remplace le nœud. Pas de suffixe `_v2`.
- **ComfyUI déterministe au 1er pass** : même seed + prompt + refs = même résultat. La seed se fixe dans le
  JSON d'appel API.
- **Migrations** : ne jamais ajouter puis utiliser une valeur d'enum Postgres dans des migrations qui peuvent
  être jouées en un seul lot sur une base neuve.

## Façon de travailler

- **Ton** : amical, succinct, sauf demande explicite de détail.
- **Fichiers** : écrire avec Write/Edit, jamais avec de gros heredocs Bash (ils échouent ici).
- **Tests** : je lance seul ce qui est simple et mesurable (typecheck, tests unitaires, plafonds, comptages).
  Tout ce qui consomme du GPU : demander d'abord, en disant quels tests et pourquoi (le GPU n'est pas toujours
  accessible). Ce qui demande du jugement (qualité d'un rendu, d'une consigne) : c'est à l'utilisateur de juger,
  le guider plutôt que lancer des agents ou des vérifications navigateur coûteuses.
- **Commits** : en français, au style du dépôt. Le hook `.claude/hooks/avant-commit.mjs` lance typecheck + tests.
- **Chantiers « futurs »** (storyboard, musique, latents/chaîne, banc de skills) : ne pas lancer sans demande.
- **Décisions d'architecture** : si un changement contredit une règle ci-dessus, le signaler au lieu de trancher.

### Évolutions demandées : j'ai le droit de refuser, et le devoir de motiver

Classer toute évolution proposée :
- **Sans risque** : je demande, l'utilisateur approuve.
- **Risque moyen** : j'exige d'approfondir pourquoi la fonctionnalité est voulue avant de coder.
- **Haut risque** : je challenge. Sans argumentaire sérieux et preuves du besoin (mesurables si possible),
  on ne code pas. Dans tous les cas, un refus s'accompagne de sa raison.

### Bibliothèque ou code maison

Avant d'ajouter une dépendance, présenter : la bibliothèque, pourquoi elle, un indice de confiance,
et la fonctionnalité qu'elle apporte. Aucune dépendance ajoutée sans accord.

### Langue

Cible : commentaires, noms de variables/fonctions et noms de dossiers/fichiers en **anglais** ;
textes de l'interface en français. Les tables, colonnes et URL **restent en français** (pas de
migration de renommage : risque élevé, gain faible). Migration du code à faire en dernier, avec la
réorganisation de `lib/` ; d'ici là, suivre la langue du fichier édité.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
