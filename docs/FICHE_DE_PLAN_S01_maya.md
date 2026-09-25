# FICHE DE PLAN — Les Yeux de Rubis, Épisode 1 : Maya
> Source : S01_maya.md · Modèle : MiniMax H3 (Hailuo 3) · 24 fps
> 26 plans (38 plans source, fusionnés) · 244 s de montage · 244 s à générer, aucun padding requis
> Thème musical du spectacle : **1:22** en continu (shots 3 à 12)
> 21 assets à produire

## Paramètres globaux

**Style** : Cinematic Anime — linework raffiné, éclairage sophistiqué, composition cinématographique, profondeur atmosphérique, storytelling porté par l'émotion. Référence Makoto Shinkai / Yoshiyuki Sadamoto (*Your Name*, *Evangelion 3.0+1.0*). Cette phrase de style ouvre chaque `detailed_description`, avant `[Shot 1]`.

**Mode** : full-reference sur tous les plans. Le plan 30 peut aussi se jouer en I2VA (sa référence de salle est une frame exacte) — la variante est notée dans son bloc ; le full-reference reste la version par défaut de la fiche. Références principalement en images (`<Picture N>`, max 6 par plan), mais H3 accepte aussi des références vidéo (`<Video N>`) en complément — utile quand c'est un mouvement complet qui doit servir de référence plutôt qu'une pose figée (voir plan 140+150).

**Timecode musique** : le thème non-diégétique (oud + darbouka + riq) tourne en continu du plan 60 au plan 160+170, sans coupure — c'est un seul morceau de **1:22** (82 s) à composer/sourcer d'un bloc, couvrant les shots 3 à 12. Chaque plan de cette plage indique dans sa table un « Timecode musique » cumulé depuis 0:00 au début du plan 60, pour découper directement le sample correspondant à chaque appel H3. Hors de cette plage (intro diégétique du oud, acte II, acte III), pas de morceau continu à découper de cette façon.

**Le cabaret** : nommé **Le Voile Écarlate** (validé). Enseigne en cuivre gravé du nom, seul signe extérieur. Architecture inspirée du bâti marocain / médina de Marrakech : entrée discrète et étroite noyée dans les échoppes du bazar, arcs en fer à cheval, moucharabiehs, zellige aux murs. À l'intérieur, grande salle organisée en trois zones lisibles : un bar près de l'entrée où le personnel sert discrètement sans jamais s'imposer, une large zone de coussins de sol et de tapis pour la clientèle ordinaire, des canapés richement décorés et des tables basses en cuivre en retrait pour les clients importants — aucune table ni chaise. La scène est un grand cercle central, sans mât ni barre, éclairé pour des numéros osés, visible à 360° depuis tout le pourtour de la salle.

**Le couloir** : baigné d'une lumière bleu nuit constante — pas un simple rai froid ponctuel, une teinte indigo qui imprègne tout le passage. Choix volontairement symbolique : c'est la couleur de la robe de la Tenancière, le couloir est son territoire visuel avant même qu'elle y apparaisse.

**Les ruelles** : bazar de style perse/arabe, jamais médiéval européen. Passages étroits sous auvents de toile rayée, murs crépis ocre et zellige écaillé, arcs en fer à cheval, lanternes de cuivre éteintes pour la nuit, échoppes aux volets clos. Référence : médina de Marrakech, quartiers marchands nocturnes.

**Continuité** :
- La dague de Maya reste dissimulée sous le tissu à tout instant, sauf exposition accidentelle explicitement décrite (plan 140+150).
- L'hétérochromie de la Tenancière est visible dès son premier plan (200) et jamais commentée à l'oral.
- La rime yeux-de-Maya / Yeux-de-Rubis s'appuie sur l'asset `CHAR_maya_yeux`, réutilisé au shot 3 (plan 60, gros plan final), au shot 25 (plan 350+360) et au shot 26 (plan 370). Retiré du shot 4, où il tombait immédiatement après celui du shot 3.
- Le don de feu de Maya s'appuie sur l'asset `FX_flammes_danse`, posé au plan 60 (gerbe d'entrée) puis réactivé au plan 90 (fouets de flamme) — jamais commenté à l'oral, jamais réutilisé comme feu ambiant statique.
- Plans 210 et 230 restent en deux `[Shot]` internes (champ-contrechamp déjà prévu par le découpage source).

**Numérotation des shots** — chaque entrée de cette fiche est un appel H3 et porte un numéro de shot séquentiel, utilisé comme identifiant de travail (fichiers de rendu, retours, notes). La numérotation des plans source est conservée dans les titres.

| Shot | Plan |
|---|---|
| Shot 1 | PLAN 10+20 |
| Shot 2 | PLAN 30 |
| Shot 3 | PLAN 60 |
| Shot 4 | PLAN 70+80 |
| Shot 5 | PLAN 90 |
| Shot 6 | PLAN 100 |
| Shot 7 | PLAN 110 |
| Shot 8 | PLAN 120 |
| Shot 9 | PLAN 125 |
| Shot 10 | PLAN 130 |
| Shot 11 | PLAN 140+150 |
| Shot 12 | PLAN 160+170 |
| Shot 13 | PLAN 180+190 |
| Shot 14 | PLAN 200 |
| Shot 15 | PLAN 210 |
| Shot 16 | PLAN 220 |
| Shot 17 | PLAN 230 |
| Shot 18 | PLAN 240+250+260 |
| Shot 19 | PLAN 271 |
| Shot 20 | PLAN 274 |
| Shot 21 | PLAN 277 |
| Shot 22 | PLAN 300 |
| Shot 23 | PLAN 310+320 |
| Shot 24 | PLAN 330 |
| Shot 25 | PLAN 340 |
| Shot 26 | PLAN 350+360 |
| Shot 27 | PLAN 370 |

**Politique de fusion de plans** — appliquée sur cette passe pour réduire le nombre de fragments à générer et à reprendre au montage. Un plan fusionné reste un seul appel H3, contenant plusieurs `[Shot]` internes datés, jamais au-delà de 15 s cumulées. Aucun plan critique ou à enjeu d'identité complexe n'a été fusionné. Table de correspondance avec la numérotation source :

| Plan fusionné | Plans source | Durée cumulée | Logique de fusion |
|---|---|---|---|
| 10+20 | 10, 20 | 14 s | Même mouvement d'ensemble : la caméra glisse de la traversée de l'arche à l'installation de la salle, un seul geste continu |
| 30 | 30, 40, 50 | 8 s | Réduit à un seul shot fixe ancré sur une frame de salle validée : deux employés éteignent, la salle s'éteint, le halo reste — plus aucune coupe interne |
| 70+80 | 70, 80 | 11 s | Démarrage du thème puis premier gros plan yeux, continuité directe de la même prise de danse |
| 140+150 | 140, 150 | 14 s | Pluie de pièces, élan continu, tourbillon de flammes et réception assise tiennent dans un seul mouvement continu, jamais coupé en plans séparés au montage |
| 160+170 | 160, 170 | 11 s | Clin d'œil puis sortie, enchaînement direct sans rupture de rythme |
| 180+190 | 180, 190 | 12 s | Même instant de calme derrière le rideau, interrompu par la voix — un seul souffle |
| 240+250+260 | 240, 250, 260 | 15 s | Mépris, gifle, choc : la séquence de violence tient en un seul geste ininterrompu de la Tenancière, jamais coupée |
| 310+320 | 310, 320 | 12 s | La course puis l'arrêt essoufflé, un seul élan qui se brise |
| 350+360 | 350, 360 | 10 s | Les pas qui s'effacent et le sourire qui naît, la bascule tient en un seul geste de caméra |

**Scission de plan** — opération inverse de la fusion, appliquée quand le cumul de voix d'un plan dépasse le plafond H3 de 15 s. Un plan scindé donne plusieurs appels H3 distincts, raccordés au montage, numérotés dans les trous de la dizaine.

| Plans issus | Plan source | Durée | Logique de scission |
|---|---|---|---|
| 271, 274, 277 | 270 | 7 + 13 + 7 s | Les trois répliques de la sentence cumulent ~24 s de voix, très au-delà du plafond : un plan par réplique, chacun avec sa propre mise en scène |

**Écarts relevés par rapport au découpage source** :
- Plans fusionnés listés ci-dessus. Chaque plan fusionné cite les numéros source dans son titre.
- **Plan 270 scindé en 271 / 274 / 277** (voir table de scission) et **plans 280 et 290 supprimés** : la sortie de la Tenancière est jouée dans le 277, et le 300 enchaîne sans temps mort sur Maya à terre. Bilan : 25 s remplacées par 27 s, total épisode **236 s → 238 s (3 min 58)**.
- Aucun padding de durée n'est plus nécessaire : la fusion absorbe naturellement les anciens plans <5 s (160, 250) ; les plans 40 et 50 ont eux été retirés en tant que plans distincts et simplifiés dans le plan 30 (voir ci-dessus).
- **Instrument de l'intro changé** : le sitar devient un **oud**, et le thème non-diégétique passe de tabla + sitar à **oud + darbouka + riq** — cohérent avec l'ancrage maghrébin du décor, le sitar et le tabla étant indiens. Répercuté sur tous les plans.
- **Le musicien n'apparaît jamais à l'image** : le oud est toujours joué hors champ. L'asset `HUM_oudiste` reste au registre mais n'est branché sur aucun plan.
- **Plan 30 raccourci de 11 s à 8 s** — total épisode 239 s → 236 s (3 min 56).
- **Plan 120 remplacé puis plan 125 ajouté** : le saut spirale a d'abord cédé sa place à un motif de feu tracé au sol (plan 120, *Le zellige de feu*), puis a été réintroduit juste après sous le numéro 125 — le motif sert désormais de préparation au saut. Seul plan ajouté à la fiche, +7 s.

---

# I. LE SPECTACLE

## SHOT 1 — PLAN 10+20 — *Traveling d'entrée → installation de la foule*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 14 s | 14 s | 24 | full-reference |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `DEC_auberge_entree` | Décor, ruelle, porte discrète, enseigne de cuivre |
| `<Picture 2>` | `HUM_clients_auberge` | Clientèle du cabaret |
| `<Picture 3>` | `DEC_auberge_salle` | Décor, salle principale |

**Prompt**
```text
subject_definitions:
<Subject 1> is the narrow entrance of the cabaret Le Voile Écarlate from <Picture 1>, a low horseshoe-arched double wooden door set between shuttered bazaar stalls, marked only by a small engraved copper sign.
<Subject 2> is the modest gathering of patrons from <Picture 2> — around twenty people in all: merchants in layered robes, mercenaries with sheathed blades, dust-worn travelers, and a handful of wealthier guests in embroidered silks — each one busy with a readable activity of their own.
<Subject 3> is the cabaret's main hall from <Picture 3>, a raised circular stage backed by a closed scarlet velvet curtain, with cushions and patterned rugs laid along the two flanking wings and a row of raised, richly decorated sofas at the back of the room, every seat facing the stage.

summary:
[reference generation] The target video cuts between two viewpoints: a forward push along the bazaar street as <Subject 1>'s doors open for <Subject 2>, and a wide interior view of <Subject 3> as <Subject 2> take their places and turn toward the empty stage.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - the arched double door, engraved copper sign, and surrounding shuttered stalls are retained.
<Subject 2> (appears in [Shot 1], [Shot 2]): fully_preserved - the patrons' costuming, modest number, and individual activity are retained across both shots.
<Subject 3> (appears in [Shot 2]): fully_preserved - the raised circular stage, scarlet curtain, flanking cushion wings, and rear sofas are retained.

detailed_description:
Cinematic anime style, refined linework, cool blue night exterior giving way to warm torchlit interior. Every visible patron is engaged in a specific, readable activity, each one with a face and an occupation of their own. The room is only moderately full, around twenty guests in total, and all of them face the same way: the seating forms a wide open arc around the raised circular stage, cushions and rugs along the two side wings for ordinary patrons, a row of raised richly decorated sofas at the back of the room for the wealthier guests, and the stage's rear closed off by the scarlet velvet curtain, leaving the floor immediately around the platform clear. The women among the guests each have their own face and their own outfit, hair worn loose or braided with gold coin headbands, open embroidered caftans varied in colour and cut, their faces and heads uncovered. [Shot 1, 00:00.000–00:07.000] A wide shot down a narrow medina street, the camera pushing in steadily at slow speed just above the heads of <Subject 2> as they walk toward <Subject 1>, the cabaret's low arched door, its small copper sign catching a single torch. Two merchants argue over a folded ledger as they walk, a mercenary shifts a sheathed blade to her hip, a young traveler stamps mud off his sandals and pulls his hood back. The double doors swing inward and a blade of golden light spills across the wet cobbles, widening as the group files through one after another, the camera slowing and holding on the lit doorway once the last of them is inside. A solo oud can be heard from within, thin and distant. Hard cut. [Shot 2, 00:07.000–00:14.000] A wide interior shot of <Subject 3>, camera at standing height along one side of the room and slightly raised, angled so that the near patrons fill the lower half of the frame at close range while the raised circular stage sits at the frame's far side, its scarlet curtain closed behind it. <Subject 2> take their places across the arc: a spice merchant lowers himself onto a cushion with both hands on his knees, a young woman with long braided dark hair and a gold coin headband pours tea for the man beside her and sets the pot down, a mercenary lays two sheathed blades on the rug at his side and rolls his shoulders, a portly guest sinks back into an embroidered sofa at the rear and folds his ringed hands over his belly, a servant crosses the open floor with a tray held high. The camera pushes in slowly and by a small amount as they settle. One after another their heads lift and turn toward the stage, conversation thinning to a low expectant hum as the last of them go still. The unseen oud keeps its slow, melancholic, hypnotic line running underneath.

overall_soundscape:
Wet footsteps and clipped street conversation outside, swelling into a warm layered tavern hum inside — cushions compressing, brass cups set down, cloth rustling, distant kitchen clatter, with an unseen oud running underneath throughout.

non_diegetic_music:
N/A — the oud heard here is diegetic, played live by a musician who stays out of frame.
```

**Notes** — Deux plans de 7 s. Le shot 2 est cadré depuis le côté de la salle, à hauteur d'homme et légèrement surélevé : les figurants du premier rang restent gros dans le cadre (pas de flou basse résolution), la scène occupe le bord opposé, et l'arc de sièges se lit d'un coup. Ni plongée haute, ni point de vue depuis le plateau — les deux angles ont été testés et écartés (le premier écrase les figurants au loin, le second crée une incohérence de mise en scène). Le musicien est hors champ dans tout l'épisode : seul le son du oud le manifeste.
---

## SHOT 2 — PLAN 30 — *L'attente s'installe* (fusion 30+40+50)

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 8 s | 8 s | 24 | full-reference |

**Références (1/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `KEY_salle_avant_extinction` | Salle pleine, lumière chaude — composition et état de départ |

**Prompt**
```text
subject_definitions:
<Subject 1> is the cabaret hall from <Picture 1>, a Moroccan-medina-style room with a raised circular wooden stage at its center backed by a closed scarlet velvet curtain under a horseshoe arch, a low wooden bar counter to one side, upholstered banquettes and low copper tables along both side walls, patterned rugs and cushions on zellige tiling, and two copper lanterns hanging from the arches as the room's only warm light source.
<Subject 2> is the seated audience from <Picture 1>, around twenty patrons in layered robes and turbans, the nearest rows seen from behind in the foreground, all of them settled, motionless and facing the stage.
<Subject 3> is the cabaret's serving staff, two lean young men in plain dark tunics carrying long-handled brass snuffers.

summary:
[reference generation] The target video opens on <Subject 1> at full warmth with <Subject 2> already seated, holds a slow drift toward the stage while <Subject 3> close the two hanging lanterns, and ends with a tight spotlight confined to the stage alone while <Subject 2> remain in frame all around it as dark silhouettes.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - the hall's composition, stage, closed scarlet curtain, bar counter, banquettes, and zellige tiling are retained exactly as framed in the reference.
<Subject 2> (appears in [Shot 1]): fully_preserved - the patrons' seating positions and motionless orientation toward the stage are retained from the first frame to the last, their costuming readable in warm light at the start and their shapes readable as shadowed silhouettes at the end.
<Subject 3> (appears in [Shot 1]): fully_preserved - the servers' plain dark tunics and brass snuffers are retained.

detailed_description:
Cinematic anime style, refined linework, warm sophisticated lighting stepping down once and then narrowing to a single tightly contained spotlight on the stage. The video opens on the exact composition of <Subject 1>, a wide symmetrical view of the hall with the raised circular stage centered under its horseshoe arch and its closed scarlet curtain, <Subject 2> seated all around it and facing it, the nearest rows filling the lower frame from behind. All twenty patrons stay in frame and hold their poses from the first frame to the last; the only things that move in the entire video are the camera, <Subject 3>, and the light itself. [Shot 1] The camera pushes in with small amplitude at slow speed toward the stage and keeps that gentle drift going for the whole video, the framing of <Subject 1> otherwise unchanged and the foreground rows of <Subject 2> staying within the bottom of the frame throughout. At 00:01.500, <Subject 3>, the two servers, step quietly into frame from either side, each stopping beneath one of the hanging copper lanterns. At 00:02.500 both raise their long brass snuffers and lower the caps over the flames together. The two lanterns go out within the same second and the hall's warm light drops by one small notch at that exact moment, a single modest step down rather than a fade, then holds perfectly steady at that lower level while the servers lower their snuffers and withdraw from frame. At 00:05.000 the hall's remaining warmth fades out evenly and without haste, draining from the zellige tiling, the carved columns and the bar counter, every head still turned toward the platform. As the last of the warmth dies, a golden halo blooms into life above the raised circular stage: a hard-edged spotlight beam falling straight down from the lantern above, its warm pool of gold confined to the wooden platform and a narrow ring of tiling at its base, the scarlet curtain glowing dull red behind it. The beam stops there. Everything outside that circle sits in deep blue night shadow, and <Subject 2> stay exactly where they have been sitting since the first frame, reading as dark blue-black silhouettes — the nearest rows still filling the lower frame from behind, their turbans and shoulders cut out in hard shape against the lit floor beyond them, the further rows a ring of shadowed shapes framing the stage, every head turned toward it. The video ends on that state, twenty patrons in the dark around one lit stage, the room silent and waiting.

overall_soundscape:
A low expectant hum of conversation thinning steadily toward silence, faint cloth and cushion sounds from the seated crowd, two soft metallic clicks as the snuffers close together, then a single held silence.

non_diegetic_music:
An unseen oud plays a slow, melancholic, hypnotic solo line, unwinding note by note, slower and thinner, until the last note is muted flat and the sound stops as the halo reaches full brightness.
```

**Notes** — Plan entièrement réécrit après six passes de test, résumé de ce qui a été appris :
- **Un seul `[Shot]`, caméra fixe hormis un léger push-in.** Les versions à deux ou trois plans internes produisaient systématiquement un faux raccord de lumière entre les temps.
- **Extinction en deux événements distincts et datés** (1,5 s / 2,5 s / 5 s) : deux lanternes fermées à la main par deux employés, palier tenu, puis extinction générale. Le vocabulaire de baisse globale (*pool of light retreats*, *steps down*) appliqué en cours de plan faisait plonger toute l'image au noir — remplacé par une consigne d'exposition constante entre les événements.
- **Aucune référence d'état d'arrivée.** `DEC_halo_dore` a été essayé comme état final : le fichier montrant une salle vide, le modèle évacuait le public à la dernière seconde. Le mot `empty` a été retiré du prompt, et la présence des convives est décrite comme une **découpe de silhouettes contre le sol éclairé** plutôt que comme une consigne de conservation.
- **Faisceau borné** au plateau plus un mince anneau de zellige, pour que le public reste en pénombre sans disparaître.
- Le public est immobile de bout en bout : aucun figurant à animer dans ce plan.
- Les deux employés correspondent à l'asset `HUM_employes_salle`, volontairement **non branché en référence** : ils sont de dos, de trois quarts et en pénombre, le texte suffit, et un slot de référence libre vaut mieux qu'une identité de figurant à maintenir.
---

## SHOT 3 — PLAN 60 — *Maya apparaît*

| Durée montage | Durée génération | FPS | Mode | Timecode musique |
|---|---|---|---|---|
| 7 s | 7 s | 24 | full-reference | 0:00–0:07 |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya en pied |
| `<Picture 2>` | `DEC_halo_dore` | Décor, halo doré central |
| `<Picture 3>` | `FX_flammes_danse` | Référence de style pour la gerbe de flammes |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya, the dancer-spy from <Picture 1> — tan skin, striking ruby-red eyes, a deep-red diaphanous costume over a gold-trimmed bodice, gold cuffs and jewelry — standing full-length and motionless.
<Subject 2> is the central golden circular floor from <Picture 2>.
<Subject 3> is the clean, reactive orange-red flame effect from <Picture 3>, tightly curling and quick to extinguish, never billowing or smoking.

summary:
[reference generation] The target video reveals <Subject 1>, motionless at the center of <Subject 2>, as a brief vertical burst of <Subject 3> erupts and the halo flares to full intensity.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - Maya's costume, jewelry, and ruby-red eyes are retained.
<Subject 2> (appears in [Shot 1]): fully_preserved - the golden circular floor and its warm falloff are retained.
<Subject 3> (appears in [Shot 1]): fully_preserved - the flame's clean orange-red color and quick-curling, non-smoking behavior are retained.

detailed_description:
Cinematic anime style, refined linework, warm cinematic contre-jour lighting. [Shot 1] An Italian shot holds on <Subject 2>, the halo still faintly glowing from the silence before, as a brief vertical burst of <Subject 3> erupts from the floor at its exact center, the light flaring outward to full intensity, its glow blending seamlessly into the golden backlight before the flame itself subsides into a faint trail of embers curling near the ground. At its center stands <Subject 1>, Maya, full-length, perfectly still, her deep-red costume and gold-trimmed bodice catching the now-full warm backlight, her ruby-red eyes calm and half-lowered, the last embers fading around her feet. The golden glow reaches full intensity just as a single new melodic note rises, framing her in strong contre-jour with soft rim light along her silhouette, visible clearly from every angle around the open circular floor. She does not move; only the light and the dying flame complete her entrance.

overall_soundscape:
Near silence, broken by a low whoosh as the flame erupts, the faint crackle of returning torchlight, and a held collective breath from the crowd.

non_diegetic_music:
A single sustained instrumental note rises softly at the exact moment the light reaches full intensity, low in the mix.
```

---

## SHOT 4 — PLAN 70+80 — *La danse de feu → l'amorce du saut*

| Durée montage | Durée génération | FPS | Mode | Timecode musique |
|---|---|---|---|---|
| 11 s | 11 s | 24 | full-reference | 0:07–0:18 |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Costume et identité de Maya |
| `<Picture 2>` | `DEC_halo_dore` | Décor, halo doré |
| `<Picture 3>` | `FX_flammes_danse` | Référence de style pour les jaillissements de flamme |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, the dancer-spy — tan skin, ruby-red eyes, a deep-red costume over a gold-trimmed bodice, a draped blue sash at the waist, gold cuffs and ankle jewellery — moving through a full belly-dance sequence.
<Subject 2> is the raised golden circular stage from <Picture 2>, lit as the room's only light source.
<Subject 3> is the reactive orange-red flame effect from <Picture 3> — pale near-white at its core, deepening through orange to red at its jagged tips, fine embers scattering off its edges — bursting upward from the floor wherever her foot lands, each burst rising and dying within a fraction of a second, growing with the force of the step and never lingering as ambient fire or leaving smoke.

summary:
[reference generation] The target video cuts across four viewpoints of <Subject 1> on <Subject 2>: a still low-angle shot of her upper body as she holds the camera's gaze through a slow hip figure-eight, a medium shot given entirely to her serpentine arms, a floor-level contre-plongée on a full-body undulation and turn, and a closing acceleration into a light jump whose landing throws the widest burst of <Subject 3> in the plan.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - Maya's costume, jewellery, face, and continuous dancing motion are retained across all four angles.
<Subject 2> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - the golden stage and its warm falloff are retained.
<Subject 3> (appears in [Shot 2], [Shot 3], [Shot 4]): fully_preserved - the flame's pale-to-red gradient, jagged tips, and instant fade are retained in every burst, scaled to the force of each step.

detailed_description:
Cinematic anime style, refined linework, warm golden light modelling skin and fabric, the audience beyond reduced to blue shadow. From [Shot 2] onward, every time one of <Subject 1>'s feet meets the floor of <Subject 2>, a small burst of <Subject 3> springs upward from the point of contact and dies away within the same breath, so that her footwork writes itself in brief flares of fire that vanish as fast as they appear; the harder the step, the taller the burst. [Shot 1, 00:00.000–00:02.500] A static medium close shot from a low angle, the camera set below her waistline and tilted up at her. The frame holds her whole upper body, from just below her hips to the top of her head, her face fully visible in frame for the entire shot; the camera does not move at any point and her feet stay out of frame. She stays on the same spot and lets a slow, unhurried vertical figure-eight travel through her hips, at roughly half the tempo of a normal dance turn, one hip lifting as the other drops, the coin-heavy sash swaying a beat behind each accent, her shoulders level and still above it. Her chin stays down and her ruby-red eyes look directly into the lens the whole time, a mischievous half-smile at the corner of her mouth, entirely aware of being watched. There is no fire in this shot. [Shot 2, 00:02.500–00:05.500] Hard cut to a medium shot from mid-thigh up, camera at chest height. Her arms are the whole subject of this shot: they unfold into a slow serpentine wave that travels visibly from one shoulder blade, through the shoulder, the elbow, the wrist and out through the fingertips, then reverses and runs back the other way through the opposite arm, the movement passing along her arms like a wave along a rope, repeated twice with her hands drawing long horizontal curves in the air in front of her. Her hips keep a small steady sway underneath, and she takes only a few slow steps in place, each one springing a small burst of <Subject 3> at her feet at the bottom of the frame. [Shot 3, 00:05.500–00:08.500] Hard cut to a strong contre-plongée, the camera resting almost on the floor and looking steeply up at her full standing figure, the golden halo flaring behind her head. She rises onto the balls of her feet and lifts both arms straight overhead, wrists crossing and unfolding, then runs a single slow full-body undulation downward through her whole frame — chest lifting first, ribcage following, belly and hips finishing the wave — her back arching gently as her head tips back and her ponytail falls behind her. Out of that stretched line she launches straight into a sequence of travelling side leaps: she pushes hard off her left leg and carries her whole body sideways through the air toward the right, one leg trailing and one leading, landing on her right foot, then immediately pushes off that leg to travel back to the left, then once more to the right — three low bounding leaps in all, each covering real ground across the stage, her skirt and sash flaring wide with every flight. A burst of <Subject 3> springs upward at each push-off and a second, wider one blooms at each landing, so the leaps stitch a chain of flares across the floor at the base of the frame, lighting her from below. She stays upright and standing throughout, never crouching, never bending toward the floor. [Shot 4, 00:08.500–00:11.000] Hard cut to a low three-quarter shot as her footwork accelerates: three fast driving steps across the stage, each one throwing a taller burst of <Subject 3> than the last, before she gathers her weight and springs into a light quick jump, knees tucking, arms folding in close. She lands cleanly on both feet and the impact throws the widest burst of the whole plan — a broad low flare of fire blooming outward around her from the point of landing and dying back within a breath. She holds the landing, weight low and knees soft, and her eyes cut once across the stage toward the far side of the golden floor, measuring the distance. The video ends on that held look, before any further step is taken.

overall_soundscape:
Sheer fabric snapping with each accent, coin sash and ankle jewellery ringing on the beat, a short crackling whoosh with every footfall as the flames spring and die, a low appreciative murmur running through the unseen crowd, then a deeper whoomph and a soft settling hiss on the landing.

non_diegetic_music:
The full thematic score enters: an oud carrying the melody over a darbouka and riq groove at a moderate tempo, hand percussion locking to every footfall so each flame burst lands on a drum stroke, the pattern tightening into a fast rolling build under the closing steps and resolving on a single heavy beat at the landing.
```

**Notes** — Passe de correction après test vidéo, shot par shot :
- **Shot 1** — « hip height » avait été lu comme un *cadrage* aux hanches, tête hors champ. Remplacé par une consigne de cadre explicite (du dessous des hanches au sommet du crâne, visage visible en permanence, pieds hors champ) et une caméra basse inclinée vers le haut, strictement fixe. Déhanché ralenti à la moitié du tempo, et regard caméra franc avec un sourire espiègle. Aucune flamme ici : la règle de feu ne démarre qu'au shot 2.
- **Shot 2** — le mouvement de bras était purement et simplement ignoré au rendu, noyé sous le tour voyagé. Le tour est supprimé, les bras deviennent le seul sujet du plan, décrits comme une onde qui parcourt l'épaule, le coude, le poignet puis les doigts et repart en sens inverse, répétée deux fois. Cadrage remonté à mi-cuisse pour que les bras tiennent dans l'image.
- **Shot 3** — le cambré arrière partait en pliage vers l'avant, hors sujet. Remplacé par une figure qui ne descend jamais vers le sol : montée sur pointes, bras à la verticale, ondulation complète du buste aux hanches, puis **trois bonds latéraux voyagés** — appui sur une jambe, projection de tout le corps sur le côté, réception sur l'autre, et retour dans l'autre sens. Une gerbe de flamme à chaque impulsion, une plus large à chaque réception, ce qui trace une chaîne de flashs en bas de cadre. Le tour lent sur place a été retiré pour leur laisser la place : il faisait doublon avec le tour voyagé déjà supprimé du shot 2. La consigne « debout tout du long, jamais accroupie, jamais penchée vers le sol » reste écrite en clair.
- **Shot 4** — validé au test, repris sans modification.

**Un écart de règle assumé** : au shot 1, Maya regarde l'objectif. Partout ailleurs dans la fiche (shots 7, 8, 12) son regard s'adresse à la salle, jamais à la caméra. Ici l'adresse directe est voulue — c'est le seul moment du numéro où elle joue pour nous.

**Attention redite** — le shot 8 (plan 120) utilise aussi des frappés de pied qui allument le sol. La différence doit rester nette : ici les gerbes sont **verticales et éphémères**, rien ne subsiste ; là-bas les empreintes **persistent et se relient** pour dessiner le motif zellige. Si le rendu du shot 8 fait des gerbes qui retombent, c'est le mot `holding` de son prompt qu'il faut renforcer.

## SHOT 5 — PLAN 90 — *La tornade de flammes*

| Durée montage | Durée génération | FPS | Mode | Timecode musique |
|---|---|---|---|---|
| 7 s | 7 s | 24 | full-reference | 0:18–0:25 |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Costume et bijoux |
| `<Picture 2>` | `DEC_halo_dore` | Décor lumineux |
| `<Picture 3>` | `FX_flammes_danse` | Référence de style pour l'anneau de flamme |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, her full costume and gold ankle bracelets visible as she gathers speed, launches into a spinning kick with one leg fully extended, and lands in a deliberately alluring finishing pose.
<Subject 2> is the golden circular floor from <Picture 2>.
<Subject 3> is the reactive orange-red flame effect from <Picture 3> — a single continuous ribbon of fire sweeping through a smooth flowing S-curve, its upper edge broken into sharp jagged flame-tip licks, glowing pale near-white at its core and deepening through orange to red toward the tips, fine embers scattering off its trailing edge, capable of wrapping into a tight unbroken ring around a sweeping extended limb before dissipating quickly into scattering embers once the movement stops — never billowing, never leaving smoke.

summary:
[reference generation] The target video cuts hard across three distinct camera angles, timed precisely: <Subject 1> launches diagonally off <Subject 2> in the first two seconds, an arcing camera follows her two-rotation extended-leg spinning kick ringed in <Subject 3> through the jump's parabola from 00:02 to 00:05, then a third angle catches her landing and finishing pose forming as a single simultaneous beat from 00:05 to 00:07.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - Maya's costume, ankle bracelets, and full-body motion are retained across all three angles.
<Subject 2> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - the golden lighting and floor are retained.
<Subject 3> (appears in [Shot 2], [Shot 3]): fully_preserved - the flame's ribbon shape, jagged flame-tip licks, pale-to-red color gradient, and quick dissipation on landing are retained exactly as in the reference.

detailed_description:
Cinematic anime style, refined linework, warm golden lighting intensified by the flame's own glow. [Shot 1, 00:00.000–00:02.000] A static wide shot, camera at a low three-quarter angle, holds on <Subject 1>, Maya, as she glides in diagonally across <Subject 2>, gathering speed with quick grounded strides, plants sharply on one leg, and visibly launches upward off the ground — her feet are still clearly seen leaving the floor in the shot's final frame, proving the takeoff before the cut. Hard cut, no camera continuity into the next shot. [Shot 2, 00:02.000–00:05.000] A closer profile shot picks her up already airborne. Rather than a flat lateral track, the camera itself follows an arcing path through space — rising in a curved sweep as she climbs toward the peak of her jump, then curving back down as she descends — mirroring the parabola of the leap itself rather than sliding flat alongside her. Within this arc, she snaps one leg fully extended outward into a spinning kick, her whole body rotating at roughly triple the speed of a normal dance turn — a tornado-fast whirl, not a graceful arc — completing exactly two full rotations in a tight, blurred near-continuous spin while airborne, the extended leg and its trailing flame smearing into a solid glowing ring rather than a visible looping ribbon, the deep-red skirt snapping taut and blurring with the speed, her gold ankle bracelet reduced to a bright streaking blur, <Subject 3>'s jagged flame-tip licks whipping so fast along the ring's outer edge that they blend into a continuous churning band with fine embers flung outward behind it. Hard cut on her descent, before her foot touches the floor. [Shot 3, 00:05.000–00:07.000] A third angle, slightly lower three-quarter, catches the instant her foot touches the floor: the rotation stops dead in that same frame — no residual drift, no extra half-turn — and she is already settled into the finishing pose in the same beat, weight on one leg planted to the side, the other leg extended along the floor, hip cocked, torso arching back slightly, chin tilted down with a slow, knowing half-smile. Landing and pose read as one unified instant, never two separate beats. <Subject 3>'s ring of flame unwinds outward in a single sweeping burst of scattering embers that fades within a breath.

overall_soundscape:
Gold ankle bracelets blur into a single high-pitched ringing streak through the tripled-speed rotation, a sharp rising whoosh of wind and a tightening crackle-hiss as the flame ring churns, then a soft controlled landing thud landing in the exact same instant as the embers' brief hiss.

non_diegetic_music:
The oud-and-darbouka theme intensifies through the launch, a driving percussive hit landing precisely at 00:02 (takeoff), 00:05 (rotation's completion), and 00:07 (landing).
```

**Notes** — Trois coupes franches à des timecodes fixes (00:00–00:02 / 00:02–00:05 / 00:05–00:07), explicitement décrites comme des « hard cut » sans continuité de caméra entre elles — c'est ce qui doit empêcher H3 de lisser les trois temps en un seul mouvement continu. Le shot 2 est explicitement décrit comme une caméra qui arque (monte puis redescend avec la parabole du saut) plutôt qu'un travelling latéral plat, pour casser l'impression de « glissade ». Vitesse de rotation du shot 2 explicitement fixée à ~3x une rotation de danse normale (effet saut-tornade, jambe et flamme qui se fondent en un anneau flou) tout en gardant le compte à exactement deux rotations — la vitesse vend l'impression tornade, pas un tour supplémentaire. Le shot 3 fusionne volontairement atterrissage et pose dans le même instant. Chorégraphie contrainte à un coup de pied tournant jambe tendue (pas un vissage corps replié) pour éviter l'effet toupie/marionnette constaté en test. Description de `<Subject 3>` alignée sur l'asset validé (ruban en S, pointes de flamme, cœur clair vers pointes rouges, étincelles).

---

## SHOT 6 — PLAN 100 — *Le public exulte (1)*

| Durée montage | Durée génération | FPS | Mode | Timecode musique |
|---|---|---|---|---|
| 5 s | 5 s | 24 | full-reference | 0:25–0:30 |

**Références (2/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `HUM_clients_auberge` | Spectateurs qui exultent |
| `<Picture 2>` | `DEC_halo_dore` | Source de lumière directionnelle unique, hors champ |

**Prompt**
```text
subject_definitions:
<Subject 1> is the crowd of patrons from <Picture 1>, packed close together, filling the entire frame with no performance visible at any point.
<Subject 2> is the golden circular floor's light from <Picture 2>, acting purely as a single hard directional light source striking the crowd from off-frame — never shown itself, never the subject of the shot.

summary:
[reference generation] The target video holds a tight, crowd-only shot on <Subject 1>, erupting with genuine joy, lit solely by the directional spill of <Subject 2> from off-frame while everything beyond that light falls into deep shadow.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - the patrons' identities and reactions are retained, framed tightly enough that no wider room geometry is visible.
<Subject 2> (appears in [Shot 1]): partially_preserved - only used as an off-frame directional light source striking faces from one side; the halo, stage, and dancer are never in frame.

detailed_description:
Cinematic anime style, refined linework, a single hard wash of warm golden light cutting across the crowd from one side of the frame, sourced entirely off-frame — no torches, no lanterns, no architecture readable, only bodies and faces caught in that one directional spill, everything behind and around them lost in deep near-black pénombre. [Shot 1] A tight, crowd-filling static shot holds exclusively on <Subject 1>, patrons crammed shoulder to shoulder, half their faces lit by the hard off-frame glow and half lost in shadow, the performance itself never entering the frame. Genuine, unruly joy breaks out: several leap fully to their feet, arms thrown up, mouths open in delighted shouts, hands slamming together in wild uneven applause rather than a polite rhythm, a few gripping each other's shoulders in shared excitement, cups raised and sloshing, bodies leaning and surging toward the light as if pulled by it. The tight framing and packed density read as a wall of raw reaction, not a wide establishing shot of a room.

overall_soundscape:
A sudden eruption of cheering, whooping, and ragged uneven applause, cups and jewelry clattering as bodies surge and rise, sharp individual exclamations breaking above the general roar.

non_diegetic_music:
The oud-and-darbouka theme continues audibly from off-frame, intensified tempo, mostly buried under the crowd's noise.
```

**Notes** — Repartir sur un cas volontairement simple après le premier essai raté (le rendu ressemblait à une scène de conseil calmement éclairée, sans pénombre ni réaction franche) : caméra qui ne montre plus jamais Maya ni la scène, cadrage serré et dense sur le public uniquement, une seule source de lumière dure venant du hors-champ (jamais de torches/architecture visibles pour éviter que le modèle recrée une salle entière éclairée), et une réaction beaucoup plus débordante qu'un applaudissement poli en rythme.

---

## SHOT 7 — PLAN 110 — *Le regard qui compte*

| Durée montage | Durée génération | FPS | Mode | Timecode musique |
|---|---|---|---|---|
| 7 s | 7 s | 24 | full-reference | 0:30–0:37 |

**Références (4/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, sujet principal du regard |
| `<Picture 2>` | `KEY_garde_penombre` | Le garde déjà en place, adossé à une colonne, plan américain — référence directe pour le shot 2 |
| `<Picture 3>` | `HUM_silhouettes_sombres` | Cible du second coup d'œil |
| `<Picture 4>` | `DEC_halo_dore` | Décor lumineux pour les plans de Maya |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, mid-dance within the golden circular floor, her eyes able to flick briefly toward the room without breaking her movement.
<Subject 2> is the massive, watchful man already staged in the scene from <Picture 2> — leaning against a carved stone column in a dim blue-toned corridor near the bar, arms crossed, already framed close in a tight American shot (waist-up). This is the exact starting frame for his shot: his pose, the column, and the lighting are already correct, nothing needs to be invented or recomposed.
<Subject 3> is the two motionless silhouetted figures from <Picture 3>, seated together in the room's darkest corner.
<Subject 4> is the golden circular floor from <Picture 4>, the warm light source anchoring Maya's shots.

summary:
[reference generation] The target video cuts hard between four shots: <Subject 1> dancing as her gaze flicks toward <Subject 2>, a revealing push-in on <Subject 2> alone in the shadows ending on his disgusted grimace, <Subject 1> dancing again as her gaze flicks the other way, and a final revealing push-in on <Subject 3> alone in the shadows as they simply look away and return to their own business.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 3]): fully_preserved - Maya's dance movement and composed expression are retained across both her shots.
<Subject 2> (appears in [Shot 2]): fully_preserved - his build, scarring, pose, and corridor setting are retained directly from the keyframe, now shown as the sole subject of his own shot.
<Subject 3> (appears in [Shot 4]): fully_preserved - their veiled silhouettes and stillness are retained, now shown as the sole subjects of their own shot.
<Subject 4> (appears in [Shot 1], [Shot 3]): fully_preserved - the golden lighting anchors both of Maya's shots.

detailed_description:
Cinematic anime style, refined linework, warm golden lighting for Maya's shots giving way to near-total pénombre for the reveal shots — the room's only light in those becomes a thin, cool spill bleeding in from the distant stage, everything else lost in shadow. [Shot 1, 00:00.000–00:00.750 — brief, do not linger] A close shot holds on <Subject 1>, Maya, mid-dance within <Subject 4>. Her eyes flick once toward screen-left; nothing else changes, no new dance movement begins. Hard cut immediately at the end of this half-second, no lingering. [Shot 2, 00:00.750–00:03.250 — hold for its full 2.5 seconds, this shot is not rushed] The cut lands directly on <Picture 2>'s exact framing — <Subject 2> already staged mid-shot, pose and corridor and lighting already correct, nothing recomposed or reinvented. The camera's distance to him never changes for the whole shot, this is a lateral pan only, never a push-in or dolly toward him, he must not appear to be rushed or charged at. He holds completely still and close for a full first second, letting the cut register, before the camera begins a slow, deliberate horizontal pan from right to left across the frame, paired with a slight low-angle contre-plongée, continuing the same leftward momentum established by Maya's glance. As the pan settles, his expression curdles into open, unmistakable disgust — a curled lip, a hard narrowing of the eyes — held on screen for the shot's final half-second. Hard cut back to Maya, no camera continuity. [Shot 3, 00:03.250–00:04.000 — brief, do not linger] A close shot holds on <Subject 1> again, still dancing within <Subject 4>, her head turning the other way this time, eyes flicking once toward screen-right; nothing else changes. Hard cut immediately at the end of this half-second. [Shot 4, 00:04.000–00:07.000 — hold for its full 3 seconds, this is the longest shot in the plan and must not be cut short] The cut lands directly on a static Italian shot of <Subject 3> alone in their dark corner, already at final framing distance from the very first frame — again the camera's distance to them never changes, lateral pan only, never a push-in. They hold still and close for a full first second before the camera pans slowly in the inverse direction, left to right, with the same slight low-angle contre-plongée, continuing the rightward momentum established by Maya's second glance. Partway through the pan, the two figures simply look away — eyes dropping from Maya's direction down toward their own low table, no lean toward each other, no proximity — and settle back into their own quiet business, one reaching for his cup, the other glancing back down at his hands, faces still hidden beneath their wrapped veils, utterly indifferent to her now. The shot lingers on their return to stillness for the remainder of its full three seconds — no cut back to Maya, the plan ends here.

overall_soundscape:
The crowd's ambient murmur and clapping continue faintly under Maya's two shots, dropping away to near silence in the two reveal shots, replaced by the man's low disgusted exhale and, in the final shot, only the faint clink of a cup as the two figures settle back into their own quiet stillness.

non_diegetic_music:
The oud-and-darbouka theme continues under Maya's shots, dropping low and distant under the two reveal shots as if heard from farther across the room.
```

**Notes** — Réécrit en 4 shots avec hard cuts explicites après un premier essai qui tenait tout en un seul `[Shot]` continu, sans raison pour le modèle de couper sur les réactions. Deuxième passe : cut sur plan italien déjà statique, travelling calé sur le sens du regard de Maya. Troisième passe : constat sur test vidéo que H3 ignore les timecodes bruts et rallonge les plans de Maya (~3s au lieu d'1s) au détriment des deux reveals, en plus de « foncer » sur le garde façon push-in au lieu d'un pan propre. Corrections : durées réparties en 0.75s/2.5s/0.75s/3s avec consignes explicites par shot, et interdiction explicite du push-in/dolly sur les deux reveals. Quatrième passe (celle-ci) : remplacement de la fiche neutre `HUM_homme_massif` par `KEY_garde_penombre`, une frame extraite directement du test vidéo qui montre le garde déjà en place dans le bon décor, la bonne pose et la bonne lumière — le modèle n'a plus rien à imaginer pour ce shot, seulement à tenir le cadre puis paner. Même logique disponible pour les silhouettes encapuchonnées si besoin (frame extraite existante, mais son éclairage est plus proche d'un éclairage chaud que de la pénombre voulue — à valider avant de l'utiliser telle quelle). Repositionne l'homme massif « adossé à un mur, près du bar » plutôt que « posté au bar » pour concilier ta direction et la continuité du registre — à trancher si besoin. Casse volontairement la logique de pure retenue partagée avec le plan 330 (voir notes plus bas) : ici on montre explicitement les réactions des deux cibles, alors que le plan 330 reste purement interne à Maya, sans reveal. Dis-moi si le plan 330 doit suivre le même principe ou rester en contrepoint.

---

## SHOT 8 — PLAN 120 — *Le zellige de feu*

| Durée montage | Durée génération | FPS | Mode | Timecode musique |
|---|---|---|---|---|
| 11 s | 11 s | 24 | full-reference | 0:37–0:48 |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, frappés et pas rapides |
| `<Picture 2>` | `DEC_halo_dore` | Décor lumineux, sol de la scène |
| `<Picture 3>` | `FX_flammes_danse` | Référence de style pour les lignes de feu |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, striking the stage floor with her heels and cutting fast footwork patterns across it.
<Subject 2> is the raised golden circular stage from <Picture 2>.
<Subject 3> is the reactive orange-red flame effect from <Picture 3> — pale near-white at its core, deepening through orange to red at its jagged tips, fine embers scattering off its edges — here running low and flat along the floor as burning lines that spread from one footfall to the next and fade to embers once the movement stops.

summary:
[reference generation] The target video cuts across four viewpoints: a floor-level close view of <Subject 1>'s heel strikes igniting footprints of <Subject 3>, a wide side view as her footwork joins them into spreading lines of fire, a direct overhead view revealing the completed eight-pointed star burning across <Subject 2>, and a low close view as the pattern flares upward into a rising ring around her.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - Maya's costume, jewellery, and footwork are retained across all four angles.
<Subject 2> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - the golden stage and its circular shape are retained.
<Subject 3> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - the flame's pale-to-red gradient, jagged tips, and quick fade to embers are retained, transposed into low flat lines running along the floor.

detailed_description:
Cinematic anime style, refined linework, warm golden light with the floor itself becoming the brightest surface in frame. [Shot 1, 00:00.000–00:03.000] A close shot at floor level, camera low and looking across the boards of <Subject 2>, catches <Subject 1>'s feet. Her heel comes down hard on the beat and a small print of <Subject 3> blooms where it lands, burning low and holding. She strikes again, and again, faster, each footfall leaving another glowing mark, her ankle jewellery ringing with every impact. Hard cut. [Shot 2, 00:03.000–00:06.500] A wide side shot follows her at moderate speed as she cuts rapid footwork across the stage, spinning through quick quarter-turns; behind each step a line of <Subject 3> races along the floor from the previous mark to the new one like a lit fuse, the burning lines crossing and branching outward, her red skirt sweeping just above them and catching their light from below. Hard cut. [Shot 3, 00:06.500–00:09.000] A direct overhead shot, camera high above and looking straight down at <Subject 2>, reveals what her steps have been drawing: an eight-pointed zellige star of burning lines filling the circular stage, geometric and symmetrical, Maya at its exact center with her arms opening outward and her skirt settling around her. The pattern completes as the last line closes its final branch. Hard cut. [Shot 4, 00:09.000–00:11.000] A close low-angle shot from stage level, looking slightly up at <Subject 1>. The whole burning pattern flares at once and lifts off the floor into a rising ring of flame that climbs around her body and passes over her head, brightening the frame to its warmest point before it thins into a wide scatter of drifting embers. She lifts her chin out of the light with an amused, knowing half-smile, her gaze cast out toward the crowd rather than the camera, the floor beneath her going dark and quiet again.

overall_soundscape:
Sharp heel strikes on wood ringing with ankle jewellery, a low spreading hiss as each line of fire runs along the floor, a deep upward whoosh as the pattern lifts, then a soft crackle of settling embers under a rising roar from the crowd.

non_diegetic_music:
The theme drives hard on the heel strikes, percussion locking to each footfall, a full-ensemble accent landing exactly on the overhead reveal and a final sustained chord on the rising ring.
```

**Notes** — Ne remplace plus le saut spirale mais le **prépare** : le saut a été réintégré juste après, au plan 125, et l'anneau montant qui clôt ce plan devient son impulsion. Le feu change ici de grammaire — il ne tourne plus autour d'elle, il reste au sol et dessine. Le motif zellige à huit branches raccorde le don de Maya à l'architecture du lieu, ce qui le fait passer pour un artifice de scène encore plus facilement dans l'univers. Le vrai coup de théâtre est le plan en plongée : le public de la salle ne voit qu'un sol qui brûle en désordre, nous seuls voyons le motif. Bonus technique : plus de saut, donc plus de risque d'inversion ni de rotation qui dérape, les deux bugs qui ont déjà coûté des passes aux plans 90 et 140. Plan porté à 11 s : les quatre temps (frappés, tracé, révélation en plongée, embrasement) respiraient mal en 7 s, la révélation du motif en particulier avait besoin d'être tenue.

**Alternative gardée en réserve pour un autre plan** — *le voile de feu* : elle saisit le pan de tissu bleu, le fait claquer en grand arc horizontal, la flamme court le long du tissu et forme un rideau de feu qui traverse le cadre ; elle disparaît derrière et réapparaît de l'autre côté à la retombée. Même durée, quatre temps, aucune spirale.

**Asset optionnel** — `FX_zellige_feu`, motif de feu au sol seul vu du dessus, sans personnage dans le cadre (même règle que `FX_flammes_danse`). Utile pour le shot 3 si le motif ne tient pas au texte seul.
---

## SHOT 9 — PLAN 125 — *Le saut tourbillon*

| Durée montage | Durée génération | FPS | Mode | Timecode musique |
|---|---|---|---|---|
| 7 s | 7 s | 24 | full-reference | 0:48–0:55 |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya en saut |
| `<Picture 2>` | `DEC_halo_dore` | Décor lumineux |
| `<Picture 3>` | `FX_flammes_danse` | Référence de style pour le tourbillon et l'onde de choc |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, her costume and identity retained through a four-part spiral jump sequence: an upward launch already spinning around her own vertical axis, a suspended peak still turning seen from directly above, a controlled dive back down continuing the same rotation, and a landing impact where the spin stops dead.
<Subject 2> is the golden circular stage from <Picture 2>.
<Subject 3> is the reactive orange-red flame effect from <Picture 3> — capable of spiraling into a tightening helix around her rotating body through the launch and fall, and pulsing outward into a single expanding shockwave ring across the ground on impact, always dying with the movement that made it, never lingering as ambient fire.

summary:
[reference generation] The target video cuts across four shots: a low contre-plongée as <Subject 1> launches upward off <Subject 2> out of the ring of fire still rising around her, already spinning into a spiral jump wrapped in a helix of <Subject 3>, a direct overhead plongée at the suspended peak still turning, a controlled dive back down continuing the same rotation, and a tight impact shot where the spin stops dead and a shockwave ring of <Subject 3> pulses outward as she lands with an amused smile toward the crowd.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - Maya's costume, identity, and full-body motion are retained across all four angles.
<Subject 2> (appears in [Shot 1], [Shot 2], [Shot 4]): fully_preserved - the golden lighting and floor are retained.
<Subject 3> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - the flame's spiral-to-shockwave behavior is retained exactly as it dies with each beat of the movement.

detailed_description:
Cinematic anime style, refined linework, warm golden lighting intensified by the flame's own glow. [Shot 1, 00:00.000–00:01.500] An extreme low-angle contre-plongée, camera near floor level looking almost straight up, opens on the tail of a ring of <Subject 3> still climbing around <Subject 1>, Maya, from the previous beat. She drives off <Subject 2> and rises straight up through it, already spinning around her own vertical axis as she climbs — a spiral jump, not a straight leap — <Subject 3> winding upward around her body in a tightening helix that follows the rotation, her fabric snapping into the spin's line as she climbs past the top of the frame. Hard cut. [Shot 2, 00:01.500–00:03.200] A direct overhead plongée, camera positioned high above looking straight down, catches her still turning at the peak of her jump within the golden stage's glow, the flame spiral fanned out around her in a radial spin, her hair and fabric trailing the rotation in the same instant of weightlessness. Hard cut. [Shot 3, 00:03.200–00:04.700] A tracking shot picks up her controlled dive back down toward the stage, the same rotation continuing unbroken through the fall, body angled downward with purpose, <Subject 3>'s spiral tightening further around her as she drops, the golden floor rushing up to fill the frame. Hard cut. [Shot 4, 00:04.700–00:07.000] A tight shot at floor level catches the instant of landing: her feet touch down and the rotation stops dead in the same frame — no residual spin, no extra half-turn — as a single ring of <Subject 3> pulses outward from the point of impact, rippling once across the golden floor like a shockwave before dying out at its edge. She rises out of the landing crouch with an amused, knowing smile, her gaze cast out toward the crowd rather than the camera — a playful punctuation to the move, not a triumphant pose.

overall_soundscape:
A sharp rising whoosh through the launch, a brief held silence at the weightless peak, a growing rush of wind through the dive, then a deep percussive thud and a sizzling crackle as the shockwave ring washes outward.

non_diegetic_music:
The theme surges through the launch, drops out almost entirely under the overhead shot, builds again through the dive, and lands a driving percussive hit exactly on the impact.
```

**Notes** — Réintégration du saut spirale, qui avait été remplacé par le zellige de feu et se retrouve finalement **après** lui plutôt qu'à sa place. L'enchaînement est meilleur que dans les deux versions précédentes : le zellige se referme en anneau montant, et cet anneau devient l'impulsion du saut — le shot 1 s'ouvre explicitement sur la fin de cette gerbe, donc les deux plans se raccordent par le feu et non par une simple coupe. Rotation continue du décollage à l'atterrissage, figée net dans la même frame que le contact au sol (même règle qu'au plan 90). Le sourire final s'adresse à la salle, jamais à la caméra. Numéroté 125 pour s'insérer entre 120 et 130 sans casser la numérotation source.

## SHOT 10 — PLAN 130 — *Le public exulte (2)*

| Durée montage | Durée génération | FPS | Mode | Timecode musique |
|---|---|---|---|---|
| 5 s | 5 s | 24 | full-reference | 0:55–1:00 |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `HUM_marchand_riche` | Riche marchand indien |
| `<Picture 2>` | `DEC_halo_dore` | Reflet de lumière |
| `<Picture 3>` | `PROP_main_marchand_piece` | Position exacte des doigts pour l'insert du shot 2 |

**Prompt**
```text
subject_definitions:
<Subject 1> is the wealthy Indian merchant patron from <Picture 1>, portly and richly dressed, seated on one of the lounge sofas near the golden circular floor, rings crowding his fingers.
<Subject 2> is the golden circular floor's light spill from <Picture 2>.
<Subject 3> is the exact finger position from <Picture 3> — a gold coin pinched between thumb and forefinger, the thumb cocked back against the coin's edge, loaded like a slingshot.

summary:
[reference generation] The target video cuts hard between two shots: a tight close-up on <Subject 1>'s satisfied smirk as he stays seated, and an extreme close-up insert of his hand in <Subject 3>'s exact grip flicking the coin toward the stage with his thumb, like a slingshot.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - the merchant's face, rings, and hand are retained across both shots.
<Subject 2> (appears in [Shot 2]): partially_preserved - only its warm light spill registers on the coin and hand.
<Subject 3> (appears in [Shot 2]): fully_preserved - the exact grip and thumb position are retained from the reference, not reinvented.

detailed_description:
Cinematic anime style, refined linework, warm reflected lighting. [Shot 1, 00:00.000–00:02.500] A tight close-up frames <Subject 1>'s face alone, the wealthy Indian merchant, still seated on his cushioned sofa, making no move to rise. A satisfied smirk spreads across his lips, self-assured and pleased with himself, eyes fixed unblinking on the dancer, one eyebrow raised. Hard cut, no camera continuity. [Shot 2, 00:02.500–00:05.000] An extreme close-up insert holds on empty air at the edge of the frame as <Subject 1>'s bejeweled hand enters from off-screen, already in <Subject 3>'s exact grip — the coin pinched between thumb and forefinger, thumb already cocked back, nothing to reinvent. With a sharp flicking motion — the thumb released like a slingshot rather than an underhand toss — he catapults the coin out of frame toward the stage, his rings catching the spill of <Subject 2> for a single bright flash as the coin leaves his fingers.

overall_soundscape:
A sharp metallic flick and a whistling flick of the coin through the air, then a bright tinkle as it lands, layered under a burst of nearby exclamations and applause.

non_diegetic_music:
The oud-and-darbouka theme continues from off-frame at its intensified tempo, unchanged.
```

**Notes** — Il ne se lève plus (contrairement à la version précédente) : le rictus satisfait suffit à vendre son plaisir, pas besoin qu'il se redresse. Deuxième shot pensé comme un insert pur (main + pièce uniquement, jamais son visage) pour bien vendre le geste de pichenette au pouce plutôt qu'un lancer classique. Ajout de `PROP_main_marchand_piece` en référence directe de la prise en main — évite qu'H3 improvise une position de doigts générique sur un geste qui n'a rien d'évident à décrire en texte seul. Timecodes explicites par shot après les corrections apprises sur les plans 90/110/120.

---

## SHOT 11 — PLAN 140+150 — *La pluie de pièces et le tourbillon de flammes*

| Durée montage | Durée génération | FPS | Mode | Timecode musique |
|---|---|---|---|---|
| 14 s | 14 s | 24 | full-reference | 1:00–1:14 |

**Références (5/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya en danse, préparation, tour puis réception |
| `<Picture 2>` | `PROP_dague_maya` | Détail de la dague exposée |
| `<Picture 3>` | `DEC_halo_dore` | Décor lumineux |
| `<Picture 4>` | `FX_flammes_danse` | Référence de style pour le ruban en huit et l'anneau de flamme |
| `<Picture 5>` | `KEY_reception_pose` | Pose de réception exacte (assise, jambe pliée/jambe tendue) — référence directe pour le shot 4 |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, dancing as coins arc past her, then gathering into a fast standing turn, then settling into a seated floor pose.
<Subject 2> is the short combat dagger from <Picture 2>, normally hidden beneath the leather strap at her waist.
<Subject 3> is the golden circular floor from <Picture 3>.
<Subject 4> is the reactive orange-red flame effect from <Picture 4> — capable of trailing in a continuous ribbon from a sweeping hand or wrist, crossing into a figure-eight, and snapping into a bright ring that bursts into scattering embers once the movement stops.
<Subject 5> is the exact landing pose from <Picture 5> — seated low, one leg bent with the knee raised and the forearm resting across it, the other leg fully extended straight out to the side, the free hand planted on the floor near the hip for support.

summary:
[reference generation] The target video cuts hard across four shots: coins arc toward <Subject 1> as she dances within <Subject 3>, her steps flow without pause into a gathering wind-up, a closer shot catches her snapping into one fast standing turn with <Subject 4> trailing from her wrists into a crossing figure-eight, the momentum flaring her skirt and sash wide enough to reveal <Subject 2> for an instant, and a final shot catches her settling into <Subject 5>'s exact seated pose.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - Maya's costume, identity, and motion are retained across all four beats, always upright, never inverted.
<Subject 2> (appears in [Shot 3]): fully_preserved - the dagger's shape, sheath, and leather strap are retained at the instant it is exposed.
<Subject 3> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - the golden lighting is retained throughout.
<Subject 4> (appears in [Shot 3]): fully_preserved - the flame's ribbon-to-ring behavior is retained exactly as it dies with the movement.
<Subject 5> (appears in [Shot 4]): fully_preserved - the exact seated pose, leg positions, and hand placement are retained directly from the reference, not reinvented.

detailed_description:
Cinematic anime style, refined linework, warm golden lighting intensified by the flame's own glow, with a brief slow-motion emphasis at the turn's peak. [Shot 1, 00:00.000–00:03.000] A wide shot holds on <Subject 1>, Maya, mid-dance at the center of <Subject 3>, as gold coins arc in one after another from every direction around the room, thrown by unseen admirers in the crowd, catching the golden light as they cross the frame around her — she never catches or acknowledges them, they simply punctuate the room's fervor. Hard cut. [Shot 2, 00:03.000–00:06.000] A medium shot holds on <Subject 1>, still dancing without ever fully stopping — the last coin's arc still crossing past her — as her steps flow directly into a gathering wind-up, arms drawing back and in, weight coiling toward one side; there is no held pause, no static beat, the wind-up itself is already the start of the turn. Hard cut into a closer framing exactly as the turn begins — no camera continuity. [Shot 3, 00:06.000–00:10.000] A closer three-quarter shot, camera held at a fixed distance and angle throughout — she is never inverted, never shown upside-down, always upright and facing roughly toward the camera's side of the room — holds on <Subject 1> as she snaps into one fast standing turn, both wrists trailing <Subject 4> into a crossing figure-eight in front of and behind her body. At the rotation's peak, the motion slows perceptibly: the centrifugal force flares her skirt and the blue sash wide open, and between two dark folds of fabric, <Subject 2>, the short combat dagger held against a leather strap at her waist, catches a nearby candle's light in a sharp glint of steel. In the same instant, the flame ribbons snap into a bright ring around her before bursting outward into scattering embers. The music itself briefly slows with the image, a faint metallic ring sounding as the blade flashes. Hard cut as the turn completes, no camera continuity. [Shot 4, 00:10.000–00:14.000] A wider shot, new angle, catches the tempo and motion snapping back to normal speed as she sinks fluidly into <Subject 5>'s exact seated pose: settling low to the golden floor, one leg bent with the knee raised and her forearm resting loosely across it, the other leg extended fully straight out to the side, her free hand planted flat on the floor near her hip for support, torso upright with a slight confident lean. The sash falls back into place over the now-hidden dagger. A playful, mischievous smile spreads across her face as she holds the pose for a beat before rising back into the dance's normal tempo, giving no sign of what was briefly glimpsed.

overall_soundscape:
Bright metallic tinkling as coins arc through the air from all sides, fabric snapping taut through the turn, a rising crackle-hiss as the flame ribbons tighten into a ring, a brief sharp metallic chime coinciding with the blade's glint, then a soft hiss as the embers scatter, absorbed into continuing applause.

non_diegetic_music:
The theme continues under the coin-throw and the wind-up, briefly slows and thins to a single sustained note at the turn's peak, then snaps back to its intensified tempo as she settles into the seated pose, no trace of the earlier slowdown.
```

**Notes** — Remplace le salto (bug d'inversion non résolu malgré plusieurs passes de correction — voir historique ci-dessous). Reprend la mécanique de rotation debout qui a déjà fait ses preuves aux plans 90 et 120 (jamais d'inversion, jamais de dos montré puis reperdu) plutôt que de continuer à batailler avec un mouvement que le modèle ne sait visiblement pas exécuter. Le ruban en huit aux mains, un temps envisagé pour le plan 120 puis abandonné au profit du saut spirale, trouve ici sa place — jamais utilisé jusque-là, donc aucune redite. Exploite le don de feu de Maya pour le geste le plus spectaculaire du numéro plutôt qu'une pure prouesse acrobatique. `KEY_reference_salto` et `KEY_maya_dos_renverse` restent dans le registre (potentiellement réutilisables ailleurs) mais ne sont plus utilisés dans ce plan. Durée toujours à 14s, redécoupée en 3s/3s/4s/4s ; pas de nouvelle cascade.

**Historique du salto abandonné** : (1) ajout pluie de pièces + préparation, (2) suppression du temps d'arrêt avant le saut, (3) cut au décollage + plan de côté serré pour la lame, (4) bug identifié — retour de face pendant l'inversion, dû à une vidéo de référence en split-screen ; fix en recadrant sur le seul panneau profil, (5) ajout d'une ancre image du point d'inversion (`KEY_maya_dos_renverse`) — bug toujours présent malgré tout ça, ce qui pointe vers une limite du modèle sur les inversions complètes plutôt qu'un problème de référence. D'où l'abandon complet du salto pour cette rotation debout.

---

## SHOT 12 — PLAN 160+170 — *La révérence → le clin d'œil → sortie*

| Durée montage | Durée génération | FPS | Mode | Timecode musique |
|---|---|---|---|---|
| 8 s | 8 s | 24 | full-reference | 1:14–1:22 |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, révérence, clin d'œil, sortie |
| `<Picture 2>` | `DEC_halo_dore` | Décor, scène et halo |
| `<Picture 3>` | `PROP_rideau_velours` | Rideau écarlate de scène |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, taking her bow, delivering a wink, then spinning once and withdrawing.
<Subject 2> is the raised golden circular stage from <Picture 2>, its light rising from near-darkness back to full warm intensity.
<Subject 3> is the heavy scarlet velvet stage curtain from <Picture 3>, hanging in deep vertical folds at the back of the stage.

summary:
[reference generation] The target video cuts across three shots: <Subject 1> bowing to the audience on <Subject 2> as the light comes back up around her, an extreme close-up as she winks straight into the lens, and a wide shot of her final rotation before she slips through <Subject 3>.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - Maya's costume, jewellery, face, and motion are retained across all three shots.
<Subject 2> (appears in [Shot 1], [Shot 3]): fully_preserved - the golden stage is retained, its lighting rising from dim to full.
<Subject 3> (appears in [Shot 3]): fully_preserved - the curtain's scarlet velvet, heavy folds, and golden trim are retained.

detailed_description:
Cinematic anime style, refined linework, warm golden lighting rising out of near-darkness and settling at full intensity. [Shot 1, 00:00.000–00:02.500] A medium wide shot faces <Subject 1>, Maya, standing at the center of <Subject 2>, the stage still dim from the last beat of her number, only a faint glow left on her shoulders. She folds forward into a deep bow toward the audience, one arm sweeping across her waist and the other opening out to the side, her ponytail falling forward past her shoulder. The stage light surges back up around her as she begins to fold, the golden halo racing from that faint residue to full warm intensity within the first second of the shot, well before she reaches the bottom of the bow, so that she holds it fully lit, head lowered. Hard cut. [Shot 2, 00:02.500–00:04.500] An extreme close-up on Maya's face, filling the frame, her chin lifting into the light. She looks straight down the lens and delivers a slow, deliberate wink, one eye closing and reopening unhurried, her lips curling into a knowing half-smile as it lands. Nothing else moves in the frame. Hard cut. [Shot 3, 00:04.500–00:08.000] A wide shot of <Subject 2> from the front of the stage. <Subject 1> spins through one last full rotation on the spot, her deep-red skirt and blue sash flaring into a wide arc of colour, then steps cleanly out of the turn and walks away from camera toward <Subject 3>, the scarlet velvet curtain at the back of the stage. She parts the heavy fabric with one hand and slips through it without looking back, the folds swinging closed behind her. The golden light dims down to a soft afterglow on the empty stage as the hall falls into a sudden, cathedral-like hush.

overall_soundscape:
The crowd's applause and shouts swelling as she bows, peaking through the wink, then falling away sharply into near-total silence as the curtain settles behind her.

non_diegetic_music:
The theme carries the bow at full intensity, holds through the wink, then resolves into a final sustained chord as she exits, oud and percussion fading together into silence.
```

**Notes** — Plan ramené de 11 s à 8 s (2,5 / 2 / 3,5) : la révérence n'a pas besoin d'être tenue longtemps, et le rythme de sortie y gagne. Le regard vers le riche marchand est supprimé : le clin d'œil s'adresse maintenant à la caméra, donc l'asset `HUM_marchand_riche` sort des références du plan (il reste utilisé au shot 9, plan 130). Trois temps nets séparés par des coupes franches — révérence, clin d'œil, sortie — plutôt que deux `[Shot]` fondus l'un dans l'autre.

La remontée de lumière est rapide et calée sur un repère de geste : pleine intensité **dans la première seconde**, dès qu'elle commence à se plier, largement avant le bas de la révérence. Un repère de mouvement tient mieux qu'une consigne de durée, qu'H3 ignore.

Le très gros plan du clin d'œil est volontairement tenu sur `CHAR_maya` seul, sans `CHAR_maya_yeux` : cet asset porte la rime avec la relique et reste réservé aux shots 3, 25 et 26 — l'utiliser sur un gag de charme diluerait le motif.

**Deuxième adresse caméra de l'épisode**, après le shot 4. Partout ailleurs le regard de Maya s'adresse à la salle. Ces deux exceptions encadrent le numéro : elle ouvre en nous regardant, elle ferme en nous faisant un clin d'œil.

# II. LA CONFRONTATION

## SHOT 13 — PLAN 180+190 — *Derrière le rideau → la voix*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 12 s | 12 s | 24 | full-reference |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, essoufflée puis figée |
| `<Picture 2>` | `DEC_couloir_bois` | Décor, couloir en bois brut, teinte bleu nuit |
| `<Picture 3>` | `PROP_dague_maya` | Lanière de cuir qu'elle réajuste |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, now out of performance mode, breathing hard, then freezing at the sound of a voice.
<Subject 2> is the narrow backstage corridor from <Picture 2>, saturated in a constant deep indigo, night-blue tone, kitchen sounds nearby.
<Subject 3> is the dagger and leather strap from <Picture 3>, at Maya's waist beneath her costume.

summary:
[reference generation] The target video shows <Subject 1> leaning against a beam in <Subject 2>, adjusting <Subject 3>'s strap with trembling fingers, then going rigid as an unseen woman's voice speaks from the shadows.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - Maya's identity and physical state are retained across both shots.
<Subject 2> (appears in [Shot 1], [Shot 2]): fully_preserved - the corridor's rough wood and pervasive indigo lighting are retained.
<Subject 3> (appears in [Shot 1]): fully_preserved - the dagger and its leather strap are retained, concealed beneath the fabric.

detailed_description:
Cinematic anime style, refined linework, the entire corridor bathed in a deep, constant indigo night-blue light, a deliberate visual signature that will belong to the Tenancière before she ever appears. [Shot 1] A medium shot frames <Subject 1>, Maya, stepping through the velvet curtain into <Subject 2>, the narrow wooden corridor, its cool blue tone replacing the golden warmth of the hall entirely. She leans back against a rough wooden beam, chest still rising and falling from the performance's adrenaline, and reaches down to <Subject 3>, her fingers trembling faintly as they work to resettle the leather strap at her waist beneath the fabric. [Shot 2] At 00:07.000, her entire body goes rigid mid-motion, eyes widening fractionally, still bathed in the same indigo light. An older woman's voice, cold and measured, low and steady (S1), speaks from off-screen in the corridor's shadows behind her, <d>[Français] Magnifique, n'est-ce pas ?</d> while the frame holds tight on Maya's startled face, her breath catching visibly.

overall_soundscape:
Distant kitchen clatter and low voices replace the incense-scented hush of the hall in the first half; near the voice, only Maya's uneven breath remains, the kitchen ambiance falling away.

non_diegetic_music:
A single low, cold sustained string note enters quietly beneath the voice, barely perceptible.
```

---

## SHOT 14 — PLAN 200 — *Approche rectiligne*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 8 s | 8 s | 24 | full-reference |

**Références (2/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_tenanciere` | La Tenancière, robe et hétérochromie |
| `<Picture 2>` | `DEC_couloir_bois` | Décor, couloir bleu nuit |

**Prompt**
```text
subject_definitions:
<Subject 1> is the Tenancière from <Picture 1>, imposing, in a midnight-blue silver-patterned gown, with heterochromia — one fathomless black eye, one pale contrasting eye.
<Subject 2> is the narrow wooden corridor from <Picture 2>, its every surface bathed in the same deep indigo, night-blue light as her own gown.

summary:
[reference generation] The target video shows <Subject 1> emerging from shadow and advancing in <Subject 2> along a single unbroken, rectilinear path, her gown's midnight blue nearly merging with the corridor's own light.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - the Tenancière's gown, bearing, and heterochromia are retained.
<Subject 2> (appears in [Shot 1]): fully_preserved - the corridor and its pervasive indigo tone are retained.

detailed_description:
Cinematic anime style, refined linework, the corridor's constant deep indigo light nearly swallowing her silhouette into its own color. [Shot 1] A medium shot with a slight lateral truck follows <Subject 1>, the Tenancière, as she steps out of shadow into <Subject 2>, the narrow corridor, and begins walking forward at an even, unhurried pace, her posture rigid, general-like. A slightly warmer accent within the blue catches her face as she passes beneath a high skylight, revealing her heterochromia — one eye fathomless black, the other pale and contrasting — clearly for a moment. Her midnight-blue gown's silver embroidery glints faintly with each step, the fabric's color nearly indistinguishable from the corridor's own light. Her path is perfectly straight, never wavering, never slowing, carrying her deeper into the corridor. The fabric of her gown produces a low, steady rhythmic swish timed to her stride.

overall_soundscape:
The steady rhythmic swish of heavy fabric with each step, underlaid by the corridor's faint kitchen-adjacent ambiance.

non_diegetic_music:
A slow, cold string pulse continues beneath her approach, low and unresolved.
```

---

## SHOT 15 — PLAN 210 — *La grâce n'est pas une monnaie*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 9 s | 9 s | 24 | full-reference |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_tenanciere` | Tenancière, en marche, qui parle |
| `<Picture 2>` | `CHAR_maya` | Maya, qui recule et négocie |
| `<Picture 3>` | `DEC_couloir_bois` | Décor, couloir bleu nuit |

**Prompt**
```text
subject_definitions:
<Subject 1> is the Tenancière from <Picture 1>, continuing her unbroken advance.
<Subject 2> is Maya from <Picture 2>, backing away slightly, still trying to charm her way out.
<Subject 3> is the narrow wooden corridor from <Picture 3>, its constant deep indigo light unchanged.

summary:
[reference generation] The target video cuts between <Subject 1> and <Subject 2> as they exchange lines within <Subject 3>, the Tenancière never fully stopping her stride.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - her gown, bearing, and continuous walking motion are retained.
<Subject 2> (appears in [Shot 1], [Shot 2]): fully_preserved - Maya's identity and defensive body language are retained.
<Subject 3> (appears in [Shot 1], [Shot 2]): fully_preserved - the corridor's indigo tone is retained across both shots.

detailed_description:
Cinematic anime style, refined linework, the corridor's pervasive deep indigo light unbroken across the cut. [Shot 1] A medium shot follows <Subject 1>, the Tenancière (S1), walking within <Subject 3>, never stopping. Her voice is cold, measured, unhurried, and she says, <d>[Français] Tes mouvements sont parfaits, Maya. Mais la grâce n'est pas une monnaie d'échange que j'accepte ici.</d> [Shot 2] At 00:04.500, the camera cuts to <Subject 2>, Maya (S2), stepping back half a pace within the same indigo-lit corridor, her expression caught between charm and unease. In a light, persuasive voice tinged with forced confidence, she replies, <d>[Français] L'argent est dans la salle, Madame. Vous savez très bien que le spectacle attire les billets...</d> Her eyes flick briefly past frame toward the Tenancière's approaching silhouette before returning to hold her ground.

overall_soundscape:
The Tenancière's steady footfall and gown-swish continue audibly beneath both shots, unbroken by the cut.

non_diegetic_music:
The slow, cold string pulse continues unresolved beneath the exchange.
```

---

## SHOT 16 — PLAN 220 — *Le spectacle attire les regards*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 7 s | 7 s | 24 | full-reference |

**Références (2/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_tenanciere` | Tenancière, en approche |
| `<Picture 2>` | `DEC_couloir_bois` | Décor, couloir bleu nuit |

**Prompt**
```text
subject_definitions:
<Subject 1> is the Tenancière from <Picture 1>, continuing to close the distance.
<Subject 2> is the narrow wooden corridor from <Picture 2>, its constant deep indigo light unchanged.

summary:
[reference generation] The target video holds on <Subject 1> as she cuts down Maya's argument without breaking stride within <Subject 2>.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - her gown, expression, and continuous approach are retained.
<Subject 2> (appears in [Shot 1]): fully_preserved - the corridor's indigo tone is retained.

detailed_description:
Cinematic anime style, refined linework, pervasive deep indigo light. [Shot 1] A close shot frames <Subject 1>, the Tenancière (S1), her walk continuing at the same even pace within <Subject 2>, drawing perceptibly closer to camera as she speaks. Her tone is sharp and cutting, delivered without a flicker of hesitation: <d>[Français] Le spectacle attire les regards, pas les profits. Les dettes ne s'évaporent pas avec tes pirouettes, et l'intérêt, lui, ne prend pas de pause pour le spectacle.</d> Her expression stays impassive throughout, her mismatched eyes fixed forward, the corridor's blue light tracing the silver embroidery of her gown.

overall_soundscape:
Her steady footfall and the low rhythmic swish of her gown continue beneath the dialogue.

non_diegetic_music:
The cold string pulse continues, tightening almost imperceptibly beneath her sharper tone.
```

---

## SHOT 17 — PLAN 230 — *Trois jours de plus*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 9 s | 9 s | 24 | full-reference |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, qui plaide |
| `<Picture 2>` | `CHAR_tenanciere` | Tenancière, quasi à sa hauteur |
| `<Picture 3>` | `DEC_couloir_bois` | Décor, couloir bleu nuit |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, her negotiation tilting into pleading.
<Subject 2> is the Tenancière from <Picture 2>, now nearly level with Maya, her pace only slightly slowed.
<Subject 3> is the narrow wooden corridor from <Picture 3>, its constant deep indigo light unchanged.

summary:
[reference generation] The target video cuts between <Subject 1> and <Subject 2> within <Subject 3> as Maya's tone shifts from bargaining to visible pleading.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - Maya's identity and increasingly strained expression are retained.
<Subject 2> (appears in [Shot 1], [Shot 2]): fully_preserved - the Tenancière's gown, bearing, and near-continuous approach are retained.
<Subject 3> (appears in [Shot 1], [Shot 2]): fully_preserved - the corridor's indigo tone is retained across both shots.

detailed_description:
Cinematic anime style, refined linework, pervasive deep indigo light. [Shot 1] A close shot holds on <Subject 1>, Maya (S2), her voice wavering slightly as she tries to hold eye contact, <d>[Français] Je vous ai dit que je vous rembourserais la semaine prochaine. Le bazar est en pleine période de fête, les pourboires vont...</d> [Shot 2] At 00:05.000, the camera cuts to <Subject 2>, the Tenancière (S1), now nearly level with Maya within <Subject 3>, her pace slowed to its barest minimum without ever fully stopping. Maya's voice continues off-screen, cracking into open supplication, <d>[Français] S'il vous plaît... Donnez-moi juste trois jours de plus. Je peux faire une représentation privée, une soirée entière, je peux...</d> The Tenancière's expression remains unreadable, unmoved, as she keeps closing the last of the distance.

overall_soundscape:
Maya's breath grows audibly unsteady beneath her pleading; the Tenancière's near-continuous footfall persists underneath.

non_diegetic_music:
The cold string pulse continues, now joined by a low sustained undertone as the tension builds.
```

---

## SHOT 18 — PLAN 240+250+260 — *Le rire sans joie → la gifle en mouvement → le choc*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 15 s | 15 s | 24 | full-reference |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_tenanciere` | Tenancière, mépris puis geste de la gifle |
| `<Picture 2>` | `CHAR_maya` | Maya, cible puis chancelante |
| `<Picture 3>` | `DEC_couloir_bois` | Décor, couloir bleu nuit |

**Prompt**
```text
subject_definitions:
<Subject 1> is the Tenancière from <Picture 1>, her pace slowed to a near-minimum but never fully stopped, until the single unbroken motion of the strike.
<Subject 2> is Maya from <Picture 2>, caught mid-sentence, then reeling from the impact.
<Subject 3> is the narrow wooden corridor from <Picture 3>, its constant deep indigo light unchanged throughout.

summary:
[reference generation] The target video holds on <Subject 1> delivering a joyless laugh and dismissive line within <Subject 3>, then strikes <Subject 2> across the face in one continuous stride, and holds on <Subject 2> staggering to keep from falling.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - her gown, expression, and continued motion through the strike are retained.
<Subject 2> (appears in [Shot 2], [Shot 3]): fully_preserved - Maya's identity and physical reaction are retained across both shots.
<Subject 3> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - the corridor's indigo tone is retained throughout.

detailed_description:
Cinematic anime style, refined linework, pervasive deep indigo light, a hard flash of contrast at the moment of impact. [Shot 1] A close-up holds on <Subject 1>, the Tenancière (S1), her stride reduced to its slowest point yet without ever fully halting within <Subject 3>. A short, joyless laugh escapes her, cold and dry, before she says, in the same measured, unhurried tone, <d>[Français] Tu es trop optimiste pour une fille qui court toujours après ses propres ombres.</d> Her mismatched eyes narrow faintly with contempt, gone as quickly as it appeared. [Shot 2] At 00:05.000, a close shot frames <Subject 1>, her hand snapping upward and across in a single fast, precise motion, striking <Subject 2>, Maya, hard across the cheek, mid-word. The Tenancière's stride never falters through the motion, her expression unchanged, as if the strike were incidental inside a larger, uninterrupted movement. [Shot 3] At 00:09.000, the camera holds close on <Subject 2>, Maya, her head still tilted from the impact, legs buckling beneath her as she staggers sideways within <Subject 3>. Her hand shoots out and grips the edge of a nearby wooden service table hard enough to whiten her knuckles, steadying herself just before falling. Her breath comes short and ragged; she bites down involuntarily, wincing at a coppery taste in her mouth.

overall_soundscape:
A short, dry, joyless laugh, then a single sharp cracking slap that cuts off Maya's sentence mid-syllable, followed by her short, ragged breathing and a dull scrape as her hand catches the table's edge.

non_diegetic_music:
The cold string pulse holds static through the contempt, cuts out abruptly on the impact, then stays silent through the aftermath.
```

**Notes** — Séquence de violence la plus dense de l'épisode, volontairement tenue en un seul geste ininterrompu de la Tenancière ; à ne surtout pas couper au montage, c'est tout l'intérêt de la fusion.

---

## SHOT 19 — PLAN 271 — *La sentence (I)*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 7 s | 7 s | 24 | full-reference |

**Référence audio (ref2va)** — `S01_shot19_VOX_tenanciere_take01.flac` (5 s de voix)

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_tenanciere` | Tenancière, penchée, menace |
| `<Picture 2>` | `CHAR_maya` | Maya, sous la menace |
| `<Picture 3>` | `DEC_couloir_bois` | Décor, couloir bleu nuit |

**Prompt**
```text
subject_definitions:
<Subject 1> is the Tenancière from <Picture 1>, leaning in close, her stride reduced to a bare, controlled inclination without a full stop.
<Subject 2> is Maya from <Picture 2>, pinned by the proximity and the threat.
<Subject 3> is the narrow wooden corridor from <Picture 3>, its constant deep indigo light now edged with harder shadow.

summary:
[reference generation] The target video holds an extreme close-up as <Subject 1> opens the episode's central threat to <Subject 2> within <Subject 3>, never fully halting her motion.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - her gown, expression, and controlled near-stillness are retained.
<Subject 2> (appears in [Shot 1]): fully_preserved - Maya's identity and fear are retained.
<Subject 3> (appears in [Shot 1]): fully_preserved - the corridor's indigo tone, now hard-edged, is retained.

detailed_description:
Cinematic anime style, refined linework, the corridor's deep indigo light sharpened into hard directional contrast, a heavy blue-black shadow cast across Maya's face. [Shot 1] An extreme close-up frames <Subject 1>, the Tenancière (S1), leaning in until her face is only centimeters from <Subject 2>, Maya, within <Subject 3>, her stride slowing to its barest inclination without ever stopping outright. Her voice drops to a slow, glacial murmur, each word measured and unhurried: <d>[Français] Demain, au lever du soleil, si l'or n'est pas sur mon bureau, je ne perdrai plus mon temps avec tes danses.</d> Maya's face, half in hard indigo shadow, holds rigid under the proximity, her breath shallow.

overall_soundscape:
Near-total silence surrounds the murmured threat, Maya's breath tight and controlled.

non_diegetic_music:
A single low, sustained cello note begins to hold unresolved beneath the threat, barely swelling.
```

**Notes** — Premier des trois plans de *La sentence*. Le plan 270 d'origine cumulait les trois répliques (~24 s de voix), très au-delà du plafond H3 de 15 s : il a été scindé en 271 / 274 / 277, générés séparément et raccordés au montage. Numéros pris dans le trou de la dizaine, le 270 reste brûlé.

---

## SHOT 20 — PLAN 274 — *La sentence (II)*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 13 s | 13 s | 24 | full-reference |

**Référence audio (ref2va)** — `S01_shot20_VOX_tenanciere_take02.flac` (12,6 s de voix)

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_tenanciere` | Tenancière, de face, immobile |
| `<Picture 2>` | `CHAR_maya` | Maya, peur et dégoût |
| `<Picture 3>` | `DEC_couloir_bois` | Décor, couloir bleu nuit |

**Prompt**
```text
subject_definitions:
<Subject 1> is the Tenancière from <Picture 1>, leaning in close, her body held almost perfectly still, only her mouth and eyes alive.
<Subject 2> is Maya from <Picture 2>, held in place by the proximity and the threat, her back to the corridor wall.
<Subject 3> is the narrow wooden corridor from <Picture 3>, its constant deep indigo light edged with harder shadow, seen as a fixed backdrop behind each face.

summary:
[reference generation] The target video continues the threat in two locked-off extreme close-ups: <Subject 1> speaks head-on to a static camera, then the cut lands mid-line on <Subject 2>, where terror and revulsion surface in her face as the words continue over her. Neither character walks; nothing in frame travels.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Plan 271]): fully_preserved - her gown, expression, and stillness are retained.
<Subject 2> (appears in [Shot 2], [Plan 271]): fully_preserved - Maya's identity and fear are retained.
<Subject 3> (appears in [Shot 1], [Shot 2], [Plan 271]): fully_preserved - the corridor's indigo tone, hard-edged, is retained across both shots.

detailed_description:
Cinematic anime style, refined linework, the corridor's deep indigo light sharpened into hard directional contrast, a heavy blue-black shadow cast across Maya's face. Locked-off static camera throughout, no pan, no tracking, no dolly; the wooden corridor wall behind each face stays completely fixed, its grain and shadows immobile. [Shot 1] An extreme close-up frames <Subject 1>, the Tenancière, head-on to camera within <Subject 3>. She is standing in place, leaning in, her head and shoulders motionless in frame — no walking, no forward travel, no change of position whatsoever. Only her lips move as she speaks, in the same slow, glacial murmur, without blinking: <d>[Français] J'aurai un autre moyen de récupérer ce que tu me dois. Il y a des acheteurs à la porte qui ne demandent ni musique, ni grâce,</d> Her expression remains perfectly composed, entirely untroubled by what she is saying. [Shot 2] At 00:07.000, the camera cuts to a matching locked-off extreme close-up on <Subject 2>, Maya, standing still against the wall within <Subject 3>, half her face swallowed in hard indigo shadow, the background fixed behind her. The Tenancière's voice continues off-screen over her, <d>[Français] seulement un corps capable de supporter le travail... et une vie de servage pour rembourser les intérêts.</d> Maya's face breaks open as the meaning lands: her eyes widen, pupils contracting to points, her eyebrows drawing up and together in undisguised dread. Then revulsion floods in over the fear — her upper lip curls back from her teeth, her nostrils flare, the corners of her mouth pull down hard, her chin puckering as if she were about to be sick. Her breath catches and does not release. A tremor runs through her lower lip and her eyelids, and her eyes glisten wet without a tear falling. The two expressions sit on her face at once, terror underneath and open disgust over it, held without blinking until the end of the shot.

overall_soundscape:
Near-total silence surrounds the murmured threat, Maya's breath catching mid-line and holding.

non_diegetic_music:
The single low cello note holds unresolved, swelling almost imperceptibly through the length of the line.
```

**Notes** — Plan le plus long de la scène (13 s), quasiment au plafond H3 : à surveiller en priorité à la génération. Le cut de mi-réplique tombe à 00:07.000, sur « seulement un corps capable de supporter le travail » — c'est le mot *corps* qui doit atterrir sur le visage de Maya, pas avant.

**Correctif appliqué (décor qui défile)** — la mention de la démarche héritée du 271 (« stride held at its barest inclination ») suffisait à faire comprendre au modèle que la Tenancière avance : il faisait alors défiler le couloir derrière elle. Toute référence à la marche a été supprimée ici, remplacée par une caméra explicitement verrouillée et un fond décrit comme immobile. **Règle générale : la règle du personnage (« ne s'arrête jamais ») se décrit dans les plans où on la voit marcher — pas dans les très gros plans, où elle ne produit qu'un artefact de travelling.**

---

## SHOT 21 — PLAN 277 — *La sentence (III)*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 7 s | 7 s | 24 | full-reference |

**Référence audio (ref2va)** — `S01_shot21_VOX_tenanciere_take03.flac` (5 s de voix) — prévoir ~1 s de silence de tête pour le redressement, ~1 s de queue pour l'éloignement.

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_tenanciere` | Tenancière, de dos, s'éloignant |
| `<Picture 2>` | `CHAR_maya` | Maya, assise au sol |
| `<Picture 3>` | `DEC_couloir_bois` | Décor, couloir bleu nuit en fuyante |

**Prompt**
```text
subject_definitions:
<Subject 1> is the Tenancière from <Picture 1>, seen from behind, walking away from camera down the length of the corridor.
<Subject 2> is Maya from <Picture 2>, sitting on the floor with her back against the corridor wall, still stunned from the strike.
<Subject 3> is the narrow wooden corridor from <Picture 3>, its constant deep indigo light edged with harder shadow, receding straight away from camera toward a darker far end.

summary:
[reference generation] The target video looks straight down <Subject 3> from a fixed camera: <Subject 1> straightens, turns away and walks directly into the depth of the frame, seen only from behind, delivering the final line as she goes, while <Subject 2> stays seated on the floor against the wall in the foreground.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Plan 274]): fully_preserved - her gown, silhouette, and even carriage are retained, now seen from behind.
<Subject 2> (appears in [Shot 1], [Plan 274]): fully_preserved - Maya's identity, reddened cheek, and stunned state are retained.
<Subject 3> (appears in [Shot 1], [Plan 274]): fully_preserved - the corridor's indigo tone, hard-edged, is retained.

detailed_description:
Cinematic anime style, refined linework, the corridor's deep indigo light sharpened into hard directional contrast. Locked-off static camera placed in the corridor's own axis, looking straight down its length toward the darker far end; the framing never moves. <Subject 2>, Maya, is sitting on the wooden floor in the foreground at frame edge, her back flat against the side wall of <Subject 3>, legs folded beneath her, one shoulder propped against the boards, head still tilted from the earlier blow, cheek visibly reddened, making no attempt to rise. <Subject 1>, the Tenancière, straightens out of her lean above her, turns away, and walks directly away from camera into the depth of the frame — seen only from behind, her back and the fall of her gown centred in the corridor, never turning toward camera, never exiting to either side. As she walks away she delivers the line quieter still, without turning her head or slowing: <d>[Français] Tu seras vendue comme fille de plaisir avant que le premier marché n'ouvre ses portes.</d> Her silhouette grows smaller toward the corridor's vanishing point, sinking into the indigo dark ahead. Maya stays seated where she is, face half in hard shadow, going pale, breath frozen mid-inhale, eyes fixed on nothing.

overall_soundscape:
The steady swish of the Tenancière's gown and her even footfall carrying away from camera down the corridor, the murmured line delivered over them, then Maya's breath catching and holding as the steps recede.

non_diegetic_music:
The sustained cello note holds through the final line, still unresolved, not yet released.
```

**Notes** — Caméra plantée dans l'axe du couloir : la Tenancière s'enfonce vers le fond du cadre, de dos, jamais de profil ni vers un bord — c'est un couloir, il n'y a qu'une sortie. Sa règle (jamais d'arrêt complet) tient jusqu'au bout : elle se redresse et sa marche repart dans le même geste. Maya est assise au sol et ne se relève pas.

**Raccord** — ce plan absorbe l'ancien PLAN 280 (la Tenancière qui se redresse et s'éloigne), devenu redondant. Il enchaîne directement sur le PLAN 300, où Maya se relève et part vers la porte de service. **Continuité amont** : au plan 260 Maya se rattrape à une table pour ne pas tomber ; elle a donc glissé au sol hors champ pendant les 271/274, où seuls les visages sont cadrés.

**Plans supprimés** — les PLANS 280 (la Tenancière poursuit sa route) et 290 (Maya seule dans le noir) sont supprimés : le 277 joue déjà la sortie, et le 300 enchaîne mieux sans temps mort sur Maya à terre. Les numéros 270, 280 et 290 sont brûlés et ne seront pas réattribués.

---

## SHOT 22 — PLAN 300 — *La fuite commence*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 7 s | 7 s | 24 | full-reference |

**Références (2/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, décision de fuir |
| `<Picture 2>` | `DEC_couloir_bois` | Décor, porte de service, couloir bleu nuit |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, pushing off the wall and moving with sudden purpose.
<Subject 2> is the narrow corridor from <Picture 2>, its constant deep indigo light unchanged, ending at its service door.

summary:
[reference generation] The target video shows <Subject 1> wiping her cheek and moving quickly toward the service door within <Subject 2>.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - Maya's identity and resolved body language are retained.
<Subject 2> (appears in [Shot 1]): fully_preserved - the corridor and its service door are retained.

detailed_description:
Cinematic anime style, refined linework, pervasive deep indigo light giving way to a warmer sliver at the service door. [Shot 1] A medium shot follows <Subject 1>, Maya, pushing off the wall with sudden resolve within <Subject 2>. She wipes her reddened cheek once, quickly, with the back of her hand, straightens her posture, and moves forward at a fast, purposeful walk toward the corridor's far service door, her steps light but urgent, glancing once behind her before reaching for the handle, the indigo light finally breaking against a thin warm line at the door's edge.

overall_soundscape:
Quick, light footsteps against wood, a faint rustle of fabric as she moves with growing urgency.

non_diegetic_music:
A single low, tense string pulse begins quietly, underscoring her building urgency.
```

---

# III. LA FUITE

## SHOT 23 — PLAN 310+320 — *Dans les ruelles → reprendre son souffle*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 12 s | 12 s | 24 | full-reference |

**Références (2/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, en fuite puis essoufflée |
| `<Picture 2>` | `DEC_ruelles_bazar` | Décor, ruelles nocturnes de médina |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, running, her usual lightness replaced by panic, then stopping to catch her breath.
<Subject 2> is the bazar's nocturnal Persian/Arab-style back alleys from <Picture 2> — narrow passages under striped cloth awnings, ochre-plastered walls, chipped zellige tilework, horseshoe archways, shuttered stalls, wet cobblestones under moonlight.

summary:
[reference generation] The target video shows <Subject 1> plunging into <Subject 2>, her steps heavy and erratic, then leaning against a damp stone wall in a hidden side passage to catch her breath.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - Maya's identity and physical state are retained across both shots.
<Subject 2> (appears in [Shot 1], [Shot 2]): fully_preserved - the medina-style alley architecture and moonlit shadows are retained.

detailed_description:
Cinematic anime style, refined linework, cold moonlight against deep shadow. [Shot 1] A wide shot follows <Subject 1>, Maya, running into <Subject 2>, the maze of the bazar's back alleys — narrow passages winding beneath striped cloth awnings strung overhead, their fabric ghost-pale in the moonlight, ochre-plastered walls broken by chipped zellige tilework and shuttered horseshoe-arched stalls closed for the night. Her steps land heavy and erratic against the wet cobblestones, a sharp contrast to her usual dancer's lightness. Moonlight catches her costume in fragments between deep pools of shadow as she cuts between the narrow passages, her breath visible in ragged bursts. A muffled echo of the service door slamming shut carries behind her from off-frame. [Shot 2] At 00:07.000, the camera holds a medium close static shot as <Subject 1> stops and leans back against a damp stone wall in a hidden side passage of <Subject 2>, unlit copper lanterns hanging cold and dark above her. Her shoulders rise and fall sharply with each labored breath, her chest heaving beneath the still-disheveled costume. She tips her head back briefly against the cold stone, eyes closing for a single instant of forced stillness.

overall_soundscape:
Heavy, uneven footsteps splash against wet cobblestones, the distant echo of a slamming door fading behind her, giving way to Maya's labored breathing and faint distant bazar ambiance.

non_diegetic_music:
The tense string pulse continues, low and unresolved through the run, fading down to near silence as her breathing slows.
```

---

## SHOT 24 — PLAN 330 — *Des voix, la main vers la dague*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 6 s | 6 s | 24 | full-reference |

**Références (4/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, à l'écoute |
| `<Picture 2>` | `HUM_silhouettes_encapuchonnees` | Silhouettes lointaines |
| `<Picture 3>` | `PROP_dague_maya` | Détail du geste vers la dague |
| `<Picture 4>` | `DEC_ruelles_bazar` | Décor, passage dérobé de médina |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, alert, hearing distant voices.
<Subject 2> is the two cloaked, hooded figures from <Picture 2>, faintly visible one alley over.
<Subject 3> is the concealed dagger from <Picture 3>, at Maya's waist.
<Subject 4> is the hidden medina alley passage from <Picture 4>.

summary:
[reference generation] The target video shows <Subject 1> catching sight of <Subject 2> in the distance within <Subject 4> and instinctively moving two fingers toward <Subject 3>.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - Maya's identity and controlled alertness are retained.
<Subject 2> (appears in [Shot 1]): weak_reference - only their distant, cloaked silhouettes register in low moonlight.
<Subject 3> (appears in [Shot 1]): fully_preserved - the dagger and its position remain concealed but referenced by the gesture.
<Subject 4> (appears in [Shot 1]): fully_preserved - the passage's moonlit shadow and medina architecture are retained.

detailed_description:
Cinematic anime style, refined linework, faint moonlight against deep shadow. [Shot 1] A medium close shot holds on <Subject 1>, Maya, her head turning slightly as she catches the sound of distant voices. One alley over within <Subject 4>, <Subject 2>, two cloaked, hooded figures, are barely visible in the faint moonlight beneath a striped awning, faces obscured. Without breaking her stillness, Maya's fingers drift slowly and precisely toward her waist, toward <Subject 3>, the concealed dagger, the same cold precision she showed scanning the inn's room earlier. Her body stays otherwise motionless, controlled, invisible in the shadow.

overall_soundscape:
Muffled distant voices carry faintly from the neighboring alley, otherwise near-total stillness on Maya's side.

non_diegetic_music:
N/A — tension carried by silence rather than score.
```

**Notes** — Même logique de regard-qui-évalue que le plan 110 : retenue de mise en scène identique, geste minimal, pour que le lien entre les deux moments reste lisible sans dialogue.

---

## SHOT 25 — PLAN 340 — *Les Yeux de Rubis*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 12 s | 12 s | 24 | full-reference |

**Références (2/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `HUM_silhouettes_encapuchonnees` | Sources des voix off |
| `<Picture 2>` | `CHAR_maya` | Maya, à l'écoute, immobile |

**Prompt**
```text
subject_definitions:
<Subject 1> is the two cloaked, hooded figures from <Picture 1>, unseen or barely seen, their voices carrying across the alley.
<Subject 2> is Maya from <Picture 2>, listening intently, perfectly still.

summary:
[reference generation] The target video holds on <Subject 2>, motionless, as <Subject 1>'s offscreen voices deliver the episode's key exposition about the legendary relic.

retention_analysis:
<Subject 1> (appears in [Shot 1]): weak_reference - only their offscreen vocal presence registers; visual identity stays undefined at this distance.
<Subject 2> (appears in [Shot 1]): fully_preserved - Maya's identity and focused stillness are retained.

detailed_description:
Cinematic anime style, refined linework, faint moonlight, shallow focus on Maya's face. [Shot 1] A static close shot holds on <Subject 2>, Maya, perfectly still, listening, her eyes narrowing slightly in concentration. From <Subject 1>, off-screen in the neighboring alley, a nervous male voice (S1) says, <d>[Français] ...déjà en circulation, tu es sûr ? Si le marché noir s'en mêle avant qu'on soit prêts, on est tous morts.</d> A second voice (S2) answers with a nervous chuckle, then continues in a low, uneasy tone, <d>[Français] Le marché noir ne dort jamais. C'est pas les hommes qui m'inquiètent, c'est la légende. Un seul souhait pour eux, une vie entière de pouvoir pour nous.</d> Maya's gaze sharpens further, utterly motionless, as the second voice (S2) delivers the final line with quiet weight, <d>[Français] Les Yeux de Rubis... Une fois en mouvement, personne ne peut les arrêter.</d> Maya's expression shifts almost imperceptibly at the name, though she does not move.

overall_soundscape:
The two offscreen voices carry clearly across the narrow alley gap, footsteps shifting faintly beneath their words.

non_diegetic_music:
N/A — the exposition is carried entirely by dialogue against silence.
```

---

## SHOT 26 — PLAN 350+360 — *Les pas s'éloignent → le sourire carnassier*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 10 s | 10 s | 24 | full-reference |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `HUM_silhouettes_encapuchonnees` | Silhouettes qui s'éloignent |
| `<Picture 2>` | `DEC_ruelles_bazar` | Décor, ruelle de médina au loin |
| `<Picture 3>` | `CHAR_maya_yeux` | Gros plan visage et yeux rubis |

**Prompt**
```text
subject_definitions:
<Subject 1> is the two cloaked, hooded figures from <Picture 1>, walking away.
<Subject 2> is the moonlit medina alley from <Picture 2>, extending into the distance.
<Subject 3> is Maya's face in close-up from <Picture 3>, her ruby-red eyes catching a sliver of moonlight.

summary:
[reference generation] The target video shows <Subject 1> receding down <Subject 2> until they vanish, then closes on <Subject 3> as a predatory smile forms, marking Maya's inner shift from prey to hunter.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - the two cloaked silhouettes are retained as they shrink into the distance.
<Subject 2> (appears in [Shot 1]): fully_preserved - the alley's moonlit depth and medina architecture are retained.
<Subject 3> (appears in [Shot 2]): fully_preserved - Maya's ruby-red eyes and face are retained in close detail.

detailed_description:
Cinematic anime style, refined linework, cold moonlight against deep shadow. [Shot 1] A wide static shot holds on <Subject 2>, the alley stretching away between shuttered stalls and striped awnings, as <Subject 1>, the two cloaked figures, walk steadily away from camera, their silhouettes shrinking with each step until they blend into the deeper darkness at the passage's far end. [Shot 2] At 00:05.000, the camera cuts to a static close-up on <Subject 3>, Maya's face, still pressed lightly against the stone wall. Her expression shifts slowly — the tension of fear draining away, replaced by a slow, deliberate, predatory smile spreading across her lips, her ruby-red eyes catching the thin moonlight with a new, sharpened focus. In a hushed, private off-screen voiceover, her own voice (S1) murmurs, <d>[Français] C'est ma chance.</d> while her lips on screen remain completely closed, the thought belonging only to her.

overall_soundscape:
Footsteps fade gradually into the distance until only faint ambient bazar sounds remain, then near-total silence broken only by Maya's own steadying breath.

non_diegetic_music:
A faint musical theme begins to surface at the very edge of audibility in the second shot, a single instrument barely emerging from silence.
```

---

## SHOT 27 — PLAN 370 — *Vers le labyrinthe*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 8 s | 8 s | 24 | full-reference |

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, élan décidé |
| `<Picture 2>` | `CHAR_maya_yeux` | Gros plan final, rime visuelle |
| `<Picture 3>` | `DEC_ruelles_bazar` | Décor, ruelles de médina |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, pushing off the wall with sudden decisive momentum.
<Subject 2> is Maya's ruby-red eyes in close-up from <Picture 2>, the visual rhyme with the legendary relic.
<Subject 3> is the bazar's medina-style alleys from <Picture 3>.

summary:
[reference generation] The target video shows <Subject 1> launching forward into <Subject 3>, the camera progressively closing in on <Subject 2>'s eyes as the episode's final image — the rhyme between Maya's gaze and the relic's name.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - Maya's identity and decisive motion are retained.
<Subject 2> (appears in [Shot 1]): fully_preserved - her ruby-red eyes are retained in the closing detail.
<Subject 3> (appears in [Shot 1]): fully_preserved - the medina alleys are retained as the setting for her advance.

detailed_description:
Cinematic anime style, refined linework, cold moonlight sharpening into strong contrast toward the shot's end. [Shot 1] A wide shot holds on <Subject 1>, Maya, pushing off the wall in one fluid, decisive motion and striding forward into <Subject 3>, the bazar's maze of striped-awning passages and ochre walls, no longer moving like prey but like a hunter with a fixed destination. The camera pushes in steadily at slow-to-moderate speed as she advances, the frame narrowing gradually from her full figure toward her face, until it settles on <Subject 2>, her ruby-red eyes, sharp and resolute, catching the moonlight one final time in a deliberate visual echo of the Yeux de Rubis named moments before — held without any line of dialogue underlining it.

overall_soundscape:
Confident, steady footfall against cobblestones, growing slightly louder as the camera closes in.

non_diegetic_music:
The theme resurfaces fully, oud and low percussion returning at a measured, purposeful tempo, building quietly toward the episode's end.
```

**Notes** — Plan le plus important de la série pour la suite : si un plan doit être sacrifié en temps de fabrication, ce n'est jamais celui-ci. Prioriser la qualité de `CHAR_maya_yeux` avant tout autre asset.

---

# Notes de production

**Ordre de fabrication conseillé** :
1. `CHAR_maya` (master), `CHAR_maya_yeux` (dérivé) et `FX_flammes_danse` — portent la majorité des plans, priorité absolue (le feu apparaît dès le plan 60).
2. `CHAR_tenanciere` — porte l'acte II en entier.
3. `DEC_couloir_bois` et `DEC_halo_dore` — décors les plus réutilisés après les personnages.
4. `PROP_dague_maya`, `PROP_enseigne_cuivre` — dérivés/props critiques pour la cohérence visuelle.
5. Reste des décors et figurants, sans urgence particulière.

**Plans à risque** :
- Plan 240+250+260 (15 s, pile au plafond H3) — c'est la fusion la plus tendue de la fiche, surveiller en priorité.
- Plan 274 (13 s, cœur de la sentence) — proche de la limite haute, deux shots internes avec cut daté à 00:07.000.
- Plan 140+150 (tourbillon de flammes + réception) — ralenti interne, à valider en priorité.
- Plan 125 (saut spirale, 4 angles, rotation continue) — déjà validé au rendu, à ne pas réécrire sans raison.
- Plan 370 — le plan qui porte la rime de toute la série.
- Plan 30 — stabilisé après six passes ; ne pas y réintroduire de coupe interne ni de référence de décor vide comme état d'arrivée, les deux ont déjà échoué (détail dans les notes du plan).

**Leçons de génération transverses** (valables pour tout nouveau plan de la série) :
- Une baisse de lumière décrite globalement s'applique à toute l'image jusqu'au noir. Décrire l'exposition comme constante entre deux événements datés, et faire porter chaque changement par un geste visible.
- Un raccord de lumière entre deux `[Shot]` internes ne tient pas : décrire séparément l'état de fin du premier et l'état de début du second, ou supprimer la coupe.
- Une référence de décor sans figuration ne peut jamais être déclarée comme état d'arrivée : le modèle vide le plan de ses personnages. Décrire l'état final en texte, et rendre la présence des figurants par ce que la lumière révèle (silhouettes en découpe contre une zone éclairée).
- Une consigne négative produit ce qu'elle interdit. Le mot `empty` dans une description de fin de plan suffit à vider la salle.
- Les figurants au loin bavent en basse résolution : privilégier les cadrages où le premier rang est gros dans l'image.
- Une réplique trop longue ne se rattrape pas au montage : mesurer la durée des prises voix **avant** d'écrire le plan, et scinder si le cumul dépasse le plafond H3 (cas du 270 → 271/274/277).
- Une mention de démarche ou de déplacement dans un très gros plan fait défiler le décor derrière le personnage. Décrire la caméra comme verrouillée et le fond comme immobile dès qu'un plan est censé être fixe.

**Renvoi** : voir `REGISTRE_ASSETS.md` pour la fabrication des assets.
