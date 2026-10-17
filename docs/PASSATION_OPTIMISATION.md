# Passation — chantier d'optimisation des temps (2026-10-17)

Note écrite pour être lue par Claude sur **une autre machine** (la machine distante qui héberge llama-swap et ComfyUI).
Elle est autonome : la base de données de test de l'autre machine n'existe pas ici, donc les mesures utiles sont recopiées.
Détail et pistes : `docs/OPTIMISATION_ETAT_DES_LIEUX.md`. Décisions d'architecture : `docs/FRICTIONS.md` (ne pas les contredire
en silence).

## Contexte et objectifs

L'utilisateur (francophone, ton informel) veut accélérer quatre actions : création de projet (des dizaines de minutes pour 2 min
de film), entretien scénariste (viser le temps réel), itération de plan (~6 min → 2 min), itération d'asset (→ 30 s, idéalement
20 s). Il a autorisé : lancer l'app localement, lire la base, le `.env` et les workflows, déléguer des audits en lecture seule.

## Matériel

Une seule machine **distante** (pas celle de dev) héberge llama-swap ET ComfyUI, sur la même carte : RTX 5070 Ti 16 Go, 64 Go
DDR5. ComfyUI occupe ~6 Go en parallèle du LLM, donc **~10 Go pour le LLM, KV et tampons compris**. L'upscale prend toute la carte
(uniquement à la validation, il fige le projet). Vidéo déjà à 0,2 MP en turbo.

## Ce qui est fait (commité)

- `worker/index.ts` : boucle « installateur + demandes + purge » dupliquée supprimée (deux pilotes en parallèle). **Redémarrer le
  worker** pour que ça compte.
- `docs/OPTIMISATION_ETAT_DES_LIEUX.md` : constats mesurés, pistes par chemin, mesures à faire.
- `llama-swap/config.yaml` : superset de la config de l'utilisateur. Entrées existantes recopiées à l'identique ; nouvelles :
  `gemma4-26b-A4B-v2` / `-v2-nothink` (`--n-cpu-moe 20`, ctx 49152), `gemma4-e4b` / `-nothink` (tout en VRAM, **chemin du GGUF
  supposé**, à adapter). Rien de tout ça n'a été testé.

## Constats clés (mesurés sur la base de dev)

- **Décodage borné par la RAM** : 22-32 tok/s sur gemma-4-26B-A4B (E2B CPU seul : ~60 tok/s). Gemma 4 26B a **30 couches**
  (confirmé par l'utilisateur) et la config actuelle est `--n-cpu-moe 30` : tous les experts sont en RAM. Hypothèse principale :
  remonter des experts sur la carte (n-cpu-moe plus bas) et réduire le contexte (131072 → 49152) accélère nettement.
- **Contexte réel** (table `agent_traces`, tokens d'entrée max/moyen) : plan-h3 49 533 / 19 155 (système ~13 000 jetons fixes, le
  max est une boucle folle de 32 768 jetons de sortie), realisateur-analyse 28 045 / 16 775, conversation-agent 27 110 / 4 161,
  iteration-plan 25 700 / 9 651, scenario-episode 11 540 / 4 995, prompt-asset 8 700 / 6 000, notes-entretien 7 623 / 5 314.
  Les skills par plan ne grossissent presque pas avec la durée du film (seul le registre d'assets grandit). Pour un film d'une
  heure, ce sont les skills globaux (`scenario-episode`, `inventaire-assets`, `realisateur-analyse`) qui poussent : la limite
  vient de la **sortie** (~4 000 jetons pour 2 min), donc découpage par séquence nécessaire quelle que soit la fenêtre.
- **`iteration-plan` : ~90 % de la sortie est de la réflexion** (~4 300 jetons de sortie, 129 à 320 s). Les lignes `LLM_CORPS_*`
  du `.env` (enable_thinking false) datent du 17/10 02:07, effet **non mesuré**. L'utilisateur confirme que les `chat_template_kwargs`
  sont dépréciés : utiliser les variantes `--reasoning off` (`*-nothink`) de llama-swap, pas les kwargs. Penser à ce que
  `plan-h3` doit rester **avec** réflexion (FRICTIONS 2026-10-12) : un modèle `-nothink` global n'est donc pas acceptable tel quel.
- **Appels LLM un par un** (`--parallel 1`), images qui démarrent ~7 min trop tard dans la création, scrutation du worker toutes
  les 10 s, vidéo d'itération ~100 s (78-145 s).

## Réponses de l'utilisateur (à respecter)

- `conversation-agent` : si le ton dévie un peu, ce n'est pas grave ; il doit rester **concentré et créatif**. Juger la créativité
  et la concentration, pas le ton exact.
- Gemma 4 E4B existe. Skills plausibles en petit modèle : `prompt-asset`, `notes-entretien`, `realisateur-analyse`, traduction.
  À tester sérieusement : `plan-h3` (JSON strict, français, 13 k jetons de système) et `scenario-episode`.
- `--parallel` : d'accord, mais seulement une fois qu'on sait quels modèles tiennent la qualité.
- Ordre de l'utilisateur du 2026-10-15 (utilisabilité → simplification → petits modèles) est **levé** : il demande maintenant
  explicitement l'optimisation.

## Suite à faire (par ordre)

1. **Sur la machine distante** : charger `gemma4-26b-A4B-v2` pendant une génération d'image, relever la VRAM (`nvidia-smi`), caler
   `--n-cpu-moe` (essayer 24, 20, 16 ; garder ≥ 1,5 Go de marge quand Qwen Edit charge). `llama-bench -ngl 99 -fa 1 -ctk q8_0
   -ctv q8_0 -p 4096 -n 128` avec plusieurs `--n-cpu-moe` (vérifier la syntaxe exacte avec `--help`).
2. Récupérer le GGUF **Gemma 4 E4B** (Q4_K_M), corriger le chemin dans `llama-swap/config.yaml`, mesurer son débit en VRAM.
3. **Banc de rejeu** (`scripts/`, pas encore écrit) : rejouer de vrais appels depuis `agent_traces` (messages, schéma) contre chaque
   modèle candidat via llama-swap ; mesurer tok/s, durée, JSON valide ; sauvegarder les sorties pour comparaison côte à côte. Sans
   toucher à l'app ni à la base. **Si la base de l'autre machine est vide**, exporter quelques traces depuis l'ancienne base
   (`\copy` de `agent_traces` : `skill`, `messages`, `json`) ou régénérer un projet de test.
4. Mesurer une itération de plan complète avec le `.env` actuel (durées `agent_traces` + `jobs`), puis avec un modèle nothink pour
   `iteration-plan` seulement.
5. A/B qualité sur `scenario-episode` et `inventaire-assets` sans réflexion (aujourd'hui sans variable `LLM_CORPS_*`).
6. Réveil immédiat des boucles worker (LISTEN/NOTIFY ou pas de 250-500 ms quand une demande est en cours), lancer les images plus
   tôt dans la création, vérifier `cache_n`/`prompt_n`, `IMG_Simple_Edit.json` (négatif encodé inutilement à cfg = 1).

## Pièges

- La base Postgres « actuelle » ne migre pas avec le dépôt : les projets de test et les `agent_traces` d'ici n'existeront pas
  là-bas, sauf export. Ne pas supposer qu'ils y sont.
- `--ctx-size` de llama-server est le total réparti entre les slots (avec `--parallel N`, chaque slot reçoit ctx/N).
- Le modèle réellement utilisé est choisi dans l'en-tête de l'app et prime sur `LLM_LOCAL_MODELE` du `.env`.
- Ne pas écrire de gros heredocs Bash ici (échecs intermittents) : utiliser Write/Edit.
- Next.js non standard : lire `node_modules/next/dist/docs/` avant de toucher au code web.
