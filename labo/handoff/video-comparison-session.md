# Passation : comparer deux découpages en vidéo

Pour une **nouvelle session Claude Code, sur le même PC**. Écrite le 2026-11-27.

## Mission

Deux découpages d'une même scène ont été comparés à la lecture. L'auteur juge qu'on ne peut pas savoir ce qu'ils valent
sans les voir en vidéo : le but est un scénario qui donne **ce que l'utilisateur veut voir**, pas un beau texte.

Préparer correctement le rendu vidéo des deux, puis livrer le tout dans un **artefact Claude** (pas une page HTML
jetable) : les textes à côté de ce qui a réellement été généré. L'auteur répond à **une seule question** :

> Laquelle préfères-tu, et pourquoi ?

## Départ

```bash
git checkout labo-qualite
```

Lire ensuite ce fichier, [`../README.md`](../README.md) et
[`../proposals/experiment-05-minimal-skill.md`](../proposals/experiment-05-minimal-skill.md).

## Les deux textes

Scène `264-s3-t1931` du jeu `duration-259-261-264` (projet 264, 58 s visées, 7 moments).

| | Fichier (sur ce PC seulement : `labo/runs/` est ignoré par git, le dépôt est public) |
|---|---|
| **S0**, skill de production | `labo/runs/2026-11-27-11-02-07-duration-259-261-264/calls/264-s3-t1931__A__r2.json` |
| **S1**, noyau minimal | `labo/runs/2026-11-27-14-52-26-duration-259-261-264-05/calls/264-s3-t1931__S1__r1.json` |

**Prendre la première réponse (`attempts[0].text`) dans les deux cas** : ce sont les textes que l'auteur a lus. Le champ
`output` de S0 est différent (renvoi automatique). `versionsOf` et `firstAnswer` (`labo/src/light.ts`) les lisent.

| | Plans | Durées écrites | Après l'ajustement de production (58 s) | Liaisons |
|---|---|---|---|---|
| S0 | 6 | 8+6+8+10+8+8 = 48 | 10+8+10+10+10+10 = 58 | toutes `coupe` |
| S1 | 7 | 10+10+10+10+10+8+10 = 68 | 8+8+8+9+9+7+9 = 58 | `suite, coupe, coupe, suite, suite, suite, suite` |

## Règles approuvées par l'auteur

1. **Ne pas toucher au projet 264** : travailler sur une copie (ou un projet d'essai).
2. **Mêmes conditions** : mêmes images de référence, mêmes réglages de rendu, même musique ou aucune.
3. **Un rendu par plan.** Pas de nouvel essai pour un seul camp. Une panne technique se relance et se signale ; un
   résultat décevant se garde et se montre.
4. **Même durée** : appliquer aux deux l'ajustement de production (`ajusterDureesScene`, tableau ci-dessus).
5. **Plans `suite`** rendus dans l'ordre, en continuité. S'ils posent problème, cela fait partie du résultat.
6. **Aucun changement des agents, des prompts ni du code de production.**
7. **Demander l'accord avant toute génération** (images, vidéo, LLM) : dire quoi, pourquoi et combien de temps, et
   vérifier que la carte graphique est libre (partagée entre LLM et ComfyUI).

Un point à décider avec l'auteur : le premier plan de S1 est `suite` (il prolongerait la scène d'avant, qui n'est pas
rendue). Proposition : le passer en `coupe` et le signaler.

## Estimations et pièges

- **13 plans.** Un rendu mesuré à environ 3 min (6 pas, autre projet) : compter **40 minutes de carte ou plus**, hors
  images de référence et fiches de plan. À réestimer avec les réglages retenus.
- Les fiches de plan passent par le chemin normal de Cadence (références, traduction, Open H3 IR) : à explorer, rien
  n'a été préparé.
- La relecture automatique du scénario et les renvois peuvent réécrire un texte : ils ne doivent pas toucher ces deux
  découpages.
- Arrêter un worker sous Windows : voir la mémoire du projet (arrêter la tâche laisse `node` vivant).
- La sonde de VRAM du labo est fausse (elle ne voit pas le modèle).

## L'artefact

- **Privé** : il contient les textes et les images d'un projet de l'auteur.
- Par version : le texte de chaque plan et sa vidéo, plus la scène entière enchaînée (ffmpeg est installé). Respecter
  les limites de taille des fichiers d'un artefact.
- Libellés neutres si possible. L'aveugle sera faible : l'auteur a lu les textes et connaît la correspondance.
- La question et sa réponse **dans la page** (base de données de l'artefact), pour que la session puisse la relire.
  Charger les compétences `artifact-design` et `artifact-capabilities` avant d'écrire la page.

## L'auteur

Il parle français : ton amical et court, il ne peut pas lire long ni complexe. Juger des textes en duel l'a fatigué :
**une seule question**. Il coordonne parfois avec ChatGPT : ne rédiger une note pour lui que si c'est nécessaire.
Commits en français, push sur accord.

## Après

Consigner la réponse dans `labo/proposals/experiment-05-minimal-skill.md`. En attente par ailleurs, sans urgence :
l'[audit des contrôles](../audits/checks-audit.md) (proposition non appliquée).
