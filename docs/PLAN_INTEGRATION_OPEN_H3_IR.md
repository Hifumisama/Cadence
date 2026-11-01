# Plan : intégrer Open H3 IR à Cadence (cadré le 2026-11-01, rien de codé)

Remplace à terme le skill `plan-h3` et l'assemblage de `lib/agents/plan-h3-assemblage.ts` pour écrire le prompt vidéo d'un plan.
Open H3 IR = paquet Python `open-h3-ir` 0.4.1 (Apache-2.0), un compilateur « intention + références + répliques → prompt H3 »
(séquence `[Shot N]`, soundscape, musique, diagnostics). Banc d'essai : `h3ir-lab/` (README). Essais et bugs : journal de `docs/CAHIER_DE_TESTS.md`
(F7, G, E6). Étude de code faite le 2026-11-01 par un agent Opus (lecture seule) ; les références `fichier:ligne` ci-dessous viennent de cette étude.

**Un plan Cadence = un brief Open H3 IR = un clip H3 à plusieurs shots.** Aucun écart de modèle à résoudre.

## Décisions de l'utilisateur (2026-11-01)

1. **`plan-h3` sera supprimé**, mais après le banc de rendu à l'aveugle (E6) : d'abord Open H3 IR devient le moteur par défaut, ensuite seulement on
   retire `plan-h3`, `plan-h3-assemblage.ts`, la plupart de `plan-h3-controles.ts`, les guides par genre, et on met à jour `CLAUDE.md` et les docs.
   C'est une évolution structurelle : à signaler explicitement le moment venu.
2. **Créativité** (`restrained | balanced | bold | extreme`) **héritée** : réglage du projet, surchargeable par scène, puis par plan (colonnes nullables,
   la plus précise gagne). **La musique n'est pas traitée ici** : on laisse `bold` et `extreme` générer leur musique ; la question « une musique par film »
   se règle plus tard, à part.
3. **Style de caméra** (les 7 profils `director` du paquet : Cameron, Tarantino, Anderson, Villeneuve, Bigelow, Wong, Spielberg ; ils ne régissent que
   caméra et cadrage) : choisi au niveau du projet, **avec le même héritage** projet → scène → plan. À nommer « style de caméra » dans l'interface
   (ce n'est pas le « réalisateur » retiré le 2026-10-20). Valeur par défaut : aucun.
4. **Références : option B** (une étape choisit les références d'un plan à partir du registre), parce que des plans seront écrits avant que leurs
   références existent (création de projet). Voir « Questions ouvertes » 1 et 2.
5. **Typographie française** : retirer `[\s  ]+` devant `! ? ; :` avant l'envoi, puis **remettre la réplique d'origine** dans chaque `<d>` après
   compilation (remplacement exact), pour que le prompt stocké reste mot pour mot (bug d'amont : `h3ir/render.py:407`, à signaler à `ruashots/open-h3-ir`).
6. **Pas de repli silencieux.** Le modèle doit produire un brief qui passe les contrôles. Échec (`degraded`, 500) : relance automatique avec une autre seed
   (deux fois au plus, ~2 min chacune), puis message clair « réessayez ou changez votre demande ». Jamais le brouillon vide, jamais le texte rejeté proposé.
7. **Au moins une référence par plan** : toujours vrai pour l'utilisateur. Garde-fou quand même : un brief sans aucune image bascule Open H3 IR en mode
   texte seul (3 sections, `mode.py`), incompatible avec notre workflow Ref2VA et avec `validerPromptColle` (`lib/prompt.ts:39`) → refuser avec un message.

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
| `dureeGenerationSecondes` (5 à 10) | `seconds` | Grille 17k+5 : 10 s → 243 images, 10,125 s effectives. |
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
- Voix : `lib/agents/voix-du-prompt.ts:44`. Contrôles : `lib/plan-checks.ts` à aligner (plancher 1,2 s du paquet contre 1,5 s chez nous ; durée effective contre nominale).
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

1. **(S) Brief sans LLM ni rendu.** Fonction pure `briefDepuisPlan(plan)` → `BriefIn` (répliques extraites et normalisées, rôles, seed, durée, garde-fous 6/5 images,
   aucune image → refus), avec tests unitaires. Bouton « Voir le brief Open H3 IR » sur la fiche (affiche le JSON, à coller dans `h3ir-lab`).
   L'utilisateur juge la correspondance sur ses vrais plans.
2. **(S) Rapport d'amont** chez `ruashots/open-h3-ir` : `render.py:407` (espace avant `!?;:`) et liaison des voix (`plan.py:482-498`).
3. **(M) Script Python « un appel » + branche du worker** derrière une option par plan ; résultat dans `agent_runs`. Mesurer le démarrage, vérifier `TestClient`,
   l'annulation, le verrou GPU. Sans rendu.
4. **(M) `depuisCompilationH3ir`** : sections, `plan_refs` depuis le manifeste, voix réécrites, typographie restaurée, diagnostics en avertissements, version
   d'historique. Comparer à plan-h3 dans la fiche, sans rendu.
5. **(M) Étape « choix des références »** (voir plus haut) + câblage avec `inventaire-assets`.
6. **(S) Relances d'échec** (seed+1, deux fois) et messages (décision 6).
7. **(M) Héritage créativité / style de caméra** : migration, réglages projet, scène, plan, passage au brief.
8. **(S) Alignements** : `plan-checks.ts` (1,2 s, durée effective), règle de coupe d'`iteration-plan`.
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
4. Bruitages `SFX_` : aucun rôle évident dans le paquet, comportement non étudié.
5. Langue de l'`intent` (français ou anglais) : qualité non vérifiée, à essayer avec `h3ir-lab`.
6. Liaison des voix sur le chemin rédigé (pas seulement le brouillon) : non vérifiée.
7. Cas `suite` : la continuité (fin du plan précédent) passe par l'`intent` seulement ; vérifier sur un vrai enchaînement.
