# Évaluation qualitative

Écrit le 2026-11-27, après la campagne 01 (lecture de 15 textes, jugée beaucoup trop longue par l'auteur).
Format demandé par GPT ; les points marqués **(Claude)** sont mes choix, à valider.

## Duels à l'aveugle

- Les intentions et les moments d'origine, puis **deux textes anonymes** côte à côte.
- Une question : « Lequel gardes-tu ? » → texte 1, texte 2, les deux se valent, aucun ne me satisfait.
- **(Claude)** Un cinquième bouton, « Je passe » : la campagne 01 obligeait à noter, d'où des 3 par défaut.
- **(Claude)** « Un texte trahit gravement la scène » : à cocher seulement si c'est le cas, texte par texte.
- Facultatif : motifs (progression, fidélité, répétitions, écriture, cohérence) et commentaire.
- Chaque version est aussi souvent à gauche qu'à droite. Ni version, ni durée, ni notes du modèle, ni réflexion.
- La page est servie sur ce PC seulement et enregistre les réponses dans le dossier de l'essai. Tant qu'elles ne le sont
  pas, l'essai est masqué dans la page des résultats.

Seuls « texte 1 » et « texte 2 » font gagner une version. Les trois autres réponses ne donnent de victoire à personne.

## Qui décide

L'auteur a le dernier mot artistique. Aucune moyenne entre son jugement et celui du second lecteur.

## Second lecteur

Un modèle qui lit **davantage de générations** que l'auteur. Il ne vote pas dans la règle.

- Il relève, texte par texte : inventions, omissions, répétitions, phrases qui commentent au lieu de raconter, caméra
  et lumière dans le récit, trahisons de la scène. Chaque défaut avec une **citation exacte**, que le code vérifiera.
- Sur les mêmes duels que l'auteur, il répond aussi, pour repérer les désaccords.
- Il propose à l'auteur les cas à lire en plus : préférence opposée, trahison signalée d'un seul côté, défaut lourd sur
  une génération non lue. Cette lecture complémentaire ne change pas le résultat de la règle.
- **Isolement** : lancé depuis un dossier vide, hors du dépôt, donc sans instructions, mémoire ni historique du
  projet ; il reçoit un seul fichier de textes anonymes, au nom neutre, sans variante ni hypothèse. Il déclare ce que
  contenait son contexte. Cet isolement n'a pas encore été essayé.
- C'est un appel de modèle : lancé seulement avec l'accord de l'auteur.

**Pas encore codé** : le format de ses relevés et la vérification des citations.

## Lecteur extérieur (ChatGPT)

Demandé par l'auteur. Un seul fichier Markdown à envoyer : consignes, scène demandée, textes anonymes (lettres tirées au
sort), réponse en JSON. Code : `src/evaluation.ts`.

```bash
npm run labo -- evaluate labo/runs/<tour 1>,labo/runs/<tour 2>
npm run labo -- evaluate-read labo/runs/<tour 2> --answer <fichier de sa réponse> --reader chatgpt
```

Le même fichier sert à un second lecteur Claude, lancé sur une copie seule dans un dossier à part (`--reader claude`).
Un agent reçoit d'office les instructions et l'index mémoire du projet : son isolement n'est pas complet.

- **Conversation neuve** (temporaire de préférence) : celle qui conçoit les expériences connaît les versions.
- L'auteur répond à ses duels **avant** de lire cette évaluation.
- Il classe les textes et cite ses défauts ; le code vérifie chaque citation. Il ne vote pas, aucune moyenne.
- Le fichier contient des textes du projet : l'envoyer est le choix de l'auteur.

## Limites

Un seul auteur, qui connaît les projets. Peu de duels : le hasard pèse lourd (chiffres dans chaque protocole). Un texte
plus long peut trahir sa version.
