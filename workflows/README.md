# Workflows ComfyUI

Graphes ComfyUI (format API, exportables via "Save (API Format)") consommés
directement par le backend de Cadence — pas de la documentation, une
dépendance d'exécution.

- `video-generation/` — génération H3, 1er pass + upscale (F04)
- `upscale/` — passe upscale isolée si distincte du workflow principal
- `voice-clone/` — Qwen3-TTS (Voice Design) puis CosyVoice3 (répliques) (F06) ; **pas branché**, voir plus bas
- `image-refs/` — Krea 2 (masters) + Qwen Image Edit (dérivés) (F01)
- `audio/` — Stable Audio 3 : bruitages et ambiances (`SFX_Generate_Sounds.json`) ; branché (asset `sfx`), voir plus bas ; Qwen3-TTS : voix de référence (`VOX_Generate_Voice_Simplified.json`) ; branché (asset `voix`), voir plus bas

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
| Format | `49` (ResolutionSelector) | `aspect_ratio`, `megapixels` | 16:9 pour un décor, 1:1 pour une fiche ou un détail |
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

### `voice-clone/` — pas branché

`CharacterVoicesNode` lit un fichier de voix dans un dossier propre à ComfyUI et
exige texte de référence et rognage saisis dans le graphe : la gestion de
l'audio y est trop couplée à ComfyUI pour être pilotée par l'application (voir
`docs/FRICTIONS.md`, F06). À reprendre quand le passage de la référence d'un
moteur à l'autre ne dépendra plus de ce nœud.

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

### `VOX_Generate_Voice_Simplified.json` — voix de référence (Qwen3-TTS Voice Design)

Branché (2026-10-02) : `worker/comfyui/voixMapping.ts` (injection) et `worker/images.ts` (tâche, méthode
`voix` de `asset_generations`) ; popup `GenerationVoixDialog` à l'étape « Référence » du casting vocal.
`voixMapping.test.ts` lit ce fichier et casse si un des nœuds ci-dessous disparaît après un ré-export. Trois
nœuds seulement : le moteur, le concepteur de voix, l'écoute. Variable optionnelle : `COMFYUI_WORKFLOW_VOIX_PATH`.

| Donnée | Nœud | Champ | Note |
|---|---|---|---|
| Instruction de timbre | `2` (UnifiedVoiceDesignerNode) | `voice_instruction` | en anglais ; aussi recopiée dans `1`.`instruct` |
| Texte lu | `2` | `reference_text` | au mot près ce que dira la référence ; celui du projet par défaut |
| Seed | `2` | `seed` | tirée côté serveur |
| Créativité de la voix | `1` (Qwen3TTSEngineNode) | `temperature` | **0,8 à 1,2**, 1,1 par défaut (curseur de la popup) |
| Langue du texte lu | `1` | `language` | `English` pour le texte par défaut du projet, sinon la langue de la fiche de voix |
| Sortie | `3` (PreviewAudio) | — | **remplacé à la soumission** par `SaveAudioMP3` (qualité `V0`, préfixe `audio/cadence_<CODE>`), même id et même source `audio` : `PreviewAudio` écrit un fichier temporaire que le worker ne sait pas relire |

Fixe : modèle `Voice Design - 1.7B VoiceDesign`, `top_k` 50, `top_p` 1, `repetition_penalty` 1,05, `max_new_tokens`
2048. Le résultat est un **candidat** (comme les images et les sons) : « Utiliser comme référence » le copie sous
`assets/<CODE>.mp3` et reporte l'instruction et le texte sur la fiche. CosyVoice3 (les répliques) reste à la main.

## Suivi en direct (WebSocket)

Le worker écoute `ws(s)://<COMFYUI_URL>/ws?clientId=…` pendant un prompt
(`worker/comfyui/wsSuivi.ts`, décodage dans `wsDecodage.ts`) : `execution_start`,
`executing`, `progress` (valeur/max), aperçus binaires du sampler (le serveur
doit être lancé avec `--preview-method auto`) et `execution_success` /
`execution_error`. Rien dans les workflows n'est à adapter pour cela. Pour
inspecter les messages réels (par exemple le transport propre du nœud
`ModelPreviewOverrideKJ`), lancer le worker avec `COMFYUI_WS_DEBUG=1` : le
journal brut est écrit sous `MEDIA_ROOT/_debug/`.
