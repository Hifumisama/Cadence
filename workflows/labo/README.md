# Workflows de laboratoire (essais à la main)

Copies de `video-generation/VID_REF2VA.json` (état du commit c32f02f : 6 étapes, shift audio 3) avec **un seul
changement** chacune, à glisser dans ComfyUI. Rien dans le code ne lit ce dossier : ce ne sont pas des workflows de
production. Les nouveaux nœuds ont les ids `301` et suivants. « NON VÉRIFIÉ » = lu dans le code source, mais jamais
exécuté ici. Chaîne modèle de référence : `171:4` → `193` → `196` → `195` → `21` → `106` → guideurs `125:14` / `135:29`.

## D11 — Sol-Attn de kijai (`LABO_D11_SolAttn_kijai.json`)
- Installer `kijai/ComfyUI-SolAttn_triton` dans `custom_nodes` (Triton requis). Le dépôt se déclare **obsolète** : le cœur de ComfyUI fait la même chose (voir E5b).
- `301` « Patch Sol-Attn » (`SolAttnPatch`) reçoit le modèle de `196` et sort vers `195` (à la place de `196` → `195`).
- Réglages par défaut du nœud (tau 1.3, 20 % à 90 % des étapes, `sink_conditioning` exact_kv_and_rows), `verbose` activé.
- Le nœud ne travaille qu'en bf16 avec des têtes de 128 ; sinon il retombe sur l'attention de `196` (le journal le dit).
- À regarder : temps par étape (1re exécution lente : compilation Triton), visages, lèvres, son par rapport au rendu de base.

## E5a — Sage Attention (`LABO_E5a_SageAttention.json`)
- `196` ne propose que « pytorch » et « comfy kitchen » (code du cœur) : il faut le nœud de KJNodes (déjà installé) et la bibliothèque `sageattention` dans le Python de ComfyUI.
- `301` « Patch Sage Attention KJ » (`PathchSageAttentionKJ`, sic) reçoit le modèle de `196` et sort vers `195` ; il remplace l'attention choisie par `196`.
- `sage_attention` = `auto`. Variante possible : le nœud KJ « MiniMax H3 Mem Eff Sage Attention Patch » (même place, aucun réglage), pour la VRAM.
- À regarder : vitesse, VRAM maximale, dérive des couleurs ou du son par rapport à « comfy kitchen ».

## E5b — Model Sparse Attention du cœur (`LABO_E5b_SparseAttention_SolAttn.json`)
- Rien à installer (nœud du cœur `BlockSparseAttention`, affiché « Model Sparse Attention », marqué expérimental) ; ComfyUI récent requis.
- `301` reçoit le modèle de `196` et sort vers `195` : `196` reste le repli dense quand l'attention creuse est inactive.
- `method` = `sol-attn` (tau 1.3), de 20 % à 100 % des étapes, `min_tokens` 12288, `verbose` activé (options avancées).
- À regarder dans la console : quelles couches passent en creux ou pourquoi elles restent denses ; puis vitesse et qualité.

## D3 — Motion Context (`LABO_D3_MotionContext_clip1.json` puis `..._clip2.json`)
- Installer `NikoDemon80/ComfyUI-H3-Motion-Context` (ComfyUI 0.34.0 ou plus récent). Clip 1 : `301`/`302` « H3 Motion Context Save Latent » reçoivent la sortie 0 de `125:12` (passe 1) et de `135:26` (passe 2) et écrivent `output/h3_context_passe1|2/clip_00001.safetensors`.
- Clip 2 : `301`/`302` « Load Latent » (clip_index 1) → `303`/`304` « H3 Motion Context » (conditionnement de `5`, VAE `171:2`, latent `5`·1 pour la passe 1, `244` pour la passe 2) → `125:14` et `135:29`.
- `305` « Motion Context Trim » reçoit les images de `189`, le son de `190` et `trim_frames` de `304`, et sort vers RIFE `165` et `261` : les 22 images épinglées sont retirées (≈ 0,9 s de moins).
- Deux passes = deux résolutions, donc deux Motion Context (un latent ne se redimensionne pas) ; ce montage à deux passes est **NON VÉRIFIÉ** (le README du pack ne montre qu'une passe).
- Pour un vrai test : même résolution et même durée pour les deux clips, et un prompt du clip 2 qui **continue** l'action (à changer à la main dans `22:11`). À regarder : la jointure image et son.

## D6 — Semantic Bridge (`LABO_D6_SemanticBridge_original.json`, `..._BUNNY.json`)
- Original : `Speach1sdef178/MiniMax-H3-Semantic-Bridge` + `MiniMaxH3_SemanticBridge_v1.safetensors` dans `models/semantic_bridge/`. **L'auteur dit qu'il ne marche pas en Ref2VA** (lèvres et chant dégradés avec un audio de référence) : à tester en connaissance de cause.
- BUNNY : `aa335615543-ux/BUNNY_H3_Conditioning_Bridge` + `BUNNY_H3_ActionLogic_Bridge_V2.safetensors` (HF JOKER141 ; V1 aussi disponible) dans `custom_nodes/<dossier du nœud>/models/`.
- `301` (`SenseNovaH3DistilledBridge` ou `BunnyH3ConditioningBridge`) reçoit le conditionnement de `5` (sortie 0) et sort vers les deux guideurs `125:14` et `135:29`.
- alpha 0,10, `magnitude_match` per_token. À regarder : qui fait quoi dans l'action, objets tenus, et surtout la synchro labiale.

## D12 — LoRA PDD Ref2VA 8 étapes (`LABO_D12_PDD_Ref2VA_8steps.json`)
- Le fichier d'Alibaba PAI n'est pas au format ComfyUI ; prendre la conversion **pour modèle élagué** (notre UNET est `pruned`) : `MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy.safetensors` (HF `RunningHubAI/rh-minimax-h3-ref2va-acc-8step-pruned-comfy.safetensors-lora`, 1,6 Go) dans `models/loras/`.
- Le cœur de ComfyUI la charge comme une LoRA normale : ses 32 têtes de sortie arrivent en `set_weight` et le modèle choisit la tête d'après les sigmas (code lu, **NON VÉRIFIÉ** en rendu ; ComfyUI récent requis).
- Changé : `21` lora_2 (le turbo 4 étapes) → ce fichier, et `22:8` = 8. Ne pas l'empiler avec un autre turbo.
- Le réglage officiel est euler / simple ; le fichier garde er_sde / beta (un seul changement). La passe d'upscale (`222`, 3 sigmas manuels) l'utilise aussi.
- À regarder : netteté et mouvement par rapport au turbo 4 étapes, temps total (8 étapes au lieu de 6).

## D13 — Ref Patch (`LABO_D13_RefPatch_FL2VA.json`)
- Le patch sert à **faire imiter Ref2VA par le modèle FL2VA** : il ne s'applique pas à notre modèle Ref2VA. La variante la plus proche remplace donc l'UNET de `171:4` par `minimax_h3_fl2va_pruned_int8_convrot.safetensors` (le patch vise un modèle élagué).
- Installer `lihaoyun6/ComfyUI-MiniMaxH3_Ref-Patch` et `minimax_h3_ref_patch.safetensors` (HF `lihaoyun6/MiniMax-H3-Ref-Patch`) dans `models/model_patches/`.
- `301` « MiniMax H3 Ref-Patch Loader » reçoit le modèle de `171:4` et sort vers `193` ; `ref_strength` 1,0.
- La LoRA turbo Ref2VA de `21` est gardée (un seul changement) ; essayer aussi la turbo FL2VA (lora_1). **NON VÉRIFIÉ** : FL2VA patché + nœud `5` Ref2VA.
- À regarder : fidélité aux références (visage, décor, objet) et voix, par rapport au vrai Ref2VA.

## E4 — RTX Video Super Resolution (`LABO_E4_RTX_VSR_1080p.json`)
- Installer `Comfy-Org/ComfyUI_Nvidia_VFX_Nodes` (`pip install -r requirements.txt` : `nvidia-vfx`, PyTorch cu130 ou plus récent, GPU RTX).
- `301` « RTX Video Super Resolution » reçoit les images du décodage final `189` et sort vers RIFE `165` ; `target dimensions` 1920 × 1080, qualité `HIGHBITRATE_ULTRA` (images propres, non compressées), force 1.
- **Avant RIFE** : deux fois moins d'images à agrandir, et les images interpolées sont calculées sur des images déjà nettes au lieu de faire accentuer les fantômes de RIFE.
- La sortie est forcée en 16:9 exact : si le rendu n'est pas exactement 16:9 (multiples de 32), léger étirement. À regarder : détails fins, halos, scintillement, temps de RIFE en 1080p.
