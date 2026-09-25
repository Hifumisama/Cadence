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
  prompt.

### Reste à observer
- [ ] **Compter séparément** : itérations « prompt » vs redécoupages (= scénario). Le motif ci-dessus suggère que la part « découpage » est grosse — reste à chiffrer.
- [x] Motif récurrent — identifié ci-dessus (2026-09-25).
- [ ] Quelle marge de respiration minimale pour un plan dialogué ?

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
La numérotation est continue sur toute la série, elle fait donc office
d'horodatage universel. L'évolution d'un personnage s'écrit :

```
CHAR_maya
  canonique   : ce qui ne change jamais (yeux rubis, silhouette, timbre)
  état >= P010 : [situation de départ]
  état >= P230 : [ce qui a changé], cause : plan 225
```

Pour savoir qui est Maya au plan 400, on lit l'état actif le plus récent.
Et une contradiction devient **mécaniquement détectable** : deux états qui se
contredisent sur la même plage de plans.

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
