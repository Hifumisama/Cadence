# Lexique de corrections H3 / Hailuo 3

> Chaque ligne a coûté un rendu. Source : production réelle de « Les Yeux de Rubis », épisode 1.
> Format : **symptôme → cause → formulation qui tient** · plan où c'est observé.
> Ce fichier grossit à chaque correction éprouvée (voir Étape 7 du skill). Ne pas y inscrire d'hypothèse non testée.

## §1 — Découpage et cadence

- **Plan d'action intense écrit en 1–2 shots → montage plat, peur ou énergie illisible.** La cadence de coupe doit suivre l'intensité, pas la durée. Course paniquée : un `[Shot]` toutes les 1,5–2 s, angles distincts (niveau des yeux, sol, canté de face, plongée arrière, plan large en hauteur, contre-plongée). Rendu bien plus dynamique et lisible qu'une prise unique · SHOT 23 (plan 310).
- **Shot sous ~1,5 s → H3 ignore le timecode brut et rallonge ou lisse le plan.** Répartir les durées avec des consignes explicites par shot et rester à 1,5 s minimum · plan 110.
- **Description en plusieurs temps sans `Hard cut` ni angles distincts → un seul mouvement lissé.** Chaque shot : `Hard cut`, timecode, angle propre · plans 110, 125.
- **Geste continu volontaire : à ne pas découper.** La gifle en un seul mouvement (plans 240+250+260) et la réception qui suit le saut (140+150) tiennent par la continuité ; les noter comme telles.
- **Calme par contraste.** Les plans d'écoute (330 à 360) ne tiennent que parce que la course qui les précède coupe vite. Écrire par paires : cadence rapide pendant la tension, cadence lente pour la retombée et la rime finale.
- **Grammaire de caméra proie / prédateur.** Proie : épaule, canté, angles bas, coupes courtes, foule qu'on percute. Prédateur : caméra verrouillée, cadre symétrique, foulée régulière, foule qui s'écarte · plans 310 vs 370.

## §2 — Lumière et état d'arrivée

- **Baisse de lumière décrite globalement → tout l'image va jusqu'au noir.** Décrire l'exposition comme constante entre deux événements datés, et faire porter chaque changement par un geste visible · plan 30.
- **Raccord de lumière entre deux `[Shot]` internes → ne tient pas.** Décrire séparément l'état de fin du premier et l'état de début du second, ou supprimer la coupe · plan 30.
- **Une `<Picture N>` n'est pas une première frame.** Une image qui montre un état à atteindre doit être déclarée comme état d'arrivée, sinon le modèle la pose dès l'ouverture et saute la construction.

## §3 — Consignes négatives

- **Une consigne négative produit ce qu'elle interdit.** Toujours reformuler en état voulu. Exemple : le mot `empty` dans une description de fin de plan suffit à vider la salle · plan 30.
- **Ne pas écrire « dague non visible ».** Écrire ce qui est visible : « les doigts se posent sur la lanière de cuir » · SHOT 24.

## §4 — Caméra et gros plans

- **Une mention de démarche ou de déplacement dans un très gros plan fait défiler le décor derrière le personnage.** Décrire la caméra comme verrouillée et le fond comme immobile dès qu'un plan est censé être fixe · plans 320, 330, 340.
- **Push-in ou dolly sur un reveal → le modèle « fonce » sur le sujet.** Interdire le mouvement sur les reveals en décrivant la caméra tenue puis un pan propre · plan 110.
- **Le vocabulaire de la précision rend un personnage immobile** (`planted`, `isolated`, `square`, `exact`, `contained`) : à éviter sur tout personnage en mouvement.

## §5 — Foule, figurants, décors

- **Les figurants au loin bavent en basse résolution.** Privilégier les cadrages où le premier rang est gros dans l'image, ou une vue de balcon proche plutôt qu'un plan d'ensemble lointain · SHOT 23.
- **Une référence de décor sans figuration ne peut pas être déclarée comme état d'arrivée : le modèle vide le plan de ses personnages.** Décrire l'état final en texte, et rendre la présence des figurants par ce que la lumière révèle (silhouettes en découpe contre une zone éclairée) · plan 30, SHOT 23b.
- **Un décor peuplé et un décor désert sont deux assets.** Une référence peuplée peuple aussi les plans qui devraient être vides : créer un dérivé du master plutôt que l'écraser · ruelles du bazar.

## §6 — Voix et durées

- **Une réplique trop longue ne se rattrape pas au montage.** Mesurer la durée des prises voix avant d'écrire le plan, et scinder si le cumul dépasse le plafond H3 (cas du 270 → 271/274/277).
- **Coupes d'un plan dialogué : les recaler sur les prises réelles, jamais l'inverse.** Placer la coupe sur une frontière de sens (juste avant la phrase clé) · SHOT 25.
