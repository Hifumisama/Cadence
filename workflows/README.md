# Workflows ComfyUI

Graphes ComfyUI (format API, exportables via "Save (API Format)") consommés
directement par le backend de Cadence — pas de la documentation, une
dépendance d'exécution.

- `video-generation/` — génération H3, 1er pass + upscale (F04)
- `image-refs/` — Krea 2 (masters) + Qwen Image Edit (dérivés) (F01)
- `audio/` — Stable Audio 3 : bruitages et ambiances (`SFX_Generate_Sounds.json`) ; branché (asset `sfx`), voir plus bas 

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

### `IMG_01_TextToImage.json` — génération (Krea 2 Turbo)

| Donnée | Nœud | Champ | Note |
|---|---|---|---|
| Prompt de l'asset | `59` (PrimitiveStringMultiline) | `value` | le sujet seulement, sans style |
| Clause de style | `60` (PrimitiveStringMultiline) | `value` | `projects.clauseStyle`, concaténée au prompt dans le graphe (`30:58`) |
| Format | `49` (ResolutionSelector) | `aspect_ratio`, `megapixels` | 16:9 par défaut pour un décor et une fiche personnage (meilleurs résultats, recette 2026-10-05) ; 1:1 pour un effet ou un détail |
| Seed | `30:3` (KSampler) | `seed` | |
| LoRA « CharacterDesign » | `30:23` (PrimitiveBoolean) | `value` | à `true` pour une fiche personnage (4 vues) ; `false` sinon |
| Sortie | `29` (SaveImage) | `filename_prefix` | |

8 étapes, CFG 1, `euler` / `simple`, négatif remis à zéro (`ConditioningZeroOut`).

Branché côté worker : `worker/comfyui/imageMapping.ts` (injection) et
`worker/images.ts` (tâche). `imageMapping.test.ts` lit ce fichier et casse si un
des nœuds ci-dessus disparaît après un ré-export. Formats acceptés par
`ResolutionSelector` : 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9 (chaînes exactes
dans `lib/asset-generation.ts`).

### `IMG_Simple_Edit.json` — édition (Qwen Image Edit 2511)

| Donnée | Nœud | Champ | Note |
|---|---|---|---|
| Image 1 : la cible de la modification | `41` (LoadImage) | `image` | nom du fichier dans le dossier d'entrée de ComfyUI ; le parent par défaut |
| Images 2 et 3 : références (optionnelles) | à créer à la soumission (LoadImage → `FluxKontextImageScale`) | `image2`, `image3` de `170:149` et `170:151` | jusqu'à **3 images** au total ; les nœuds ne sont créés que pour les images fournies, comme pour les références du workflow vidéo |
| Instructions d'édition | `170:151` (TextEncodeQwenImageEditPlus, positif) | `prompt` | les images se citent par leur rang : « image 1 », « image 2 » |
| Négatif | `170:149` | `prompt` | laissé **vide** |
| Seed | `170:169` (KSampler) | `seed` | |
| LoRA Lightning 4 étapes | `170:168` (PrimitiveBoolean) | `value` | `true` : 4 étapes CFG 1 (toujours utilisé par l'application) ; `false` : 40 étapes CFG 4, sans LoRA (sans effet visible au test) |
| Sortie | `195` (SaveImageAdvanced) | `filename_prefix`, `format` | PNG 8 bits sRGB |

**La taille de sortie suit l'image 1** : le graphe n'a aucun nœud de taille (le latent
est le `VAEEncode` de l'image 1 mise à l'échelle par `FluxKontextImageScale`), donc
ni format ni mégapixels à régler en édition.

Branché côté worker : `injecterEditionImages` dans `worker/comfyui/imageMapping.ts`
(sources envoyées par `/upload/image` sous `cadence_<uuid>_<rang>.<ext>`, nœuds
`cadence_source_<rang>` et `cadence_source_<rang>_echelle` créés pour les images 2 et
3) ; `imageMapping.test.ts` lit ce fichier et casse si un nœud ou un champ change
après un ré-export. Validé en réel le 2026-10-01 (2 sources). Variable optionnelle :
`COMFYUI_WORKFLOW_EDITION_PATH`.

Le fichier exporté ne câble que `image1`, mais le nœud `TextEncodeQwenImageEditPlus`
accepte jusqu'à trois images : la première est **ce qu'on modifie**, les autres
sont des références (la matière d'un objet, le style, un personnage à
introduire). Deux cas d'usage : éditer l'image d'un asset (le parent, seul), ou
fabriquer une image à partir d'autres (plusieurs assets combinés). Le modèle est
`qwen_image_edit_2511_int8_convrot` avec l'encodeur `qwen_2.5_vl_7b_fp8_scaled` ;
Krea 2 charge un autre encodeur (`qwen3vl_4b_fp8_scaled`), donc alterner les deux
types de tâches recharge des modèles.

## Contrat du workflow audio (`audio/`)

### `SFX_Generate_Sounds.json` — bruitages et ambiances (Stable Audio 3 Medium)

Branché (2026-10-01) : `worker/comfyui/audioMapping.ts` (injection) et
`worker/images.ts` (tâche, méthode `audio` de `asset_generations`) ; popup
`GenerationAudioDialog` sur la fiche d'un asset `sfx`. `audioMapping.test.ts` lit ce
fichier et casse si un des nœuds ci-dessous disparaît après un ré-export. Guide de
prompts : `agents/skills/prompt-asset/guide-stable-audio-sfx.md`. Ce que le code
injecte (les valeurs du fichier sont des **valeurs de test**, remplacées à la
soumission) :

| Donnée | Nœud | Champ | Note |
|---|---|---|---|
| Prompt du son | `52:31` (PrimitiveStringMultiline) | `value` | une ou deux phrases en anglais, sans durée ; part tel quel dans le modèle tant que la réécriture est coupée |
| Durée | `52:36` (PrimitiveFloat) | `value` | secondes, **paramètre séparé du texte** ; alimente `EmptyLatentAudio` (`52:11`, champ `seconds`) |
| Seed | `52:3` (KSampler) | `seed` | |
| Réécriture | `52:35` (PrimitiveBoolean) | `value` | **forcé à `false`** à chaque soumission (voir plus bas) |
| Sortie | `19` (SaveAudioMP3) | `filename_prefix`, `quality` | **MP3** (qualité `V0`), préfixe `audio/cadence_<CODE>` (le sous-dossier `audio/` est conservé) ; résultat vérifié sur un vrai run : `/history` → `outputs["19"].audio = [{filename, subfolder: "audio", type: "output"}]` |

Fixe, à ne pas toucher : checkpoint `stable_audio_3_medium` (`52:25`), encodeur
`t5gemma_b_b_ul2` (`52:26`), 8 étapes, CFG 1, `lcm` / `simple` (`52:3`), négatif
vide (`52:7`) : à CFG 1 il est sans effet.

**Réécriture de prompt (ignorée).** `52:35` (« Enable_Reprompt », PrimitiveBoolean
`value`) est à `false` : le commutateur `52:34` passe le texte de `52:31`
directement à l'encodeur. À `true`, un petit LLM Qwen (`52:28` TextGenerate,
`52:29` CLIP `qwen3.5_2b_bf16`) réécrit l'idée d'après un gabarit par catégorie
(`52:49` JsonExtractString, `52:43` CustomCombo Music / Instrument / SFX /
One-shot ; `52:38` à `52:40` assemblent le gabarit avec le texte et la durée).
Cette branche reste coupée : c'est l'agent `prompt-asset` qui tient ce rôle, de
façon reproductible (comme pour `prompt_enhance` de Krea 2). `52:41` / `52:42`
(`ComfyMathExpression`, `PreviewAny`) ne servent qu'à cette branche et à
l'aperçu de la durée.

**Pas encore tranché :** ajouter ou non `TrackType: SFX, ` en tête du texte à la
soumission (recommandé par la doc de Stability, absent du gabarit du workflow,
non testé sur ce graphe), et le rôle d'une mention « Length: X seconds » dans un
prompt brut. Voir le guide.

## Contrat du workflow vidéo (`video-generation/`)

### `VID_REF2VA.json` — MiniMax H3 référence vers vidéo avec audio

Branché : `worker/comfyui/mapping.ts` (`NODE_IDS`, `injecterValeurs`, `verifierEntree`) et `worker/index.ts`
(`construireSubmissionInput`). `mapping.test.ts` lit ce fichier et casse si un nœud, un champ ou l'expression de durée
change après un ré-export. Les valeurs du fichier sont des **valeurs de test**.

| Donnée | Nœud | Champ | Note |
|---|---|---|---|
| Prompt assemblé | `22:11` (PrimitiveStringMultiline) | `value` | |
| Durée du plan | `22:23` (PrimitiveFloat) | `value` | secondes, **5 à 10** (erreur franche sinon) ; `22:24` en tire le nombre d'images (24 i/s, forme 17k+5 : 5 s = 124, 8 s = 192, 12 s = 294, 15 s = 362) qui alimente `length` du nœud `5` |
| Résolution | `22:9` (ResolutionSelector, 16:9, multiple de 32) | `megapixels` | **0,2 / 0,3 / 0,4** (`lib/resolution-video.ts`), le réglage du plan copié sur le rendu. À 0,2 MP : aperçu ou final avec upscale (nœuds 243 à 135:26, ×2 par côté). Au-delà : rendu final natif, sans upscale, avec la même interpolation (le nœud 165 lit la sortie de la première passe `176`). |
| Seeds | `16`, `103` (easy seed) : `seed` ; `135:27` (RandomNoise) : `noise_seed` | | la seed du plan, si elle existe |
| Images de référence | `5` : `ref_images.ref_image_<slot-1>` | | **6 au plus** (images + vidéos) ; le nœud en accepte 9 |
| Audios de référence | `5` : `ref_audios.ref_audio_<slot-1>` | | **3 au plus** ; prises des répliques liées d'abord, bruitages sur les emplacements libres |
| Vidéos de référence | `5` : `ref_videos.ref_video_<slot-1>` | | 3 au plus ; sortie 0 (images) seulement |
| Upscale | `34` (VHS_VideoCombine) | `images`, `audio` | oui : `165` / `261` (RIFE) ; non : `176` / `177` et `frame_rate` = 24 |
| Sortie | `34` | `filename_prefix` | |

**Créés à la volée** (ids `ref_img_N`, `ref_audio_N`, `ref_video_N`, absents du fichier ; les références du fichier sont
purgées) : `LoadImageCrop` (`image`, `crop`, `max_megapixels` 1) ; `LoadAudioUI` (`start_time` 0, `end_time` =
`duration` = durée mesurée de la prise, arrondie au centième par excès ; 0 si inconnue = défauts du nœud, « tout le
fichier » **supposé, non vérifié**) ; `LoadVideoUI` (tous ses champs, obligatoires : défauts du nœud, 24 i/s). Les
fichiers sont envoyés par `/upload/image` sous `cadence_<chemin relatif aplati>`.

**Fixe, laissé au fichier** : résolution du 1er pass (`22:9`, 16:9, 0,2 Mpx, multiple de 32 : aucune donnée de
projet ou de plan ne porte de format vidéo) ; cadence : le modèle génère à 24 i/s, RIFE (`165`, `source_fps` 24)
interpole vers `168` (48) et le commutateur `170` impose cette valeur ; `plans.fps` (`SubmissionInput.fps`) n'est donc
**pas injecté** ; `ref_image_size` `max` ; audio des vidéos de référence non câblé (`ref_video_audios`) ; modèles et LoRA.

Vérifié par `GET /object_info` le 2026-10-02 : `MiniMaxH3ReferenceToVideo` (images max 9, audios max 3, vidéos max 3,
`length` pas de 17), `LoadAudioUI` (start/end/duration FLOAT, défaut 0), `LoadVideoUI` (16 champs obligatoires),
`LoadImageCrop`. **Jamais rendu en réel avec ces changements.**

**Master de voix** : le même graphe sert de repli au master d'un personnage (voir « Master de voix » en bas).

## Suivi en direct (WebSocket)

Le worker écoute `ws(s)://<COMFYUI_URL>/ws?clientId=…` pendant un prompt
(`worker/comfyui/wsSuivi.ts`, décodage dans `wsDecodage.ts`) : `execution_start`,
`executing`, `progress` (valeur/max), aperçus binaires du sampler (le serveur
doit être lancé avec `--preview-method auto`) et `execution_success` /
`execution_error`. Rien dans les workflows n'est à adapter pour cela. Pour
inspecter les messages réels (par exemple le transport propre du nœud
`ModelPreviewOverrideKJ`), lancer le worker avec `COMFYUI_WS_DEBUG=1` : le
journal brut est écrit sous `MEDIA_ROOT/_debug/`.

## Master de voix d'un personnage (`audio/VID_Create_Voice_Master.json`)

Variante du graphe vidéo H3 (`VID_REF2VA.json`) : la voix générée passe par « Noise or Vocal Removal » (MelBand RoFormer) puis « Voice Fixer ».
Branché côté worker (`worker/images.ts`, méthode `master_voix`). En l'absence du fichier, le worker
retombe sur `VID_REF2VA.json` (voix non nettoyée).

- **Entrées** : celles de `VID_REF2VA` (injectées par `injecterValeurs`, `worker/comfyui/mapping.ts`) — prompt (`22:11`), seed (`16`), durée
  (`22:23`), image du personnage en `<Picture 1>` (aucune pour une voix off), **aucun audio de référence** (H3 invente la voix). Les nœuds
  `LoadImageCrop` (123), `LoadVideoUI` (251) et `LoadAudioUI` (157) du fichier sont des restes d'essai : les références sont recréées à chaque
  soumission, ces nœuds ne sont plus reliés au nœud 5 et ne s'exécutent pas.
- **Sorties** : la voix nettoyée est enregistrée par le nœud `313` (SaveAudioAdvanced, flac, préfixe imposé par le worker) = le master ; la
  vidéo de test (voix nettoyée incluse) sort du nœud `18` (VHS_VideoCombine, `save_output` forcé à true par le worker : il est à false dans le
  fichier). Les ids sont dans `NODE_IDS_MASTER` (`worker/comfyui/masterMapping.ts`). Sans le fichier : repli sur `VID_REF2VA` + extraction ffmpeg.
- **Chemin** : `COMFYUI_WORKFLOW_MASTER_PATH` (défaut `./workflows/audio/VID_Create_Voice_Master.json`).

## Contrat de la vidéo en trois étapes (`video-generation/`, 2026-10-30)

Remplace `VID_REF2VA.json` (une seule passe) une fois le worker basculé (`docs/PLAN_INTEGRATION_WORKER.md`). Validé de bout en bout par
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
