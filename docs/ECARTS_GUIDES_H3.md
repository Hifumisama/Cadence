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

## Revue des dépôts « Prompting » et « Agent skills » de l'index communautaire (2026-10-27)

Six lectures en parallèle, en lecture seule, de treize dépôts plus les skills officiels de MiniMax. Ce que les dépôts **affirment** : aucun rendu n'a été vérifié. Licences : voir la dernière colonne ; « inspiration » = reprendre l'idée, jamais le texte.

| Dépôt | Licence | Verdict | À en tirer |
|---|---|---|---|
| `ruashots/open-h3-ir` | Apache-2.0 | s'inspirer (les règles se reprennent avec attribution) | catalogue de plus de 100 règles de contrôle ; banc « l'exemple officiel doit passer + variantes défectueuses qui déclenchent chacune leur règle » ; confirme E3 |
| `unknowlei/minimax-h3-opencode-skills` | MIT | reprendre la liste de contrôle ; s'inspirer du planificateur | checklist de relecture en 9 rubriques ; registre de continuité en cinq colonnes (identité, costume et accessoires, espace et lumière, état des objets, dialogue et audio) |
| `SlavaSexton/ComfyUI-Agent-Kit` | Apache-2.0 | reprendre | tableau « symptôme → cause probable » pour `iteration-plan` ; méthode de validation d'un graphe ; faits d'exploitation H3 |
| `T8mars/comfyui-minimax-h3-prompt-enhancer-T8` | tous droits réservés | inspiration seulement | correction déterministe du format `(Sx)` ; grille de mécanismes de caméra de combat (non officielle) |
| `T8mars/minimax-h3-prompt-skill-T8` | MIT, contenus CC BY 4.0 | inspiration | format de règle « invariant / échec si on l'enlève » ; principes de combat |
| `BeatAPI/awesome-minimax-h3-prompts` | prompts non relicenciés | inspiration | caméra du même côté de l'axe ; un accessoire « ONE » à dimensions mesurées ; réplique bornée en secondes puis bouche fermée |
| `benjiyaya/Minimax-H3-Prompt-AgentSkill` | ambiguë (MIT annoncé, pas de fichier) | inspiration | verrou de couleur par personnage ; vecteurs d'action ; exemples de combat |
| `1038lab/ComfyUI-MiniMax-H3-Promptor` | GPL-3.0 | inspiration | rappel explicite de placer chaque balise dans la phrase d'action ; garde-fous de post-traitement |
| `ethanfel/ComfyUI-MiniMax-H3-Guide` | GPL-3.0 | inspiration | validation stricte avant génération ; rôles de référence explicites |
| `okaypic/okaypic-video-skill` | MIT | inspiration | planche-contact 5×1 pour comparer deux prises ; `silencedetect` pour vérifier qu'une réplique est dite ; reprise idempotente, un seul réessai, jamais rejouer une erreur de contenu |
| `lightx2v/…Prompt-Rewriter-LoRA` (27B, 8B) | non précisée | ignorer les LoRA | le prompt système de la version 8B comme texte de comparaison ; Ref2VA non pris en charge |
| `princepainter/ComfyUI-PainterNodes` | MIT | ignorer pour le prompt | paramètres d'encodage des références (1 536 px au plus, multiples de 32) |
| `joeVenner/awesome-minimax-h3`, `yangzhou-chaofan/minimax-h3-1000-prompts` | MIT / aucune | ignorer | l'« anatomie en trois champs » est le format de base, sans Ref2VA |

**Écart vérifié dans notre code.** `lib/agents/plan-h3-assemblage.ts` (ligne 266) écrit l'identifiant de locuteur dans la ligne de rétention de la voix (`<Audio 1>: reference - the character (S1) follows …`). Le guide officiel Ref2VA (section 5.4) dit : « Do not write `(Sx)` in `retention_analysis` » ; son propre exemple écrit `<Audio 1>: reference - its vocal timbre guides the dialogue delivery of <Subject 3> without copying …`. Le `(Sx)` reste correct dans `subject_definitions`. Correction d'une ligne, à faire avec les fixtures et les tests.

**Nuance sur « Hard cut to ».** Le corpus de BeatAPI (550 prompts) en contient 13, contre 79 « Cut to » et 11 « Match cut » : la formule est attestée dans des prompts publics, sans être la plus courante, et tous les dépôts d'outils qui recopient les guides écrivent « the camera cuts to ». E3 reste le bon moyen de trancher.

**Point ouvert : où s'écrit `<scenetrans>`.** Trois conventions coexistent : à l'intérieur du `<d>` aux deux bouts (H3-Guide, T8), à l'extérieur, après le `</d>` de la première partie et avant le `<d>` de la seconde, la réplique étant coupée en deux `<d>` (OpenH3-IR, qui valide contre l'exemple officiel), et notre règle (la réplique entière dans un seul `<d>`, `<scenetrans>` à l'extérieur, une phrase de continuité). Le texte officiel dit seulement « aux points de raccord, dans les deux parties », et son seul exemple d'une réplique qui traverse une coupe n'utilise aucun `<scenetrans>`. Non tranché.

**Pistes de contrôle de sortie à ajouter à `plan-h3-controles.ts`** (idées d'OpenH3-IR, d'unknowlei et de T8) : vêtements du sujet non répétés d'un plan à l'autre (dérive d'identité), coupe qui n'apporte rien de nouveau, « Subject 1 » écrit sans chevrons, mouvements de caméra contradictoires (`Push In` avec « moves backward »), `(S1)` en ASCII avant chaque `<d>`, réplique plus courte que les plans qui la portent.

**Pistes de règles de combat à passer au banc** (idées de BeatAPI, T8 et Benji, aucune officielle) : la caméra reste du même côté de l'axe ; un accessoire unique à dimensions mesurées (« ONE plank, 1,6 m ») ; « un coup raté reste raté » et le contact ne projette pas automatiquement ; après un temps de récupération, les deux combattants repartent d'une position visible.

**Détail technique à regarder dans notre workflow.** Le Kit et l'index décrivent un piège de l'upscale latent à deux passes : les références gardent leur taille de latent et se retrouvent à la mauvaise échelle quand la toile grandit (« identity warp »). L'un des agrandisseurs latents cité (`Tr1dae/ComfyUI-MiniMaxH3_LatentUpscaler`) annonce mettre à l'échelle aussi le conditionnement `minimax_refs`. Notre passe d'upscale réutilise le conditionnement de la première passe (nœud `135:29`, lien vers le nœud `5`) : à vérifier avec V1 et V5 du banc (identité).

## Décisions en attente

Rien n'est modifié dans `agents/skills/plan-h3/`. Un banc à l'aveugle de 18 vidéos, fait le 20 octobre, a montré qu'un skill plus complet aide un modèle et en dessert un autre : un changement de skill se juge au rendu, pas à la lecture. L'ordre que je propose : E3 (formule de coupe) d'abord, parce que c'est un changement d'une ligne dans le code avec un essai de 5 minutes ; puis le vocabulaire de caméra et la manière de dire, qui demandent un essai de plans réels.

## Audit par le validateur d'OpenH3-IR (2026-10-28)

Installé dans un dossier isolé (hors dépôt), sans serveur : `h3ir controls` (23 contrôles) passe, puis son validateur (`h3ir.validate`, mode `ref2va`) sur nos
quatre fixtures `lib/agents/fixtures/plan-h3/*.txt` : 2 erreurs, 5 alertes, 3 infos. Ce sont des fixtures de test (courtes), pas des prompts réels : à refaire sur de vrais prompts de plan.
- **P5 (erreur)** `intense`, `dialogue` : un cadrage est décrit sans mouvement du vocabulaire fermé (Zoom In, Push In, Pan Left, Truck…). Recoupe l'écart « vocabulaire de caméra ».
- **P7 (alerte)** `intense`, `geste-continu` : l'ouverture d'une coupe n'emploie pas une formule de son ensemble fermé (`the camera cuts to`, `the shot cuts to`, `the shot transitions to`…). Recoupe l'écart « Hard cut to ».
- **P2 (alerte)** toutes sauf `intense` : description de 82 à 231 mots contre 350 à 500 conseillés (336 dans l'exemple officiel).
- **A5 / P5b (info)** : musique sans tempo ; mouvement sans « with small|large amplitude at slow|fast speed ».
- Corrigé le même jour : `(Sx)` n'est plus écrit dans la ligne de rétention d'une voix (la définition le garde).
