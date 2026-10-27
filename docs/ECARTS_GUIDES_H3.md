# Écarts entre notre skill `plan-h3` et les guides officiels de MiniMax (2026-10-27)

Comparaison faite à la lecture : les deux guides officiels (base, et Ref2VA) du dépôt `MiniMaxAI/MiniMax-H3` sur Hugging Face, le skill officiel `h3-prompt-writing`, et les skills de production du dépôt GitHub `MiniMax-AI/MiniMax-H3` (`skills/`), contre `agents/skills/plan-h3/SKILL.md` et `lib/agents/plan-h3-assemblage.ts`.

Nos copies des guides (`docs/references/h3-guide-base.md`, `h3-guide-fullref.md`) sont **identiques** aux versions officielles (zéro ligne de différence, à la fin de ligne près). Rien n'est appliqué dans le skill : ce document dit ce qui diffère, ce qui reste à décider et comment le tester.

## Déjà conforme

- Les six sections dans l'ordre (`subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`), les étiquettes `<Subject N>`, `<Picture N>`, `<Audio N>`, les marqueurs de rétention.
- Le préfixe de tâche du résumé, **y compris `keyframe completion`** quand un plan est en raccord `suite` (`lib/plan-raccord.ts`) : c'est la taxonomie officielle.
- La voix de référence : `<Audio N> is the voice-timbre reference for … (Sx)` (`lib/agents/plan-h3-assemblage.ts`).
- La voix off : la formule exacte `says in an off-screen voiceover` et la bouche fermée après chaque `<d>` ; `<scenetrans>` et `<cutoff>`.
- Un style en tête, un soundscape et une musique décrits par leur instrumentation, leur tempo et leur dynamique, `N/A` seul.
- Les actions nouvelles d'un plan ne sont pas une perte de fidélité à la référence.

## Écarts, du plus intéressant au moins

1. **La formule de coupe.** Notre code écrit `At MM:SS.mmm, Hard cut to` à chaque coupe (`plan-h3-assemblage.ts`, ligne 237), et le contrôle de sortie **refuse** que le modèle écrive lui-même « the shot cuts to » ou « a hard cut to » (`plan-h3-controles.ts`, lignes 76 à 77 et 248). Le guide officiel n'emploie jamais « Hard cut to » : il donne « the camera cuts to », « the shot cuts to », « the shot transitions to », « the shot changes to », « the shot switches to ». C'est peut-être une formule héritée d'un prompt validé, mais elle sort de ce que le modèle a vu à l'entraînement. **Essai : E3 du cahier (variantes `K1` et `K2` du banc).**
2. **Le vocabulaire de caméra.** Le guide officiel fixe une liste : `Zoom In / Out`, `Push In / Pull Out`, `Pan Left / Right`, `Truck Left / Right`, `Tilt Up / Down`, `Pedestal Up / Down`, `Arc Shot`, `Tracking Shot`, `Static Shot`, `Shake Slightly / Strongly`, `POV`, `Roll Clockwise / Counterclockwise`, avec l'amplitude (`with small / large amplitude`) et la vitesse (`at slow / fast speed`), à n'ajouter que si elles comptent. Notre règle 2.11 emploie aussi `whip pan`, `swoop`, `dive`, `dolly in / out`, `crane up / down`, qui n'y figurent pas. Les termes officiels sont probablement mieux compris (ce sont ceux des légendes d'entraînement). Proposition : réécrire le vocabulaire de la règle 2.11 avec les termes officiels (`dolly` → `Push In / Pull Out`, `crane` → `Pedestal Up / Down`, `whip pan` → `Pan … with large amplitude at fast speed`, `swoop` / `dive` → `Pedestal Down at fast speed`), en gardant notre logique (jamais deux fois le même mouvement de suite, mouvement motivé).
3. **La description de la voix.** Le guide officiel demande, à la première apparition d'un locuteur, assez d'indices pour fixer son identité (type de personnage, âge, genre, à l'écran ou hors champ, hauteur, timbre, débit, accent), et de placer **hors du `<d>`** l'identité, l'identifiant, l'action et **la manière de dire** (« exclaims with light annoyance », « in a casual young male voice with a playful tone »), même quand une voix de référence existe. Notre règle 4 ne parle pas de la manière de dire : seuls nos exemples la montrent. La voix est un maillon faible connu (la doc officielle : l'audio converge tard, 12 étapes ou plus), donc des indications de timbre et de ton dans le prompt sont une aide gratuite. Proposition : une règle 4.9 « à chaque réplique, sa manière de dire (ton, débit, émotion) ; à la première apparition d'un locuteur sans voix de référence, une description stable de sa voix ».
4. **Les identifiants composés.** `(S1,S2)` pour deux locuteurs qui parlent ensemble : notre skill n'en parle pas.
5. **La longueur.** Le guide officiel vise 350 à 500 mots anglais pour `detailed_description` d'un plan de génération (le dialogue dense prime sur le décompte). Nous plafonnons le prompt assemblé à 7 000 caractères (définitions, rétention, shots, sons : environ 1 100 mots), ce qui est large. **À mesurer** sur de vrais plans (longueur moyenne de la partie `detailed_description` d'une fiche) avant de décider ; je n'ai pas pu le faire sans la base.
6. **Le texte visible.** Une enseigne, une bannière ou un sous-titre à l'écran s'écrit entre guillemets doubles, mot pour mot, sans traduction. Notre skill dit seulement que le texte à l'écran garde sa langue. Une phrase à ajouter.

## Idées tirées des skills de production de MiniMax

Elles viennent de `skills/3d-animation-short-generator/references/` (tableau de plans, ancrages, plan de repli, contrôle final). Ce n'est pas du format de prompt : c'est la façon dont MiniMax organise une production multi-plans.

- **Des « repères d'ancrage » par plan** (où tombent les repères de l'espace : la porte à gauche, la sortie par tel bord) et **un échelon de réessais** quand un clip dérive : 1) régénérer en citant le bloc d'ancrages dans le prompt ; 2) raccourcir le plan à 6 s ou moins et le couper en deux ; 3) changer de modèle ; 4) demander à l'utilisateur (alléger, sauter le plan, fournir une vidéo de référence). Proche de notre « État en fin de plan » et de notre plafond de durée ; l'échelon de réessais pourrait guider le comportement de `iteration-plan`.
- **Un contrôle final par liste** : cohérence des personnages, continuité de scène par rapport aux ancrages, intelligibilité du dialogue, synchro des bruitages, équilibre de la musique, absence de traces de storyboard.
- **Une seule musique pour tout le film**, posée à l'assemblage (« ne pas générer de musique par plan », la baisser sous les dialogues) : conforme à ce que nous avons décidé.

## Décisions en attente

Rien n'est modifié dans `agents/skills/plan-h3/`. Un banc à l'aveugle de 18 vidéos, fait le 20 octobre, a montré qu'un skill plus complet aide un modèle et en dessert un autre : un changement de skill se juge au rendu, pas à la lecture. L'ordre que je propose : E3 (formule de coupe) d'abord, parce que c'est un changement d'une ligne dans le code avec un essai de 5 minutes ; puis le vocabulaire de caméra et la manière de dire, qui demandent un essai de plans réels.
