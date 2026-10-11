# Rétrospective — banc de test H3 / Singularity (2026-10-11 et 12)

Projet de test : « Banc A/B — H3 et Singularity » (projet 43, base locale). Mode utilisé : **ref2va uniquement** (Reference to Video, 24 fps). Le mécanisme d'images clés étudié plus bas (nœuds « Add Guide ») est documenté par ComfyUI dans ce même mode.

Ce document liste ce qu'on a appris et, surtout, **les changements à faire sur l'agent** (`plan-h3` et ce qui l'entoure). Rien n'est encore modifié dans le dépôt : ni skills, ni code. Toute évolution structurelle est à confirmer contre `docs/FRICTIONS.md` (voir « Ce qui contredit une décision actée »).

## 1. Les tests, dans l'ordre

| Tour | Plans (ids) | Ce qu'on testait | Résultat en bref |
|---|---|---|---|
| 1 | A, B, C (27–29) | Trois écritures d'un même effondrement d'étagères (4 plans / 4 plans denses / 2 plans denses), H3 contre Singularity | Premier essai Singularity faussé : le LoRA turbo avait été écrasé par le nom du modèle (voir § 3). H3 valide, Singularity à refaire |
| 1 bis | A, B, C | Idem, LoRA corrigé | Singularity : adhérence au prompt et dynamisme meilleurs ; H3 : flammes plus spectaculaires. Un seul tirage par case, pas de notation à l'aveugle faite |
| 2 | D (30) | Multi-références : fiches de Maya et de la Tenancière, décor vide, effet de flammes | Les deux modèles tiennent bien les 4 références. Le doute sur la fidélité à la référence venait d'un changement de référence entre deux générations, pas du modèle |
| 3 | E (31) | Combat de 15 s en 10 plans écrit par moi, 6 références | Lisible par endroits, mais faux raccords, côtés d'écran qui s'inversent, échange de coups réduit à un blocage et une paume, final sans interaction avec le décor |
| 3 | F (32) | Même combat écrit par l'agent `plan-h3` actuel (83 s, 0 erreur de contrat) | Histoire cohérente mais texte mince (environ 480 mots), main levée dès le début, coupe sur la paume sans contact visible, plan sans sens après la montée en flammes |
| 3 bis | H, I (33–34) | E réécrit : échange réel, côtés fixés, raccords sur le geste ; H avec timecodes, I en texte libre | Net progrès de lisibilité. H : coupes à ±0,2 s. I : le modèle fait environ 11 coupes tout seul, scène cohérente |
| 3 ter | J (35) | Même contenu que H selon le skill téléchargé (rôles bornés, négatifs, rédaction compacte), environ 7 500 caractères | Nettement meilleur que H |
| 3 ter | K (36) | J + ralenti à l'impact, respiration, décor qui cède, dernière image calme (9 plans) | Ralenti et respiration visibles ; première moitié floue (4–5 actions dans des plans de 1,5 s) |
| 3 ter | L (37) | K en moitié moins long (4 700 caractères) et 5 plans | Échange plus net, ralenti tenu 1,5 s, finale et aérien réussis ; pilier qui rétrécit encore, plus de marche d'approche, cloison qui ne se brise plus à l'écran |

## 2. Ce qui est établi, probable, ou pas prouvé

**Établi (mesuré ou vérifié sur source primaire)**
- Les timecodes sont respectés : coupes mesurées à 0 à 0,5 s des valeurs écrites (E : jusqu'à −0,5 s, F : jusqu'à +0,5 s, H, J : ≤ 0,25 s). Un raccord sur le geste est assez fluide pour que la coupe ne se détecte pas. Le modèle ajoute parfois des coupes de lui-même.
- Sans timecodes ni numéros de plan (I), le modèle choisit son rythme (environ 11 coupes en 15 s) et reste cohérent.
- Le guide officiel plein référence demande **350 à 500 mots** pour `detailed_description` ; nos prompts à la main E et H en faisaient environ 1 400 et étaient les moins bons. Notre propre règle 6 de `plan-h3` dit déjà « 350–500 mots », je ne l'ai pas respectée.
- Le guide officiel écrit les coupes « the camera cuts to » / « the shot transitions to » ; il ne mentionne ni « hard cut », ni raccord sur le geste, ni règle des 180°, ni limite du nombre de plans ni durée minimale.
- ComfyUI documente un workflow « multiframe » : des nœuds `Add Guide` épinglent une image à `round(secondes × 24)`. Exemple officiel : 4 références, l'image 1 sert d'identité et de première image, les images 2 à 4 sont des images clés des plans 2 à 4. Une image branchée seulement à un guide n'est pas visible du texte : il faut aussi la brancher comme référence pour la citer. Limite totale : 9 images.

**Probable (observé sur nos rendus, un tirage chacun)**
- Singularity suit mieux la chorégraphie du prompt et donne des plans plus dynamiques ; H3 rend des flammes plus spectaculaires.
- Le ralenti à l'impact (« the frame slows almost to stillness… ») et la respiration avant la finale (« the hall holds its breath… ») sont pris en compte.
- Écrire les côtés d'écran au début du texte (Maya à gauche, la Tenancière à droite) tient du début à la fin.
- Quatre ou cinq actions dans un plan de 1,5 s donnent un plan flou.
- Termes de caméra : `swoop`, `pan`, `pedestal up`, `push in`, `shake` rendus ; `dive` pas démontré ; `whip-pan` a inversé les côtés dans E.

**Pas prouvé**
- Que « la taille du prompt » soit la cause de l'écart J / H : J change aussi la formulation des références et ajoute des négatifs. Il faudrait une version raccourcie de H sans rôles bornés ni négatifs.
- Que les négatifs courts soient sans danger : ils étaient dans J, K, L sans effet néfaste visible, mais notre lexique les déconseille.
- Le comportement de Singularity avec le LoRA turbo et des images clés (personne ne l'a mesuré).
- Le son, les dialogues et la synchronisation labiale : jamais évalués. Pas de notation à l'aveugle formelle, un seul tirage par case, pas de statistiques.

## 3. L'incident à ne pas reproduire

Au premier tour, `lora_2` du workflow a été remplacé par le nom du modèle Singularity en même temps que `unet_name`. Le chargeur de LoRA a ignoré le nom inconnu sans erreur : les rendus Singularity ont tourné sans le LoRA turbo 4 steps et sortaient avec des artefacts. Rien dans Cadence ne l'a signalé, et aucun job ne gardait le nom du modèle utilisé.

## 4. Changements à faire sur l'agent

### 4.1 Texte du skill `plan-h3` (SKILL.md et references)

Par priorité (preuve entre parenthèses).

1. **Bloc « mise en scène » dans le brouillon.** Fixer en tête qui est à gauche et à droite du cadre et vers où chacun regarde, pour toute vue à deux ; écrire où chaque personnage finit à chaque coupe (E : côtés inversés ; H–L : côtés fixés, lisibles). *C'est un changement de contrat de sortie si on en fait un champ : à signaler dans FRICTIONS.*
2. **Raccord sur le geste.** Ouvrir le plan suivant sur le mouvement en cours, avec les **deux** personnages dans le cadre au contact (F : coupe sur la paume sans Maya ; H–L : échange lisible).
3. **Densité par plan.** Deux ou trois actions distinctes au plus par plan de 1,5 s ; pour un combat, plans de 2 à 3 s avec un mouvement de caméra à l'intérieur plutôt que des petites coupes ; réserver la rafale à un effet voulu (K flou, L net).
4. **Longueur.** Appliquer vraiment « 350–500 mots » à `detailed_description` ; viser un prompt assemblé de 4 500 à 7 500 caractères (L : 4 700 réussi, K : 8 400 trop serré en début, E/H : 12 000 les moins bons).
5. **Un échange de coups est une suite de petits échanges** : attaque, parade ou esquive, contre, avec un impact lisible (F : un seul coup ; H–L : trois temps).
6. **Poids des coups.** Impact = ralenti d'un battement avec poussière et braises suspendues, secousse de caméra forte, anneau de poussière, vague dans le tissu, gros plan sur le visage ; silence puis craquement côté son. Généraliser la chaîne « état initial → déclencheur → action → contact → réaction → récupération → état final » (aujourd'hui limitée au guide de genre « action »).
7. **Effets de finale.** Formule déclencheur + forme + direction + interaction avec le décor (poutres, cloisons, parquet, lanternes) ; l'effet qui garde sa largeur n'est pas fiable (K oui, L non, E et F non).
8. **Définitions des références.** Un rôle borné par référence avec ce qu'elle n'apporte pas (« définit uniquement le visage et le costume ; fond et vues ignorés ») ; jamais d'action dans une définition (F : « main levée dans un geste d'arrêt ») ; antécédents sans ambiguïté (F : « Subject 3 » est la dague, pas Maya).
9. **Vocabulaire de caméra** (`guide-h3-compact.md`) : ajouter `swoop` et `dive` (à tester), `roll` à la place de `barrel roll` (décision de l'utilisateur), signaler `whip-pan` comme risqué (inversion de côtés) ; confirmer `pan`, `pedestal`, `push in`, `shake`.
10. **Marche d'approche, raccords de géographie.** Écrire où se trouve chaque personnage avant et après chaque plan (la cloison traversée mène à une salle, pas à « ailleurs »).

### 4.2 Code et outillage

11. **Vérifier au démarrage du worker** que le `unet_name` et chaque LoRA du workflow existent côté ComfyUI (`/object_info/UNETLoader`, `/rgthree/api/loras`) et refuser le job sinon.
12. **Garder dans chaque job** le modèle (`unet_name`), les LoRA, le chemin de sortie (aperçu ou final) et la seed, pour pouvoir comparer des rendus.
13. **Ancrage par images clés (`Add Guide`).** Faire entrer dans `worker/comfyui/mapping.ts` une référence « image clé » avec son `frame_idx = round(s × 24)`, branchée aussi comme référence visible du texte ; les assets de type `keyframe` existent déjà. À tester d'abord à la main dans ComfyUI avec Singularity et le LoRA turbo.
14. **Inventaire des assets.** Éviter qu'un personnage ait deux images concurrentes (scène et fiche) : l'agent a pris l'ancienne illustration (`CHAR_maya`) au lieu de la fiche. L'agent proposait aussi un `VFX_pilier_flammes` : à trancher (la règle actuelle dit de chercher d'abord dans le registre).
15. **`prompt-asset`.** Les fiches générées ont perdu des traits d'identité critiques (Tenancière sans hétérochromie, Maya aux yeux gris-bleu au lieu de rouges). Répéter ces traits dans une phrase dédiée et prévoir un contrôle ou une vue de tête dédiée.
16. **`plan-checks`.** Alerter si le prompt assemblé dépasse environ 8 000 caractères ou `detailed_description` environ 550 mots ; conserver l'alerte des shots sous 1,5 s (K : l'espacement de 1,5 s a été tenu à ±0,4 s, le flou venait de la densité, pas du temps).

## 5. Ce qui contredit une décision actée (à trancher, pas à faire en silence)

- **« Hard cut to »** : le code l'écrit à chaque coupe (FRICTIONS) et le lexique de corrections dit que sans lui plusieurs actions se lissent en un mouvement (observé sur H3 de base, plans 110 et 125). Le guide officiel écrit « the shot cuts to » et ne parle pas de « hard cut ». **Jamais testé avec Singularity** : à comparer (plan M envisagé).
- **Négations** : la règle 3.3 de `plan-h3` et le lexique § 3 les interdisent (« empty » vide la pièce). Les plans J, K, L se terminaient par une courte ligne de négatifs sans effet néfaste vu. Pas isolé : à garder interdit tant qu'un test ne le prouve pas.
- **Shots sous 1,5 s** : la règle est une alerte (FRICTIONS) fondée sur « H3 ignore le timecode brut ». Nos mesures montrent des coupes à 1,5 s tenues à ±0,4 s. Pas de raison de changer la règle, mais la cause des plans flous est la densité d'actions.
- **Clause de style complète** : J, K et L ont utilisé une version courte (« Cinematic anime illustration, refined linework, atmospheric depth. »). Effet non isolé.

## 6. Tests restants, par ordre d'intérêt

1. **M** : description de 350–500 mots, 4 plans, mouvement de caméra à l'intérieur du plan, coupes écrites « the shot cuts to » (test de « Hard cut to »).
2. **Images clés par plan** (4 images : paume sur le sternum, dague plantée, Maya en feu, salle en ruine) avec `Add Guide` à la main, puis intégration au worker si ça tient.
3. **Ablation de J** : H raccourci sans rôles bornés ni négatifs, pour séparer taille, formulation et négatifs.
4. Plusieurs seeds, une notation à l'aveugle réelle (grille dans `data/_essais/ab-singularity/grille.md`), un test avec dialogue.

## 7. Où retrouver les traces

- Base locale : projet 43, plans A à L (ids 27 à 37), assets `CHAR_maya_sheet`, `CHAR_tenanciere`, `DEC_couloir_auberge`, `DEC_toits_auberge`, `VFX_flammes`, `PROP_dague_maya`.
- Scripts (suivis sur la branche `plan-h3-banc-singularity`) : `scripts/ab-singularity.mts`, `ab-multiref.mts`, `ab-combat.mts`, `ab-agent-plan.mts`, `ab-combat-reecrit.mts`, `ab-combat-j.mts`, `ab-combat-k.mts`, `ab-combat-l.mts`.
- Rapport de l'agent : `data/_essais/plan-h3-2026-10-11T21-43-10.md` ; prompt du skill téléchargé : `data/_essais/ab-singularity/prompt-J-skill.txt`.
- Workflow : `workflows/video-generation/VID_REF2VA.json` modifié et non commité (modèle Singularity ligne `unet_name`, LoRA turbo remis).

## 8. Suite (2026-10-12)

Les changements au skill `plan-h3`, au guide « action », au lexique et à `iteration-plan` sont sur la branche `plan-h3-banc-singularity`, avec un banc de trois autres scènes de combat (projet 44). Ils ne sont **que partiellement validés** : voir `docs/NOTE_REPRISE_PLAN_H3.md` pour ce qui est à garder, à retirer ou à repenser, et la liste de ce qu'il reste à faire.
