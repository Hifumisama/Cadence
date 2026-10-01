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
