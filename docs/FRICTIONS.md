# FRICTIONS — Pipeline Les Yeux de Rubis

> Journal des points de friction rencontrés en production réelle.
> **Règle du jeu :** on note au fil de l'eau, on ne résout pas ici.
> Une entrée = une douleur constatée, pas une idée de fonctionnalité.
> La spec de l'outil viendra de ce fichier, pas de l'imagination.

**Légende fréquence :** 🔴 à chaque plan · 🟠 à chaque séquence · 🟡 à chaque épisode · ⚪ rare

## État des lieux (2026-09-17)

| # | Friction | Fréq. | Statut |
|---|---|---|---|
| F01 | Registre d'assets illisible | 🔴 | requalifiée — registre à plat (2026-10-06) + voix définies, versioning abandonné |
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

**Fréquence :** 🔴 · **Étape :** assets · **Statut :** requalifiée — registre à plat (2026-10-06) + casting voix définis, versioning abandonné

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
- **Chargeur sans manifeste** (révisé le 2026-10-07 : format Agent Skills, voir la fin du fichier) : le dossier EST la déclaration (règles → guides →
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

### Briques d'iteration-plan : images vers le LLM, planche de vignettes (2026-10-02)
Préparation du branchement d'`iteration-plan` (qui reste à faire : conversion, applicateur,
interface). Rien ici ne modifie la « Direction retenue pour l'agent d'itération » (2026-09-30) :
correction seulement après visionnage, durée mesurée par `ffprobe`, jamais estimée.
- **Contenu mixte dans `lib/llm`** : `MessageLlm.content` est une chaîne (inchangé) OU une liste
  de parties au format OpenAI (`{type:"text"}`, `{type:"image_url", image_url:{url:"data:image/jpeg;base64,…"}}`),
  transmise telle quelle par le fournisseur. Aides : `partieImageJpeg`, `texteDuContenu`,
  `messagesSansImages`. **Les images n'entrent jamais dans `agent_traces.messages`** : `executerSkill`
  les remplace par un marqueur `[image n : X Ko]` (une planche pèse ~0,5 Mo de base64). Conséquence :
  une trace d'iteration-plan n'est plus rejouable à l'identique sans réextraire la planche (le rendu,
  lui, reste sur disque). Nouveau code d'erreur `vision_absente` (serveur sans projecteur `mmproj`).
- **Test de vision (une requête, 2026-10-02)** : `gemma4-26b-A4B` sur le serveur local, image 64×64
  rouge unie, `enable_thinking:false`, `max_tokens` 8 → HTTP 200, réponse « Red », 78 jetons d'entrée,
  1,3 s. Le modèle par défaut **voit** (llama.cpp b9453, projecteur chargé). Qwen non testé.
- **Planche de vignettes** : `lib/planche-vignettes.ts` (pur, exécuteur de commandes injectable) —
  `mesurerDuree` (ffprobe, `format=duration`), `instantsVignettes` (0, 1, 2… s dans le fichier, marge de
  fin 0,25 s ; au-delà de 15, 15 instants répartis), `extrairePlanche` (une commande ffmpeg par
  vignette, `-ss` avant `-i`, 384 px de large, JPEG), `contenuPlanche` (« Vignette à 4 s : » + image).
  Plafond 15 = le plafond de durée d'un plan (`duree_plafond_secondes`).
- **ffmpeg/ffprobe absents de la machine de dev** (ni PATH, ni emplacements courants) : l'extraction
  échoue avec « ffmpeg introuvable : installe-le ou renseigne FFMPEG_PATH » (`FFPROBE_PATH` facultatif,
  sinon à côté de `FFMPEG_PATH`). Le test d'intégration réel est sauté tant qu'ils manquent. À prévoir
  aussi dans l'image Docker du worker en prod.
- **Coût en jetons** : à mesurer sur le premier appel réel (`usage.entree`) ; estimation Gemma 4 entre
  ~70 et ~280 jetons par vignette de 384 px, soit ~1 000 à 4 200 pour 15 vignettes, à comparer aux
  ~10 500 du prompt système de plan-h3 : négligeable devant le contexte (262 144).

### Étape 3 branchée : plan-h3 de bout en bout (2026-10-02)
Le skill `plan-h3` est relié à l'application : on génère la fiche d'un plan (ou celles de plusieurs plans en
lot), on la relit dans la revue, on l'applique, elle est écrite sur la page du plan. Modèle : celui du serveur
par défaut (gemma) ; rien ne force un autre modèle (`LLM_MODELE_PLAN_H3` absent du `.env`). Décisions de
l'utilisateur :
- **Points d'entrée** : « Écrire la fiche » / « Réécrire la fiche » sur la page d'un plan (portée `plan` : une
  proposition SIMPLE, affinable) ; « Écrire les fiches de plan » sur l'en-tête d'un épisode (un LOT, une
  sous-tâche `plan-h3` par plan, clé `plan:<uuid>`, l'une après l'autre dans la file, sélecteur de plans à
  cocher) ; « Continuer : écrire les fiches de plan » après l'étape des voix (lot sur tout le projet). Les plans
  sans fiche sont cochés d'office.
- **Régénérer = tout régénérer.** Écrire une fiche remplace ensemble les six sections (`plan_prompt_sections`,
  `ordre` canonique 0–5) ET les références picture/audio du plan (`plan_refs` ; les références vidéo ne
  bougent pas), ainsi que la durée de génération (la durée de montage la suit). Les liens de répliques
  (`plan_dialogues`) restent ceux de la base : leurs slots sont l'ENTRÉE de l'assemblage (`slotsAudioPris`), un
  bruitage prend un slot libre, **une voix n'est jamais une ligne de `plan_refs`**. Un plan brouillon passe
  « en attente » (développé), comme « Développer en fiche de plan ».
- **Nouvelle cible de changement `fiche`** (`lib/agents/applicateurs/fiche.ts`, règles pures dans
  `lib/agents/fiches.ts`) : `cibleRef` = uuid du plan, opération `modifier` seulement ; `apres` =
  `{ sections?, refs?, dureeGenerationSecondes? }`. Champ absent = non touché : l'applicateur sert aussi à une
  **écriture partielle** (iteration-plan : quelques sections, sans `refs`). Il refuse : section inconnue, durée
  hors 5–15 entières, slot hors 1–6 (images) ou 1–3 (audio), deux références sur un slot, un slot audio pris par
  une voix, plus de 3 audio voix comprises, asset absent du projet ou de la mauvaise nature, et **toute écriture
  qui laisserait un label `<Picture N>`/`<Audio N>` sans sa référence** (état final : sections écrites
  par-dessus celles qui restent). Verrou de portée : la fiche d'un plan depuis lui, son épisode, sa saison ou
  le projet ; jamais une création.
- **Écrasement** : un plan dont une section écrite a déjà du texte, ou dont on remplace des références, va en
  « risque d'écrasement », **décoché** (le cocher est le « reset du plan ») ; un plan vide (sections absentes ou
  vides, sans références) est une création, cochée. Un plan qui a déjà un rendu vidéo : écrasement aussi, avec
  l'avertissement `ecrase_valide`. Une génération vidéo en file : simple information.
- **Conversion** (`depuisFichePlan`, pure, testée) : une référence hors registre, une voix ou une nature fausse
  est RETIRÉE et décrite en prose par son nom (alerte) ; l'assemblage pose labels, timecodes et sections ; les
  problèmes des contrôles deviennent des avertissements (nouveau type `alerte_controle`, « Contrôle ») ; un
  marqueur `[[CODE]]` que le code ne sait pas résoudre (asset manquant cité) **bloque** la fiche (à relancer).
- **Règle des 1,5 s par shot : d'erreur à alerte** (conseil fort) dans `controlerSortiePlanH3` (shot trop
  court, dernier shot trop court) : plus de renvoi au modèle pour ça ; `regles.md` dit « vise au moins 1,5 s,
  en dessous seulement pour un effet voulu, dit dans notes ».
- **Assets manquants** : créés dans la MÊME proposition (changements `asset` « créer », code reconstruit selon
  la convention du type). Parent existant : `deriveDeCode` ; parent lui-même manquant : nouveau champ
  `deriveDeCle` (clé `nouvel-asset-<CODE>`), l'application ordonne les créations par dépendance
  (`ordonnerParDependances`) et un enfant dont le parent n'est pas retenu est refusé. Un asset déclaré manquant
  qui existe déjà est ignoré (avertissement) ; dans un lot, un même code n'est proposé qu'une fois (les autres
  plans le disent). Une référence ne vise jamais un asset manquant : il reste en prose. Limite connue : relancer
  la sous-tâche qui proposait un asset partagé peut le faire disparaître du lot si la nouvelle sortie ne le
  déclare plus.
- **Prompts des assets créés : ensuite, sur clic.** À l'étape « Appliqué » d'une fiche : « Continuer : écrire
  les prompts des assets créés » = un lot `prompt-asset` (`prompts-assets`) sur les assets créés sans prompt,
  posé dans la conversation du PROJET (seule portée où l'on modifie un asset existant) ; refusé si cette
  conversation a une tâche en cours ou une proposition en attente de revue. Jamais lancé tout seul.
- Code : `genererFiches`, `plansPourFiches`, `genererPromptsAssetsCrees` (service), `postSousTacheFiche` et la
  branche `plan-h3` non groupée (worker), `relancerSousTache` (clés `plan:`), `estimerFiches`, `ChoixPlans`,
  `SuitePromptsAssets`, aperçu des six sections et des références dans la revue. Testé : `fiches.test.ts`
  (conversion, vérification, écrasement, contrôles de la page sur une fiche écrite) et `npm run agents:e2e`
  (lot de 3 fiches, dédoublonnage des assets, relance, application, contrôles de la page, réécriture en
  écrasement, suite des prompts, plan seul ; faux modèle). Pas encore essayé avec gemma dans l'interface.
- **Point ouvert (contradiction relevée, non tranchée)** : `verifierCoherenceRefs` (page du plan) compte la
  prise d'une réplique liée comme une référence `<Audio N>` déclarée ; or le contrat de plan-h3 (et les fiches
  validées) ne citent jamais les voix. Une fiche écrite par l'agent sur un plan dont une réplique a sa prise
  affichera donc « référence non citée : Audio N ». À trancher : ne plus compter les voix dans ce contrôle, ou
  faire citer les voix par l'assemblage.

## 2026-10-02 — Workflow vidéo : câblage complété (VID_REF2VA)

Rien de ce qui précède n'est contredit (F04 : toggle d'upscale par rebranchement du nœud 34, conservé).

- **Durée** : `plans.dureeGenerationSecondes` (5 à 15 s, `DUREE_GENERATION_MIN/MAX`) est injectée dans le nœud `22:23`.
  Avant, tous les plans sortaient à la durée du fichier (8 s). Hors 5-15 : `ErreurEntreeInvalide`, le job passe
  `echoue` tout de suite, sans rejeu (réessayer ne changerait rien) ; seule une exception inattendue reste traitée
  comme une indisponibilité.
- **Audio de référence** : la prise d'une réplique liée (`plan_dialogues`) n'atteignait JAMAIS le modèle (le worker ne
  lisait que `plan_refs`), contrairement à F02 (2026-09-30, « l'audio de la réplique EST la référence <Audio N> »).
  Désormais les voix occupent leur emplacement, les bruitages de `plan_refs` prennent les emplacements libres
  (la voix prime) ; la durée mesurée de la prise est passée à `LoadAudioUI` (start 0, end = duration).
- **Noms de fichiers d'entrée** : `cadence_<chemin aplati>` (ex. `cadence_repliques_12_prise.wav`) : plus de collision entre
  deux prises de même nom ni d'écrasement des fichiers de l'utilisateur dans le dossier d'entrée de ComfyUI.
- **Prévisualisation** : sans upscale, la sortie `34` est forcée à 24 i/s (elle lisait 48 via les nœuds 168/170 alors que
  les images n'ont pas été interpolées : vitesse double, son décalé).
- **LoadVideoUI** : tous ses champs sont obligatoires (object_info) ; ils sont maintenant posés.
- **Laissé au fichier, sans décision de FRICTIONS contraire** : `plans.fps` (informatif ; le graphe génère à 24 et RIFE
  interpole à 48 via 168), format et mégapixels du 1er pass (`22:9` : 16:9, 0,2 Mpx ; aucune donnée de projet ou de
  plan ne porte de format vidéo), audio de la vidéo de référence non câblé (`ref_video_audios`).

### iteration-plan branché : corriger un plan après visionnage (2026-10-02)
Le skill `iteration-plan` est relié à l'application, de bout en bout : un bouton sur la page du plan, une tâche de
la file, une proposition relue puis appliquée. Rien ici ne modifie la « Direction retenue pour l'agent
d'itération » (2026-09-30) : correction seulement après visionnage, plan par plan, durée mesurée, jamais estimée.
- **Routage par état du plan** (décision de l'utilisateur) : plan sans fiche → `plan-h3` (« Écrire la fiche ») ;
  fiche sans rendu → `plan-h3` (« Réécrire la fiche » : tout est remplacé, case d'écrasement décochée par défaut,
  la cocher = reset du plan) ; **plan avec un rendu terminé → `iteration-plan`** (« Corriger après visionnage »,
  régénération PARTIELLE). « Réécrire la fiche » reste possible sur un plan rendu, avec un avertissement (« ce plan
  a un rendu : préfère la correction après visionnage »). Jamais d'iteration-plan sans rendu (refusé côté serveur
  aussi) ni sans fiche. Un bouton par plan, pas de lot. Modèle : celui du serveur par défaut (gemma, qui voit).
- **Entrée** (`entreeIterationPlan`, lib/agents/contexte.ts) : les six sections STOCKÉES (labels compris), les
  références (label → asset, rôle, rétention ; les voix marquées `voix: true` avec leur réplique), les répliques
  (texte exact), la durée voulue, « ce que tu as vu » (obligatoire, devient la consigne de la proposition) et
  l'historique des corrections déjà tentées sur le plan (déduit des propositions `iteration-plan` : ce qui avait
  été vu, symptôme, cause, catégorie, appliquée / non appliquée / sans écriture, rendu arrivé depuis ou non).
- **La planche n'est jamais stockée** : `agent_runs.entree` porte un DESCRIPTEUR (`planche` : job, chemin relatif à
  `MEDIA_ROOT`, 15 vignettes au plus). Le worker la reconstruit à l'exécution (`preparerEntree`,
  worker/agents/preparation.ts, point d'extension « préparer l'entrée » propre au skill) : ffprobe mesure la durée
  réelle, ffmpeg extrait une vignette par seconde, le `MessageLlm[]` est texte + images ; le contrôleur et le
  post-traitement reçoivent la durée mesurée. Rendu disparu du stockage, ffmpeg absent, planche vide : la tâche
  ÉCHOUE avec un message clair (la proposition passe « échouée ») ; jamais de diagnostic à l'aveugle. Un affinage
  ré-extrait la planche du même rendu. La trace garde le texte, les images deviennent des marqueurs.
- **Labels : le modèle édite le texte FINAL** (choix le plus simple et robuste, écrit dans `regles.md`, qui disait
  à tort « sujets désignés par `[[CODE]]` », contrat du brouillon de plan-h3). Sortie : des remplacements de
  passages (`section`, `avant` recopié exactement, `apres`). Le code (lib/agents/iteration-plan.ts, pur, testé) les
  applique (exact, sinon aux blancs près ; jamais plus tolérant) et contrôle : section connue, passage trouvé UNE
  fois, labels cités existants (plan_refs, slots des voix, `<Subject N>` déjà présents ; pas de `[[…]]`), balises
  `<d>` identiques avant/après (multiensemble : déplacer une réplique est permis, la changer non). Ces erreurs
  déclenchent UN renvoi au modèle (`controleurPourSkill`) ; si elles persistent, la fiche est BLOQUÉE (pas
  d'écriture à moitié). Les dégradations de structure des shots apportées par la correction (`controlerStructure`)
  et la confiance faible sont des alertes. Les références, les répliques et la durée ne sont jamais touchées.
- **Sans écriture, avec la raison** (résumé de la proposition, diagnostic affiché seul) : durée réelle hors de
  ±0,5 s de la durée voulue (mesurée par le code, indépendamment de l'avis du modèle) ou jugée incohérente par
  l'agent, abandon proposé, `categorie: decoupage-scenario`, aucun passage, passages sans effet ou introuvables
  dans le prompt actuel (il a pu changer pendant la génération). `entreeLexique` n'est jamais écrite : la revue la
  montre comme candidate, à ajouter à la main si le rendu suivant confirme.
- **Écrasement** : règles de lib/agents/fiches.ts inchangées. Un plan qui a un rendu = « risque d'écrasement »
  avec `ecrase_valide`, décoché par défaut : l'utilisateur coche la correction pour l'appliquer. Écriture partielle
  (`apres.sections` des seules sections corrigées ; `apres.passages` sert l'affichage avant → après, jamais écrit).
- **Contrôle de cohérence des voix (point ouvert ci-dessus, tranché)** : `verifierCoherenceRefs` prend les refs
  audio dérivées des répliques à part (3e argument) : déclarées (pas de label orphelin si un prompt les cite),
  jamais « non citées ». Les vraies références non citées (bruitages, images de plan_refs) restent signalées.
  Page du plan et analyse d'un collage (app/plans/actions.ts) passent les prises en dérivées.
- Limites connues : aucun instantané du prompt par rendu (`jobs` ne le garde pas) : le diagnostic suppose que le
  prompt actuel est celui du rendu regardé (la fenêtre le dit). Coût réel en jetons de la planche toujours à
  mesurer sur le premier appel (estimation : 280 jetons par vignette). Les catégories `decoupage-scenario` sont
  désormais comptables depuis les résultats des tâches (« Reste à observer » de F03).
- Testé : lib/agents/iteration-plan.test.ts (conversion, contrôleur, cas limites), worker/preparation.test.ts
  (planche reconstruite, erreurs), lib/plan-checks.test.ts (voix dérivées), `npm run agents:e2e` (faux modèle à
  contenu mixte, fausse planche : correction appliquée, durée incohérente, historique, affinage, rendu disparu).
  Pas encore essayé avec gemma ni avec un vrai rendu (ffmpeg absent de la machine de dev : image Docker du worker).

## 2026-10-03 — Test général : file fiable, numéro de rendu, seed par plan (chantier 1)

Issu du test général de l'application (feuille de route : `docs/PLAN_APRES_TEST_GENERAL.md`).

- **Serveur LLM injoignable ne bloque plus la conversation.** Avant : l'appel restait `en_attente` sans limite,
  `tacheActive` refusait toute nouvelle génération sur la conversation, et le refus (code HTTP 200, `ok: false`)
  n'apparaissait qu'en pied de fenêtre sans nommer la tâche. Maintenant : (1) le worker note « injoignable
  depuis » dans `parametres` (`injoignable_llm`, `injoignable_comfyui`, écrit aux seules transitions) ;
  au bout de `LLM_INJOIGNABLE_MAX_MS` (5 min, 0 = jamais) les appels en attente passent `echoue` par le chemin
  ordinaire (`surEchecRun` : lot finalisé, conversation revenue), relançables ; ComfyUI garde son attente (la
  vidéo/image se relance à la main) mais la pastille du header signale l'indisponibilité. (2) La route de santé est
  réglable (`LLM_HEALTH_PATH`, défaut `/health` : llama-swap ; `/v1/models` pour LM Studio, Ollama). (3) Le flux
  LLM a un délai d'INACTIVITÉ (`LLM_INACTIVITE_MS`, 5 min, 0 = aucun) en plus du délai total : un serveur qui se
  tait sans fermer la connexion n'occupe plus le GPU 10 min. (4) Le refus nomme la tâche en cause et la fenêtre
  propose « Annuler cette tâche ». (5) Un lot échoué (ou en cours) offre « Relancer » par sous-tâche en échec et
  « Relancer les N sous-tâches en échec » (le serveur acceptait déjà la relance sur un lot `echouee`).
- **`jobs.tentative` ≠ numéro de rendu.** `tentative` compte les rejeux AUTOMATIQUES d'un même job après un échec
  (F04) ; l'historique l'affichait comme un numéro, d'où « tentative 1 » partout. Nouveau `jobs.numero_rendu`
  (par plan, max + 1 à la création du job, import manuel compris ; rattrapé par `created_at`). L'historique
  affiche « rendu n°N » (+ « rejeu k » si tentative > 1).
- **Une seed par plan (précise F04).** Aucun code n'écrivait `plans.seed` : `input.seed` était vide et les
  seeds codées en dur dans `VID_REF2VA.json` servaient à TOUS les plans et TOUTES les relances (`seedUtilisee`
  toujours null). `plans.seed` a désormais un défaut SQL (15 chiffres) et la migration 0038 rattrape les plans
  existants. « Prévisualiser » / « Rendu final » gardent la seed : rien n'a bougé → même vidéo, voulu.
  « Nouvelle variante » tire une autre seed (qui devient celle du plan).
- **Ce que le rendu a vraiment soumis est gardé** : `jobs.prompt_utilise`, `jobs.duree_utilisee`, `seed_utilisee`
  (écrits par le worker au moment de construire la soumission) — de quoi expliquer qu'un `summary` modifié sans
  effet n'a pas bougé le prompt (le `summary` de PROMPT est une section ; `plans.description`, le résumé de
  scénario, n'est jamais envoyé à ComfyUI). Lève la limite « aucun instantané du prompt par rendu » d'iteration-plan.
- **Préfixe de sortie unique par rendu** (`cadence_p<plan>_r<rendu>[_t<rejeu>]`, `low_…` pour l'aperçu) : le nom
  ne dépend plus du seul compteur du dossier output de ComfyUI (collisions, résultat en cache servi à un autre rendu).
- **La page du plan se recharge** quand un de ses rendus change d'état (`SuiviRendus`, même principe que la fiche d'asset).
- Reste à observer : un rendu relancé sans rien changer redonne la même vidéo (déterminisme) ; si ComfyUI sert un
  résultat en cache malgré le préfixe distinct, c'est que le graphe est identique côté ComfyUI — à confirmer au test.

## 2026-10-03 — Test général : registre à un niveau, inventaire avant les fiches, références renumérotées, lot d'images (chantier 2)

Feuille de route : `docs/PLAN_APRES_TEST_GENERAL.md`.

- **Registre à UN SEUL niveau (précise F01 ; révisé le 2026-10-06 : registre à plat, voir plus bas).** Un asset est un master, ou un dérivé d'un master : les états d'un
  décor, les tenues d'un personnage sont des dérivés du même master, jamais une chaîne. Règle posée à l'écriture
  (`lib/registre-assets.ts`, `masterDe` : dériver d'un dérivé rattache au master ; utilisée par la création manuelle,
  l'applicateur `asset`, l'import) et migration 0039 qui remonte les chaînes existantes au master. La carte « + dérivé »
  n'existe plus que sur un master. Les lectures récursives de l'arbre (profondeur illimitée) restent, sans effet.
- **L'inventaire des assets passe AVANT les fiches de plan (révise la décision du 2026-10-02 « dérivés et accessoires
  après les fiches », FRICTIONS « Étape 3 en préparation » ; rejoint CONCEPTION_AGENTS §5 « les assets viennent avant
  les plans »).** Cause des doublons observés au test : l'entrée de chaque fiche d'un lot est construite d'avance (elle
  ne voit pas ce que les autres fiches proposent) et le dédoublonnage ne portait que sur le code exact, donc la lanterne,
  la lampe à huile et la lampe étaient trois assets. Maintenant : (1) nouveau skill `inventaire-assets` (un seul appel
  pour le projet : brief, tous les plans, registre) → une liste consolidée de créations d'assets SANS prompt, relue puis
  appliquée ; leurs prompts s'écrivent ensuite par le lot `prompts-assets` existant. Ordre du pipeline : scénarios →
  registre issu du brief → **inventaire** → prompts des assets créés → voix → fiches. (2) `plan-h3` cherche d'abord dans
  le registre ; (3) filet de sécurité : à l'exécution d'une fiche d'un lot, l'entrée reçoit `assetsProposesParLeLot`
  (ce que les autres fiches proposent déjà de créer, `worker/agents/preparation.ts`) ; (4) `depuisInventaire` signale
  un asset qui ressemble à un existant (même type, mots communs).
- **iteration-plan peut ajouter ou retirer des références (révise « les références ne sont jamais touchées »,
  FRICTIONS « iteration-plan branché »).** Cause de « l'agent ne sait pas modifier subject_definitions /
  retention_analysis » : ces deux sections ne sont dérivées que des références posées à l'assemblage, et les assets
  créés par une fiche restaient en prose sans jamais être reliés au plan. Désormais l'itération voit le registre et
  propose `references: { ajouter: [code du registre], retirer: [code] }` ; le CODE attribue les labels, renumérote les
  images restantes 1..n, met `subject_definitions` / `retention_analysis` à jour et remplace le marqueur `[[CODE]]` d'une
  référence ajoutée (seul marqueur permis) ; l'écriture porte la liste complète des références (applicateur `fiche`
  inchangé). Un asset qui n'existe pas au registre n'est jamais inventé : la cause est dite, pas de référence.
  Les sons et les voix ne sont pas concernés (leurs slots `<Audio N>` sont liés aux voix).
- **Retirer / ajouter une référence à la main renumérote aussi** (`lib/references.ts`, `lib/plan-references.ts`) :
  l'ancienne règle « un slot supprimé laisse un trou » est abandonnée ; un retrait compacte les images en 1..n, retire
  les lignes de la référence des deux sections et remplace ses mentions en prose par le nom de l'asset ; un ajout
  déclare la référence (définition + rétention par défaut). L'écrasement ne compte plus les références conservées à
  l'identique (`evaluerEcrasementFiche`).
- **Génération d'images en lot** (registre d'assets, panneau « Générer plusieurs images d'un coup ») : chaque asset
  coché part avec son prompt, au format par défaut de son type ; un dérivé en édition part de l'image de son master et
  attend sinon (deux vagues : masters, puis relance). Plafond de lot : 30 images en attente (10 pour une demande isolée).
  Voix, sons, assets sans prompt ou déjà en file sont écartés AVEC leur raison (`lib/generation-lot.ts`).
- Reste à observer : la qualité réelle de l'inventaire avec gemma (nombre d'assets proposés, rapprochements
  lanterne/lampe) ; un seul appel pour tout le projet peut dépasser le contexte d'un projet très long (à segmenter
  par épisode alors).

## 2026-10-03 — Test général : briefing sans « points à valider », installateur, streaming (chantier 3)

Feuille de route : `docs/PLAN_APRES_TEST_GENERAL.md`.

- **Le briefing se règle à l'oral (révise l'état `a_valider` des inventions et questions ouvertes, FRICTIONS « Système
  d'agents », 2026-10-02).** `conversation-agent` rend un tour avec `resteADefinir` (liste de phrases courtes, remise à
  jour à chaque tour, stockée dans `agent_conversations.reste_a_definir`) affichée à côté de la conversation ; `briefPret`
  n'est vrai que si la liste est vide (l'application tranche une contradiction en faveur de la liste,
  `briefPretApresTour`). Les `inventions` et `questionsOuvertes` du brief sont désormais informatives (statut « déduit ») :
  plus aucun point à valider un par un après coup. Les sections qui sont des listes d'objets (épisodes, personnages,
  lieux, rimes, progressions, pièges) s'éditent par formulaire au lieu du JSON brut (`BriefSections.tsx`, la saisie reste
  la chaîne JSON validée côté serveur). Cartes de style avec images : reportées.
- **L'installateur (exception actée au principe « rien n'est appliqué sans proposition relue », CONCEPTION_AGENTS.md:43-45
  et FRICTIONS:1217).** « Créer tout le projet » enchaîne brief → structure → scénarios → registre (brief) → inventaire des
  assets → prompts de l'inventaire → voix → fiches → prompts des assets des fiches, chaque étape générée PUIS appliquée toute
  seule, sans revue. Seul retour en arrière : supprimer le projet. Garde-fous : on n'applique que ce qui est coché d'office
  (les créations ; un écrasement est décoché par défaut et n'est jamais confirmé par l'installateur) ; les sous-tâches en
  échec d'un lot sont relancées UNE fois automatiquement, puis l'étape échoue (« Reprendre » la refait) ; une étape qui n'a rien
  à faire est « passée ». Architecture : table `creations_projet` (état, étapes), règles pures dans `lib/agents/creation.ts`
  (testées), pilote `lib/agents/creation-db.ts` appelé à chaque tour de la boucle du worker (une transition au plus par
  création : reprise sur redémarrage, pur travail en base, il ne retarde aucune tâche GPU), page `/p/<projet>/creation` qui
  sonde `/api/creation/<projet>`. Les projets des essais bout en bout (`TEST_AGENTS_E2E*`) ne sont pilotés que par leur script.
- **Streaming.** Le worker écrit, au plus 1×/s, le texte de la réponse (borné à 24 000 caractères) et la fin de la
  réflexion (6 000) dans `agent_runs.flux_texte` / `flux_reflexion` (remis à null en fin d'appel) ; la fenêtre sonde toutes
  les 1,2 s pendant un appel. Un tour de conversation montre la réponse qui s'écrit (extraction tolérante du champ `reponse` du
  JSON partiel, `lib/llm/flux-partiel.ts`) ; les autres skills montrent la fin du JSON ; la réflexion est repliable.
- Reste à observer : le coût d'une écriture par seconde sur la ligne `agent_runs` pendant un long appel ; la lisibilité du
  JSON partiel des skills autres que la conversation (il ne s'affiche qu'en détail replié).

## 2026-10-03 — Test général : lecture de l'épisode, cohérence entre plans, progression vidéo, un seul point d'accès (chantiers 4 et 5)

Feuille de route : `docs/PLAN_APRES_TEST_GENERAL.md`.

- **Lecture de l'épisode bout à bout** (page Plans, `LectureEpisode`) : le dernier rendu terminé de chaque plan, dans l'ordre
  `ordre`, joué l'un derrière l'autre sous une frise cliquable (largeur = durée du plan). Un plan sans rendu n'interrompt pas
  la lecture : un carton « pas de rendu » (sa durée, bornée à 4 s) tient sa place. Positions affichées, jamais un identifiant (F03).
- **Cohérence entre les plans** : un tableau asset × plan (`MatriceAssets`, `lib/matrice-assets.ts`) rend visible une référence
  posée dans certains plans et pas dans d'autres (« ⚠ » : le plan n'a pas la référence alors que celui d'avant et celui d'après
  l'ont), cause fréquente d'incohérences de détail. Pas de détection en prose (les prompts sont en anglais, les codes en
  français) ni de planche de vignettes : la lecture de l'épisode couvre le besoin de regarder le tout.
- **Progression d'un rendu vidéo, SANS aperçu image (précise J).** Un aperçu en direct n'est pas possible : la génération
  est le nœud d'API distant MiniMax H3 (`5`), qui n'émet aucun latent ; les nœuds locaux (interpolation, encodage) n'ont rien à
  montrer non plus. Le worker relaie donc l'ÉTAPE en cours (génération H3, interpolation, encodage) et la progression
  valeur/max quand ComfyUI en donne une, dans `jobs.etape_libelle` / `progression_*`, affichées dans le panneau du header.
  La mise à jour de la page à la fin du rendu est déjà faite (chantier 1).
- **Un seul point d'accès à l'agent : la portée est déduite de la page, pas encore une conversation unique (écart assumé avec
  la décision « une conversation par projet »).** Le bouton « Agent ✦ » du bandeau (`BoutonAgentGlobal`) déduit la portée de
  l'URL, toujours la plus petite (plan, asset, épisode, sinon projet : `lib/agents/page-agent.ts`) ; la fenêtre permet de
  l'élargir d'un clic (plan → épisode → projet) et liste les AUTRES conversations du projet (la trace de ce qui a déjà été
  demandé). Les boutons contextuels existants restent des raccourcis (certains ouvrent une vue directe : fiches, itération,
  voix, registre). **Pourquoi pas une seule conversation par projet** : `conv.portee` / `conv.cibleId` portent le VERROU DE PORTÉE
  (`lib/agents/portee.ts` : l'agent ne modifie que ce que sa portée couvre) et toutes les fonctions de `service.ts` en dépendent ;
  la fusion demande de déplacer la portée de la conversation vers chaque proposition, un chantier à part. Non fait : le routage
  de l'intention par l'agent (choisir le skill d'après le message) ; le routage reste celui des boutons et des étapes.

## 2026-10-03 (suite) — Retours du premier test : briefing en deux temps, installateur détaillé, lot d'images adopté

- **Le briefing se valide AVANT la création (révise le bouton « Créer tout le projet » de la conversation).** `briefPret` = « de quoi
  écrire une PREMIÈRE VERSION » (arc, structure et style au moins proposés), même s'il reste des questions ; l'interface le dit
  (« Une première version du briefing est possible »), génère le briefing, et la conversation continue : `resteADefinir` se vide au
  fil des réponses, « Mettre à jour le briefing » le regénère. Le briefing est définitif quand la liste est vide. « Valider le
  briefing et créer le projet » (étape Brief) lance l'installateur ; « Générer la proposition seule » disparaît de ce parcours.
- **Plus aucun « à valider » dans le brief** : un statut `a_valider`/`incertain` déclaré par le modèle vaut `deduit` (`lib/agents/brief.ts`) ;
  le groupe des inventions et questions ouvertes s'appelle « Notes de l'agent » ; la légende n'affiche l'état « à valider » que s'il
  existe encore (briefs anciens).
- **Cause des plans restés en brouillon après l'installateur** (projet « Avatar ») : le modèle recopiait mal un code d'asset
  (`DEC_le_monde_l_avatar` pour `DEC_le_monde_de_l_avatar`), le marqueur `[[CODE]]` ne se résolvait pas, la fiche était BLOQUÉE par un
  contrôle (non cochable) et l'installateur l'écartait sans le dire. Corrigé à trois niveaux : (1) `lib/agents/codes-proches.ts` corrige
  sans ambiguïté un code qui ne diffère d'UN seul code du registre que par des mots de liaison (de, du, la, le, l', un…), dans la
  conversion ET le contrôleur du worker (plus de renvoi au modèle pour ça) ; tout autre écart reste une erreur franche, jamais
  deviné ; (2) l'installateur relance UNE fois les sous-tâches dont un changement est bloqué (comme celles en échec) ; (3) ce qui reste
  bloqué n'arrête pas la création mais l'étape le dit (« N écartés (à refaire depuis l'agent) »).
- **Installateur : le détail au fil de l'eau.** Chaque étape montre l'appel en cours (file, jetons) ou, pour un lot, ses sous-tâches une
  à une (épisode par épisode, asset par asset, plan par plan) avec leur état : ce sont les mêmes tâches que celles de la file du header
  (`lib/agents/creation-vue.ts`).
- **Générer par lot = utiliser le résultat.** Une génération lancée par le lot d'images porte `asset_generations.adoption_auto` et le
  worker l'adopte toute seule à sa fin (`lib/generation-adoption.ts`, partagé avec le bouton « Adopter »). Non fait : lancer
  automatiquement la 2e vague (dérivés en édition) quand le master est adopté.
- **Streaming** : la réponse s'écrit lettre par lettre (`useMachineAEcrire`, vitesse adaptée au retard), la réflexion est repliée par défaut.

## 2026-10-05 — Recette « reprise d'une intro connue » : identité des personnages, rythme, genre de scène

Test de bout en bout (pitch court, création de zéro, assets et plans rendus sans retouche). Constats et décisions ; les prompts des skills
restent **génériques** (aucun nom du projet de test, vérifié par `lib/agents/genres-scene.test.ts`) : la spécialisation passe par des
variantes de guides selon le genre de la scène.

- **Cause racine des erreurs d'identité : le brief ne disait pas qui sont les personnages.** Les assets de personnages naissent du brief
  (`candidatsRegistre`), et la description canonique recopiait « rôle : trait reconnaissable », parfois une VOIX. Résultat : une fiche
  d'image à partir d'une voix (« A poised and calm individual »), un personnage générique nommé par un titre (l'image est devenue
  l'« Avatar » d'un autre univers), un groupe de quatre individus fondu en UN asset (deux d'entre eux se ressemblaient dans les plans), un
  personnage de remplissage jamais utilisé, une voix de trentenaire pour une adolescente. **Décision** : le brief porte, par personnage,
  `age` et `apparence` (obligatoires pour tout nouveau brief, optionnels pour les anciens), `gestuelle` (facultative) ; au niveau du
  brief, `rythme` (lent, mesure, soutenu, rapide, variable) et `univers` (œuvre de référence : on appelle les personnages par leur nom
  propre). La description canonique d'un personnage se construit de l'apparence (`descriptionPersonnage`), jamais du rôle ni de la voix.
  La clause de style décrit le rendu, jamais un cadrage ni un mouvement (elle s'applique aussi aux images fixes). Un personnage est un
  individu, un groupe ne l'est pas. Le skill de voix prend l'âge du personnage et ne choisit jamais un âge adulte par défaut.
- **Durée et rythme se demandent, ils ne se devinent pas.** La durée visée (120 s) avait été inventée par le modèle et rien ne la
  confrontait au résultat (92 s). `conversation-agent` garde durée, rythme et âge dans `resteADefinir` tant que l'utilisateur ne les a pas
  dits ; l'application signale (avertissement `info`, `avertissementDuree`) un scénario d'épisode qui s'écarte de plus de 20 % de la durée visée.
- **Raffine (ne renverse pas) « plancher de 5 s, regrouper plutôt que découper » (2026-10-02).** Le plancher de 5 s et la recherche de
  peu de plans restent. Mais « vise 8 à 15 s » devient « la durée suit le `rythme` du brief » (rapide : 5 à 8 s) et un enchaînement de brefs
  moments qui se répondent (montage) est UN plan à coupes internes même s'il change de lieu. Retour de recette : quatre plans de 10 s pour
  quatre gestes de 2 s donnent une séquence très longue et des raccords incompréhensibles.
- **Genre et ambiance par scène** (`scenes.genre`, `scenes.ambiance`, migration 0046, nullables ; `lib/scene-genres.ts`). Genres : action,
  dialogue, montage, contemplatif, tension ; null = standard. Le scénario les produit (obligatoires dans la sortie), l'utilisateur les édite,
  `plan-h3` les reçoit : le genre choisit le guide `guide-genre-<genre>.md` (mécanisme de variantes du chargeur, `variante` = genre ou
  « standard » = aucun guide de genre ; sans variante le chargeur enverrait tous les guides), l'ambiance est le cadre (moment, météo,
  lumière) tenu sur toute la scène. Un basculement s'amorce dans le plan d'avant.
- **Fiche de personnage seule** (`prompt-asset`, guide Krea 2, inventaire) : mains vides, sans effet, sans décor, sans action ; un effet est
  un asset `vfx` distinct. Cause du plan « parti en tous sens » : la référence du personnage était une scène d'action avec un vortex.
  `inventaire-assets` signale en `notes` les personnages et lieux du registre qu'aucun plan n'emploie, et rappelle qu'un personnage hors
  champ n'est pas une image.
- **Contrôle du locuteur** : un `<d>` sans `(Sx)` dans son shot donne une alerte (`plan-h3-controles`, règle `locuteur`). Deux plans de la
  recette n'avaient pas le marqueur ; l'écho audio constaté sur l'un d'eux n'est PAS expliqué (le prompt envoyé ne contenait la réplique
  qu'une fois) : expérience à faire, relancer le plan tel quel (même seed) puis avec `(S1)`.
- **Voix** : température par défaut 1,2 (la plus expressive aux essais directs sous ComfyUI ; 0,8 à 1,2 reste réglable).
- **Non fait** : génération des répliques dans l'application avec `VOX_Generate_Replique_Simplified.json` (workflow fourni, à brancher sur le
  modèle de `voixMapping.ts`) ; réglages de vitesse du LLM local (raisonnement coupé sur les skills légers, voir les traces : 70 à 95 % des
  jetons de sortie sont du raisonnement).

## 2026-10-05 (suite) — Retours de recette : enregistrement, format des fiches, historique des rendus

- **« Prévisualiser » ne lit que la base.** Le curseur de durée et chaque section du prompt gardaient leur valeur en local jusqu'à
  un clic sur « Enregistrer » : modifier puis lancer un rendu relançait avec l'ancienne valeur (retour : « la durée n'est pas prise en
  compte »). Les sections du prompt et les paramètres du plan (durée, FPS) s'enregistrent maintenant à la sortie du champ (lâcher le
  curseur, quitter le champ) ; le bouton dit « Enregistrer » tant que la valeur affichée n'est pas celle de la base.
  « Nouvelle variante » tire une nouvelle seed (qui devient celle du plan) puis prévisualise ; « Prévisualiser » garde la seed.
- **Personnages et décors en 16:9 par défaut** (`formatParDefaut`, 1,3 MP) : meilleurs résultats dans ce ratio ; réglable en
  régénérant. Les effets et détails restent en 1:1.
- **Historique des rendus d'un plan** : cliquer un rendu le charge dans le lecteur (`?rendu=<id du job>`), « Comparer avec A » en
  ouvre un second à côté (`?compare=`), « Lire les deux » les démarre ensemble. « Rendu final avec celui-ci » reprend la seed et la
  durée de ce rendu (et, si coché, son prompt) puis lance l'upscale ; « Utiliser cette seed » ne fait que reprendre. C'est la règle
  d'invariance (même seed + même prompt + mêmes références + même durée = même résultat, F04) qui fait que l'upscale reproduit la
  prévisualisation choisie. Les références (images d'assets) ne sont pas versionnées (F01) : si un asset a été remplacé depuis, le
  résultat peut différer. Logique pure dans `lib/rendus.ts`.
- **Écho audio du plan 3** : défaut de génération du modèle vidéo, pas un bug de Cadence (retour utilisateur).

## 2026-10-05 (suite) — Génération des prises de répliques dans l'application

Workflow fourni par l'utilisateur (`VOX_Generate_Replique_Simplified.json`, Qwen3-TTS Base, clonage de la voix de référence). Contrat
dans `workflows/README.md`.

- **Où vit la demande : `asset_generations`** (méthode `replique`, nouvelle colonne nullable `replique_id`, migration 0047 ; `assetId` =
  la voix clonée). Même file GPU (genre « image »), même panneau, mêmes annulations et notifications que les images, les sons et les
  voix de référence — plutôt qu'une table et un genre de plus. Prix à payer : tout ce qui liste ou purge les candidats d'un asset écarte
  les lignes à `replique_id` (`getGenerationsAsset`, `purgerAnciens`) ; le panneau les présente « Réplique · début du texte » et mène au
  plan qui la cite.
- **La prise générée est posée directement sur la réplique** (`lib/replique-prise.ts`), comme une prise déposée : fichier, texte dit (une
  prise devient obsolète si le texte change), durée MESURÉE (FLAC : mesurable, d'où `SaveAudio` et non `SaveAudioMP3`), statut « prise
  posée ». Elle **remplace** la précédente (pas de versionnage, F01) : régénérer donne une autre interprétation (nouvelle seed) mais
  écrase la prise courante. Conséquence assumée : une prise validée repasse « posée » (la nouvelle n'a pas été écoutée).
- **Ce qui est laissé tel que l'utilisateur l'a réglé** : le champ `instruct` du moteur (reste d'un essai de Voice Design, sans effet en
  clonage) et les réglages exportés. Seul le cache audio du nœud de texte est coupé. La voix de référence part au dossier d'entrée de
  ComfyUI sous un nom qui porte la date de modification du fichier (une référence remplacée ne resserve jamais l'ancienne copie).
- **Langue** : celle des dialogues du brief, traduite pour le moteur (`lib/langues-tts.ts`), « Auto » si inconnue. Température 1,2 par
  défaut (0,8 à 1,2 réglable côté code, pas encore dans l'interface).
- **Boutons** (panneau Dialogues d'un plan) : « Générer la prise » / « Refaire la prise » par réplique, et « Générer les prises
  manquantes (N) » (manquantes ou obsolètes ; les répliques sans voix ou dont la voix n'a pas de référence sont comptées avec leur
  raison). Refus francs : pas de texte, pas de voix, voix sans référence, référence absente du stockage, prise déjà en file.
- **Validé en réel** (copie jetable de la base, dossier média jetable, vrai ComfyUI) : FLAC 24 kHz de 1,34 s pour une réplique dont la
  prise faite à la main durait 1,26 s, niveau sonore équivalent (−21,1 dB contre −21,3 dB en moyenne). Non fait : réglage de la
  température et de la seed dans l'interface, génération des prises de TOUT l'épisode d'un coup.

## 2026-10-05 — Affiches de présentation (image d'un projet ou d'un épisode, générée par l'IA)

- **Une affiche est un asset d'un type à part, `affiche`, invisible du registre** (voie « A », tranchée avec l'utilisateur) : elle réutilise
  tout ce que fait une image d'asset — file ComfyUI, candidats, fenêtre de génération, « Utiliser » — sans rien dupliquer. Code : `AFFICHE_P<id>`
  (projet) ou `AFFICHE_E<id>` (épisode), créé AU PREMIER CLIC sur « Générer une image » (`app/affiches/actions.ts`), jamais à la lecture.
  Les saisons gardent leur import manuel.
- **Invisible du registre = un filtre sur chaque lecture « tous les assets d'un projet »** : `horsAffiches` (`lib/assets-visibles.ts`) sur le
  total de l'Accueil, l'arbre du registre, le sélecteur de références, les sources de génération, les contextes et candidats de l'agent et les
  post-traitements du worker. Les lectures par id, par code ou par type précis n'en ont pas besoin. **Toute NOUVELLE lecture « les assets du
  projet » doit l'ajouter**, sinon l'affiche fuit dans le registre ou le contexte du LLM (vérifié à la main : total de l'Accueil, page Assets).
- **Adopter = habiller** : `adopterCandidat` appelle `appliquerAffiche` (`lib/affiche-application.ts`) qui copie l'image dans le rangement des
  posters et pointe `posterFichier` dessus. Nom UNIQUE à chaque application (`poster-<horodatage>.png`, jamais réécrit sur place : pas de cache
  navigateur périmé), ancienne image supprimée. Les assets d'affiche d'un épisode sont supprimés avec l'épisode ou sa saison.
- **Le titre n'est jamais dans l'image** : le prompt demande explicitement aucun texte (les modèles déforment les lettres) et le titre se
  superpose à l'affichage (`components/ui/Poster.tsx`, grand format et cartes ; l'image seule en petit). Il reste net, suit le renommage,
  et corrige au passage les cartes à image qui n'affichaient pas leur nom. Incrustation dans le fichier : écartée pour l'instant.
- **Prompt proposé par gabarit** (`promptAffiche`, en anglais) : titre, résumé (arc du brief, ou résumé de l'épisode), genre et ton ; la clause
  de style est ajoutée par le workflow comme pour tout asset. Modifiable avant de lancer. Non fait : le faire écrire par l'agent.
- **Page dédiée** `/p/<projet>/affiche/<code>` (aperçus carte et en-tête, fenêtre de génération, retrait de l'image) ; les tâches du header y
  renvoient. Points d'entrée : en-tête d'un épisode (ou du OneShot) et vue d'une série.

### 2026-10-05 — Affiches : saisons, tout en 2:3, état des plans dans l'en-tête

- Les affiches couvrent aussi les **saisons** (`AFFICHE_S<id>`, même mécanique que projet/épisode, invisibles du registre).
- **Toutes les affiches sont en 2:3** (projet, saison, épisode) : le Poster « wide » 16:9 devient « apercu » 2:3. Le prompt par défaut demande donc toujours une composition verticale.
- L'**état des plans** (anneau + « Écrire les fiches ») quitte le corps de la page Scénario et s'intègre à l'en-tête de l'épisode (affiché seulement sur `/scenario`). Il est alimenté par des agrégats SQL (`getEtatPlans`), calculés par le layout.

### 2026-10-05 — Affiches : skill `prompt-affiche`, titre dans l'image, personnage principal

- **Skill `agents/skills/prompt-affiche`** (réutilise les guides Krea 2 / Qwen de `prompt-asset` via `FICHIERS_PARTAGES`). Bouton « Rédiger le prompt avec l'agent » sur la page d'affiche : la tâche passe par la file du worker comme toute tâche d'agent (`agent_runs`, `but = affiche`, `cleSousTache` = code de l'affiche) ; `postAffiche` remplace le prompt de l'affiche, en respectant le réglage de titre du moment. Le gabarit de code ne sert plus que de point de départ : plus d'étiquette `Story:` ni de titre entre guillemets (le modèle les dessinait).
- **Titre dans l'image** : réglage par affiche, porté par le PROMPT lui-même (ligne `Title lettering: "…"`). À l'adoption, `titreDansPrompt(gen.prompt)` donne un fichier `poster-<t>-titre.<ext>` et `Poster` ne superpose alors pas le titre. Pas de colonne en base.
- **Personnage principal** : premier personnage du brief retrouvé dans le registre (sinon premier personnage avec image). Son image est la source 1 (mode « images », Qwen Image Edit) quand l'agent recommande l'édition ; sinon sa description nourrit le prompt.
- Clic sur l'aperçu : image seule en grand (`AfficheZoom`).
- Le prompt de l'affiche est montré sous l'aperçu (dépliable) ; l'affiche de l'en-tête de l'épisode est cliquable pour l'agrandir.

### 2026-10-05 — Affiches : le prompt de l'agent passe par une PROPOSITION (comme un asset)

Correction de la décision précédente (tâche directe + écriture immédiate du prompt, sans relecture). L'affiche est un asset caché : « Demander le prompt à l'agent » ouvre la popup d'agent en portée `asset` sur cet asset, et suit le parcours normal : consigne → contexte lu (titre, résumé, ton, personnage principal, clause de style) → proposition (avant/après du prompt) à accepter. Rien n'est écrit avant l'acceptation.
- `lib/agents/service.ts` : pour un asset de type `affiche`, `entreePourConversation` utilise `entreePromptAffiche` (lib/agents/affiche.ts) et le skill `prompt-affiche`.
- `lib/agents/conversion.ts:depuisPromptAffiche` : un changement `asset`/`modifier` ; la ligne de titre suit le réglage de l'affiche au moment de la conversion ; la méthode « édition » n'est retenue que si l'image du personnage principal existait à la demande (l'applicateur d'asset l'autorise pour une affiche, qui n'a pas de parent).
- Plus de `but = affiche`, ni de rafraîchissement automatique de la page.

### 2026-10-05 — Casting vocal : test audio et test vidéo générés depuis Cadence

Étape 3 du casting (« Test vidéo ») : l'audio et la vidéo de test se génèrent depuis l'application, comme la voix de référence.
- **Même table, même file** : `asset_generations` sur l'asset `voix`, deux méthodes de plus — `test_audio` (VOX_Generate_Replique_Simplified : la voix de référence **clonée** dit le texte) et `test_video` (VID_REF2VA, le graphe des plans, sans plan). Pas de nouvelle table ni de nouveau genre de tâche : la file, l'annulation, la progression, le panneau du bandeau et les candidats servent tels quels. Colonne `parametres` (jsonb, migration 0048) pour ce que la méthode fige au lancement (références, prévisualisation ou rendu final).
- **Prévisualisation puis rendu final** : même bascule que les plans (`activerUpscale`), deux boutons (« Prévisualiser », « Rendu final »).
- **Adopter ne touche pas la voix** : le candidat devient `voix/<id>/test_audio.*` ou `test_video.*` (fiche de casting), jamais `assets.fichier`. Adopter l'audio fixe aussi `test_texte` : la vidéo dit le même texte au mot près. Le texte du test est prérempli avec le texte de référence de la voix.
- **Une vidéo de test passe devant les vidéos de plans** : côté ordonnancement c'est une tâche « image » (priorité courte), parce qu'elle vit dans `asset_generations`. À reconsidérer le jour où la généralisation du système de tâches (déjà prévue) arrive.
- Purge des candidats par méthode : les essais du test ne chassent pas ceux de la référence.
- **Non vérifié en réel** : aucun des deux workflows n'a tourné contre un vrai ComfyUI depuis cette intégration (essai bout en bout avec le client factice : file, injection du graphe réel, adoption).
- **Test audio sur le workflow des répliques** (fusion de `ux/refonte` dans `main`, 2026-10-06) : le test audio et les prises de répliques
  partagent `VOX_Generate_Replique_Simplified.json` et `injecterGenerationReplique` (`repliqueMapping.ts`) ; le test audio sort donc en
  FLAC, température par défaut. Les deux branches avaient chacune câblé « Générer » une réplique ; seule l'implémentation de `main`
  (méthode `replique`, colonne `replique_id`, prise posée directement) est conservée, le bouton du casting vocal l'appelle
  (`genererPriseReplique`). Migration du test vocal renumérotée 0045 → 0048 (la 0045 étant `trace_reflexion`).

### 2026-10-05 — Fiche de plan : refonte de la page, « figer » à la place de l'enregistrement à la sortie du champ

Remplace l'enregistrement à la sortie du champ décidé le même jour (« Prévisualiser ne lit que la base ») : même problème de fond (un rendu doit partir avec ce qui est à l'écran), solution différente, voulue par l'utilisateur.
- **On n'enregistre plus au fil de l'eau.** Le prompt (6 sections), la durée, les FPS et la seed restent un **brouillon** dans la page (`BrouillonPlan`). Lancer un rendu (« Figer et prévisualiser », « Rendu final », « Nouvelle variante ») les **fige** d'un coup (`figerEtLancer`, `app/plans/actions.ts`) puis crée le job. Un rechargement de la page (suivi des rendus) ne perd aucune saisie : chaque valeur affichée est dérivée (brouillon si elle diffère du serveur, serveur sinon). Les sections modifiées s'affichent avec un liseré orange, la console dit « Non figé : … » avec « tout annuler ».
- **Dialogues contrôlés après l'écriture** : le contrôle verbatim lit le prompt qu'on vient de figer. Si un dialogue bloque, le brouillon reste figé mais aucun rendu ne part.
- **Les références restent immédiates** : ajouter ou retirer une référence réécrit le prompt côté serveur (déclaration, renumérotation, F03). Le brouillon des sections est donc écrit juste avant (`ecrireSections`), sinon il serait écrasé. Elles ne font pas partie du « gel » au sens strict : seule la page garde un brouillon.
- **Mise en page** : gauche collante (lecteur, pellicule des rendus, console de rendu), droite (références, puis prompt replié et dialogues en deux colonnes). Plus d'onglets. Le rappel du scénario est dans l'en-tête ; les contrôles automatiques sont une pastille qui déplie la liste ; supprimer et importer une vidéo sont dans « ⋯ ». L'historique des rendus devient une pellicule de clichés (A / B comme avant, `?rendu=` et `?compare=` inchangés).
- **Animations** : balayage « gel » et sceau « Figé n°X » pendant 5 s (le temps que le rendu se place dans la file), dé de seed, braises sur le lecteur vide, entrée des rendus et des références. Coupées par `prefers-reduced-motion`.
- Retirés : `PlanParamsEditor`, `PromptSectionEditor`, `ChecksPanel`, `RelaunchButton` (`relancerPlan` reste, il sert encore côté serveur).

## 2026-10-06 — Registre d'assets à plat, plans périmés

Révise F01 (l'arbre) et la règle « registre à un seul niveau » du 2026-10-03.

- **Registre à plat.** Un asset est un asset, qu'il serve ou non d'image de départ à d'autres : plus d'arbre, plus de bande « variantes ». La famille se lit au préfixe du code (`CHAR_sophia`, `CHAR_sophia_nuit`) et à la recherche. Motif : le worker lit les images sources enregistrées **par génération** (`asset_generation_sources`, trois au plus) et n'a pas besoin du lien parent ; supprimer un master ne casse rien (l'image dérivée existe déjà) ; un composite a plusieurs origines, qu'un parent unique ne dit pas.
- `assets.deriveDeId` est conservé mais n'est plus qu'une **image de départ proposée** (« nouvel asset à partir de celui-ci »). Supprimer un asset détache ceux qui en partaient. Une édition n'exige plus de parent.
- Le type `keyframe` (pose composite : plusieurs éléments mêlés dans une même image) est créable par les agents et citable comme référence ; rare, lié à un plan, trois images sources au plus. Skills `inventaire-assets`, `plan-h3`, `prompt-asset` et leurs `sortie.schema.json` repris en conséquence (le champ `parent` des sorties reste, relu comme « image de départ »).
- Registre : sélection multiple au clic long, barre Générer / Supprimer ; filtre « Sans plan » ; un lot ne renvoie jamais un asset qui a déjà une image. Fiche d'asset : sections modifiables, « Apparaît dans » en badges sous la description.
- **Plans périmés.** Pas de versionnage (F01) : adopter un candidat remplace le fichier, donc un plan déjà rendu avec l'ancienne image est dépassé. `assets.fichier_at` (migration 0049) date la dernière pose du fichier (adoption, import, prise de voix) ; un plan est **périmé** quand le début de son dernier rendu terminé est antérieur à `fichier_at` d'une de ses références (`lib/plans-perimes.ts`). Un plan jamais rendu n'est pas périmé ; les assets existants à la migration prennent la date de la migration (rien n'est périmé rétroactivement).
- Surfaces : alerte « Rendu périmé » dans la fiche de plan ; badge « périmé » dans la frise des plans ; badges écarlates dans la fiche d'asset ; avertissement avant adoption (« périmera N plans déjà rendus ») ; bouton « Relancer les périmés » (`relancerPlansPerimes`) : un nouveau rendu par plan, avec sa seed et dans son mode (prévisualisation ou final), en sautant les plans déjà en file et ceux aux dialogues désalignés.
- Reste : pas de précédent / suivant dans la fiche d'asset.

## 2026-10-07 — Skills d'agents : format Agent Skills, instructions en anglais

Amende « Chargeur sans manifeste » (CONCEPTION_AGENTS §5, 2026-10-01). Les skills sont lus par un petit modèle local (MoE à environ 3-4B de paramètres actifs) : l'anglais lui est plus sûr que le français, et le format standard rend les skills réutilisables hors de Cadence.

- **Format standard Agent Skills** (agentskills.io) : `agents/skills/<nom>/SKILL.md` (ancien `regles.md`, avec un en-tête YAML `name` + `description`), `references/` (`guide-*.md`, `exemples/`, lexique), `assets/sortie.schema.json`. Le dossier reste la déclaration : le chargeur lit les mêmes fichiers dans le même ordre, **retire l'en-tête du prompt** et vérifie seulement que `name` est le nom du dossier. `chargerSkill` lève une erreur sinon.
- **Instructions en anglais, resserrées** (règles courtes et numérotées, une checklist « Before you answer »). Les titres de section du prompt et la phrase du contrat de sortie sont en anglais aussi. Le fond des règles n'a pas changé.
- **Langue de sortie dite champ par champ**, dans une section `Output language` de chaque `SKILL.md` et dans les `description` du schéma (`(French)` / `(English)`) : français pour ce que l'utilisateur lit (`titre`, `notes`, `role`, messages, contenu du brief), anglais pour ce qui part vers un modèle de génération (prompts H3, Krea 2, Qwen, Qwen3-TTS, Stable Audio, `style.clause`). Les dialogues gardent leur langue (`<d>[Français] …</d>`), les citations de `notes-entretien` sont recopiées telles quelles. `entreeLexique` (iteration-plan) est en anglais : le lexique l'est devenu.
- **Inchangé** : clés JSON, valeurs d'`enum`, codes d'assets, marqueurs posés par le code et cités tels quels dans les skills (`[Fiche de notes …]`, `[Briefing actuel (brouillon à mettre à jour)]`, `Vignette à 4 s :`), lignes exactes de titre de `prompt-affiche`. Les fixtures d'assemblage de `plan-h3` n'ont pas bougé : l'assemblage est intact.
- **Lexique de corrections H3** déplacé dans `agents/skills/plan-h3/references/h3-lexique-corrections.md` (source unique, traduit) ; le skill de chat `fiche-de-plan` y renvoie. Le skill de l'app ne dépend plus d'un skill de chat.
- `CARACTERES_PAR_JETON` passe de 3,5 à 4 (estimation pour de l'anglais, pas une mesure). Taille totale des prompts : environ 9 % de caractères en moins ; les jetons réels avec le tokenizer du modèle restent à mesurer.
- **À mesurer avant de conclure** (rien n'est validé sur le vrai modèle à cette date) : `npm run plan-h3:essai` et `npm run agents:rejeu -- essais/fiches/self-made-man.json`, comparés à un essai fait avant le changement (HEAD `791adf7`).
- **Point ouvert** : le tool-calling (par exemple un `chercher_asset` pour retrouver un asset existant sous un autre nom) a été évalué, pas décidé. Rien dans `lib/llm/` ne l'utilise ; compatibilité `tools` + `response_format` à vérifier sur llama-swap (`--jinja`) avant tout développement.

### 2026-10-07 — Choix du modèle LLM depuis le header

- **La pastille LLM du header devient un sélecteur** : un clic liste les modèles que le serveur déclare (`GET /v1/models`, `listerModeles` dans `worker/llamaSwap.ts`), choisir en enregistre un. Rangé dans `parametres` (clé `llm_modele`, pas de migration), un seul choix global (mono-utilisateur). « Revenir au modèle par défaut » le retire.
- **Priorité** (`modelePourSkill`, `lib/llm/config.ts`) : modèle forcé par la tâche (`options.modele`) > surcharge d'un skill `LLM_MODELE_<SKILL>` > choix du header > `LLM_LOCAL_MODELE`. Une variable par skill reste un choix de configuration délibéré : elle prime sur le header.
- **Lu au démarrage de chaque appel** (`worker/llm.ts`) : un changement vaut pour les prochains appels, y compris ceux déjà en file. L'appel en cours garde son modèle. Les estimations des popups d'agents (`lib/queries-agents.ts`) affichent le modèle effectif.
- **Garde-fous** : `choisirModeleLlm` (`app/llm/actions.ts`) n'enregistre qu'un modèle que le serveur déclare, et refuse si le serveur ne répond pas (jamais enregistré à l'aveugle). Un modèle choisi puis retiré de la configuration de llama-swap est signalé dans le menu ; ses appels échouent franchement, sans retomber en silence sur un autre modèle.
- Les scripts (`llm:essai`, `plan-h3:essai`…) restent pilotés par `--modele` et l'environnement : ils ne lisent pas le choix du header.

## 2026-10-07 — Conception d'un projet : choix avant l'entretien, bibliothèque de styles, deux champs de style

Décisions de l'utilisateur (plan : `docs/PLAN_CONCEPTION_PROJET.md`). Ce n'est plus une « pré-conception » : la création d'un projet devient une page de conception à part entière, de la page de départ à l'avancée de la préparation. Maquette validée : `https://claude.ai/artifact/5dp9BvLwAFzZAH2zEbVMyi` (privée).

- **Principe** : tout ce qui est quasi déterministe se choisit avant (format film/série, genres, ton, durée, rythme, langue, style) ; l'agent ne parle plus que de ce qui demande une vraie conversation (arc, fin, héros, personnages). Huit scènes : format, genre et ton, durée et rythme, langue, style, scénario (l'entretien), clap, avancée.
- **État de l'entretien d'entrée avant ce changement** (non documenté jusqu'ici, il vit dans `lib/agents/fiche.ts`) : `notes-entretien` tient une **fiche de notes** (`agent_conversations.fiche`) tour par tour ; le code vérifie les citations (`fourni` / `delegue` / `deduit`), calcule `aTrancher` (`REQUIS` : arc, fin, genreTon, style, rythme, dureeEpisodeSecondes, personnages) et décide seul quand la fiche est complète ; le brouillon du brief est écrit sans appel de rédaction. Le premier message de l'agent est écrit en code (`lib/agents/accroche.ts`).
- **La conception préremplit cette fiche** (`ficheDepuisConception`, `lib/conception.ts`) avec le statut `fourni` : `aTrancher` se réduit de lui-même à arc, fin, personnages. `appliquerNotes` n'accepte toujours `fourni` que sur citation : le préremplissage est une écriture directe, voulue, par le code. Les choix bruts (ton ajusté ou non, durée et langue non visitées, nombre d'épisodes prévus) sont gardés dans `conceptions.contenu` (migration 0052) ; le brief ne reçoit que les valeurs dérivées. **« Une seule source : `briefs.contenu` » reste vraie** pour tout ce que lisent les agents.
- **Deux champs de style** (**révise** la décision du 2026-10-02 où la clause servait aux vidéos ET aux images) : la **clause courte** (1 à 2 phrases d'anglais, rendu seulement) part vers la vidéo (plan-h3) ; le **prompt long** (bibliothèque ou style libre) part vers les images (Krea 2). C'est cohérent avec le guide H3 : le style s'écrit en 1 à 2 phrases avant le premier plan, le reste passe par les images de référence. `brief.style` gagne `promptImage` et `image` (2:3, présentation), **posés par le code, jamais par un agent** : absents de la vue du modèle d'entretien (`briefVersFiche` les retire), préservés par `fusionnerPartielDansBrouillon` et `residuPartiel`. `projects.style_prompt_image` est une copie dénormalisée comme `clause_style` (`synchroniserClauseStyle`). Les générations d'images prennent `styleDesImages` : le prompt long s'il existe, sinon la clause (projets existants inchangés).
- **Bibliothèque de styles** : `lib/styles/bibliotheque.json` (245 styles issus du guide Krea 2, dédoublonnés, avec noms d'auteurs et de studios **conservés** dans les descriptions : sans eux les styles se mélangent ; l'utilisateur fait le tri à la main, retirer une entrée suffit). Filtres : medium, rendu, palette, époque, ambiance, catégories. Images de présentation 2:3 générées à la chaîne (`npm run styles:apercus`, `data/styles/<id>.webp`), prompt d'aperçu = scène commune avec une jeune femme (9 variantes selon le thème) + descripteur. **Clause courte sans noms propres** (décidé) : écrite une fois pour les 245 styles (par un agent, pas par un skill de l'application : la bibliothèque est figée et la clause d'un style libre est saisie à la main) dans `lib/styles/clauses.json`, que `controlerClause` (`lib/styles/clause.ts`) vérifie en test. Un style sans clause n'est pas utilisable (`resoudreStyle` refuse).
- **Style libre** : prompt image et clause courte obligatoires, image 2:3 facultative ; une clause qui contient une référence nommée donne un avertissement, pas un refus.
- **Création du projet** : au passage du style à la scène scénario, pas avant (aucun projet orphelin si on abandonne), avec nom provisoire ; le titre se règle au clap. Film = `oneshot`. Le nombre d'épisodes d'une série est une information pour l'agent, il ne crée pas N épisodes.
- **Modale « Nouveau projet »** : supprimée à terme (aucune production en cours aujourd'hui) ; un « Importer un projet » (par exemple Les Yeux de Rubis, déjà en partie tourné) la remplacera. `creerProjet` / `creerProjetSansRedirection` restent (scripts, tests, futur import).
- **Avancée** : la page `/p/[id]/creation` (installateur) devient la scène 8 ; ses 9 étapes réelles font foi (les 8 de la maquette étaient fictives).
- **Accroche** : choisie en code selon le ton (léger / neutre / sombre) et le genre, avec « une autre accroche » ; la voix des questions suivantes est réglée par une consigne de `conversation-agent`.
- **Phases** : 0 bibliothèque et images (faite), 1 modèle et logique pure (faite), 2 clauses courtes et chargeur (faite, clauses à produire), 3 page `/nouveau`, 4 scène scénario, 5 clap et avancée, 6 documentation.
