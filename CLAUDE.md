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
- `docs/FRICTIONS.md` — **source de vérité de toutes les décisions
  d'architecture déjà prises**. Avant de proposer une évolution structurelle
  (schéma de données, convention de nommage, règle métier), vérifier qu'elle
  n'a pas déjà été tranchée ici — et si elle contredit une décision actée,
  le signaler explicitement plutôt que de trancher en silence.
- `docs/CAHIER_DES_CHARGES.md` — spec de l'interface (pages, modèle de
  données, phasage)
- `docs/CONCEPTION_AGENTS.md` — conception (non construite) des agents de
  génération : brief, propositions, portée × mode, fournisseur LLM
- `agents/skills/` — prompts d'exécution des agents de l'app (`plan-h3`,
  `iteration-plan`…), distincts des skills de chat de `.claude/skills/`. Format
  standard Agent Skills (`SKILL.md`, `references/`, `assets/`), instructions en
  anglais (lues par un petit modèle local), langue de sortie fixée champ par champ
  (voir FRICTIONS.md, 2026-10-07)
- `docs/PLAN_CONCEPTION_PROJET.md` — page de conception d'un projet (choix avant l'entretien, bibliothèque
  de styles `lib/styles/`, scénariste, avancée) : plan par phases et décisions (voir FRICTIONS.md, 2026-10-07)
- `docs/REGISTRE_ASSETS.md` — état des assets de l'épisode 1
- `docs/FICHE_DE_PLAN_S01_maya.md`, `docs/S01_maya.md` — contenu de
  l'épisode 1
- `docs/FICHE_DE_PLAN_UTILITAIRES.md` — plans hors récit (tests voix, etc.)

## Règles non négociables (résumé — le détail est dans FRICTIONS.md)

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

`.claude/skills/` contient les skills déjà utilisés en amont de ce projet
(rédaction assistée, hors interface) :

- `scenario` — texte narratif → découpage plan par plan
- `fiche-de-plan` — découpage → prompts MiniMax H3 par plan
- `assets-comfyui` — prompts de génération d'images de référence
- `voix-comfyui` — voice design et génération de répliques

Ces skills sont pensés pour un usage conversationnel (rédaction assistée en
chat). Pour l'interface elle-même (agents intégrés — voir F. "agents" du
cahier des charges), ils devront probablement être adaptés en prompts
système + outils, pas repris tels quels — point encore ouvert.

## État du projet

Cahier des charges rédigé, pas encore de code. Voir `docs/CAHIER_DES_CHARGES.md`
pour le phasage proposé (V1 : Shots + Fiche de plan, sans agent).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
