# Workflows ComfyUI

Graphes ComfyUI (format API, exportables via "Save (API Format)") consommés
directement par le backend de Cadence — pas de la documentation, une
dépendance d'exécution.

- `video-generation/` — génération H3, 1er pass + upscale (F04)
- `image-refs/` — MiniMax H3 Image : génération (masters) et édition (dérivés) (F01)

## Avant de committer un workflow

- Vérifier les chemins de checkpoints/LoRA en dur — les remplacer par une
  variable d'environnement ou une note dans ce README si ça ne peut pas
  être évité pour l'instant.
- Un workflow qui change de forme (nouveaux nodes, nouveaux paramètres
  exposés) doit rester synchro avec le code qui le soumet à l'API — les
  deux vivent dans le même commit.

## Contrat des workflows d'images (`image-refs/`)

Ce que le backend devra injecter dans chaque graphe (format API). Les valeurs
présentes dans les fichiers (prompts d'exemple, seeds) sont des **valeurs de
test**, toujours remplacées à la soumission.

### `IMG_01_TextToImage.json` — génération (MiniMax H3 Image)

| Donnée | Nœud | Champ | Note |
|---|---|---|---|
| Prompt de l'asset | `41` (PrimitiveStringMultiline) | `value` | le sujet seulement, sans style |
| Clause de style | `42` (PrimitiveStringMultiline) | `value` | `projects.clauseStyle`, concaténée après le sujet dans le graphe (`43`, séparateur espace) |
| Format | `14` (ResolutionSelector) | `aspect_ratio` | 16:9 par défaut pour un décor et une fiche personnage ; 1:1 pour un effet ou un détail ; 2:3 pour une affiche. `megapixels` reste à **16** dans le fichier : en dessous, l'image n'est pas propre (essais de l'utilisateur, 2026-11-23) |
| Taille enregistrée | `44` (ResizeImageMaskNode, « scale total pixels », `area`) | `resize_type.megapixels` | `asset_generations.megapixels` (1 à 1,3 selon le type) : le dessin à 16 MP est réduit avant `SaveImage` |
| Seed | `23:7` (KSampler) | `seed` | |
| Sortie | `9` (SaveImage) | `filename_prefix` | |

6 étapes, CFG 1, `euler` / `simple`, négatif remis à zéro (`ConditioningZeroOut`). Environ une minute par image sur la 5070 Ti.
Le gabarit officiel a un « prompt enhancer » (LLM qui réécrit le prompt) : retiré, lent et inutile, le prompt vient de l'agent ;
ses consignes ont nourri `agents/skills/prompt-asset/references/guide-h3-image-*.md`.

Branché côté worker : `worker/comfyui/imageMapping.ts` (injection) et
`worker/images.ts` (tâche). `imageMapping.test.ts` lit ce fichier et casse si un
des nœuds ci-dessus disparaît après un ré-export. Formats acceptés par
`ResolutionSelector` : 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9 (chaînes exactes
dans `lib/assets/asset-generation.ts`).

### `IMG_Simple_Edit.json` — édition (MiniMax H3 Image)

| Donnée | Nœud | Champ | Note |
|---|---|---|---|
| Image 1 : la cible de la modification | `45` (LoadImage) | `image` | nom du fichier dans le dossier d'entrée de ComfyUI ; ramenée à 4 MP (`56`) puis à un multiple de 32 (`48`) |
| Images 2 à 6 : références (optionnelles) | à créer à la soumission | `images.image_<n>` de `32` | jusqu'à **6 images** au total ; chacune reçoit la même chaîne que l'image 1 (`LoadImage` → `ResizeImageMaskNode` 4 MP → `ResizeImageMaskNode` multiple de 32), nœuds `cadence_source_<n>`, `_pixels`, `_echelle` |
| Instructions | `43` (PrimitiveStringMultiline) | `value` | les images se citent `<Picture 1>`, `<Picture 2>`… ; le worker ajoute une dernière ligne `Keep the result in this art style: <clause>` (clause **courte** du projet, instantané `asset_generations.clause_style`) : le graphe n'a pas de nœud de style |
| Format de sortie | `32` (MiniMaxH3ImageConditioning) | `width`, `height` | par défaut, liés à `50` (GetImageSize de l'image 1) : la sortie suit l'image 1. Une **affiche** reçoit une largeur et une hauteur explicites, 2:3 à 4 MP (`dimensionsFormat`) |
| Seed | `38` (KSampler) | `seed` | |
| Sortie | `9` (SaveImage) | `filename_prefix` | le résultat est réduit à 1 MP (`63`) avant l'enregistrement |

Le modèle est réglé pour une surface de 2048² (infobulle du nœud) : l'édition travaille à 4 MP, la génération dessine à 16 MP.
Plus de toile blanche pour l'affiche (Qwen recopiait le format de l'image 1) : le format passe par `width` et `height`.

Branché côté worker : `injecterEditionImages` dans `worker/comfyui/imageMapping.ts`
(sources envoyées par `/upload/image` sous `cadence_<uuid>_<rang>.<ext>`) ; `imageMapping.test.ts` lit ce fichier et casse si un
nœud ou un champ change après un ré-export. Variable optionnelle : `COMFYUI_WORKFLOW_EDITION_PATH`.

Les deux graphes chargent les mêmes fichiers : `minimax_h3_image_pruned_int8_convrot` (modèle),
`qwen3vl_32b_minimax_h3_int8_convrot` (encodeur, type `minimax`) et `minimax_h3_image_vae_fp16` : alterner génération et
édition ne recharge rien. Vérifié par `GET /object_info/MiniMaxH3ImageConditioning` le 2026-11-23 (entrée `images`
extensible, préfixe `image_`, 100 au plus ; `width`/`height` à 0 = taille de l'image 1).

## Contrat du workflow vidéo (`video-generation/`)

### `VID_REF2VA.json` — MiniMax H3 référence vers vidéo avec audio

Branché : `worker/comfyui/mapping.ts` (`NODE_IDS`, `injecterValeurs`, `verifierEntree`) et `worker/index.ts`
(`construireSubmissionInput`). `mapping.test.ts` lit ce fichier et casse si un nœud, un champ ou l'expression de durée
change après un ré-export. Les valeurs du fichier sont des **valeurs de test**.

| Donnée | Nœud | Champ | Note |
|---|---|---|---|
| Prompt assemblé | `22:11` (PrimitiveStringMultiline) | `value` | |
| Durée du plan | `22:23` (PrimitiveFloat) | `value` | secondes, **5 à 10** (erreur franche sinon) ; `22:24` en tire le nombre d'images (24 i/s, forme 17k+5 : 5 s = 124, 8 s = 192, 12 s = 294, 15 s = 362) qui alimente `length` du nœud `5` |
| Résolution | `22:9` (ResolutionSelector, 16:9, multiple de 32) | `megapixels` | **0,2 / 0,3 / 0,4** (`lib/renders/resolution-video.ts`), le réglage du plan copié sur le rendu. À 0,2 MP : aperçu ou final avec upscale (nœuds 243 à 135:26, ×2 par côté). Au-delà : rendu final natif, sans upscale, avec la même interpolation (le nœud 165 lit la sortie de la première passe `176`). |
| Seeds | `16`, `103` (easy seed) : `seed` ; `135:27` (RandomNoise) : `noise_seed` | | la seed du plan, si elle existe |
| Images de référence | `5` : `ref_images.ref_image_<slot-1>` | | **6 au plus** (images + vidéos) ; le nœud en accepte 9 |
| Audios de référence | `5` : `ref_audios.ref_audio_<slot-1>` | | **3 au plus** ; la voix des personnages qui parlent |
| Vidéos de référence | `5` : `ref_videos.ref_video_<slot-1>` | | 3 au plus ; sortie 0 (images) seulement |
| Upscale | `34` (VHS_VideoCombine) | `images`, `audio` | oui : `165` / `261` (RIFE) ; non : `176` / `177` et `frame_rate` = 24 |
| Sortie | `34` | `filename_prefix` | |

**Créés à la volée** (ids `ref_img_N`, `ref_audio_N`, `ref_video_N`, absents du fichier ; les références du fichier sont
purgées) : `LoadImage` + `ImageScaleToTotalPixels` (noyau ; 1 Mpx, lanczos, id `ref_img_N_charge` pour le chargement : plus de pack tiers, remplace `LoadImageCrop` le 2026-11-04) ; `LoadAudio` (nœud du noyau, `audio` seul :
le fichier entier) ; `LoadVideo` (noyau, `file`) suivi de `GetVideoComponents` (noyau), dont les images alimentent `ref_videos`. Plus de
découpe côté ComfyUI (anciens `LoadAudioUI` / `LoadVideoUI`, remplacés le 2026-11-04) : pour un extrait, couper le fichier avant l'envoi. Les
fichiers sont envoyés par `/upload/image` sous `cadence_<chemin relatif aplati>`.

**Fixe, laissé au fichier** : résolution du 1er pass (`22:9`, 16:9, 0,2 Mpx, multiple de 32 : aucune donnée de
projet ou de plan ne porte de format vidéo) ; cadence : le modèle génère à 24 i/s, RIFE (`165`, `source_fps` 24)
interpole vers `168` (48) et le commutateur `170` impose cette valeur ; `plans.fps` (`SubmissionInput.fps`) n'est donc
**pas injecté** ; `ref_image_size` `max` ; audio des vidéos de référence non câblé (`ref_video_audios`) ; modèles et LoRA.

Vérifié par `GET /object_info` le 2026-10-02 : `MiniMaxH3ReferenceToVideo` (images max 9, audios max 3, vidéos max 3,
`length` pas de 17), `LoadAudioUI` (start/end/duration FLOAT, défaut 0), `LoadVideoUI` (16 champs obligatoires),
`LoadImageCrop`. **Jamais rendu en réel avec ces changements.**

## Suivi en direct (WebSocket)

Le worker écoute `ws(s)://<COMFYUI_URL>/ws?clientId=…` pendant un prompt
(`worker/comfyui/wsTracking.ts`, décodage dans `wsDecoding.ts`) : `execution_start`,
`executing`, `progress` (valeur/max), aperçus binaires du sampler (le serveur
doit être lancé avec `--preview-method auto`) et `execution_success` /
`execution_error`. Rien dans les workflows n'est à adapter pour cela. Pour
inspecter les messages réels (par exemple le transport propre du nœud
`ModelPreviewOverrideKJ`), lancer le worker avec `COMFYUI_WS_DEBUG=1` : le
journal brut est écrit sous `MEDIA_ROOT/_debug/`.

## Contrat de la vidéo en trois étapes (`video-generation/`, 2026-10-30)

Remplace `VID_REF2VA.json` (une seule passe) une fois le worker basculé. Validé de bout en bout par
un script de simulation du worker (retiré avec le dossier `workflows/labo/` le 2026-10-31 ; `git show be6083b:workflows/labo/simuler-prod.mjs`) (6 min 24 pour 10 s). Les trois étapes se partagent un dossier de latents propre au rendu, sous
`output/h3_latents/<dossier>/` : `gen/clip_00001.safetensors` (première passe) et `up/clip_00001.safetensors` (upscalé). Le chargeur retrouve un
latent par dossier + `clip_index` ; `stock_format: true` pour le décoder ou le séparer, `false` pour alimenter Motion Context.

| Workflow | Champs injectés par le worker | Sortie lue |
|---|---|---|
| `VID_Generation.json` | prompt `22:11` ; durée `22:23` ; résolution `22:9` (0,4 MP, verrouillée) ; seed `16` ; références (recréées autour du nœud `5`, comme `VID_REF2VA`) ; dossier du latent `302.filename_prefix` (`h3_latents/<dossier>/gen/clip`) | brouillon mp4 24 ips + audio : nœud `18` ; latent : nœud `302` |
| `VID_UPSCALE.json` | **mêmes** prompt, durée, résolution et références que `VID_Generation` ; latent à charger `310.latent_path` (`h3_latents/<dossier>/gen`) ; seed `103` ; sauvegarde `303.filename_prefix` (`h3_latents/<dossier>/up/clip`) | aucun fichier : la fin du prompt dans `/history` (nœud `303`) |
| `VID_Finition.json` | audio : `310.latent_path` (`…/gen`) ; image : `320.latent_path` (`…/up`) ; `34.filename_prefix` | mp4 final 1080p, 48 ips : nœud `34` |

- L'audio du rendu final vient du latent de la **première passe** : la passe d'upscale régénère et accélère l'audio.
- `VID_UPSCALE` refait le conditioning (modèle, CLIP, références) : le worker refuse un rendu final dont l'entrée n'est plus celle de la
  prévisualisation (empreinte de l'entrée).
- **Plan en suite** (Motion Context, 2026-10-30, non testé en réel) : deux variantes, choisies par le worker quand le plan précédent a gardé le latent de sa première
  passe. `VID_Generation_suite.json` ajoute `301` (chargeur du latent du plan précédent : `latent_path` = `h3_latents/<dossier du précédent>/gen`, `stock_format: false`),
  `303` (Motion Context, 22 images de contexte) dont le conditioning alimente le guider `125:14`, et `305` (Trim) qui rogne le brouillon `18`. `VID_Finition_suite.json`
  ajoute `312` (Trim de 22 images, image et audio) avant RIFE et RTX. `VID_UPSCALE.json` est le même ; le latent du clip contient le préfixe de contexte, retiré à la
  finition. Sans latent du précédent, le plan retombe sur l'image de raccord (`jobs.continuite` = `image`).
