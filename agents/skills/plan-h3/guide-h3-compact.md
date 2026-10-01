# Guide H3 — mode full-reference, version compacte

> Condensé de `.claude/skills/fiche-de-plan/references/h3-guide-fullref.md` (guide officiel MiniMax), limité aux deux types de tâches que Cadence utilise : `reference generation` et `audio reference`. Les cas d'édition ou de continuation de vidéo (`<Video N>`, `video editing`, `video continuation`, `keyframe completion`, `audio reuse`) n'y sont volontairement pas repris. En cas de doute, le guide complet fait foi.

Le prompt final est fait de **six sections, dans cet ordre**, toutes en anglais (seuls les dialogues dans `<d>` et le texte visible à l'image gardent leur langue) :

`subject_definitions` → `summary` → `retention_analysis` → `detailed_description` → `overall_soundscape` → `non_diegetic_music`

## Labels

| Label | Sens |
|---|---|
| `<Subject N>` | Un contenu visible réutilisable : personnage, décor, accessoire, effet. Ce n'est pas le fichier, c'est ce qui sera vu. |
| `<Picture N>` | Une image de référence. Elle ne devient une image-clé (première frame, dernière frame) **que si le texte le dit** : `<Picture 2> is the first frame of [Shot 1]`. |
| `<Audio N>` | Un signal audio en référence : timbre et diction d'un locuteur, style musical. |

Un label garde le même sens dans toutes les sections.

## `subject_definitions`

Une ligne par sujet suivi. Elle dit ce que le label désigne, son rôle, ses traits principaux, et cite l'image source :

```text
<Subject 1> is the young woman in <Picture 1>, with long dark hair, a blue cardigan, and a thin silver necklace.
```

Pour une voix de référence liée à un locuteur, reprendre son identifiant global `(Sx)` :

```text
<Audio 1> is the voice-timbre reference for <Subject 1> (S1).
```

## `summary`

Un court paragraphe anglais, avec un préfixe de type entre crochets :

- `[reference generation]` : des images ou du son guident la génération sans être une frame concrète.
- `[reference generation + audio reference]` : idem, avec un audio dont on ne reprend que le timbre et la diction.

Il n'introduit aucun nouveau label.

## `retention_analysis`

Une ligne par label. Pour un sujet visible, un marqueur parmi :

| Marqueur | Sens |
|---|---|
| `fully_preserved` | Le rôle défini est intégralement conservé. |
| `partially_preserved` | Utilisé, mais certains traits changent. |
| `attribute_transfer` | Des traits sont transférés à un autre sujet identifiable. |
| `weak_reference` | Seule une ressemblance générale est gardée. |

```text
<Subject 1> (appears in [Shot 1], [Shot 3]): fully_preserved - ...
```

Pour l'audio, `reference` (timbre et diction, sans copier le signal) :

```text
<Audio 1>: reference - the target speaker follows <Audio 1>'s voice timbre and delivery without copying the original signal.
```

Ne pas compter comme une perte de fidélité ce que le plan ajoute (actions, fonds, événements).

## `detailed_description`

Le corps du prompt, plan par plan dans l'ordre de lecture.

- **Ouverture** : une ou deux phrases de style, en anglais, **avant** `[Shot 1]`.
- **Shots** : `[Shot 1]` n'a pas de timecode ; les suivants s'écrivent `[Shot 2] At 00:03.500, …` et commencent par une coupe franche (`Hard cut`).
- **Caméra** : une action anglaise naturelle dans la phrase (type, amplitude, vitesse), pas une étiquette collée en fin de phrase. Amplitude moyenne et vitesse normale s'omettent.
- **Sujets** : à la première apparition d'un sujet important, décrire ses traits de référence, sa place dans le cadre et son action ; ensuite, réutiliser le label sans le redéfinir.
- **Locuteurs** : chaque voix physiquement produite reçoit un `(S1)`, `(S2)`… attribué une fois, dans l'ordre des prises de parole du plan, et repris à chaque prise. Un sujet qui parle s'écrit `<Subject N> (Sx)`. Un locuteur hors champ garde la même forme, marqué `off-screen`. Un locuteur sans sujet défini (voix off) : une description stable de la voix suivie de `(Sx)`.
- **Dialogues** : `<d>[Français] …</d>`, verbatim, ponctuation comprise. Ponctuation limitée à `, . ? !`, une phrase complète finit par `.`, `?` ou `!` avant `</d>`. Un passage inintelligible s'écrit `[unclear]`.
- **Dialogue coupé** : `<scenetrans>` et `<cutoff>` avec les descriptions de continuité correspondantes, quand une réplique traverse une coupe ou est tronquée par la fin de la vidéo.
- **Longueur** : 350–500 mots pour un plan riche. Un plan dialogué privilégie la tenue de toute la ligne de temps parlée plutôt que le nombre de mots.

```text
The target video is in a cinematic, literary music-video style with soft lighting and a slightly desaturated color palette.
[Shot 1] The scene opens in a crowded urban street...
[Shot 2] At 00:09.000, the shot cuts to an extreme close-up...
```

## `overall_soundscape` et `non_diegetic_music`

- `overall_soundscape` : ambiance et sons physiques sur toute la vidéo. Les dialogues, chants et sons synchronisés à un shot précis restent dans `detailed_description`.
- `non_diegetic_music` : la musique que seul le public entend, décrite par instrumentation, tempo et évolution dynamique, jamais par des mots d'humeur. `N/A` quand il n'y en a pas.
- Ne jamais répéter un dialogue dans ces deux sections.
