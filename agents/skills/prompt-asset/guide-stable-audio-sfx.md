<!-- variantes: sfx -->
# Stable Audio 3 — prompter un son (asset `sfx`)

> Sources (relevées le 2026-10-01) : **officiel** [Stability AI, `docs/guides/prompting.md`](https://github.com/Stability-AI/stable-audio-3/blob/main/docs/guides/prompting.md) et [ComfyUI, Stable Audio 3](https://docs.comfy.org/tutorials/audio/stable-audio/stable-audio-3) ; **workflow** : le gabarit de réécriture intégré à `workflows/audio/SFX_Generate_Sounds.json`. Règles marquées `[officiel]`, `[workflow]`, `[communauté]` ou `[projet]` (déduit du graphe ou décidé pour Cadence). Une règle `[communauté]` ou `[projet, à éprouver]` est une piste, jamais un fait.

## Le modèle et le workflow

- **Stable Audio 3, checkpoint `medium`**, qui fait musique, instruments et **sons**. Sortie stéréo, MP3. `[officiel]` `[workflow]`
- **CFG 1, 8 étapes** : le négatif (vide) ne sert à rien, donc « sans X » ne s'obtient pas : on décrit ce qu'on veut entendre. `[projet]`
- **Le prompt part tel quel** (l'option de réécriture « Enable_Reprompt » est à `false`) : l'agent tient le rôle du petit LLM de réécriture, avec les mêmes règles. La doc conseille le prompt brut quand il est **déjà détaillé**. `[officiel]`
- **La durée est un paramètre séparé** du workflow, pas du texte : l'agent la rend dans `dureeSecondes`. `[workflow]`
- **Pas de voix intelligible** : au mieux des textures inintelligibles. Les voix passent par le casting vocal. `[officiel]`

## Court, mais pas télégraphique

**Une ou deux phrases denses** (15 à 40 mots), en anglais, sans liste de tags. `[workflow]` « 1 à 5 mots » est le conseil d'un ancien modèle (Stable Audio Open) : trois mots laissent tout à la seed. `[communauté, autre modèle]` Un prompt = **un son ou une ambiance cohérente** ; une courte séquence ordonnée est possible (« three impacts: metal, glass, wood, evenly spaced »). `[workflow]`

## Anatomie

Trois couches, dites seulement si elles comptent. `[officiel]`

1. **Source** : ce qui fait le bruit, avec sa matière (heavy wooden door, leather boots on gravel).
2. **Action** : comment le son naît et évolue (creaking open slowly, sudden crack then fading echo).
3. **Production** : espace, perspective, traitement (close-mic'd and dry, large reverberant stone hall, distant and muffled).

Gabarit : `<source + matière> <action / évolution>, <espace / perspective>, <caractère>.` Vocabulaire : matière (wooden, metal, glass, stone, gravel, leather, fabric) ; caractère (heavy, sharp, dull, hollow, metallic, crisp, rumbling) ; évolution (sudden attack, slow build, long decay, fading out, steady) ; mouvement (passing by, approaching, left to right) `[workflow]` ; prise de son (close-mic'd, dead room, tape-saturated, long reverb tail) `[officiel]`. Écris comme une **notice de banque de sons**. `[communauté, à éprouver]`

## Durée (`dureeSecondes`)

Une durée **qui colle au contenu** : la plupart des sons sont brefs. `[officiel]` Repères `[workflow]` : impact, claquement, tir, éclat 1 à 3 s ; action moyenne (pas, geste, objet déplacé) 3 à 6 s ; ambiance 6 à 15 s. **Entier.** Un plan dure 5 à 15 s : ne dépasse pas **15 s** sans raison dite dans `remarques`. `[projet]`

**Pas de « Length: X seconds » dans le texte** (le gabarit de réécriture du workflow l'ajoute, mais rien n'établit que le modèle en tire parti sur un prompt brut). `[projet, à éprouver]`

## Le tag `TrackType: SFX`

La doc recommande ce tag en tête d'un prompt de son (sons plus « raisonnables ») `[officiel]` ; le gabarit du workflow ne l'emploie pas, et il n'est pas testé sur notre graphe. **Tu ne l'écris jamais** : s'il est adopté, le code l'ajoutera à la soumission, pour pouvoir le couper et comparer. Pas de tags `Genre:` ou `Format:` : ils concernent la musique. `[projet]`

## Pièges

- **Pas de négation** (« no echo » peut faire entendre l'écho) : écris l'état voulu, « dry, close-up thump ».
- **Pas de voix ni de paroles**, **pas de musique** (BPM, genre, tonalité, instrument mélodique) : `remarques`, type `voix-ou-musique`.
- **Pas de termes visuels** (couleur, cadrage, lumière) : traduis en son (la matière et le poids du bruit qu'un objet fait).
- **Pas de paramètres techniques** (« 48kHz », « stereo », « high quality ») ni de marques, d'artistes ou d'œuvres. `[projet, à éprouver]`
- **N'ajoute aucun élément sonore** absent de la description canonique (un feu qui crépite ne reçoit pas de hiboux en prime).
- **Pas de promesse de boucle** : rien ne garantit qu'une ambiance se raccorde. `[projet, non vérifié]`
- **Durée incohérente** : une ambiance sur 2 s ou un tir sur 12 s ne rendent pas ce qu'on décrit.

## Exemples (prompt, durée en secondes)

| Prompt | s |
|---|---|
| Heavy wooden door creaking open slowly on a rusty hinge, long low groan, echoing hollow stone interior. | 4 |
| Campfire crackling close up, dry wood popping and soft embers hissing, faint night wind in the background. | 10 |
| Strong wind gusting over a rocky ridge, tattered cloth banners snapping and flapping, low airy rumble, open outdoor space. | 12 |
| Leather boots walking steadily on dry leaves and gravel, crisp crunching steps, close perspective. | 6 |
| Heavy plate armor clanking as a warrior kneels, metal plates sliding, then a short dull thud on packed earth. | 3 |
| Soft pillow thud landing on a stone floor, muffled fabric impact with a small puff of air, dry and close. | 1 |
| Sword drawn from a leather scabbard, bright metallic scrape ending in a clean ring, dry close perspective. | 2 |
| Ocean waves rolling onto a rocky shore, strong sea breeze, distant seagulls, wide open outdoor ambience. | 12 |
| Wooden floorboards creaking under slow footsteps in an old quiet house, sparse and tense, large reverberant room. | 6 |
| Single deep gong strike with a long metallic bloom fading slowly into silence, reverberant temple hall. | 8 |
| Glass goblet shattering on a stone floor, sharp impact followed by scattering shards. | 2 |
| Magical shimmer, rising glassy tonal sparkle with a soft airy whoosh, dissolving into faint chimes. | 4 |

## Avant de rendre

- Anglais, une ou deux phrases, une seule scène sonore, au moins deux couches sur trois (source, action, production).
- Aucune négation, voix, musique, terme visuel, paramètre technique, tag, mention de durée.
- Rien d'ajouté à la description canonique, rien d'important oublié.
- `dureeSecondes` entier, cohérent avec le son, 15 au plus sauf raison dite ; `sources` vide ; `methode` à `generation`.

## Incertain

L'effet de `TrackType: SFX` sur notre graphe ; l'effet d'une mention « Length » dans un prompt brut ; les ambiances au-delà de 15 s et le raccord d'une boucle ; « notice de banque de sons » (communautaire). Un conseil de page tierce n'a pas été relu à la source (la page de Jordi Pons sur Stable Audio Open était injoignable) et ne vise de toute façon pas ce modèle.

## Sources

- Stability AI, guide de prompt Stable Audio 3 : <https://github.com/Stability-AI/stable-audio-3/blob/main/docs/guides/prompting.md> (miroir : <https://stability.ai/guides/stable-audio-3-prompt-guide>).
- ComfyUI, tutoriel Stable Audio 3 : <https://docs.comfy.org/tutorials/audio/stable-audio/stable-audio-3>.
- Gabarit « SFX » et exemples du nœud `52:49` de `workflows/audio/SFX_Generate_Sounds.json`.
- Jordi Pons, « On Prompting Stable Audio » : <https://www.jordipons.me/on-prompting-stable-audio/> (Stable Audio Open, ancien modèle ; non relu).
