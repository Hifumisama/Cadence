# Labo de qualité

Banc d'essai des agents de Cadence, premier sujet : durée et densité de `scenario-scene`.
Il vit dans le dépôt pour mesurer le vrai code, et reste isolé : `labo/` importe `lib/`, jamais l'inverse.

## Commandes

```bash
npm run labo -- export duration-259-261-264 --projects 259,261,264   # une fois, lit la base
npm run labo -- report duration-259-261-264                          # sans modèle
npm run labo -- run duration-259-261-264 --reps 3                    # à blanc : n'appelle rien
npm run labo -- run duration-259-261-264 --reps 3 --launch           # consomme le GPU
npm run labo -- compare labo/runs/<essai>                            # refait un rapport
```

Options de `run` : `--variants A`, `--only 261,264-s2-t1930`, `--model`, `--body '{}'`.

**Avant `--launch`** : le labo appelle le LLM directement, sans passer par la file GPU du worker.
Lancer seulement quand aucun rendu ComfyUI ne tourne, et que le GPU est libéré (la même carte sert aux deux).

## Fichiers

| Chemin | Rôle |
|---|---|
| `src/cli.ts` | les quatre commandes |
| `src/export.ts` | seul fichier qui lit la base (transaction en lecture seule), n'écrase jamais un jeu |
| `src/variants.ts` | variantes : skill de production + remplacements déclarés, entrée enrichie, contrôle en plus |
| `src/run.ts` | rejeu par `executerSkill` (aucune trace en base), capture de chaque réponse brute |
| `src/metrics.ts` | mesures automatiques |
| `src/report.ts` | rapports en français |
| `src/lab.test.ts` | tests, avec un faux modèle (lancés par `npm test`) |
| `datasets/` | jeux figés |
| `reports/` | rapports sur les appels historiques |
| `runs/<essai>/` | `manifest.json`, prompt exact de chaque variante, un fichier par appel, `report.md` |
| `handoff/` | notes pour la navette entre Claude et GPT |

Hors du dossier : `package.json` (script `labo`, tests) et `knip.json`.

## Ce qui existait déjà (et qu'on réutilise)

| Existant | Usage ici |
|---|---|
| `executerSkill` (`lib/llm/execute.ts`) | rejeu : racine de skill et fournisseur injectables, trace désactivable |
| `controleurPourSkill` | même contrôle et même renvoi qu'en production |
| `ajusterDureesScene`, `bornesDuree` | durées après code |
| `lib/agents/stillness.ts` | plans immobiles ou vides, doublons, gestes répétés |
| table `agent_traces` | entrées exactes et sorties des appels passés |
| `essais/` | anciens bancs, non suivis par git et hors typecheck : référence seulement |
| `scripts/banc-*` (retirés, commit `2b71a1f`) | anciens bancs LLM et vidéo, dans l'historique git |

## Mesures

Toutes automatiques. « Final » = après le code.

| Mesure | Calcul |
|---|---|
| Durée cible, moments | `scene.dureeCibleSecondes`, nombre de `scene.moments` (absent avant le 2026-11-17) |
| Plans, durée brute | plans de la sortie, somme de leurs `dureeSecondes` |
| Durée après ajustement | `ajusterDureesScene` actuel |
| Secondes ajoutées par le code | après ajustement − brute : du temps sans texte en plus |
| Cible atteignable | nombre de plans × 10 s ≥ cible |
| Dans les bornes | `bornesDuree`, comme l'avertissement de production |
| Mots de récit par seconde | mots de la description sans répliques ni consigne de l'auteur |
| Immobiles, vides, doublons, gestes répétés | détecteurs de production |
| Durée stockée | base au moment de l'export |
| Durée rendue | `ffprobe` sur le dernier rendu réussi de chaque plan stocké |
| Corrections de relecture | trace `relecture-scenario`, rattachée à la scène par ses repères de plan |

**Non mesuré automatiquement** : progression narrative, remplissage, fidélité à l'auteur, qualité. Ça se lit.

## Protocole

1. Jeu figé : les 9 appels des projets 259, 261 et 264.
2. A (production actuelle) est **rejouée** : les appels historiques viennent de trois versions du skill.
3. Même modèle et mêmes réglages pour toutes les variantes, enregistrés dans le manifeste.
4. 3 répétitions ; les variantes alternent à l'intérieur de chaque répétition.
5. Mesures automatiques sur toutes les répétitions ; lecture à l'aveugle sur une seule.
6. B et C : à définir (voir `handoff/`). La lecture à l'aveugle reste à construire.

## Limites et biais

- 9 scènes, 3 films, un seul auteur et un seul modèle : de quoi orienter une décision, pas prouver.
- Les entrées viennent de traitements anciens ; le traitement actuel pourrait en produire d'autres.
- 259 n'a pas de liste de moments.
- Aucune graine ni température fixée : deux essais identiques diffèrent.
- La durée stockée contient la relecture et les retouches à la main ; elle ne juge pas le modèle.
- Les scènes « Banc … » ajoutées aux projets sont écartées ; une scène est rattachée par son rang.
- La trace historique ne garde que la dernière réponse ; le labo les garde toutes.
- Le prompt et la sortie sont ceux du commit noté ; un remaniement de `lib/` peut obliger à adapter le labo.
- Les titres, entrées et textes des projets sont copiés dans `datasets/` et `runs/`. Le dépôt distant étant public,
  ces deux dossiers sont **ignorés par git** : sur une autre machine, il faut les copier ou refaire l'export.

## Étendre

Le labo ne traite aujourd'hui que `scenario-scene`. Pour un autre agent : un filtre d'export, un module de mesures
et ses tableaux ; le rejeu et les variantes sont à généraliser à ce moment-là, pas avant.

## Résultats

- Appels historiques : [reports/duration-259-261-264-historique.md](reports/duration-259-261-264-historique.md).
- Test de réflexion, 2026-11-27 (variante A, scène 264·1, un appel par réglage) :

| Corps envoyé | Réflexion (caractères) | Jetons de sortie | Durée | Plans (secondes) |
|---|---|---|---|---|
| celui de Cadence (`enable_thinking: false`) | 0 | 620 | 17 s | 9 + 6 |
| rien (`--body '{}'`) | 19 929 | 5 766 | 89 s | 8 + 7 |

  Le serveur réfléchit par défaut ; Cadence coupe la réflexion à chaque appel. Le niveau (xhigh) ne se lit pas dans la
  réponse. Une scène et un appel par réglage ne disent rien de la qualité.
- Rejeu complet : pas encore lancé (en attente de l'arbitrage de B et C).
