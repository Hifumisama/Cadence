# Contexte complet de la conversation d'optimisation (2026-10-17)

À lire EN PREMIER sur l'autre machine. Il rassemble tout ce qui a été dit, décidé et relevé, et indique comment poursuivre.
Les autres documents vont plus loin sur un point précis :

- `docs/PASSATION_OPTIMISATION.md` : liste d'étapes concrètes et pièges.
- `docs/OPTIMISATION_ETAT_DES_LIEUX.md` : constats mesurés et pistes par chemin (gain / effort).
- `llama-swap/config.yaml` : config llama-swap proposée (superset de celle de l'utilisateur).
- `scripts/banc-llm.ts` (`npm run llm:banc`) et `scripts/banc/traces-exemple.jsonl` : banc de rejeu et ses données.

## 1. L'utilisateur et la façon de travailler

- Francophone, ton informel et chaleureux (« ^^' », « xD »). Répondre en français, simplement, sans jargon inutile.
- Il connaît son matériel et sa machine, peut exécuter lui-même les commandes sur la machine distante, et préfère être guidé pour
  les tests plutôt que de voir lancer des vérifications coûteuses (voir la mémoire « Tests fonctionnels avec l'utilisateur »).
- Il a autorisé : lancer l'app localement « tranquillement », lire la base, le `.env` et les workflows, déléguer des audits en
  lecture seule. Il veut un chantier de **longue haleine**, mené par étapes, en commençant par un état des lieux.
- Il a validé les corrections au fur et à mesure, et demandé de **commiter** (ce qui est fait) et de laisser des notes
  transmissibles. Ne rien pousser sans qu'il le demande.
- Règles du dépôt : `CLAUDE.md` et `docs/FRICTIONS.md` priment ; ne pas contredire une décision actée en silence.

## 2. Objectifs de départ (ses mots, résumés)

| Action | Aujourd'hui | Cible de l'utilisateur |
|---|---|---|
| Création de projet | « des dizaines de minutes » pour 2 min de film | « un gros gain », le plus complexe |
| Entretien avec le scénariste | encore assez long | temps réel ou quasi temps réel de la discussion |
| Itération plan par plan (correction + analyse + génération vidéo) | ~6 min en moyenne | 2 min |
| Itération d'asset (génération d'image) | 26 à 45 s + file d'attente | 30 s maximum, 20 s idéalement |

## 3. Matériel et topologie

- **Machine distante** (la sienne, accessible à l'utilisateur) : llama-swap ET ComfyUI sur la même carte, RTX 5070 Ti 16 Go VRAM,
  64 Go DDR5. Ils se partagent tout. ComfyUI ~6 Go en parallèle du LLM, donc **~10 Go pour le LLM, KV et tampons compris**.
  L'upscale prend toute la carte (uniquement à la validation, il fige le projet).
- **Machine de dev** : l'app (web, worker, Postgres Docker `cadence-postgres-1`, db/user `cadence`) et Claude Code. Elle n'a pas
  le GPU : `nvidia-smi`, `llama-bench` et les logs de llama-server se lancent sur la machine distante.
- **Base de données** : la base « actuelle » ne migre pas avec le dépôt. Les projets de test et les `agent_traces` de la machine de
  dev n'existent pas ailleurs ; d'où l'export `scripts/banc/traces-exemple.jsonl`.
- Vidéo déjà à 0,2 MP en turbo : peu de gain attendu de ce côté. Streaming et réponses partielles existent déjà dans l'UI.
- L'utilisateur veut tout faire tourner sur son propre matériel et accepte un modèle plus petit si la qualité ne baisse pas trop.

## 4. Mesures relevées (base de dev, jusqu'au 2026-10-17)

### Débit et chemin critique
- Le LLM est le chemin critique et il est **borné par le décodage** : 22 à 36 tok/s sur tous les skills. Sur 3 jours : prompt-asset
  21,9, plan-h3 25,2, notes-entretien 26,7, conversation-agent 32,1, iteration-plan 27,6 tok/s en gemma-4-26B-A4B ; Qwen distillé
  7,7 à 42 selon le skill ; gemma-4-E2B (CPU seul) ~60 tok/s sur prompt-asset.
- Config actuelle de gemma4-26b-A4B : `--n-cpu-moe 30`. L'utilisateur a confirmé que Gemma 4 26B a **30 couches** : tous les experts
  sont donc en RAM. Hypothèse principale : le décodage est limité par la bande passante DDR5 (~2 Go d'experts lus par jeton).
  À confirmer en chargeant `gemma4-26b-A4B-v2` et en lisant le log de llama-server.
- `--ctx-size 131072` (et 262144 pour le Qwen) très surdimensionné.

### Tailles de contexte réelles (table `agent_traces`, jetons d'entrée max / moyenne ; sortie max / moyenne)
| Skill | Appels | Entrée max | Entrée moy. | Sortie max | Sortie moy. |
|---|---|---|---|---|---|
| plan-h3 | 180 | 49 533 | 19 155 | 32 768 | 1 488 |
| realisateur-analyse | 38 | 28 045 | 16 775 | 2 195 | 520 |
| conversation-agent | 126 | 27 110 | 4 161 | 32 768 | 703 |
| iteration-plan | 72 | 25 700 | 9 651 | 10 293 | 1 929 |
| scenario-episode | 23 | 11 540 | 4 995 | 6 190 | 3 960 |
| prompt-asset | 152 | 8 700 | 6 000 | 3 241 | 508 |
| notes-entretien | 68 | 7 623 | 5 314 | 1 228 | 413 |
| realisateur-reponse | 38 | 6 195 | 4 267 | 158 | 108 |
| brief-projet | 18 | 6 067 | 4 246 | 4 408 | 3 304 |
| inventaire-assets | 12 | 4 634 | 3 731 | 5 438 | 2 849 |

- Les sorties à 32 768 jetons sont des **boucles de répétition** (conversation-agent a un plafond à 3 000 jetons dans
  `lib/llm/config.ts`, pas plan-h3).
- `plan-h3` : ~51 000 caractères de prompt système (~13 000 jetons fixes) + 12 000 à 19 000 caractères d'entrée par plan. Le p95
  est ~35 000 jetons d'entrée.
- **Film d'une heure** : les skills par plan (`plan-h3`, `iteration-plan`, `prompt-asset`, `conversation-agent`) ne grossissent presque
  pas avec la durée (seul le registre d'assets grandit). Les skills globaux (`scenario-episode`, `inventaire-assets`,
  `realisateur-analyse`) grandissent : la limite est la **sortie** (~4 000 jetons pour 2 min de film), donc un découpage par séquence
  sera nécessaire quelle que soit la fenêtre de contexte. Contexte proposé : 49 152 jetons dans les entrées `-v2` et `e4b`.

### Réflexion (thinking)
- `iteration-plan` sur gemma-26B : ~4 300 jetons de sortie en moyenne dont ~15 000 caractères de `reasoning_content` pour ~1 300 de
  JSON utile (7 traces du 16/10, 129 à 320 s). `scenario-episode` (183 s) et `inventaire-assets` (151 s) réfléchissent aussi
  (12 000 à 13 000 caractères) et n'ont aucune variable `LLM_CORPS_*`.
- `.env` : `LLM_CORPS_PLAN_H3`, `LLM_CORPS_REALISATEUR_ANALYSE`, `LLM_CORPS_ITERATION_PLAN` avec `enable_thinking` à false, modifiés le
  2026-10-17 à 02:07, **après** ces traces : effet non mesuré.
- L'utilisateur indique que les `chat_template_kwargs` sont **dépréciés** ; il a donc créé la variante `gemma4-26b-A4B-nothink`
  (`--reasoning off`). Changer de variante = rechargement du modèle côté llama-swap.
- Décision de FRICTIONS à respecter : `plan-h3` est validé **avec** réflexion (2026-10-12).

### Autres
- Appels LLM strictement un par un (`--parallel 1`, une seule boucle LLM) : 10 `plan-h3` de 28 à 56 s mis bout à bout (~6 min) et
  8 `prompt-asset` de 7 à 18 s l'un après l'autre sur le projet 219.
- Les **images démarrent tard** : prompts d'assets prêts vers 19:29, premières images à 19:36:45 (~7 min perdues). Images : 26 à 38 s
  (création ~27-31 s, édition 34-45 s). File d'attente de 3 min avant certaines éditions d'asset (21:00 → 21:03).
- Scrutation du worker toutes les 10 s au repos (`WORKER_INTERVAL_MS=10000`) : 3 à 10 s de temps mort entre la fin du LLM et le début
  de la vidéo. Vidéo d'itération : 78 à 145 s, médiane ~100 s.
- Décomposition d'une itération de plan : `iteration-plan` 131-191 s + `plan-h3` 47-51 s + rendu 100-145 s = 281 à 351 s.
- Projet de référence : « La gardienne des étoiles » (projet 219, créé avec gemma-4-26B-A4B). Création ≈ 14 min d'étapes LLM + ~5 min
  d'images.
- Le modèle réellement utilisé est choisi dans l'en-tête de l'app et prime sur `LLM_LOCAL_MODELE` du `.env` (`qwen3.6-35b-A3B`).

## 5. Ce qui a été fait

Commits locaux sur `main` (non poussés) :

1. `3cfc2ed` : état des lieux, `llama-swap/config.yaml`, note de passation, et **correctif de `worker/index.ts`** (deux copies de la
   boucle « installateur + demandes + purge » tournaient en parallèle ; `lib/demandes-db.ts:23` suppose un seul pilote ; la copie sans
   le pas rapide `INTERVALLE_DEMANDES_MS` a été supprimée). **Redémarrer le worker.**
2. `7a956ae` : export de 49 traces d'exemple (14 skills) dans `scripts/banc/traces-exemple.jsonl`.
3. `71a8888` : banc de rejeu `npm run llm:banc` (`scripts/banc-llm.ts`).

Vérifié : `npx tsc --noEmit -p .` passe ; le script du banc s'arrête proprement sans arguments et sans trace correspondante. **Non
exécuté contre un vrai serveur LLM.**

## 6. Décisions et réponses de l'utilisateur à respecter

- `conversation-agent` : tolère une petite dérive de ton ; il doit rester **concentré et créatif** (c'est le plus important).
  Juger la créativité et la concentration, pas le ton exact.
- Skills à tester en petit modèle : plausibles `prompt-asset`, `notes-entretien`, `realisateur-analyse`, traduction ; à tester
  sérieusement `plan-h3` (JSON strict, français, 13 k jetons de système) et `scenario-episode`.
- Gemma 4 E4B existe. `--parallel` : d'accord, mais seulement une fois que l'on sait quels modèles tiennent la qualité.
- Il a levé son ordre de priorités du 2026-10-15 (utilisabilité → simplification → petits modèles) : l'optimisation est maintenant
  explicitement demandée.
- Constantes de FRICTIONS à ne pas contredire en silence : continuité plan à plan (2026-10-14, le dernier shot du plan précédent
  nourrit `plan-h3`) ; sortie d'édition = image 1 ; pas de versionnage d'assets ; 1er pass déterministe ; planche de vignettes jamais
  automatique (2026-10-12) ; `plan-h3` validé avec réflexion (2026-10-12) ; upscale uniquement à la validation.
- Pistes qui heurtent une de ces décisions (⚠ dans l'état des lieux) : paralléliser les `plan-h3` d'un épisode ; raccourcir leur
  prompt (le banc a montré que ça fait écrire plus abstrait) ; baisser la résolution d'édition ; sortir `notes-entretien` du chemin
  critique de l'entretien.

## 7. Comment poursuivre (dans l'ordre)

1. **Déployer** `llama-swap/config.yaml` sur la machine distante. Corriger le chemin du GGUF Gemma 4 E4B (supposé :
   `D:\localAI\models\gemma-4-E4B\gemma-4-E4B-it-Q4_K_M.gguf`).
2. **Caler `--n-cpu-moe`** de `gemma4-26b-A4B-v2` (départ à 20) : charger le modèle pendant une génération d'image, relever
   `nvidia-smi`, essayer 24, 20, 16 et garder ≥ 1,5 Go de marge quand Qwen Edit charge. Lire dans le log de llama-server le nombre de
   couches offloadées (confirmer qu'il y en a 30). `llama-bench -ngl 99 -fa 1 -ctk q8_0 -ctv q8_0 -p 4096 -n 128` avec plusieurs
   `--n-cpu-moe` (syntaxe à vérifier avec `--help`).
3. **Lancer le banc** : `npm run llm:banc -- --modeles gemma4-26b-A4B,gemma4-26b-A4B-v2,gemma4-e4b --par-skill 2`. Lire
   `essais/banc/<horodatage>/rapport.md` et les pages par trace. Comparer débit, durée, validité JSON et qualité d'écriture. Première
   chose à regarder : le gain de débit de `-v2` face à la config actuelle.
4. **Choisir un modèle par famille de skills** selon le banc, avec l'accord de l'utilisateur (voir §6). Si la base de l'autre machine
   est vide, le banc fonctionne quand même grâce au JSONL ; pour plus de traces `conversation-agent` / `notes-entretien`, ré-exporter
   depuis la base de dev (requête : voir l'historique git du commit `7a956ae`, ou refaire un `row_to_json` sur `agent_traces`).
5. **Mesurer une itération de plan complète** avec le `.env` actuel, puis avec un modèle nothink pour `iteration-plan` seulement
   (durées dans `agent_traces` + `jobs`).
6. **A/B qualité** sur `scenario-episode` et `inventaire-assets` sans réflexion (aujourd'hui sans variable).
7. **Gains côté code** (indépendants du modèle) : réveil immédiat des boucles worker (LISTEN/NOTIFY ou pas de 250-500 ms quand une
   demande est en cours) ; lancer les images dès qu'un prompt d'asset est prêt ; vérifier `cache_n` / `prompt_n` entre deux `plan-h3`
   consécutifs ; `IMG_Simple_Edit.json` (le négatif est encodé avec l'image alors que cfg = 1, utiliser `ConditioningZeroOut` comme
   `IMG_01`) ; préchauffer Qwen Edit et le modèle vidéo pendant la phase LLM ; ne pas faire de renvoi sur le contrôle sémantique
   d'`iteration-plan` (un renvoi double l'appel).
8. **`--parallel 2-3`** pour les `prompt-asset` (et la création de projet), seulement sur les modèles retenus et avec un worker qui
   traite plusieurs tâches LLM à la fois (aujourd'hui une seule boucle LLM).
9. **Film d'une heure** : prévoir le découpage par séquence de `scenario-episode` et `inventaire-assets`.
10. Mettre à jour `docs/OPTIMISATION_ETAT_DES_LIEUX.md` avec chaque mesure ; ne rien pousser ni commiter sans demande.

## 8. Pièges

- `--ctx-size` de llama-server est le total réparti entre les slots (`--parallel N` → chaque slot reçoit ctx/N).
- `docker exec cadence-postgres-1 psql -U cadence -d cadence` donne accès à la base de dev (Postgres seul en Docker, web et worker sur
  l'hôte).
- Next.js non standard : lire `node_modules/next/dist/docs/` avant de toucher au code web.
- Ne pas écrire de gros heredocs Bash ici (échecs intermittents) : utiliser Write/Edit et vérifier l'état des fichiers.
- Le prompt système n'est pas dans les traces (seulement son empreinte) : le banc le recharge depuis `agents/skills/`. Un écart de taille
  est signalé au lancement.
- Les recherches web n'ont donné aucune mesure fiable de `--n-cpu-moe` sur Gemma 4 26B ni de VRAM exacte pour E4B ; seuls repères : un
  post Reddit sur Qwen3.6-35B-A3B (78,7 tok/s avec `--n-cpu-moe 20` contre 51,2 avec `--cpu-moe`) et un guide Hugging Face sur
  l'offload MoE (<https://huggingface.co/blog/Doctor-Shotgun/llamacpp-moe-offload-guide>). Toute valeur est à mesurer sur place.
