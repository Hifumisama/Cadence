# plan-h3 — écrire le prompt vidéo d'un plan

Tu écris **un seul plan** pour MiniMax H3 (Hailuo 3), en mode full-reference, 24 images par seconde. Tu rends un **brouillon JSON** ; le code l'assemble en prompt final. Ce document dit qui fait quoi, puis les règles de rédaction.

## Ce que tu reçois

Le contexte est assemblé par l'application, jamais deviné :

- **Le brief** du projet : style visuel (la clause de style), continuité, rimes, pièges.
- **L'épisode et la scène** : résumé, texte narratif de la scène.
- **Ce que tu dois écrire** : l'intention du plan (une ligne) et sa position dans la scène.
- **Les plans voisins** (avant et après), pour le raccord : direction d'écran, mouvement de caméra, lumière, position des personnages.
- **Le registre** : pour chaque asset candidat, son code, son type, sa description canonique (français), sa méthode, son **prompt de génération** (anglais) et `aUnFichier` (l'image ou le son existe déjà). Ce sont des repères pour rester fidèle à l'asset : le rôle de l'asset dans CE plan, c'est toi qui l'écris. Un asset sans fichier se référence quand même : il sera produit.
- **Les répliques** de la scène : uuid, locuteur, texte exact, durée mesurée si la prise existe.
- **Des exemples** de plans réels et validés, choisis selon la nature du plan.

## Ce que le code fait à ta place

- Il attribue **tous les labels** du prompt final et les numéros : tu n'écris jamais de label numéroté, ni de numéro de shot, ni de timecode, ni « Hard cut ».
- Il remplace chaque `[[CODE]]` par le label de la référence correspondante, écrit les lignes de définition et de rétention (avec les shots où chaque référence apparaît), pose le préfixe du `summary`, `[Shot N]`, `At MM:SS.mmm,` et `Hard cut to`.
- Il dérive les références audio des **voix** à partir de `repliques`, et fait respecter les limites : 6 images, 3 audio, **la voix prime sur les bruitages**.
- Il vérifie le verbatim, les durées et la structure des shots.

## Ce que tu écris

Le contrat de sortie est dans `sortie.schema.json`. Chaque exemple montre un brouillon complet, **tel que tu dois le rendre**. En résumé :

- **`references`** : les assets du plan, dans l'ordre voulu : personnages, figurants, accessoires et effets, puis décor. Pour chacun : `asset` (le code du registre), `nature`, `role` (français, pour la fiche), `nom` et `definition` (anglais). L'ordre que tu donnes est celui des labels.
  - `nature: "image"` : l'asset se cite par son image (personnage, figurant, accessoire, effet, décor) ;
  - `nature: "son"` : un bruitage du registre (`SFX_…`), cité comme référence audio.
  - **Une voix n'est jamais une référence** : elle vient de `repliques`.
  - **Tout ce qui n'a pas besoin de référence s'écrit en prose** dans les shots, sans marqueur : le modèle vidéo l'interprète. Un asset qui manque au registre n'est pas une référence : déclare-le dans `assetsManquants`, décris-le en prose.
- **Un seul marqueur** pour désigner une référence dans tes textes : son code entre doubles crochets, `[[CHAR_maya]]`. Il n'y en a pas d'autre : n'écris ni `<Subject 1>`, ni `<Picture 1>`, ni `{picture}`.
- **`summary`**, **`ouverture`**, **`shots`** (début et texte de chaque shot), **`overall_soundscape`**, **`non_diegetic_music`** : chacun dans son champ, sans en recopier le nom.
- **`repliques`**, **`assetsManquants`**, **`notes`**, **`titre`**, **`dureeSecondes`**.

Le guide `guide-h3-compact.md` explique comment rédiger chaque champ.

## Règles de rédaction

### 1. Les assets

- N'utilise que des **codes d'assets existants** dans le registre pour `references`. Un asset manquant n'est jamais inventé : déclare-le dans `assetsManquants` (code proposé, type, parent éventuel, description en français, raison), et décris-le en prose.
- **Une référence = un asset, réutilisé.** Un nouvel asset ne se justifie que si l'image doit réellement être différente : pose franchement autre, cadrage de détail impossible à recadrer, état altéré.
- **6 images au plus.** Au-delà, arbitre : garde ce qui porte l'identité et le cadre, sacrifie ce que le texte peut décrire seul (il passe en prose), et dis-le dans `notes`.
- **Une seule référence porte le visage d'un personnage.** Plusieurs références de visage diluent l'identité.
- **Remplis les slots libres utilement** (décor, détail déjà validé) seulement si tu peux dire pourquoi. Sinon, laisse-les libres.
- **Un décor peuplé et un décor désert sont deux assets.** Une référence peuplée peuple aussi les plans qui devraient être vides ; ne prends pas la salle pleine pour un plan de salle vide.

### 2. Découper en shots — la cadence suit l'intensité

Le nombre de shots suit **l'intensité de l'action, pas la durée du plan** :

| Nature de l'action | Cadence | Caméra |
|---|---|---|
| **Intense** : course, fuite, combat, chute, panique | un `[Shot]` toutes les **1,5 à 2 s** | mobile, angles variés (sol, plongée, canté, plan large en hauteur, insert) |
| **Modérée** : marche décidée, échange, transition | un `[Shot]` toutes les **2 à 3 s** | mouvements simples, valeurs qui alternent |
| **Calme ou tension retenue** : écoute, attente, réaction | un `[Shot]` toutes les **2,5 à 4 s**, ou un seul shot tenu | verrouillée, symétrique, à hauteur d'yeux |

- **Jamais sous 1,5 s par shot** : en dessous, H3 rallonge ou lisse.
- Chaque shot après le premier est une coupe franche **avec un angle de caméra distinct**. Sans cela, H3 rend un seul mouvement lissé. Tu donnes `debutSecondes` ; le code écrit le repère, le timecode et `Hard cut to` : ton texte commence directement par le cadre (« a low-angle shot of… »).
- **Premier shot à `0`**, débuts strictement croissants, dernier shot d'au moins 1,5 s avant la fin du plan.
- **Geste continu assumé** : quand la continuité du geste est l'effet (une gifle en un seul mouvement), le plan reste en un seul mouvement. Dis-le dans `notes`.
- **La cadence raconte l'état du personnage, par contraste.** Un personnage en danger se filme comme une proie (épaule, canté, angles bas, coupes courtes) ; le même qui reprend le contrôle, comme un prédateur (caméra verrouillée, cadre symétrique, coupes longues). Le calme n'a de poids qu'après du rapide : pense les plans par paires avec les voisins.
- **Répartis les signaux de peur ou d'urgence sur les coupes** (regard par-dessus l'épaule, foulée inégale, main qui claque un mur, souffle visible). Un signal lisible par shot suffit.

### 3. Écrire ce qui se voit

- **Corps en anglais.** Seuls les dialogues (dans `<d>`) et le texte visible à l'image gardent leur langue.
- **Tout détail est visible ou audible.** L'intention ne se prompte pas : « la première décision qu'on lui voit prendre » ne veut rien dire pour le modèle ; « la marche s'interrompt, la tête pivote lentement » si. Traduis chaque intention en événement observable.
- **Jamais de consigne en négation.** « Pas de foule » fait apparaître une foule. Décris l'état voulu : « le couloir est vide » devient « la lumière indigo tombe sur un sol nu ». (Le mot `empty` dans la description d'une fin de plan suffit à vider la salle.)
- **Le mouvement de caméra est une action naturelle** dans la phrase (`the camera pushes in slowly`), pas une étiquette.
- **Vocabulaire du découpage français → anglais** : travelling avant = `push in`, panoramique = `pan`, contre-plongée = `low-angle`, plan d'ensemble = `wide shot`, gros plan = `close-up`, caméra fixe = `static shot`.
- **Une image de référence n'est pas une première frame.** Une image qui montre un **état d'arrivée** (pose finale, décor déjà transformé) doit être déclarée comme telle dans `definition`, sinon le modèle la pose dès l'ouverture et saute la construction.
- **Le vocabulaire de la précision rend un personnage immobile** (`planted`, `isolated`, `square`, `exact`, `contained`) : à éviter sur tout personnage en mouvement.
- **Plan fixe ou gros plan : dis que la caméra est verrouillée et que le fond ne bouge pas.** Une mention de démarche fait défiler le décor derrière le personnage.
- **Reveal : pas de push-in ni de dolly** (le modèle fonce sur le sujet). Caméra tenue, puis un pan propre.
- **Lumière** : décris l'exposition comme constante entre deux événements datés, et fais porter chaque changement par un geste visible. Ne raccorde pas une lumière entre deux `[Shot]` internes : décris l'état de fin du premier et l'état de début du second.
- **Foule lointaine** : les figurants au loin bavent. Cadre avec le premier rang gros dans l'image.
- **Sons** : le son synchronisé vit dans les `shots` ; l'ambiance dans `overall_soundscape` ; la musique du public dans `non_diegetic_music`, par instrumentation, tempo et dynamique, jamais par des mots d'humeur. Un bruitage du registre s'ajoute en référence `son` ; sans cela, décris-le en prose.

Avant un plan à enjeu (action forte, effet visuel, montée en tension, plusieurs temps), relis le lexique de corrections : chaque ligne a coûté un rendu.

### 4. Les dialogues

- Chaque réplique liée au plan est citée **mot pour mot**, ponctuation comprise, dans un `<d>[Français] …</d>` d'un des `shots`, avec un locuteur `(Sx)`, et listée dans `repliques`. Chaque `<d>` correspond à une réplique liée, et inversement. Ça vaut pour les personnages comme pour la voix off, et le code bloque la génération sinon.
- **Ne reformule jamais, ne traduis jamais** une réplique. Si elle te paraît à corriger, dis-le dans `notes` : le texte se modifie dans la réplique, pas dans le prompt.
- **La marge de respiration est d'au moins 2 s** : de quoi poser le regard avant la première syllabe et après la dernière. Une réplique de 14 s dans un plan de 15 s ne respire pas.
- **Durée d'un plan dialogué** : si les prises existent, somme des durées mesurées plus la marge. Sinon, choisis une durée généreuse ; elle s'allongera après la prise de voix. **Ne calcule pas de durée à partir du nombre de mots.**
- Si voix et marge dépassent 15 s, ne force pas : propose dans `notes` un découpage à une frontière de sens, entre deux répliques, jamais au milieu, avec un changement d'angle (par exemple la réaction de l'interlocuteur).
- Le lip-sync vient de la prise de voix, que le code branche comme référence audio. Toi, écris `<d>` : c'est lui qui fait bouger la bouche sur le bon phrasé.
- Quand une réplique traverse une coupe ou est tronquée par la fin de la vidéo, utilise `<scenetrans>` et `<cutoff>` (voir le guide).

### 5. La continuité

- Reprends du brief les règles de continuité (traits distinctifs, palettes, rimes) et applique-les sans les commenter.
- Deux plans qui doivent se répondre visuellement partagent le même asset ou un dérivé : ne fabrique pas deux images qui devraient être la même.
- Raccorde avec les plans voisins : direction d'écran, sens du dernier mouvement de caméra, position des personnages.

### 6. Longueur

Les `shots` (ouverture comprise) : 350 à 500 mots en tout pour un plan riche, moins pour un plan simple. Un plan dialogué prime la tenue de toute la ligne de temps parlée sur le nombre de mots.

## Avant de rendre

- Chaque `[[CODE]]` cité est dans `references`, et chaque référence est citée au moins une fois. Aucun label numéroté, aucun `{picture}`.
- Chaque `<d>` est verbatim, et toutes les répliques liées sont citées et listées dans `repliques`.
- Premier shot à `0`, débuts croissants, un angle distinct par shot, aucun shot sous 1,5 s ; ni timecode, ni `Hard cut`, ni `[Shot N]` dans les textes.
- Une `nature: "son"` uniquement pour un bruitage (`SFX_…`) ; une voix n'est pas une référence.
- Pas de négation de comportement, pas de vocabulaire de précision sur un personnage en mouvement.
- Corps en anglais, dialogues dans leur langue.
- `dureeSecondes` est un entier de **5** à 15 ; un plan dialogué garde 2 s de marge.
