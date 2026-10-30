# Workflows de labo

Instruments de mesure, pas des dépendances d'exécution : le backend ne les lit pas. Les essais écartés ou remplacés
se retrouvent dans l'historique git (`git log -- workflows/labo/`, dernier état complet : commit `f56589e`).

## Conservés

- **`LABO_REF_natif_0.4MP.json`** : la référence. Même prompt Tifa, mêmes références, même seed, modèle
  `Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors`, LoRA turbo de base, 6 étapes, 0,4 MP. Point de départ de
  toute nouvelle comparaison.
- **`LABO_PROD_test.json`** : la chaîne retenue de bout en bout : génération à 0,4 MP, upscale latent ×1,5 (environ
  1280 × 704), décodage, RIFE 24 → 48 ips, RTX VSR 1080p, vidéo finale 48 ips. L'audio est pris sur la première passe
  (la passe d'upscale le régénère et l'accélère). Le latent de la première passe est sauvegardé pour les raccords.
  Mesuré le 2026-10-29 : environ 7 min 13 pour 10 s.

- **`LABO_GEN.json`** et **`LABO_GEN_suite.json`** : l'exemple de Motion Context (continuité d'un plan « suite »). `GEN`
  génère le clip 1 et sauvegarde son latent (`h3_latents/clip`, `clip_index` 1). `GEN_suite` le recharge
  (`MiniMaxH3MotionContextLoadLatent`, `stock_format: false`), le passe à `MiniMaxH3MotionContext` (22 images de contexte),
  relie le **guider** à sa sortie de conditioning (`303`, sortie 0), sauvegarde le clip 2 (`clip_index` 2), puis
  `MiniMaxH3MotionContextTrim` retire le préfixe de contexte de la vidéo et de l'audio. Le prompt de `GEN_suite` est
  celui de la suite du combat.

## Simulation de la prod (en cours, non lancée)

La chaîne retenue découpée en trois étapes, comme le worker les lancera, pour valider le contrat avant de toucher à l'app.

- **`LABO_PROD_1_GEN.json`** : prompt, références, seed → brouillon 0,4 MP + latent de la première passe (`302`, sous `h3_latents/<dossier>/gen`).
- **`LABO_PROD_2_UPSCALE.json`** : recharge ce latent (`310`, `stock_format: true`), upscale ×1,5 (graine `103`), sauvegarde le latent upscalé (`303`, sous `h3_latents/<dossier>/up`). Il refait le conditioning (modèle, CLIP, références, prompt) : le prompt et les références doivent être identiques à ceux de GEN.
- **`LABO_PROD_3_FIN.json`** : sans modèle de diffusion. L'image vient du latent upscalé (`320`), **l'audio du latent de la première passe** (`310`), puis RIFE 48 ips, RTX 1080p, vidéo finale.
- **`simuler-prod.mjs`** : joue le worker (`COMFYUI_URL=http://<hôte>:8188 node workflows/labo/simuler-prod.mjs`), injecte dossier et graine, enchaîne les étapes et les chronomètre ; `--etapes upscale,fin --dossier <nom>` reprend une étape seule.

À vérifier au premier passage : que le chargeur retrouve bien `clip_00001` dans le dossier donné ; que le latent rechargé passe dans `LTXVSeparateAVLatent` ; que le résultat équivaut à la chaîne en une passe (`LABO_PROD_test`, même seed) ; la somme des temps (les rechargements de modèles comptent, `--cache-none`) face aux 7 min 13.

## Conclusions (2026-10-29)

- Retenus : Singularity, LoRA turbo de base, 6 étapes, 0,4 MP verrouillé, 24 ips, Motion Context, upscale latent ×1,5
  (le ×2 coûte 2,5 fois plus par étape pour un gain faible), RTX VSR en finition 1080p.
- Écartés : SeedVR2 (22 min puis plantage), FlashVSR (ne s'exécute pas), upscale latent ×2.
- À vérifier : la déformation légère de 1280 × 704 vers 1920 × 1080 (ratio 1,818 contre 1,778).
- Chargement d'un latent sauvegardé : `stock_format: true` pour le décoder, `false` pour alimenter Motion Context.
