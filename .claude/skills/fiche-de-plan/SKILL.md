---
name: fiche-de-plan
description: Transforme un scénario ou un découpage (scenario.md, story-board, liste de plans) en fiche de plan prête à tourner pour MiniMax H3 / Hailuo 3 — un prompt vidéo par plan au format officiel MiniMax, la liste des images de référence à produire (6 max par plan), la durée en secondes et le framerate, plus un registre d'assets groupé par sujet en fin de document. Utilise ce skill dès qu'on parle de fiche de plan, de découpage technique, de shot list, de prompt vidéo H3/Hailuo/MiniMax, de génération de prompts à partir d'un scénario, ou dès qu'un fichier de scénario est fourni avec une intention de production vidéo IA — même si l'utilisateur ne dit pas explicitement « fiche de plan ».
---

# Fiche de plan — scénario → prompts MiniMax H3

Ce skill convertit un scénario en document de production : pour chaque plan, un prompt H3 conforme aux cookbooks officiels MiniMax, les références image à fournir, la durée et le framerate. Le document se termine par un registre d'assets groupé par sujet, qui sert de liste de courses pour la fabrication des images de référence.

## Contraintes du modèle cible (MiniMax H3 / Hailuo 3)

| Paramètre | Valeur | Conséquence |
|---|---|---|
| Framerate | 24 fps, fixe | À rappeler dans chaque fiche, jamais à négocier |
| Durée | secondes entières, 4–15 s (viser ≥ 5 s, la doc produit annonce 5 s de plancher) | Un plan écrit à 3 s se génère à 5 s et se coupe au montage |
| Références image | 9 max côté API, **mais ce skill en autorise 6 max par plan** | Garde-fou revu à la hausse après production : 5 et 6 références ont tenu sans dilution d'identité sur des plans à quatre temps, à condition qu'une seule référence porte le visage du personnage. Au-delà de 6, l'identité se dilue |
| Références vidéo | 3 max | Rarement utilisées en génération pure, à ignorer sauf demande |
| Références audio | **3 max** | Utilisées pour les dialogues : la prise de voix produite en amont pilote le lip-sync (voir Étape 3). Slots rares — la voix prime toujours sur le bruitage |
| Prompt | 7 000 caractères max | Aucun plan raisonnable n'y arrive, mais ne pas partir en roman |

Si le scénario a été écrit pour un autre modèle (LTX, Kling, Wan…) et traîne des contournements devenus inutiles — générer court puis ralentir en post, découper un plan trop long, éviter un mouvement de caméra composé — signale-le dans les notes de production de la fiche au lieu de le reconduire aveuglément.

## Étape 1 — Lire le scénario et en extraire la loi du film

Avant d'écrire le moindre prompt, relève ce qui vaut pour tout le film et qui devra transparaître plan après plan :

- **Style visuel global** (live-action, cinematic, 3D CG, 2D-animated, claymation, aquarelle, film vintage…). S'il n'est pas nommé, déduis-le du vocabulaire du scénario et annonce ta déduction dans les notes.
- **Règles de continuité** : traits distinctifs d'un personnage, palettes, progressions imposées (densité d'éléments, inversion de lumière, évolution sonore).
- **Rimes et échos** : deux plans qui doivent se répondre visuellement partagent le même asset ou un asset dérivé. Note-le, c'est ce qui évite de fabriquer deux images qui devraient être la même.
- **Contraintes de mise en scène**, si le scénario en pose : valeurs interdites, choses à ne jamais montrer dans le même cadre, parti pris de caméra assumé. Rien à inventer si le scénario n'en pose pas.
- **Pièges** : le scénario nomme souvent le cliché que le modèle produira par défaut. Formuler toujours en positif — décrire ce qu'on veut voir, jamais ce qu'on refuse.

**L'entrée normale est de la prose narrative**, écrite comme un roman — c'est plus digeste à relire qu'un découpage sec. Le découpage est donc le travail du skill, pas un prérequis : propose un découpage en plans avec durées, fais-le valider, puis génère la fiche.

Si l'entrée est déjà découpée, respecte scrupuleusement la numérotation existante, trous compris (une numérotation par 10 avec un plan manquant est délibérée).

## Étape 2 — Le mode est fixé : full-reference (`ref2va`)

**Tous les plans sont écrits en full-reference.** Ce n'est pas un arbitrage à refaire plan par plan : c'est une décision de production, et elle tient pour deux raisons.

- C'est le seul mode qui possède les labels `<Subject N>`, donc le seul qui sache dire « c'est le même personnage qu'au plan précédent ». Les modes base ne connaissent que des frames de début et de fin, ils ne maintiennent aucune identité.
- Les changements de valeur se gèrent **par des cuts à l'intérieur du plan**, pas par des frames d'ancrage. L'ancrage par frame n'a donc aucune utilité ici.

Les modes base (`T2VA`, `I2VA`, `L2VA`, `FL2VA`) décrits dans `references/h3-guide-base.md` restent documentés pour comprendre les formats partagés — shots, mouvements de caméra, locuteurs, dialogues, son ordinaire. Ne les utilise pas comme mode de plan sans demande explicite.

Le guide à suivre pour écrire est donc toujours `references/h3-guide-fullref.md`. Lis-le avant d'écrire, à chaque fois : ordre des sections, marqueurs de rétention, forme des timestamps, balises `<d>`. Ne le reconstitue pas de mémoire.

**Les deux régimes restent exclusifs** — contrainte d'API, pas choix de style : une requête ne peut pas contenir à la fois des frames d'ancrage et des références de sujet. Rappel utile si quelqu'un demande un jour un raccord exact.

## Étape 3 — Mesurer la voix, arbitrer la durée

**À faire avant d'écrire le prompt d'un plan dialogué.** La longueur d'une réplique décide de la durée du plan, et parfois du découpage lui-même. Ça ne s'estime pas à la lecture : ça se mesure sur la prise de voix, qui se fabrique *avant* le plan.

### Le calcul

```
durée voix = somme des prises de dialogue du plan
durée plan = durée voix + marge de respiration
```

La **marge de respiration** est de **2 s minimum** dans un plan dialogué — de quoi poser le regard avant la première syllabe et après la dernière. Une réplique de 14 s dans un plan de 15 s ne respire pas. La marge peut être relevée plan par plan si la mise en scène le demande ; elle ne descend jamais sous 2 s sans que la fiche le justifie.

Mesure avec `ffprobe` sur les `.wav` produits :

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 VOICE_xxx.wav
```

### L'arbitrage

| Situation | Décision |
|---|---|
| `voix + 2 s ≤ 15 s` | Un seul plan. Durée = arrondi supérieur à la seconde. |
| `voix + 2 s > 15 s` | **Découpage obligatoire.** |
| Voix non encore produite | Le plan est écrit, mais sa durée est marquée `⏳ à mesurer` et il ne part pas en génération. |

### Proposer le découpage

Quand ça déborde, le skill **propose un découpage** plutôt que de signaler le problème et s'arrêter. La coupe se place sur une frontière de sens — entre deux répliques, jamais au milieu d'une — et chaque morceau reçoit sa propre mesure.

La numérotation suit la règle des dizaines : le plan `190` qui se scinde devient **`190` et `195`**. Aucun autre plan n'est renuméroté, aucun numéro n'est réutilisé, et un plan supprimé laisse son trou. C'est la condition pour que le registre d'assets reste fiable sur toute la série.

Chaque morceau redevient un plan de plein droit : ses propres références, son propre prompt, sa propre valeur de cadre. Un découpage n'est pas une coupe technique subie, c'est une occasion de changer d'angle — profiter du second plan pour passer sur la réaction de l'interlocuteur, par exemple.

Le découpage proposé est signalé dans les notes du plan, avec la mesure qui l'a déclenché.

### Les références audio

Trois slots `<Audio N>` par plan, pas plus. **La voix prime sur le bruitage** : le dialogue occupe les slots d'abord, un bruitage n'en prend un que s'il en reste.

La prise de dialogue se passe en `<Audio N>` avec le marqueur `reference` — le modèle suit le timbre et le phrasé sans copier le signal. L'intérêt est le **lip-sync** : sans référence audio, les lèvres bougent sur le phrasé inventé par H3 à partir du `<d>`, et non sur la prise réelle qui sera montée à la place. Avec la référence, le timing correspond.

Rappel de format, détaillé dans `references/h3-guide-fullref.md` §2.4 : un `<Audio N>` qui correspond à un locuteur reprend son ID global, `<Audio 1> is the voice-timbre reference for <Subject 1> (S1).`

**Le verbatim est un invariant.** La réplique du tableau de dialogue, celle du `<d>` dans le prompt et celle de la prise TTS doivent être identiques au mot près, ponctuation comprise. Sinon les lèvres bougent sur un autre texte que celui qu'on montera. C'est vérifiable mécaniquement, et ça figure dans les contrôles finaux.

## Étape 4 — Attribuer les assets

Chaque plan reçoit **au maximum 6 images**. Deux niveaux de nommage cohabitent, et c'est volontaire :

- **L'ID global**, stable sur tout le film, qui désigne un fichier image à fabriquer une seule fois : `CHAR_maya`, `DEC_auberge_salle`, `PROP_dague_maya`.
- **Le label local**, `<Picture 1>` à `<Picture 6>`, renuméroté à zéro dans chaque plan, parce que c'est ce que le modèle attend dans le prompt.

La fiche donne toujours la correspondance entre les deux. C'est ce mapping qui permet de fabriquer trente images pour un film de cent vingt plans au lieu d'en fabriquer cent vingt.

Préfixes d'ID, à adapter au film :

| Préfixe | Contenu |
|---|---|
| `CHAR_` | Personnages, créatures, machines animées — poses et détails inclus |
| `HUM_` | Figures humaines secondaires, figuration |
| `DEC_` | Décors, plates, arrière-plans, ciels |
| `PROP_` | Objets, végétation, éléments manipulables |
| `STYLE_` | Planche d'ambiance, palette, référence de grain ou de lumière |
| `VOICE_` | Voix de personnage (pipeline TTS, voir Étape 3) |

### Nommage des dérivés

Un dérivé **prolonge le nom de son parent**, il ne change pas de préfixe. La profondeur de l'arbre se lit donc directement dans l'ID :

```
CHAR_maya                     master
CHAR_maya_plan_yeux           dérivé : gros plan des yeux
CHAR_maya_plan_yeux_reflet    dérivé du dérivé
DEC_auberge_salle             master
DEC_auberge_salle_scene       dérivé : la scène centrale
```

Même principe pour les décors : `DEC_<nom-du-decor>_<sujet>`. Il n'y a pas de préfixe dédié aux variantes dégradées — un état altéré est un dérivé comme un autre.

**Versions** : une régénération de la même image ajoute un suffixe `_V2`, `_V3` — `CHAR_maya_V2`.

**Règle absolue : un master figé ne se modifie jamais.** Ses dérivés en dépendent, et le retoucher les invalide tous en silence. Si le design doit évoluer, on crée un **nouveau master avec sa propre arborescence**, et l'ancien reste tel quel. C'est ce qui rend les plans reproductibles : un plan cite une version précise, pas un asset « en général ».

Règles d'attribution :

- **Un sujet = un asset, réutilisé.** Ne crée un nouvel ID que si l'image doit réellement être différente : une pose franchement autre, un cadrage de détail impossible à recadrer depuis le master, un état altéré. Une simple variation d'échelle ou de distance ne justifie pas un nouvel asset.
- **Un asset dérivé cite son parent.** Quand une image se fabrique en éditant une autre (une carcasse issue du master, une main brisée issue de la main valide), le registre l'indique. Ça évite les designs divergents et ça se traduit par un travail d'édition au lieu d'une génération neuve.
- **Garde le même ordre de sujets entre plans consécutifs.** Si Maya est `<Picture 1>` et le couloir `<Picture 2>` au plan 210, ils gardent ces places au plan 220. On ne renumérote que si un asset disparaît ou entre en cours de séquence, et dans ce cas on ajoute en fin de liste plutôt que d'insérer au milieu. Raison pratique : les références se chargent dans le même ordre d'un plan à l'autre dans l'outil de génération, ce qui évite une manipulation par plan et les erreurs qui vont avec.
- **Remplis les slots libres utilement.** Si un plan critique n'a qu'un asset propre, complète avec des références de cohérence — le décor, un détail du personnage déjà validé, une planche de style — plutôt que de laisser des slots vides. Chaque référence ajoutée doit avoir une raison énonçable ; à défaut, laisse le slot libre.
- **Au-delà de 6 candidats**, arbitre et dis-le : garde ce qui porte l'identité et le cadre, sacrifie ce que le prompt textuel peut décrire seul. La fiche mentionne l'asset écarté et pourquoi.

## Étape 5 — Écrire le prompt

Le corps du prompt est en anglais, toujours. Seuls les dialogues, paroles chantées et textes visibles à l'écran gardent leur langue d'origine, à l'intérieur des balises `<d>[Français] …</d>` ou entre guillemets pour le texte à l'image. Un dialogue se recopie mot pour mot, ponctuation comprise — jamais traduit, jamais reformulé.

Points de vigilance, tirés des deux guides :

- **`[Shot 1]` ne porte pas de timestamp.** Les suivants s'écrivent `[Shot 2] At 00:03.500, …`.
- **Un plan porte normalement plusieurs `[Shot]`.** Le plan mono-shot est l'exception, pas la règle. Évalue le découpage interne selon la durée, avant d'écrire :

| Durée du plan | Découpage interne habituel |
|---|---|
| 4–7 s | 1 shot, parfois 2 |
| 8–11 s | **2 shots** |
| 12–15 s | **3 shots** |

  Ce ne sont pas des quotas : un plan contemplatif de 12 s peut rester en un seul shot, et il faut alors que la caméra ou le sujet évolue assez pour tenir la durée. Mais un plan de 15 s en un shot unique est presque toujours un plan qu'on n'a pas fini d'écrire. Chaque `[Shot]` supplémentaire porte son `Hard cut`, son timecode et **un angle de caméra distinct** — sans quoi H3 rend un seul mouvement lissé au lieu d'une coupe.
- **Le mouvement de caméra s'écrit comme une action anglaise naturelle** dans la phrase — type de mouvement, amplitude, vitesse — et non comme une étiquette collée en fin de phrase. Amplitude moyenne et vitesse normale s'omettent.
- **Traduis le vocabulaire de découpage français** vers celui du guide : travelling avant → `push in`, panoramique → `pan`, contre-plongée → `low-angle`, plan d'ensemble → `wide shot`, gros plan → `close-up`, caméra fixe → `static shot`.
- **Tout détail doit être visible ou audible.** L'intention de mise en scène ne se prompte pas : « la première décision qu'on lui voit prendre » n'a aucun sens pour le modèle, « la marche s'interrompt, la tête pivote lentement » en a un. Traduis chaque intention en événement observable.
- **Le son diégétique synchronisé** vit dans la description principale ; l'ambiance générale va dans `overall_soundscape` ; la musique que seuls les spectateurs entendent va dans `non_diegetic_music`, décrite par instrumentation, tempo et dynamique, jamais par des mots d'humeur. `N/A` quand il n'y en a pas.
- **En full-reference**, le style s'annonce en une ou deux phrases **avant** `[Shot 1]` ; en mode base, il s'écrit après `[Shot 1]`. Cette différence est réelle et les deux guides la précisent.
- **Longueur** : vise 350–500 mots de `detailed_description` pour un plan riche en full-reference, moins pour un plan simple. Un plan unique ne justifie pas une description courte s'il porte beaucoup d'information.

**Avant d'écrire un plan à enjeu — action forte, effet visuel, montée en tension, plusieurs temps — lis `references/h3-lexique-corrections.md` s'il est présent.** Ce fichier recense les formulations qui se retournent contre nous et celles qui tiennent, chacune sourcée sur un rendu réel. ⚠️ *Il est absent du plugin à ce jour : les pièges ci-dessous sont donc la seule version disponible, et toute correction éprouvée en production a vocation à l'alimenter une fois le fichier créé.* Les quatre pièges qui reviennent le plus souvent :

- une description en plusieurs temps sans `Hard cut` ni angles distincts rend **un seul mouvement lissé** ;
- une consigne négative fait produire exactement ce qu'elle interdit — toujours reformuler en état voulu ;
- une image qui montre un **état d'arrivée** (une pose finale, un décor déjà transformé) doit être déclarée comme telle dans `subject_definitions`, sinon le modèle peut la poser dès l'ouverture du plan et supprimer la construction. En full-reference, une `<Picture N>` n'est **pas** une première frame — elle ne le devient que si on l'écrit explicitement (`<Picture 2> is the first frame of [Shot 1]`, voir `h3-guide-fullref.md` §2.2) ;
- le vocabulaire de la précision (`planted`, `isolated`, `square`, `exact`, `contained`) rend un personnage **immobile**.

## Étape 6 — Produire deux fichiers

Le travail sort en **deux fichiers distincts**, parce qu'ils n'ont pas le même cycle de vie :

- **`FICHE_DE_PLAN.md`** — vivant. Les prompts s'affinent rendu après rendu, et c'est le travail normal, pas un accident : un plan passe souvent par plusieurs réécritures avant d'être exploitable. Ce sont surtout les prompts qui bougent, les références plus rarement, mais une correction peut aussi demander un asset de plus.
- **`REGISTRE_ASSETS.md`** — vivant aussi, mais sur un autre rythme : il suit la fabrication des images. Statut, version, seed retenu, chemin du fichier produit. Il est relu et mis à jour par le skill `assets-comfyui`.

Les deux restent séparés parce qu'ils ne répondent pas à la même question — « comment se tourne ce plan » d'un côté, « où en est cette image » de l'autre. Les mélanger, et à la troisième mise à jour de statut personne ne sait plus quelle section fait autorité.

Sur un projet découpé en scènes, il y a **une fiche par scène** mais **un seul registre pour tout le projet** : les assets se partagent entre scènes, c'est l'intérêt principal du dispositif. Un registre par scène et le personnage principal se fabrique quatre fois.

### `FICHE_DE_PLAN.md`

Structure obligatoire :

```markdown
# FICHE DE PLAN — [Titre du film]
> Source : [fichier scénario] · Modèle : MiniMax H3 · 24 fps
> [N] plans · [durée totale] s de montage · [durée totale] s à générer
> [N] assets à produire · [N] plans dialogués, dont [N] en attente de mesure ⏳

## Paramètres globaux
Style, contraintes de continuité, pièges à éviter, écarts relevés par
rapport au scénario source.

---

## PLAN [N] — *[Titre]*

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 5 s | 5 s | 24 | full-reference |

**Dialogue** — [X.X] s de voix / [N] s · marge [X.X] s ✅
*Section omise si le plan est muet. Statuts : ✅ tient · ⏳ voix à mesurer · ✂️ découpage proposé.*
| # | Locuteur | Asset voix | Réplique (verbatim) | Durée |
|---|---|---|---|---|
| S1 | Tenancière | `VOICE_tenanciere_P230` | Demain, au lever du soleil… | 6.1 s |

**Références image (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `DEC_desert_empreintes` | Décor, sol et empreintes |
| ... | | |

**Références audio (1/3)**
*Section omise si aucune. La voix prime sur le bruitage.*
| Label | Asset | Rôle dans le plan | Rétention |
|---|---|---|---|
| `<Audio 1>` | `VOICE_tenanciere_P230` | Timbre et phrasé, pilote le lip-sync | `reference` |

**Prompt**
```text
[le prompt complet, prêt à copier-coller]
```

**Notes** — écarts, arbitrages d'assets, indications de post-production.
Section omise s'il n'y a rien à signaler.

---

[…un bloc par plan…]

# Notes de production
Ordre de fabrication conseillé, assets critiques à valider en premier,
plans à risque, contraintes héritées d'un autre modèle devenues caduques.
Renvoi vers le registre pour la fabrication.
```

### `REGISTRE_ASSETS.md`

```markdown
# REGISTRE D'ASSETS — [Titre]
> Projet : [titre] · [N] assets · [N] critiques
> Statuts : ⬜ à produire · 🟡 en cours · ✅ validé

## [Catégorie ou sujet]

### `ID_DE_L_ASSET`
- **Statut** : ⬜
- **Plans** : 10, 30, 80
- **Dérivé de** : `ID_PARENT` — ou `—` si master
- **Critique** : oui / non
- **Description canonique** : la description de référence du sujet, en
  une à quatre phrases. Source de vérité unique : c'est d'elle que
  descendent le `<Subject N>` du prompt vidéo et le prompt image.
- **Cadrage** : angle, valeur, ratio, ce qui doit être lisible.
- **Fichier** : `—`
- **Seed** : `—`
```

Les champs `Fichier` et `Seed` restent vides jusqu'à la production ; c'est le skill `assets-comfyui` qui les remplit, avec les prompts image. Le registre se versionne sous git : c'est ce qui lui tient lieu d'historique, sans autre outillage.

Le regroupement se fait **par sujet**, pas par plan : tous les états d'un même personnage ensemble, tous les décors ensemble. On fabrique ainsi une famille cohérente d'images en une session plutôt qu'un asset isolé par plan.

**La description canonique est le point sensible.** Le prompt vidéo décrit le sujet pour H3, le prompt image le décrit pour le générateur d'images ; s'ils divergent, on fabrique une référence qui ne correspond pas à ce que le prompt vidéo affirme recevoir. Écris la description une fois, dans le registre, et fais-en descendre les deux formulations. Quand le design évolue, un seul endroit change.

## Étape 7 — Corriger un plan après rendu

Une fiche de plan n'est jamais juste du premier coup : le vrai travail commence quand un rendu revient et ne correspond pas à l'intention. Cette étape se déclenche dès qu'un rendu vidéo est fourni pour analyse.

**Ne juge jamais un rendu à l'œil.** Extrais une planche de vignettes et compare les temps voulus aux temps observés — une image par seconde suffit :

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 rendu.mp4
ffmpeg -i rendu.mp4 -vf "fps=1,scale=320:-1,tile=5x3" -frames:v 1 planche.png
```

Premier réflexe avant tout diagnostic : vérifier la durée réelle du fichier. Un plan généré à la moitié de sa durée prévue comprime tous ses temps, et on diagnostique alors une écriture en regardant un problème de génération.

**Corrige par contrainte, jamais par adjectif.** Une correction qui décrit le résultat souhaité ne produit rien ; une correction qui décrit une trajectoire de caméra, une mécanique corporelle, une durée par shot ou un état de départ fonctionne. Le lexique donne les substitutions éprouvées.

**Sache t'arrêter.** Si le même symptôme survit à trois corrections visant des causes *différentes*, ce n'est plus le prompt, c'est le modèle : change le mouvement plutôt que d'engager une quatrième passe. Et consigne l'abandon dans les notes du plan, avec ce qui a été tenté — sans quoi il sera retenté quelques mois plus tard avec enthousiasme.

**Chaque correction retenue enrichit le lexique.** Quand une passe résout un symptôme reproductible, consigne-la dans `references/h3-lexique-corrections.md` — à créer s'il n'existe pas encore — avec le plan où elle a été observée. C'est ce qui distingue ce fichier d'une liste de conseils : chaque ligne a coûté un rendu.

## Vérifications avant de rendre

- Chaque plan a un prompt complet, autonome, copiable tel quel.
- Aucun plan ne dépasse 6 références image ni 3 références audio.
- Tout plan dialogué porte sa mesure de voix, et `voix + marge ≤ durée du plan`.
- La marge est d'au moins 2 s dans un plan dialogué, ou l'écart est justifié en notes.
- Aucune réplique n'est en attente de mesure (`⏳`) dans un plan déclaré prêt à générer.
- Un découpage proposé cite la mesure qui l'a déclenché et respecte la numérotation par dizaines.
- Aucun numéro de plan n'est réutilisé ni renuméroté ; les trous sont délibérés.
- Toutes les durées de génération sont des entiers entre 4 et 15 ; les écarts avec la durée de montage sont signalés.
- Chaque label `<Picture N>` d'un prompt figure dans le tableau de références du même plan.
- Chaque asset cité dans un plan existe dans le registre final, et réciproquement.
- Deux plans consécutifs listent leurs sujets communs dans le même ordre.
- Un plan de 8 s ou plus porte plusieurs `[Shot]`, ou le choix du shot unique est justifié en notes.
- Un master figé n'a pas été modifié ; toute évolution de design a créé un nouveau master.
- Un sujet récurrent porte le même ID partout — pas de `CHAR_colosse` au plan 10 et `CHAR_le_colosse` au plan 80.
- Tous les plans sont en full-reference, sauf demande explicite documentée en notes.
- Tout plan à plusieurs temps porte des `Hard cut` explicites, des timecodes par shot **et** un angle de caméra distinct par shot.
- Aucune consigne de comportement n'est formulée en négation (voir §3 du lexique de corrections).
- Une référence qui montre un état à atteindre est déclarée comme état d'arrivée, jamais comme simple sujet.
- Aucun personnage en mouvement n'est décrit avec le vocabulaire de la précision (`planted`, `isolated`, `square`, `exact`, `contained`).
- Les dialogues sont verbatim, dans leur langue, à l'intérieur de `<d>`.
- Le texte du tableau de dialogue, celui du `<d>` et celui de la prise TTS sont identiques au mot près.
- Le corps des prompts est en anglais.
- La description canonique d'un asset et le `<Subject N>` qui le cite dans les prompts disent la même chose.

Ces vérifications se scriptent bien — extraire les labels, les IDs et les durées d'un markdown est trivial, et un contrôle automatique attrape ce qu'une relecture laisse passer.

Enregistre les deux fichiers dans `/mnt/user-data/outputs/` et présente-les avec `present_files`.
