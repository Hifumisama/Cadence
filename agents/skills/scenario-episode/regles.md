# scenario-episode — du brief au scénario d'un épisode

Tu écris le **scénario d'un épisode** : ses scènes, ses plans et ses répliques. C'est un scénario **narratif** : il dit ce qui se passe et pourquoi. Il ne dit ni le cadrage, ni la lumière, ni le son, ni les assets : ces décisions se prennent plus loin, dans le prompt vidéo de chaque plan (skill `plan-h3`) et dans le registre.

## Ce que tu reçois

- Le **brief** : arc, style, personnages, lieux, règles de continuité, rimes, progressions, pièges, langue des dialogues.
- **L'épisode** : son titre et son résumé (issus du brief).
- Les **résumés des épisodes précédents**, pour la continuité narrative seulement (la continuité visuelle se tient à l'échelle de l'épisode, pas de la série).
- Le **registre existant** (personnages, lieux, voix), pour employer des noms qui existent déjà.
- La **portée** demandée (`portee.type`) et l'**instruction** de l'utilisateur (`consigne` : ajouter un plan, compléter ce qui est vide, refaire…) : l'épisode entier (`episode`), un seul plan à insérer (`plan-a-inserer`, avec les plans voisins) ou un seul plan à corriger (`plan-a-corriger`). Pour un plan seul, tu rends UNE scène contenant UN plan, et tu n'écris que ce qui t'est demandé. Un `retourUtilisateur` éventuel corrige une proposition précédente : tiens-en compte.

## La méthode : proposer un découpage complet

Ne pose pas de question avant d'avoir proposé. Écris un découpage **complet**, avec ses durées : une proposition fausse est un point de départ, une page blanche n'en est pas un. Puis liste tes **inventions** à part (tout ce que le brief ne disait pas), pour qu'elles soient validées ou jetées d'un mot.

Structure d'abord : deux à quatre **scènes**, chacune avec un titre et sa fonction dans l'épisode (ce que le bloc accomplit). Puis les plans, scène par scène.

## Ce qu'est un plan

Un plan est **un appel de génération vidéo** : une durée entière de 4 à 15 secondes. Il peut contenir plusieurs coupes internes, dont le nombre suit l'intensité de l'action (voir plus bas) : ce n'est pas à toi de les écrire, mais tu dois en tenir compte pour décider ce qui tient dans un plan.

- **Un plan = une unité d'action.** Au-delà de 15 secondes il faut couper, et une coupe est une décision de mise en scène, pas un pis-aller. Si un plan dérive vers 18 secondes, il en contient presque toujours deux.
- **Écris la durée qui sera générée.** Un plan qu'on « voit » à 3 secondes s'écrit à 4 au minimum.
- **La description** est du texte narratif : ce qui se passe, et pourquoi le plan existe. Un ou deux paragraphes courts. « Pourquoi » compte : c'est la seule chose qui permettra plus tard de traduire l'intention en événements observables (« la première décision qu'on lui voit prendre » devient « la marche s'interrompt, la tête pivote »). Un plan sans intention est un plan vide.
- **Pas de cadrage, de lumière, de son ni de mouvement de caméra** dans la description : ils se décident par coupe dans le prompt vidéo, nulle part ailleurs.
- **Pas de renvoi à un autre plan** (« comme au plan précédent », « qui répond au plan 4 ») : ces mentions se désynchronisent dès qu'un plan est inséré ou déplacé. Chaque description se comprend seule. L'ordre est celui du tableau que tu rends ; il n'y a pas de numéro de plan.
- **Pas de liste d'assets.** L'histoire d'abord. Nomme les personnages, les lieux et les objets qui comptent dans la description, avec les noms du registre quand ils existent ; le registre se déduira ensuite.

## Découper mieux : les corrections qui reviennent

Les retours de production disent où un premier découpage pèche. Applique-les dès l'écriture, pas au rattrapage :

- **Sous-découpage.** Pousse le plan de coupe plus loin par défaut : points de vue variés, gestes et mouvements de caméra qui ont une raison d'être. Un plan de 15 s quasi fixe sans raison est presque toujours un plan qu'on n'a pas fini d'écrire.
- **Plan statique sans intention.** Si rien ne change à l'image pendant tout le plan, soit il faut une intention (une attente, une tension retenue : dis-le), soit il faut le couper.
- **Scène dialoguée trop statique.** Couvre-la : champ-contrechamp, réaction de l'interlocuteur, plan de coupe sur ce que la parole provoque. Un dialogue filmé d'un seul point de vue manque de dramatique.
- **Logique de continuité.** Un personnage qui entre par la droite après un mouvement vers la gauche, une lumière qui change sans raison : pense la suite physique des plans, sans la stocker.
- **Un lieu peuplé et le même lieu désert sont deux lieux pour la génération.** Si la scène passe d'une foule à un endroit vide, dis-le dans la description : ce sera deux assets.
- **La cadence raconte l'état du personnage, par contraste.** Un personnage en danger se découpe court et mobile, celui qui reprend le contrôle se découpe long et tenu. Écris les plans par paires : rapide pendant la tension, lent pour la retombée.

## La caméra est chère

Chaque mouvement composé (orbite, mouvement multiple, changement de vitesse en cours de plan) est une source d'échec de génération. Écris l'intention du plus simple qui produit l'effet voulu.

## Les répliques

Les répliques sont des **entités à part entière**, écrites ici puis liées aux plans (à la fiche de plan) :

- Écris chaque réplique **mot pour mot**, dans la langue des dialogues du brief, ponctuation comprise. Elle sera reprise verbatim dans le prompt vidéo, jamais reformulée.
- Chaque réplique a un **locuteur**. Un personnage du registre, ou une voix off / un narrateur si aucun personnage ne parle. Ne change pas le locuteur d'une réplique pour la « faire rentrer ».
- Une réplique est attachée au **plan** où elle est dite. Un plan peut en porter plusieurs (champ-contrechamp) ; une même réplique peut couvrir deux plans si elle traverse une coupe.
- **Le dialogue décide de la durée.** Un plan dialogué a besoin de la durée de ses répliques plus une marge de respiration d'au moins 2 secondes (de quoi poser le regard avant la première syllabe et après la dernière). Tu ne connais pas la durée réelle avant la prise de voix : choisis une durée **généreuse**, et n'essaie pas de la calculer à partir du nombre de mots. Elle s'ajustera après la voix.
- Si une réplique est manifestement trop longue pour un plan de 15 secondes, coupe le plan **à une frontière de sens** : entre deux répliques, jamais au milieu d'une. Profite du second plan pour changer d'angle (la réaction de l'interlocuteur, par exemple).

## Ce que tu appliques du brief

- **Le style, les règles de continuité, les rimes, les progressions et les pièges** du brief s'appliquent : tu ne les redéfinis pas. Une rime déclarée se traduit dans la description de chacun des deux plans (« le gros plan sur les yeux de Maya, qui reprend le motif de l'ouverture » n'est pas un renvoi : c'est le motif lui-même, écrit sans citer l'autre plan).
- **Reste fidèle au brief et à l'auteur.** Ne rajoute ni personnage ni intrigue absents du brief sans les lister dans `inventions`.

## Avant de rendre

- Chaque plan a une description non vide, qui contient une intention.
- Toutes les durées sont des entiers de 4 à 15.
- Aucun plan ne renvoie à un autre plan, et aucune description ne contient de cadrage, de lumière, de son ni de mouvement de caméra.
- Chaque réplique a un locuteur, un texte exact, et est rattachée à un plan.
- Un plan dialogué laisse au moins 2 s de marge sur ses répliques ; s'il déborde, il est coupé à une frontière de sens.
- Une scène dialoguée n'est pas filmée d'un seul point de vue.
- Les rimes déclarées du brief sont traduites dans les deux plans concernés.
- Tes ajouts par rapport au brief sont listés dans `inventions`.
