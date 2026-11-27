# Expérience 04 : réflexion et skill repensé, sur une scène

Écrit le 2026-11-27 avant tout appel, **validé par l'auteur** le même jour. Demande de GPT : version légère et
exploratoire. Remplace la campagne de 54 appels du [protocole 02](../protocols/02-reasoning.md).

## Versions

| | Skill | Réflexion | Texte |
|---|---|---|---|
| T0 | actuel | non | déjà généré |
| T1 | actuel | oui | à générer |
| T2 | [repensé](scenario-scene-reasoning/SKILL.md) (≈ 4 fois plus court) | oui | à générer |

Même entrée, même schéma, limite de 10 s par plan.

## Scène proposée : 264·2

47 s visées, 4 moments, entrée de taille médiane. Scène calme (découverte, peinture) : elle montre si une histoire peut
avancer sans enchaîner les gestes. L'auteur l'a passée en campagne 01.

## On compare les premières réponses

Avant tout renvoi automatique : sinon le contrôle de mouvement réécrit les trois versions et pèse sur T2
([analyse, § 1](scenario-skills-analysis.md)). Ses alertes sont relevées, pas appliquées. Une réponse hors schéma est
signalée comme échec technique.

## Réutilisation de T0

Campagne 01, version A, répétition 2, premier appel : jamais lue, même prompt et même entrée. Deux écarts avec le T0
prévu au protocole 02 : plafond de 16 384 au lieu de 28 000 (réponse non coupée) et effort de réflexion non précisé.
**Vérifié sans génération** avant le lancement : réflexion coupée, nommer l'effort donne un prompt identique (9 485
jetons, comme à l'appel d'origine) ; contexte du serveur 45 056 jetons, un slot.

## Lecture

Deux duels à l'aveugle, même scène : **T0 contre T1**, puis **T1 contre T2**. Pas de seuil : on cherche des signes, pas
une preuve. Une génération par version à température 1,0 : un écart peut venir du hasard.

## Technique

Relevés sur les deux appels : validité, motif d'arrêt, marge de contexte, durée, jetons, jetons de réflexion, mémoire.
Le premier appel sert de pilote. **2 appels GPU**, quelques minutes.

## C

Gardée à part (choix de l'auteur) : ni son entrée enrichie ni sa relance ici, pour ne pas mélanger les effets. Le skill
repensé reprend seulement son principe (assez de plans pour la durée, plus court plutôt que rempli).

## Technique relevée (2026-11-27)

T1 et T2 : réponses lisibles, non coupées, sans renvoi, 125 s et 115 s, marge réelle de contexte d'au moins 25 900
jetons. **Le pic de VRAM n'est pas exploitable** : 1,76 Go, alors que le modèle occupe forcément bien davantage ; la
sonde ComfyUI ne voit manifestement pas sa mémoire (cause non vérifiée). La RAM (≈ 20 à 22 Go) est un relevé, non
recoupé.

## Résultat (2026-11-27)

Duels répondus par l'auteur : **T0 préféré à T1** (de peu, « les deux se valent bien »), **T1 préféré à T2**. T0 et T2
n'ont pas été comparés.

| | T0 | T1 | T2 |
|---|---|---|---|
| Plans / durée brute (cible 47 s) | 4 / 38 s | 5 / 47 s | 5 / 47 s |
| Mots de description | 609 | 563 | 378 |
| Liaisons `suite` | 2 | 0 | 3 |
| Alertes que la production aurait renvoyées | 1 | 0 | 0 |
| Temps | 22 s | 125 s | 115 s |

- Ce que l'auteur a apprécié : les sentiments et le « pourquoi », des descriptions précises et plus émotionnelles, le
  visage, le lien logique entre les lieux.
- Défauts de T2 relevés après les duels, **probablement dus au texte proposé** (une génération, rien de prouvé) :
  1. les 5 plans finissent par « … est le dernier mouvement » (recommandation « end on one readable movement still in
     progress », recopiée en commentaire, qui partirait dans le prompt vidéo) ;
  2. 3 `suite` enchaînées : la consigne « `suite` est l'exception » du skill actuel avait été retirée ;
  3. un même geste coupé en deux plans (le préparer dans l'un, l'accomplir dans le suivant) ;
  4. descriptions sèches : ni sentiments ni « pourquoi ».

## Tour 2 : version 2 du skill (validé par l'auteur)

[`v2/SKILL.md`](scenario-scene-reasoning/v2/SKILL.md), noté **T3**, avec réflexion. Un seul appel ; T0 et T1 repris du
premier tour. Deux duels : T0 contre T3, T1 contre T3.

Changements, tirés des défauts de T2 :

1. demander ce que le personnage traverse et pourquoi ça compte, relier les lieux et les objets ;
2. `suite` redevient l'exception, avec ses raisons ;
3. la fin avant une `suite` est reformulée pour ne plus être recopiée ;
4. un geste s'accomplit dans son plan.

**L'aveugle est affaibli** : l'auteur a déjà lu T0 et T1, il reconnaîtra le texte nouveau. Et la version 2 est réglée sur
cette scène : si elle convainc, à vérifier sur une scène jamais lue.

```bash
npm run labo -- run duration-259-261-264 --campaign 04 --round 2 --reuse labo/runs/<campagne 01>,labo/runs/<tour 1> --launch
```

### Résultat du tour 2

**T0 préféré à T3, T1 préféré à T3.** L'auteur : dans les textes préférés, le récit suit son cours et les explications
découlent des descriptions ; dans T3, elles reviennent tout le temps et paraissent forcées. T3 : 5 plans, 47 s, 149 s,
ni coupure ni alerte.

Sur les deux tours : les deux versions actuelles ont battu les deux versions repensées, et T0 (la production) n'a perdu
aucun de ses duels. T2 et T3 n'ont pas été comparés. Une scène, une génération par version.

### Lecteur extérieur Claude (4 versions, à l'aveugle)

Classement : T3, puis T1 et T2 à égalité, puis T0. **Il ne rejoint l'auteur sur aucun des 4 duels.** Ses 19 citations
existent toutes et pointent des défauts concrets (dont un ordre des moments bousculé et une action refaite dans T0).
Isolement imparfait : l'agent avait d'office les notes et les derniers commits du projet, sans la correspondance des
textes.

### Lecteur extérieur ChatGPT (même fichier)

Classement : T1 et T3 à égalité, puis T0, puis T2. **Il rejoint l'auteur sur 1 duel sur 4** (T1 contre T2). Ses 19
citations existent toutes. Isolement : envoi fait par l'auteur, non vérifiable d'ici.

### Les deux lecteurs entre eux

- Tous deux placent T0 sous T1 et sous T3, à l'inverse de l'auteur.
- Défauts relevés par les deux : T0 refait l'action de peindre et la commente ; T1 a une formule incompréhensible et des
  fins de plan explicatives ; T2 répète sa formule de fin et coupe un geste en deux ; T3 explique les émotions et parle
  d'une course qui n'est pas racontée (l'auteur a aussi trouvé ses explications forcées).
- Deux modèles de langue qui s'accordent ne font pas une preuve indépendante.

**Lecture** : les lecteurs servent à trouver des défauts, pas à prédire la préférence de l'auteur.

## Tour 3 : la réflexion seule, sur une scène jamais lue (validé par l'auteur)

Écrit avant l'appel.

- **Scène 264·3** (58 s visées, 7 moments) : la seule jamais lue par l'auteur qui ait des moments, comme les traitements
  actuels. Même film que la scène des tours 1 et 2.
- **T0** : campagne 01, version A, répétition 1, premier appel. **T1** : un appel, skill actuel, avec réflexion.
- **Un duel**, premières réponses, aucun seuil.
- **Trois lecteurs en même temps** : l'auteur (duel), un agent Claude neuf et ChatGPT (même fichier à l'aveugle, 2
  textes). Seul l'auteur décide ; son duel est répondu avant qu'il lise les autres avis.

```bash
npm run labo -- run duration-259-261-264 --campaign 04 --round 3 --reuse labo/runs/<campagne 01> --launch
```

### Résultat du tour 3

| | T0 sans réflexion | T1 avec réflexion |
|---|---|---|
| Duel de l'auteur | **préféré** (de peu) | |
| ChatGPT | **1er** | 2e |
| Agent Claude (isolement imparfait) | 2e | **1er** |
| Plans / durée brute (cible 58 s) | 7 / 62 s | 7 / 68 s |
| Temps | **30 s** | 217 s (au-dessus des 180 s admis) |
| Alertes que la production aurait renvoyées | 1 | 0 |

L'auteur : l'autre texte est un peu plus visuel, le préféré plus précis et un peu plus intéressant. Défauts relevés par
les deux lecteurs : des phrases de commentaire en fin de plan **dans les deux versions** ; le titre tassé dans le
dernier plan de T0 ; dans T1, des pigments sans provenance et une direction de course contradictoire. Citations toutes
trouvées.

## Bilan sur la réflexion (deux scènes, une génération par version)

- **L'auteur a préféré T0 les deux fois**, de peu chaque fois.
- La réflexion a coûté environ **6 à 7 fois plus de temps** (125 s et 217 s contre 22 s et 30 s).
- Elle a évité les alertes de production les deux fois ; la durée était exacte sur une scène, trop longue sur l'autre.
- Lecteurs face à l'auteur, sur les deux évaluations : ChatGPT 2 duels sur 5, agent Claude 0 sur 5.
- **Rien ne justifie son coût à ce stade : Cadence reste sans réflexion.** Indice, pas preuve.

## Défaut découvert après coup

Le prompt de T2 et T3 contenait encore le schéma de sortie de production, dont les descriptions redisent les anciennes
règles. Les skills repensés n'étaient donc pas indépendants de l'ancien
([expérience 05](experiment-05-minimal-skill.md)).

## Déroulé

```bash
npm run labo -- run duration-259-261-264 --campaign 04 --reuse labo/runs/<essai de la campagne 01> --launch
npm run labo -- duels labo/runs/<essai 04>         # les deux duels, réponses enregistrées sur ce PC
npm run labo -- duels-score labo/runs/<essai 04>   # préférences, puis mesures par version
```

Avant les réponses : aucun texte ni mesure de contenu dévoilé, essai masqué dans la page des résultats. `technical.md`
ne contient ni texte ni nombre de plans. Code : `src/light.ts`.
