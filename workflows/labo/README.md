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

## Conclusions (2026-10-29)

- Retenus : Singularity, LoRA turbo de base, 6 étapes, 0,4 MP verrouillé, 24 ips, Motion Context, upscale latent ×1,5
  (le ×2 coûte 2,5 fois plus par étape pour un gain faible), RTX VSR en finition 1080p.
- Écartés : SeedVR2 (22 min puis plantage), FlashVSR (ne s'exécute pas), upscale latent ×2.
- À vérifier : la déformation légère de 1280 × 704 vers 1920 × 1080 (ratio 1,818 contre 1,778).
- Chargement d'un latent sauvegardé : `stock_format: true` pour le décoder, `false` pour alimenter Motion Context.
