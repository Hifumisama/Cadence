# Cahier de tests

Ce qui est codé mais pas encore éprouvé en réel, avec comment le vérifier et quoi relever. Cocher au fur et à mesure, noter les chiffres dans
la colonne « Relevé » (ou juste sous la case) et dire à Claude ce qui a cassé : il lit les traces et la base.

Dernière mise à jour : 2026-10-27. Commits concernés : `ecc92e9` à `1d70b8b`.

## Déjà vérifié sans GPU (tests automatiques, `npm test`, 702 verts)

- Durées : plafond de 10 s partout où le code le contrôle ; répartition exacte des durées entre scènes ; ajustement des plans d'une scène.
- Traitement et scénario par scène : conversion en changements de proposition, scènes de même titre distinguées, plans d'une scène sans effet sur
  une autre.
- Verrou GPU : appels d'une création en parallèle entre eux, exclusifs face au reste.
- Budget de contexte : un appel ne part que s'il tient à côté des appels en cours et du cache retenu par les slots.
- Workflow ComfyUI : résolution injectée dans le nœud `22:9`, refus d'une résolution hors liste, **quels nœuds s'exécutent** pour chaque mode (l'upscale
  seulement en final à 0,2 MP ; le final natif exécute l'interpolation, aucun nœud d'upscale ; l'aperçu ni l'un ni l'autre), tous les liens du graphe
  pointent un nœud qui existe.
- Banc de mesure vidéo : les neuf variantes produisent un graphe valide (liens, nœuds exécutés), et le script a tourné de bout en bout contre un faux serveur ComfyUI (soumission,
  historique, mesure de la mémoire, téléchargement, clips à lettres aléatoires). Jamais contre un vrai ComfyUI.

Ce qui n'est PAS couvert : tout ce qui a besoin d'un vrai modèle (LLM, ComfyUI) ou de la base.

## A. Au retour du PC de bureau (Docker + base)

- [ ] **A1. Migrations.** Lancer Docker Desktop puis `npm run db:migrate`. Attendu : « Migrations Cadence appliquées », colonnes `scenes.traitement`,
      `plans.megapixels`, `jobs.megapixels` présentes (`\d scenes`, `\d plans`, `\d jobs`).
- [ ] **A2. `npm test`.** Attendu : tout vert. Relevé : ____
- [ ] **A3. Une création de film court (2 à 3 min visées), `LLM_PARALLELE=3`, `LLM_CONTEXTE_TOTAL=44000`.**
      Attendu : étape « Traitement du film » (3 à 4 scènes) puis « Scénarios » avec une sous-tâche par scène, plusieurs en même temps ; aucun plan au-dessus
      de 10 s ; les plans de chaque scène suivent l'intention de la scène ; premier plan d'une scène suivant la précédente en `suite` seulement s'il continue
      la même action.
      Relevé : durée de l'étape traitement ____ s ; durée de l'étape scénarios ____ s ; nombre de scènes ____ ; nombre de plans ____ ; plans en `suite` ____ / ____.
- [ ] **A4. Une création de film long (10 min visées : déjà très long en contexte).** Attendu : 5 à 9 scènes, environ 60 à 100 plans, aucun plafond de sortie atteint.
      Relevé : durée totale de la création ____ ; étapes qui ont échoué ____ ; la relecture et l'inventaire tiennent dans le contexte : oui / non.
- [ ] **A5. Fiches de plan en parallèle.** Attendu : jamais plus de 2 fiches lourdes en même temps, plus aucun `Context size has been exceeded` ni
      `failed to find a memory slot` dans llama-swap. Relevé : nombre d'échecs ____ ; si échec, valeur de `LLM_CONTEXTE_TOTAL` essayée ____.
- [ ] **A6. Taux de cache du préfixe de scène.** Claude lance la requête de lecture du cache sur `scenario-scene`. Attendu : plus de 50 % repris.
- [ ] **A7. Lecture de quelques scènes (de l'œil).** Raccords entre scènes, états d'entrée et de sortie, dialogues. Relevé : jonctions qui sonnent faux ____.
- [ ] **A8. Un plan existant de plus de 10 s.** Attendu : le rendu est refusé avec « un plan dure 5 à 10 s » ; le raccourcir puis relancer passe.

- [ ] **A9. Console de rendu.** À 0,3 ou 0,4 MP : le bouton « Figer et rendre » remplace « Figer et prévisualiser », « Rendu final » disparaît, l'historique affiche
      « final · 0,4 MP ». À 0,2 MP : comme avant.
- [ ] **A10. Raccord `suite` entre deux résolutions.** Plan A rendu à 0,2 MP, plan B en `suite` rendu à 0,4 MP. Attendu : B démarre sur la dernière image de A (agrandie).
      Regarder si B part d'une image floue (hypothèse non vérifiée). Relevé : ____

## C. Plus tard, quand la 5070 Ti est de nouveau disponible

- [ ] **C1. Rendu à 0,4 MP à côté du LLM chargé.** Attendu : pas de mémoire insuffisante. Sinon : Claude fait décharger le LLM avant les rendus natifs
      (une ligne dans `worker/index.ts`).
- [ ] **C2. Temps d'un film de 10 min de bout en bout** (création plus rendus, 10 minutes déjà énormes en contexte) à 0,3 MP puis à 0,4 MP. Relevé : ____ / ____.
- [ ] **C3. Lire deux scénarios du même brief sans savoir lequel est lequel.** Un scénario écrit à l'ancienne (un seul appel pour tout l'épisode) et un écrit scène par scène, mélangés et
      sans étiquette : vous les lisez et dites lequel tient le mieux (cohérence, dialogues, rythme). Il faudra adapter le banc de skills existant (`npm run llm:banc`), qui compare
      aujourd'hui d'autres choses : à préparer ensemble au retour du PC.

## D. Pistes tirées de `ComfyUI_MiniMaxH3_Director` (lues, jamais essayées)

Dépôt : github.com/AIMixer/ComfyUI_MiniMaxH3_Director (Apache-2.0). C'est un nœud « directeur » monolithique (timeline dans le nœud) : on ne l'adopte pas,
Cadence est déjà le directeur. On regarde ce qui s'en détache. Lecture faite du README et des en-têtes de code, aucun nœud exécuté.

- [ ] **D1. Passe d'upscale avec un modèle sans LoRA turbo.** Leur workflow « deuxième échantillonnage » met le LoRA turbo sur la première passe et un UNET
      propre sur la seconde. Chez nous la passe d'upscale (nœuds `135:*`) réutilise le modèle turbo. Essai : même plan, passe d'upscale avec un chargeur
      de modèle sans LoRA. Effort : faible (workflow seul). Relevé : netteté ____ ; durée ____ s.
- [ ] **D2. Décalage de sigma audio : 3 (leur défaut) contre 6 (le nôtre, nœud `195`).** Variante `A1` du banc (bloc E) contre `V3` : même plan à voix, écouter la voix. Effort : nul.
- [ ] **D3. Continuité réelle d'un plan `suite` : pack `NikoDemon80/ComfyUI-H3-Motion-Context`** (GPL-3.0 : on l'installe comme nœud externe, on n'en
      copie pas le code ; ComfyUI 0.34 ou plus). Il garde la fin du clip précédent **dans l'espace latent** (22 images, sans décodage ni dérive de couleur)
      et **prolonge le son** (18 images d'audio) au lieu de le recommencer ; un nœud « Trim » rogne ensuite ce préfixe (0,92 s). Aujourd'hui `suite` ne reprend
      qu'une image fixe. Essai : charger `example_workflows/H3-Motion-Context-v0.7.json` du pack dans ComfyUI, chaîner deux clips (Save Latent du premier,
      Load Latent du second), regarder la vitesse et la direction du geste, et écouter la voix ou la musique à la jonction.
      Contraintes lues dans le README : même résolution dans toute la chaîne (le nœud refuse sinon) ; la qualité du son se dégrade au fil des liens (graves
      conservés, aigus perdus) ; les LoRA turbo coûtent aussi du son ; le préfixe pesé dans le temps d'échantillonnage (+15 % de calcul sur un plan de 10 s).
      Relevé : continuité du geste ____ ; son à la jonction ____ ; durée ____ s.
      À essayer aussi : le fork `seitanism/ComfyUI-H3-Motion-Context-MultiRef`, que le pack Context-Loop utilise comme « nœud Motion Context maintenu » (je n'ai pas
      comparé ses différences avec l'original).
- [ ] **D5. Échantillonneur Euler, puis « SelfLift » (première passe progressive).** Pack autonome : `facok/comfyui-SelfLift` (papier arXiv 2609.02036, validé
      sur des modèles d'images ; son mode H3 est expérimental, non validé par le papier ; **aucune licence déclarée** : on l'installe, on n'en copie pas le code).
      Il n'accepte que Euler. Trois essais dans l'ordre, même plan, même graine, à 0,4 MP :
      **D5a. L'échantillonneur seul** : variantes `S1` (euler), `S2` (`res_multistep` + `simple`, le réglage officiel) et `V3` (`er_sde`, le nôtre) du banc (bloc E), même plan, même graine. Ça isole
      l'effet de l'échantillonneur ; euler est le seul que SelfLift accepte. Relevé : netteté ____ ; mouvement ____ ; durée ____ s.
      **D5b. SelfLift sur le chemin H3** : nœud « SelfLift Progressive Sampler (MiniMax H3) » à la place de l'échantillonneur, `transition_step` 3 (3 étapes
      basses sur 4), `lowres_scale` 0,5, `rho` 0 avec l'agrandisseur latent H3 déjà chargé (`latent_upscale_models/`). Relevé : durée ____ s contre ____ s en D5a ;
      qualité ____.
      **D5c. Sans agrandisseur** (`upscaler_model` = none, `rho` 0,6, poids 1 / 1) : le réglage de départ conseillé par le pack pour H3. Relevé : artefacts ____.
- [ ] **D9. TST (« Temporal State Transport », même pack, arXiv 2609.08505).** Retouche le modèle à l'inférence (1 à 2 % de temps, sans entraînement) pour
      réduire les détails qui clignotent, la dérive de l'identité des personnages et des tenues, et les mouvements peu physiques. `tau` 0,2 (0,5 « visiblement
      trop fort »). Se place entre le chargeur de modèle et le guideur ; marche avec tout échantillonneur. Essai : un plan à plusieurs personnages, tau 0 contre
      0,2, même graine. Relevé : identité des personnages ____ ; clignotements ____. Incompatible avec le mode « highres_tiling » de SelfLift.
- [ ] **D6. « Semantic Bridge » (adaptateur de conditionnement ~11 Mo, qui réécrit les jetons du conditionnement avec un petit réseau : `H + alpha·(S − H)`,
      alpha 0,10 à 0,15).** Deux versions : l'originale (speach1sdef178, composition, comptage, relations spatiales) et **BUNNY** (JOKER141, entraînée pour les
      combats et les scènes à plusieurs personnages : qui frappe qui, à qui est l'arme, état conservé après une occultation ; ses propres chiffres : environ 60 %
      d'amélioration, 20 % sans différence, 10 % de régressions, hors protocole). **Attention : toutes deux sont distillées sur le chemin FL2VA, pas sur
      Ref2VA, qui est le nôtre.** L'auteur de la première a mesuré une articulation de voix et une synchro labiale dégradées en l'insérant en Ref2VA ; et le
      nœud de BUNNY réécrit tout le tenseur de jetons sans épargner ceux des images de référence (risque pour la fidélité des personnages, non mesuré).
      Essai (une insertion de nœud entre le nœud 5 et le guideur `125:14`) : 4 plans de combat **sans dialogue**, même seed, alpha 0 / 0,10 / 0,15 ; juger
      l'attribution des actions ET l'identité des personnages. À ne pas utiliser sur un plan qui parle tant que ce n'est pas tranché. Relevé : ____
      **Décision de principe (2026-10-27, avec l'utilisateur) :** le pont n'est applicable que sur un plan **sans réplique** (aucun `<d>` dans la fiche, donc aucun
      audio de référence) ; le code pourra le vérifier seul. Nuance : un cri ou un kiai écrit en `<d>` compte comme une réplique. Un réglage « pont » par plan
      (désactivé par défaut) n'est envisagé qu'après cet essai.
- [ ] **D8. À décider ensemble : une règle de scénario « dans une scène `action`, une réplique va dans son propre plan, en `coupe` ».** Pas codée. Pour : combat plus lisible, pont sémantique
      applicable (D6). Contre : plus de plans par combat (chacun coûte un rendu), un cri ou une réplique glissés dans l'action seraient coupés du geste, plus de raccords. Le plus raisonnable est
      d'attendre le résultat de D6 : sans gain démontré du pont, la règle coûte sans rapporter.

## E. Résolution, étapes et agrandissement : le banc (doc officielle ComfyUI lue le 2026-10-27)

Ce que dit la doc officielle (docs.comfy.org, pages MiniMax H3) et qui cadre ces essais :
- H3 est entraîné vers **1 MP** (arête courte 768, jusqu'à 1344×768 = 0,98 MP). 0,4 MP (864×480) est « rapide, correct pour des brouillons : montez les mégapixels
  avant un rendu final » ; « les images molles à la résolution native sont d'abord un problème de résolution, pas d'étapes ». Nous sommes à 20 / 30 / 40 % de la surface entraînée.
- **Le LoRA turbo à 4 étapes en Ref2VA** : « les jetons de référence interviennent à chaque étape, donc 4 étapes appliquent à peine les références (dérive de pose et de
  visage) ; pour un raccord serré, désactiver le turbo ou monter vers 25 ». Les schémas distillés lissent les détails fins (peau, tissu, cheveux). **La voix et le timbre
  demandent 12 étapes ou plus ; à 8 étapes l'audio est le maillon faible.** Compromis cité : fichier 4 étapes à 6 ou 8 étapes, force environ 0,8 (le temps suit le nombre
  d'étapes : le turbo raccourcit le calendrier, pas le coût d'une étape).
- **L'agrandisseur latent économise du temps, pas du pic de mémoire** : la passe de raffinage tourne à la taille cible. Son facteur est libre (1,0 à 4,0, défaut 2,0).
- Accélérations sur n'importe quel point de contrôle : **Sage Attention** (environ ×2) et **attention éparse `sol-attn`** (ComfyUI 0.35 ou plus, expérimental). **FastH3 (8 étapes
  distillé) ne gère pas Ref2VA** : inutilisable pour nous.

**Comment on mesure : le banc.** `npm run banc:video` soumet à un ComfyUI le même plan avec plusieurs variantes de réglages, **mesure le temps et le pic de mémoire GPU tout seul**, et
enregistre les clips sous des lettres tirées au hasard (`clip-A.mp4`…) pour les comparer à l'aveugle. Vous ne faites que regarder et noter.
- `npm run banc:video -- --liste` : les variantes (V1 à V6 : résolutions, étapes, upscale ; S1 et S2 : échantillonneur ; A1 : décalage audio).
- `npm run banc:video -- --url http://127.0.0.1:8188 --variantes V1,V2,V3,V4,V5,V6 --duree 6` : lance la série (plusieurs minutes par variante ; un échauffement charge d'abord les modèles).
- Il faut : ComfyUI démarré, le plan du fichier `workflows/video-generation/VID_REF2VA.json` utilisable (ses images et sa voix dans le dossier d'entrée de ComfyUI), le modèle d'upscale latent
  pour V1 et V5, le pack Nvidia VFX pour V6.
- Résultat dans `data/banc-video/<date>/` : les clips, `resultats.json` (temps, mémoire), `cle.json` (quelle lettre = quelle variante : **à ouvrir après avoir regardé**).

- [ ] **E1. Lancer le banc et juger à l'aveugle.** Regarder les clips, puis noter pour chaque lettre (ligne « Clip A »… de la page) : identité des personnages, précision du geste, voix, douceur de
      l'image, et un rang. Dire à Claude « j'ai rempli E1 » : il ouvre `cle.json` et `resultats.json` et fait le tableau (temps, pic de mémoire, notes) par variante. Ce que la série répond :
      **V2 contre V4** = les étapes comptent-elles plus que la résolution pour l'identité et la voix ? **V2 contre V3** = 0,3 ou 0,4 MP ? **V1 contre V5** = l'upscale latent vaut-il son coût, à quel
      facteur ? **V6** = l'agrandissement par pixels fait-il aussi bien ? Relevé : ____
- [ ] **E2. Agrandissement par pixels, à la même taille cible (à la main, seulement si V6 convainc).** Les mêmes clips à 0,3 et 0,4 MP, tous amenés à la même taille (par exemple 1920×1080) avec
      le nœud RTX Video Super Resolution (Comfy-Org, Apache-2.0, PyTorch cu130 ou plus, carte RTX) : la netteté se rapproche-t-elle d'un clip à l'autre ? Relevé : ____
- [ ] **E3. Accélérations (à la main).** (a) Sage Attention ; (b) `Model Sparse Attention` (méthode `sol-attn`, `verbose` activé pour vérifier qu'elle est active) ; (c) notre nœud `196`
      (backend « comfy kitchen attention ») avec le modèle `..._int8_convrot` : la doc dit que Comfy Kitchen ne gère pas ces points de contrôle (issue ComfyUI #15529) et signale des déformations
      en fin de clip : lire les avertissements du journal de ComfyUI et regarder les dernières secondes d'un plan. Relevé : gain de temps ____ ; défauts ____.

## Journal des résultats

(à remplir : date, test, résultat en une ligne, ce qui a cassé)

| Date | Test | Résultat | Remarque |
|---|---|---|---|
| 2026-10-27 | Directeur (ComfyUI_MiniMaxH3_Director) sur RunPod, 5090, 0,4 MP, clip de 26 s, gabarits bruts de RunPod | environ 26 min, qualité moyenne | Essai exploratoire des gabarits fournis, pas une comparaison avec le workflow de Cadence : sans suite. |
| | | | |
