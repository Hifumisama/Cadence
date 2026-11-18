# Backlog Cadence

Ce qu'on décide ensemble. Mis à jour à chaque point d'étape. Risque : **faible** / **moyen** (creuser le besoin avant de coder) / **haut** (argumentaire et preuves).

## En attente d'un essai réel de l'utilisateur
- **Machine à états de revue** : fait (31b0cee, migrations 0085 et 0086). Reste à vérifier à la main : un projet créé par l'installateur et un « Itérer » sur un clip.
- Ensuite, **supprimer la colonne `coche`** (devenue « appliqué par défaut », recalculable). Faible.

## Production : mise à niveau faite le 2026-11-13
Migrations 0085 à 0087 et rangement des images d'assets par projet appliqués (un push sur `main` redémarre la prod via Watchtower : l'arrêter avant de pousser quand une migration de données est à faire à la main ; le script de rangement est dans l'historique git, `git log -- scripts/migrer-assets-par-projet.ts`).
Nettoyage fait (sauvegardes du NAS supprimées, script retiré du dépôt). Reste : regénérer les assets repassés « sans image » (projets 208 et 210 en local).

## À faire, décidé
- **Validation côté serveur (zod)** des server actions : en cours (branche menage/zod).
- **Corrections de la cartographie du projet 259** (2026-11-17). Le projet a été mené de bout en bout sans retouche : 54 problèmes relevés, page https://claude.ai/artifact/GfHq9Bg4fgTXE5YyNq6KBf. Plan en 6 phases. Cahier de tests : https://claude.ai/artifact/BsEvsY43RMmMfbgmZTx64D.
  - **Décisions de l'utilisateur :**
    - l'affiche attend l'image du héros, et elle est abstraite si l'histoire n'a pas de personnage ;
    - la durée demandée est un plancher strict ;
    - la réflexion est gardée pour le scénario et le scénariste, si la qualité suit.
  - **Phase 1, faite et validée par l'utilisateur :**
    - course au lancement des fiches ;
    - guillemets droits ;
    - gabarits de planches posés par le code (`lib/assets/sheet-templates.ts`) ;
    - affiche faite à partir du héros (`poster-clap.ts`, déclenchée à l'adoption de son image) ;
    - contrôles de l'inventaire et de la liaison du premier plan.
  - **Phase 2, faite et validée :** détecteur « rien ne bouge » (`lib/agents/stillness.ts`), branché sur `scenario-scene` et sur la relecture.
  - **Phase 3, faite :** l'état d'un personnage ou d'un décor part toujours de l'image de son parent (`editionImposee`, `lib/assets/asset-state.ts`), à trois endroits :
    - la proposition du prompt, qui impose l'édition ;
    - le lot d'images, où l'état attend le parent ;
    - l'essai depuis la fiche, qui prend l'image du parent comme base au lieu de partir de zéro.

    Cause du décor infernal raté (A8) : l'essai manuel était parti sans base, donc de zéro.
  - **Phase 4, faite :**
    - **Ce qui ne marchait pas :** une citation de l'utilisateur prouvait n'importe quelle section dès qu'elle figurait mot pour mot dans ses messages. Exemple : « Elle se mouille de noir » prouvait à la fois `personnages`, la tenue et les raccords.
    - **La règle :** une citation prouve `lieux`, `elements` ou un détail seulement si elle le nomme (son nom ou un mot de son thème) ; sinon, `deduit`.
    - **Le message de fin :** `suppositions` liste aussi les détails non dits.
    - **Le skill `notes-entretien`** : règles 13 et 14.
    - **Limite :** les cheveux, la voix et la gestuelle n'ont pas de statut par champ et ne sont donc pas encore signalés.
  - **Reste :**
    - phase 5 : scénariste, scénario et durée plancher, via le banc avec réflexion. Les points 5.1 et 5.3 sont commités (45ff79b). Faits ensuite (2026-11-17 et 18, non commités, à juger en T16 et T17) :
      - **Bancs jugés.** T12 : le film 261 rejoué est « mieux ». T13 : la créativité « extreme » donne la caméra cache-misère ; « Équilibrée » devient « Recommandée », extreme est réservé à une scène forte. T14 : une seule description de musique sur des plans liés donne un seul morceau continu, grâce au latent. T15 : on ne fixe pas le nombre de prises, il se règle selon l'intensité.
      - **Musique du film :** section `musique` du brief (entretien), posée par le code sur la `non_diegetic_music` de chaque plan compilé (`lib/h3ir/music.ts`). Elle n'a ni début ni fin et reste sous les bruitages ; « Sobre », sans musique, est respecté.
      - **Scénario :** règles de mouvement du banc C, variété des gestes d'un plan à l'autre (avec un contrôle par le code, `gestesRepetes`), coupe quand l'action change, temps fort en un seul plan rapide, aucun événement hors des moments, film qui finit sur le dernier moment (aussi dans la relecture).
      - **Durée plancher :** de la cible à +20 % (`bornesDuree`), dans le contrôle du scénario, l'ajustement des scènes et la relecture.
      - **Scénariste :**
        - il repère un changement de direction (`changementsDeFiche`), le dit et demande quoi garder ;
        - un changement de ton ou de cœur remet la séquence à valider ;
        - un sujet par message, avec ses questions groupées et numérotées ;
        - il demande comment montrer le temps fort et propose figurants ou public ;
        - un élément de décor reste dans le lieu.
      - **Interface de l'entretien :** fiche de notes remise dans un ordre lisible, carte de la séquence (« Par actes » en trois tiers indicatifs, ou « Plans directs »), popup « Synopsis du film ».
      - **Plus tard :** le scénario pourrait donner une densité de découpage par plan ; le composant de séquence n'apparaît pas encore dans le chat.
      - **5.1, banc mouvement** (`essais/mouvement/`), 4 versions de la bascule du 259 jugées à l'aveugle. Classement de l'utilisateur : règles + réflexion > calibré > actuel > règles sans réflexion. « Même C bouge peu » : la fiche disait « statique ». Rendu de C dans la scène « Banc · bascule · C » du 259, à juger (T10).
      - **Détecteur corrigé :** les pronoms ne comptaient jamais, et il fallait le nom complet (« Tifa » pour « Tifa Lockhart »).
      - **5.3, scénariste qui creuse :** section `moments` (1 pour 10 s, validés ou délégués par l'utilisateur, plafond de 20 messages), proposée par le scénariste, transmise au traitement puis aux scènes ; plus de « statique » comme qualité d'un personnage. À tester en rejouant l'entretien (T9).
    - phase 6 : rejouer le projet complet.
  - **Refonte de la conception (2026-11-18)**, plan en 6 étapes. Cause : sur le projet 262, l'entretien avait changé le genre alors que la barre d'étapes affichait l'ancien.
    - **Étape 1, faite (non commitée, à juger en T18) : le cadre a une seule source.**
      - Le formulaire ne pose que le cadre : Durée, Langue, Style, Mise en scène, et une nouvelle étape Musique (aucune / discrète / présente, avec une référence facultative).
      - Le genre se trouve dans l'entretien. Il est relu de la fiche par l'affiche, le clap et la lumière (`genreDuFilm`).
      - **Garde-fou :** les notes n'écrivent plus `style`, `langueDialogues`, `dureeEpisodeSecondes` ni `rythme` (`SECTIONS_CADRE`, `verrousDeConception`), et `demandesSurLeCadre` relève ce que le modèle a voulu changer, pour l'étape 2.
      - **Musique :** « aucune » met N/A sur chaque plan, quelle que soit la créativité ; « présente » n'est plus mise sous les bruitages (`sectionMusique`).
      - **Projets existants :** ils gardent leur genre, qui reste figé à la main dans le Brief.
    - **Étape 2, faite (non commitée, à juger en T19) : carte « changement de direction ».**
      - Le code construit la carte (`lib/agents/chat-change.ts`) à partir des changements de l'histoire (`changementsDeFiche`) et des demandes sur le cadre (durée, langue) citées dans le dernier message (`pointsCadre`).
      - La carte voyage avec la tâche du tour et se stocke sur le message.
      - « Garder l'ancien » remet l'histoire d'avant, dépendances comprises ; « Prendre le nouveau » écrit le cadre dans la conception, et le ruban suit ; « Un mélange… » prépare la réponse. Le choix part ensuite comme un message ordinaire.
      - Le style n'est pas modifiable par la carte : il se change depuis le Brief.
      - Essai réel sur le projet de test 263 « Le Gâteau Raté » : conforme.
      - **À surveiller :** une fois, la page ne s'est pas rafraîchie seule à la fin d'un tour.
      - **Retours du premier essai, corrigés :**
        - le message envoyé par un bouton de la carte n'apparaît plus en bulle ; seule la ligne « ✓ » de la carte reste, et les modèles lisent toujours le texte ;
        - la carte dit exactement ce qui change : « Mia (personnage) · tenue », « moment 3 » (`pointsDetailles`). Avant, sur le projet 264, elle affichait « La jeune femme → La jeune femme » ;
        - « L'essentiel » montre tous les essentiels : histoire, fin, genre, style, rythme, durée, héros, moments ;
        - le ruban de la page Création et l'accroche de l'affiche (les premiers mots du genre) suivent le nouveau formulaire.
    - **Étape 3, codée (non commitée, à juger en T20, pas encore essayée en vrai) : questions groupées.**
      - Champ `questions` dans la sortie du scénariste : un sujet, trois questions au plus, 0 à 4 réponses rapides chacune (`lib/agents/chat-questions.ts`).
      - Carte `ChatQuestions` : réponses rapides et un champ « Autre » toujours présent ; « Répondre » envoie « 1. … 2. … ».
      - Les modèles relisent les questions dans l'historique (`contenuPourLlm`).
    - **Étapes 4, 5 et 6, faites (non commitées, à juger en T21 à T23).** Codées dans un worktree pendant les compilations du 264, puis ramenées.
      - **5, temps fort :** une étoile par moment sur la carte de séquence. « Valider » envoie le temps fort choisi, et le CODE reprend alors exactement la liste de la carte, le temps fort marqué « (temps fort) » (`sequenceValidee`). Cette marque suit jusqu'au traitement puis aux scènes (règle 9 de `scenario-scene`), et le Synopsis la montre en or.
      - **6, jauge de matière** sous la séquence proposée : 10 s par moment, sur la durée visée ; cases en pointillés pour ce qui manque, et « Propose-moi la suite ».
      - **4, palette :**
        - `tenue.pieces` et `tenue.nuancier`, `aspect.nuancier` dans les schémas du brief et des notes (`lib/agents/palette.ts`) ;
        - cartes de choix « palette » avec de vraies pastilles et « Propose-m'en d'autres » ;
        - le prompt d'un personnage est composé à partir des pièces ;
        - les valeurs hex ne passent jamais dans un prompt (`sansHex`) ;
        - pastilles dans le Synopsis.
      - **Essai réel sur le 263 :** temps fort déplacé sur le moment 9, puis validé : la fiche le marque. Palette proposée avec vraies couleurs ; choisie : tenue enregistrée en 2 pièces + nuancier.
      - **Pas encore vu en vrai :** la carte de questions (le scénariste a posé une question ouverte à ces tours).
    - **Retours du test sur le projet 265 « La lettre au vent », corrigés :**
      - **Fin de l'entretien.** Les réponses données dans la carte de questions ne nommaient pas leur sujet (« Des plis bien marqués »), donc ne prouvaient pas le détail : chaque ligne porte maintenant le sujet (« La lettre — … »). Et « on peut s'arrêter là » clôt l'entretien dès que l'essentiel est tranché (`arretDemande`).
      - **Brief coupé net.** La 10ᵉ réponse, « Propose-m'en d'autres », a rendu la fiche complète, et le code a annoncé « briefing prêt » à la place de la réponse du scénariste. Désormais, une question ou une demande au scénariste (`demandeAuScenariste`) reçoit d'abord sa réponse, et l'état « prêt » suit quand même.
      - **Messages des cartes.** Une séquence validée, des réponses aux questions, une palette choisie, « Propose-m'en d'autres » ou « Propose-moi la suite » s'affichent en ligne discrète « ✓ … » au lieu d'une bulle (`via`, `lib/agents/chat-trace.ts`) ; les modèles lisent toujours le texte complet.
    - **Projet 264, plan 12 vide à l'écran :** sa description tenait en une ligne « Consigne de l'auteur : … », que l'affichage masque. Corrigé : si le plan n'a que la consigne, elle sert de récit, à l'écran comme pour les références (`sansConsigneAuteur`). Les skills de scénario écrivent toujours le récit d'abord.
    - **Reste :**
      - 4, palette structurée (tenues, puis décors) ;
      - 5, temps fort cliquable sur la carte de séquence ;
      - 6, jauge de matière avec « Propose-moi la suite ».
    - **Reportés :** « Et si… », la carte musique (chantier YuE2), la vignette d'ambiance.
  - **Vu à l'essai GPU de l'affiche :** titre mal orthographié par Qwen (« Pieé ») et décor absent, puisque seule l'image du héros est donnée en source. Pistes : passer le décor principal en 2ᵉ source, et poser le titre par l'app au lieu de le faire écrire par le modèle.
  - `npm run lint` est cassé depuis longtemps : `next lint` n'existe plus et il n'y a pas de configuration ESLint.

## Retours du test en profondeur (2026-11-13)
Lot rapide fait : onglets Assets/Tournage inversés, bouton « Retour au clap » retiré, état « Intention seule / Fiche rédigée » dans le tournage, prévisualisation en lot depuis le tournage, liste « Hors montage » plafonnée (~4 rangées), plans liés (« suite » / « suite rompue ») dans le montage.
À faire, dans l'ordre convenu :
- **Vérifications faites** : le ton n'était qu'un mot dans le brief (retiré, voir ci-dessous) ; Open H3 IR = 1 traduction + 1 à 3 essais de compilation (1 écriture + 0 à 2 corrections chacun), 92 % des fiches en un seul essai, 87 s en moyenne (81 compilations en local) ; le rythme fixe la durée cible des plans dans les skills de scénario (`PLAGES_RYTHME`) et le nombre de plans estimé.
- **Création, fait** : écran « Premier jet complet » (scènes, plans, durée, bouton « Voir le scénario ») à la place de l'écran des intents et du clap final ; l'écriture des fiches se fait depuis le Tournage. Slider et mot de ton retirés (le brief `genreTon` ne contient plus que les genres ; `genreTon` reste figé par la conception, à rouvrir si on veut que l'entretien y note le ton de l'histoire).
- **Rythme retiré de l'assistant** (2026-11-13) : mesuré sur 25 projets, le rythme demandé ne change pas la durée des plans (« rapide » donne 8-10 s en moyenne comme « lent »), et la durée visée est manquée de 10 à 50 %. Tout nouveau projet est en « variable », l'écran Durée dit que c'est un point de départ, le clap donne « ≈ N à M plans ». Les skills gardent leurs règles par rythme (anciens projets) ; à simplifier si on veut.
- **Cahier de tests du 2026-11-13** : tous les tests passés et validés par l'utilisateur, fichier supprimé.
- **Temps de préparation** (fait) : pas de formule (3 à 16 min pour 1 min de film, autant pour 2 min : la durée du film n'explique rien) ; le clap dit « de X à Y min » d'après les 12 dernières préparations terminées (quartiles, 3 mesures minimum).
- **Guillemets des dialogues** (étudié, non codé) : les « » sont fonctionnels, 4 regex (`lib/h3ir/brief.ts`, `lib/clips/intent.ts` ×2, `lib/clips/intent-reading.ts`) et les skills `scenario-*` les imposent ; H3 ne les reçoit jamais (texte sans guillemets). La vue Lecture n'affiche déjà aucun guillemet. Changer le stockage = haut risque ; seul un changement d'affichage (ex. “ ” dans les vignettes et le tiroir) est sûr.
- **Dialogues saisis à la main** (fait 2026-11-13) : une ligne `NOM : "réplique"` (guillemets droits ou typographiques) est convertie en `NOM : « réplique »` à l'enregistrement (Lecture et fiche scénario) ; seules les lignes entières de cette forme sont converties. Reste : un éditeur de répliques (locuteur, texte, ordre, voix off). Doc Open H3 IR : une réplique = `{text, language, speaker_hint, voiceover}`, **sans repère de temps** ; l'ordre est respecté et le « quand » est décidé par le rédacteur d'après le récit (« elle parle en fin de plan » dans le récit est le seul levier). Aucune limite de locuteurs dans le paquet ni dans le guide H3 (identifiants `(S1)`, `(S1,S2)`) : le « trois personnages qui parlent » est une règle de nos skills, à lever ou relever après un test vidéo (GPU).
- **Réflexion approfondie à la création** (étudié, non codé) : défaut `enable_thinking: false` (`lib/llm/config.ts`) et `--reasoning off` dans les profils llama-swap ; mesures anciennes : la réflexion pèse ~90 % des jetons, 110 s par clip, `scenario-episode` 151 s, un timeout de 600 s atteint. À faire : tester d'abord `enable_thinking: true` sur UNE scène (le flag serveur le réactive-t-il ?), puis colonne sur `creations_projet` + option des runs + relèvement de `max_tokens` ; GPU, à lancer avec l'utilisateur.
- **Création, reste** (moyen) : ~~durées initiales variables~~ fait ; temps estimé du squelette (demande des mesures du journal worker) ; mode de réflexion plus longue en option ; guillemets des dialogues (attention : Open H3 IR lit un `"` comme du texte à afficher, `nettoyerIntent` les remplace par `'` dans l'intent traduit).
- **Qualité** (haut, avec preuves et jugement de l'utilisateur) : densité d'information par durée de plan (exemples d'inventions à fournir) ; **template de prompt explicite** pour les références de décor (plusieurs vues) et pour l'affiche ; prompts d'assets (guide Qwen Image Edit) ; quantité de dialogue par clip (plafond mesuré, GPU).
- **Bugs à reproduire** : états non rechargés (montage), dialogues mal pris en compte, navigation/redirections (accès aux autres pages pendant une création inachevée).

## À décider avec l'utilisateur
- **Limite de 3 personnages qui parlent par plan** dans les skills `scenario-episode` / `scenario-scene` : garder, relever ou retirer, maintenant que les voix n'existent plus.
- **Relecture du scénario** : chantier à part entière (étape de l'installateur, 3 propositions appliquées sur 9). À cadrer ensemble avant toute décision.

## Idées retenues (utiles, pas lancées)
- **Fidélité par référence** (`plan_refs.retention`) choisie dans les cases de références du clip : `fully_preserved`, `partially_preserved`, `attribute_transfer`, `weak_reference`. Intérêt : décrire une variante au lieu de créer un asset (`partially_preserved`), « équiper » un personnage (`attribute_transfer`), limiter le nombre d'assets. Moyen (jugement visuel).

## Plus tard
- **Rework des prompts (skills)** : étude faite (1 échec sur 1187 runs ; le tool calling n'apporterait rien). Pistes : retirer `references-plan`, fusionner `accroche-scenariste` dans `conversation-agent`, `scenario-scene` avec `scenario-episode` (banc de comparaison d'abord), alléger les SKILL.md (162 Ko).
- **Recréation des docs** : brouillon de 6 pages courtes préparé (6 pages dans docs/, squelettes sourcés). À trancher avant : règle « une seule tâche GPU à la fois » contredite dans le code, lequel de VID_REF2VA ou de la chaîne en trois étapes est actif, « plan » ou « clip » dans les vues.
- **Tests e2e** (chantier différé).

## Feuille de route : chantiers futurs (ne pas lancer sans demande)
Chacun se cadre avec l'utilisateur avant de coder (risque classé à ce moment-là).

- **Chantier musique avec YuE2.**
  - Partition ABC et skill agentique `yue2-music`.
  - Montage figé, puis une musique calée sur les durées des plans.
  - On y rattache la **carte musique** de l'entretien (maquette C5), reportée le 2026-11-18.
  - Les poids sont sous licence CC BY-NC : acceptés tant qu'il n'y a pas d'usage commercial.
- **Films longs découpés en séquences** d'environ 1 minute.
  - Pour les films de 10 minutes et plus : la jauge de matière et « Propose-moi la suite » s'appliqueraient par séquence.
  - À cadrer : comment l'entretien enchaîne les séquences, et ce que le traitement en fait.
- **« Et si… »** (maquette C6) : le scénariste propose des enrichissements à cocher (public, décor qui réagit…), ajoutés comme si l'utilisateur les avait dits. Reporté le 2026-11-18.
- **Vignette d'ambiance** (maquette C8) : une image brouillon d'un lieu pendant l'entretien, pour vérifier qu'on voit la même chose. Coûte du GPU, et touche au storyboard.
- **Storyboard (animatic)** : une image par plan ou par prise, une animatic bon marché, la vue Lecture du scénario.
- **Densité de découpage par plan** donnée par le scénario (banc T15 : le nombre de prises doit suivre l'intensité).
- **Latents et chaîne de plans** (sur la machine distante).
- **Banc de skills** : des scènes types, un banc par skill, un audit de pertinence.
- **Bouton « vérifier le GPU »** dans l'interface.

## Fait (2026-11-12 et 13)
Reset CSS condensé · Assets rangés par projet (260 images, local) · Docs retirée · `lib/` par domaines · noms de fichiers et commentaires en anglais · plan-h3 retiré · scripts jetables retirés · knip + CI · `.claude/` et `CLAUDE.md` refaits · robustesse (boucle vidéo, upload d'asset, délais ComfyUI) · notifications navigateur retirées · manuel du montage en popup · voix retirées · classes CSS mortes retirées · `service.ts` et `requests-db.ts` scindés · tests sur base jetable · propositions simplifiées.

## Gardé après examen
- **Repli LLM `references-plan`** (décidé le 2026-11-13) : 1 appel utile (plan drone sans décor nommé), coût faible. À réévaluer si l'usage sur les nouveaux projets reste à zéro.

## Refusé, avec la raison
- **Vue SQL `v_taches`** : la complexité de `listerTaches` est dans les mappeurs par type, les lots et la fenêtre de création, pas dans les 6 requêtes. Une vue ne la réduirait pas.
- **Séparer le dépôt en deux** : gain faible, coût de synchronisation élevé.
- **Tailwind, bibliothèques structurantes** (file de tâches, machine à états, zod sur les sorties LLM) : aucune ne remplace proprement l'existant.
- **Découpage technique du scénario** (étudié et banc le 2026-11-16, abandonné ; essais non suivis dans `essais/decoupage/`) : fiche par scène/plan en champs (enjeu, repères, temps, cadres, positions), prose recollée par le code pour Open H3 IR. Mesures (3 scènes, une seed, modèle `qwen3.8-27b-swift1.5-mtp`) : JSON valide 20/20 ; découpage jugé plus lisible (4 contre 2-3) et cadres tenus à 100 %, **mais la prose actuelle gagne 3/3 en vidéo à l'aveugle**, y compris contre une version sans caméra imposée (B′). Cause : le format en champs appauvrit l'écriture (2-3 actions courtes par plan contre une dizaine de micro-gestes dans la prose), et H3 a besoin de cette densité ; imposer cadres et nombre de shots fige en plus le rendu. Vue 3D (coordonnées en mètres, caméra calculée) : vue de dessus lisible, vue caméra illisible (gros plans sur mannequins, cadres monotones du modèle). À retenir si le sujet revient : l'enjeu de scène (veut/contre/bascule) a été validé 3/3 ; une vue dérivée de la prose (la lire, pas la contraindre) et la liste de shots extraite de la fiche Open H3 IR pour relire avant de rendre sont les deux pistes non testées.
