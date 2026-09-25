---
name: scenario
description: Construit un scenario.md de production — découpage en plans numérotés avec durée, valeur, décor, lumière, mouvement, son, intention et assets requis — à partir d'un pitch, d'une idée de film, d'une note d'intention ou d'un synopsis. Utilise ce skill dès que quelqu'un arrive avec une idée de film, de clip, de court métrage ou de séquence vidéo IA et veut la transformer en découpage exploitable, dès qu'on parle d'écrire un scénario, un découpage, un story-board ou une note d'intention, et dès qu'un pitch est donné avec l'intention manifeste d'en tirer une vidéo — même sans que le mot « scénario » soit prononcé. C'est l'étape amont de fiche-de-plan — le fichier produit ici est ce qu'elle consomme.
---

# Scénario — pitch → découpage de production

Ce skill transforme une idée en `SCENARIO.md` : un découpage plan par plan, assez précis pour qu'un autre skill puisse en tirer des prompts vidéo sans revenir poser de questions, et assez ouvert pour rester un document d'auteur.

Le fichier produit est consommé par le skill `fiche-de-plan`, qui a besoin de champs stables. Le format ci-dessous n'est donc pas décoratif : c'est un contrat.

## La méthode : proposer, puis se faire corriger

Ne commence pas par un questionnaire. Répondre à quinze questions abstraites sur un film qui n'existe pas encore est épuisant et produit des réponses tièdes ; rejeter une proposition concrète prend trois secondes.

Dès le premier tour, à partir du pitch tel qu'il arrive :

1. **Reformule l'arc en deux phrases.** Ce que le film raconte, et le basculement qui le structure. Si tu te trompes, c'est là qu'on te corrigera, et ça coûte peu.
2. **Propose une structure en mouvements** — deux à quatre blocs, avec leur fonction et leur durée approximative.
3. **Propose un découpage complet**, tous les plans, avec durées. Incomplet vaut mieux que vide : une proposition fausse est un point de départ, une page blanche n'en est pas un.
4. **Signale explicitement tes inventions.** Tout ce que tu as ajouté et qui n'était pas dans le pitch se liste à part, pour être validé ou jeté d'un mot.

Ensuite seulement, pose des questions — et uniquement celles dont la réponse change le découpage. « Quel est le style visuel » en est une. « Comment s'appelle le personnage » n'en est pas une tant que personne ne parle.

Itère jusqu'à validation explicite avant d'écrire le fichier. Un scénario écrit trop tôt donne l'illusion d'être arrêté.

## Contraintes techniques à respecter dès l'écriture

Le film sera généré par MiniMax H3, ce qui impose des règles à l'écriture plutôt qu'au rattrapage :

- **Chaque plan dure un nombre entier de secondes, entre 5 et 15.** Un plan qu'on « voit » à 3 secondes s'écrit à 5 et se coupe au montage — mais l'écrire à 3 revient à décider en aval, sans le réalisateur. Écris la durée qui sera générée.
- **Un plan = un geste.** Au-delà de 15 secondes il faut couper, et une coupe est une décision de mise en scène, pas un pis-aller technique. Si un plan dérive vers 18 secondes, c'est presque toujours qu'il en contient deux.
- **La caméra est chère.** Chaque mouvement composé (orbite, mouvement multiple, changement de vitesse en cours de plan) est une source d'échec de génération. Écris le mouvement le plus simple qui produit l'effet voulu, et si un plan a besoin d'un mouvement complexe, qu'il le mérite.
- **Le son se pense à l'écriture.** H3 génère l'audio dans la même passe que l'image. Un plan sans indication sonore recevra un son générique. Chaque plan mérite sa ligne `Son`.
- **Les dialogues sont générés**, dans leur langue d'origine, avec le timbre décrit. Si un plan comporte du dialogue, écris-le mot pour mot : il sera repris verbatim, jamais reformulé.

## Ce qu'un découpage doit capturer au-delà des plans

Un découpage qui n'a que des plans produit une fiche technique qui n'a que des plans, et un film qui se contredit d'un bout à l'autre. Les sections suivantes valent autant que le découpage lui-même :

**Le style.** Nommé explicitement : live-action cinématographique, animation 2D, 3D CG, pâte à modeler, aquarelle, film d'archive. S'il n'est pas nommé, il sera deviné, et il sera deviné différemment à chaque plan.

**Les règles de continuité.** Le trait qui identifie un personnage et ne doit jamais disparaître, une palette, une progression imposée à travers le film. Ce sont ces règles qui permettront de réutiliser les mêmes références image d'un plan à l'autre au lieu d'en refabriquer.

**Les rimes.** Deux plans qui doivent se répondre visuellement — une même forme, un même geste, un même cadre à deux moments du film. Écris-les, avec la mention de ne pas les souligner si c'est l'intention. Non déclarées, elles deviennent deux images différentes qui auraient dû être la même.

**Les progressions.** Ce qui augmente ou diminue à travers le film : une densité d'éléments, une température de lumière, une présence sonore. Sous forme de table plan par plan quand c'est possible — c'est le genre de règle qui se perd dès qu'elle reste implicite.

**Les pièges.** Le cliché que les modèles génèrent par défaut sur ce sujet. Le nommer permet de l'éviter par des descriptions positives précises. Ne jamais formuler un piège en interdiction seule : « pas de brouillard » ne sert à rien en aval, « ciel dégagé, horizon net » sert.

## Format de sortie

```markdown
# SCÉNARIO — [Titre]

> Découpage v[N]
> [N] plans · [durée totale] s

## Structure en [N] mouvements

| | Plans | Durée | Fonction |
|---|---|---|---|
| **I. [Titre]** | 10 → 30 | 15 s | [ce que le bloc accomplit] |

**L'arc.** Deux à quatre phrases : ce que raconte le film et son basculement.

## Le monde

Le contexte, les règles de l'univers, ce qui n'est jamais dit à l'écran mais
détermine ce qu'on y voit. Les traits distinctifs des personnages.

### [Règle de progression, s'il y en a une]

Table plan par plan de ce qui évolue à travers le film.

### Les rimes

Les plans qui se répondent, et s'il faut les souligner ou non.

---

# I. [TITRE DU MOUVEMENT]

## PLAN 10 — *[Titre]*
​```
Durée      : 5 s
Valeur     : [valeur de plan, et son évolution éventuelle]
Sujet      : [ce que le plan montre]
Décor      : [lieu, éléments présents, ce qui doit être visible]
Lumière    : [source, direction, température, contraste]
Mouvement  : [de la caméra ET du sujet, dans l'ordre chronologique]
Son        : [diégétique, synchronisé, ambiance]
Intention  : [pourquoi ce plan existe — la seule ligne qui ne sera pas
             promptée telle quelle, mais qui guide tout le reste]
Assets req.: [ce qu'il faudra fabriquer comme références image]
​```

---

# Liste de courses générée

Regroupement des assets par sujet, avec le plan qui les demande.

---

# Notes de production

Ordre de fabrication, plans à risque, contraintes techniques particulières.
```

Respecte scrupuleusement ce bloc de champs : c'est ce que `fiche-de-plan` lit. Un champ manquant devient une invention en aval.

**Numérotation par 10.** Les plans se numérotent 10, 20, 30… Insérer un plan entre deux devient trivial, et supprimer un plan laisse un trou qu'on garde plutôt que de tout renommer. Un trou dans la numérotation est une information, pas une erreur.

**La ligne `Intention` est obligatoire et ne se prompte pas.** Elle dit pourquoi le plan existe. En aval elle sera traduite en événements observables — « la première décision qu'on lui voit prendre » deviendra « la marche s'interrompt, la tête pivote lentement ». Écrire l'intention permet cette traduction ; l'omettre produit un plan techniquement correct et vide.

**La ligne `Assets req.` liste ce qu'il faudra fabriquer**, pas ce qu'on voit. Un décor, un personnage dans une pose donnée, un objet. C'est le brouillon du registre d'assets, et il vaut mieux qu'il soit généreux : `fiche-de-plan` arbitrera, avec une limite de 4 références par plan.

## Projets longs : découper par scène

Au-delà d'une quinzaine de plans, un fichier unique devient impraticable — on ne relit plus, on ne retrouve plus, et les règles globales se perdent dans la masse.

Passe alors à un fichier par scène :

```
scenario/
├── 00_BIBLE.md        — le monde, le style, les règles, les rimes, les personnages
├── S01_titre.md       — plans 010 à 090
├── S02_titre.md       — plans 100 à 180
└── ...
```

La bible porte tout ce qui vaut pour le film entier et n'est jamais dupliquée. Chaque scène ne contient que son découpage et une ligne de rappel vers la bible. La numérotation des plans reste **continue à travers les scènes** — c'est ce qui permet de garder un registre d'assets unique pour tout le projet, et donc de réutiliser les références au lieu de les refabriquer scène par scène.

## Avant de rendre

- Chaque plan a les neuf champs, aucun vide.
- Toutes les durées sont des entiers entre 5 et 15.
- Le style est nommé explicitement quelque part.
- Toute rime entre deux plans est déclarée.
- Les dialogues, s'il y en a, sont écrits mot pour mot.
- Tes ajouts par rapport au pitch initial ont été validés, pas seulement signalés.

Enregistre dans `/mnt/user-data/outputs/` et présente le fichier.
