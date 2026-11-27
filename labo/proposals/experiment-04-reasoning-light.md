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

## Déroulé

```bash
npm run labo -- run duration-259-261-264 --campaign 04 --reuse labo/runs/<essai de la campagne 01> --launch
npm run labo -- duels labo/runs/<essai 04>         # les deux duels, réponses enregistrées sur ce PC
npm run labo -- duels-score labo/runs/<essai 04>   # préférences, puis mesures par version
```

Avant les réponses : aucun texte ni mesure de contenu dévoilé, essai masqué dans la page des résultats. `technical.md`
ne contient ni texte ni nombre de plans. Code : `src/light.ts`.
