# Banc H3 / Singularity — ce qui reste (archive du 2026-10-12)

Le banc de rendu (projets 43 et 44, 2026-10-11 et 12) a servi à régler `plan-h3` et `iteration-plan`. Ses conclusions sont dans `docs/FRICTIONS.md` (entrées du 2026-10-12) et dans les skills ; les scripts `scripts/ab-*` et les deux documents de rétrospective ont été supprimés (retrouvables dans l'historique git, avant le commit qui crée ce fichier). Ne reste ici que ce qui n'est pas encore fait ou tranché.

## Incident à ne pas reproduire
Au premier tour, `lora_2` de `VID_REF2VA.json` a été remplacé par le nom du modèle Singularity en même temps que `unet_name`. Le chargeur de LoRA a ignoré le nom inconnu sans erreur : les rendus tournaient sans le LoRA turbo 4 steps et sortaient avec des artefacts. Rien dans Cadence ne l'a signalé. `workflows/video-generation/VID_REF2VA.json` : le LoRA `lora_2` doit rester `minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors`.

## Outillage non fait
1. **Vérifier au démarrage du worker** que `unet_name` et chaque LoRA du workflow existent côté ComfyUI (`/object_info/UNETLoader`, `/rgthree/api/loras`), et refuser le job sinon.
2. **Garder dans chaque job** le modèle (`unet_name`), les LoRA, le chemin de sortie (aperçu ou final) et la seed.
3. **Images clés (`Add Guide`)** : référence « image clé » avec `frame_idx = round(s × 24)` dans `worker/comfyui/mapping.ts`, branchée aussi comme référence visible du texte (les assets `keyframe` existent). À tester d'abord à la main avec Singularity et le LoRA turbo ; limite de 9 images au total.
4. **Inventaire des assets** : éviter qu'un personnage ait deux images concurrentes (illustration de scène et fiche) ; l'agent a pris l'ancienne illustration au lieu de la fiche, et proposait un `VFX_pilier_flammes` à trancher.
5. **`prompt-asset`** : des fiches ont perdu des traits d'identité critiques (hétérochromie de la Tenancière, yeux rouges de Maya). Répéter ces traits dans une phrase dédiée, prévoir un contrôle.
6. **Contrôles de code de `plan-h3`** : `definition` sans action et `non_diegetic_music` strict ne sont vérifiés que sur les exemples ; numéros `(Sx)` sans trou, pronoms ambigus, 15 s de voix de référence : à décider séparément.

## Décisions à trancher
- **« Hard cut to »** contre « the shot cuts to » : jamais comparé avec Singularity.
- **Négations courtes en fin de prompt** : autorisées en une ligne (FRICTIONS 2026-10-12), mesure avec et sans cette ligne à faire.
- **Clause de style raccourcie** : effet non isolé.
- **Étape de chorégraphie** (liste structurée des coups avec cause à effet, puis texte) : à écrire dans FRICTIONS avant de coder, à tester sur le banc textuel.
- **`qwen3.6-35b-A3B`** : seules des mesures de texte existent ; aucun rendu du combat de Maya avec ce modèle. Si le rendu est bon, changer de modèle (`LLM_MODELE_PLAN_H3`) plutôt que de réécrire le skill.

## Tests de rendu restants
Ablation de la version J (séparer taille, formulation et négatifs) ; images clés par plan ; plusieurs seeds avec notation à l'aveugle ; un test avec dialogue (son et synchro labiale jamais évalués).

## État local à connaître
`VID_REF2VA.json` peut porter un `unet_name` Singularity non commité : décider si Singularity devient le défaut. Les projets 43 et 44 de la base locale et les rendus sous `data/plans/27…39` sont à supprimer quand on n'en a plus besoin.
