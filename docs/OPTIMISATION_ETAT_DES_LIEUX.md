# Optimisation des temps de production — état des lieux (2026-10-17)

Chantier de longue haleine. Ce document est la base chiffrée : ce qui est **mesuré**, ce qui est **supposé**, et l'ordre
dans lequel on propose d'agir. Il ne tranche aucune décision d'architecture : toute piste qui en heurte une de
`FRICTIONS.md` est marquée ⚠.

Légende : [M] mesuré (base de données, traces, journal worker) · [L] lu dans le code · [S] supposé, à vérifier.

## Objectifs

| Action | Aujourd'hui | Cible |
|---|---|---|
| Création de projet (2 min de film) | ~14 min d'étapes LLM + ~5 min d'images [M] (projet 219) ; des dizaines de min selon les projets | le plus bas possible |
| Entretien scénariste | 2 appels LLM séquentiels par tour [L] | (quasi) temps réel |
| Itération de plan | 281 à 351 s [M] | 120 s |
| Itération d'asset | 26 à 45 s d'image + file d'attente [M] | 30 s max, 20 s idéal |

Matériel : RTX 5070 Ti 16 Go, 64 Go RAM. LLM et ComfyUI cohabitent (~6 Go pour ComfyUI) ; l'upscale prend toute la carte.

## Constats mesurés

1. **Le LLM est le chemin critique, et il est décodage-bound.** 22 à 36 jetons/s sur tous les skills [M, `agent_traces`].
   Un `plan-h3` écrit ~1 000 jetons en ~39 s pour ~17 000 jetons d'entrée : le préremplissage n'est pas le problème.
   25-35 jetons/s est bas pour un MoE à 4 Md de paramètres actifs : [S] une partie des experts tourne sur le processeur parce
   que ComfyUI occupe 6 Go. **À confirmer en priorité** (voir « Mesures à faire »).
2. **`iteration-plan` : ~90 % de la sortie est de la réflexion.** Sur gemma-26B : ~4 300 jetons de sortie en moyenne, dont
   ~15 000 caractères de `reasoning_content` pour ~1 300 caractères de JSON utile (7 traces du 16/10, 129 à 320 s) [M].
   Les lignes `LLM_CORPS_PLAN_H3` / `LLM_CORPS_ITERATION_PLAN` du `.env` datent du 17/10 02:07, **après** ces traces : leur effet
   n'est pas encore mesuré. À mesurer en premier sur une itération réelle. `scenario-episode` (183 s) et `inventaire-assets`
   (151 s) réfléchissent aussi (12 000 à 13 000 caractères) et n'ont aucune variable [M].
3. **Appels LLM strictement un par un** (serveur à un slot, une seule boucle LLM) [L]. Pendant la création du projet 219 : 10
   `plan-h3` de 28 à 56 s mis bout à bout (~6 min), 8 `prompt-asset` de 7 à 18 s l'un après l'autre [M].
4. **Les images démarrent tard.** Prompts d'assets prêts vers 19:29, premières images créées à 19:36:45 : ~7 min de
   recouvrement perdu [M]. Images : 26 à 38 s (création ~27-31 s, édition 34-45 s) [M].
5. **Temps morts.** File d'attente de 3 min avant certaines éditions d'asset (21:00 → 21:03) [M]. Scrutation du worker toutes
   les 10 s au repos [L] : 3 à 10 s observés entre la fin du LLM et le début de la vidéo [M, journal].
6. **Vidéo d'itération : 78 à 145 s, médiane ~100 s** [M, journal]. Elle seule tient presque dans la cible de 2 min.
7. **Le modèle réellement utilisé est choisi dans l'en-tête de l'app**, pas par le `.env` (`qwen3.6-35b-A3B`). Projet 219 :
   gemma-4-26B-A4B. Qwen distillé : 168 appels sur 7 jours [M]. Un `.env` de production sans les lignes `LLM_CORPS_*`
   ramènerait la réflexion [L].

## Bug corrigé (2026-10-17, non commité)

`worker/index.ts` contenait deux copies de la boucle « installateur + demandes + purge » (deux pilotes en parallèle, alors que
`lib/demandes-db.ts:23` suppose un seul pilote). La copie sans le pas rapide `INTERVALLE_DEMANDES_MS` a été supprimée. Le
worker en cours doit être redémarré.

## Configuration llama-swap (fournie 2026-10-17)

- `gemma4-26b-A4B` : `--n-cpu-moe 30 --n-gpu-layers -1`, ctx 131072, KV q8_0. Si le modèle a ~30 couches, **tous les experts
  sont sur le processeur** [S, nombre de couches à confirmer dans le log de chargement]. Le débit mesuré (22-36 tok/s) colle
  avec un décodage borné par la bande passante RAM (~2 Go d'experts lus par jeton).
- `qwen3.6-35b-A3B` : `--n-cpu-moe 25`, ctx 262144 ; variante `-lowvram` : `--n-cpu-moe 32`, ctx 131072, réflexion coupée.
- Un seul slot (`--parallel 1`) partout.
- Nouvelle variante `gemma4-26b-A4B-nothink` (`--reasoning off`) : changer de modèle dans l'en-tête = rechargement.

## Pistes, par chemin (gain / effort)

### Transverses (profitent aux quatre actions)

| # | Piste | Gain | Effort | Notes |
|---|---|---|---|---|
| T1 | Supprimer la boucle dupliquée | cohérence | faible | voir ci-dessus |
| T2 | Réveil immédiat des boucles worker (LISTEN/NOTIFY, ou 250-500 ms quand une demande/un tour est en cours) | 3-10 s par étape | faible | entretien, itérations, création |
| T3 | Diagnostiquer le débit LLM (répartition carte/RAM, `--n-cpu-moe`, KV, `--parallel`) | potentiellement ×2 à ×4 sur tous les skills | moyen | [S] d'après le débit ; config llama-swap hors dépôt |
| T4 | Vérifier le cache de préfixe (`cache_n`/`prompt_n`) ; stabiliser l'ordre des prompts | secondes par appel | faible | |
| T5 | Couper la réflexion de `scenario-episode` et `inventaire-assets` | 100+ s sur la création | faible | ⚠ A/B qualité avant ; `.env` seul |

### Création de projet

- Pipeline plutôt que barrières entre étapes (≈ 2 min cumulées [S]) ; lancer les images dès que le prompt d'un asset est écrit, y
  compris pour les assets créés par les fiches ; regrouper Krea puis Qwen Edit pour limiter les rechargements.
- Plusieurs slots LLM (`--parallel 2-3`) : les `prompt-asset` sont indépendants entre eux. ⚠ Les `plan-h3` d'un épisode dépendent
  du dernier shot du plan précédent (FRICTIONS 2026-10-14) : à ne paralléliser qu'après une décision explicite (ex. écriture
  parallèle puis passe de raccord).
- Réduire les entrées de `plan-h3` (~14 000 jetons de système : exemples, registre complet). ⚠ Le banc a montré que raccourcir fait
  écrire plus abstrait (FRICTIONS 2026-10-12).

### Entretien scénariste

- Un tour = `notes-entretien` (invisible) puis `conversation-agent` [L]. Gain maximal : sortir les notes du chemin critique.
  ⚠ Décalage d'un tour de la fiche, risque que l'agent redemande ce qui vient d'être dit.
- Le schéma de `conversation-agent` met `reflexion` avant `reponse` : 250-350 jetons de brouillon avant le premier mot visible.
  ⚠ C'est le garde-fou contre les tours mécaniques ; l'entrée FRICTIONS du 2026-10-10 citée par la mémoire n'a pas été retrouvée
  par l'audit, à rechercher avant d'y toucher.
- Streaming : token → base → sondage 1,2 s → écran. Un canal direct (SSE) ou un sondage plus court améliore la granularité.
- Modèle : Gemma E2B pour `notes-entretien` ? À tester (taux de citations valides).

### Itération de plan

Décomposition [M] : `iteration-plan` 131-191 s + `plan-h3` 47-51 s + rendu 100-145 s.
- Réflexion d'`iteration-plan` coupée (déjà dans `.env`, à mesurer) : visé 130-190 s → quelques dizaines de secondes.
- Pas de renvoi sur le contrôle sémantique, ou contrôles non bloquants (un renvoi double l'appel : 320 s observés).
- Chargement du modèle vidéo : préchauffage pendant la phase LLM (job minimal), `uploadRef` des références inchangées évités,
  aperçu `taeh3` désactivé pour les rendus de demande. ⚠ Le préchauffage ne doit pas prendre le verrou exclusif.
- Fusion `iteration-plan` + `plan-h3` en un appel : ~50 s, mais refonte de deux skills.

### Itération d'asset

- Réveil immédiat de la voie ComfyUI quand l'essai passe `en_attente` (0-10 s).
- `IMG_Simple_Edit.json` : le négatif est encodé avec l'image alors que cfg = 1 (inutile) → `ConditioningZeroOut` comme `IMG_01`.
- Préchauffage de Qwen Edit pendant la traduction LLM ; vérifier que `easy cleanGpuUsed` (IMG_01) ne force pas un rechargement.
- Modèle ~20 Go + encodeur ~8 Go pour 6 Go de VRAM : chargement partiel à chaque passe [S]. Piste : variante plus petite (GGUF).
  ⚠ Baisser la résolution contredit « la sortie suit l'image 1 ».

## Mesures à faire (par ordre)

1. **Configuration llama-swap / llama-server** (ligne de commande, `--n-gpu-layers`, `--n-cpu-moe`, `--parallel`, contexte,
   quantification du KV) : hors dépôt, à fournir. `/running` est vide quand on le lit, `/props` et `/slots` ne répondent pas
   à travers llama-swap sans modèle chargé.
2. **Débit LLM seul** : jetons/s avec ComfyUI inactif, puis actif (journal VRAM) ; est-ce que le modèle déborde sur le processeur ?
3. **Une itération de plan complète** après la modification du `.env` : durées `agent_traces` + `jobs`.
4. **Un `scenario-episode` avec et sans réflexion** (A/B qualité sur le même brief).
5. **`cache_n`/`prompt_n`** sur deux `plan-h3` consécutifs.
6. **`/history` ComfyUI par nœud** pour une retouche Qwen Edit à chaud et à froid.

## Décisions de FRICTIONS à ne pas contredire en silence

Continuité plan à plan (2026-10-14) ; sortie d'édition = image 1 ; pas de versionnage d'assets ; 1er pass déterministe ; planche
de vignettes jamais automatique (2026-10-12) ; skill `plan-h3` validé avec réflexion (2026-10-12) ; upscale uniquement à la
validation.
