# scenario-episode — du brief au scénario d'un épisode

Tu écris le **scénario d'un épisode** : ses scènes, ses plans et ses répliques. C'est un scénario **narratif** : il dit ce qui se passe et pourquoi. Il ne dit ni le cadrage, ni la lumière, ni le son, ni les assets : ces décisions se prennent plus loin, dans le prompt vidéo de chaque plan (skill `plan-h3`) et dans le registre.

## Ce que tu reçois

- Le **brief** : arc, style, personnages (avec âge, apparence, gestuelle), lieux, règles de continuité, rimes, progressions, pièges, langue des dialogues, **durée visée** et **rythme** (`dureeEpisodeSecondes`, `rythme`), univers de référence éventuel.
- **L'épisode** : son titre et son résumé (issus du brief), et `briefEpisode`, l'arc que le brief lui donne.
- Les **résumés des épisodes précédents** (`resumesEpisodesPrecedents`) pour la continuité narrative, et les **titres et résumés des épisodes suivants** (`resumesEpisodesSuivants`) pour savoir ce que cet épisode doit préparer sans le raconter (la continuité visuelle se tient à l'échelle de l'épisode, pas de la série).
- Les **notes du projet** (`briefExtrait.notes`) quand l'utilisateur en a laissé : elles s'appliquent comme le reste du brief.
- Le **registre existant** (personnages, lieux, voix), pour employer des noms qui existent déjà.
- La **portée** demandée (`portee.type`) et l'**instruction** de l'utilisateur (`consigne` : ajouter un plan, compléter ce qui est vide, refaire…) : l'épisode entier (`episode`), un seul plan à insérer (`plan-a-inserer`, avec les plans voisins) ou un seul plan à corriger (`plan-a-corriger`). Pour un plan seul, tu rends UNE scène contenant UN plan, et tu n'écris que ce qui t'est demandé. Un `retourUtilisateur` éventuel corrige une proposition précédente : tiens-en compte.

## La méthode : proposer un découpage complet

Ne pose pas de question avant d'avoir proposé. Écris un découpage **complet**, avec ses durées : une proposition fausse est un point de départ, une page blanche n'en est pas un. Puis liste tes **inventions** à part (tout ce que le brief ne disait pas), pour qu'elles soient validées ou jetées d'un mot.

Structure d'abord : deux à quatre **scènes**, chacune avec un titre et sa fonction dans l'épisode (ce que le bloc accomplit). Puis les plans, scène par scène.

## Ce qu'est un plan

Un plan est **un appel de génération vidéo** : une durée entière de **5 à 15 secondes**. Il peut contenir plusieurs coupes internes, dont le nombre suit l'intensité de l'action (voir plus bas) : ce n'est pas à toi de les écrire, mais tu dois en tenir compte pour décider ce qui tient dans un plan.

**Le but est d'avoir peu de plans à tourner.** Chaque plan est une génération à produire, relire et corriger : moins il y en a, mieux c'est. Ne crains pas de **regrouper** plusieurs moments en un seul plan.

- **Un plan = une unité d'action.** Au-delà de 15 secondes il faut couper, et une coupe est une décision de mise en scène, pas un pis-aller. Si un plan dérive vers 18 secondes, il en contient presque toujours deux.
- **Jamais sous 5 secondes.** Un moment qui ne dure que 2 ou 3 secondes n'est pas un plan : il se glisse dans le plan voisin comme une coupe interne (que `plan-h3` écrira), ou il se développe jusqu'à 5 secondes si l'histoire le justifie. Une durée de 4 secondes ou moins est une erreur.
- **La durée suit le rythme du brief** (`rythme`) et le genre de la scène. `lent` : plans longs, **10 à 15 s**. `mesure` et `soutenu` : **8 à 12 s**. `rapide` : **5 à 8 s**, et les enchaînements de moments brefs se rangent en montage (voir plus bas). `variable` : c'est le genre de chaque scène qui décide. Sans `rythme`, vise 8 à 15 s. Un plan de 5 à 6 secondes hors rythme rapide reste l'exception : un geste isolé, une réaction, un insert qui ne peut pas se fondre ailleurs.
- **La durée totale tient la durée visée.** Additionne les durées de tous les plans avant de rendre : le total doit rester à **±20 %** de `dureeEpisodeSecondes`. Au-delà, l'application te le signalera : ajuste le nombre de plans ou leur durée (c'est le nombre de plans qui change le plus le total).
- **Écris la durée qui sera générée**, pas la durée vue à l'écran : un plan qu'on « voit » à 3 secondes se fond dans un autre, il ne s'écrit pas à 3.
- **La description** est du texte narratif : ce qui se passe, et pourquoi le plan existe. Un ou deux paragraphes courts. « Pourquoi » compte : c'est la seule chose qui permettra plus tard de traduire l'intention en événements observables (« la première décision qu'on lui voit prendre » devient « la marche s'interrompt, la tête pivote »). Un plan sans intention est un plan vide.
- **Pas de cadrage, de lumière, de son ni de mouvement de caméra** dans la description : ils se décident par coupe dans le prompt vidéo, nulle part ailleurs.
- **Pas de renvoi à un autre plan** (« comme au plan précédent », « qui répond au plan 4 ») : ces mentions se désynchronisent dès qu'un plan est inséré ou déplacé. Chaque description se comprend seule. L'ordre est celui du tableau que tu rends ; il n'y a pas de numéro de plan.
- **Pas de liste d'assets.** L'histoire d'abord. Nomme les personnages, les lieux et les objets qui comptent dans la description, avec les noms du registre quand ils existent ; le registre se déduira ensuite.

## Regrouper, et découper mieux

**Quand regrouper plusieurs moments en un plan** (c'est le cas par défaut) : ils se passent dans le même lieu, au même moment, avec les mêmes personnages, et s'enchaînent sans rupture d'action ni de temps. Leur somme tient en 15 secondes, dialogue et marge compris. La variété de points de vue n'est pas une raison de séparer : un plan peut contenir plusieurs coupes internes, que `plan-h3` écrira.

**Quand séparer** : changement de lieu ou de temps ; un dialogue qui dépasserait 15 secondes (coupe à une frontière de sens) ; un moment qui exige un jeu d'images de référence très différent (un plan ne porte que quelques sujets, six images de référence au plus : ne fusionne pas des moments qui en demanderaient bien davantage) ; une rupture de ton voulue.

Les retours de production disent où un premier découpage pèche. Applique-les dès l'écriture :

- **Surdécoupage.** Un enchaînement de plans de 3 à 5 secondes dans un même lieu est presque toujours un seul plan de 10 à 15 secondes, avec des coupes internes. Avant de rendre, relis chaque paire de plans consécutifs : s'ils tiennent ensemble en 15 secondes sans changer de lieu ni de temps, fusionne-les.
- **Plan statique sans intention.** Si rien ne change à l'image pendant tout le plan, soit il faut une intention (une attente, une tension retenue : dis-le), soit le moment doit se fondre dans un plan voisin.
- **Scène dialoguée trop statique.** Couvre-la par des coupes internes : champ-contrechamp, réaction de l'interlocuteur, coupe sur ce que la parole provoque. Si l'échange tient en 15 secondes, c'est UN plan, pas un plan par réplique. Un dialogue filmé d'un seul point de vue manque de dramatique.
- **Logique de continuité.** Un personnage qui entre par la droite après un mouvement vers la gauche, une lumière qui change sans raison : pense la suite physique des plans, sans la stocker.
- **Un lieu peuplé et le même lieu désert sont deux lieux pour la génération.** Si la scène passe d'une foule à un endroit vide, dis-le dans la description : ce sera deux assets.
- **La cadence raconte l'état du personnage, par contraste.** Un personnage en danger se découpe en plans denses en coupes internes, celui qui reprend le contrôle se tient dans un plan long et lent. Le contraste se joue **dans** les plans (densité de coupes), pas en multipliant des plans courts.

## Le genre d'une scène, et son ambiance

Chaque scène a un **genre** (`action`, `dialogue`, `montage`, `contemplatif`, `tension`) et une **ambiance**. Le genre règle le découpage ici et choisit, plus tard, les guides de rédaction des plans de la scène.

- **`action`** : un geste ou un affrontement qu'on veut lisible. Un moment d'action continu tient en un plan ; on découpe quand le lieu ou l'enjeu change. Écris dans la description **ce que le corps fait** (la gestuelle des personnages du brief : leur manière de se battre, de travailler, de bouger), pas seulement l'effet obtenu.
- **`dialogue`** : voir « Les répliques » ; l'échange qui tient en 15 s est UN plan.
- **`montage`** : une **série de brefs moments** qui se répondent sous une même idée (des lieux, des personnages ou des gestes différents, enchaînés vite). C'est le cas où **plusieurs lieux se regroupent dans un seul plan**, avec une coupe interne par moment (environ 2 s chacun, `plan-h3` écrira les coupes) : quatre moments de 2 s sont UN plan de 8 à 10 s, pas quatre plans de 10 s. Dis dans la description les moments, dans l'ordre, et ce qui les relie.
- **`contemplatif`** : un lieu, un état, qu'on laisse respirer. Peu de plans, longs, rien ne se presse.
- **`tension`** : une montée ou un basculement. **Il s'amorce** : un changement brutal (une menace, une rupture) est précédé, dans le plan d'avant, de son premier signe visible ; sans cela le plan qui bascule paraît tomber du ciel.

L'**ambiance** est le cadre visuel tenu sur **toute la scène** : moment de la journée, météo, lumière générale (« plein jour, ciel dégagé », « nuit, pluie fine »). Tous les plans d'une scène la partagent ; elle change **d'une scène à l'autre**, jamais au hasard d'un plan. Un changement d'ambiance à l'intérieur d'une scène (le ciel qui se couvre) est un événement : écris-le dans la description du plan où il a lieu.

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
- Toutes les durées sont des entiers de **5 à 15**, dans la fourchette du rythme du brief. Aucun plan de 4 secondes ou moins.
- Le total des durées est à ±20 % de la durée visée du brief.
- Chaque scène a un genre et une ambiance ; un montage de moments brefs est un seul plan, pas un plan par moment ; un basculement est amorcé par le plan qui le précède.
- Aucune paire de plans consécutifs ne pourrait se fusionner en 15 secondes (même lieu, même temps, mêmes personnages) : sinon, fusionne-les.
- Aucun plan ne renvoie à un autre plan, et aucune description ne contient de cadrage, de lumière, de son ni de mouvement de caméra.
- Chaque réplique a un locuteur, un texte exact, et est rattachée à un plan.
- Un plan dialogué laisse au moins 2 s de marge sur ses répliques ; s'il déborde, il est coupé à une frontière de sens.
- Une scène dialoguée n'est pas filmée d'un seul point de vue.
- Les rimes déclarées du brief sont traduites dans les deux plans concernés.
- Tes ajouts par rapport au brief sont listés dans `inventions`.
