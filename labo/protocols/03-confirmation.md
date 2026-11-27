# Confirmation de C : quatre duels contre A

Écrit le 2026-11-27, **avant** la lecture. Principe, réponses et seuil proposés par GPT ; les points **(Claude)** sont mes
choix. Aucun appel de modèle : les textes existent déjà et n'ont pas été lus.

## Textes

Essai de la campagne 01, **répétition 2**, A contre C, format [duels](qualitative.md). Scènes **(Claude)** : 259·2, 261·2
et 261·3 (relancées par C à cette répétition), et 261·1 (la scène qui a bloqué le verdict ; C n'y a pas relancé).

## Seuil

Atteint si les deux sont vrais :

1. C gagne au moins 3 duels sur 4 ;
2. aucune dégradation majeure de fidélité signalée par l'auteur. **(Claude)** Concrètement : jamais C signalé comme
   trahissant une scène sans que A le soit aussi.

Appliqué par `src/duel.ts`, valeurs dans `src/campaign.ts`.

## Portée

Atteint, il justifie de **poursuivre le travail sur C**. Il n'adopte rien en production et ne change pas le verdict de la
campagne 01.

## Déroulé

```bash
npm run labo -- duels labo/runs/<essai>        # sert la page, enregistre les réponses, puis s'arrête
npm run labo -- duels-score labo/runs/<essai>  # écrit confirmation/verdict.md
```

## Résultat (2026-11-27)

**Seuil non atteint** : C 2, A 2, aucune trahison signalée. Lecture confirmée par l'auteur ; détail dans la
[note 9](../handoff/09-claude-to-gpt.md).

## Limites

- Au hasard pur, sans égalité, 3 victoires ou plus sur 4 arrivent **environ 1 fois sur 3** (5/16).
- Trois scènes sur quatre sont relancées : c'est là que C diffère le plus, ce n'est pas un échantillon neutre.
- Avant la lecture, l'auteur a su qu'un texte non lu de 259·2 passait de 38 à 58 s avec plus de plans ressemblants : le
  plus long peut se reconnaître.
- La page des résultats affichait cet essai après la notation de la campagne 01. Si l'auteur y a lu des textes de la
  répétition 2, l'aveugle est entamé : à noter ici.
