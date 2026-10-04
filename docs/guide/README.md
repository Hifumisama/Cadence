# Guide du code de Cadence

**En une phrase** : ce dossier explique comment le code de Cadence fonctionne, pour toi (le directeur du projet) et pour un agent qui doit le modifier.

**À retenir**
- Les décisions vivent dans [`docs/FRICTIONS.md`](../FRICTIONS.md) ; ce guide les relie au code, il ne les remplace pas.
- Une page = un sujet. Chaque page commence par un résumé simple, puis une « Fiche technique » pour l'agent.
- Les chemins cités entre accents graves existent dans le dépôt : un test le vérifie (`lib/docs-guide.test.ts`).
- Si le code et ce guide divergent, c'est le code qui dit vrai ; corrige la page (et signale si FRICTIONS est en retard).

## Je veux… → je lis…

| Je veux… | Je lis |
|---|---|
| Comprendre ce que fait le système, de l'idée à la vidéo | [Vue d'ensemble](vue-d-ensemble.md) |
| Savoir ce qui se passe quand je clique sur un bouton d'agent | [Le cycle d'un skill](cycle-d-un-skill.md) |
| Connaître les sept skills (rôle, entrée, sortie, état) | [Les skills](skills.md) |
| Comprendre l'écriture et la correction d'une fiche de plan | [Étape 3 : les fiches de plan](etape-3-fiches-de-plan.md) |
| Savoir ce qu'une proposition peut écrire, et ce qu'elle refuse | [Cibles et applicateurs](cibles-et-applicateurs.md) |
| Régler le modèle de langage, comprendre une sortie tronquée | [Le LLM](llm.md) |
| Comprendre la file d'attente, ComfyUI, le GPU partagé | [Worker et ComfyUI](worker-et-comfyui.md) |
| Savoir où vit une information en base | [Les données](donnees.md) |
| Ajouter un skill | [Recette : ajouter un skill](recettes/ajouter-un-skill.md) |
| Ajouter un type de changement | [Recette : ajouter une cible](recettes/ajouter-une-cible.md) |
| Ajouter une étape du pipeline en lot | [Recette : ajouter une étape en lot](recettes/ajouter-une-etape-en-lot.md) |
| Brancher un nouveau workflow ComfyUI | [Recette : brancher un workflow](recettes/brancher-un-workflow-comfyui.md) |
| Comprendre une tâche d'agent en échec | [Recette : déboguer une tâche d'agent](recettes/deboguer-une-tache-agent.md) |
| Lancer les tests et les essais | [Recette : lancer les tests](recettes/lancer-les-tests.md) |
| Ajouter une colonne ou une table | [Recette : appliquer une migration](recettes/appliquer-une-migration.md) |
| Écrire une fiche de plan à la main (hors application) | [`docs/FICHE_DE_PLAN_S01_maya.md`](../FICHE_DE_PLAN_S01_maya.md) (exemples validés) et le skill de chat `.claude/skills/fiche-de-plan/SKILL.md` |
| Retrouver une décision par thème | [Index des décisions](decisions.md) |
| Comprendre un mot du projet | [Glossaire](glossaire.md) |

## Les autres documents (hors guide)

- [`docs/FRICTIONS.md`](../FRICTIONS.md) : source de vérité des décisions (journal daté).
- [`docs/CAHIER_DES_CHARGES.md`](../CAHIER_DES_CHARGES.md) : spécification de l'interface.
- [`docs/CONCEPTION_AGENTS.md`](../CONCEPTION_AGENTS.md) : conception des agents (le §14 décrit ce qui est construit).
- [`docs/00_BIBLE.md`](../00_BIBLE.md), [`docs/REGISTRE_ASSETS.md`](../REGISTRE_ASSETS.md), [`docs/S01_maya.md`](../S01_maya.md) : contenu de la série.
- [`workflows/README.md`](../../workflows/README.md) : contrat des nœuds ComfyUI (document vivant, à lire avant de toucher un workflow).
- [`README.md`](../../README.md) (racine) : installation et commandes de développement.

## Fiche technique

**Convention de page** (à respecter pour toute nouvelle page de `docs/guide/`) :
1. Un titre, puis « **En une phrase** » et « **À retenir** » (3 à 6 puces, langage simple).
2. « **Fiche technique** » pour l'agent : fichiers clés (chemins exacts depuis la racine), fonctions et types, tables, variables d'environnement, **invariants à ne pas casser**, **pièges connus**, comment tester (commande exacte).
3. Une ligne « **Dernière vérification** » (date et commit) et « **Voir aussi** » (liens relatifs).
4. Diagrammes en blocs `mermaid` ; phrases courtes ; un terme est défini à son premier usage ou dans le [glossaire](glossaire.md).

**Vérification automatique** : `npm test` lance `lib/docs-guide.test.ts`, qui contrôle pour chaque page du guide et pour les README de dossiers (`agents/skills/README.md`, `lib/agents/README.md`, `lib/llm/README.md`, `worker/README.md`, `scripts/README.md`) :
- que chaque lien markdown relatif pointe vers un fichier existant ;
- que chaque chemin `dossier/fichier.ext` cité entre accents graves (extensions ts, tsx, md, json, sql, yml) existe (racine du dépôt ou dossier de la page) ; les chemins avec `<…>` ou `*` sont ignorés ;
- que chaque page de `docs/guide/` contient « En une phrase » et « Fiche technique ».

**Invariant** : une page ne recopie pas une décision de FRICTIONS ; elle la résume en une ligne et pointe vers sa section.

**Piège connu** : le dépôt contient des fichiers en fins de ligne CRLF (FRICTIONS, CLAUDE.md, `workflows/README.md`) ; les pages du guide sont en LF.

**Tester** : `npm test`.

**Dernière vérification** : 2026-10-02 (commit 1e88970, plus les modifications non commitées de la branche `feature/agents-skills`).

**Voir aussi** : [Vue d'ensemble](vue-d-ensemble.md) · [Glossaire](glossaire.md) · [Décisions](decisions.md)
