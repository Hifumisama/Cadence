# Backlog Cadence

Un entonnoir : **Idées → Prochain → En cours**. Une idée qui arrive pendant un chantier va dans « Idées » en une ligne, sans être codée ni discutée. Le tri a lieu le dimanche ou entre deux chantiers. Le détail de ce qui est fait vit dans git (`git log`), pas ici.

Risque : **faible** / **moyen** (creuser le besoin avant de coder) / **haut** (argumentaire et preuves).

## En cours (1 au plus)
Chaque chantier a sa fiche : problème · réussi si… · on arrête si… · budget (soirées) · étape 1 testable en vrai.

- *(à choisir au prochain tri)*

## Prochain (3 au plus)
1. **Leçons du film 264 pour le scénariste et le scénario** (moyen). Le film le plus abouti ; plans 1 à 5 sans retouche. À traduire en règles :
   - un moment a de la substance : une action au résultat visible, puis une révélation (plans 6-7) ;
   - raccords : un court passage entre deux lieux, une action continue passe en `suite` (8→9) ;
   - pas d'effet visuel gratuit (plan 10) ;
   - le résultat d'une action importante se décide dans l'entretien et se construit sur plusieurs plans (la fresque) ;
   - le titre se raccorde à l'avant-dernier plan, jamais un plan isolé (plan 12).
   - Avec les retours T20-T23 : questions « X ou Y » en réponses rapides ; carte palette dès qu'une tenue ou un décor n'a pas ses couleurs.
2. **Affiche** (faible) : passer le décor principal en 2ᵉ source. Le titre mal écrit (« Pieé ») venait de Qwen : revoir avec H3 Image, qui écrit le texte proprement, avant de le poser par l'app.
3. **Phase 6 du projet 259** : rejouer un projet complet de bout en bout après les phases 1 à 5.

## À valider par toi (codé, pas encore vu en vrai)
- **Images en MiniMax H3 Image** (2026-11-23, remplace Krea 2 et Qwen Image Edit) : 3 rendus GPU, une génération 16:9, une édition d'une image seule, une édition à 4-6 sources ; câblage (sortie à 1 MP, ~1 min), la qualité est à toi. Puis **l'encodeur `int8_convrot` côté vidéo** (2ᵉ commit) : un rendu vidéo.
- **Refonte de la conception** : tests T16 à T23. Jamais vu en vrai : la carte de questions (le scénariste a posé des questions ouvertes à ces tours). Une fois, la page ne s'est pas rafraîchie seule en fin de tour.
- **Machine à états de revue** (31b0cee) : un projet créé par l'installateur et un « Itérer » sur un clip. Ensuite, supprimer la colonne `coche` (faible).

## Bouche-trous (moins de 30 min, pour les attentes de rendu)
- `npm run lint` cassé : `next lint` n'existe plus, aucune config ESLint.
- Regénérer les assets repassés « sans image » (projets 208 et 210, en local).
- Affichage des dialogues en “ ” dans les vignettes et le tiroir (affichage seulement ; changer le stockage = haut risque).

## Idées (boîte de réception, non triées)
- Rejouer avec H3 Image les cas « ne pas éditer » hérités de Qwen (absence, changement de point de vue) : H3 reconstruit une scène autour d'une référence.
- Carte d'un monde inventé : la règle « aucun texte » venait des lettres illisibles de Krea ; H3 écrit proprement.

## À décider avec toi
- **Limite de 3 personnages qui parlent par plan** (`scenario-episode`, `scenario-scene`) : garder, relever ou retirer, maintenant que les voix n'existent plus. Ni le paquet ni le guide H3 n'imposent de limite.
- **Relecture du scénario** : chantier à part entière (3 propositions appliquées sur 9). À cadrer avant toute décision.

## Plus tard
- **Qualité** (haut, preuves et jugement de l'utilisateur) : densité d'information par durée de plan ; template de prompt pour les références de décor (plusieurs vues) ; prompts d'assets (guides H3 Image) ; quantité de dialogue par clip (GPU).
- **Réflexion approfondie à la création** (moyen, GPU) : tester d'abord `enable_thinking: true` sur UNE scène, puis option par création et `max_tokens` relevé.
- **Éditeur de répliques** (locuteur, texte, ordre, voix off). Une réplique Open H3 IR = `{text, language, speaker_hint, voiceover}`, sans repère de temps.
- **Temps estimé du squelette** de la création (demande les mesures du journal worker).
- **Bugs à reproduire** : états non rechargés (montage), dialogues mal pris en compte, navigation pendant une création inachevée.
- **Fidélité par référence** (`plan_refs.retention`) choisie dans les cases de références : décrire une variante au lieu de créer un asset. Moyen (jugement visuel).
- **Rework des skills** : retirer `references-plan`, fusionner `accroche-scenariste` dans `conversation-agent`, `scenario-scene` avec `scenario-episode` (banc d'abord), alléger les SKILL.md (162 Ko).
- **Recréation des docs** : 6 pages courtes. À trancher avant : « une seule tâche GPU à la fois » contredite dans le code ; VID_REF2VA ou chaîne en trois étapes ; « plan » ou « clip ».
- **Tests e2e**.

## Feuille de route : chantiers futurs (ne pas lancer sans demande)
Chacun se cadre avec l'utilisateur avant de coder (risque classé à ce moment-là).
- **Musique avec YuE2** : partition ABC, skill `yue2-music`, montage figé puis musique calée sur les durées ; carte musique de l'entretien (maquette C5). Poids CC BY-NC : pas d'usage commercial.
- **Films longs découpés en séquences** d'environ 1 min (jauge de matière et « Propose-moi la suite » par séquence).
- **« Et si… »** (maquette C6) : enrichissements à cocher proposés par le scénariste.
- **Vignette d'ambiance** (maquette C8) : une image brouillon d'un lieu pendant l'entretien (GPU, touche au storyboard).
- **Storyboard (animatic)** : une image par plan ou par prise, vue Lecture.
- **Densité de découpage par plan** donnée par le scénario (T15 : le nombre de prises suit l'intensité).
- **Latents et chaîne de plans** (machine distante).
- **Banc de skills** : scènes types, un banc par skill, audit de pertinence.
- **Bouton « vérifier le GPU »** dans l'interface.

## Repères (ce qu'on a mesuré, à ne pas refaire)
- **Prod** : un push sur `main` redémarre la prod via Watchtower ; l'arrêter avant de pousser quand une migration de données se fait à la main.
- **Open H3 IR** : 1 traduction + 1 à 3 essais de compilation ; 92 % des fiches en un essai, 87 s en moyenne (81 compilations).
- **Rythme** (13/11, 25 projets) : le rythme demandé ne change pas la durée des plans ; d'où son retrait de l'assistant.
- **Temps de préparation** : aucune formule (3 à 16 min pour 1 min de film) ; le clap donne les quartiles des 12 dernières.
- **Bancs du 17/11** : « extreme » donne la caméra cache-misère (« Équilibrée » recommandée) ; une musique sur des plans liés reste continue grâce au latent ; le nombre de prises se règle selon l'intensité.
- **Guillemets « »** : fonctionnels (4 regex et les skills `scenario-*`), H3 ne les reçoit jamais.

## Gardé après examen
- **Repli LLM `references-plan`** (2026-11-13) : 1 appel utile, coût faible. À réévaluer si l'usage reste à zéro.

## Refusé, avec la raison
- **Vue SQL `v_taches`** : la complexité de `listerTaches` est dans les mappeurs par type, les lots et la fenêtre de création, pas dans les 6 requêtes.
- **Séparer le dépôt en deux** : gain faible, coût de synchronisation élevé.
- **Tailwind, bibliothèques structurantes** (file de tâches, machine à états, zod sur les sorties LLM) : aucune ne remplace proprement l'existant.
- **Découpage technique du scénario** (banc du 2026-11-16, abandonné) : la prose actuelle gagne 3/3 en vidéo à l'aveugle ; le format en champs appauvrit l'écriture. Pistes non testées si le sujet revient : une vue dérivée de la prose (la lire, pas la contraindre), la liste de shots extraite de la fiche Open H3 IR pour relire avant de rendre. Essais dans `essais/decoupage/`.
