# FRICTIONS — Pipeline Les Yeux de Rubis

> Journal des points de friction rencontrés en production réelle.
> **Règle du jeu :** on note au fil de l'eau, on ne résout pas ici.
> Une entrée = une douleur constatée, pas une idée de fonctionnalité.
> La spec de l'outil viendra de ce fichier, pas de l'imagination.

**Légende fréquence :** 🔴 à chaque plan · 🟠 à chaque séquence · 🟡 à chaque épisode · ⚪ rare

## État des lieux (2026-09-17)

| # | Friction | Fréq. | Statut |
|---|---|---|---|
| F01 | Registre d'assets illisible | 🔴 | requalifiée — structure (arbre) + voix définies, versioning abandonné |
| F02 | Fiche de plan : son + dialogues | 🔴 | fermé, prêt à intégrer au skill `fiche-de-plan` |
| F03 | Itérations de prompt | 🔴 | motif identifié (découpage + vocabulaire) → direction définie |
| F04 | Batch d'upscaling | 🔴 | confirmé en prod, prêt à implémenter |
| F05 | Maintenir la bible | 🟡 | déclassée — priorité basse (comme F06) |
| F06 | Casting voix | ⚪ | à la main, architecture catalogue définie |

**Motif qui se dégage :** F01, F02 et F05 portent sur la même chose — où vit
l'information et comment elle reste cohérente. Assets, fiche de plan et bible
sont trois vues d'un même corpus. Si ça se confirme, l'outil n'est pas un
gestionnaire d'assets : c'est une base de connaissance de la série.

---

## F01 — Registre d'assets : impossible de savoir où on en est

**Fréquence :** 🔴 · **Étape :** assets · **Statut :** requalifiée — structure + casting voix définis, versioning abandonné

### Symptôme
Gestion manuelle dans des dossiers nommés. On perd le fil de :
- quel asset est **validé** vs en cours vs abandonné
- quel asset est **encore nécessaire** (et pour quels plans)
- quelle **version** d'un asset a servi sur quel plan

### Ce que ça coûte
_(à remplir en production : temps perdu, erreurs commises)_

### Piste évoquée
Vue en **graphe** plutôt qu'en arborescence de dossiers. Chaque asset est un
nœud visualisable, les liens portent le sens :

```
Personnage ──── background
           ├──── apparence ──── costumes ──── variantes
           ├──── voix ──── répliques
           └──── VFX propres

Décor ──── états (jour/nuit, intact/détruit, ...)
```

Même principe pour les décors, qui ont besoin d'états multiples.

### Réponses (2026-09-17)
- **Volume** : 27 assets sur l'épisode 1 (dont 4 voix, 11 critiques).
- **Forme** : c'est un **arbre**, pas un graphe. La valeur n'est donc pas dans la
  topologie mais dans la **visualisation** : voir l'arbre avec l'état de chaque
  asset *par rapport à la demande de la fiche de plan* — non réalisé / partiel /
  validé pour production.
- **Versions** : question tranchée par F04. Puisque le 1er pass est déterministe,
  un plan n'est pas un artefact fragile, c'est une **recette** (seed + prompt +
  refs). Mettre à jour une ref ne casse donc rien :
  - une retouche crée une **nouvelle version** (`CHAR_maya_v2`), elle n'écrase jamais l'ancienne ;
  - un plan pointe sur une **version précise**, pas sur « l'asset » en général ;
  - changer une ref rend les plans concernés **périmés**, pas cassés → ils se refabriquent.
  Bénéfice inattendu : l'arbre affiche alors aussi « quels plans sont à refaire »,
  ce qui est une vue plus riche que celle demandée au départ.

### Arbitrage (2026-09-25)
- **Retouches après validation d'un plan : quasi jamais.** Confirmé en
  production — une fois la génération vidéo lancée, les assets ne bougent
  plus, ou alors on en crée un nouveau / on remplace franchement l'ancien.
  **Le système de versionnage imaginé le 17/09 (`CHAR_maya_v2`) est donc
  abandonné : inutile à ce régime d'usage.**
- **Statut vs arbre : ce n'était pas la même question.** Le champ ✅/🟡/⬜
  déjà dans le registre suffit pour le statut de production — ça, c'est
  réglé. Mais une **vue en arbre reste utile**, pour une raison différente :
  visualiser la **structure des dérivés** d'un personnage (costumes,
  variantes, expressions), pas suivre son avancement. Deux besoins, deux
  outils, pas un compromis entre les deux.
- **Modèle proposé :**
  ```
  Personnage (nom, voix de référence, design canonique)
    └── dérivés (costumes, expressions, props liés...) — arborescence simple
  ```
  Le casting voix suit son propre catalogue, séparé — voir F06.

### Nouveau sous-problème : les dérivés audio (2026-09-25) — fermé
La technique déjà actée dans la bible — H3 génère un brouillon complet
vidéo+son, on découple ensuite la voix en post — avait fait craindre un
**démuxage** à gérer en plusieurs objets par plan (mix, voix isolée,
bruitages isolés), sans convention de nommage claire.

**Résolu :** en pratique ce n'est pas 3 stems à nommer, c'est **une seule
piste** — l'audio complet extrait de la vidéo générée, posé comme référence
dans le monteur (calage des dialogues, aperçu d'ambiance), puis **muté** (pas
supprimé) une fois les vraies prises installées. Pas de convention à
inventer, pas d'entrée au registre : c'est un fichier de travail du montage,
pas un asset.

---

## F02 — Fiche de plan : il manque le son et les dialogues

**Fréquence :** 🔴 · **Étape :** fiche de plan · **Statut :** fermé — prêt à intégrer au skill

### Symptôme
La fiche décrit l'image, mais pas :
- les **bruitages** attendus sur le plan
- la partie **dialogues**

Principe visé : la fiche doit fournir en références **tout** ce qui est utile
au plan, sans avoir à aller chercher ailleurs.

### Réponses (2026-09-17)
- **Bruitages** : fournis en **référence audio du modèle**. Ça donne un ancrage
  précis si on doit repasser en post-production dessus.
- **Dialogues** : déjà figés au moment de la fiche.
- **Nature du besoin** : évolution du **format de la fiche**, donc du skill
  `fiche-de-plan`. Pas un outil. On demande d'autres références, d'autres types,
  avec leurs restrictions propres.

### Arbitrage tranché (2026-09-17)
**La voix prime sur les bruitages.** En cas de concurrence de slots audio, le
dialogue passe d'abord. Les bruitages sont un complément, pas un prérequis.

### Reste à faire
- [x] Restrictions par type de ref audio (2026-09-25) : **aucune limite
  stricte documentée** côté MiniMax H3 — seulement un maximum de 3 clips
  audio de référence par génération, et la recommandation de rester court et
  ciblé. Rien à verrouiller côté gabarit.
- [ ] Ajouter au format de fiche : slot(s) dialogue, slot(s) bruitage, **durée de la voix** (voir F03).

### Révision 2026-09-30 — la réplique devient une entité à part entière
**Déclencheur :** besoin de récupérer les répliques telles quelles pour le
montage (DaVinci Resolve, export OTIO envisagé plus tard) et de les utiliser à
la fois comme référence de lipsync dans le plan et comme donnée autonome.
Précise « dialogues déjà figés au moment de la fiche » (F02, 2026-09-17) sans le
contredire : les répliques restent figées **avant la génération** du plan,
mais elles naissent désormais **avant** la fiche de plan, du scénario ou du
casting, indépendamment d'elle. La fiche de plan devient la **table
d'assemblage** : on y choisit des répliques, on n'en saisit plus le texte.

- **Table `repliques`** : identifiant public `uuid` (comme les plans), rattachée
  à l'épisode (scène optionnelle), `ordre` dans l'épisode, `locuteurId`
  (personnage, nullable) ou `locuteurTexte` pour un locuteur qui n'est pas un
  asset (foule, « inconnu »), texte, fichier audio + durée **mesurée** (F03,
  jamais estimée), statut. Une réplique survit à la suppression du plan qui la
  cite.
- **`plan_dialogues` devient une liaison n-n** (`planId`, `repliqueId`, `slot`,
  `debutSecondes` indicatif) : plusieurs répliques par plan (champ-contrechamp),
  une même réplique dans plusieurs plans. `slot` = son emplacement
  `<Audio N>` (3 max par plan, la voix prime sur les bruitages, arbitrage
  2026-09-17 inchangé).
- **La voix se déduit du personnage** (`voix_fiches.personnageId`), pas de la
  réplique : `plan_dialogues.assetVoixId` et les boutons « caster/délier » de la
  page casting disparaissent. Un personnage a **au plus une voix** (index
  unique partiel) ; `personnageId` reste nullable (voix off, narrateur).
  **Exception nécessaire :** deux des quatre voix de S01
  (`VOICE_conspirateur_*`) n'ont pas d'asset personnage ; une réplique dont le
  locuteur n'est pas un personnage porte donc une **voix directe**
  (`repliques.voixId`), jamais renseignée quand le locuteur est un personnage
  qui a sa voix. Si ces voix reçoivent un jour un personnage, `voixId` devient
  inutile. Le
  registre affiche la voix sur le personnage en colonne **calculée**, en lecture
  seule — jamais un second lien stocké. Compatible avec F01
  (« Personnage (nom, voix de référence…) » / catalogue voix séparé).
- **L'audio de la réplique est la référence `<Audio N>` du plan**, dérivée de
  la liaison, jamais recopiée dans `plan_refs` (une seule source).
- **Invariant verbatim contrôlé par l'application** (il ne l'était que dans le
  skill `fiche-de-plan`) : chaque réplique liée doit apparaître **au mot près,
  ponctuation comprise**, dans une balise `<d>[Langue] …</d>` du prompt ; chaque
  `<d>` doit correspondre à une réplique liée ; une réplique sans audio de
  référence est signalée. Vaut pour les voix de personnage comme pour la voix
  off. Un écart **bloque** le lancement de génération du plan (Prévisualiser /
  Rendu final). Modifier le texte d'une réplique déjà citée met les plans
  concernés en alerte (« prompt à resynchroniser ») et marque la prise audio
  « à refaire ».
- **Pas de versionnage (F01) respecté** : une nouvelle prise remplace le fichier
  de la réplique, sans suffixe `_vNN`.
- Hors scope, prévu : export OTIO (les positions se déduisent déjà de `ordre` des
  plans + durées) ; pour l'instant export JSON/CSV des audios seuls.

---

## F03 — Rédaction du prompt : 2 à 30 itérations par plan

**Fréquence :** 🔴 · **Étape :** génération · **Statut :** motif identifié (2026-09-25) → direction définie

### Symptôme
Chaque prompt demande de nombreux allers-retours avant de donner une vidéo
exploitable. La boucle actuelle passe par ComfyUI, ce qui est lourd pour un
travail d'écriture aussi itératif.

### Ce que ça coûte
La friction la plus fréquente du pipeline. Entre 2 et 30 cycles par plan.

### Réponses (2026-09-17)
- **Nature des corrections** : très peu de micro-retouches manuelles. Ce sont
  surtout de **grosses corrections**, des réécritures de prompt.
- **Ce qui échoue** : un peu tout — et parfois l'idée elle-même ne convainc pas.
  Il arrive de **supprimer un plan en cours de route**, ou d'en insérer d'autres.
- **Origine** : c'est principalement le **prompt** qu'on bouge.
- **Gabarit** : améliorer le gabarit de prompt en amont serait utile, ampleur du
  gain inconnue.

### Ce que ça change sur l'outil visé
L'édition fine (agent IA, retouche chirurgicale) n'est PAS le besoin principal,
puisque les corrections sont grosses. Le besoin réel est un **cycle court** :
générer → regarder → réécrire → relancer, sans passer par l'interface ComfyUI.

Et une partie des itérations ne sont pas des problèmes de prompt du tout : ce
sont des **décisions de découpage** qui remontent au scénario. Deux problèmes
distincts, deux outils différents.

### Piste évoquée
Une interface dédiée à la boucle d'itération :
- récupère les **références automatiquement** depuis la fiche de plan
- **prévisualise** la vidéo générée
- édition du prompt **par agent IA** (reformulation, ciblage d'un défaut)
- édition du prompt **manuelle** (retirer un détail précis, compenser une
  référence manquante)

### La boucle réelle, aujourd'hui
Fiche de plan → workflow ComfyUI → visionnage → « voilà ce qui ne va pas » →
nouvelle proposition de prompt → génération → etc. La boucle existe donc déjà,
elle est juste **manuelle et répartie entre deux outils**.

### Sous-problème : la durée des plans (dialogues)
Découvert en production : la longueur d'une réplique décide du découpage.
Exemple vécu — le plan 19 dont la réplique ne tient pas dans 15 s, et qu'il vaut
mieux scinder en deux plans de 12 s pour laisser respirer.

**Réglé en amont, pas dans l'interface.** L'audio se fabrique *avant* le plan
(cf. bible), donc la durée ne s'estime pas, elle **se mesure** :

```
durée du .wav de la réplique + marge de respiration (entrée/sortie)
   <= 15 s  ->  un seul plan
   >  15 s  ->  découpage obligatoire
```

→ Ajouter une colonne **durée voix** à la fiche de plan (voir F02). La question
du découpage est alors tranchée avant toute génération vidéo.
Attention : une réplique de 14 s dans un plan de 15 s ne respire pas — la marge
n'est pas optionnelle dans un plan dialogué.

### Sous-problème : insérer ou supprimer un plan
Les plans sont numérotés **par dizaines** (140, 150, 230...). L'insertion est
donc déjà résolue : le plan 19 qui se scinde devient **190 et 195**, rien d'autre
ne bouge — ni le registre d'assets, ni les fichiers déjà produits.

**Règle à tenir :** un numéro de plan n'est jamais réutilisé ni renuméroté.
Un plan supprimé laisse son trou. C'est la condition de fiabilité du registre
d'assets sur toute la série.

### Motif identifié (2026-09-25)
Deux causes distinctes se dégagent des réécritures, pas une seule :

**1. Découpage insuffisant.** Le prompt de base (skill `scenario`) propose
trop peu de plans/points de vue, même sur une durée longue, et décrit trop
peu. Corrections typiques, très récurrentes :
- « Ajoute 2 shots pour un mouvement de caméra sympa » — sous-découpage.
- « Le shot 30 est trop long, 15 s quasi fixes sans raison » — plan statique
  sans intention.
- « Le découpage est incohérent : le personnage doit entrer par la droite,
  la caméra vient de faire un traveling vers la gauche » — logique de
  continuité (raccord de mouvement / direction d'écran) absente.
- « La scène de dialogue manque de dramatique, trop statique » — couverture
  insuffisante d'une scène parlée.

Ça confirme et précise ce qui était pressenti le 17/09 : une bonne partie des
itérations ne sont **pas** des corrections de prompt, ce sont des décisions
de découpage qui auraient dû être prises en amont, au scénario.

**2. Vocabulaire à risque côté H3.** Le modèle est très sensible au choix des
mots — un mot peut faire apparaître un objet même vaguement cohérent avec le
reste de l'image. Exemple vécu : décrire quelque chose comme *"bladed"* (au
sens « affûté comme une lame ») peut faire apparaître une épée à l'image. Pas
un problème de découpage, un problème de **précision lexicale**.

### Direction définie (2026-09-25)
- **Découpage** → enrichir le skill `scenario` : pousser le plan de coupe
  plus loin par défaut (points de vue variés, mouvements de caméra, logique
  de continuité entre plans, scènes dialoguées couvertes plutôt que
  statiques), en s'appuyant sur la direction déjà donnée par le scénario.
- **Vocabulaire** → tenir une liste de mots à risque identifiés en
  production dans le skill `fiche-de-plan`, à vérifier avant de valider un
  prompt. **Abandonné (2026-09-30)** : retour utilisateur, reste la
  vigilance de l'utilisateur au visionnage (reformuler/corriger les mots
  précis qui posent problème), pas un système dédié dans le skill.

### Boucle courte fermée côté interface (2026-09-30)
Ce que "récupère les refs automatiquement / prévisualise / édite / relance"
(piste évoquée le 17/09) désignait existe maintenant dans la Fiche de plan :
`RefsPanel` (refs auto), lecteur vidéo (aperçu dernier rendu, + import
manuel d'un plan déjà tourné pour traçabilité), édition des 6 sections ou
collage en bloc d'un prompt H3 déjà rédigé, `RelaunchButton` (relance sans
repasser par ComfyUI). Reste ouvert côté Shots : le déclenchement du
"passage nuit" (upscale en masse), mentionné dans la CDC mais jamais
construit — le rejeu automatique (2 tentatives) l'est, lui, déjà (voir
`worker/index.ts`, `gererEchecReel`).

### Direction retenue pour l'agent d'itération (2026-09-30)
Le point ouvert "Agent sur la Fiche de plan" (CAHIER_DES_CHARGES.md) est
tranché côté conception, pas encore construit :
1. Un agent crée d'abord un **squelette** — tous les prompts H3 de base dont
   l'épisode aura besoin (suppose des skills de rédaction plus solides que
   la conversation actuelle pour tenir sans supervision constante).
2. Une **première vidéo d'un seul plan** est générée pour calibrer.
3. Un **agent dédié itère ensuite prompt par prompt**, plan par plan,
   corrigeant les défauts constatés au visionnage — jamais de retouche
   chirurgicale à l'aveugle, toujours après un visionnage réel.
4. **Cas particulier des dialogues** : avant même la prise de voix réelle,
   estimer une durée à partir du nombre de mots prononcés (heuristique
   mots/seconde), pour itérer sur le texte et l'ajuster à la durée du plan.
   Ceci **ne remplace pas** l'invariant "la durée se mesure, pas s'estime"
   (ci-dessus, sous-problème durée) : l'estimation ne sert qu'à converger
   plus vite sur un texte plausible avant d'enregistrer la voix ; la mesure
   `ffprobe` sur le `.wav` réel reste seule autorité pour trancher un
   découpage.

Ce chantier **contredit le cadrage "V1 sans agent"** du phasage
(CAHIER_DES_CHARGES.md) s'il y est absorbé — décision explicite à prendre :
le traiter comme un chantier séparé après la clôture de V1 telle que scopée
à l'origine, pas comme une condition de cette clôture. Le point d'entrée
existe déjà côté interface (collage de prompt en bloc dans la Fiche de
plan) : l'agent futur écrira dans le même champ plutôt que d'exiger une
nouvelle UI.

### Conception détaillée (2026-09-30)
Le cadrage complet — brief issu d'une conversation, pipeline en étapes,
portée × mode, propositions appliquées seulement après validation, protections
et point de retour, traces — est dans `docs/CONCEPTION_AGENTS.md`. Aucun
verdict acté ci-dessus n'est modifié.

### Décisions de conception des skills (2026-09-30)
- **Estimation mots/seconde : non retenue pour l'instant** (révise le point 4 de
  la direction du 2026-09-30). L'agent choisit une durée généreuse ; si le débit
  est trop lent ou trop rapide, on allonge le plan une fois la voix mesurée.
- **Deux textes par asset, pas de version anglaise figée** : `description`
  (français, canon humain) et `promptGeneration` (ce qu'on colle dans ComfyUI,
  avec la mise en page de Krea 2 ou de Qwen). Un « sujet anglais » stocké dans
  l'asset a été écarté : le rôle d'un asset change d'un plan à l'autre et se
  dit en texte brut dans le prompt vidéo (`<Subject 1> is the Tenancière from
  <Picture 1>, leaning in close…`). Chaque plan écrit donc sa propre définition
  de sujet.
- **Un dérivé n'est pas forcément une édition** : `deriveDeId` dit la famille,
  `methodeGeneration` (`generation` | `edition`) dit comment l'image se fabrique.
  Un effet (flammes, éclairs) rattaché à un master se génère de zéro ; une
  édition (les yeux de Maya) part de l'image du parent, qui doit être produite
  d'abord. L'ordre de fabrication « parent avant enfant » ne vaut que pour les
  éditions.
- **Les skills d'exécution de l'app** vivent dans `agents/skills/` (voir
  `docs/CONCEPTION_AGENTS.md`), séparés des skills de chat de `.claude/skills/`.
- **Contrôle de structure des shots** ajouté à la fiche de plan (signalement,
  sans blocage) : durée entière de 4 à 15 s, timecodes croissants dans la durée,
  aucun shot sous 1,5 s. Pas de contrôle du littéral « Hard cut » : les plans
  validés en production ne l'écrivent pas toujours. La forme à intervalle
  `[Shot 2, 00:02.500–00:05.500]` est acceptée. Le garde-fou de vocabulaire
  reste abandonné.

- **Skills réécrits pour l'app** (voir `docs/CONCEPTION_AGENTS.md` §5 et §8) :
  `brief-projet`, `scenario-episode`, `prompt-voix` s'ajoutent à `plan-h3`,
  `iteration-plan` et `prompt-asset`. `scenario-episode` reprend les
  corrections de découpage du 2026-09-25 (points de vue, plan statique sans
  intention, dialogue couvert) et respecte le scénario narratif : pas de
  cadrage, lumière ni son, pas de numéro ni de renvoi à un autre plan, pas
  d'asset déclaré. Les répliques y naissent avec leur locuteur. `prompt-voix`
  ne garde de l'ancien casting que la contrainte physique tenue (dans
  l'instruction) ; règle absolue, température, seed, test de tenue et carnet de
  candidats n'y figurent plus.

### Reste à observer
- [ ] **Compter séparément** : itérations « prompt » vs redécoupages (= scénario). Le motif ci-dessus suggère que la part « découpage » est grosse — reste à chiffrer.
- [x] Motif récurrent — identifié ci-dessus (2026-09-25).
- [ ] Quelle marge de respiration minimale pour un plan dialogué ?

### Révision : continuité à l'échelle de l'épisode, pas de la série (2026-09-28)
En introduisant la hiérarchie Projet → Saison → Épisode (voir modèle de
données 2026-09-28), la continuité "sur toute la série" a d'abord été
reprise telle quelle (numéro unique par PROJET). Reconsidéré aussitôt :
retour utilisateur — un plan 456 dans l'épisode 2 laisserait croire à tort
qu'on est loin dans la série, alors que ce serait son tout premier plan.
**La continuité redevient locale à l'épisode** : chaque épisode a sa propre
séquence de numéros (par dizaines), qui ne recommence jamais en cours
d'épisode mais qui redémarre à 010 pour chaque nouvel épisode. La règle
"jamais renuméroté, jamais réutilisé après suppression" (F03 ci-dessus)
s'applique désormais à cette échelle.

Conséquence sur l'identification : `numero` seul ne suffit plus à
désigner un plan sans ambiguïté dès qu'un projet a plusieurs épisodes (deux
épisodes peuvent avoir chacun un plan 010). L'identifiant technique unique
reste `plans.id` (clé primaire, jamais exposé) ; pour un affichage humain
non ambigu hors du contexte d'un épisode déjà connu, on calcule une
étiquette `E01_P010` (épisode + numéro) à la volée — jamais stockée, jamais
un vrai identifiant, uniquement un raccourci de lecture.

### Révision : le scénario reste narratif (2026-09-29)
Les champs du scénario (valeur, sujet, décor, lumière, mouvement caméra, son,
intention, assets requis) doublonnaient le prompt H3 sans jamais y être
injectés, et ne pouvaient pas décrire un appel H3 à plusieurs `[Shot]`
internes. **Supprimés.** Un plan de scénario ne porte plus que :
- `description` — ce qui se passe et pourquoi (ancien sujet + intention).

Cadrage, lumière, son : décidés par `[Shot N]` dans `detailed_description`,
nulle part ailleurs. Pas de rappel du plan précédent dans l'interface.

**Pas de champ qui parle d'un autre plan** (même jour) : des champs `raccord`
(ce que le plan reprend du précédent) et `sortie` (état laissé à la fin) ont
été ajoutés puis retirés — ils se désynchronisent dès qu'un plan est inséré
ou supprimé. Toute information de continuité doit être dérivée à l'affichage,
jamais stockée.

**Assets : l'histoire d'abord.** Le scénario ne déclare aucun asset. On écrit
le morceau d'histoire, puis on rattache un asset existant ou on en crée un
depuis la fiche de plan (`plan_refs`). Le plan déclenche donc, si besoin, la
création d'un asset — jamais l'inverse. Reste à faire : création d'asset à la
volée depuis le panneau de références.


### Révision : « mouvements » devient « scènes » (2026-09-29)
Un épisode est composé de **scènes** (ex-« mouvements narratifs ») : le mot
colle mieux à l'usage. Table `scenes`, `plans.scene_id`.

**Plage de plans et durée ne sont pas des champs, elles se déduisent** : plan
de début/fin = plus petit/plus grand numéro des plans rattachés, durée = somme
des durées de montage. Même principe que pour la continuité (ci-dessus) :
rien de stocké qui puisse diverger d'une insertion ou d'une suppression de
plan. Une scène naît vide (titre + fonction) ; ses plans s'y rattachent au
fur et à mesure, depuis l'en-tête de la scène (page Scénario) ou depuis la
page du plan. Rattacher à une autre scène déplace le plan ; « sans scène »
le détache. Les scènes s'affichent triées par leur premier plan.

### Révision : le numéro n'est plus l'ordre — `ordre` (2026-09-29)
Retour utilisateur : on doit pouvoir **réordonner les plans comme dans un
logiciel de montage** (ex. des mouvements de danse remis dans un ordre plus
fluide), et supprimer un plan doit rester simple. Jusqu'ici l'ordre était
`numero`. **Désormais :**
- `plans.numero` = **identifiant stable**, inchangé : jamais renuméroté, jamais
  réutilisé (règle F03 intacte — assets, notes et fichiers de rendu peuvent
  continuer à le citer). Il n'exprime plus la position.
- `plans.ordre` = **position** dans l'épisode. Frise Scénario, scènes et
  frise Shots suivent `ordre`. Réécrit densément (0..n) à chaque déplacement,
  dans une transaction ; jamais une clé, jamais cité ailleurs.
- Glisser-déposer sur la frise Scénario : un plan se déplace dans sa scène,
  vers une autre scène, ou vers « sans scène » (dépôt sur la moitié haute /
  basse d'un plan = avant / après ; dépôt hors plan = fin de la scène).
- Un plan créé se place en fin d'épisode, ou en fin de sa scène s'il en a une.
- Supprimer un plan ne laisse aucun trou visible (l'ordre est réécrit).

### Révision : plus de numéro de plan, identification par UUID (2026-09-29)
Une fois l'ordre porté par `ordre` et l'affichage par la position, le numéro
n'avait plus aucun rôle (ni ordre, ni affichage, ni saisie). **Supprimé** :
- `plans.numero`, `unique(episode, numero)` et `episodes.dernier_numero_plan`
  n'existent plus. La règle « jamais renuméroté, jamais réutilisé » n'a plus
  d'objet : un UUID ne se réattribue pas.
- `plans.uuid` (unique, généré) est l'identifiant **public** : URL
  `/plans/<uuid>`, citations d'assets. `plans.id` (serial) reste la clé
  technique interne (FK, `plans/<id>/` côté rendus du worker) — pas converti
  en UUID : aucun bénéfice visible, mais migration risquée des FK et des
  dossiers de rendu existants.
- Affichage : la **position** (« 04 » = 4e plan de l'épisode, brouillons
  compris). Citations d'assets : « E01 · 04 ». Le libellé calculé `E01_P010`
  disparaît avec le numéro.
- `numeros_source` ne garde que la trace de l'import du markdown (numéros des
  plans source, y compris pour un plan non fusionné) : c'est la seule clé de
  rapprochement du script d'import, jamais utilisée par l'application.
- Les anciennes règles ci-dessus (numérotation par dizaines, continuité à
  l'échelle de l'épisode, `E01_P010`) sont conservées comme historique.

> Si un pattern se dégage, il remonte dans le skill `fiche-de-plan` — moins
> cher qu'une interface.

---

## F04 — Batch processing : séparer la journée de travail de la nuit de calcul

**Fréquence :** 🔴 · **Étape :** génération · **Statut :** conçu, non implémenté

### Symptôme
Aujourd'hui chaque plan monopolise la machine ET l'attention. Impossible de
travailler sur plusieurs shots en parallèle sans casser le cache.

### Cible
- **Journée :** on retouche les shots en basse résolution, on valide, on empile.
- **Nuit :** la pipeline d'upscaling vide la file toute seule.

Bénéfice secondaire : la machine travaille dur mais sur une fenêtre réduite.

### Acquis techniques
- Le 1er pass est **déterministe** : même seed + même prompt + mêmes refs → même latent.
  Donc pas besoin de sauver les latents, on régénère low + high en un seul job.
- Le batch coûte un 1er pass supplémentaire par plan. Négligeable face à l'upscale.
- En interactif, on garde la méthode actuelle (toggle `Enable Upscale Pass`, cache chaud).

### Test de détermination : ✅ PASSÉ (2026-09-17)
Même shot, même seed, deux fois → **mp4 identiques**. Le batch est donc fiable,
et aucun latent n'a besoin d'être stocké. Conséquence en cascade : voir F01
(versionnage des assets), qui devient un non-problème.

### Réponses (2026-09-17)
- **File nécessaire**, pas un simple script : on veut suivre **l'état des shots**.
  ComfyUI traitant séquentiellement, la file peut rester simple.
- **Échecs** : rejeu automatique, puis signalement si ça ne passe toujours pas.

### Reste à faire
- ~~Modifier le workflow pour les seeds~~ → **inutile**. En appel API, la seed
  se fixe directement dans le JSON. Les nœuds `easy seed` ne servent qu'au
  confort interactif dans ComfyUI.
- Rappel de cache : si seul le toggle d'upscale change, ComfyUI réutilise tout
  le 1er pass (empreinte des entrées inchangée). C'est la méthode interactive
  actuelle, elle reste la bonne quand on est devant l'écran.
- [ ] États de la file à définir : en attente / en cours / échoué / rejoué / terminé.
- [ ] Combien de rejeux avant de signaler ?

### Confirmé en production (2026-09-25)
Le pattern se pratique déjà à la main, avant même l'outil : on duplique le
workflow ComfyUI autant de fois que de plans à traiter, on ajuste les prompts
un par un, et une fois tous les low-res générés on débloque l'upscale latent
d'un coup — le cache évite de régénérer la passe basse résolution. La
parallélisation batch n'invente donc rien de nouveau, elle automatise un
geste déjà rentable manuellement.

---

## F05 — Maintenir la bible comme vraie source de vérité

**Fréquence :** 🟡 · **Étape :** scénario · **Statut :** déclassée — priorité basse (2026-09-25)

### Symptôme
`00_BIBLE.md` doit faire autorité sur l'univers, mais la maintenir demande une
discipline qui ne tient pas toute seule. Deux questions ouvertes :
- comment garantir la **continuité** des personnages entre les épisodes ?
- comment représenter leur **évolution** au fil du récit (un perso change, la
  bible doit dire quoi sans se contredire) ?

### Requalification (2026-09-17)
La bible n'est **pas un fichier unique qui fait autorité**, c'est une base de
connaissances à quatre piliers :

| Pilier | Question à laquelle il répond | Nature |
|---|---|---|
| **Personnages** | Qui évolue dans l'histoire ? | trajectoire |
| **Décors** | Où les personnages évoluent, et selon quelles règles ? | stable + états |
| **Scénario** | Quel est le déroulé des événements vécus ? | trajectoire |
| **Univers / Lore** | Quelles règles régissent le monde ? | stable |

L'intérêt du découpage : il sépare **ce qui ne bouge jamais** (lore, règles des
décors) de **ce qui est une trajectoire** (personnages, scénario). Deux natures
d'information, deux façons de les maintenir.

### L'axe du temps existe déjà : le numéro de plan
La numérotation était continue sur toute la série au moment où ce mécanisme
a été imaginé, elle faisait donc office d'horodatage universel. L'évolution
d'un personnage s'écrivait :

```
CHAR_maya
  canonique   : ce qui ne change jamais (yeux rubis, silhouette, timbre)
  état >= P010 : [situation de départ]
  état >= P230 : [ce qui a changé], cause : plan 225
```

Pour savoir qui est Maya au plan 400, on lisait l'état actif le plus récent.
Et une contradiction devenait **mécaniquement détectable** : deux états qui
se contredisent sur la même plage de plans.

> **Prémisse obsolète (2026-09-28)** — la révision F03 du même jour fait
> repartir le numéro de plan à 010 à chaque épisode (voir plus haut) : "P400"
> n'est donc plus un horodatage unique sur la série, il en existe un par
> épisode. Ce mécanisme reste gelé (statut "déclassée" ci-dessous, jamais
> utilisé en pratique) — s'il est un jour ranimé, l'état devra se qualifier
> par épisode (ex. "état >= E02:P010") plutôt que par numéro seul.

### Ce que ça coûte
_(à remplir — se mesurera surtout à l'épisode 2 : sur un seul épisode, la
continuité tient dans la tête, la friction est encore invisible)_

### Déclassée (2026-09-25)
En pratique, la bible n'est quasiment plus consultée — soit les personnages
sont déjà en tête, soit l'utilité ne se fait pas sentir. Même sort que F06 :
**priorité basse, aucun investissement tant qu'une incohérence concrète n'a
pas coûté de temps.** Le système « état >= Pxxx » ci-dessus reste documenté
tel quel — coût de maintenance nul puisqu'il n'est pas utilisé — au cas où
un collaborateur rejoint le projet ou où le casting s'étoffe sur S02+.

### À observer avant de décider (gelé tant que la friction reste déclassée)
- [ ] Les incohérences constatées portent-elles sur l'apparence, le comportement, ou les faits ?
- [x] Évolution par épisode vs continue : **caduque** — le système « état >= Pxxx » couvre déjà les deux cas sans distinction à faire.
- [x] Bible versionnée par épisode : **inutile**, pour la même raison.
- [x] Écriture ou vérification : **ni l'un ni l'autre pour l'instant** — la friction est déclassée avant d'avoir dû trancher.

---

# Utile mais pas indispensable

## F06 — Utilitaire de casting voix

**Fréquence :** ⚪ · **Étape :** assets/voix · **Statut :** idée

Les workflows ComfyUI nécessaires existent déjà. L'idée : générer des vidéos de
casting audio pour comparer les candidats et retenir une belle voix.

### Réponses (2026-09-17)
- **4 voix** sur l'épisode 1 (`VOICE_maya`, `VOICE_tenanciere`,
  `VOICE_conspirateur_nerveux`, `VOICE_conspirateur_calme`), toutes déjà décrites
  au timbre dans le registre.

**Verdict : à la main.** À ce volume, l'utilitaire ne se rentabilise pas.
À revoir si la série introduit beaucoup de nouvelles voix par épisode.

### Doublage : échec du micro live (2026-09-25)
Tentative de faire passer le doublage par une custom node ComfyUI qui capte
le micro en direct : peu concluant. Le chemin qui fonctionne consiste à
enregistrer les prises soi-même en amont et à fournir ces samples comme
référence audio au modèle — cohérent avec le principe ref2va déjà acté : la
prise audio se fabrique avant le plan, en dehors de ComfyUI.

### Reste à observer
- [x] Voix nouvelles par épisode à partir de S02 : **trop tôt pour savoir** (2026-09-25).
- [x] `REGISTRE_VOIX.md` : **n'existe pas encore** dans le projet (2026-09-25) — rien ne couvre le suivi pour l'instant.

### Lien voix ↔ personnage (2026-09-30)
Le lien vit **une seule fois**, sur `voix_fiches.personnageId` (voir F02,
révision 2026-09-30). Le registre affiche la voix sur le personnage en colonne
calculée et propose « Assigner une voix » — qui écrit ce même champ.
Toujours « à la main » (verdict F06 inchangé) : rien ici ne génère.

### Révision : le casting en quatre étapes (2026-09-30)
Après revue de la page de casting, le carnet devient un parcours par onglets :
1. **Voix** — soit une instruction Voice Design, soit un audio fourni (rogné à la
   taille exacte de la réplique) ; dans les deux cas un **texte de référence au
   mot près**.
2. **Référence** — la voix de référence générée (génération non branchée : à la
   main dans ComfyUI, puis dépôt), ou l'audio fourni tel quel.
3. **Test vidéo** — décor et personnage optionnels, texte libre, audio déjà prêt
   en glisser-déposer ; le prompt vidéo dédié (gabarit T1) se compose tout seul.
4. **Répliques** — une ligne par réplique : Générer (non branché), Importer,
   durée mesurée.

Retirés, car inutiles : la **règle absolue** (elle vit dans l'instruction de voix),
**température** et **seed**, les **limites assumées** (elles s'écrivent dans la
description canonique du timbre), le **carnet de candidats** et le **test de
tenue** (on génère des samples à volonté avec du texte libre). Les tables
`voix_candidats` et `voix_tenue` sont supprimées (migration 0023). Aucun verdict
F06 n'est modifié : rien ici ne génère.

### Révision : la voix ne se crée plus au registre (2026-09-30)
Une voix reste un asset `VOICE_*` (F01) : listée au registre, écoutable, citée
par les plans en `<Audio N>`. Mais elle se **crée et s'édite uniquement au
casting vocal** : « Nouveau sujet » ne propose plus le type voix (ni l'action
serveur), le dépôt de fichier est retiré de sa fiche au registre, qui renvoie
vers le casting (« Modifier au casting »). Un seul endroit pour éditer une voix.

### Pipeline vocal réel : deux moteurs (2026-09-30)
Meilleur résultat obtenu à ce jour (`workflows/voice-clone/VOX_Voice-design.json`) :
1. **Qwen3-TTS (Voice Design)** lit un **texte de référence anglais, le même pour
   toutes les voix**, avec l'instruction du personnage : c'est la voix de
   référence (étape 2 du casting).
2. **CosyVoice3** clone cette référence et dit les **répliques en français**
   (étape 4). `VOX_Generate_Sound_From_Characters.json` en est la seconde moitié
   (fichier de référence + texte + `trim_start`/`trim_end`).

Conséquences : le texte de référence est un réglage de projet (le casting
propose un « Texte par défaut »), pas une création par voix ; la « direction de
jeu » par réplique attendra le branchement (CosyVoice3 a un champ `instruct_text`
vide aujourd'hui). **Le branchement audio est différé** : `CharacterVoicesNode`
lit un fichier dans un dossier propre à ComfyUI et exige texte de référence et
rognage saisis dans le graphe ; la gestion de l'audio y est trop couplée à
ComfyUI pour être pilotée par l'application. On débloque d'abord les images
(`IMG_01_TextToImage`, `IMG_Simple_Edit`) et la vidéo ; le contrat des workflows
d'images est dans `workflows/README.md`.

### Voix de référence : génération branchée (2026-10-02)
Le workflow `workflows/audio/VOX_Generate_Voice_Simplified.json` (Qwen3-TTS Voice Design : trois nœuds, sans le
`CharacterVoicesNode` qui rendait l'audio trop couplé à ComfyUI) lève le blocage noté plus haut pour **la voix de
référence** ; les prises de répliques (CosyVoice3) restent à la main.
- **Même file que les images et les sons** : méthode `voix` de `asset_generations` (colonnes `texte_reference`,
  `langue_reference`, `temperature`, migration 0037) ; annulation, reprise, panneau du header et candidats en
  profitent. Le panneau renvoie vers l'étape « Référence » du casting.
- **Créativité de la voix** = la « température » de Qwen3-TTS, **0,8 à 1,2, 1,1 par défaut**, réglable dans la popup.
- **Le résultat est un candidat** : « Utiliser comme référence » remplace la référence de la voix (`assets.fichier`),
  son instruction (`prompt_generation`) et le texte lu (`voix_fiches.ref_text`), et repasse la voix « en cours ».
  Le déposer à la main reste possible.
- Le nœud d'écoute `PreviewAudio` du fichier exporté est remplacé à la soumission par `SaveAudioMP3` (V0), comme
  pour les bruitages : le worker ne relit que le dossier `output`. Un FLAC serait préférable pour le clonage ;
  à reprendre si le MP3 gêne CosyVoice3.
- Code : `lib/asset-generation.ts` (règles), `worker/comfyui/voixMapping.ts` (+ test sur le vrai workflow),
  `lancerGenerationVoix` (`app/assets/generation-actions.ts`), `GenerationVoixDialog`.

### Génération d'images d'assets : première tâche ComfyUI dédiée (2026-09-30)
Premier type du système de tâches dédié (le worker vidéo n'est pas généralisé) :
table `asset_generations`, boucle `worker/images.ts`, bouton « Générer » sur la
fiche d'asset. Décisions :
- **Le résultat est un candidat, jamais l'image de l'asset.** « Utiliser » le
  copie sous `assets/` (il remplace la précédente, F01) et remet l'asset « en
  cours » : une image nouvelle est à revalider par l'utilisateur.
- **Une demande garde un instantané** de ce qui a été soumis (prompt, clause de
  style du projet, format, seed) : on sait toujours quoi a produit quoi.
- **8 candidats gardés par asset** : des essais, pas un historique.
- **Pas de rejeu automatique** (contrairement aux plans H3) : une image se refait
  en quelques secondes, l'échec s'affiche avec son message. Une API injoignable ne
  consomme rien (même règle que F04).
- La génération text-to-image (`IMG_01_TextToImage`) puis, le 2026-10-01,
  l'édition à partir d'images (`IMG_Simple_Edit`, 1 à 3 sources) sont branchées :
  voir le bloc suivant.
- En mode `stub`, les images sont des PNG factices : toute la chaîne se teste
  sans ComfyUI.

### Génération « à partir d'images » : deux modes, sources jetables (2026-10-01)
La popup de génération (variante B de la maquette) n'a que **deux modes**, pas
trois : « texte » (`IMG_01_TextToImage`, Krea 2 Turbo) et « images »
(`IMG_Simple_Edit`, Qwen Image Edit 2511). Modifier une image et fusionner des
références sont le même workflow : de 1 à 3 sources, **la première est la cible**
modifiée, les autres sont des références. Décisions :
- **Méthode d'une demande ≠ méthode de l'asset.** `assets.methodeGeneration` ne
  fait que proposer le mode par défaut dans la popup ; elle n'interdit rien. Un
  dérivé peut être généré en texte, un master modifié à partir d'une autre image.
  Seule la voix est refusée au niveau de l'asset. Le prompt vide se vérifie sur la
  demande (la popup préremplit celui de l'asset). Le prompt d'une demande lui
  reste propre ; il ne devient celui de l'asset que quand on **adopte** le
  candidat (« Utiliser ») : la fiche garde ce qui a produit l'image retenue, sans
  case à cocher (2026-10-01).
- **Les sources sont un instantané** (`asset_generation_sources`) : à la position
  `n`, soit l'image courante d'un asset du projet (`origine = 'asset'`, nom de
  fichier au lancement), soit un **import jetable** (`origine = 'import'`) déposé
  dans la popup, rangé sous `generations/<assetId>/sources/` et **jamais rattaché
  au registre** (F01 : pas de versionnage ; une image qui doit devenir un asset
  se crée comme asset). Une source qui disparaît avant l'exécution fait échouer la
  demande avec un message clair.
- **Cycle de vie des imports** : ils partent avec la dernière génération qui les
  utilise (« Régénérer » peut réutiliser les mêmes), et un import déposé puis
  jamais utilisé est balayé après 24 h (`lib/generation-sources.ts`).
- **Pas de format ni de mégapixels en mode « images »** : le graphe d'édition n'a
  aucun nœud de taille, la sortie suit l'image 1 (mise à l'échelle par
  `FluxKontextImageScale`). L'édition tourne **toujours avec le LoRA Lightning**
  (4 étapes, CFG 1) : le mode « Qualité » (40 étapes, CFG 4, sans LoRA), testé,
  ne change rien au rendu, il n'est plus proposé (la colonne `lightning` et le
  nœud restent, au cas où).
- Validé sur le vrai ComfyUI (2026-10-01) : édition à 2 sources en ~30 s (4 étapes,
  aperçu reçu), texte en ~18 s (8 étapes).

### File d'attente : lecture unifiée et indicateur du header (2026-10-01)
Lancer une génération est du « fire and forget » : on ferme la popup, le worker
continue, et l'icône du bandeau dit ce qui tourne, ce qui est prêt, ce qui a
échoué. Décisions :
- **Une table par type de tâche** (`asset_generations`, `jobs`) **+ une couche de
  lecture commune** (`lib/taches.ts` pour les règles pures, `lib/queries-taches.ts`
  pour la base). Pas de table `taches` générique : les deux types ont des charges
  utiles et des règles différentes, la décision « ne pas généraliser le worker »
  tient. La vidéo y figure en **lecture seule** (libellé = titre du plan, lien par
  son uuid public, jamais par sa position, F03).
- **« Vu » en base** (`vu_at` sur les deux tables, migration 0028), pas en
  localStorage : un seul utilisateur mais plusieurs navigateurs possibles. Posé en
  cliquant sur une entrée, sur « Ignorer », « Tout marquer comme vu » ou en
  adoptant un candidat ; jamais en effet de bord d'un rendu. Les tâches finies avant
  la migration sont considérées comme vues.
- **Relais par sondage** de `GET /api/taches` (un seul `TachesProvider` dans le
  layout racine, qui survit aux navigations) : 3 s tant qu'une tâche est active ou
  que le panneau est ouvert, 20 s sinon, tout de suite au retour de l'onglet,
  suspendu onglet caché. Pas de SSE : la progression est déjà écrite au plus une
  fois par seconde, une latence de 3 s ne se voit pas.
- **Ordre de la file** (affichage) : en cours, puis en attente dans l'ordre où le
  worker les prend (images avant vidéo, FIFO à égalité, sans préemption), puis les
  terminées. Une image qui attend pendant qu'une vidéo tourne est signalée
  « derrière une vidéo ». Terminées/échecs gardés 7 jours ou tant qu'ils ne sont
  pas vus, 20 au plus.
- **Indicateur** : badge or = tâches actives ; point écarlate = échecs non vus ;
  point or plein = terminées non vues ; titre d'onglet « (n) ». Aucun fond rouge.
  Un clic mène à `/p/<projet>/assets/<code>?generation=<uuid>` : la fiche ouvre la
  popup sur ce résultat, le marque vu et retire le paramètre de l'adresse.
- **La fiche de l'asset ne se recharge que lorsqu'une génération de CET asset
  change d'état** (`pageEstPerimee`) ; la progression et l'aperçu viennent du
  store, pas d'un rechargement toutes les 3 s.
- **Plusieurs générations par asset** : la limite « une seule à la fois » est
  levée ; la file est plafonnée à 10 images en attente (`PLAFOND_FILE_IMAGES`) et
  la popup annonce « Ajoutée à la file, position N ».
- Pas encore : annulation, toasts, miniatures (le panneau charge les PNG pleine
  taille, bornés à 44 px par CSS), progression vidéo.

### Miniatures d'images à la demande (2026-10-01)
Les PNG d'assets et de candidats pèsent 1 à 7 Mo (ComfyUI, 1024² à 1,3 MP) et
étaient chargés en pleine taille derrière des vignettes de 40 à 300 px. Décisions :
- **Une option de la route média, pas une nouvelle route** : `/api/media/<chemin>?w=192`
  renvoie un WebP réduit (`sharp`, jamais agrandi), mis en cache sous
  `MEDIA_ROOT/_miniatures/<largeur>/<hash du chemin>-<mtime>-<taille>.webp`. La clé
  contient la date et la taille de la source : une image remplacée sous le même nom
  (F01 : adoption, import) donne une miniature neuve, et les périmées du même
  chemin sont supprimées à la génération. Pas de purge globale à prévoir.
- **Liste blanche de largeurs** (96 / 192 / 384 / 768, écran 2×) : toute autre valeur
  est ignorée et l'original est servi. Images raster seulement (GIF exclu, vidéo et
  audio inchangés, Range compris). Échec de `sharp` → repli sur l'original.
- **Cache HTTP** : `immutable` quand l'URL porte `?v=` (versions des fichiers
  d'assets), sinon `no-cache` avec ETag (304).
- **L'original reste pour le zoom** (`MediaZoom` : `apercu` pour le déclencheur,
  `src` pour la fenêtre) et pour tout ce qui part à ComfyUI. L'image de la fenêtre
  agrandie est en `loading="lazy"` : dans un `<dialog>` fermé, une image non
  paresseuse est chargée d'office, ce qui annulait l'intérêt des miniatures.
- **Windows** : `sharp` lit la source en mémoire et coupe son cache pour ne jamais
  garder un fichier ouvert (sinon l'écrasement de `assets/<code>.png` à l'adoption
  échouerait en EBUSY).
- Hors périmètre : les posters (projet, saison, épisode) restent en pleine taille.
- Code : `lib/miniatures.ts` (pur, utilisable côté client : `urlMiniature(src, largeur)`),
  `lib/miniatures-serveur.ts`, `lib/miniatures.test.ts`.

### Suivi en direct des générations : WebSocket ComfyUI, relayé par la base (2026-10-01)
Le worker suit un prompt par le WebSocket de ComfyUI (`/ws?clientId=…`) en plus
du HTTP, pas à sa place. Décisions :
- **HTTP reste la source de vérité.** `/prompt`, `/upload`, `/view` et `/history`
  ne changent pas ; `/history` confirme la fin (y compris une fin que le
  WebSocket aurait manquée) et sert de repli si le WebSocket tombe : la tâche
  continue alors sans barre de progression, comme avant.
- **C'est le worker qui détient le WebSocket**, pas le navigateur : ComfyUI
  n'envoie la progression et les aperçus qu'au `clientId` qui a soumis le
  prompt (le worker, qui le passe aussi à `/prompt`), et son CORS n'autorise que
  sa propre origine. Le WebSocket s'ouvre **avant** la soumission, un prompt
  court pouvant finir avant qu'on l'écoute.
- **La progression passe par la base** (`asset_generations.progression_*`,
  `etape_libelle`, `apercu_*`) : web et worker sont deux processus, la base est
  déjà leur canal commun, et la page la relit toutes les 3 s. Écriture limitée à
  1/s ; l'aperçu est un fichier écrasé sous `generations/<assetId>/`, pas un
  blob en base ; tout est remis à zéro en fin de tâche. Conséquence voulue :
  recharger la page ou l'ouvrir ailleurs ne perd pas le suivi.
- Décodage tolérant : un message inconnu n'interrompt jamais le suivi.
  `COMFYUI_WS_DEBUG=1` journalise chaque message brut sous `MEDIA_ROOT/_debug/`
  (pour voir ce qu'émet réellement le nœud `ModelPreviewOverrideKJ` de la vidéo).
- Seules les images sont branchées dans l'interface ; le client de suivi est
  générique (il marche pour un `prompt_id` vidéo), le branchement du worker
  vidéo et de son écran reste à faire.

### File d'attente du worker : reprise et priorité (2026-10-01)
Premier lot de la file d'attente (rapport de recherche : modèle de données,
indicateur du header et annulation viennent après). Décisions :
- **Reprise au démarrage** (`worker/reprise.ts`, une seule fois, idempotente) :
  ce qui est « en cours » appartenait à un worker mort — `npm run worker` est un
  `tsx watch`, donc **chaque sauvegarde d'un fichier importé redémarre le worker**.
  Une image `en_cours` passe à `echoue` (« Interrompue (worker redémarré) », pas
  de rejeu automatique : même règle que tout échec d'image) ; une vidéo `en_cours`
  repasse `en_attente` **sans consommer de tentative** (F04 : une interruption
  n'est pas un échec de rendu). Le statut du plan n'est pas touché (le job le
  repasse « en cours » en repartant, comme après une indisponibilité). La barre de
  progression et le fichier d'aperçu de l'image interrompue sont nettoyés.
- **Hypothèse : un seul worker sur la base.** Un second worker (ex. un conteneur
  `cadence-worker-1` oublié, en mode `stub`) verrait ses tâches en cours reprises
  à tort, et se disputerait la file avec le worker de dev.
- **Doublon possible** : si ComfyUI exécute encore le prompt de la tâche reprise,
  une vidéo remise en file sera soumise une seconde fois. V2 (non codée) : retrouver
  la tâche par `comfyui_prompt_id` — `/history` s'il est fini (on récupère le
  résultat), `/queue` s'il tourne encore (on se rattache au suivi) — avant de
  décider.
- **Priorité** (`worker/ordonnanceur.ts`, fonction pure) : à chaque tour, **images
  avant vidéo**, FIFO à genre égal (puis `id`), **sans préemption** — une vidéo en
  cours n'est jamais coupée, une image qui arrive pendant ce temps attend sa fin
  (30 min au plus). Une image se refait en quelques secondes, une vidéo dure des
  minutes ; cela colle à F04 (le jour les itérations, la nuit la file vidéo).
  Aucune généralisation de `worker/comfyui/` : l'ordonnanceur ne connaît que le
  genre, la date et l'id.
- **Enchaînement sans temps mort** : quand une tâche vient d'être traitée, le
  worker enchaîne après 1 s au lieu d'attendre l'intervalle (10 s) ; il ne patiente
  l'intervalle complet que s'il n'y avait rien à faire ou si ComfyUI est
  injoignable (la tâche reste en attente, rien n'est consommé).
- Statut **`annulee`** ajouté aux générations d'images (varchar, sans migration) ;
  l'annulation elle-même (drapeau + `/interrupt` après vérification du `prompt_id`)
  reste à faire.
- **Plus de sondage infini côté worker** : la reprise règle le redémarrage ; une
  génération vivante est bornée par le délai de 10 min (30 min pour une vidéo). Reste
  le cas d'un worker arrêté sans redémarrer : les demandes restent « en attente »
  (ou « en cours » jusqu'à son retour) et l'écran continue de les sonder — c'est la
  tâche de l'indicateur du header de le montrer clairement.

### Annulation des tâches et purge des échecs (2026-10-01)
Dernière brique de la file d'attente : on peut annuler une génération d'image ou un
job vidéo, depuis le panneau du header et depuis la popup de génération.
- **En attente → annulée tout de suite** (UPDATE gardé par le statut, atomique).
  **En cours → drapeau** `annulation_demandee_at` (migration 0029, images et vidéos),
  que le worker lit pendant l'exécution : la sonde (`worker/annulation.ts`) court en
  même temps que l'attente du résultat, l'annulation n'attend pas le rythme normal.
  Idempotent : redemander ne change rien ; une tâche déjà finie reste finie.
- **Jamais d'interruption à l'aveugle.** `POST /interrupt` arrête ce qui tourne sur
  TOUT le serveur, y compris un job lancé à la main sur ComfyUI. Le worker lit donc
  `GET /queue` d'abord (`lib/annulation.ts`) : prompt en cours → `/interrupt` (avec
  son `prompt_id`, **une seule fois**, puis on relit /queue jusqu'à constater qu'il a
  quitté la file) ; prompt encore en file → `POST /queue {delete}` ; ni l'un ni
  l'autre → rien ; /queue muet ou illisible → on réessaie, on ne coupe rien (si ça ne
  s'éclaircit pas, la tâche est marquée annulée dans Cadence mais ComfyUI n'a pas été
  touché : cas signalé dans les logs, `sans_effet`).
- **Format de /queue (relevé sur le serveur de l'utilisateur, un prompt en cours) :**
  `{ queue_running: [[numéro, prompt_id, graphe, extra_data, sorties]], queue_pending: [...] }` ;
  le décodeur accepte aussi des objets `{prompt_id}` / `{id}` si le format évolue.
- **Vidéo annulée = `echoue` + erreur « Annulée »** (v1 : `job_statut` est un enum
  Postgres, pas de valeur de plus). Elle ne consomme pas de tentative et ne déclenche
  pas le rejeu F04 ; le plan reprend l'état de sa dernière réussite (`termine` /
  `previsualise`, sinon `brouillon`). La lecture (`lib/queries-taches.ts`) la présente
  comme `annulee`. Image annulée = statut `annulee`, sans message d'erreur.
- **Une annulation n'est pas un échec** : pas de point écarlate dans le header, entrée
  sobre « Annulée » rangée avec les échecs (même durée de vie). Elle prime aussi sur
  la reprise au démarrage (une annulation demandée est terminée comme annulée, pas
  « worker redémarré » ni remise en file) et sur l'indisponibilité (une exception
  après une demande d'annulation = annulation).
- **Prise gardée par le statut** : le worker ne passe une tâche « en cours » que si
  elle est encore « en attente » ; une annulation directe arrivée entre le choix et la
  prise ne se fait donc pas écraser.
- **Purge « à l'échelle de la journée »** (`worker/purge.ts`, au démarrage puis toutes
  les heures) : demandes d'images échouées ou annulées depuis plus de 24 h supprimées
  (ligne + imports devenus orphelins) ; jobs vidéo annulés de même. Le panneau ne
  montre plus un échec ou une annulation au bout de 24 h (vus ou non). Ne touche
  **jamais** : un candidat terminé (règle des 8 par asset), une tâche active, ni un
  job vidéo **vraiment échoué**, qui reste la mémoire de la boucle d'itération (F03,
  historique des tentatives d'un plan) : il disparaît du panneau, pas de la base.
- **Clés venues du navigateur validées** (`analyserCle` : uuid ou id numérique) : un
  identifiant mal formé est ignoré au lieu de faire lever une erreur SQL.
- Validé en réel (2026-10-01, ComfyUI de l'utilisateur) : image annulée à 4/8 → la
  demande est arrêtée en ~2 s, `/queue` vide, historique ComfyUI `execution_interrupted`,
  aucun résultat récupéré. **Non vu en réel** : le retrait d'un prompt encore en file
  chez ComfyUI (`queue_pending`, seulement testé avec un faux client), et l'annulation
  d'une vidéo (même chemin de code, jamais lancée en vrai).

### Brique LLM locale : interface, chargeur de skills, traces (2026-10-01)
Premier chantier de la génération depuis une conversation (`docs/CONCEPTION_AGENTS.md`
§9 et §13). Construit : `lib/llm/` (interface, fournisseur local, validation, chargeur,
`executerSkill`), table `agent_traces` (migration 0030), `npm run llm:essai`. Décisions :
- **Une interface, des fournisseurs.** `FournisseurLlm.generer(DemandeLlm)` ; le
  premier fournisseur parle `/v1/chat/completions` (serveur compatible OpenAI). Le
  fournisseur Claude (SDK `@anthropic-ai/sdk`, clé en `.env`) viendra derrière la même
  interface ; **pas de fournisseur « abonnement »** (les conditions d'utilisation
  excluent l'accès automatisé hors clé API). Une valeur de `LLM_FOURNISSEUR` inconnue
  échoue franchement au lieu de retomber sur le local.
- **Le schéma du skill sert deux fois** : il contraint la sortie côté serveur
  (`response_format` json_schema) ET figure dans le prompt (JSON compact). Une
  grammaire force les champs sans que le modèle les « voie », or leurs `description`
  portent des consignes.
- **Jamais de JSON réparé en silence.** Hors schéma : UN renvoi automatique (la sortie
  et les erreurs de validation sont renvoyées au modèle), puis `ErreurLlm
  ('sortie_invalide')` qui porte les erreurs. Le texte brut est toujours dans la trace.
- **Erreurs typées** : injoignable / modèle absent / sortie invalide / interrompu /
  délai / http. Annuler = couper la connexion (le serveur arrête de générer).
- **Flux SSE par défaut** : une génération de plusieurs minutes ne laisse pas la
  connexion muette (un reverse proxy la couperait) et donne la progression en jetons.
- **Chargeur sans manifeste** : le dossier EST la déclaration (règles → guides →
  exemples → fichiers partagés → contrat de sortie). Seule exception, déclarée dans le
  code : le lexique H3 partagé par `plan-h3` et `iteration-plan`.
- **`agent_traces`** : skill, fournisseur, modèle, statut (`ok` / `invalide` / `echoue`
  / `interrompu`), messages d'entrée, empreinte et taille du prompt système (pas le
  prompt lui-même : il vit dans git), sortie brute, JSON valide, erreurs de validation,
  renvois, jetons, durée, projet nullable. Le lien vers une proposition viendra avec
  les propositions (chantier 3).
- **Le GPU est partagé avec ComfyUI** : les appels LLM sont des tâches de la file
  (chantier 2, « Ressource GPU unique » ci-dessous) ; `llm:essai`, lui, appelle le
  serveur directement et suppose que ComfyUI est au repos.
Constaté sur le serveur de l'utilisateur (llama-swap, 2 modèles MoE) : contrainte
json_schema **bien appliquée** (un prompt qui demande une phrase sans JSON renvoie
quand même le JSON conforme, et la phrase sans contrainte) ; les modèles **réfléchissent
d'abord** (`reasoning_content`, hors `texte`) et ces jetons comptent dans `max_tokens`
et `usage` : garder une limite large (16 384 par défaut) ; contexte `--ctx-size 262144`,
1 slot (`--parallel 1`). Premier essai réel : `brief-projet` sur `gemma4-26b-A4B`, JSON
valide du premier coup, 80 s, 2 811 jetons en entrée, 2 543 en sortie (raisonnement
compris).

### Ressource GPU unique : les appels LLM entrent dans la file (2026-10-01)
Chantier 2 de la génération depuis une conversation. ComfyUI (images, vidéo) et le
LLM local (llama.cpp derrière llama-swap) tournent sur la **même machine** : le worker
traite **une seule tâche à la fois, tous genres confondus**. Construit : table
`agent_runs` (migration 0031), `worker/llm.ts`, `worker/gpu.ts`, `worker/llamaSwap.ts`,
`lib/gpu.ts`, `npm run llm:tache`. Décisions :
- **Trois genres, une table chacun** : `asset_generations` (image), `agent_runs`
  (llm), `jobs` (vidéo). Pas de table générique, pas de généralisation de
  `worker/comfyui/` ; la couche de lecture (`listerTaches()`) les fusionne. Une
  tâche LLM a : skill, entrée, options (`{ modele }`), projet nullable, statut
  (`en_attente / en_cours / termine / echoue / annulee`, varchar), jetons reçus,
  résultat validé contre le schéma du skill, erreur, lien vers sa trace
  (`agent_traces`), `vu_at`, `annulation_demandee_at`. Pas de `proposition_id` :
  il viendra avec le chantier 3.
- **Ordre : image, puis llm, puis vidéo** (les tâches courtes d'abord : une image se
  refait en secondes, un appel LLM dure 1 à 3 min, une vidéo 1 min 30 en basse
  résolution, 3 à 4 min en upscale), FIFO à genre égal, **sans préemption**. Pas de
  famine : seules des tâches nouvelles peuvent en dépasser une, une vidéo passe dès
  qu'il n'y a plus d'image ni d'appel LLM en attente (propriétés testées sur des
  files aléatoires). À égalité de palier, le domaine GPU de la tâche précédente
  passerait d'abord ; **avec l'ordre actuel chaque genre a son palier, ce critère ne
  tranche donc rien aujourd'hui** (il est là pour le jour où deux genres partageront
  un palier). Le panneau du header lit le même ordre (`PRIORITE_GENRE`).
- **Un domaine injoignable ne bloque pas l'autre** : à chaque tour le worker sonde
  ComfyUI (`/system_stats`) et le serveur LLM (`GET /health` de llama-swap, qui ne
  charge aucun modèle) ; les tâches d'un domaine éteint restent en attente et on
  prend ce qui peut tourner. Un serveur injoignable ne consomme rien (même règle que
  F04).
- **Libération de la VRAM au changement de domaine** (`worker/gpu.ts`) : avant un
  appel LLM, `POST /free {"unload_models": true, "free_memory": true}` sur ComfyUI ;
  avant une tâche ComfyUI, `GET /unload` sur llama-swap. « Au mieux » : un échec ou
  un délai (40 s) est journalisé, n'empêche jamais la tâche et ne bloque jamais le
  worker. Même domaine que la tâche précédente : aucun appel (les modèles sont déjà
  là). L'état « dernier domaine » vit en mémoire du worker ; **au démarrage il est
  inconnu, donc le premier changement de domaine décharge l'autre côté par
  prudence** (un appel de plus, inoffensif quand c'est déjà vide).
- **Annulation d'un appel LLM** : en attente → annulé tout de suite ; en cours →
  drapeau, le worker coupe la connexion HTTP (`AbortSignal`) : llama.cpp arrête de
  générer. Ni erreur ni relance ; la trace est `interrompu`.
- **Reprise et purge** : un appel `en_cours` au démarrage devient `echoue`
  « Interrompue (worker redémarré) » (jamais rejoué) ; les appels échoués ou annulés
  de plus de 24 h sont purgés comme les autres. Un appel terminé n'est jamais purgé :
  son résultat nourrira l'écran de revue.
- **Header** : « Brief du projet · <projet> », mention « Agent », compteur de **jetons**
  (le maximum est inconnu : pas de barre à pourcentage), « derrière une vidéo / une
  image / un agent » quand une tâche d'un autre genre tient le GPU, Annuler, vu/non vu.
  Le clic ouvre la page du projet : *TODO chantier 3*, l'écran de revue des
  propositions la remplacera (`lib/queries-taches.ts`).
Vérifié sur le serveur de l'utilisateur (ComfyUI 0.38, llama-swap, 2026-10-01) :
- **Certain** : `GET /health` → `OK` ; `GET /running` → `{"running":[{"model", "state"
  (starting / ready), "cmd", "ttl"…}]}` ; `GET /unload` → `OK` 200 en 0,7 s et
  `/running` vide ensuite ; `POST /free` ComfyUI → 200 en ~50 ms, sans corps ;
  `GET /upstream/<modèle>/slots` → `is_processing: false` après une annulation (la
  génération s'arrête bien côté serveur). Chaîne de bout en bout, en réel : image
  (15 s) → appel LLM `brief-projet` (64 s, 901 jetons à 53 s, gemma chargé à la demande
  en ~10 s) → image (le worker a déchargé gemma avant : `/running` vide, image en 13 s)
  → appel LLM annulé en 1,0 s ; annulation aussi depuis le panneau du header.
- **Incertain** : l'effet de `POST /free` sur la VRAM n'a pas pu être mesuré : ComfyUI
  ne garde aucun modèle résident entre deux générations sur ce serveur (`vram_free`
  de `/system_stats` identique avant et après une génération Krea, 14 913 Mo sur
  16 302). Constat à creuser : `vram_free` côté ComfyUI ne baisse que de ~350 Mo
  quand gemma est chargé (`--n-cpu-moe 15`), donc la contention VRAM supposée n'est
  pas visible depuis ComfyUI ; à confirmer avec `nvidia-smi` sur la machine du GPU. La
  sérialisation reste utile (un seul GPU, un seul slot LLM) et la libération est une
  précaution peu coûteuse. `ttl: 300` côté llama-swap : le modèle se décharge de
  lui-même après 5 min d'inactivité ; `/unload` évite d'attendre ce délai quand
  ComfyUI reprend la main.

### Bruitages (SFX) : génération audio branchée (Stable Audio 3, 2026-10-01)
`workflows/audio/SFX_Generate_Sounds.json` génère un son à partir d'un prompt court
et d'une durée (Stable Audio 3 Medium, sortie MP3). Le contrat des nœuds est dans
`workflows/README.md`. La génération audio est branchée **sur le modèle des images**,
validée sur le vrai ComfyUI. Décisions :
- **Même table, même file** : une génération audio est une ligne de
  `asset_generations` avec `methode = 'audio'` (colonne `duree_secondes`, migration
  0032). File, header, annulation, reprise, purge, progression WebSocket, candidats
  (8 gardés) et « vu / non vu » en profitent sans duplication ; le worker
  (`worker/images.ts`) traite les trois méthodes. `aspect` et `megapixels` gardent
  leurs valeurs par défaut pour un son : l'affichage se règle sur la méthode, jamais
  sur ces colonnes. Pas de table `asset_generation_audio` : elle aurait dupliqué toute
  la machinerie pour une colonne.
- **Réservée aux assets `sfx`, et réciproque** : un `sfx` ne peut plus lancer de
  génération d'image (`raisonNonGenerable`), un autre type ne peut pas lancer d'audio
  (`raisonAudioNonGenerable`) ; `methodeApplicable` exclut aussi `sfx` (pas de
  méthode « génération / édition » pour un son, la fiche n'affiche plus le choix).
  Action serveur dédiée `lancerGenerationAudio` (au lieu d'un troisième mode de
  `DemandeGeneration`, qui aurait mélangé deux formulaires sans rien en commun).
- **La durée est un paramètre séparé du texte** (`EmptyLatentAudio`), pas une
  mention dans le prompt. Le workflow a un mode de réécriture (un petit LLM étend
  l'idée selon une catégorie et ajoute « Length: X seconds ») : il reste **coupé**
  (`Enable_Reprompt` forcé à `false` par `worker/comfyui/audioMapping.ts`, test à
  l'appui), l'agent `prompt-asset` en tient le rôle (reproductible, même principe que
  `prompt_enhance` de Krea 2). Il écrit un prompt de 1 à 2 phrases en anglais **et**
  une `dureeSecondes` (entier, 15 au plus sauf raison dite : un plan dure 4 à 15 s).
- **La durée vit à deux endroits** : `assets.duree_secondes` (durée du son retenu,
  éditable sur la fiche d'un `sfx`, 1 à 60 s) **et** sur la demande de génération
  (instantané, comme le prompt). La popup audio préremplit la durée de l'asset (4 s
  à défaut) ; adopter un candidat reprend son **son**, son prompt **et sa
  durée** sur l'asset. La valeur que `prompt-asset` renvoie dans `dureeSecondes`
  **pourra préremplir** ce champ : rien ne l'y écrit pour l'instant (aucun appel LLM
  ajouté dans ce lot).
- **UI** : sur la fiche d'un `sfx`, « Générer… » (à côté de l'import) ouvre une popup
  audio dédiée (`GenerationAudioDialog`) : prompt, durée (champ + 2 / 4 / 8 / 15 s),
  seed non exposée ; à droite progression (« étape n/8 », pas d'aperçu : un son n'en
  a pas), lecteur `<audio>` du candidat, Utiliser / Supprimer, annulation, file,
  liste des candidats (durée + lecteur chacun). Le header affiche « Son · CODE » et
  « Génération audio · 4 s », sans miniature.
- **Guide de prompts** : `agents/skills/prompt-asset/guide-stable-audio-sfx.md`
  (sources officielles Stability AI et ComfyUI, gabarit et exemples du workflow). Le
  skill traite un asset de type `sfx` avec ce guide ; le schéma de sortie gagne
  `dureeSecondes` (optionnel, `sfx` seulement) et le type de remarque
  `voix-ou-musique`. Pas de voix (casting vocal) ni de musique dans un `sfx`.
- **Sortie de ComfyUI, vérifiée** : `/history/<id>` → `outputs["19"].audio` =
  `[{filename: "cadence_<CODE>_00001.mp3", subfolder: "audio", type: "output"}]`
  (la clé est bien `audio`, pas `images`). La lecture (`worker/comfyui/sortie.ts`) reste
  tolérante : `images`, `audio`, `gifs`, `videos`, puis toute liste d'objets avec un
  `filename`. `fetchOutput` (`/view`) sert le MP3 tel quel.
- **Mesuré (essai réel, 2026-10-01)** : son de 4 s en ~2,3 s d'exécution ComfyUI
  (une dizaine de secondes de bout en bout avec la file), son de 60 s en ~7 s ; MP3
  MPEG-1 160 kbit/s 44,1 kHz (~163 Ko pour 4 s, un tag ID3 en tête), durée relue par
  le navigateur 3,99 s pour 4 s demandées. Annulation d'une génération **en cours** :
  `annulee` ~2 s après le drapeau, `execution_interrupted` chez ComfyUI, file vide,
  aucun fichier laissé. Annulation d'une génération en file : immédiate. Les MP3 de
  test restent dans le dossier `output/audio/` du serveur ComfyUI (Cadence ne les
  supprime pas, comme pour les images).
- **Mode `stub`** : `StubComfyUIClient` détecte un graphe qui contient `SaveAudioMP3` et
  produit un MP3 silencieux valide (`stubAudio.ts`, ~32 Ko) : toute la chaîne se teste
  sans ComfyUI.
- **À éprouver** (peu coûteux : ~2 s) : le tag `TrackType: SFX` en tête du texte
  (recommandé par la doc officielle ; le code **ne l'ajoute pas** pour l'instant), et la
  mention « Length » dans un prompt brut. Le chemin du workflow se surcharge par
  `COMFYUI_WORKFLOW_AUDIO_PATH`.
- **Reste** : préremplir `duree_secondes` depuis la réponse du skill ; ambiances de plus
  de 15 s et raccord en boucle (non essayés) ; pas de miniature/forme d'onde dans le
  registre des assets.
### Système d'agents : conversation → brief → proposition → revue → application (2026-10-02)
Backend construit (sans interface : la popup s'appuie sur `app/agents/actions.ts` et
`lib/queries-agents.ts`) ; conception dans `docs/CONCEPTION_AGENTS.md` §14, maquette
validée par l'utilisateur. Décisions :
- **Deux profondeurs** : `courte` (Consigne → Proposition → Appliqué ; itérations
  ciblées : prompt d'un asset, un plan, un épisode) et `complete` (Conversation → Brief →
  Proposition → Appliqué ; création de projet, gros éléments interconnectés). L'étape
  Brief n'existe qu'en profondeur complète.
- **Plus de modes ajouter / compléter / remplacer.** C'est la revue qui dit ce qui
  bouge, et un élément qui risque l'écrasement a sa section spéciale avec ce qui sera
  perdu en clair. La consigne de l'utilisateur (« ajoute un plan après… », « refais… »)
  remplace le mode dans l'entrée des skills.
- **Cochage par défaut** : les créations sont cochées ; les modifications d'éléments
  validés (asset `valide`, plan avec rendu, brief validé, clause de style non vide), les
  suppressions et les changements bloqués ou refusés sont décochés. Écraser du validé
  exige `confirmeEcrasement` côté serveur à l'application.
- **Verrou de portée** (`lib/agents/portee.ts`) : un changement hors de la portée
  demandée est refusé d'office à la construction (raison affichée) ET re-vérifié à
  l'application. Le brief est autorisé à toute portée ; un asset peut toujours être
  créé (un asset manquant se propose de partout) mais ne se modifie que dans la portée
  projet ou si c'est la cible.
- **Un changement porte des avertissements typés** : `ecrase_valide`, `invention`,
  `hors_portee`, `bloque_controle` (durée de plan hors 4–15 s : non cochable tant qu'elle
  n'est pas corrigée sur place, `corrigerChangement`), `contredit_brief`,
  `non_pris_en_charge`, `info`.
- **Le brief est un document de référence**, un par projet (`briefs`), modifiable après
  coup ; ses changements sont des changements de proposition comme les autres
  (`cibleType = brief`). Trois états par section : `fourni` (dit ou corrigé par
  l'utilisateur), `deduit` (conclu par l'agent), `a_valider` (inventé ou incertain). Un
  brouillon sort de la conversation ; il devient `valide` à l'application. Un brief
  validé ne se régénère pas par-dessus : on le modifie section par section.
- **Le squelette d'un projet se construit EN CODE depuis le brief**, sans appel au
  modèle (saison, épisodes, brief — qui porte la clause de style, voir « Le brief, source unique ») ; il est idempotent (saison
  existante réutilisée, épisode du même titre non recréé, **épisode vide réutilisé** :
  un OneShot naît déjà avec sa saison et son épisode techniques).
- **Les propositions des portées courtes se construisent en code depuis le JSON validé
  du skill** (`lib/agents/conversion.ts`, pas de second appel au modèle) :
  `prompt-asset` → modifier le prompt d'un asset (méthode et durée d'un son si elles
  diffèrent) ; `scenario-episode` → scènes et plans d'un épisode (l'existant du même
  titre est modifié, le reste créé), un plan à insérer, ou la correction d'un plan.
  Les répliques d'un scénario SONT écrites et liées à leur plan (applicateur `replique`, ajouté
  depuis ; vérifié à l'usage le 2026-10-02) : le locuteur est rapproché du registre, jamais créé.
- **Insertion d'un plan** : pas de « + » dans la navigation. Le changement « créer un
  plan » porte une POSITION (`apresPlanUuid`, début ou fin) ; l'application réutilise la
  logique d'ordre du glisser-déposer (`lib/ordre-plans.ts`, extraite de
  `app/scenario/actions.ts`) ; la revue indique les rangs qui bougent. Rien n'est
  renuméroté (F03).
- **Trois gestes de retour** : « rejeter » (la proposition est abandonnée, la
  conversation reste), « affiner » (une nouvelle proposition dérivée de la précédente :
  l'agent reçoit sa sortie et le retour libre ; pas pour un squelette, qui se régénère
  depuis le brief), « réinitialiser » (conversation, brouillon de brief et proposition
  en cours remis à zéro) ; `rejeterBrief` abandonne le brouillon et revient à la
  conversation.
- **Une conversation par (projet, portée, cible)** : rouvrir reprend, en démarrer
  « une nouvelle » sur la même cible écrase la précédente (l'historique des
  propositions survit : `propositions.conversation_id` passe à null). Deux cibles ont
  chacune la leur.
- **Les appels au modèle sont des tâches de la file** (`agent_runs`, colonnes `but`,
  `conversation_id`, `proposition_id`) : un tour de conversation, la génération du brief
  et celle d'une proposition. Le résultat devient ce qu'il doit être
  (`worker/agents/postTraitement.ts`) **dans la même transaction** que son écriture : si
  la conversion échoue, rien n'est écrit et la tâche est marquée échouée. Une
  proposition en génération dont la tâche échoue ou est annulée passe `echouee` (aussi
  rattrapé à la lecture : reprise du worker, annulation depuis le header).
- **Application = une transaction, tout ou rien** : aucun changement n'est écrit si l'un
  est refusé (parent non retenu, code d'asset déjà pris, plan de repère disparu…) ; le
  message dit lequel. La proposition passe `appliquee` (tous ses changements appliqués)
  ou `partielle` (certains écartés, bloqués ou refusés d'office). La suppression
  n'est pas prise en charge (refus explicite) ; une voix ne se crée que par l'étape « casting des voix »
  (voir plus bas, 2026-10-02), jamais par une autre proposition.
- **Hors lot** : point de retour / annulation d'une proposition appliquée, enchaînement
  automatique des étapes (validation manuelle à chaque revue), page Monitoring (seule
  `listerPropositions` existe), applicateurs de répliques, de plan H3 (sections du
  prompt) et de suppression.
- Validé : `npm run agents:e2e` (71 vérifications sur la base de dev, faux modèle, tout
  nettoyé) et un essai réel sur gemma via la file : deux tours de conversation (52 s et
  66 s) puis le brief (76 s, JSON valide du premier coup), puis le squelette en code.

### Le brief, source unique de la clause de style et des notes (2026-10-02)
Décision de l'utilisateur : « si on a un brief, les globaux du scénario n'ont plus aucun
sens, c'est juste le brief ; notamment pour la clause de style, on la garde directement du
brief ». **Remplace** les « globaux du scénario » des décisions précédentes (panneau
`ScenarioGlobalsEditor`, `updateScenarioGlobal`, 2026-09-28) : ils sont supprimés.
- **Une seule source : `briefs.contenu`** (`style.clause` et `notes`). Les colonnes
  `projects.clause_style` et `projects.notes` restent, mais comme **copies dénormalisées**
  (la génération d'images lit toujours la colonne ; `asset_generations.clause_style` reste un
  instantané). Elles ne s'écrivent que par `synchroniserClauseStyle` (`lib/agents/brief-db.ts`),
  appelée après toute écriture d'un brief `valide` ou `partiel` : édition directe
  (`modifierChampBrief`) et application d'une proposition (applicateur de brief). Un
  **brouillon ne synchronise rien** : ce n'est pas encore la référence du projet. Un test
  (`brief-partiel.test.ts`) interdit toute autre écriture de ces colonnes.
- **Nouveau statut de brief : `partiel`** = style et notes posés à la main, sans brief
  rédigé par l'agent. La première édition d'un projet sans brief crée la ligne `briefs`
  (source `reconstitue`) ; la page `/p/<id>/brief` n'affiche alors que « Style et notes »
  (sections jamais posées : « à valider », pas « déduit »). Un brief partiel **n'est pas un
  brief** : on peut le rédiger par-dessus (`genererBrief`), mais pas en tirer un squelette.
- **Ce que l'utilisateur a posé gagne sur l'agent** : le brouillon généré par-dessus un brief
  partiel garde les sections « fourni » du partiel (`fusionnerPartielDansBrouillon`).
  Abandonner un brouillon (rejeter, nouvelle conversation, réinitialiser) ne perd pas la
  clause ni les notes du projet : elles reviennent en brief partiel (`residuPartiel`, depuis
  les copies du projet) ; sans clause ni notes, le brouillon est supprimé.
- **Notes** : nouvelle section `notes` du brief (texte libre, groupe « Notes », jamais inventée
  par l'agent — le schéma de `brief-projet` l'accepte, les règles du skill disent de n'écrire
  que ce que l'utilisateur a dit). `dureeEpisodeSecondes` devient optionnelle dans le type
  TypeScript (absente d'un brief partiel) ; elle reste obligatoire dans la sortie du skill.
- **Le squelette n'émet plus de changement « projet »** : la clause voyage dans le
  changement `brief` (création du brief ou section `style`). La cible `projet` reste dans les
  types (anciennes propositions) mais son applicateur refuse avec un message clair.
- **Interface** : le panneau « Globaux du scénario » disparaît de la page scénario, remplacé
  par une ligne « Style et notes du projet : voir le Brief » (clause actuelle en lecture
  seule). Dans l'éditeur du brief, le style s'édite en deux champs (nom, clause), les notes
  en texte libre.
- **Migration 0034** (idempotente, appliquée à la base de dev) : un projet sans brief mais avec
  clause ou notes reçoit un brief partiel ; un brief existant dont la clause/les notes sont vides
  les reprend du projet (jamais d'écrasement d'un champ rempli) ; les copies du projet suivent
  ensuite le brief valide ou partiel. Dev : 2 projets (Les Yeux de Rubis, Troll beau frère) reçoivent
  un brief partiel avec leur clause ; BitterSweet avait déjà la même clause dans son brief.

### Écrire les scénarios des épisodes : un LOT de sous-tâches (2026-10-02)
Étape 1 du pipeline (brief → squelette → **scénarios** → registre d'assets + prompts → plan-h3).
Décisions : chaque étape reste une proposition RELUE (validation manuelle, pas de « tout
enchaîner ») ; un bouton « Continuer » suit l'application d'une étape ; local (gemma) par défaut ;
l'histoire d'abord (le scénario ne déclare AUCUN asset).
- **Un lot = une proposition dont la génération est composée de plusieurs tâches** (`agent_runs`),
  une par **sous-tâche** (un épisode). Colonnes (migration 0035) : `agent_runs.cle_sous_tache`
  (« ep:12 ») + `libelle_sous_tache` ; `propositions.lot` ; `proposition_changements.sous_tache`
  (qui l'a produit) + `sous_groupe` (la scène sous laquelle la revue range un plan ou une
  réplique). Règles pures : `lib/agents/lots-pur.ts` ; base : `lib/agents/lots.ts`.
- **Statut du lot** : `en_generation` tant qu'une sous-tâche est active ; `prete` dès que toutes
  sont closes et qu'au moins une a réussi (**un échec isolé ne perd pas le reste** : il est montré
  dans la revue, « Relancer ») ; `echouee` seulement si TOUT a échoué ; `rejetee` si tout est annulé.
  Les résultats déjà écrits ne se perdent jamais.
- **Exécution** : les sous-tâches sont posées d'un coup et passent l'une après l'autre dans la file
  existante (ressource GPU unique, ordre image → llm → vidéo, FIFO). Le post-traitement
  (`worker/agents/postTraitement.ts`) écrit les changements de CHAQUE sous-tâche dans la transaction
  de son résultat, au fil de l'eau : il **remplace ses propres lignes** (relance) sans toucher aux
  autres, donc rejouer un résultat ne double rien (idempotent). `finaliserLot` décide du statut à
  chaque fin de sous-tâche (réussie, échouée, annulée) et au démarrage du worker
  (`finaliserLotsOrphelins`, après la reprise : une sous-tâche « en cours » devient « Interrompue »,
  relançable).
- **Relance** (`relancerSousTache`, retour libre facultatif) : une nouvelle tâche pour la même clé ;
  ses anciens changements restent jusqu'à ce que la réponse les remplace. **Pas d'« affiner » en
  bloc** pour un lot : on relance l'épisode qui ne convient pas.
- **Annulation du lot** : sous-tâches en attente annulées, celle qui tourne interrompue (connexion
  coupée) ; le travail déjà fait reste relisible (`prete` s'il y a un résultat, `rejetee` sinon).
  **Purge** : l'échec d'une sous-tâche d'un lot encore ouvert (en génération ou prête) n'est PAS
  purgé au bout de 24 h (la revue en a besoin) ; il l'est une fois le lot clos.
- **Header** : UNE entrée par lot (`lot:<uuid de la proposition>`), jamais une ligne par sous-tâche :
  barre « 3/12 » + épisode en cours + jetons ; annulation du lot ; « vu » quand toutes les tâches le
  sont ; le clic rouvre la popup sur la conversation.
- **Scénario d'un épisode** (`depuisScenarioEpisode`, en code, sans second appel au modèle) : épisode,
  scènes, plans ET **répliques**. Nouvelle cible `replique` (applicateur) : la réplique est créée et
  **liée à son plan** (`plan_dialogues`, un emplacement <Audio N>, **3 au plus par plan** — la
  quatrième est refusée d'office avec la raison). Le locuteur est rapproché du registre (personnage
  par code ou nom, voix off du registre, sinon locuteur LIBRE signalé comme **invention**) ;
  **aucun asset n'est créé** à cette étape. Une réplique identique déjà présente dans l'épisode
  n'est pas redoublée. Clés symboliques préfixées par épisode (`ep12-scene-1`) : plusieurs épisodes
  coexistent dans une même proposition.
- **Épisode qui a déjà du contenu** : choisi explicitement, ses MODIFICATIONS (épisode, plans)
  vont dans la section « risque d'écrasement », décochées ; les plans nouveaux s'ajoutent à la fin
  et rien n'est supprimé (la revue le dit). Un squelette vide n'écrase rien. Verrou de portée :
  un lot de saison ne sort pas de sa saison.
- **Contexte de chaque épisode** : arc de l'épisode au brief (`briefEpisode`), résumés des épisodes
  PRÉCÉDENTS et titres/résumés des SUIVANTS (continuité narrative), registre, extraits du brief dont
  les **notes du projet** (point resté ouvert).
- **Interface** : « Continuer : écrire les scénarios des épisodes » à l'étape « Appliqué » d'une
  création de projet ; « Écrire les scénarios » au pied de chaque saison (portée saison, courte) ;
  sélecteur d'épisodes (vides cochés d'office, estimation) ; liste des sous-tâches avec leur état et
  « Relancer » ; revue **par épisode** (repliable : seul le premier s'ouvre, diffs rendus à la
  demande) puis par scène ; sur la page d'un épisode, « Écrire le scénario » (consigne facultative)
  ou « Ajouter un plan » (position).
- **Essais** : `npm run agents:e2e` (159 vérifications : lot de 3 épisodes, un échec isolé relancé,
  annulation, reprise, idempotence, application, répliques, écrasement, purge) ; les tâches de test
  sont « suspendues » (`options.suspendu`) pour ne pas courir contre le worker de dev.
- **Essai réel (2026-10-02, gemma4-26b-A4B par le worker de dev, ComfyUI au repos)** : projet de test
  de 3 épisodes de 90 s (brief fictif, 2 assets au registre), squelette appliqué puis lot lancé.
  **Durée totale 301 s pour 3 épisodes** (132 s, 84 s, 73 s ; ≈ 3 800 jetons en entrée, 3 900 à
  5 800 en sortie, raisonnement compris) ; **JSON valide du premier coup, sans renvoi, pour les trois**.
  Résultat : 34 changements (9 scènes, 22 plans, 3 répliques), tous appliqués d'un coup, 237 s de plans
  au total. **Qualité** : fidèle au brief (arc, lieux, personnages, ton, rime des pas mouillés reprise
  à l'épisode 3, notes du projet respectées : 3 répliques seulement, « les silences comptent »),
  progression d'un épisode à l'autre cohérente (le sel gagne, Iris recule puis avance), inventions
  déclarées dans `inventions` (contraste du ciré, dialogue du capitaine…), durées 7 à 15 s, aucune
  description ne renvoie à un autre plan. Défauts : quelques descriptions glissent vers la lumière
  (« lumière grise de l'aube ») que la règle du skill interdit ; peu de dialogue malgré un épisode
  « dialogué » (cohérent avec les notes). **Bug trouvé par cet essai et corrigé** : le modèle écrit le
  CODE du registre (« VOICE_off ») ; le rapprochement de locuteur ne reconnaissait pas une voix par son
  code, la réplique devenait un locuteur libre signalé à tort comme invention (`rapprocherLocuteur`,
  test ajouté). L'indicateur du header a montré l'entrée de lot en direct (« Scénarios des épisodes ·
  projet », 0/3 puis 1/3…, jetons).

### Architecture envisagée (2026-09-25)
Le besoin dépasse ce seul projet — souhaité réutilisable pour d'autres. Forme
pressentie : un **catalogue de voix nommées**, chacune avec un échantillon de
référence écoutable, sélectionnable pour lancer le doublage via le workflow
ComfyUI dédié (déjà en place). Se rapproche du test `T1` déjà écrit dans
`FICHE_DE_PLAN_UTILITAIRES.md`, détaché du reste pour devenir un utilitaire
autonome le jour où le volume de voix justifiera de sortir du « à la main ».

---

# Nouvelles frictions

> Format minimal, on structure plus tard. Date + ce qui a coincé + combien de temps perdu.

| Date | Étape | Ce qui a coincé | Temps perdu |
|---|---|---|---|
| 2026-09-25 | génération | Ajustement de prompt sur plusieurs plans en parallèle — pénible sans outil dédié (→ F04) | |
| 2026-09-25 | assets | Dérivés audio (voix/bruitages démuxés) : pas de convention de nommage, pas clair ce qui mérite d'être gardé (→ F01) | |
| 2026-09-25 | assets/voix | Doublage via custom node micro live peu concluant, samples enregistrés en amont marchent mieux (→ F06) | |

### Retours d'usage sur l'agent : plans plus longs, notifications, une seule validation (2026-10-02)
Test réel du lot de scénarios sur « Nuit sur Tanger » (retours de l'utilisateur) :
- **Plancher de 5 s par plan, et regrouper plutôt que découper.** Le scénario produisait
  des plans de 5 s ou moins (le skill disait « pousse le plan de coupe plus loin »). Le but
  est d'avoir PEU de plans à tourner. `DUREE_GENERATION_MIN` passe de 4 à **5** (contrôles de
  structure, applicateur de plan, schémas de `scenario-episode` et `plan-h3`, skill de chat
  `fiche-de-plan`) ; `scenario-episode` vise 8 à 15 s, fusionne les moments d'un même lieu et
  d'un même temps qui tiennent en 15 s, et traduit la variété de points de vue et la cadence
  par des COUPES INTERNES au plan (écrites plus tard par `plan-h3`), pas par des plans de plus.
  Séparer reste justifié par un changement de lieu/temps, un dialogue qui dépasse 15 s, un jeu
  de références très différent (6 images au plus par plan). Les plans existants de 4 s sont
  désormais signalés par les contrôles de structure (à rallonger à la main).
- **Notifications de fin de tâche** (`NotificationsTaches`, monté dans le layout) : un toast à
  la fin (ou à l'échec) d'une génération, d'un lot ou d'une proposition, avec « Voir ». Ce qui
  était déjà fini à l'ouverture de la page n'est pas annoncé ; une annulation voulue ne
  notifie pas ; on attend la fermeture d'une popup modale (elle cacherait le toast) ; au-delà de
  3 fins simultanées, un seul toast les regroupe.
- **Notifications natives du navigateur (2026-10-02)** : un interrupteur « Notifications du
  navigateur » dans le panneau des générations (`BasculeNotifications`,
  `lib/notifications-navigateur.ts`) ; l'autorisation se demande au clic, l'option est gardée
  dans le localStorage. Page en arrière-plan (onglet caché ou fenêtre sans focus) : une
  notification du système (clic = la fenêtre revient et ouvre la tâche), pas de toast ; page
  visible : toast comme avant. Le sondage continue onglet caché tant que l'option est active
  et qu'une tâche tourne (le navigateur ralentit seul les minuteurs d'un onglet en arrière-plan :
  la notification peut arriver avec un décalage d'au plus une minute environ).
- **Une seule validation à l'application.** La confirmation d'écrasement en deux temps est
  retirée de l'interface : un écrasement est décoché par défaut et montré en tête de la revue,
  le cocher EST la décision. Le bouton annonce « dont N écrasement(s) ». Le serveur exige
  toujours `confirmeEcrasement` ; l'interface le pose à l'application.
- **« Vider la file » (2026-10-02)** : un bouton dans la section « En cours / en file » du
  panneau des générations (confirmation inline « Oui, retirer N »). Il annule tout ce qui ATTEND
  (images, sons, vidéos, appels d'agent, sous-tâches de lots) et laisse tourner ce qui a commencé :
  rien n'est interrompu, tout se relance. Une vidéo retirée remet son plan dans son état précédent ;
  un lot sans sous-tâche en cours voit son statut décidé tout de suite. Onglet « Brief » placé en
  premier dans la navigation (avant « Scénario »).
- **Retirer des tâches de la liste (2026-10-02)** : une croix ✕ par tâche terminée, échouée ou
  annulée, et un « Vider la liste » par section (terminées / échecs et annulations) du panneau.
  Rien n'est supprimé : la colonne `masque_at` (migration 0036, sur `asset_generations`, `jobs`
  et `agent_runs`) masque la tâche (et la marque vue) ; le candidat d'une génération reste
  relisible dans la popup de son asset, les traces restent intactes. Les tâches actives ne se
  retirent pas (on les annule). Remplace le bouton « Ignorer » des échecs.

### Étape 2 du pipeline : le registre d'assets depuis le brief (2026-10-02)
Un LOT, comme les scénarios (même infrastructure, voir « Étape 1 »). Décisions :
- **Une sous-tâche `prompt-asset` par MASTER du brief** (personnages → `CHAR_<nom>`, lieux →
  `DEC_<nom>`), clé `asset:<code>`, l'une après l'autre dans la file. Les masters viennent du brief
  seul (« l'histoire d'abord » : le scénario ne déclare aucun asset) ; les **voix** se créent au
  casting vocal, les **accessoires, effets et sons** se déduiront des plans (étape 3).
- **Créer ou compléter** : un asset absent est CRÉÉ (description canonique du brief + prompt, méthode
  `generation`, variante de guide `generation` : on ne charge que le guide Krea) ; un asset existant
  sans prompt reçoit son prompt (et la description du brief s'il n'en a pas) ; un asset qui a déjà un
  prompt n'est pas coché d'office (le réécrire = section « risque d'écrasement », décochée). La
  description écrite à la main n'est jamais remplacée.
- **Depuis le projet seulement** (le verrou de portée n'autorise la modification d'assets existants
  qu'à la portée projet). Entrées : « Continuer : créer le registre d'assets » à l'étape « Appliqué »
  après les scénarios, et « Créer le registre depuis le brief » sur la page des assets (vue directe
  de la popup, pour un projet qui a déjà un brief).
- Revue : un groupe « Assets », une ligne cochable par asset ; relance d'une sous-tâche possible ;
  libellé de lot « Registre d'assets » dans le header.
- Code : `lib/agents/registre.ts` (pur), `depuisRegistreAsset` (conversion), `entreePromptAssetCandidat`
  (entrée du skill), `genererRegistre` (service), `postSousTacheRegistre` (worker), `ChoixAssets` (UI).
  Testé : `lib/agents/registre.test.ts` et `npm run agents:e2e` (scénario du registre, faux modèle).

### Casting des voix : une étape du pipeline, entre le registre et les fiches de plan (2026-10-02)
Constat (utilisateur) : les scénarios écrivent des répliques, mais aucune voix n'existait pour les dire
(répliques « orphelines »). Décision (utilisateur, option A) : une étape dédiée crée les voix manquantes.
**Révise** deux décisions : « la voix se crée et s'édite uniquement au casting vocal » (2026-09-30) et
« une voix ne se crée pas par ce chemin » (système d'agents, 2026-10-02). Désormais la **création** d'une voix
peut passer par une proposition de cette étape ; son **édition** reste au casting vocal, et le son se génère
toujours à part (ComfyUI, non branché).
- **Qui a besoin d'une voix** : un personnage du registre avec au moins une réplique et sans fiche de voix
  (un personnage n'en a qu'une), et la **voix off** si des répliques « voix off » n'ont aucune voix « off »
  au registre. Un locuteur libre (absent du registre) n'en reçoit pas : c'est une invention à valider.
  Un code `VOICE_x` déjà pris sans rattachement bloque le candidat (à rattacher au casting).
- **Un lot** `prompt-voix`, une sous-tâche par voix (clé `voix:CHAR_maya`, `voix:off`), comme le registre ;
  entrée : le personnage et sa description, l'impression vocale du brief, quelques répliques, les voix déjà au
  casting. Sortie : l'instruction de timbre (Voice Design) et des remarques.
- **Cible de changement `voix`** (création seulement) : l'applicateur crée l'asset `VOICE_*` (instruction en
  prompt de génération, description canonique reprise du personnage) et sa `voix_fiches` rattachée au
  personnage, avec le texte de référence par défaut du projet. Autorisée depuis toute portée (comme un asset
  manquant). Code : `lib/agents/voix-casting.ts` (pur), `conversion.depuisCastingVoix`,
  `applicateurs/voix.ts`, `service.genererVoix`, `postSousTacheVoix` (worker), `ChoixVoix` (« Continuer »
  après le registre). Testé en pur (`voix-casting.test.ts`) ; l'application en base reste à essayer à la main.
- **Répliques écrites avant leur personnage** (constaté sur « Le dernier maître du Hack » : scénarios avant registre) :
  leur locuteur reste en simple texte (`locuteur_texte`), sans lien avec le personnage créé ensuite. Les candidats
  de voix les rapprochent du registre (même règle que `rapprocherLocuteur`), et `rattacherRepliquesLibres`
  (`lib/agents/rattachement.ts`) relie ces répliques à leur personnage ou à leur voix dès qu'une proposition
  crée un personnage ou une voix (même transaction). Un locuteur inconnu n'est jamais touché.
- Ordre du pipeline : brief → squelette → scénarios → registre → **voix** → fiches de plan.

### Étape 3 en préparation : entrée de plan-h3 et essai de qualité (2026-10-02)
- `entreePlanH3` (lib/agents/contexte.ts) assemble l'entrée de `plan-h3` pour un plan : intention,
  position dans la scène, durée et fps visés, scène, épisode, plans voisins, registre (code,
  description canonique, méthode, prompt, fichier ou non ; hors voix et plans clés, **bruitages
  compris** depuis le 2026-10-02), répliques du plan (uuid, locuteur, texte exact, durée mesurée),
  clause de style, extraits du brief. Sur un plan réel du projet 1 : ≈ 3 500 jetons d'entrée pour
  ≈ 10 500 de prompt système.
- **Contrat de sortie : un brouillon, que le code assemble** (utilisateur, 2026-10-02). Constat : sur 8 essais
  (Gemma, Qwen), 100 % ont eu besoin d'un renvoi, parce que le guide et les exemples montraient la forme
  ASSEMBLÉE (`<Subject N>`, `<Picture N>`) alors que le contrat interdisait de l'écrire. Désormais :
  - le modèle rend `references[]` (`asset`, `nature` `image` | `son`, `role`, `nom`, `definition`,
    rétention facultative), `ouverture`, `shots[]` (`debutSecondes`, `texte`), `summary`, ambiance, musique,
    `repliques[]`, `assetsManquants[]` (structuré, voir la décision d'ordre plus bas), `notes` ;
  - un SEUL marqueur dans la prose : `[[CODE]]`. Plus de `{picture}`, plus de label numéroté ;
  - `lib/agents/plan-h3-assemblage.ts` (pur) pose `<Subject i>`/`<Picture i>` (images, dans l'ordre de
    `references`, 1 à n sans trou), `<Audio k>` (bruitages, sur les slots que les voix n'occupent pas),
    `[Shot N]`, `At MM:SS.mmm, Hard cut to`, `subject_definitions`, `retention_analysis` (« appears in » par
    shot) et le préfixe du summary ; plus de slot (6 images, 3 audio, **la voix prime**) : la référence est
    décrite en prose, avec une alerte ;
  - les **voix ne sont jamais des références** : dérivées de `repliques`, sans ligne `<Audio N>` (comme les
    fiches validées) ;
  - ce qui n'a pas besoin de référence s'écrit en prose (le modèle vidéo l'interprète) : deux natures, pas de
    nature « texte » ;
  - **régénérer une fiche remplace ensemble le texte ET les références d'image du plan** (les numéros ne sont
    renumérotés qu'à cette occasion ; les slots des voix ne bougent pas) : soit la fiche est écrite à la main
    et l'utilisateur synchronise, soit l'agent la synchronise, au risque d'écraser. À garder en tête : des
    « musiques / environnements sonores » deviendront des assets plus tard.
  Les exemples du skill sont des brouillons ; chacun est testé (schéma, contrôles, assemblage identique à
  `lib/agents/fixtures/plan-h3/`, dérivée des plans validés aux « Hard cut to » près).
- `controlerSortiePlanH3` (lib/agents/plan-h3-controles.ts, pur, testé) vérifie le CONTRAT du brouillon
  (durée 5-15, 6 images au plus, assets du registre, nature cohérente avec le type, marqueurs `[[CODE]]`
  présents dans `references`, aucun label ni titre de section recopié, premier shot à 0, débuts croissants,
  shots d'au moins 1,5 s, verbatim des répliques, pas de mots par seconde) ; il ne juge pas la mise en scène.
- `npm run plan-h3:essai -- --projet <id>` : passe des plans réels par la file du worker et écrit un
  rapport comparant la sortie du modèle (brouillon puis prompt assemblé) à la fiche écrite à la main
  (`data/_essais/`). Décide si gemma suffit pour l'étape 3 ou s'il faut Claude. Aucun applicateur de fiche
  de plan (écriture en base des sections et de `plan_refs`) n'est construit avant. `--direct` lance le skill
  dans le processus, flux visible ; `npm run plan-h3:reflexion` diagnostique la réflexion du serveur.
- **Piège llama.cpp (2026-10-02)** : un `pattern` du schéma de sortie qui contient `.*` (« contient X ») piège
  la grammaire : le guillemet fermant est avalé comme contenu et le JSON suivant tombe dans la chaîne
  jusqu'à `max_tokens`. Une règle de contenu se vérifie après génération (contrôles + renvoi), jamais dans
  la grammaire ; un test le garde (`lib/llm/schemas-patterns.test.ts`).
- Décision d'ordre (utilisateur, 2026-10-02) : les arbres d'assets (dérivés, accessoires) se traitent
  APRÈS plan-h3, depuis les plans : plan-h3 déclarera ses assets manquants de façon structurée
  (nom, type, parent éventuel, description, raison), créés avec le plan dans la même proposition ; un
  lot `prompt-asset` écrira ensuite leurs prompts, en édition à partir du parent quand c'est pertinent.

