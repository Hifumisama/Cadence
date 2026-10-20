# Cadence — Interface de production Les Yeux de Rubis

Série vidéo IA. Ce dépôt contient à la fois la documentation de la série
(`docs/`) et, à terme, Cadence, l'interface web qui pilote son pipeline de
production. Identité visuelle : fond anthracite, écarlate/or en accents
uniquement (statuts, validation), pas de fond rouge — détails dans
`docs/CAHIER_DES_CHARGES.md`.

## Documents à lire selon la tâche

Ne pas tout charger d'un coup — lire à la demande selon ce qui est en cours :

- `workflows/` — graphes ComfyUI (format API) consommés par le backend,
  organisés par type (génération vidéo, upscale, voix, images de
  référence). Dépendance d'exécution, pas de la doc — voir
  `workflows/README.md` avant d'en committer un nouveau.

- `docs/00_BIBLE.md` — univers, personnages, style visuel, règles du monde
- **Décisions d'architecture** : `docs/FRICTIONS.md` (journal daté de toutes les décisions) a été retiré le 2026-10-20 ;
  il reste dans l'historique git (`git log -- docs/FRICTIONS.md`). Les règles en vigueur sont résumées ci-dessous ; les
  renvois « FRICTIONS, date » des commentaires et des docs sont des repères historiques. Avant une évolution structurelle
  qui contredirait une règle ci-dessous, le signaler explicitement plutôt que de trancher en silence.
- `docs/CAHIER_DES_CHARGES.md` — spec de l'interface (pages, modèle de
  données, phasage)
- `docs/CONCEPTION_AGENTS.md` — conception des agents de
  génération : brief, propositions, portée × mode, fournisseur LLM
- `agents/skills/` — prompts d'exécution des agents de l'app (`plan-h3`,
  `iteration-plan`, `scenario-episode`, `prompt-asset`, `notes-entretien`…). Ce sont
  les seuls skills du dépôt : les skills de chat de `.claude/skills/` ont été
  supprimés (FRICTIONS, 2026-10-12). Format standard Agent Skills (`SKILL.md`, `references/`, `assets/`), instructions en
  anglais (lues par un petit modèle local), langue de sortie fixée champ par champ
  (voir FRICTIONS.md, 2026-10-07)
- `docs/PLAN_CONCEPTION_PROJET.md` — page de conception d'un projet (choix avant l'entretien, bibliothèque
  de styles `lib/styles/`, scénariste, avancée) : plan par phases et décisions, toutes phases faites (voir
  FRICTIONS.md, 2026-10-07 et 2026-10-08)
- `docs/references/` — guide officiel MiniMax H3 (`h3-guide-fullref.md`, `h3-guide-base.md`), référence de lecture pour `plan-h3` et `lib/prompt.ts` (aucun code ne les lit)
- `docs/guide/` — guide de développement (cycle d'un skill, vue d'ensemble)
- `docs/REGISTRE_ASSETS.md` — état des assets de l'épisode 1
- `docs/FICHE_DE_PLAN_S01_maya.md`, `docs/S01_maya.md` — contenu de
  l'épisode 1
- `docs/FICHE_DE_PLAN_UTILITAIRES.md` — plans hors récit (tests voix, etc.)

## Règles non négociables

- **Plus de numéro de plan** (F03, révisions 2026-09-28 puis 2026-09-29) : un
  plan s'identifie par son `uuid` (identifiant public, utilisé dans les URL).
  `plans.id` (serial) reste la clé technique interne (FK, dossiers de rendu
  `plans/<id>/`), jamais exposée. **L'ordre** des plans est `plans.ordre`,
  réordonnable par glisser-déposer, comme dans un logiciel de montage ; ce
  qu'on affiche est la **position** (rang dans l'épisode, « 04 »), qui change
  quand on réordonne. Ne jamais citer une position comme identifiant, ni
  trier par autre chose que `ordre`. Un plan supprimé ne laisse aucun trou.
- **Pas de versionnage d'assets.** Une retouche remplace le nœud (F01,
  tranché 2026-09-25). Pas de suffixe `_v2`.
- **1er pass ComfyUI déterministe** : même seed + même prompt + mêmes refs
  → même résultat. La seed se fixe dans le JSON en appel API — pas besoin
  des nœuds `easy seed` (confort interactif uniquement).
- **La voix prime sur les bruitages** en cas de concurrence de slots audio
  dans une fiche de plan.
- Mono-utilisateur pour l'instant — pas d'authentification à prévoir.

## Skills disponibles

Les skills vivent dans `agents/skills/` (un dossier par skill, chargés par `lib/llm/skills.ts`) :

- conception du projet : `accroche-scenariste`, `conversation-agent`, `notes-entretien` (le brief se remplit au
  fil de la conversation ; son schéma est `lib/agents/brief-schema.json`)
- production : `scenario-episode`, `inventaire-assets`, `relecture-scenario` (relecture du scénario écrit, avant les fiches), `prompt-asset`, `prompt-affiche`, `plan-h3`
- correction : `iteration-plan`

Les anciens skills de chat (`scenario`, `fiche-de-plan`, `assets-comfyui`, `voix-comfyui`) n'existent plus. Les
règles de nommage et de versionnage ci-dessus priment sur toute copie qui en traînerait
ailleurs (claude.ai, `~/.claude`).

Le casting vocal (skill `prompt-voix`, assets `voix`, `voix_fiches`, prises, doublage) est retiré (FRICTIONS, 2026-10-14) : **la voix est un champ
du personnage** (`assets.voix_*`), créée depuis le bloc « Voix » de sa fiche (`/p/<id>/assets/<code>`) ; il n'y a plus d'entité « réplique » : le dialogue vit dans la description du plan puis dans le prompt (`<d>`), voir FRICTIONS 2026-10-14.

## État du projet

L'application existe et tourne : pipeline de production (plans, assets, voix, fiches), système d'agents (conversation,
brief, propositions, relecture du scénario, affiches) et, depuis octobre 2026, la **conception d'un projet** (`/nouveau` puis `/p/<id>/demarrage` :
huit étapes, de « format » à « avancée de la préparation »). Le phasage
d'origine reste dans `docs/CAHIER_DES_CHARGES.md`.

Pour la conception d'un projet : la bibliothèque de styles vit dans `lib/styles/` (`bibliotheque.json`, `clauses.json`,
`sujets.ts` = les scènes communes des images de présentation) ; `npm run styles:apercus` génère ces images. L'application lit la table `styles`, semée depuis ces JSON par `db/seed-styles.ts` (à chaque `npm run db:migrate`) ; les images restent des fichiers sous `data/styles/`. Il n'y a plus de séries (retirées le 2026-10-20) : un projet est un film, avec un épisode unique ; la table `seasons` et le type de projet n'existent plus.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
