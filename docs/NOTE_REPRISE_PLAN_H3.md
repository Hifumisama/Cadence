# Note de reprise — skill plan-h3 après le banc Singularity (écrite le 2026-10-12)

Branche : `plan-h3-banc-singularity` (worktree `D:\Projets Vidéos\Cadence-recette`). **Rien n'est fusionné dans `main`.** Lire d'abord `docs/RETRO_BANC_SINGULARITY.md` (les tests de rendu et les constats), puis ce fichier (ce qu'il reste à corriger).

## Où on en est

La branche applique à `plan-h3` et `iteration-plan` les enseignements du banc de rendu (combat de 15 s, Singularity, ref2va). **Tout n'est pas validé : une partie est à garder, une partie est à retirer ou à repenser.** 79 tests unitaires passent, le typecheck est propre.

### Contenu de la branche

| Fichier | Changement | Statut |
|---|---|---|
| `plan-h3/SKILL.md` § continuité | règles 7 à 9 : côtés d'écran fixés dans `ouverture`, coupe sur le geste avec les deux personnages dans le cadre, où chacun finit après une coupe | **à garder** (l'agent écrit la phrase des côtés de lui-même : 2 scènes sur 3 du banc) |
| `plan-h3/SKILL.md` § assets règle 10 | un asset du registre qui apparaît dans les plans est une référence (dague devenue épée sinon) | **à garder** (références gardées 5 sur 5 sur le banc ; G avait perdu la dague et les toits) |
| `plan-h3/SKILL.md` § « Before you answer » | pas de verbe d'action dans une `definition` | **à garder** (définitions avec action : 3 sur 15 avant, 0 sur 15 après) |
| `plan-h3/references/guide-h3-compact.md` | `ouverture` avec les côtés ; `swoop`, `dive`, `whip-pan` | **à garder** (`swoop` vu à l'écran ; `dive` et `whip-pan` à confirmer) |
| `plan-h3/assets/sortie.schema.json` | description du champ `ouverture` (côtés) | **à garder** |
| `plan-h3/references/h3-lexique-corrections.md` | 5 entrées issues du banc, source « bench » | **à garder** (chacune est observée sur des rendus ; fichier partagé avec `iteration-plan`) |
| `iteration-plan/SKILL.md`, schéma, `lib/agents/iteration-plan.ts`, `RevueProposition.tsx` | catégorie `mise-en-scene`, vérification des côtés et du contact dans les vignettes, corriger un prompt trop long en coupant | à relire, risque faible |
| `lib/agents/plan-h3-controles.ts` + test | alerte `description-longue` au-delà de 600 mots | à garder |
| `plan-h3/SKILL.md` § cadence (ligne « exchange of blows » à 2,5–4 s) | un plan toutes les 2,5 à 4 s pour un échange de coups | **À RETIRER OU REPENSER** (voir ci-dessous) |
| `plan-h3/SKILL.md` § 6 longueur (« 350–500 mots », « décris chaque coup concrètement ») | | **À REPENSER** (voir ci-dessous) |
| `plan-h3/references/guide-genre-action.md` règles 5 à 9 | un plan tient un échange ; poids des coups ; respiration ; effet sur le décor | **À REPENSER** (voir ci-dessous) |

## Pourquoi une partie est à retirer ou repenser

Le banc de rendu (E à M, projet 43) a montré que des **prompts écrits à la main**, de 350 à 500 mots concrets en 4 à 5 plans, donnent de bien meilleurs combats. Mais **l'agent local ne sait pas écrire ce genre de texte** à partir des règles :

- Combat de Maya, agent avec le nouveau skill (plan G) : 4 plans, environ 330 mots, abstrait (« whirlwind », « frantic »), la dague redevient une épée, aucune parade. Rendu jugé **pire** que le plan F (agent avec l'ancien skill) : « ça ne fonctionne plus du tout, la scène est incohérente ».
- Banc de trois scènes de combat différentes (projet 44, sans image), `gemma4-26b-A4B` :

| | Ancien skill | Nouveau skill |
|---|---|---|
| Plans | 8, 8, 10 | 5, 5, 4 |
| Mots | 537, 452, 499 | 297, 395, 313 |
| Côtés dans l'ouverture | 0 sur 3 | 2 sur 3 |
| Références gardées | 5/5 | 5/5 |
| Définitions avec action | 3/15 | 0/15 |
| Verbes de coup | 5, 9, 2 | 7, 5, 3 |
| Adjectifs vagues | 0 | 17 |

Le nouveau skill fait raccourcir sans rendre le texte plus concret. **Les règles de structure passent, les règles de savoir-faire non.**

## À faire demain, dans l'ordre

1. **Tester `qwen3.6-35b-A3B` pour de vrai (par un rendu).** Les deux séries ont été lancées sur le banc du projet 44 (rapports `plan-h3-2026-10-11T23-37-54.md` pour l'ancien skill, dans `data/_essais/` de l'arbre principal, et `plan-h3-2026-10-11T23-34-52.md` pour le nouveau, dans `data/_essais/` du worktree ; mesures : `node scripts/ab-metriques.mjs <ancien> <nouveau>`) :

   | `qwen3.6-35b-A3B` | Ancien skill | Nouveau skill |
   |---|---|---|
   | Plans | 8, 8, 8 | 8, 7, 8 |
   | Mots | 501, 515, 709 | 529, 438, 408 |
   | Côtés dans l'ouverture | 0 sur 3 | **3 sur 3** |
   | Références gardées | 5/5 | 5/5 |
   | Définitions avec action | 0/15 | 2/15 |
   | Verbes de coup | 7, 8, 8 | 9, 9, 4 |
   | Adjectifs vagues | 10 | 3 |
   | Temps de génération (3 plans) | 150 s | 209 s |

   Avec ce modèle, la longueur est dans la norme (contrairement à `gemma4-26b-A4B` qui descendait sous 350 mots), la phrase des côtés est écrite à chaque fois, et il **ignore** la cadence à 2,5–4 s (il garde 7 à 8 plans de 2 s). Ce sont des mesures de texte, pas de rendu : **le test à faire est de lui faire écrire le combat de Maya** (`npm run plan-h3:essai -- --projet 43 --plans cfc9dfc3-f56b-4925-b208-d3634939128e --modele qwen3.6-35b-A3B`), de poser le résultat comme plan avec `scripts/ab-agent-plan.mts`, de le rendre avec Singularity et de le comparer à F, G, L et M. Si le rendu est bon, la piste est de changer de modèle (`LLM_MODELE_PLAN_H3` existe déjà) plutôt que de réécrire le skill.
2. **Retirer ou réécrire** la ligne de cadence « exchange of blows », la règle 5 du guide « action » et l'insistance sur la longueur : elles ont fait écrire moins concrètement. Garder le reste.
3. **Décider d'une étape de chorégraphie** (changement du contrat de sortie, à écrire dans `docs/FRICTIONS.md` avant) : l'agent rendrait d'abord une liste structurée des coups (qui, quelle arme ou quel membre, quelle cible, quel effet visible), puis le texte à partir de cette liste. Tester sur le banc du projet 44 avant de coder quoi que ce soit.
4. **Ne pas régler sur une seule scène** (voir la mémoire « prompts génériques ») : le banc du projet 44 sert à ça. Il n'a pas d'images, donc pas de rendu : l'évaluation reste textuelle. Pour comparer par rendu, il faudrait produire les images de ses 15 assets.
5. **Les décisions de FRICTIONS à trancher, pas en silence** : « Hard cut to » (jamais testé contre « the shot cuts to » avec Singularity, le plan M l'a utilisé et a bien marché sans isoler l'effet) ; les négatifs courts en fin de prompt (présents dans J, K, L, M, déconseillés par la règle 3.3) ; la clause de style raccourcie.
6. **Exemples** : ne pas en ajouter pour l'instant. Les sources trouvées sont nuancées (trop d'exemples dégradent, un seul fait sur-apprendre) et le code a déjà une alerte contre la recopie d'exemples.

## Autres chantiers du banc (voir la rétro, § 4.2)

- Vérifier au démarrage du worker que `unet_name` et les LoRA du workflow existent côté ComfyUI.
- Enregistrer dans chaque job le modèle, les LoRA, le chemin (aperçu ou final) et la seed.
- Brancher les images clés `Add Guide` dans `worker/comfyui/mapping.ts` (tutoriel officiel ComfyUI, mode ref2va).
- Inventaire des assets : éviter qu'un personnage ait deux images concurrentes (illustration de scène et fiche).
- `prompt-asset` : les fiches ont perdu des traits critiques (hétérochromie de la Tenancière, yeux rouges de Maya).

## État hors branche à connaître

- **`workflows/video-generation/VID_REF2VA.json` est modifié dans l'arbre principal et non commité** : la ligne `unet_name` (≈ ligne 546) pointe sur `Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors`. Le LoRA `lora_2` (≈ ligne 106) doit rester `minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors` : l'avoir écrasé avec le nom du modèle a faussé le premier tour. Décision à prendre : commiter Singularity comme défaut.
- **Base locale** : projet 43 « Banc A/B — H3 et Singularity » (plans A à M, assets de test) et projet 44 « Banc agent — combats (sans rendu) ». À supprimer quand on n'en a plus besoin ; les rendus sont sous `data/plans/27…39` (ignorés par git).
- **Aucun changement dans `docs/FRICTIONS.md`** n'a encore été écrit : à faire une fois les décisions prises.

## Scripts du banc (ajoutés dans cette branche)

`scripts/ab-singularity.mts` (plans A à C), `ab-multiref.mts` (D), `ab-combat.mts` (E), `ab-agent-plan.mts` (pose un prompt d'agent comme plan, F et G), `ab-combat-reecrit.mts` (H, I), `ab-combat-j.mts`, `ab-combat-k.mts`, `ab-combat-l.mts`, `ab-combat-m.mts`, `ab-banc-agent.mts` (projet 44), `ab-metriques.mjs` (mesures d'un rapport de l'agent), `ab-coupes.mjs` (instants des coupes d'une vidéo, avec ffmpeg). Lancer un script de création : `npx tsx --env-file=.env scripts/<nom>.mts`. Chacun refuse de recréer ce qui existe déjà.
