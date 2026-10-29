# Workflows de laboratoire (essais à la main)

Copies de `video-generation/VID_REF2VA.json` (état du commit c32f02f : 6 étapes, shift audio 3) avec **un seul
changement** chacune, à glisser dans ComfyUI. Rien dans le code ne lit ce dossier : ce ne sont pas des workflows de
production. Les nouveaux nœuds ont les ids `301` et suivants. « NON VÉRIFIÉ » = lu dans le code source, mais jamais
exécuté ici. Chaîne modèle de référence : `171:4` → `193` → `196` → `195` → `21` (chargeur LoRA du cœur `LoraLoaderModelOnly`, à la place du Power Lora Loader de la prod, qui a des bugs d'affichage ; absent quand aucun LoRA n'est actif) → `106` → guideur `125:14` (le guideur `135:29` de la passe d'upscale n'existe plus dans le labo).

**E5a et E5b (2026-10-28) : natif, sans passe d'upscale** — 0,4 MP directement, plus de `103`, `135:*`, `222`, `224`, `242`–`244`, `122`, `146`, `147`, `189`, `190`, `18` ; RIFE `165` et le son `261` lisent le décodage `176` / `177` de la passe 1. Même chose pour E4 (le VSR `301` lit `176`, à comparer à l'upscale latent). D3 et D12 aussi (même retrait) : tous les workflows du dossier sont désormais natifs à 0,4 MP, sans passe d'upscale.

**Chargeur LoRA (2026-10-28) : dans tous les fichiers du labo, le Power Lora Loader (rgthree) est remplacé par `LoraLoaderModelOnly` du cœur ; `workflows/video-generation/VID_REF2VA.json` et le banc (`worker/comfyui/banc-variantes.ts`, qui lit `21.inputs.lora_2`) n'ont pas changé.**

**Référence : `LABO_REF_natif_0.4MP.json`** — copie de `video-generation/VID_REF2VA.json` sans passe d'upscale, 0,4 MP, aucun autre changement (ni patch d'attention, ni VSR). C'est le point de comparaison de E4 et E5.

**Prompt commun (2026-10-28) : combat de Tifa, 5 plans très coupés, qui finit sur « Essaie encore, haha ! »** (8 s, 3 références + la voix de `VOICE_maya_P230.flac`). Mettre dans `input/` de ComfyUI : `CHAR_Tifa.png` (`123`), `DEC_Ruelle_Secteur7.png` (`151`), `CHAR_Soldat_Shinra.png` (`152`) — ces fichiers ne sont pas dans le dépôt. Pour D3, le clip 2 a son propre prompt, qui **continue** l'action avec les mêmes références : le soldat se relève, tire, Tifa le désarme et le termine, puis « Cette fois, c'est fini. ».

*D11 (Sol-Attn de kijai) retiré le 2026-10-28 : le dépôt est obsolète, le nœud du cœur de ComfyUI (E5b) fait la même chose.*

## D3 — Motion Context (`LABO_D3_MotionContext_clip1.json` puis `..._clip2.json`)
- Installer `NikoDemon80/ComfyUI-H3-Motion-Context` (ComfyUI 0.34.0 ou plus récent). Clip 1 : `301` « H3 Motion Context Save Latent », qui reçoit la sortie 0 de `125:12` et écrit `output/h3_context_passe1/clip_00001.safetensors` (`302`, passe 2, retiré avec l'upscale).
- Clip 2 : `301` « Load Latent » (clip_index 1) → `303` « H3 Motion Context » (conditionnement de `5`, VAE `171:2`, latent `5`·1) → `125:14`.
- `305` « Motion Context Trim » reçoit les images de `176`, le son de `177` et `trim_frames` de `303`, et sort vers RIFE `165` et `261` : les 22 images épinglées sont retirées (≈ 0,9 s de moins).
- Une seule passe, donc un seul Motion Context : le montage est celui du README du pack.
- Pour un vrai test : même résolution et même durée pour les deux clips, et un prompt du clip 2 qui **continue** l'action (à changer à la main dans `22:11`). À regarder : la jointure image et son.

*D6 (Semantic Bridge) retiré le 2026-10-28 : MiniMax H3 Singularity améliore le modèle de base plus nettement, sans doute en agissant plus profondément.*

## E4 — RTX Video Super Resolution (`LABO_E4_RTX_VSR_1080p.json`)
- Installer `Comfy-Org/ComfyUI_Nvidia_VFX_Nodes` (`pip install -r requirements.txt` : `nvidia-vfx`, PyTorch cu130 ou plus récent, GPU RTX).
- `301` « RTX Video Super Resolution » reçoit les images du décodage `176` et sort vers RIFE `165` ; `target dimensions` 1920 × 1080, qualité `HIGHBITRATE_ULTRA` (images propres, non compressées), force 1.
- **Avant RIFE** : deux fois moins d'images à agrandir, et les images interpolées sont calculées sur des images déjà nettes au lieu de faire accentuer les fantômes de RIFE.
- La sortie est forcée en 16:9 exact : si le rendu n'est pas exactement 16:9 (multiples de 32), léger étirement. À regarder : détails fins, halos, scintillement, temps de RIFE en 1080p.

*E2 (PDMD/DMAD, Larryvrh v4-600) testé puis retiré le 2026-10-28 : le LoRA turbo de base reste le plus polyvalent ; voir `docs/CAHIER_DE_TESTS.md`.*

*E5a (Sage Attention, KO : module `sageattention` absent, workflow supprimé), D12 (PDD 8 étapes) et E5b (sparse attention `sol-attn`) retirés le 2026-10-28 : PDD ne sera pas utilisé ; la sparse attention dégrade l'image plus qu'elle n'aide, Comfy Kitchen suffit pour accélérer.*

## U — Upscaling : trois façons d'obtenir un plan net (2026-10-29)
Même prompt Tifa, mêmes références, même seed que `LABO_REF_natif_0.4MP.json` (le point de départ). **Base de tous les essais : `Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors`** (le fichier de l'utilisateur ; les anciens graphes du labo, dont la référence, E4 et D3, ont été alignés dessus).
- **U1 `LABO_U1_LatentUpscale_x1.5.json`** : le graphe de production (`VID_REF2VA.json`) avec 0,2 MP en première passe, puis l'upscale latent ×1,5 (et non ×2) pour arriver à environ 0,45 MP, soit presque le natif 0,4 MP de la référence : à netteté comparée à pixels égaux. **NON VÉRIFIÉ** : que le facteur `mode.scale` s'applique par côté (si c'est une surface, le résultat sera plus petit). Le sélecteur `122` de la prod (et `146`/`147`) est retiré : il a fait agrandir le latent vide au lieu de la sortie du sampler (constaté à l'essai), `242` lit donc directement `125:12` (sortie 1). Les sigmas de la passe 2 (`222`) sont ceux de la production ; c'est l'autre bouton à essayer.
- **U2 `LABO_U2_SeedVR2_fp8_1080p.json`** : natif 0,4 MP, puis SeedVR2 3B fp8 jusqu'à 1080 de côté court, puis RIFE. Installer `numz/ComfyUI-SeedVR2_VideoUpscaler` ; les modèles `seedvr2_ema_3b_fp8_e4m3fn.safetensors` et `ema_vae_fp16.safetensors` se téléchargent seuls dans `models/SEEDVR2`. Réglages de départ : 16 blocs échangés vers le CPU (monter si manque de mémoire, jusqu'à 32), VAE en tuiles, lots de 21 images (4n+1), chevauchement 3. Le README du pack annonce 18 Go minimum pour le 3B sans échange de blocs : sur 16 Go, c'est le réglage à surveiller.
- **U3 `LABO_U3_FlashVSR_x2.json`** : natif 0,4 MP, puis FlashVSR v1.1 ×2 (environ 1,7 MP, pas exactement 1080p), mode `tiny-long`, VAE et DiT en tuiles, puis RIFE. Installer `lihaoyun6/ComfyUI-FlashVSR_Ultra_Fast` (`pip install -r requirements.txt`) et poser le dossier `FlashVSR` de HF `JunhaoZhuang/FlashVSR` dans `models/`. Il utilise une attention éparse de type Sage (le module `sageattention` manquait pour E5a : à surveiller). Minimum 21 images en entrée.
- À comparer entre eux et avec E4 (RTX VSR) : netteté des visages et des textures, scintillement d'une image à l'autre, temps et pic de mémoire (surtout U2). Les trois VSR partent du même clip natif : leurs défauts viennent de la source, pas du modèle seul (leçon d'E4).


## GEN / FIN — le futur `VID_REF2VA` en deux temps (2026-10-29, première version)
Départ : la référence natif 0,4 MP, **sans RIFE** (24 ips, la cadence du modèle ; RIFE devient une option de la finition). La génération garde le latent sur disque, la finition le reprend : plus besoin de relancer le sampler pour agrandir, et on peut finir les plans dans n'importe quel ordre. Tout est **NON VÉRIFIÉ** (rien n'a été lancé) ; le premier essai est « GEN, puis FIN sur ce latent ».
- **`LABO_GEN.json`** : génération seule. Le latent du sampler est sauvegardé (`302`, `output/h3_latents/clip_00001.safetensors`) et un aperçu mp4 24 ips sort tout de suite (`34`). Les ids de la référence sont conservés (`22:11`, `22:9`, `16`, `22:23`, `22:8`, `34`) ; `103` (seed d'upscale) et `18` n'existent plus.
- **`LABO_GEN_suite.json`** : même chose pour un plan qui **continue** le précédent (liaison `suite`) : `301` charge le latent du rendu précédent (`clip_index` 1), `303` Motion Context, `305` rogne le préfixe ; `302` sauvegarde le sien en `clip_index` 2 pour le plan d'après. Un plan en `coupe` utilise `LABO_GEN.json`. Les deux fichiers ne diffèrent que de `301`, `303`, `305` : le code n'aura qu'à ajouter ou retirer ce bloc.
- **`LABO_FIN.json`** : finition seule, **sans modèle de diffusion ni CLIP** (seulement les deux VAE) : charge le latent (`310`), décode image et son, super-résolution RTX (`311`, 1920 × 1080, comme E4), vidéo finale 24 ips. Pour un autre agrandisseur, remplacer `311` par le nœud de `LABO_U2` ou `LABO_U3`.
- **`LABO_FIN_suite.json`** : idem pour un rendu `suite` : `312` retire les images du préfixe (`trim_frames` à 22, valeur de départ ; la bonne est la sortie 1 de `303`, que la finition ne calcule pas : Cadence devra la garder avec le latent). **NON VÉRIFIÉ** aussi : que le latent sauvegardé contienne ce préfixe.
- **`LABO_FIN_RIFE.json`** : option RIFE (24 → 48 ips), placée **avant** la super-résolution (`313` puis `311`) : RIFE travaille sur des images propres à 0,4 MP et la super-résolution agrandit ensuite 2 fois plus d'images. Pour l'ordre inverse, brancher `313` sur la sortie de `311` et `311` sur le décodage `176`. À mesurer : temps de chaque ordre.
- Le latent doit rester lié à **son** rendu : si le plan est refait, l'ancien latent ne sert plus.
