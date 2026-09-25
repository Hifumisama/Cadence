# REGISTRE D'ASSETS — Les Yeux de Rubis
> Projet : Les Yeux de Rubis · 27 assets · 11 critiques
> Statuts : ⬜ à produire · 🟡 en cours · ✅ validé
> Registre unique pour toute la série — ne pas dupliquer par épisode.
> Modèles : **Krea 2** (text-to-image, masters) · **Qwen Image Edit** (image-to-image, dérivés) · **Qwen3-TTS** (voix)

## Note sur le style

Les prompts ci-dessous **ne contiennent que la description du sujet** — pas de clause de style. Le style Cinematic Anime est géré côté ComfyUI par concaténation automatique avec un prompt de style séparé, donc le répéter ici serait redondant. Si jamais ce nœud de concaténation change, la clause de référence reste celle de la bible :
```
Cinematic anime illustration, refined linework, sophisticated cinematic lighting, atmospheric depth, polished digital rendering, in the visual tradition of Makoto Shinkai and Yoshiyuki Sadamoto.
```

## Le cabaret

**Nom : Le Voile Écarlate** (validé). Belle coïncidence en aval : le rideau de la scène est lui-même écarlate — la « voile » du nom est littéralement visible à l'écran.

## Réglages Krea 2

Langage naturel, prose riche et détaillée, pas de negative prompt documenté. Guillemets autour de tout texte à faire apparaître à l'image (utile pour l'enseigne de cuivre).

Dimensions :
- **Identité et détail** (visages, mains, objets isolés, fiches personnage) : carré **1024×1024**.
- **Décors et plates** en 16:9 : **1536×864** en composition de travail, upscale **2048×1152** si besoin d'une sortie finale.

## Format fiche personnage (Krea 2)

Toutes les fiches personnage suivent le même gabarit testé, un seul bloc de description suivi de la consigne de mise en page :
```text
[description du personnage], character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground.
```

---

## Personnages — Maya

### `CHAR_maya`
- **Statut** : ✅
- **Plans** : quasiment tous les plans où Maya apparaît (voir fiche de plan)
- **Dérivé de** : — (master)
- **Critique** : oui
- **Description canonique** : Maya, danseuse-espionne, peau hâlée, yeux rouge rubis perçants, longs cheveux bruns relevés en queue-de-cheval haute retenue par un ruban rouge, tenue rouge profond à bustier orné de motifs dorés et pierre rubis, brassards et manchettes dorés, jupe longue fendue avec pan de tissu bleu drapé à la taille, sandales dorées. Sourire espiègle, regard qui peut basculer d'une grâce théâtrale à une froideur calculatrice en un instant. Dague de combat courte dissimulée sous un pan de tissu à la ceinture (visible seulement au plan 140+150).
- **Fichier** : `Maya_CharacterSheet.png` (fourni par l'utilisateur, hors pipeline)
- **Seed** : inconnu (généré hors pipeline ComfyUI)
- **Prompt Krea 2 (reconstitution — pour variantes futures)** :
  ```text
  A young tan-skinned dancer-spy with striking ruby-red eyes, dark hair pulled into a high ponytail bound with a red ribbon, gold dangling earrings, a deep-red bodice with gold trim and a central ruby gem, gold pauldrons and cuffs, a long red skirt slit at the hip with a draped blue sash at the waist, gold sandals, neutral standing pose, plain light background, character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground.
  ```

### `CHAR_maya_yeux`
- **Statut** : ✅ · **Dérivé de** : `CHAR_maya` · **Critique** : oui
- **Description canonique** : Gros plan extrême du visage de Maya, dominé par ses yeux rouge rubis qui accrochent la lumière, peau hâlée, mèche de cheveux sombres qui traverse la joue. Porte la rime visuelle avec la relique Les Yeux de Rubis — l'asset le plus soigné du projet.
- **Édition Qwen** — source : `CHAR_maya`
  ```text
  Crop tightly onto the woman's face, filling the frame with her eyes and upper face.
  Preserve her exact facial identity, ruby-red eye color, tan skin tone, and loose hair strands falling across her cheek.
  Sharpen focus on the eyes, add subtle catching highlights as if from nearby firelight.
  ```

### `PROP_dague_maya`
- **Statut** : ✅ · **Dérivé de** : `CHAR_maya` · **Critique** : oui
- **Description canonique** : La dague de combat courte et utilitaire de Maya, dissimulée dans un pan de tissu à sa ceinture. Lame en acier simple, sans ornementation, qui accroche un reflet net de bougie ou de lune quand elle est brièvement exposée.
- **Édition Qwen** — source : `CHAR_maya`
  ```text
  Crop closely onto the waist area, isolating the short combat dagger tucked into the fabric at her belt.
  Preserve the exact blade shape, plain steel finish, and fabric color shown on the source.
  Sharpen focus on the blade's edge and add a single bright reflected highlight along it.
  ```

## Personnages — La Tenancière

### `CHAR_tenanciere`
- **Statut** : ✅
- **Dérivé de** : — (master) · **Critique** : oui
- **Description canonique** : La Tenancière, prénom **Valakor** (validé). Femme à la stature imposante, longs cheveux argentés/blancs, port de tête de général en retraite, robe noire à reflets bleu nuit ornée de larges broderies argentées et de motifs filigranés, larges épaulettes structurées, boucles d'oreilles serties d'une pierre violette. **Hétérochromie** : un œil violet, l'autre ambré/clair (validé). Autorité glaciale, visage d'une beauté austère qui ne trahit jamais d'émotion.
- **Fichier** : `Valakor_Tenanciere_CharacterSheet.png` (fourni par l'utilisateur, hors pipeline)
- **Seed** : inconnu (généré hors pipeline ComfyUI)
- **Prompt Krea 2 (reconstitution — pour variantes futures)** :
  ```text
  An imposing pale-skinned woman with long flowing silver-white hair, heterochromia with one vivid purple eye and one pale amber eye, an austere composed expression, wearing a floor-length black robe with deep midnight-blue undertones, elaborate silver filigree embroidery, structured wide shoulder panels, dangling purple gemstone earrings, arms crossed within long sleeves, neutral standing pose, plain light background, character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground.
  ```

---

## Voix

Les voix suivent un pipeline distinct des images — **Qwen3-TTS** (`VoiceDesign` pour concevoir le timbre, `Base` pour cloner et produire les prises) — mais ce sont des assets de plein droit : produits une fois, validés une fois, réutilisés sur toute la série et rattachés à un personnage.

**L'asset, c'est le timbre, pas la prise.** Le livrable de chaque entrée est un fichier de référence de clonage stable. Les répliques générées à partir de lui sont des instances liées à un plan : elles vivent dans la fiche de plan, à côté du rendu vidéo, jamais ici.

Rappel de pipeline : l'audio se fabrique **avant** le plan, la prise part en `ref2va` sur MiniMax H3, et la piste audio de dialogue générée par H3 est systématiquement jetée — seuls les mouvements de lèvres sont conservés. La réplique du prompt H3 (balise `<d>`) doit être identique **au mot près** à celle générée en voix, sinon les lèvres bougent sur un autre phrasé.

La **direction de jeu** de chaque personnage (ce qu'il fait de sa voix, ce qu'il n'en fait jamais) est dans `00_BIBLE.md`, section *Les voix*. Les entrées ci-dessous ne décrivent que le timbre. Le carnet d'atelier — candidats écartés, paramètres testés, A/B — reste dans `REGISTRE_VOIX.md`.

### `VOICE_maya`
- **Statut** : ⬜ · **Critique** : oui
- **Rattaché à** : `CHAR_maya`
- **Modèle** : Qwen3-TTS · VoiceDesign → référence de clonage
- **Répliques (S01)** : 4 — plans 210, 230 (×2), 350+360
- **Description canonique du timbre** : Voix féminine de fin de vingtaine, alto bas et légèrement voilé, grain doux sans rocaille. Volume naturellement contenu, jamais projeté. Articulation nette et détachée même à faible intensité — c'est la signature qui doit survivre à tous les états émotionnels du personnage. Souffle audible avant l'attaque des phrases, jamais coupé au montage.
- **Prompt VoiceDesign (à figer)** :
  ```text
  A French-speaking woman in her late twenties. Low, smoky alto voice with a soft grain, never bright or girlish. She speaks quietly and unhurriedly, with precise, clearly detached articulation even at low volume. Phrase endings fall rather than rise. Audible intake of breath before speaking. Amused superiority rather than warmth — controlled, never theatrical, never breathy-cute.
  ```
- **Référence de clonage** : ⬜ à produire
- **Piège connu** : la langueur du personnage pousse le modèle à vieillir le timbre. Valider impérativement par `SHOT T1` (essai voix-image, `FICHE_DE_PLAN_UTILITAIRES.md`) et non au casque seul. Le mode limite (supplication du plan 230) doit rester audiblement **la même femme** que le mode contrôle.
- **Note de production** : au plan 240+250+260, la réplique est coupée en plein mot par la gifle — la prise se génère **entière** et se coupe au montage sur l'image de l'impact. Rien de spécial à demander au TTS.

### `VOICE_tenanciere`
- **Statut** : ⬜ · **Critique** : oui
- **Rattaché à** : `CHAR_tenanciere` (Valakor)
- **Modèle** : Qwen3-TTS · VoiceDesign → référence de clonage
- **Répliques (S01)** : 7 — plans 180+190, 210, 220, 240+250+260, 270 (×3)
- **Description canonique du timbre** : Voix féminine de la cinquantaine, contralto profond et posé, timbre froid et parfaitement clair. Débit et volume rigoureusement constants, aucune variation dynamique, aucune emphase — la menace ne se traduit jamais par une montée. Diction impeccable, glaciale, sans chaleur ni raucité.
- **Prompt VoiceDesign (à figer)** :
  ```text
  A French-speaking woman in her fifties. Deep, resonant contralto, cold and perfectly clear. She speaks at an absolutely constant pace and volume, with no dynamic variation and no emphasis on any word — the same measured delivery whether greeting someone or threatening them. Impeccable diction, austere authority, no warmth, no rasp, never raised, never softened.
  ```
- **Référence de clonage** : ⬜ à produire
- **Seul écart autorisé** : le murmure du plan 270, qui se gagne autant au mixage (proximité, niveau) qu'au modèle — **sans changer de débit**. Par règle de bible, elle ne se fissure jamais : pas de mode limite à tester.

### `VOICE_conspirateur_nerveux`
- **Statut** : ⬜ · **Critique** : non
- **Rattaché à** : `HUM_silhouettes_encapuchonnees`
- **Modèle** : Qwen3-TTS · VoiceDesign → référence de clonage
- **Répliques (S01)** : 1 — plan 340 (hors champ)
- **Description canonique du timbre** : Voix masculine de la trentaine, ténor tendu et légèrement serré, débit pressé, inquiétude retenue.
- **Prompt VoiceDesign** :
  ```text
  A French-speaking man in his thirties. Tense, slightly constricted tenor voice, speaking quickly and quietly with barely contained anxiety, as if afraid of being overheard.
  ```
- **Référence de clonage** : ⬜ à produire
- **Note** : jamais à l'image, une ruelle plus loin, à travers un mur. Le traitement (passe-bande, réverbération, distance) fait la crédibilité — la qualité brute du TTS est ici quasi indifférente. À produire en dernier.

### `VOICE_conspirateur_calme`
- **Statut** : ⬜ · **Critique** : non
- **Rattaché à** : `HUM_silhouettes_encapuchonnees`
- **Modèle** : Qwen3-TTS · VoiceDesign → référence de clonage
- **Répliques (S01)** : 2 — plan 340 (hors champ), dont la ligne qui nomme les Yeux de Rubis
- **Description canonique du timbre** : Voix masculine plus âgée, grave, posée, débit lent et assuré. Contraste délibéré avec son interlocuteur nerveux.
- **Prompt VoiceDesign** :
  ```text
  A French-speaking older man. Low, gravelly, unhurried voice, speaking slowly and with quiet certainty, unbothered where his companion is nervous.
  ```
- **Référence de clonage** : ⬜ à produire
- **Note** : porte l'exposition centrale de l'épisode. Malgré son statut non critique, l'**intelligibilité** de la ligne « Les Yeux de Rubis... » prime sur le réalisme du filtrage — ne pas noyer cette réplique-là autant que les deux autres.

**Ordre de fabrication des voix** :
1. `VOICE_tenanciere` — débit plat et constant, le cas le plus simple pour le modèle : on apprend l'outil sur une victoire.
2. `VOICE_maya` — le seul vrai chantier. Si elle reste « potable » au bout d'une journée, on retient la meilleure prise et on avance : la voix se remplace en post sans retoucher une seule image, puisque H3 ne sert qu'aux lèvres.
3. Les deux conspirateurs — ensemble, en fin de course, une petite heure.

---

## Effets visuels

### `FX_flammes_danse`
- **Statut** : ✅ · **Critique** : oui
- **Dérivé de** : `CHAR_maya` (référence de mouvement, pas d'édition Qwen directe)
- **Fichier** : `VFX_flammes_.png` (fourni par l'utilisateur, retenu comme master)
- **Description canonique** : Flamme réactive liée au don réel de Maya — jamais un feu ambiant, toujours un feu qui naît et retombe avec l'intensité de son geste (gerbe verticale brève à l'entrée, anneau continu autour d'une jambe tendue en rotation, tourbillon complet autour du corps en saut vertical, onde de choc qui se propage une fois au sol à l'impact, ruban en huit tracé par les mains qui se referme en anneau puis éclate en braises lors d'un tour rapide). Se présente comme un ruban de feu continu en large courbe en S, silhouette du bord supérieur découpée en pointes de langues de flamme nettes, cœur jaune quasi blanc virant à l'orange puis au rouge sur les pointes, fines étincelles qui se détachent du bord de fuite. Teinte cohérente avec ses yeux rubis, jamais bleue ni verte. Dans l'univers, prise pour un tour de danseuse (artifices, torches dissimulées) — pas de fumée noire ni d'odeur de poudre suggérée à l'image, l'effet doit rester élégant et « propre ».
- **Usage** : plans 60 (gerbe d'entrée), 90 (anneau de flamme autour d'une jambe tendue en coup de pied tournant, deux rotations, dissipation à la réception), 120 (tourbillon complet en saut vertical, onde de choc à l'impact) et 140+150 (ruban en huit aux mains pendant un tour rapide debout, anneau puis éclat en braises) ; réutilisable pour toute future manifestation du don dans la série.
- **Note de fabrication** : le master reste volontairement **une simple traînée de flamme isolée, sans jambe ni corps dans le cadre**. Une référence avec des jambes se fait systématiquement recopier telle quelle par le modèle vidéo (mauvais personnage, mauvaise posture) au lieu d'habiller le mouvement de Maya. Le positionnement sur ses chevilles/son saut se fait uniquement via le texte du prompt H3, jamais dans l'image de référence elle-même — et ce texte doit décrire précisément la forme du ruban (courbe en S, pointes, dégradé de couleur, étincelles), pas juste « flamme réactive », pour que le rendu vidéo respecte mieux la référence.
- **Prompt Krea 2 (reconstitution — pour variantes futures)** :
  ```text
  A single continuous ribbon of fire sweeping through a smooth flowing S-curve, its upper edge broken into sharp jagged flame-tip licks, glowing pale near-white at its core and deepening through orange to red toward the tips, fine embers scattering off its trailing edge, no legs, no limbs, no character, no body part of any kind in frame — flame only, floating in empty space. Clean elegant fire with no visible black smoke, dark neutral background to isolate the flame shape clearly.
  ```

## Références contextuelles (keyframes)

Ces références ne sont pas des masters figuratifs classiques (personnage neutre sur fond plat, décor seul) mais des captures ou clips directement extraits d'un rendu déjà validé — soit un test H3 du projet, soit une référence de mouvement externe (footage réel, libre de droits) — montrant le sujet ou le mouvement en situation, pose/décor/lumière déjà en place ou mécanique de mouvement déjà lisible. H3 accepte des références vidéo en plus des images (`<Video N>` en plus de `<Picture N>`) — utile quand c'est le mouvement complet qui doit servir de référence, pas juste une pose figée. Objectif : donner au modèle une base qui n'a plus rien à recomposer ou à improviser pour ce plan précis.

### `KEY_garde_penombre`
- **Statut** : ✅ · **Critique** : non
- **Dérivé de** : capture extraite du test vidéo du plan 110 (H3), pas une génération Krea 2
- **Fichier** : `KEY_garde_penombre.png` (recadré en plan américain, ~305×262 source puis upscale x2 — basse def native mais suffisante comme référence de pose/décor/lumière pour un appel H3 ; à repasser en Qwen upscale si un master haute def devient nécessaire un jour)
- **Description canonique** : L'homme massif déjà en place, cadré serré en plan américain (jusqu'à la taille, dague visible), adossé près d'une colonne sculptée dans un couloir en pénombre bleu nuit, bras croisés. Cadrage déjà proche d'un plan italien resserré — c'est exactement l'image de départ voulue pour le shot 2 du plan 110, rien à reconstruire.
- **Usage** : plan 110 (shot 2), en remplacement de `HUM_homme_massif` pour cet appel précis. La fiche 4 vues neutre reste la référence canonique du personnage pour le reste de la série.

### `KEY_reference_salto`
- **Statut** : ✅ · **Critique** : oui
- **Type** : référence **vidéo** (H3 accepte des références vidéo en plus des images — pas seulement une frame extraite)
- **Dérivé de** : vidéo de référence de mouvement fournie par l'utilisateur (footage réel, personne physique, libre de droits — pas un rendu H3, pas un personnage sous licence), **recadrée sur le seul panneau de profil**
- **Fichier** : `KEY_reference_salto.mp4` — recadré depuis la source split-screen originale (avant/profil) pour ne garder que le panneau de profil pur (moitié gauche de la vidéo brute), ~8s, du lancer à la réception
- **Description canonique** : Référence de mécanique de mouvement uniquement (arc du saut, position des bras au lancer et à la rotation, tuck des jambes, timing complet lancer→réception), vue de profil pur du début à la fin — jamais une référence d'apparence ou d'identité, aucun trait du sujet filmé ne doit être retenu. À utiliser pour ancrer la physique du salto de Maya, pas son style vestimentaire ni son visage.
- **Bug corrigé** : la vidéo source était en split-screen (panneau face + panneau profil dans la même image). En référençant la vidéo entière, H3 piochait tantôt l'orientation face, tantôt profil, ce qui provoquait un effet de « retour de face » en pleine rotation quand elle aurait dû montrer son dos. Recadrer sur le seul panneau de profil supprime l'ambiguïté à la source.
- **Usage** : plus utilisée dans la fiche actuelle — le plan 140+150 a abandonné le salto (bug d'inversion non résolu, voir historique dans la fiche de plan) au profit d'une rotation debout. Conservée au registre en cas de réemploi futur (un salto ailleurs dans la série, filmé différemment).

### `KEY_maya_dos_renverse`
- **Statut** : ⬜ · **Dérivé de** : `CHAR_maya` (panneau vue de dos de la fiche 4 vues) · **Critique** : oui
- **Description canonique** : Maya vue de dos, renversée (tête en bas) comme au point d'inversion du salto — bras engagés dans le mouvement, jambes qui suivent la rotation plutôt qu'une pose neutre debout, jupe rouge profond et pan bleu qui s'évasent avec l'élan, un espace dans le tissu de la ceinture là où la dague dissimulée s'apprête à apparaître. Ancre visuelle directe pour empêcher le modèle de repasser en vue de face pendant la rotation.
- **Édition Qwen** — source : `CHAR_maya`
  ```text
  Crop to isolate the back-view panel of the character sheet only.
  Rotate the figure 180 degrees so she appears upside-down, as if captured mid-inversion during a backflip.
  Adjust the pose: arms extended with the momentum of the flip, legs trailing rather than standing neutrally, the deep-red skirt and blue sash flaring outward as if caught mid-motion, leaving a slight gap in the belt fabric near the waist where a hidden dagger would be about to catch the light.
  Preserve her exact hair, costume colors, and design details from the source — do not invent new elements.
  ```
- **Usage** : plus utilisée dans la fiche actuelle — le plan 140+150 a abandonné le salto (bug d'inversion non résolu malgré cette ancre) au profit d'une rotation debout, jamais inversée. Production abandonnée, entrée conservée pour mémoire.

### `KEY_reception_pose`
- **Statut** : ✅ · **Critique** : non
- **Dérivé de** : image de pose fournie par l'utilisateur, personnage original libre de droits (pas de personnage sous licence)
- **Fichier** : `KEY_reception_pose.png`
- **Description canonique** : Pose assise au sol — jambe gauche pliée, genou relevé, pied à plat près de la hanche, avant-bras posé sur le genou ; jambe droite tendue complètement à l'horizontale sur le côté ; main droite posée au sol près de la hanche pour l'appui ; buste droit, léger angle, regard direct et assuré.
- **Usage** : plan 140+150 (shot 4, réception), branchée en `<Picture 4>` — remplace la description texte-seule utilisée en attendant cette référence.

## Décors — Le Voile Écarlate

### `PROP_enseigne_cuivre`
- **Statut** : ✅ · **Critique** : non
- **Description canonique** : Petite enseigne en cuivre martelé, gravée en calligraphie du nom du cabaret, « Le Voile Écarlate », suspendue au-dessus d'une porte discrète en arc en fer à cheval. Patine verte légère par endroits, reflets chauds de torche.
- **Prompt Krea 2** :
  ```text
  Close composition on a small hammered-copper sign hanging above a narrow horseshoe-arched wooden doorway, engraved with elegant calligraphy reading "Le Voile Écarlate", faint green patina in the engraved grooves, warm torchlight catching the metal's texture, Moroccan medina architectural detail around the frame edges, night setting.
  ```

### `DEC_auberge_entree`
- **Statut** : ✅ · **Critique** : non
- **Description canonique** : Entrée discrète du cabaret, une porte étroite en arc en fer à cheval noyée entre les échoppes fermées d'un bazar marocain nocturne, aucune signalisation hormis `PROP_enseigne_cuivre`. Moucharabiehs et zellige aux abords, torches basses.
- **Prompt Krea 2** :
  ```text
  Wide establishing shot of a narrow horseshoe-arched doorway tucked unassumingly between shuttered market stalls in a nocturnal Moroccan medina bazaar, carved wooden moucharabieh screens and chipped zellige tilework framing the entrance, a small engraved copper sign hanging above the door, warm low torchlight glowing against weathered ochre-plastered walls, thin drifting haze, deep indigo night sky above the rooftops, richly detailed architecture, no grand or wide entrance — deliberately modest and easy to miss.
  ```

### `DEC_auberge_salle`
- **Statut** : ✅ · **Critique** : non
- **Description canonique** : Grande salle du cabaret. **Aucune table ni chaise** : les clients ordinaires s'installent sur de larges coussins de sol et des tapis, la clientèle fortunée dispose de canapés richement décorés et de tables basses en cuivre dans une zone légèrement en retrait. Bar discret près de l'entrée, personnel qui ne s'impose jamais. Au centre exact de la salle, une **scène circulaire surélevée**, dont le fond est fermé par un épais rideau de velours **écarlate**, actuellement clos. Architecture marocaine : arcs en fer à cheval, colonnes sculptées, zellige au sol, moucharabiehs, lanternes de cuivre suspendues.
- **Prompt Krea 2** :
  ```text
  Interior of a grand Moroccan-medina-style cabaret hall, horseshoe-arched columns, carved wooden lattice moucharabieh screens, a zellige-tiled floor, hanging copper lanterns casting warm smoky light. At the exact center of the room, a raised circular stage platform, its curved backdrop formed by a thick, closed scarlet-red velvet curtain. Around the stage, ordinary patrons sit cross-legged or reclined on large scattered floor cushions and patterned rugs — no tables, no chairs anywhere in this zone. Set slightly further back and faintly elevated, a smaller area holds richly embroidered cushioned sofas and low hammered-copper tables reserved for wealthier guests. A low, unobtrusive bar counter stands near a side entrance, away from the seating. Wide symmetrical composition, warm torchlit atmosphere, dreamlike fantastical opulence.
  ```

### `DEC_halo_dore`
- **Statut** : ✅ · **Dérivé de** : `DEC_auberge_salle` · **Critique** : oui
- **Description canonique** : La même scène circulaire, rideau écarlate **ouvert**, baignée d'un halo de lumière dorée chaude et intense — pensée pour des numéros osés, visible à 360° depuis tout le pourtour de la salle. Contraste radical avec le reste du décor : **toutes les lanternes de cuivre sont éteintes**, toute la salle (coussins, canapés, bar, arcs, colonnes) plonge dans une **pénombre bleu nuit profonde et quasi uniforme**, sans autre source de lumière chaude visible. Le halo doré du centre devient ainsi la seule source lumineuse de toute l'image.
- **Édition Qwen** — source : `DEC_auberge_salle`
  ```text
  Open the closed scarlet-red curtain fully to reveal the raised circular stage.
  Extinguish every hanging copper lantern throughout the room — no warm light remains anywhere except on the stage itself.
  Plunge the entire rest of the hall into deep, near-uniform indigo-blue darkness: the floor cushions, the wealthy guests' sofas and low tables, the bar counter, the horseshoe arches, and the carved columns should all read as dim cool-blue silhouettes with almost no visible detail.
  Bathe only the raised circular platform in an intense, sharply bright warm golden spotlight, so it stands out as the single glowing light source in an otherwise dark, cold-toned room.
  Keep the curtain fabric, the stage's shape, and every architectural detail unchanged — only the lighting state differs.
  ```

### `PROP_rideau_velours`
- **Statut** : ✅ · **Critique** : non
- **Description canonique** : Le rideau de fond de la scène elle-même — un lourd drapé de velours **écarlate** en plis verticaux, qui sert aussi de passage direct vers le couloir des coulisses. Fermé, il accroche des reflets d'or sur ses plis et un liseré doré cousu en bordure ; entrouvert, il ne révèle qu'une ombre au-delà. C'est par ce rideau que Maya se glisse après son numéro.
- **Prompt Krea 2** :
  ```text
  Close composition on the cabaret stage's own backdrop curtain: a thick scarlet-red velvet drape hanging in heavy vertical folds directly behind a circular performance platform. Warm torchlight catches a golden trim stitched along its edges. The curtain is parted slightly at one side, revealing only shadow beyond, hinting at a passage through to a backstage corridor.
  ```

### `DEC_couloir_bois`
- **Statut** : ✅ · **Critique** : oui
- **Description canonique** : Couloir étroit en bois brut, **situé directement derrière la scène** — ce sont littéralement les coulisses. Le rideau écarlate de la scène (`PROP_rideau_velours`) est visible le long d'un des côtés du couloir, à l'extrémité proche. Le reste du passage est baigné d'une **lumière bleu nuit constante et saturée**, symboliquement associée à la robe de la Tenancière — seul le rouge du rideau vient rompre l'indigo. Petite lucarne haute, table de service, porte de service à l'extrémité opposée, proximité sonore des cuisines.
- **Prompt Krea 2** :
  ```text
  Narrow backstage corridor built from rough-hewn dark wood, positioned directly behind a cabaret's central stage. Along one side, near the corridor's entrance, hangs the stage's own scarlet-red backdrop curtain in heavy folds — the only warm color note in the scene. The rest of the passage is bathed in a deep, saturated indigo night-blue light with no other warm counterpoint, a small high skylight barely brightening one section, a plain wooden service table pushed against the opposite wall, a heavy service door visible at the far end with a thin warm light leaking beneath it, atmospheric dust motes suspended in the blue light, moody desaturated palette dominated by deep blues and near-black shadow.
  ```

### `DEC_ruelles_bazar`
- **Statut** : ✅ · **Critique** : oui
- **Description canonique** : Dédale de ruelles nocturnes d'un bazar de style perse/arabe — jamais médiéval européen. Passages étroits sous auvents de toile rayée, murs crépis ocre, zellige écaillé, arcs en fer à cheval, lanternes de cuivre éteintes pour la nuit, échoppes aux volets clos, pavés humides reflétant le clair de lune. Référence directe : médina de Marrakech.
- **Prompt Krea 2** :
  ```text
  Nocturnal maze of narrow Persian/Arab bazaar back alleys inspired by the Marrakech medina, striped cloth awnings strung overhead between buildings, ochre-plastered walls with patches of chipped zellige tilework, horseshoe-arched doorways, unlit hanging copper lanterns, shuttered market stalls closed for the night, wet cobblestones reflecting cool moonlight, deep pooling shadows between passages, a sliver of moon visible high between flat rooftops, muted blue-grey palette with occasional warm lantern glow from a distant window, no half-timbered or European medieval architecture.
  ```

---

## Figurants

Fiche personnage (gabarit 4 vues) pour tout figurant identifiable et récurrent. Exceptions volontaires : `HUM_clients_auberge` (masse générique, pas d'individu à suivre) et `HUM_silhouettes_sombres` / `HUM_silhouettes_encapuchonnees` (anonymat voulu par le scénario — jamais de gros plan visage prévu).

**Règle transversale** : tout figurant, décor peuplé ou silhouette doit porter une tenue clairement indienne/arabe/perse (robes, djellabas, turbans, voiles touaregs, tissus brodés...) — jamais de costume neutre ou occidental, sous peine de casser l'ancrage fantasy du monde.

### `HUM_sitariste`
- **Statut** : ✅ · **Critique** : non
- **Description canonique** : Musicien assis dans un coin peu éclairé de la salle, mains posées sur les cordes du sitar. Robe traditionnelle simple, turban léger.
- **Prompt Krea 2** :
  ```text
  An older tavern musician with weathered hands, a simple light turban, plain traditional robes, seated cross-legged with a sitar, warm dim torchlight, character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground.
  ```

### `HUM_homme_massif`
- **Statut** : ✅ · **Critique** : non
- **Description canonique** : **Reclassé en garde** du cabaret plutôt qu'en simple client — posté au bar, silhouette massive et immobile, regard qui ne participe jamais à l'ambiance festive. Présence clairement menaçante : carrure intimidante, visage marqué par une ou deux cicatrices, expression dure et fermée, pas du muscle décoratif — un homme qu'on évite de croiser. Tenue de garde de style maghrébin : djellaba sombre ajustée, ceinture large en cuir tenant une jambiya (dague courbe), turban simplement noué.
- **Prompt Krea 2** :
  ```text
  A massive, heavyset palace guard with an intimidating, threatening presence, a hard scarred face with one or two visible scars across the brow or cheek, a cold unblinking stare, thick crossed arms, a traditional Maghreb-style guard uniform — a dark fitted djellaba with leather straps, a wide sash belt holding a curved jambiya dagger, a simply wrapped turban, standing at attention like a man who has hurt people before, character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground.
  ```

### `HUM_silhouettes_sombres`
- **Statut** : ✅ · **Critique** : non
- **Description canonique** : Deux clients du cabaret comme les autres, pas des mystères ambulants — simplement installés dans le coin le plus sombre de la salle, sur des coussins bas, verres pleins et intacts devant eux. Tenues d'inspiration touarègue : longs voiles indigo (tagelmust) enroulés autour de la tête et du bas du visage, robes amples sombres. Une lumière froide et bleutée les enveloppe, contrastant avec le reste de la salle en torchlight chaude, ce qui les fait paraître en pénombre sans qu'ils soient réellement dissimulés.
- **Prompt Krea 2** (scène, pas de fiche 4 vues — anonymat voulu) :
  ```text
  Two ordinary cabaret patrons — not mysterious figures, just guests — seated together on low floor cushions in the darkest corner of a Moroccan-style cabaret hall. They wear deep-indigo Tuareg-style tagelmust veils wrapped around their heads and lower faces, loose dark flowing robes. A cool blue-toned light washes over them, distinct from the warm torchlight filling the rest of the hall, leaving them naturally shadowed rather than hooded in secrecy. Two full drinks untouched on a low brass table before them.
  ```

### `HUM_marchand_riche`
- **Statut** : ✅ · **Critique** : non
- **Description canonique** : Riche marchand indien, bedonnant, bagué à chaque doigt, tenue richement brodée et colorée, visage brûlant d'envie pour Maya, assis sur l'un des canapés VIP près de la scène.
- **Prompt Krea 2** (prompt testé et validé) :
  ```text
  portly Indian merchant, round belly straining richly embroidered silk robes in deep jewel tones with gold thread patterns, an elaborate turban, thick gold rings crowding every finger, an eager hungry expression with parted lips, warm golden light, character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground.
  ```

### `PROP_main_marchand_piece`
- **Statut** : ⬜ · **Dérivé de** : `HUM_marchand_riche` · **Critique** : oui
- **Description canonique** : Gros plan sur la main baguée du marchand, une pièce d'or coincée entre le pouce et l'index, le pouce armé contre la tranche de la pièce comme prêt à la catapulter d'une pichenette — pas un lancer classique, un geste de pouce-ressort.
- **Usage** : plan 130 (shot 2, insert main), référence de pose des doigts pour éviter qu'H3 improvise un lancer générique.
- **Édition Qwen** — source : `HUM_marchand_riche`
  ```text
  Crop closely onto the hand alone, isolating the fingers and a small gold coin.
  Preserve the exact ring designs, skin tone, and embroidered sleeve fabric shown on the source.
  Position a gold coin pinched between thumb and forefinger, the thumb cocked back against the coin's edge as if loaded to flick it forward like a slingshot — not held flat, not mid-toss.
  ```

### `HUM_silhouettes_encapuchonnees`
- **Statut** : ✅ · **Critique** : non
- **Description canonique** : Deux silhouettes croisées dans une ruelle du bazar, tenues d'inspiration touarègue — longs voiles indigo (tagelmust) enroulés autour de la tête et dissimulant le bas du visage, robes de voyage amples et sombres. Éclairage bleuté dominant (clair de lune renforcé), qui masque les traits sans recourir à des capuchons génériques — jamais de gros plan sur les visages.
- **Prompt Krea 2** (scène, pas de fiche 4 vues — anonymat voulu) :
  ```text
  Two figures standing together in a narrow medina alley, wearing deep-indigo Tuareg-style tagelmust veils wound around their heads and covering the lower face, loose dark traveling robes. Strong cool blue moonlight rim-lights their silhouettes against an ochre-plastered stone wall, faces left in soft shadow beneath the wrapped veils rather than fully hidden hoods, distant and anonymous framing, striped awning overhead.
  ```

### `HUM_clients_auberge`
- **Statut** : ✅ · **Critique** : non
- **Description canonique** : Foule mixte de clients du cabaret — marchands en robes lourdes, mercenaires armés, voyageurs poussiéreux — installés sur des coussins de sol autour de la scène, qui entre, s'installe, puis réagit au spectacle. Masse générique, pas de fiche personnage.
- **Prompt Krea 2** :
  ```text
  A mixed group of tavern patrons seated on large floor cushions and patterned rugs around a central stage in a Moroccan-style cabaret hall, heavyset merchants in layered robes, mercenaries with sheathed blades and worn leather armor, dust-covered travelers with packs, warm torchlight across varied skin tones and expressions, medium wide composition, lived-in period costuming, no tables or chairs.
  ```

---

# Ordre de fabrication conseillé

1. `CHAR_maya_yeux`, `PROP_dague_maya` et `FX_flammes_danse` — dérivés/effets critiques de Maya, prêts à produire dès maintenant (le feu apparaît dès le plan 60).
2. `DEC_auberge_salle` (master) puis `DEC_halo_dore` (dérivé) — établissent la scène et sa mécanique de rideau.
3. `PROP_rideau_velours` — dépend visuellement de `DEC_auberge_salle`, à produire juste après pour garder la cohérence du rouge écarlate.
4. `DEC_couloir_bois` — dépend de `PROP_rideau_velours` pour le raccord du rideau visible sur le côté.
5. `PROP_enseigne_cuivre`, `DEC_auberge_entree`, `DEC_ruelles_bazar` — indépendants, en parallèle.
6. Figurants — sans urgence, à produire en dernier. `HUM_homme_massif` en priorité basse malgré son changement de rôle (pas de plan à enjeu le concernant directement).

Les **voix** suivent leur propre ordre (voir section *Voix*) et se produisent **en amont de toute génération vidéo dialoguée** : la prise audio est une entrée du plan, pas une couche de post-production.

# Cohérence à surveiller

La fiche de plan (`FICHE_DE_PLAN_S01_maya.md`) décrit encore la salle avec des mots comme « tables » et un rideau générique de coulisses dans ses prompts vidéo — hérités de la version précédente du registre. Le sens reste juste (les décors full-reference porteront la bonne image quoi qu'il arrive), mais le texte n'est plus littéralement synchronisé avec ces nouvelles descriptions. Dis-moi si tu veux que je repasse dessus pour aligner le vocabulaire (coussins/canapés, rideau écarlate de scène) — sinon je le fais à la prochaine passe sur la fiche.
