# Cahier de tests

Ce qui est codé mais pas encore éprouvé en réel, avec comment le vérifier et quoi relever. Cocher au fur et à mesure, noter les chiffres dans
la colonne « Relevé » (ou juste sous la case) et dire à Claude ce qui a cassé : il lit les traces et la base.

Dernière mise à jour : 2026-10-29. Commits concernés : `ecc92e9` à `1d70b8b`.

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

- [x] **A1. Migrations.** Lancer Docker Desktop puis `npm run db:migrate`. Attendu : « Migrations Cadence appliquées », colonnes `scenes.traitement`,
      `plans.megapixels`, `jobs.megapixels` présentes (`\d scenes`, `\d plans`, `\d jobs`).
- [x] **A2. `npm test`.** Attendu : tout vert. Relevé : ____
- [x] **A3. Une création de film court (2 à 3 min visées), `LLM_PARALLELE=3`, `LLM_CONTEXTE_TOTAL=44000`.**
      Attendu : étape « Traitement du film » (3 à 4 scènes) puis « Scénarios » avec une sous-tâche par scène, plusieurs en même temps ; aucun plan au-dessus
      de 10 s ; les plans de chaque scène suivent l'intention de la scène ; premier plan d'une scène suivant la précédente en `suite` seulement s'il continue
      la même action.
      Relevé : durée de l'étape traitement ____ s ; durée de l'étape scénarios ____ s ; nombre de scènes ____ ; nombre de plans ____ ; plans en `suite` ____ / ____.
- [ ] **A4. Une création de film long (10 min visées : déjà très long en contexte).** Attendu : 5 à 9 scènes, environ 60 à 100 plans, aucun plafond de sortie atteint.
      Relevé : durée totale de la création ____ ; étapes qui ont échoué ____ ; la relecture et l'inventaire tiennent dans le contexte : oui / non.
- [x] **A5. Fiches de plan en parallèle.** Attendu : jamais plus de 2 fiches lourdes en même temps, plus aucun `Context size has been exceeded` ni
      `failed to find a memory slot` dans llama-swap. Relevé : nombre d'échecs ____ ; si échec, valeur de `LLM_CONTEXTE_TOTAL` essayée ____.
- [x] **A6. Taux de cache du préfixe de scène.** Claude lance la requête de lecture du cache sur `scenario-scene`. Attendu : plus de 50 % repris.
- [x] **A7. Lecture de quelques scènes (de l'œil).** Raccords entre scènes, états d'entrée et de sortie, dialogues. Relevé : jonctions qui sonnent faux ____.
- [x] **A8. Un plan existant de plus de 10 s.** Attendu : le rendu est refusé avec « un plan dure 5 à 10 s » ; le raccourcir puis relancer passe.

- [x] **A9. Console de rendu.** À 0,3 ou 0,4 MP : le bouton « Figer et rendre » remplace « Figer et prévisualiser », « Rendu final » disparaît, l'historique affiche
      « final · 0,4 MP ». À 0,2 MP : comme avant.
- [x] **A10 — ÉCARTÉ le 2026-10-28 : « ça n'en vaut pas la peine, on fera différemment ».** **A10. Raccord `suite` entre deux résolutions.** Plan A rendu à 0,2 MP, plan B en `suite` rendu à 0,4 MP. Attendu : B démarre sur la dernière image de A (agrandie).
      Regarder si B part d'une image floue (hypothèse non vérifiée). Relevé : ____

## C. Plus tard, quand la 5070 Ti est de nouveau disponible

- [x] **C1. Rendu à 0,4 MP à côté du LLM chargé.** Attendu : pas de mémoire insuffisante. Sinon : Claude fait décharger le LLM avant les rendus natifs
      (une ligne dans `worker/index.ts`).
- [x] **C2. Temps d'un film de 10 min de bout en bout** (création plus rendus, 10 minutes déjà énormes en contexte) à 0,3 MP puis à 0,4 MP. Relevé : ____ / ____.
- [ ] **C3. Lire deux scénarios du même brief sans savoir lequel est lequel.** Un scénario écrit à l'ancienne (un seul appel pour tout l'épisode) et un écrit scène par scène, mélangés et
      sans étiquette : vous les lisez et dites lequel tient le mieux (cohérence, dialogues, rythme). Il faudra adapter le banc de skills existant (`npm run llm:banc`), qui compare
      aujourd'hui d'autres choses : à préparer ensemble au retour du PC.

## D. Pistes tirées de `ComfyUI_MiniMaxH3_Director` (lues, jamais essayées)

Dépôt : github.com/AIMixer/ComfyUI_MiniMaxH3_Director (Apache-2.0). C'est un nœud « directeur » monolithique (timeline dans le nœud) : on ne l'adopte pas,
Cadence est déjà le directeur. On regarde ce qui s'en détache. Lecture faite du README et des en-têtes de code, aucun nœud exécuté.

- [x] **D1. Passe d'upscale avec un modèle sans LoRA turbo.** Leur workflow « deuxième échantillonnage » met le LoRA turbo sur la première passe et un UNET
      propre sur la seconde. Chez nous la passe d'upscale (nœuds `135:*`) réutilise le modèle turbo. Essai : même plan, passe d'upscale avec un chargeur
      de modèle sans LoRA. Effort : faible (workflow seul). Relevé : netteté ____ ; durée ____ s.
- [x] **D2. Décalage de sigma audio : 3 (leur défaut) contre 6 (le nôtre, nœud `195`).** Variante `A1` du banc (bloc E) contre `V3` : même plan à voix, écouter la voix. Effort : nul.
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
- [x] **D5 — ÉCARTÉ : ne sera pas testé.** **D5. Échantillonneur Euler, puis « SelfLift » (première passe progressive).** Pack autonome : `facok/comfyui-SelfLift` (papier arXiv 2609.02036, validé
      sur des modèles d'images ; son mode H3 est expérimental, non validé par le papier ; **aucune licence déclarée** : on l'installe, on n'en copie pas le code).
      Il n'accepte que Euler. Trois essais dans l'ordre, même plan, même graine, à 0,4 MP :
      **D5a. L'échantillonneur seul** : variantes `S1` (euler), `S2` (`res_multistep` + `simple`, le réglage officiel) et `V3` (`er_sde`, le nôtre) du banc (bloc E), même plan, même graine. Ça isole
      l'effet de l'échantillonneur ; euler est le seul que SelfLift accepte. Relevé : netteté ____ ; mouvement ____ ; durée ____ s.
      **D5b. SelfLift sur le chemin H3** : nœud « SelfLift Progressive Sampler (MiniMax H3) » à la place de l'échantillonneur, `transition_step` 3 (3 étapes
      basses sur 4), `lowres_scale` 0,5, `rho` 0 avec l'agrandisseur latent H3 déjà chargé (`latent_upscale_models/`). Relevé : durée ____ s contre ____ s en D5a ;
      qualité ____.
      **D5c. Sans agrandisseur** (`upscaler_model` = none, `rho` 0,6, poids 1 / 1) : le réglage de départ conseillé par le pack pour H3. Relevé : artefacts ____.
- [x] **D9 — ÉCARTÉ : pas nécessaire (les personnages dérivent déjà peu, d'autres leviers existent).** **D9. TST (« Temporal State Transport », même pack, arXiv 2609.08505).** Retouche le modèle à l'inférence (1 à 2 % de temps, sans entraînement) pour
      réduire les détails qui clignotent, la dérive de l'identité des personnages et des tenues, et les mouvements peu physiques. `tau` 0,2 (0,5 « visiblement
      trop fort »). Se place entre le chargeur de modèle et le guideur ; marche avec tout échantillonneur. Essai : un plan à plusieurs personnages, tau 0 contre
      0,2, même graine. Relevé : identité des personnages ____ ; clignotements ____. Incompatible avec le mode « highres_tiling » de SelfLift.
- [x] **D6 — ÉCARTÉ le 2026-10-28 : testé, trop instable ; et MiniMax H3 Singularity fait mieux.** Relevé (3 prompts identiques, conditionneurs adaptés) : le pont a un vrai effet sur le prompt, souvent dans le bon sens ; la version de référence est plutôt propre à 0,4 MP et plus ; BUNNY dégrade la qualité générale mais accentue beaucoup le mouvement de caméra ; la version normale ajoute du bruit et des artefacts ; temps identiques. Résultat jugé « bien trop instable ». Les workflows du labo sont supprimés. **D6. « Semantic Bridge » (adaptateur de conditionnement ~11 Mo, qui réécrit les jetons du conditionnement avec un petit réseau : `H + alpha·(S − H)`,
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
      d'attendre le résultat de D6 : sans gain démontré du pont, la règle coûte sans rapporter. *(2026-10-28 : D6 écarté, le pont ne sera pas adopté ; l'argument « pont applicable » tombe, il ne reste que la lisibilité du combat.)*
- [x] **D11 — ÉCARTÉ le 2026-10-28 : doublon de E5b** (le nœud de kijai est obsolète, le cœur de ComfyUI a intégré Sol-Attn en bêta ; workflow supprimé). **D11. Attention « Sol-Attn » de kijai (`ComfyUI-SolAttn_triton`).** Noyau d'attention pour les cartes Blackwell (SM89 à SM121, donc votre 5070 Ti). Mesures de son auteur sur une 5090 :
      de 1,14 à 1,44 fois plus rapide que SageAttention, et 37 % de pic de mémoire en moins sur les couches MLP. À essayer avant tout autre accélérateur : un seul nœud, et il vise votre carte. Source :
      l'index communautaire `MiniMax-AI/awesome-minimax-h3-integration` (chiffres rapportés par les auteurs, non vérifiés). Relevé : durée ____ s ; pic de mémoire ____ Go.
- [x] **D12 — ÉCARTÉ le 2026-10-28 : PDD ne sera pas utilisé ; workflow supprimé.** **D12. LoRA d'accélération « PDD » pour Ref2VA, 8 étapes (Alibaba PAI, `MiniMax-H3-Ref2VA-Acc-8Step`).** Comparée à notre LoRA turbo ref2v v0.1 à 4 étapes (que la doc officielle dit appliquer « à peine » les
      références). Les notes de la communauté : à 4 étapes, PDD aplatit les textures ; à 8 étapes, l'écart avec le turbo se referme. Le cœur de ComfyUI la charge avec son support des « banques de LoRA » (un LoRA de base plus 32 têtes de sortie, perdues sans erreur par un chargeur qui ne les connaît pas). Selon l'index officiel, le pack `Jalen-Brunson/ComfyUI-MiniMax-H3-PDD-Acc` n'est utile que sur un ComfyUI plus ancien ; à confirmer en rendu (vérifié le 2026-10-28 : sources en ligne seulement). Licence MiniMax-H3 Community. Essai à la main (pas dans le banc : cette LoRA a un format particulier) : même plan, même graine, turbo 4 étapes contre PDD 8 étapes (environ deux fois plus long). Les autres LoRA
      candidates (LarryVRH, HyperFlow) sont dans le banc : voir E2. Relevé : identité ____ ; voix ____ ; durée ____ s.
- [x] **D13 — ÉCARTÉ le 2026-10-28 : jugé peu utile ; workflow supprimé.** **D13. « Ref Patch » (148 Mo, Apache-2.0, `lihaoyun6/MiniMax-H3-Ref-Patch`, avec son nœud `ComfyUI-MiniMaxH3_Ref-Patch`).** L'index dit que FL2VA donne en général une meilleure qualité brute que
      Ref2VA, qui accepte plus de références mais a une qualité de base plus basse ; ce patch fait imiter Ref2VA par FL2VA, en partie. Si ce qui vous déçoit vient de Ref2VA lui-même, c'est une piste.
      Essai : même plan, Ref2VA contre FL2VA + Ref Patch. Relevé : identité ____ ; netteté ____ ; durée ____ s.
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
- `npm run banc:video -- --liste` : les variantes (V1 à V6 : résolutions, étapes, upscale ; S1 et S2 : échantillonneur ; A1 : décalage audio ; L1, L2 et H1 : LoRA d'accélération ; K1 et K2 : formulation du prompt).
- `npm run banc:video -- --url http://127.0.0.1:8188 --variantes V1,V2,V3,V4,V5,V6 --duree 6` : lance la série (plusieurs minutes par variante ; un échauffement charge d'abord les modèles).
- Il faut : ComfyUI démarré, le plan du fichier `workflows/video-generation/VID_REF2VA.json` utilisable (ses images et sa voix dans le dossier d'entrée de ComfyUI), le modèle d'upscale latent
  pour V1 et V5, le pack Nvidia VFX pour V6.
- Résultat dans `data/banc-video/<date>/` : les clips, `resultats.json` (temps, mémoire), `cle.json` (quelle lettre = quelle variante : **à ouvrir après avoir regardé**).

- [ ] **E1. Lancer le banc et juger à l'aveugle.** Regarder les clips, puis remplir la ligne de chaque lettre dans le tableau de la page, avec **des notes de 1 à 5** (5 = très bien) :
      **Identité** = les personnages ressemblent à leurs images de référence (visage, tenue) tout au long du clip ; **Geste** = le mouvement est précis et lisible (coups, mains, impacts) ;
      **Voix** = timbre et clarté, bouche synchrone (si le plan parle) ; **Douceur** = netteté des détails (peau, tissu, cheveux ; 5 = très net) ; **Rang** = 1 pour le clip que vous garderiez,
      2 pour le suivant, etc. Ce qui n'entre pas dans une note (défaut en fin de clip, artefact, impression) va dans la **remarque** libre sous le tableau. Dire à Claude « j'ai rempli E1 » : il ouvre
      `cle.json` et `resultats.json` et fait le tableau (temps, pic de mémoire, notes) par variante. Ce que la série répond : **V2 contre V4** = les étapes comptent-elles plus que la résolution pour
      l'identité et la voix ? **V2 contre V3** = 0,3 ou 0,4 MP ? **V1 contre V5** = l'upscale latent vaut-il son coût, à quel facteur ? **V6** = l'agrandissement par pixels fait-il aussi bien ? Relevé : ____
- [x] **E2 — TESTÉ le 2026-10-28 à la main (3 cas, voir le journal) : on garde le LoRA turbo de base.** **E2. Quel LoRA d'accélération ? (banc : `V2`, `V4`, `L1`, `L2`, `H1`)** Votre liste : **HyperFlow** (Video Rebirth, 8 étapes, couvre t2va, fl2va et ref2va ; conversion ComfyUI de
      `drbaph/MiniMax-H3-Turbo-Lora-ComfyUI`, fichier `..._pruned_bf16` pour notre modèle élagué ; sa fiche donne une grille de sigmas fixe, que le banc applique, et l'auteur de la conversion note
      qu'elle n'est pas rigoureusement équivalente à l'original) et **LarryVRH v4 step600 EMA** (le défaut conseillé par l'index communautaire, mais **c'est un LoRA FL2V** : « chaque fichier turbo est
      propre à un mode » selon la doc officielle, donc son effet sur notre modèle Ref2VA est à constater). Variantes : `V2` = notre LoRA ref2v v0.1, 6 étapes (le réglage du workflow depuis le 2026-10-28 : l'utilisateur a constaté que 6 étapes améliorent beaucoup la voix pour un temps à peine plus long) ; `V4` = le même à 8 étapes, force 0,8 ;
      `L1` = LarryVRH, 4 étapes ; `L2` = LarryVRH, 8 étapes, euler ; `H1` = HyperFlow, 8 étapes. Même notation que E1. Il faut les fichiers dans `models/loras` : le banc dit lesquels manquent et
      où les prendre. Relevé : ____
- [x] **E3 — ÉCARTÉ : ne sera pas fait (raison non notée dans l'artefact).** **E3. Deux formulations du même prompt (banc : `K1` et `K2`, avec `--prompt`).** Notre code écrit « Hard cut to » à chaque coupe ; le guide officiel de MiniMax n'emploie jamais cette formule : il
      écrit « the camera cuts to », « the shot cuts to », « transitions to »… Copier le prompt assemblé d'un plan de Cadence (page du plan) dans un fichier texte, puis
      `npm run banc:video -- --variantes K1,K2 --prompt ce-fichier.txt`. `K1` = tel quel, `K2` = formule officielle. Même notation que E1. Relevé : ____
- [x] **E4. Agrandissement par pixels, à la même taille cible (à la main, seulement si V6 convainc).** Les mêmes clips à 0,3 et 0,4 MP, tous amenés à la même taille (par exemple 1920×1080) avec
      le nœud RTX Video Super Resolution (Comfy-Org, Apache-2.0, PyTorch cu130 ou plus, carte RTX) : la netteté se rapproche-t-elle d'un clip à l'autre ? Relevé : ____
- [x] **E5. Accélérations (à la main).** (a) Sage Attention ; (b) nœud du cœur de ComfyUI `Model Sparse Attention`, méthode `sol-attn` (la seule qui marche sur n'importe quel point de contrôle ; `verbose`
      activé pour vérifier qu'elle est active) ; (c) notre nœud `196` (backend « comfy kitchen attention ») avec le modèle `..._int8_convrot` : la doc dit que Comfy Kitchen ne gère pas ces points de contrôle
      (issue ComfyUI #15529) et signale des déformations en fin de clip : lire les avertissements du journal de ComfyUI et regarder les dernières secondes d'un plan. **À propos de « H3 SLA » :** les LoRA
      `Turbo-SLA` (lightx2v) sont des LoRA FL2V à 4 étapes qui supposent le noyau d'attention éparse « SLA » (sparsité 0,85, environ 2,5 fois plus rapide sur une 5090 d'après leur fiche, hors ComfyUI) ;
      aucun n'existe pour Ref2VA à ma connaissance. Relevé : gain de temps ____ ; défauts ____.

- [ ] **E6. Notre skill `plan-h3` contre le compilateur OpenH3-IR (`ruashots/open-h3-ir`, Apache-2.0), à l'aveugle.** Hypothèse de l'utilisateur : un compilateur de prompt dédié, alimenté par la
      page du plan, donne des prompts plus pertinents et plus stables que notre skill, et simplifierait aussi l'itération (sa route `PATCH /v1/briefs/{id}` affine un brief « en langage courant »).
      À mesurer, pas à supposer. Protocole : **huit vrais plans** (combat, dialogue, plans en `suite`). Pour chacun, trois prompts : (1) le nôtre ; (2) et (3) **deux compilations du même plan**
      par OpenH3-IR, réglage `restrained`, nombre de plans imposé, pièces jointes avec leurs rôles (`frame_anchor_first` pour l'image de raccord, `subject`, `environment`, `voice_timbre`),
      répliques en `--say`, et pour chaque voix une **description écrite de son timbre et de sa manière de dire** (son README : sans elle la référence audio « ne contribue à rien », et il n'invente
      pas de timbre). Deux compilations parce que « un seul essai ne mesure rien » (il le dit lui-même) : on veut la variance. Rendu : `npm run banc:video -- --prompts nous.txt,compilo-a.txt,compilo-b.txt`
      (un clip par fichier, même graine, même réglage, lettres aléatoires). Notation comme E1. À relever aussi : temps et nombre d'appels LLM par plan et par voie ; ce que dit son validateur de **nos**
      prompts (gratuit, demande d'installer son paquet : à décider) ; pour l'itération, trois corrections demandées en clair sur un plan raté, par `PATCH` contre notre `iteration-plan`, avec le
      diff des sections (ce qui a bougé sans qu'on l'ait demandé). Précautions si on l'installe : `h3ir serve --host 127.0.0.1` (il écoute sur toutes les interfaces par défaut) et
      `H3IR_ALLOW_ASSET_PATHS=0` si les fichiers sont envoyés plutôt que lus par chemin. Relevé : ____

## F. Le nouveau VID_REF2VA en deux temps : génération, puis finition (2026-10-29)

Décisions prises après le labo : modèle **Singularity**, LoRA turbo de base, 6 étapes, **0,4 MP verrouillé**, **24 ips** (la cadence est liée au modèle : on n'y touche pas), Motion Context approuvé.
Les workflows sont dans `workflows/labo/` (README du dossier, section « GEN / FIN »). **Rien n'a encore été lancé** : tout ce qui suit est écrit d'après le code source des nœuds. Mettre dans `input/` de ComfyUI `CHAR_Tifa.png`, `DEC_Ruelle_Secteur7.png`, `CHAR_Soldat_Shinra.png` et `VOICE_maya_P230.flac`.
Idée de fond : le latent est gardé sur disque, la finition (super-résolution, RIFE en option) repart de lui sans relancer le sampler, dans n'importe quel ordre. **Ne jamais repartir d'une vidéo déjà agrandie.**

- [ ] **F1. GEN puis FIN : le latent sauvegardé se redécode-t-il ? (`LABO_GEN.json` puis `LABO_FIN.json`)** Lancer `LABO_GEN` (latent dans `output/h3_latents/clip_00001.safetensors`, aperçu mp4 24 ips), puis `LABO_FIN` sur ce fichier (charge le latent, décode image et son, RTX VSR 1080p, vidéo finale). **C'est le test qui conditionne tout le reste** : on suppose que le nœud de chargement rend un latent que les décodeurs acceptent. Comparer la finition à l'aperçu de GEN (image, son identique) et au clip équivalent de E4. Relevé : poids du fichier latent, durée de GEN, durée de FIN.
  Attendu : la vidéo de FIN a la même image et le même son que l'aperçu de GEN, en plus net ; FIN ne charge ni le modèle de diffusion ni le CLIP.

- [ ] **F2. Plan en `suite` : `LABO_GEN_suite.json` puis `LABO_FIN_suite.json`** Faire d'abord un `LABO_GEN` (clip 1), puis `LABO_GEN_suite` (charge `clip_index` 1, sauvegarde le sien en 2), puis `LABO_FIN_suite` sur le latent 2. Questions ouvertes : le latent sauvegardé contient-il les 22 images de préfixe ? la valeur `trim_frames` de 22 est-elle la bonne (la vraie sort de `303`, que FIN ne calcule pas) ? la jonction image et son est-elle aussi bonne que dans D3 ? Relevé : ____
  Attendu : la vidéo finale commence où finit le clip 1, sans le préfixe répété ; le geste continue, la voix ne saute pas.

- [ ] **F3. RIFE en option : avant ou après la super-résolution ? (`LABO_FIN.json` contre `LABO_FIN_RIFE.json`)** `LABO_FIN_RIFE` met RIFE (24 → 48 ips) **avant** la super-résolution. Chronométrer, puis refaire avec l'ordre inverse (brancher RIFE `313` sur la sortie de `311`, et `311` sur `176`). Hypothèse : si la super-résolution coûte moins de 0,8 fois RIFE à 2 MP par image, RIFE d'abord est moins cher ; sinon, l'inverse. Regarder aussi les fantômes de RIFE sur les mouvements rapides (le combat de Tifa). Relevé : ____
  Attendu : un ordre est nettement plus rapide ou plus propre ; sans RIFE, l'ordre ne compte pas.

- [ ] **F4. U1. Upscale latent ×1,5 à 0,2 MP (`LABO_U1_LatentUpscale_x1.5.json`)** Le sélecteur `122` de la prod a fait agrandir le latent vide au lieu du résultat du sampler (observé le 2026-10-29) : il est retiré dans U1, `242` lit directement `125:12`. À vérifier : le Sampler #1 tourne bien avant l'upscale ; le facteur ×1,5 s'applique par côté ou par surface (taille obtenue ~ 0,45 MP si par côté) ; netteté à pixels comparables avec le natif 0,4 MP. **Si ça passe, le même sélecteur est à retirer de `VID_REF2VA.json` (prod).** Relevé : ____
  Attendu : un clip net, plus que le latent seul à 0,2 MP ; ordre d'exécution : sampler, puis upscale.

- [ ] **F5. U2. SeedVR2 3B fp8 jusqu'à 1080p (`LABO_U2_SeedVR2_fp8_1080p.json`)** Installer `numz/ComfyUI-SeedVR2_VideoUpscaler`. Réglages de départ : 16 blocs échangés vers le CPU (monter jusqu'à 32 si la mémoire manque), VAE en tuiles, lots de 21 images, chevauchement 3. Le README du pack annonce 18 Go minimum sans échange de blocs : sur 16 Go, la mémoire est le point à surveiller. Les noms d'entrées sont lus dans le code source, jamais exécutés. À comparer à E4 (RTX VSR) sur le même clip. Relevé : ____
  Attendu : un clip 1080p plus fin que RTX VSR, sans scintillement, dans les 16 Go.

- [ ] **F6. U3. FlashVSR ×2 (`LABO_U3_FlashVSR_x2.json`)** Installer `lihaoyun6/ComfyUI-FlashVSR_Ultra_Fast` et poser le dossier `FlashVSR` (HF `JunhaoZhuang/FlashVSR`) dans `models/`. Mode `tiny-long`, ×2 (≈ 1,7 MP, pas exactement 1080p), minimum 21 images en entrée. Il utilise une attention éparse de type Sage : le module `sageattention` manquait pour E5a. Relevé : ____
  Attendu : un clip ×2 net et stable, plus rapide que SeedVR2.

- [ ] **F7. Open H3 IR : la page d'essai (`h3ir-lab/`)** Dans `h3ir-lab`, lancer `.venv\Scripts\python.exe serveur.py`, puis ouvrir http://127.0.0.1:8421. Le `.env` pointe sur le llama-swap (`llamacpp-local.radiant-garden.fr/v1`) ; `h3ir doctor` a répondu `vision_ok: True` avec `gemma4-26b-A4B-v2`. Essais : une intention courte (sans images), puis avec des références ; le sélecteur de modèle (la relance du service) ; les réalisateurs livrés avec le paquet ; le volet de comparaison avec un prompt de `plan-h3` ; une correction en langage courant (`PATCH`). Le service ne passe pas par le verrou GPU de Cadence : pas pendant un rendu. Relevé : ____
  Attendu : un prompt H3 propre avec ses diagnostics, comparable à celui de `plan-h3`.

## G. Open H3 IR : quel modèle de langage pour compiler les prompts ?

Question : le modèle de `plan-h3` (qwen, jugé un peu trop gros) est-il nécessaire pour Open H3 IR, ou un modèle plus petit compile-t-il aussi bien ? La page `h3ir-lab` a un **sélecteur de modèle** (liste lue sur le llama-swap) ; changer de modèle relance le service en quelques secondes, et llama-swap charge le modèle à la première compilation (compter ce chargement à part).
Protocole pour que les modèles se comparent : **mêmes briefs, même seed, même réglage** (`effort` standard, `creativity` balanced) pour tous. Le prompt compilé est lu **à l'aveugle autant que possible** : relever d'abord le tableau mécanique (statut, durée, diagnostics), puis juger les prompts sans regarder quel modèle les a écrits. Une compilation unique ne mesure rien : refaire avec une 2e seed (7, puis 8).
**Brief A (court, sans image)** : « Une guerrière se bat dans une ruelle sous la pluie face à un soldat en armure ; elle enchaîne trois coups, le jette contre des caisses, puis sourit à la caméra. » 8 s, 16:9, 5 plans. Réplique mot pour mot : « Essaie encore, haha ! » (French). **Brief B (dialogue)** : deux personnages se disputent à voix basse dans un couloir, 6 s, 2 répliques de votre choix, 3 plans. **Brief C (avec images)** : le brief A avec `CHAR_Tifa.png` (subject), `DEC_Ruelle_Secteur7.png` (environment), `CHAR_Soldat_Shinra.png` (subject) et la voix `VOICE_maya_P230.flac` (voice_timbre, avec une note sur le timbre).
Ne pas lancer pendant un rendu ComfyUI ni une création de projet : le service ignore le verrou GPU de Cadence, et llama-swap décharge un modèle pour en charger un autre.

- [ ] **G1. Contrôle de chaque modèle : joignable, vision (`h3ir doctor`)** Pour chaque modèle du sélecteur : `H3IR_LLM_MODEL` = ce modèle, puis `h3ir doctor` (depuis `h3ir-lab`, avec les variables du `.env` chargées). Relever `chat_ok`, la latence et `vision_ok`. Déjà fait : `gemma4-26b-A4B-v2` répond `vision_ok: True` (latence 23 s, chargement compris). Un modèle sans vision ne pourra pas faire le brief C.
  Attendu : chaque modèle répond ; on sait lesquels voient les images.

- [ ] **G2. Brief A (court, sans image) : la mécanique** Pour chaque modèle, compiler le brief A (seed 7) dans la page. Relever : le statut (`ready` / `degraded` / `needs_input`), la durée de compilation (hors chargement du modèle : lancer une première compilation pour le charger, noter la seconde), le nombre d'erreurs (`ERROR`) et d'avertissements dans les diagnostics, le nombre de jetons du prompt, et si le **nombre de plans demandé (5)** et la **réplique mot pour mot** sont respectés.
  Attendu : ready, 5 plans, réplique intacte, aucune erreur de diagnostic.

- [ ] **G3. Brief A : la qualité des prompts, à l'aveugle** Copier les prompts compilés dans un fichier, sans le nom du modèle, mélangés. Lire chacun et noter de 1 à 5 : **Fidélité** (l'action demandée est toute là, dans l'ordre) ; **Cinéma** (cadrages, mouvements, rythme des coupes lisibles) ; **Style H3** (le prompt ressemble à ceux du guide officiel, sans formules parasites) ; **Rang** (1 = celui que vous garderiez). Dire à Claude « j'ai rempli G3 » : il retrouve quel modèle est derrière chaque ligne. Facultatif : rendre les deux ou trois meilleurs avec `npm run banc:video -- --prompts a.txt,b.txt,c.txt` pour juger la vidéo et pas seulement le texte.
  Attendu : au moins un petit modèle est dans le haut du classement, ou on sait pourquoi non.

- [ ] **G4. Brief B (dialogue) : les répliques restent-elles mot pour mot ?** Même protocole, brief B (2 répliques de votre choix, une en français, une en anglais pour voir la langue). Ce qu'on regarde surtout : répliques intactes et bien attribuées, balises de langue correctes, durée de parole plausible pour 6 s.
  Attendu : répliques intactes, attribuées au bon personnage.

- [ ] **G5. Brief C (avec images et voix) : seulement pour les modèles à vision** Brief A avec les trois images et la voix (note de timbre à écrire dans la page : le service n'invente pas de timbre). Relever si les sujets sont reconnus (la tenue de Tifa, le casque du soldat, la ruelle), si le manifeste associe bien chaque pièce à un rôle, et le temps (plus long avec des images). Un modèle sans vision doit échouer proprement (statut `degraded` ou erreur claire) : le noter aussi.
  Attendu : les références sont décrites fidèlement et rattachées à leur rôle.

- [ ] **G6. Affiner en langage courant (`PATCH`) et comparaison avec `plan-h3`** Sur le meilleur résultat de G3 et sur le moins bon : demander trois corrections en clair (par exemple « moins de plans, plus lents », « la caméra reste à hauteur d'yeux », « ajoute de la pluie au son »), vérifier dans le diff des sections que **seul ce qui était demandé** a bougé. Puis coller dans le volet de comparaison le prompt que `plan-h3` écrit pour la même intention. Relevé : ____
  Attendu : la correction touche ce qu'on a demandé et rien d'autre.

- [ ] **G7. Conclusion : quel modèle pour quel usage ?** À remplir à la fin : le plus petit modèle qui suffit (et s'il tient à côté d'un rendu ComfyUI sans verrou), celui à garder pour les cas avec images, la décision sur l'intégration d'Open H3 IR dans Cadence (oui, non, ou seulement comme outil de labo). Relevé : ____

## Journal des résultats

(à remplir : date, test, résultat en une ligne, ce qui a cassé)

| Date | Test | Résultat | Remarque |
|---|---|---|---|
| 2026-10-27 | Directeur (ComfyUI_MiniMaxH3_Director) sur RunPod, 5090, 0,4 MP, clip de 26 s, gabarits bruts de RunPod | environ 26 min, qualité moyenne | Essai exploratoire des gabarits fournis, pas une comparaison avec le workflow de Cadence : sans suite. |
| 2026-10-27 | A1, A2, A7, A9 | ok | |
| 2026-10-27 | A3, A5, A6 | ok à l'œil ; mesures précises à prendre dans les traces du projet « Avatar: Intro version FF » | Sous très forte charge la carte arrête certains flux qui ne passent pas en parallèle, mais les contextes tiennent. |
| 2026-10-27 | A8 | rendu détecté mais **mettable en file** | Corrigé le 2026-10-28 : `creerJobRelance` refuse un plan de plus de 10 s (aucun essai créé). |
| 2026-10-27 | C1 | 0,3 MP : 3 min 04 s sous charge LLM ; 0,4 MP : environ 5 min ; aucun débordement mémoire | Le LLM ralentit pendant le rendu, sans planter. |
| 2026-10-27 | C2 | écarté | Estimation : environ 2 min 30 par plan quand la carte est libre, soit environ 4 h 20 pour un film de 10 min. |
| 2026-10-27 | D1 | sans changement visible | Pas retenu pour l'instant. |
| 2026-10-27 | D2 | décalage audio 3 meilleur : la voix fait moins « toc » | Appliqué le 2026-10-28 dans `VID_REF2VA.json` (nœud 195). `VID_Create_Voice_Master.json` reste à 6. |
| 2026-10-27 | D5, D9 | non testés | Écartés par l'utilisateur. |
| 2026-10-28 | Étapes | 6 étapes : voix bien meilleure, temps de génération à peine plus long | Appliqué à `VID_REF2VA.json` et `VID_Create_Voice_Master.json` (qui passe aussi à 0,3 MP et décalage audio 3). |
| 2026-10-28 | E6 (audit gratuit) | validateur d'OpenH3-IR sur nos 4 fixtures : 2 erreurs, 5 alertes | Voir `docs/ECARTS_GUIDES_H3.md` : pas de type de mouvement de caméra du vocabulaire fermé, formule de coupe hors de son ensemble, descriptions courtes (82 à 231 mots contre 350 à 500 conseillés), musique sans tempo. Ses 23 contrôles passent chez nous. |
| 2026-10-28 | A3, A5, A6 (mesures, projet « Avatar: Intro version FF ») | Création de 15 min 28 s : traitement 84 s, scénarios 108 s (3 scènes en parallèle), fiches 8 min 49 s (une par une) ; 3 scènes, 9 plans de 10 s, 5 en `suite` ; aucune erreur de contexte ni de slot ; **cache de préfixe de `scenario-scene` : 0 %** (3 appels simultanés) contre 70 % pour `plan-h3` | A6 non atteint (attendu plus de 50 %). Rendus à 0,4 MP : environ 2 min 46 s chacun ; un à 6 min 02 s pendant une itération de plan. |
| 2026-10-28 | D6 (Semantic Bridge, versions de référence, BUNNY, normale) | écarté : effet réel sur le prompt mais résultat trop instable | BUNNY : qualité dégradée, caméra bien plus marquée ; la normale : bruit et artefacts ; temps identiques. |
| 2026-10-28 | MiniMax H3 Singularity | améliore nettement le modèle de base, « sans aucune discussion possible » | Fait mieux que le pont sémantique (agit plus profondément, selon l'utilisateur). Réglages et mesures non notés. |
| 2026-10-28 | D11, D13 | non testés | D11 doublon de E5b ; D13 jugé peu utile ; workflows supprimés. |
| 2026-10-28 | E1 (réponse partielle) | sous 0,4 MP, les artefacts deviennent vite trop visibles sur les mouvements rapides et la voix en pâtit | Les LoRA d'accélération dégradent aussi nettement l'audio. Banc pas lancé. |
| 2026-10-28 | E3, A10 | écartés | E3 : « pour une très bonne raison » (non notée) ; A10 : « on va plutôt faire différemment ». |
| 2026-10-28 | E4 (RTX Video Super Resolution, 1080p) | fonctionne, mais très dépendant de la qualité native (essai aussi avec une passe native à 0,6 MP) | Intérêt principal : s'utiliser en seconde passe après l'upscale latent, par exemple dans un workflow séparé qui agrandit un lot de vidéos à la chaîne. |
| 2026-10-28 | E5a (Sage Attention) | KO : module `sageattention` absent | À réessayer après installation dans le Python de ComfyUI Desktop (non fait). |
| 2026-10-28 | E5b (Model Sparse Attention, `sol-attn`, 6 étapes, deux premières denses) | gain faible, qualité moindre : pas retenu | 0,4 MP (37 607 jetons) : environ -9 % par étape creuse (17,9 s dense, 16,3 s creuse), 195 s au total. 0,6 MP (53 591 jetons) : 28,4 s dense contre 22,4 s creuse (-21 %) ; échantillonnage 170 s contre 146 s, total 251 s contre 231 s (-8 %). Mange les mouvements, visages et détails moins précis. Sans LoRA turbo : même temps, qualité effondrée (le turbo réduit le nombre d'étapes, pas leur coût). |
| 2026-10-28 | E2 à la main : LoRA turbo de base, PDMD/DMAD 4 étapes, Larryvrh v4-600 | on garde le LoRA de base (le plus polyvalent et le plus simple) | Base : très équilibré, tient bien les itérations et l'audio, un peu flou en résolution. PDMD/DMAD : le plus propre visuellement et le meilleur sur l'audio, temps à égalité avec la base. Larryvrh : le moins bon, presque deux fois plus lent que PDMD, audio mal conservé, mais les mouvements les plus naturels. Larryvrh a d'abord planté (`3 contre 2`, injection adaLN) tant que le nœud n'était pas re-cloné ; re-cloné, ça passe. Piste principale à creuser : l'upscale latent, encore flou à 0,4 MP. |
| 2026-10-28 | D12 (PDD 8 étapes), E5b (retrait du workflow) | écartés | D12 : pas utilisé. E5b : la sparse attention dégrade l'image plus qu'elle n'aide ; l'attention Comfy Kitchen suffit pour accélérer (voir la ligne E5b plus haut). |
| 2026-10-29 | D3 (Motion Context, clips 1 et 2) | fonctionne « vraiment bien » ; à implémenter | Décisions du même jour : résolution verrouillée à 0,4 MP (plus de brouillon à 0,2 : on perd trop en qualité) ; reste à voir l'intégration au `suite` / `coupe` (latent par rendu, repli sur l'image de raccord). |
| | | | |
