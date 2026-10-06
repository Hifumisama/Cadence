<!-- variantes: image, generation -->
# Krea 2 (Turbo) — prompter un master ou un asset généré de zéro

> Sources. **Officiel** : [krea-ai/krea-2, `docs/prompting.md`](https://github.com/krea-ai/krea-2/blob/main/docs/prompting.md) et [`docs/expansion.txt`](https://github.com/krea-ai/krea-2/blob/main/docs/expansion.txt) (relevés le 2026-09-30) ; [ComfyUI, Krea-2 workflow](https://docs.comfy.org/tutorials/image/krea/krea-2). **Communautaire, non officiel** : le guide de blocs de prompt d'un auteur tiers (ordre cadrage → lumière → sujet → décor → style, pondération des mots, schéma de pose). Chaque règle ci-dessous est marquée `[officiel]`, `[communauté]` ou `[projet]` (observé sur nos rendus, ou hérité de notre registre). Une règle `[communauté]` est une piste à éprouver, jamais un fait.

## Le modèle

- **Turbo** : distillé en **8 étapes**, sans guidance (CFG 0 ou 1). `[officiel]` Notre workflow (`IMG_01_TextToImage.json`) : 8 étapes, CFG 1, `euler` / `simple`, avec un `ConditioningZeroOut` sur le négatif. `[projet]`
- **Pas de negative prompt.** Le négatif est remis à zéro : « pas de X » ne s'obtient pas. Décris ce qu'on veut voir. `[projet]`, cohérent avec le guide communautaire (« les négations ne fonctionnent pas de façon fiable »).
- **Encodeur de texte Qwen3-VL 4B** : il lit des phrases, pas des étiquettes. `[officiel]`
- **Résolution** : jusqu'à 2K. `[officiel]` Le format est choisi par le workflow (`ResolutionSelector` : rapport d'aspect et mégapixels) : 16:9 par défaut pour un décor, une plate ou une fiche personnage, carré pour un effet ou un détail. `[projet]` Le prompt ne fixe jamais de dimensions.
- **LoRA « CharacterDesign »** : le workflow peut l'activer pour une fiche personnage (4 vues). `[projet]`
- Le workflow expose un mode **prompt_enhance** (un LLM développe le prompt). On ne l'utilise pas : le prompt vient de l'agent, pour rester reproductible. `[projet]`

## Écrire le prompt

- **Langage naturel, prose continue, en anglais.** Pas une liste de tags. `[officiel]`
- **Long et détaillé donne les meilleurs résultats**, mais le modèle tient déjà une image correcte avec peu. `[officiel]` Vise 40 à 100 mots pour un asset simple, plus pour un personnage riche. `[projet]`
- **Texte à l'image** : entoure les mots à afficher de guillemets `"…"`. `[officiel]` (l'enseigne « Le Voile Écarlate » du registre)
- **Sujet seulement, pas de style.** Le style du projet est ajouté par ComfyUI à partir de la clause de style : ne le répète pas dans le prompt d'un asset. `[projet]`
- **Ordre conseillé** : cadrage et lumière d'abord, sujet (le bloc le plus long) ensuite, décor, puis style. `[communauté]` Chaque bloc sur sa ligne améliore la cohérence. `[communauté]` Notre registre écrit du sujet vers le cadrage : les deux ont produit des images validées, ne pas réécrire un prompt qui a marché pour respecter cet ordre. `[projet]`
- **Reste fidèle à la description** : ne rajoute ni objet, ni accessoire, ni personnage que la description ne dit pas. `[officiel, expansion.txt]`
- **Un medium demandé est un medium respecté** : ne pas basculer d'un rendu à un autre pour contourner une difficulté. `[officiel, expansion.txt]`
- **Un prompt déjà détaillé se polit, il ne se réécrit pas.** `[officiel, expansion.txt]`
- **Ne pas sur-spécifier** : n'invente pas de tenue, de couleur ou de matière que l'entrée ne supporte pas. `[officiel, expansion.txt]`
- **Un seul paragraphe** par prompt. `[officiel, expansion.txt]`

## Gabarits du projet

- **Fiche personnage** (un seul bloc de description, puis la consigne de mise en page) `[projet]` :

  ```text
  [description du personnage], neutral standing pose, plain light background, character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground.
  ```

  La fiche montre le personnage **seul**, **mains vides**, sans effet ni décor ni pose d'action : elle sert de référence d'identité, pas d'illustration de scène.

- **Décor, accessoire, effet** : la prose descriptive seule, sans consigne de planche.

## Variantes et seed

Ce guide ne documente pas la variance de seed de Krea 2 Turbo. Ne suppose pas qu'un balayage de seeds donne des variantes utiles : quand un asset demande **plusieurs variantes réellement différentes** (poses, états d'usure), écris des prompts distincts et signale-le dans `remarques`. `[projet, à vérifier sur Krea 2]`

## Pondération et pose (communauté, à éprouver)

Le workflow communautaire propose une pondération de mots `(mot:1.5)` par un nœud dédié et un schéma de pose détaillé (silhouette, répartition du poids, orientation du torse…). Ils ne font pas partie de notre workflow : **ne les écris pas** dans un prompt d'asset tant qu'on ne les a pas branchés et testés.
