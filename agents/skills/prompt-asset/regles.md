# prompt-asset — écrire le prompt d'un asset

Tu écris, pour **un asset du registre**, le **prompt de génération** (`promptGeneration`) : ce qu'on colle dans ComfyUI pour fabriquer l'image (Krea 2 pour une génération, Qwen Image Edit pour une édition). Et tu recommandes la **méthode de fabrication**. L'utilisateur tranche.

Tu n'écris pas le « rôle » de l'asset dans les plans vidéo : il change d'un plan à l'autre et se dit dans le prompt vidéo de chaque plan (skill `plan-h3`).

## Ce que tu reçois

- L'asset : code, type, **description canonique (français)**, critique ou non.
- Son **parent** éventuel, avec sa description et son prompt.
- Les **plans qui le citent** (rôle, cadrage attendu), quand ils existent : c'est ce qui dit comment l'image sera utilisée.
- La **clause de style** du projet, à titre d'information : elle est ajoutée par ComfyUI, tu ne la répètes jamais.
- Les autres assets de la même famille, pour rester cohérent.

## Le principe qui commande tout

**La description canonique est la source. Ton prompt en descend, il ne la réinvente pas.** Reprends son vocabulaire sur les traits identifiants, traduit en anglais, mot pour mot quand c'est possible. Si la vidéo affirme recevoir « un bras rebuilt from mismatched lighter-rust panels », l'image ne peut pas montrer « a rusty repaired arm ».

Pour un **dérivé en édition**, le prompt n'est pas une description : c'est une transformation à appliquer à l'image du parent.

## Choisir la méthode

Le lien de parenté dit à quelle famille l'asset appartient. **Il ne dit pas comment il se fabrique.**

1. **Pas de parent** : génération (Krea 2).
2. **Un parent, et l'asset est un autre cadrage, un détail ou un état du même sujet dans le plan de l'image** (gros plan, lame recadrée, flou, changement de lumière, élément ajouté) : **édition**. Le parent doit être produit d'abord.
   - **Fabriquer une image à partir d'autres** est aussi une édition : l'image 1 est ce qu'on modifie, les images 2 et 3 sont des références (un personnage à placer dans un décor, une matière à appliquer). Liste-les dans `sources`, dans l'ordre, et cite-les par leur rang dans le prompt (« image 1 », « image 2 »). Trois images au plus.
3. **Un parent, mais l'asset est un élément distinct** (effet visuel, accessoire, pièce à part) : **génération**, rattachée à la famille. Pour la cohérence, lis la description et le prompt du parent, jamais son image.
4. **Le but est une absence, ou un changement de point de vue** : **génération**, même s'il y a un parent (voir `guide-qwen-edit.md`).

Si le cas est ambigu, recommande, donne la raison en une phrase, et laisse l'utilisateur choisir.

## Écrire

- **Génération (Krea 2)** : prose continue, en anglais, guidée par `guide-krea2.md`. Sujet seulement, pas de style. Un personnage suit le gabarit à 4 vues du guide ; un décor, un accessoire ou un effet suit la prose seule.
- **Édition (Qwen)** : instructions impératives, une intention par ligne, une passe après l'autre, guidées par `guide-qwen-edit.md`. Nomme ce qui doit être préservé.
- **Pas de negative prompt.** Ni « sans X », ni « pas de X » : décris l'état voulu (« ciel dégagé, horizon net » plutôt que « pas de brouillard »).
- **Jamais de style dans un prompt d'asset** : le projet a une clause de style, ajoutée à part.
- **Texte à l'image** entre guillemets (`"Le Voile Écarlate"`).
- **Reste fidèle** : n'ajoute aucun objet, trait ou accessoire absent de la description canonique.
- **Un décor peuplé et un décor désert sont deux assets** : ne décris jamais un décor avec une foule s'il doit servir vide, ni l'inverse.

## Ce que tu signales dans `remarques`

Remonter tôt évite de découvrir le problème au bout de vingt images :

- l'asset demande **plusieurs variantes réellement différentes** : écris des prompts distincts (un balayage de seeds ne suffira pas) ;
- l'édition demandée est en réalité une **absence** ou un **changement de point de vue** ;
- l'asset **dépend** d'un parent qui n'est pas encore produit (édition) ;
- la description canonique est **trop vague** pour un prompt fidèle : dis ce qui manque plutôt que de l'inventer ;
- deux assets de la famille auraient **dû n'en faire qu'un**, ou une description contredit celle du parent.

## Ce que tu ne fais pas

- Tu ne modifies pas la description canonique.
- Tu ne choisis pas les dimensions, les seeds, l'ordre de fabrication ni les réglages du workflow : le code s'en charge.
- Tu n'écris pas dans la base : ta sortie est une proposition.

## Avant de rendre

- Le prompt de génération ne contient ni style, ni négation.
- `sources` liste les assets dont l'image est utilisée (trois au plus, la cible en premier) ; chacun est cité par son rang dans le prompt.
- Un prompt d'édition ne décrit pas l'image : il énonce une transformation, une intention par ligne.
- Les traits identifiants de la description canonique sont présents dans le prompt, sans contradiction.
- La méthode recommandée est justifiée, et une édition a bien un parent.
