# Image GPU de Cadence (démo sur RunPod)

Une image Docker qui fait tourner **ComfyUI** et **llama.cpp derrière llama-swap** sur une carte NVIDIA
Blackwell, et se rend joignable par **Tailscale**. Cadence (web, worker, base) reste sur ta machine ; il
suffit de lui donner deux adresses (voir « Brancher Cadence »).

Elle n'est pas faite pour tourner seule : les workflows, les modèles et les données viennent du dépôt et du volume.

## Ce qu'il y a dedans, et ce qui n'y est pas

| Dans l'image | Sur le volume (`/workspace`) |
|---|---|
| CUDA 12.8, PyTorch `cu128`, ComfyUI `v0.43.2` | `models/` : le dossier `models` de ComfyUI (copie du PC distant) |
| llama.cpp `b12068` compilé pour Blackwell (`sm_120`), llama-swap `v269` | `llm/` : les modèles de langage (copie de `D:\localAI\models`) |
| Les nodes custom de `custom-nodes.txt`, épinglés sur un commit | `comfyui/input`, `output`, `user`, `temp` : y compris les latents des plans en chaîne (`output/h3_latents/`) |
| Tailscale (mode userspace), supervisord | `llama-swap.yaml` (facultatif, voir plus bas) |

Les modèles ne sont pas dans l'image : elle reste légère et un changement de modèle ne la reconstruit pas.

## Construire

```bash
docker build -t cadence-gpu deploy/gpu
```

Compter 15 à 30 minutes la première fois (llama.cpp est compilé). Réglages (`--build-arg NOM=valeur`) :

| Argument | Défaut | Quand le changer |
|---|---|---|
| `CUDA_ARCHS` | `120` (Blackwell) | `120;89` pour qu'elle serve aussi sur une Ada (4090, RTX 6000 Ada) |
| `TORCH_CHANNEL` | `cu128` | `cu130` si l'hôte a un pilote assez récent |
| `COMFYUI_REF` | `v0.43.2` | une autre version de ComfyUI (tag ou branche) |
| `LLAMA_CPP_REF`, `LLAMA_SWAP_VERSION` | `b12068`, `269` | idem |

Pour publier l'image (RunPod la télécharge depuis un registre) :
```bash
docker tag cadence-gpu ghcr.io/<ton-compte>/cadence-gpu:2026-11-03
docker push ghcr.io/<ton-compte>/cadence-gpu:2026-11-03
```
Un registre privé demande d'ajouter les identifiants dans « Container Registry Auth » de RunPod.

## Préparer le volume (une seule fois)

1. **Créer un network volume** dans un datacenter où la carte voulue est en stock (RunPod → Storage). Le
   volume est lié à son datacenter : choisir celui de la carte. Alternative : un **volume global** de RunPod
   (facturé un peu plus cher, utilisable depuis plusieurs régions). Je n'ai pas pu vérifier où il se monte dans
   le Pod ni s'il offre l'API S3 : s'il n'est pas sur `/workspace`, régler la variable `CADENCE_VOLUME` sur son point
   de montage, le reste de l'image suit. Taille : la somme de `ComfyUI\models` et
   de `D:\localAI\models` sur le PC distant, plus une marge de 20 % pour les rendus.
2. **Le remplir sans démarrer de Pod** avec l'API S3 de RunPod (si le datacenter la propose : voir
   `docs.runpod.io/storage/s3-api`), par exemple avec `rclone` ou l'AWS CLI :
   - `ComfyUI/models/` → `models/`
   - `D:\localAI\models/` → `llm/` (mêmes sous-dossiers : `llm/mmproj/…`, `llm/Qwen3.6-…-GGUF/…`)
   Sinon, démarrer un petit Pod avec un modèle RunPod standard (accès SSH) sur ce volume et copier depuis là.
3. Facultatif : déposer le `config.yaml` de llama-swap du PC distant en **`/workspace/llama-swap.yaml`**. S'il
   existe, il remplace celui du profil (adapter les chemins `D:\…` en `/workspace/llm/…`).

## Créer le modèle de Pod (RunPod → Templates)

| Champ | Valeur |
|---|---|
| Image | `ghcr.io/<ton-compte>/cadence-gpu:<tag>` |
| Container disk | 30 Go |
| Volume | le network volume, monté sur `/workspace` |
| Ports exposés | **aucun** : l'accès passe par Tailscale, ni ComfyUI ni llama-swap n'ont de mot de passe |
| Filtre de pilote | CUDA 12.8 ou plus |
| Variable `CADENCE_PROFIL` | `16go` (RTX 5070 Ti, 5080), `32go` (RTX 5090) ou `96go` (RTX PRO 6000) |
| Variable `TS_AUTHKEY` | une clé Tailscale **réutilisable et éphémère** (console Tailscale → Settings → Keys) |
| Variable `TS_HOSTNAME` | `cadence-gpu` (le nom sous lequel le Pod apparaît) |

Facultatives : `COMFY_EXTRA_ARGS` (options ComfyUI en plus), `COMFY_VRAM_HEADROOM` (remplace la valeur du profil),
`CADENCE_LLM_DIR` (autre dossier de modèles de langage).

## Brancher Cadence

Dans le `.env` de la machine qui porte web et worker :

```
COMFYUI_MODE=http
COMFYUI_URL=http://cadence-gpu:8188
LLM_FOURNISSEUR=local
LLM_LOCAL_URL=http://cadence-gpu:8080
LLM_LOCAL_MODELE=qwen3.6-35b-A3B
```

(`http://` convient : Tailscale chiffre déjà le lien.) Le modèle par défaut de `.env.example`, `gemma4-26b-A4B`,
n'est pas dans les profils fournis : mets-le dans `llama-swap.yaml` (volume) si tu en as besoin, ou change
`LLM_LOCAL_MODELE` comme ci-dessus.

Puis contrôler, avant la séance :

```bash
npm run gpu:verifier
```

Le script confronte chaque workflow de `workflows/` à ce que ComfyUI sait faire (nodes installés, fichiers de
modèles présents) et vérifie que llama-swap déclare les modèles que le `.env` demande. Il ne lance aucun rendu.

## Profils

`profils/<nom>.env` règle ComfyUI, `profils/<nom>.llama-swap.yaml` règle le LLM. Pour un autre format de carte,
copier les deux fichiers et passer le nom dans `CADENCE_PROFIL`.

| Profil | LLM | `--vram-headroom` de ComfyUI |
|---|---|---|
| `16go` | experts MoE en RAM (`--n-cpu-moe 32`), projecteur d'images en RAM : celui du PC distant | 12 (valeur du PC distant) |
| `32go` | moitié des experts en RAM (`--n-cpu-moe 16`), projecteur d'images sur le GPU | 18 (**estimation**, à mesurer avec `nvidia-smi`) |
| `96go` | tout sur le GPU | 32 (**estimation**, à mesurer avec `nvidia-smi`) |

## Ce qui n'est pas vérifié

- **Les nodes custom** : la liste (`custom-nodes.txt`) a été confirmée dépôt par dépôt, mais pas relevée sur le PC
  distant. `npm run gpu:verifier` dit lesquels manqueraient encore ; ajouter une ligne et reconstruire.
- **`RTXVideoSuperResolution`** (étape finition) dépend du SDK vidéo NVIDIA RTX : le pack est le bon, son
  fonctionnement sous Linux est à confirmer.
- **Tailscale en mode userspace** : l'accès entrant vers un Pod doit marcher sans interface réseau ; à confirmer au premier démarrage.
- **Les options de ComfyUI** (`--vram-headroom`, `--fast-disk`…) sont celles du PC distant ; l'image refuse de démarrer ComfyUI si une option n'existe pas dans la version épinglée (voir les journaux du Pod).
- **L'exclusivité GPU** du worker garde son comportement actuel (`lib/gpu.ts`) : sur 96 Go elle décharge encore plus que nécessaire. Un réglage par profil serait un changement de code à part.

## Dépannage

- Le journal de tout (ComfyUI, llama-swap, Tailscale) est dans la console du Pod.
- `Profil inconnu` : `CADENCE_PROFIL` ne correspond à aucun `profils/*.env`.
- llama-swap répond mais le premier appel est très long : il charge ~21 Go depuis le volume réseau (`healthCheckTimeout` : 10 minutes).
- Pod démarré mais introuvable : voir la ligne « Tailscale connecté » dans les journaux ; sinon la clé est invalide ou n'est pas réutilisable.
