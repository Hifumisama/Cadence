# 0001 — Open H3 IR est gardé, le style de mise en scène est retiré, la créativité devient un « temps fort » par plan

Statut : accepté (2026-11-24). Décidé avec l'utilisateur en séance de grilling, preuves à l'appui (banc à l'aveugle, 8 paires sur 8).

## Contexte

Cadence compile le prompt vidéo de chaque plan avec Open H3 IR (paquet Python `open-h3-ir`, appelé par `lib/h3ir/` et `scripts/h3ir/compiler.py`). Le formulaire de conception (étape « Mise en scène ») et le panneau de chaque plan exposaient trois réglages, hérités projet → scène → plan :

- une **créativité** à quatre crans : Sobre (`restrained`), Équilibrée (`balanced`), Audacieuse (`bold`), Extrême (`extreme`) ;
- un **style de mise en scène** : 7 réalisateurs du paquet (`director`) et 6 profils maison (`director_profile`) ;
- l'ancien skill `plan-h3` avait été retiré le 2026-11-12.

L'utilisateur donne des intentions, pas de la grammaire de cinéma, et veut garder la main sur sa création (parfois un découpage shot par shot). Il doutait de l'utilité d'Open H3 IR, de la créativité (« balanced et bold se ressemblent ») et du style (« lié au genre, que le formulaire ne connaît pas encore »).

## Ce que fait réellement le paquet (lecture du code, `h3ir/creativity.py`, `director.py`, `compile.py`)

- Open H3 IR est **un LLM qui écrit, encadré par du code** : environ 1 900 lignes de contrôles (`validate.py`), jusqu'à 2 tours de correction, une hiérarchie « consigne > images de référence > style > choix du modèle ». Ce n'est pas un gabarit.
- La créativité autorise des **ajouts** : `restrained` rien ; `balanced` de la musique ; `bold` et `extreme` musique, répliques et texte à l'écran. `extreme` ajoute en plus une **amplitude** : caméra « grande amplitude, rapide », cadrages extrêmes, contraste dur. Seuls `restrained` (plancher) et `extreme` (plafond) sont **contrôlés par le code** ; `balanced` et `bold` sont de simples consignes et « se ressemblent par conception » (commentaire de l'auteur dans `creativity.py`).
- Un style est **un paragraphe de prose** glissé dans la consigne du LLM, sans contrôle derrière.

## Mesures

- **T13 (2026-11-17)**, un plan rendu en 4 réglages, jugé à l'aveugle : balanced sans style > balanced + style > extreme + style > extreme sans style. La créativité est la cause principale ; le style ne joue pas dans un sens constant. `extreme` sur un film entier = « caméra pour rien ».
- **Banc du 2026-11-24** (`essais/open-h3-ir/` : dossier de travail local, non versionné, avec le script, les 12 prompts compilés, les vidéos et la clé de l'aveugle ; projet 268 « Banc · Open H3 IR », supprimé de la base une fois les tests terminés), 4 plans neufs de 10 s (phare, duel, cuisine, couloir à découpage imposé), 12 rendus, 8 paires jugées à l'aveugle (3 questions : intention, caméra, « je la garderais »), une seed par plan commune à ses bras :
  - **Banc A, Open H3 IR contre « LLM seul »** (même modèle, mêmes images, guide officiel H3 `ref-en.txt` en entrée, aucune règle ni contrôle) : **Open H3 IR gagne 4/4**. Remarques : duplication et incohérence d'actions avec le LLM seul, voix mal retranscrites, bruitage incohérent, glissade moins nette.
  - **Banc B, sans style contre avec style du genre** (Villeneuve, anime d'action, Wong Kar-wai, horreur lente) : **sans style gagne 4/4**. Remarques : duplication et incohérence (phare), lancière qui « pare avec sa tête » (duel).
  - Le « LLM seul » écrit sa fiche 2 à 3 fois plus vite (26 à 69 s contre 90 à 180 s) ; les trois bras respectent le découpage imposé du couloir.
- **Littérature** (résumés seulement, notes dans le même dossier local `recherche.md`) : un « prompt enhancer » apporte un gain net et mesuré contre la consigne brute (WanPE : +11 à +19 points de préférence humaine à 5-15 s) ; le critère décisif est de **garder l'intention** de l'auteur.

## Décisions

1. **Open H3 IR reste le compilateur** des fiches de plan. Le retirer reviendrait à remettre un LLM seul aux commandes, ce que le banc A a battu 4/4.
2. **Le style de mise en scène est retiré** : colonnes `plans.style_camera`, `scenes.style_camera`, `projects.style_camera`, les 7 réalisateurs, les 6 profils maison, leurs démos vidéo (`data/mises-en-scene/`), l'étape « Mise en scène » de `/nouveau`, la recommandation de style par style graphique, les réglages de scène et de projet.
3. **La créativité devient un seul choix par plan, « Temps fort »** (oui/non). Sans temps fort, un plan est compilé en `balanced`. Un temps fort est compilé en `extreme`. `bold` et `restrained` disparaissent (`bold` est indiscernable de `balanced` par conception ; `restrained` ne différait que par la musique, désormais décidée par la conception). Stockage : `plans.creativite` vaut `"extreme"` pour un temps fort, `null` ou `"balanced"` sinon. Les colonnes de créativité de projet et de scène sont supprimées : un plan qui héritait d'`extreme` d'un projet ou d'une scène repasse en `balanced`.
4. **Qui pose un temps fort** : le scénariste (skill `scenario-scene`) le pose sur le seul plan qui porte le moment marqué « (temps fort) » de la séquence ; l'utilisateur le bascule d'un clic dans l'atelier du plan (action `definirTempsFort`) ; l'agent d'itération (`iteration-plan`) peut le proposer ou le retirer. Un nouveau scénario ne retire jamais un temps fort posé à la main.
5. **La musique appartient à la conception**, plus à la créativité : intention « aucune » = `N/A` ; « discrète » ou « présente » = la musique du brief, même si le compilateur a écrit `N/A` (`lib/h3ir/music.ts`, `sectionMusique`).
6. **Règle pour qu'un réglage reste visible** : un banc à l'aveugle a montré qu'il change le rendu dans un sens prévisible, et on peut l'expliquer en une phrase à quelqu'un qui n'est pas développeur. Sinon, c'est une valeur par défaut, cachée.

## Ce qui est incertain

- **Le temps fort n'a pas eu de banc dédié.** `extreme` n'a été mesuré à l'aveugle que sur un film entier (T13, il avait perdu). Sur un plan précis, l'utilisateur l'a essayé à d'autres moments, hors banc, et le juge très utile pour mettre l'accent sur une action : c'est un retour d'usage, pas une mesure. Cela suffit pour garder l'interrupteur manuel et le placement d'un seul temps fort par scène par le scénariste ; si ce placement automatique se révélait mauvais à l'usage, le bon réflexe serait de retirer la pose automatique et de garder le bouton.
- Le banc est petit : 4 plans, une seule seed, un seul LLM (Swift 27B quantifié). Un 8/8 unanime laisse peu de place au hasard, mais ne dit rien des autres modèles ni des plans très longs.
- Les articles n'ont été lus qu'en résumé.

## Conséquences

- Migration `0089_open_h3_ir_simplifie.sql` : `restrained`/`bold` des plans deviennent `balanced`, puis les colonnes ci-dessus sont supprimées. **À lancer par base** (`npm run db:migrate`).
- Le code retiré reste dans l'historique git (le « cimetière des fonctionnalités »). Les bancs `essais/` qui lisent ces colonnes sont archivés et sortis du typecheck (`tsconfig.json`).
- Si un style de mise en scène revient un jour, il devra passer par un banc à l'aveugle d'abord, et être proposé **après** le choix du genre (l'entretien), pas dans le formulaire.
