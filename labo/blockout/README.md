# Labo blockout : un pré-rendu 3D comme vidéo de référence H3

Labo jetable. L'idée à tester : rendre un plan en 3D très simple (capsules, boîtes, sphères grises étiquetées, sol en damier,
fond neutre) avec son mouvement de caméra, et passer ce mp4 à MiniMax H3 comme `<Video 1>` pour qu'il ne transmette **que** la
caméra, le cadrage, le placement et le timing. L'apparence vient des images d'assets (`<Subject N>` défini par `<Picture N>`).

Rien ici ne touche l'application, le worker ni la base. Le chemin « vidéo de référence » du worker n'a jamais été rendu en réel :
ce labo en est aussi le premier essai.

## Condition de réussite

> Sur au moins 3 plans sur 4, la caméra du rendu H3 suit celle de la référence **et** les personnages gardent l'apparence de
> leurs assets.

Échec si la caméra ne suit pas mieux qu'avec le texte seul (variante A), ou si le rendu reprend l'aspect du blockout (gris,
capsules, damier, étiquettes).

## Lancer

Il faut Node 20 ou plus, ffmpeg et ffprobe dans le PATH, et Chrome ou Edge installé (sinon `CHROME_PATH=<exécutable>`).

```bash
cd labo/blockout
npm install          # three + puppeteer-core (ne télécharge aucun navigateur)
npm run valider      # contrôle les JSON d'exemples/
npm run rendre       # rend les quatre exemples dans sortie/<id>.mp4 (environ 10 s en tout)
npm run verifier     # ffprobe + trois images par plan dans sortie/images/
```

Un seul plan : `node rendre.mjs exemples/03_arc_un_sujet.json` (idem pour `verifier.mjs` et `schema.mjs`).

`sortie/` est ignoré par git : tout s'y refait à l'identique. Chaque rendu écrit `sortie/<id>.sha256.txt`, l'empreinte de la suite
des images PNG ; deux rendus du même JSON sur la même machine donnent la même empreinte (et le même mp4, octet pour octet).

## Fichiers

| Fichier | Rôle |
|---|---|
| `plan.schema.json` | Le schéma d'un plan : que des énumérations, aucune coordonnée libre |
| `schema.mjs` | Validation (schéma + contrôles croisés), nombre d'images d'une durée |
| `page/scene.js` | Ce que chaque valeur désigne en géométrie (tables en tête de fichier), et le rendu de l'image *i* |
| `rendre.mjs` | Chrome sans écran, capture image par image, encodage ffmpeg |
| `verifier.mjs` | Contrôle ffprobe et extraction d'images |
| `exemples/` | Quatre plans : fixe, push in sur deux sujets, arc autour d'un sujet, tracking d'une marche |
| `soumettre.mjs` | **Brouillon non exécuté** de la soumission à ComfyUI |

## Le schéma en bref

- **`duree`** : 5 à 10 s (entier). Le nombre d'images n'est pas `duree × 24` : il suit l'expression du nœud `22:24` du workflow
  (forme 17k+5), pour que la référence ait exactement la longueur de ce que H3 génère : 5 s = 124, 6 s = 158, 7 s = 175,
  8 s = 192, 9 s = 226, 10 s = 243 images.
- **`cadence`** : 24, la cadence de génération de H3.
- **`resolution`** : `608x352` (défaut des exemples) ou `864x480`. Voir plus bas.
- **`cadre`** (état de départ) : `taille` (extreme_wide, wide, full, medium, medium_close_up, close_up), `angle` (eye_level,
  low_angle, high_angle, bird_eye), `axe` (face, trois_quarts_gauche/droit, profil_gauche/droit, dos), `cible` (un sujet ou
  `groupe`).
- **`camera`** : `mouvement` (vocabulaire H3 : static, zoom_in/out, push_in, pull_out, pan_left/right, truck_left/right,
  tilt_up/down, pedestal_up/down, arc_left/right, tracking, shake, roll_clockwise/counterclockwise), `amplitude`
  (small/medium/large), `vitesse` (slow/normal/fast), `arrivee.taille` (état d'arrivée d'un push ou d'un zoom, à la place de
  l'amplitude), `suit` (le sujet d'un tracking).
- **`sujets`** (1 à 5) : `id`, `etiquette`, `forme` (capsule, boite, sphere), `gabarit` (petit/moyen/grand), `placement` sur la
  grille gauche/centre/droite × avant/milieu/fond (pas de 1,5 m), `orientation` (vers_avant/fond/gauche/droite, marquée par une
  barre sombre côté face), `deplacement.vers` (une autre case, en ligne droite sur toute la durée).
- **`decor`** (facultatif) : `sol` (`grille` ou `uni`), `etiquettes` (true/false).

### Pourquoi 608 × 352

`lib/resolution-video.ts` ne connaît que des mégapixels (0,2 / 0,3 / 0,4), pas de largeur ni de hauteur : la taille en pixels sort
du nœud `22:9` (ResolutionSelector, 16:9, multiple de 32). Avec la règle « mégapixels × 1024², racine, arrondi au multiple de 32 le
plus proche », 0,4 MP donne 864 × 480, ce que `docs/CAHIER_DE_TESTS.md` confirme ; la même règle donne **608 × 352 à 0,2 MP**
(0,214 MP, rapport 1,73). C'est donc la taille que H3 génère à 0,2 MP : la référence et le rendu ont le même cadre, sans
redimensionnement. Le 608 × 352 est une déduction (jamais lu sur un rendu) : à contrôler sur le premier brouillon. `864x480` est
là pour refaire l'essai à 0,4 MP, la résolution que le worker verrouille en production.

## Protocole de test

Pour chaque plan, **trois rendus, même seed, même prompt de base, mêmes images d'assets, même durée, même résolution** :

| Variante | Vidéo branchée | Ce que le prompt dit de la vidéo |
|---|---|---|
| **A** | non | rien (prompt de base) |
| **B** | oui, `<Video 1>` | son rôle, explicitement : caméra, cadrage, timing ; apparence à ne PAS reproduire |
| **C** | oui, `<Video 1>` | une ligne neutre, sans rôle |

Le prompt de base décrit la caméra en mots, comme toutes les fiches de Cadence : A mesure ce que le texte seul obtient, B ce que
la référence ajoute, C ce que H3 fait d'une vidéo qu'on ne lui explique pas (risque attendu : il recopie les capsules).

À regarder, référence et rendu côte à côte :

1. **Caméra** : même type de mouvement, même sens, même moment de départ et d'arrêt, même cadre de fin.
2. **Placement** : chaque personnage du même côté du cadre, à la même échelle, tourné du même côté.
3. **Apparence** : personnages conformes à leurs assets ; ni gris, ni capsule, ni damier, ni étiquette à l'image.

Un plan est réussi si la variante B passe les trois points, et fait mieux que A sur le premier ou le second.

### Texte des prompts

Le prompt complet suit le format du guide (`docs/references/h3-guide-fullref.md`) : six sections. Ci-dessous le plan
`02_push_in_deux_sujets` ; les passages entre crochets `[…]` sont à remplir avec la description des assets.

**Variante A (base)**

```text
subject_definitions:
<Subject 1> is the young woman in <Picture 1>, [appearance of Maya].
<Subject 2> is the woman in <Picture 2>, [appearance of the Tenancière].

summary:
[reference generation] The target video shows <Subject 1> and <Subject 2> standing face to face in a single continuous shot while the camera slowly pushes in from a full shot to a medium shot.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - [features retained].
<Subject 2> (appears in [Shot 1]): fully_preserved - [features retained].

detailed_description:
[One or two sentences of style.]
[Shot 1] A full two-shot at eye level. <Subject 1>, [appearance], stands on the left of the frame in profile, facing right. <Subject 2>, [appearance], stands in the center-right of the frame in profile, facing left, about one step away from her. [Action.] The camera pushes in at slow speed throughout the shot, from the full shot to a medium shot that keeps both of them in frame.

overall_soundscape:
[…]

non_diegetic_music:
N/A
```

**Variante B** : le prompt A, plus ces lignes (une par section, ajoutée à la fin de la section, sauf la dernière qui remplace
la phrase de caméra).

```text
subject_definitions:
<Video 1> is a camera and staging reference for the whole target video: a grey 3D previsualization in which the capsule labeled MAYA stands for <Subject 1> and the capsule labeled TENANCIERE stands for <Subject 2>. It provides only the camera movement, the framing, the placement of the subjects in the frame and the timing. Its appearance must NOT be reproduced: no grey untextured shapes, no capsules, no checkered floor, no text labels.

summary:
The camera movement, framing and timing follow <Video 1>; the appearance of <Subject 1> and <Subject 2> comes only from <Picture 1> and <Picture 2>.

retention_analysis:
<Video 1> (camera movement, framing and timing): fully_preserved - the camera path, the shot size, the placement of the subjects and the pacing are followed; none of its grey geometric appearance is retained.

detailed_description (dernière phrase de [Shot 1]):
Following <Video 1>, the camera pushes in at slow speed throughout the shot, from the full shot to a medium shot that keeps both of them in frame.
```

**Variante C** : le prompt A, plus cette seule ligne à la fin de `subject_definitions`. Rien d'autre ne change.

```text
<Video 1> is a reference video for the target video.
```

Pour les trois autres plans, seules changent la ligne d'équivalence des étiquettes (B) et les phrases de cadre et de caméra :

| Plan | Phrase de cadre | Phrase de caméra |
|---|---|---|
| `01_plan_fixe` | `A full shot at eye level. <Subject 1> stands in the center of the frame, facing the camera.` | `The camera holds a static shot for the whole duration.` |
| `03_arc_un_sujet` | `A medium shot at eye level. <Subject 1> stands in the center of the frame, facing the camera.` | `The camera moves in an arc shot to the right around <Subject 1> at slow speed, ending on her three-quarter profile while she stays in the center of the frame.` |
| `04_tracking_marche` | `A medium shot at eye level. <Subject 1> is seen in profile, facing right.` | `A tracking shot follows <Subject 1> as she walks from left to right at a steady pace, keeping her in the center of the frame.` |

Dans `03`, l'estrade, et dans `04`, la caisse, ne sont que des repères de parallaxe : en B, ajouter à la définition de
`<Video 1>` `The box labeled ESTRADE is only a spatial landmark.` (ou `CAISSE`), sauf si un décor leur correspond.

Si B reprend quand même l'aspect du blockout : essayer `weak_reference` à la place de `fully_preserved` sur la ligne
`<Video 1>`, puis `decor.etiquettes: false`, puis `decor.sol: "uni"` (un essai à la fois).

## Soumettre (brouillon)

`soumettre.mjs` n'a **jamais été exécuté**. Il lit `workflows/video-generation/VID_Generation.json`, y injecte prompt (`22:11`),
durée (`22:23`), résolution (`22:9`), seed (`16`), les images (`LoadImage` + `ImageScaleToTotalPixels` → `ref_images`) et la vidéo
(`LoadVideo` + `GetVideoComponents` → `ref_videos.ref_video_0`), comme `worker/comfyui/mapping.ts`. Sans `--envoyer` il écrit
seulement le graphe dans `sortie/soumission_<id>_<variante>.json` : le relire avant le premier envoi.

```bash
# relecture du graphe, rien n'est envoyé
node soumettre.mjs --plan exemples/02_push_in_deux_sujets.json --variante B --prompt prompts/02_B.txt --seed 1234 \
  --image <CHAR_maya.png> --image <CHAR_tenanciere.png>

# envoi (COMFYUI_URL ou --url)
COMFYUI_URL=http://<machine>:8188 node soumettre.mjs … --envoyer
```

L'ordre des `--image` fait les `<Picture 1>`, `<Picture 2>`… ; la variante A n'attache pas la vidéo, B et C attachent
`sortie/<id>.mp4`. Les fichiers sont déposés par `/upload/image` sous `blockout_<nom>`. Le brouillon sort du nœud `18`
(`blockout_<id>_<variante>_<seed>_00001.mp4`).

Les points devinés sont listés en tête de `soumettre.mjs` : dépôt d'un mp4 par `/upload/image`, correspondance `<Video 1>` ↔
`ref_video_0`, résolution 0,2 MP sur un workflow verrouillé à 0,4 MP en production, comportement du nœud face à une référence d'une
autre taille ou d'une autre longueur, latent enregistré à chaque essai (`output/h3_latents/blockout_…`, à supprimer à la main).

## Choix et limites

- **Rendu** : Three.js dans Chrome sans écran, piloté par puppeteer-core, WebGL forcé sur SwiftShader (calcul par le processeur).
  Aucun navigateur téléchargé, aucune carte graphique requise, et le même résultat avec ou sans. Chaque image est une fonction de
  son indice : pas d'horloge, pas d'enregistrement en direct. L'identité des images est garantie sur une même machine et une même
  version de Chrome ; d'une version à l'autre, l'anticrénelage ou le texte des étiquettes peuvent varier de quelques pixels.
- **Vitesse** : à durée et amplitude fixées, la vitesse est la part du plan occupée par le mouvement (slow 100 %, normal 60 %
  après 20 % d'attente, fast 30 % après 35 %). Un mouvement « fast » laisse donc un cadre immobile avant et après.
- **Déplacements** : d'une case à une autre, soit 3 m au plus en largeur ou en profondeur (4,2 m en diagonale), à vitesse
  constante sur toute la durée. Pas de marche rapide, pas d'entrée ni de sortie de champ, pas d'arrêt en cours de plan.
- **Mouvements non couverts** : `POV` ; les combinaisons (push in + tilt, arc + pedestal) ; un mouvement qui change en cours de plan ;
  les coupes (un JSON = un plan continu). `tracking` suit en translation pure, à distance constante.
- **Un seul sujet par case**, pas de pose (assis, penché), pas de geste : le blockout dit où et vers où, pas quoi.
- **Cible `groupe`** : le cadre s'élargit pour contenir tous les sujets ; un `medium` sur deux sujets écartés de deux cases est donc
  plus large qu'un `medium` sur un seul.
- **`low_angle`** : la caméra ne descend pas sous 20 cm du sol ; en plan large l'angle réel est donc plus faible que 20°.
- Seuls les quatre exemples ont été regardés au début, au milieu et à la fin. Les autres mouvements (zoom_out, pull_out, pan_left,
  truck_right, tilt_up, pedestal_up, shake, roll_clockwise) n'ont eu qu'un essai rapide en grande amplitude, jugé sur la dernière
  image (sens correct) ; leurs opposés et les amplitudes small/medium n'ont pas été regardés.
- `prompts/` n'existe pas : les fichiers de prompt passés à `soumettre.mjs` sont à écrire à partir des blocs ci-dessus.
