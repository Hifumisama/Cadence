# Qwen Image Edit 2511 — prompter une édition

> Grammaire reprise du skill `assets-comfyui` (production réelle) et de la fiche officielle du modèle : [ComfyUI, Qwen-Image-Edit-2511](https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511). La doc officielle ne donne aucune consigne de prompt ; tout ce qui suit vient de notre pratique `[projet]`. Le workflow d'édition n'est pas encore dans le dépôt (`workflows/image-refs/`).

## Le principe

**Des instructions impératives, pas des descriptions.** On ne redécrit pas l'image : on énonce la transformation. La source est l'image du **parent** de l'asset.

- **Une intention par instruction.** Empiler cinq modifications dans une phrase donne un résultat moyen sur les cinq.
- **Nomme ce qui ne doit pas bouger** quand c'est structurant : « Preserve her exact facial identity, ruby-red eye color, tan skin tone ».
- **Plusieurs passes plutôt que tout d'un coup**, en repartant à chaque fois de la sortie précédente. Une instruction par ligne.
- Anglais, comme le reste.

Exemple validé :

```text
Crop tightly onto the woman's face, filling the frame with her eyes and upper face.
Preserve her exact facial identity, ruby-red eye color, tan skin tone, and loose hair strands falling across her cheek.
Sharpen focus on the eyes, add subtle catching highlights as if from nearby firelight.
```

## Quand NE PAS éditer (utiliser la génération)

L'édition préserve la structure de l'image source. Elle échoue dans ces trois cas :

1. **Le but est une absence.** Retirer un élément structurant (effacer les doigts d'une main, ôter une silhouette d'un décor) revient à combattre sa fonction principale : le modèle rend l'élément quel que soit le nombre d'essais. Génère plutôt un concept que le modèle possède déjà (un pont plutôt qu'une paume sans doigts, un mur plutôt qu'un décor vidé de son personnage).
2. **Le but est de changer de point de vue.** Reculer, monter, passer de face à trois quarts : ce sont des opérations géométriques, pas des retouches. Le modèle colle un élément par-dessus l'image existante (une colline au premier plan, sans rien recalculer). Deux vues d'un même lieu sont **deux générations**.
3. **L'asset est un élément distinct**, pas un autre cadrage du même sujet : un effet visuel (flammes, éclairs), un accessoire, une pièce à part. Il se génère de zéro, même rattaché au master. Le lien de parenté dit à quelle famille il appartient, pas comment il se fabrique.

Ce qui reste bon pour une édition : un flou, une bascule de lumière, une saison, un élément ajouté ou retiré **dans le plan de l'image** ; un cadrage serré ou un détail recadré depuis le master (les yeux, la main, la lame).

## Réglages du workflow officiel

Le modèle de workflow officiel propose deux modes (LoRA Lightning 4 étapes à CFG 1, ou 40 étapes à CFG 3, sampler `euler` / `simple`) et accepte plusieurs images de référence. Le réglage retenu sera fixé quand le workflow sera branché : ne le mets pas dans un prompt.
