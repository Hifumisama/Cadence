# Workflows ComfyUI

Graphes ComfyUI (format API, exportables via "Save (API Format)") consommés
directement par le backend de Cadence — pas de la documentation, une
dépendance d'exécution.

- `video-generation/` — génération H3, 1er pass + upscale (F04)
- `upscale/` — passe upscale isolée si distincte du workflow principal
- `voice-clone/` — Qwen3-TTS (Voice Design) puis CosyVoice3 (répliques) (F06) ; **pas branché**, voir plus bas
- `image-refs/` — Krea 2 (masters) + Qwen Image Edit (dérivés) (F01)

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
| LoRA Lightning 4 étapes | `170:168` (PrimitiveBoolean) | `value` | `true` = 4 étapes CFG 1 ; `false` = 40 étapes CFG 4 |
| Sortie | `195` (SaveImageAdvanced) | `filename_prefix`, `format` | PNG 8 bits sRGB |

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

## Suivi en direct (WebSocket)

Le worker écoute `ws(s)://<COMFYUI_URL>/ws?clientId=…` pendant un prompt
(`worker/comfyui/wsSuivi.ts`, décodage dans `wsDecodage.ts`) : `execution_start`,
`executing`, `progress` (valeur/max), aperçus binaires du sampler (le serveur
doit être lancé avec `--preview-method auto`) et `execution_success` /
`execution_error`. Rien dans les workflows n'est à adapter pour cela. Pour
inspecter les messages réels (par exemple le transport propre du nœud
`ModelPreviewOverrideKJ`), lancer le worker avec `COMFYUI_WS_DEBUG=1` : le
journal brut est écrit sous `MEDIA_ROOT/_debug/`.
