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
- `docs/REGISTRE_ASSETS.md` — état des assets de l'épisode 1
- `docs/FICHE_DE_PLAN_S01_maya.md`, `docs/S01_maya.md` — contenu de
  l'épisode 1
- `docs/FICHE_DE_PLAN_UTILITAIRES.md` — plans hors récit (tests voix, etc.)

## Règles non négociables (résumé — le détail est dans FRICTIONS.md)

- **Numéro de plan = pivot du système.** Continu sur toute la série, jamais
  remis à zéro par épisode, jamais renuméroté, jamais réutilisé après
  suppression. C'est la clé qui relie scénario, fiche de plan, assets et
  génération.
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
