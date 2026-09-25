# Workflows ComfyUI

Graphes ComfyUI (format API, exportables via "Save (API Format)") consommés
directement par le backend de Cadence — pas de la documentation, une
dépendance d'exécution.

- `video-generation/` — génération H3, 1er pass + upscale (F04)
- `upscale/` — passe upscale isolée si distincte du workflow principal
- `voice-clone/` — Qwen3-TTS, VoiceDesign + Base (F06)
- `image-refs/` — Krea 2 (masters) + Qwen Image Edit (dérivés) (F01)

## Avant de committer un workflow

- Vérifier les chemins de checkpoints/LoRA en dur — les remplacer par une
  variable d'environnement ou une note dans ce README si ça ne peut pas
  être évité pour l'instant.
- Un workflow qui change de forme (nouveaux nodes, nouveaux paramètres
  exposés) doit rester synchro avec le code qui le soumet à l'API — les
  deux vivent dans le même commit.
