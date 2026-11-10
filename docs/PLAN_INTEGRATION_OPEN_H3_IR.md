# Plan : intégrer Open H3 IR à Cadence (cadré le 2026-11-01, rien de codé)

Remplace à terme le skill `plan-h3` et l'assemblage de `lib/agents/plan-h3-assemblage.ts` pour écrire le prompt vidéo d'un plan.
Open H3 IR = paquet Python `open-h3-ir` 0.4.1 (Apache-2.0), un compilateur « intention + références + répliques → prompt H3 »
(séquence `[Shot N]`, soundscape, musique, diagnostics). Banc d'essai `h3ir-lab/` retiré le 2026-11-10 (environnement Python : `.venv-h3ir`, `requirements-h3ir.txt`). Essais et bugs : journal de `docs/CAHIER_DE_TESTS.md`
(F7, G, E6). Étude de code faite le 2026-11-01 par un agent Opus (lecture seule) ; les références `fichier:ligne` ci-dessous viennent de cette étude.

**Un plan Cadence = un brief Open H3 IR = un clip H3 à plusieurs shots.** Aucun écart de modèle à résoudre.

## Décisions de l'utilisateur (2026-11-01)

1. **`plan-h3` sera supprimé**, mais après le banc de rendu à l'aveugle (E6) : d'abord Open H3 IR devient le moteur par défaut, ensuite seulement on
   retire `plan-h3`, `plan-h3-assemblage.ts`, la plupart de `plan-h3-controles.ts`, les guides par genre, et on met à jour `CLAUDE.md` et les docs.
   C'est une évolution structurelle : à signaler explicitement le moment venu.
2. **Créativité** (`restrained | balanced | bold | extreme`) **héritée** : réglage du projet, surchargeable par scène, puis par plan (colonnes nullables,
   la plus précise gagne). **La musique n'est pas traitée ici** : on laisse `bold` et `extreme` générer leur musique ; la question « une musique par film »
   se règle plus tard, à part.
3. **Style de caméra** (les 7 profils `director` du paquet : Cameron, Tarantino, Anderson, Villeneuve, Bigelow, Wong, Spielberg ; **correction du 2026-11-02 : ce ne sont pas
   que la caméra** — chaque profil est un goût complet (caméra, cadrage, lumière, palette, jeu, sons, musique) qui ne remplit que ce que la demande et les images ne tranchent pas ; l'interface
   les présente par un résumé en quelques mots suivi du réalisateur, « Immense et silencieux — style de Denis Villeneuve ») : choisi au niveau du projet, **avec le même héritage** projet → scène → plan. Nommé **« style de mise en scène »** dans l'interface (renommé le 2026-11-02 : ce n'est pas que la caméra) et choisi aussi à la création du projet (étape 6 de `/nouveau`, `docs/PLAN_CONCEPTION_PROJET.md`)
   (ce n'est pas le « réalisateur » retiré le 2026-10-20). Valeur par défaut : aucun.
4. **Références : option B** (une étape choisit les références d'un plan à partir du registre), parce que des plans seront écrits avant que leurs
   références existent (création de projet). Voir « Questions ouvertes » 1 et 2.
5. **Typographie française** : retirer `[\s  ]+` devant `! ? ; :` avant l'envoi, puis **remettre la réplique d'origine** dans chaque `<d>` après
   compilation (remplacement exact), pour que le prompt stocké reste mot pour mot (bug d'amont : `h3ir/render.py:407`, à signaler à `ruashots/open-h3-ir`).
6. **Pas de repli silencieux.** Le modèle doit produire un brief qui passe les contrôles. Échec (`degraded`, 500) : relance automatique avec une autre seed
   (deux fois au plus, ~2 min chacune), puis message clair « réessayez ou changez votre demande ». Jamais le brouillon vide, jamais le texte rejeté proposé.
7. **Au moins une référence par plan** : toujours vrai pour l'utilisateur. Garde-fou quand même : un brief sans aucune image bascule Open H3 IR en mode
   texte seul (3 sections, `mode.py`), incompatible avec notre workflow Ref2VA et avec `validerPromptColle` (`lib/prompt.ts:39`) → refuser avec un message.

## Décisions complémentaires (utilisateur, 2026-11-02)

8. **Intent traduit en anglais par le LLM**, à l'étape 3 (dans la tâche du worker, avant la compilation) ; les répliques ne sont jamais traduites. Raison : le
   paquet ne repère lumière, cadrage, palette, vêtements, action et interdits que sur des mots anglais (`h3ir/licence.py:209-230`, `creativity.py`). L'étape 1
   (sans LLM) affiche l'intent en français ; on compare au labo avec une traduction à la main.
9. **Contenu de l'intent** : la description du plan sans ses répliques **et sans « État en fin de plan »**, l'ambiance de la scène et le titre de la
   scène (**pas sa « fonction »** : c'est une phrase entière qui répète la narration, retirée le 2026-11-02 sur un vrai plan). Plus de fin du plan précédent dans l'intent : **Motion Context** (latent sauvegardé) porte la continuité des plans « suite ».
10. **Répliques** envoyées normalisées avec leur locuteur ; la réplique d'origine n'est **plus restaurée** après compilation (la décision 5 est allégée).
11. **Une seule limite : 6 références visuelles.** Plus d'image de raccord, donc plus de limite à 5 en liaison « suite » (le tableau et `sectionsAvecRaccord`
    ne servent plus qu'au moteur `plan-h3`).
12. **`megapixels` fixé à 0,4** ; **`shots` et `director` facultatifs**, laissés à l'utilisateur (réglages éphémères sur la fiche pour l'étape 1, héritage à l'étape 7).
13. **Rôles toujours déclarés**, déduits du type d'asset (constante `ROLE_PAR_TYPE`, `lib/h3ir/brief.ts`) : personnage/prop/vfx/oth → `subject`, décor →
    `environment`, keyframe → `storyboard` (à valider au labo), voix → `voice_timbre`. Un rôle omis n'est pas « choisi par le modèle » : une image sans rôle
    laisse le paquet deviner le mode (risque I2VA/FL2VA), un audio sans rôle devient `bgm` (`service.py:265-300`, `mode.py`).
14. **Voix dérivées des locuteurs** : un audio `voice_timbre` par personnage qui parle dans la description et dont le master existe (3 au plus), sans dépendre
    des `plan_refs` audio.

Décisions du 2026-11-02 (suite) :

15. **Verdict de l'utilisateur après comparaison de vidéos : les prompts d'Open H3 IR sont meilleurs que ceux de `plan-h3`.** Le banc de rendu à l'aveugle (étape 9) reste à faire
    pour trancher proprement ; `plan-h3` n'est pas retiré avant.
16. **L'intent est traduit en anglais par un skill dédié, `traduction-intent`**, appelé une fois dans la tâche du worker avant les relances de compilation (pas de ligne `agent_runs`
    à part : l'intent français et sa traduction sont gardés dans le résultat de la tâche).
17. **« Générer la fiche avec Open H3 IR » remplace la fiche existante** (le clic vaut confirmation) ; l'ancien prompt est mis dans l'historique du prompt (source `avant`), le nouveau
    y est inscrit en `compilation`. Une fiche d'Open H3 IR n'écrit ni la durée ni la description du plan, et ne crée aucun asset.
18. **Python dans Docker maintenant** (`Dockerfile.worker` : `python3`, `py3-pip`, `open-h3-ir==0.4.1` épinglé dans `scripts/h3ir/requirements.txt`) — **non testé** : à construire
    une fois sur le mini PC avant de s'y fier. En dev : `H3IR_PYTHON`, à défaut `.venv-h3ir` à la racine.

Réalisé le 2026-11-02 (étapes 2, 3, 4 et 6, **non commité, non essayé avec un vrai LLM**) : `scripts/h3ir/compiler.py` (pont Python, `TestClient` en mémoire, 1,3 s de démarrage mesuré),
`lib/h3ir/compilateur.ts` (lanceur de processus avec délai et annulation qui tue l'arbre de processus, jugement des réponses, relances seed+1 deux fois), `worker/h3ir.ts` (brief →
traduction → compilation, branché dans `traiterTacheLlm` pour le skill virtuel `plan-h3ir`), `lib/h3ir/conversion.ts` (`depuisCompilationH3ir`), `agents/skills/traduction-intent/`,
bouton « Générer la fiche avec Open H3 IR » dans l'onglet « Brief Open H3 IR » de la fiche, `docs/RAPPORT_AMONT_OPEN_H3_IR.md` (brouillon, rien d'envoyé).
**Reste à vérifier avec un vrai calcul** : que le manifeste donne bien des labels `<Picture N>` / `<Audio N>` lisibles, que `verifierFiche` accepte la fiche produite, la qualité de la
traduction, la durée d'un essai, l'annulation en plein calcul, et le dernier mot sur `keyframe → storyboard`.

Décisions du 2026-11-02 (étapes 7 et 8) :

19. **Créativité et style de caméra hérités** projet → scène → plan, le plus précis gagne ; `null` hérite ; le style **« aucun »** est une valeur (force l'absence de style). Défauts : créativité équilibrée, aucun style.
    Ils ne concernent que les fiches d'Open H3 IR. Les valeurs choisies dans le tiroir « Brief Open H3 IR » ne valent que pour un lancement (rien n'est enregistré par le tiroir).
20. **Plancher d'un shot à 1,2 s pour toutes les fiches** (alerte de la page du plan), et les shots se jugent contre la **durée effective** du rendu. `plan-h3` garde 1,5 s pour son propre brouillon.
    **Correction** : la durée effective de 8 s est 8,000 s (et non ~8,1 s) ; seuls 5, 6, 7, 9 et 10 s s'allongent un peu.

21. **Cartes de mise en scène avec vidéos de démo** (écran « Mise en scène » de `/nouveau`) : chaque choix de style et de créativité a un « ? » qui ouvre un tiroir avec un **rendu vidéo réel**
    (`components/conception/CarteMiseEnScene.tsx`). Les vidéos se fabriquent dans un **projet spécial « Démos · mise en scène »** avec le pipeline normal (références, fiche Open H3 IR, rendus du
    worker) : `npm run mises-en-scene -- preparer | fiches | etat | publier` (`scripts/mises-en-scene.ts`, `lib/h3ir/demos.ts`). Scène choisie : « La poursuite sur le toit », 10 s, même seed ;
    **12 démos** : 8 de style (avec deux répliques, créativité équilibrée) et 4 de créativité (même action sans réplique, sans style). Références **neutres** : Open H3 IR laisse lumière et couleurs
    aux images de référence, donc le style ne se voit vraiment que sur caméra, cadrage, jeu, sons et musique (la carte le dit). Fichiers sous `data/mises-en-scene/` (versionnés comme `data/styles/` ; en
    production, à copier sur le partage NFS).

22. **Profils de mise en scène personnalisés** (2026-11-07) : en plus des 7 réalisateurs (`director`), six « façons de filmer » écrites par nous et envoyées en `director_profile` (nom + paragraphe d'habitudes) : `claymation`, `anime-nerveux`, `anime-contemplatif`, `3d-cinema`, `sitcom`, `horreur` (`lib/h3ir/profils-perso.ts`, sans nom de studio ni d'auteur). Ce sont de vrais choix, stockés dans les mêmes colonnes `style_camera` (varchar(20), pas de migration) et hérités projet → scène → plan comme les réalisateurs (`ChoixMiseEnScene`, `lib/h3ir/reglages.ts`) ; `lib/h3ir/brief.ts` les envoie en `director_profile`, un réalisateur en `director`. Un essai (claymation sur références photoréalistes) a montré que le profil change **le mouvement et le cadrage**, pas **l'apparence** : celle-ci vient des images de référence, donc du style du projet (le style visuel n'est pas envoyé à Open H3 IR, seulement l'intent, l'ambiance, le profil et les images). Un style très éloigné de ce que sait faire le modèle (essai Van Gogh) reste instable : à valider par un rendu image puis vidéo.
    **Recommandation** : `lib/styles/mise-en-scene-recommandee.ts` associe quelques styles de la bibliothèque à un profil (Claymation, Ghibli, Akira Toriyama, One Piece, Pixar, 3D Render, Final Fantasy 3D) ; table volontairement courte, un style douteux n'en a pas. À l'étape « Mise en scène » de `/nouveau`, la carte recommandée passe en tête (« suggéré par ton style ») et est **cochée tant que l'utilisateur n'a rien choisi** ; un choix manuel (même « Aucun style ») n'est jamais écrasé par un changement de style (`miseEnSceneChoisie`, `suivreRecommandation` dans `lib/conception-ui.ts`). Les profils perso n'ont pas encore de vidéo de démo : leur carte le dit et montre un exemple écrit.

## Architecture retenue

Un **petit script Python lancé par appel** (pas de service permanent), branché dans `worker/llm.ts` (`traiterTacheLlm`, sous le verrou GPU de
`worker/index.ts:445-469`) comme **moteur alternatif de la tâche « fiche de plan »**. Le script appelle l'application FastAPI du paquet en mémoire
(`TestClient(app).post("/v1/briefs")`), même contrat public que le service HTTP, sans port ni démon. Raisons : le verrou GPU s'applique tel quel ; le
worker peut tuer le processus pour annuler (la génération s'arrête quand la connexion vers llama.cpp se ferme) ; le modèle se fixe par appel
(`H3IR_LLM_MODEL`) ; les fichiers passent par chemin (même machine). Rejetés : service HTTP permanent (annulation impossible, modèle fixé au démarrage,
stockage en mémoire inutile), client TypeScript réimplémentant le paquet (13 700 lignes de Python, version 0.4 mouvante), validateur seul (pas le gain voulu).

Précautions : figer `open-h3-ir==0.4.1` (`requirements.txt`), vérifier le condensé de `GET /v1/contract` au démarrage, `H3IR_GUIDED_DECODING=1`
(sinon gemma recopie le schéma JSON sur les appels avec images), `H3IR_ALLOW_ASSET_PATHS` selon le mode de transmission, délai LLM de 600 s par défaut.
**Non vérifié** : que `TestClient` fonctionne tel quel avec cette app, et son temps de démarrage → premier objet de l'étape 3.

## Correspondance des données (plan Cadence → `BriefIn`)

| Cadence | Open H3 IR | Remarque |
|---|---|---|
| Description du plan sans les répliques, ambiance de la scène, fin du plan précédent si `suite`, consigne de l'auteur | `intent` | Voisins et `dernierShot` de plan-h3 n'ont pas d'équivalent : seul l'intent les porte. Qualité avec intention en français : non vérifiée. |
| Références du plan (`plan_refs`, images) | `assets[]` (`kind: image`, `role: subject \| environment`, `note` = nom et description du registre) | **Rôle toujours déclaré** (force Ref2VA). 6 images au plus, 5 avec raccord (le service en accepte 9). |
| Image de raccord (liaison `suite`) | **jamais envoyée** | Avec `frame_anchor_first`, le mode bascule en I2VA/FL2VA (autre checkpoint). On garde `sectionsAvecRaccord` (`lib/plan-raccord.ts:41`) appliqué au moment de soumettre ; il réserve une case. |
| Lignes `NOM : « texte »` de la description | `dialogue[]` (`text`, `language`, `speaker`, `voiceover`) | Langue du brief (`lib/langue-dialogues.ts`), « Auto » à traiter ; voix off : `NOM = voix off`. Normalisation puis restauration (décision 5). |
| Voix du personnage (`voix_master`, `voix_description`, `voix_replique_base`) | asset `kind: audio, role: voice_timbre`, `note`, `transcripts[sha]` | Le service ne transcrit jamais. **Une seule voix est liée correctement** (`plan.py:478-498` : `voice_ref = voice_refs[0]` pour tous les locuteurs) ; ordonner les images pour que les locuteurs viennent en tête, réécrire les lignes `<Audio N>` après coup. Bug à signaler. Chemin rédigé non vérifié. |
| `dureeGenerationSecondes` (5 à 10) | `seconds` | Grille 17k+5 (`lib/grille-images.ts`) : 5 s → 5,167 s, 6 s → 6,583 s, 7 s → 7,292 s, **8 s → 8,000 s**, 9 s → 9,417 s, 10 s → 10,125 s. Le paquet refuse `shots` sur la durée NOMINALE (`compile.py:116`). |
| rythme | `shots` | **Non imposé par défaut** (les échecs T12/T6 viennent d'un nombre imposé trop haut). Si imposé : ≤ ⌊durée effective / 2,5⌋. |
| (héritage projet/scène/plan) | `creativity`, `director` | Décisions 2 et 3. |
| `plans.seed` | `seed` | Déterministe ; relance d'échec = seed+1. |
| — | `effort: standard`, pas de `megapixels` | `megapixels` < 0,25 refusé (422), nos 0,2 MP aussi. |
| Style du projet (clause de `lib/styles/`) | rien | Le paquet prend le médium dans les images ; la clause n'est plus posée en tête (`lib/prompt.ts:17-21` la dit sans effet mesuré). |

**Sortie** : `ir.sections` → `plan_prompt_sections` + une version dans `plan_prompt_versions` (nouvelle source « compilation ») ; `ir.manifest`
(label → sha → asset) → `plan_refs` ; `diagnostics` → avertissements de la proposition ; BriefIn et enveloppe → `agent_runs.entree` / `resultat`
(c'est la persistance : le service n'en a pas). Édition manuelle inchangée. **`PATCH` n'est pas utilisé** (il réécrit l'intention par le LLM, recompile tout,
perd seed et transcriptions, stockage volatil). Affiner = renvoyer le brief modifié par Cadence avec la même seed. Correction après visionnage :
`iteration-plan` reste (il voit les vignettes du rendu ; sa règle « Hard cut to » `agents/skills/iteration-plan/SKILL.md:80` doit accepter « the shot cuts to »).

## Points d'accroche dans le code

- Lancement d'une fiche : `lib/agents/service.ts:983-1012`, `:1075` ; contexte : `lib/agents/contexte.ts:562-679` (`entreePlanH3`) → nouveau constructeur de brief.
- Exécution : `worker/llm.ts:85-110` → branche « moteur h3ir ».
- Conversion vers la fiche : `worker/agents/postTraitement.ts:215-225` (et `:166`) → `lib/agents/conversion.ts:596` (`depuisFichePlan`) ; nouveau `depuisCompilationH3ir`.
- Voix : `lib/agents/voix-du-prompt.ts:44`. Contrôles : `lib/plan-checks.ts` (aligné le 2026-11-02 : plancher 1,2 s, durée effective).
- Schéma : `db/schema.ts:195` (sections), `:207` (versions) ; migration à venir (0077) pour `creativite` et `style_camera` nullables sur projet, scène, plan.

## Ce qu'Open H3 IR ne fait pas : choisir les références (option B)

`plan-h3` lit aujourd'hui la description, **choisit les références** (nature, rôle, ordre, 6 images au plus, règles d'effets, états décor peuplé/vide)
**et déclare les `assetsManquants`**. Open H3 IR n'utilise que ce qu'on lui donne. `inventaire-assets` (`agents/skills/inventaire-assets/`, `lib/agents/inventaire.ts`)
travaille **au niveau du projet**, avant les fiches : il lit tous les plans et le registre et **propose les assets manquants** (avec `parent` pour les états, `plans[]`
= plans concernés). Il ne dit pas, pour chaque plan, quels assets **existants** y servent. Il faut donc :
- garder `inventaire-assets` en amont (complète le registre) ;
- ajouter une étape **« choix des références d'un plan »** (nouveau petit skill, ou règles déterministes quand le plan est explicite), qui rend les codes du registre
  + rôle + ordre, applique les limites (6 images, 5 avec raccord, un visage par personnage, un décor peuplé ≠ un décor vide) et alimente `plan_refs` ;
- reprendre dans cette étape les règles de plan-h3 qui valent encore (rules 1.2 à 1.10, `agents/skills/plan-h3/SKILL.md:66-74`), puis supprimer le reste avec plan-h3.

## Ce que l'on garde / perd

- Disparaît avec plan-h3 : la prose des shots, l'assemblage (labels, « Hard cut to », définitions, rétention), les guides par genre. Les écarts de
  `docs/ECARTS_GUIDES_H3.md` (formule de coupe, vocabulaire de caméra, `(Sx)`, longueur…) disparaissent d'eux-mêmes : le paquet les respecte par construction.
- Se perd, sauf à le porter dans l'`intent` : rythme du projet (2.0), une coupe = une information (2.6), fin en mouvement avant un `suite` (2.9),
  limites solides (3.16), exagération en style stylisé (3.15), côtés fixés (5.7), « montrer seulement ce qui est déclaré » (3.13). **Seul le banc de rendu tranche.**
- Reste : sélection des références, `sectionsAvecRaccord`, `voix-du-prompt`, `lib/prompt.ts`, `iteration-plan`, `plan-checks`.

## Étapes (effort S / M / L)

1. **(S) FAIT le 2026-11-02, à tester avec de vrais plans** (`lib/h3ir/brief.ts` + tests, `brief-plan.ts`, onglet « Brief Open H3 IR » de la fiche, zone
   « Coller un brief JSON » dans `h3ir-lab`). Brief sans LLM ni rendu. Fonction pure `briefDepuisPlan(plan)` → `BriefIn` (répliques extraites et normalisées, rôles, seed, durée, garde-fous 6/5 images,
   aucune image → refus), avec tests unitaires. Bouton « Voir le brief Open H3 IR » sur la fiche (affiche le JSON, à coller dans `h3ir-lab`).
   L'utilisateur juge la correspondance sur ses vrais plans.
2. **(S) FAIT en brouillon (`docs/RAPPORT_AMONT_OPEN_H3_IR.md`, à poster par l'utilisateur)** — rapport d'amont chez `ruashots/open-h3-ir` : `render.py:407` (espace avant `!?;:`) et liaison des voix (`plan.py:482-498`).
3. **(M) FAIT le 2026-11-02, à essayer avec un vrai calcul** — script Python « un appel » + branche du worker derrière une option par plan ; résultat dans `agent_runs`. Mesurer le démarrage, vérifier `TestClient`,
   l'annulation, le verrou GPU. Sans rendu.
4. **(M) FAIT le 2026-11-02 (typographie non restaurée : décision 10)** — `depuisCompilationH3ir` : sections, `plan_refs` depuis le manifeste, voix réécrites, typographie restaurée, diagnostics en avertissements, version
   d'historique. Comparer à plan-h3 dans la fiche, sans rendu.
5. **(M) FAIT le 2026-11-09 (vague 4a), à tester en réel** — « choix des références » et câblage. Open H3 IR est le seul producteur des prompts vidéo,
   plan neuf compris : chaque demande « Générer la fiche » (et « Écrire les fiches », « Générer la fiche avec ces réglages ») PRÉPARE puis COMPILE
   (`lib/h3ir/preparation.ts` règles pures, `preparation-db.ts`, pilote `lib/demandes-db.ts`) : références (gardées si l'inventaire ou l'utilisateur les a
   posées ; sinon choisies par le code, `lib/h3ir/references-plan.ts` ; petit skill `references-plan` seulement en cas de doute, une tâche par plan, dans
   l'ordre du scénario) → assets manquants (deux au plus, créés d'office) → prompts (`prompt-asset`) → images (adoption automatique ; la demande reste « en
   attente d'images », une image en échec l'arrête en nommant l'asset) → compilation. Chemin rapide : références prêtes = compilation directe. « Itérer »
   suit la même mécanique (assets décidés créés, images attendues, recompilation automatique ; rien n'est écrit sur le plan tant qu'elle n'a pas réussi).
   Plus aucun repli automatique sur `plan-h3` : retour arrière d'urgence seulement, par `CADENCE_MOTEUR_FICHE=plan-h3` (web et worker) ou l'option
   interne `moteur: "plan-h3"`.
6. **(S) FAIT le 2026-11-02** — relances d'échec (seed+1, deux fois) et messages (décision 6), dans `compilerAvecRelances`.
7. **(M) FAIT le 2026-11-02, à essayer dans l'interface** — héritage créativité / style de caméra : migration 0077, réglages du projet (page Brief), de la scène (« Modifier »), du plan (panneau du scénario), tiroir « Brief Open H3 IR » prérempli (`lib/h3ir/reglages.ts`, `chargerBriefPlan`). La valeur « aucun » force l'absence de style par-dessus un niveau supérieur.
8. **(S) FAIT le 2026-11-02** — alignements : `controlerStructure` juge les shots contre la durée effective avec un plancher de 1,2 s (`SHOT_MIN_FICHE_SECONDES` ; `plan-h3` garde 1,5 s pour son brouillon) ; `iteration-plan` : la règle de coupe garde « la forme du prompt », `dureesCoherentes` accepte la durée effective, `dernierShotLisible` retire aussi « the shot cuts to ».
9. **(L) Banc de rendu à l'aveugle** (cahier E6) : quelques plans par genre, `plan-h3` contre Open H3 IR, raccord et dialogue compris. Décide le moteur par défaut.
10. **(M) Retrait de `plan-h3`** et nettoyage (code, skill, docs, `CLAUDE.md`).

## Questions ouvertes (à trancher avant l'étape 5)

1. **TRANCHÉ (utilisateur, 2026-11-01) : les images d'abord.** On crée les images des assets avant d'écrire les prompts, pour éviter la décohérence entre
   personnages et sujets. Un plan se compile quand toutes ses références ont un fichier ; sinon l'interface dit lesquelles manquent. Conséquence : l'étape
   « choix des références » et `inventaire-assets` passent avant, et `plan-h3` ne déclare plus d'assets manquants « créés avec ce plan ». Raisonnement d'origine :
   **les images doivent exister pour compiler.** Open H3 IR analyse de vraies images (envoyées par chemin ou octets) ; `plan-h3` écrit aujourd'hui des fiches
   dont des références n'ont pas encore de fichier (« elles seront produites »). Si on compile avant que les images existent : soit on compile quand
   toutes les références du plan ont un fichier (l'ordre devient images d'abord, prompts ensuite), soit on décrit en texte (dans l'`intent`) les assets sans fichier.
   À trancher, c'est la conséquence la plus lourde de l'option B.
2. Nouveau skill pour le choix des références, ou règles déterministes ? Qui crée les assets manquants quand un plan en révèle un après `inventaire-assets` ?
3. Ratio : aucun champ en base trouvé (probablement 16:9 du workflow) → à confirmer avant d'envoyer `aspect`.
4. Bruitages `SFX_` : retirés de Cadence (2026-11-10).
5. Langue de l'`intent` : décidé (8) anglais par traduction LLM à l'étape 3 ; reste à **mesurer** au labo (français contre traduction à la main) avant de bâtir la traduction.
6. Liaison des voix sur le chemin rédigé (pas seulement le brouillon) : non vérifiée.
7. Cas `suite` : la continuité (fin du plan précédent) passe par l'`intent` seulement ; vérifier sur un vrai enchaînement.
