# Guide H3 — mode full-reference, version compacte

> Condensé de `.claude/skills/fiche-de-plan/references/h3-guide-fullref.md` (guide officiel MiniMax), limité aux deux types de tâches que Cadence utilise : `reference generation` et `audio reference`. Les cas d'édition ou de continuation de vidéo n'y sont volontairement pas repris. En cas de doute, le guide complet fait foi.

Le prompt final que H3 reçoit est fait de six sections (définitions des références, résumé, analyse de rétention, description détaillée, ambiance sonore, musique), toutes en anglais ; seuls les dialogues dans `<d>` et le texte visible à l'image gardent leur langue. **Le code assemble ces six sections à partir de ton brouillon** : il numérote les références, pose les repères de shots et les timecodes, et écrit les lignes de définition et de rétention. Ce guide dit comment écrire **chaque champ de ton brouillon**.

## Les références : `nom` et `definition`

Pour chaque référence, deux textes courts en anglais que le code assemble en une ligne de définition :

- `nom` : comment le plan nomme l'asset (« Maya », « the Tenancière », « the narrow wooden corridor »).
- `definition` : ce qu'il est **dans ce plan** et ce qu'il y fait, sans « is » ni verbe d'introduction (« leaning in close, her stride reduced to a bare inclination »). Elle peut rester vide quand le nom suffit.

`retention` (facultatif) dit comment le plan reprend la référence : `fully_preserved` (défaut, intégralement conservé), `partially_preserved` (certains traits changent), `attribute_transfer` (des traits passent à un autre sujet), `weak_reference` (ressemblance générale seulement). Pour un son : `reference` (défaut, caractère du son repris sans copier le signal). `retentionNote` dit en une phrase ce qui est conservé.

## `summary`

Un court paragraphe anglais : qui fait quoi, où. Il n'introduit aucune référence nouvelle et ne porte pas de préfixe entre crochets (le code le pose). Les références y sont désignées par `[[CODE]]`.

## `ouverture`

Une ou deux phrases de style, en anglais, qui précèdent le premier shot : la clause de style du projet, la lumière dominante. Aucune référence n'y est citée.

## `shots`

Un objet par shot : `debutSecondes` et `texte`.

- Le premier shot commence à `0` et son texte est une phrase complète (« A wide shot follows [[CHAR_maya]], Maya, running… »).
- Les suivants commencent à leur instant d'entrée. **Le code écrit « Hard cut to » avant ton texte** : commence donc directement par le cadre (« a low-angle shot of… », « an extreme close-up on… »), jamais par un numéro, un timecode ou « Hard cut ».
- **Caméra** : une action anglaise naturelle dans la phrase (type, amplitude, vitesse), pas une étiquette collée en fin de phrase. Amplitude moyenne et vitesse normale s'omettent.
- **Références** : à la première apparition d'une référence importante dans le plan, décris ses traits, sa place dans le cadre et son action ; ensuite, cite-la seulement. Chaque citation s'écrit `[[CODE]]`.
- **Locuteurs** : chaque voix physiquement produite reçoit un `(S1)`, `(S2)`… attribué une fois, dans l'ordre des prises de parole du plan, et repris à chaque prise. Un personnage qui parle s'écrit `[[CHAR_x]] (Sx)`. Un locuteur hors champ garde la même forme, marqué `off-screen`. Une voix off sans personnage à l'image : une description stable de la voix suivie de `(Sx)`.
- **Dialogues** : `<d>[Français] …</d>`, verbatim, ponctuation comprise. Ponctuation limitée à `, . ? !`, une phrase complète finit par `.`, `?` ou `!` avant `</d>`. Un passage inintelligible s'écrit `[unclear]`.
- **Dialogue coupé** : `<scenetrans>` et `<cutoff>` avec les descriptions de continuité correspondantes, quand une réplique traverse une coupe ou est tronquée par la fin de la vidéo.
- **Longueur** : 350–500 mots en tout pour un plan riche. Un plan dialogué privilégie la tenue de toute la ligne de temps parlée plutôt que le nombre de mots.

## `overall_soundscape` et `non_diegetic_music`

- `overall_soundscape` : ambiance et sons physiques sur toute la vidéo. Les dialogues, chants et sons synchronisés à un shot précis restent dans les `shots`. Une référence sonore peut y être citée par `[[SFX_…]]`.
- `non_diegetic_music` : la musique que seul le public entend, décrite par instrumentation, tempo et évolution dynamique, jamais par des mots d'humeur. `N/A` quand il n'y en a pas.
- Ne jamais répéter un dialogue dans ces deux champs, ni y recopier le nom du champ.
