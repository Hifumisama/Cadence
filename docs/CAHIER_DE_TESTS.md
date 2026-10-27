# Cahier de tests

Ce qui est codé mais pas encore éprouvé en réel, avec comment le vérifier et quoi relever. Cocher au fur et à mesure, noter les chiffres dans
la colonne « Relevé » (ou juste sous la case) et dire à Claude ce qui a cassé : il lit les traces et la base.

Dernière mise à jour : 2026-10-27. Commits concernés : `ecc92e9` à `1d70b8b`.

## Déjà vérifié sans GPU (tests automatiques, `npm test`, 693 verts)

- Durées : plafond de 10 s partout où le code le contrôle ; répartition exacte des durées entre scènes ; ajustement des plans d'une scène.
- Traitement et scénario par scène : conversion en changements de proposition, scènes de même titre distinguées, plans d'une scène sans effet sur
  une autre.
- Verrou GPU : appels d'une création en parallèle entre eux, exclusifs face au reste.
- Budget de contexte : un appel ne part que s'il tient à côté des appels en cours et du cache retenu par les slots.
- Workflow ComfyUI : résolution injectée dans le nœud `22:9`, refus d'une résolution hors liste, **quels nœuds s'exécutent** pour chaque mode (l'upscale
  seulement en final à 0,2 MP ; le final natif exécute l'interpolation, aucun nœud d'upscale ; l'aperçu ni l'un ni l'autre), tous les liens du graphe
  pointent un nœud qui existe.

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
- [ ] **A4. Une création de film long (20 min visées).** Attendu : 10 à 15 scènes, environ 120 à 200 plans, aucun plafond de sortie atteint.
      Relevé : durée totale de la création ____ ; étapes qui ont échoué ____ ; la relecture et l'inventaire tiennent dans le contexte : oui / non.
- [ ] **A5. Fiches de plan en parallèle.** Attendu : jamais plus de 2 fiches lourdes en même temps, plus aucun `Context size has been exceeded` ni
      `failed to find a memory slot` dans llama-swap. Relevé : nombre d'échecs ____ ; si échec, valeur de `LLM_CONTEXTE_TOTAL` essayée ____.
- [ ] **A6. Taux de cache du préfixe de scène.** Claude lance la requête de lecture du cache sur `scenario-scene`. Attendu : plus de 50 % repris.
- [ ] **A7. Lecture de quelques scènes (de l'œil).** Raccords entre scènes, états d'entrée et de sortie, dialogues. Relevé : jonctions qui sonnent faux ____.
- [ ] **A8. Un plan existant de plus de 10 s.** Attendu : le rendu est refusé avec « un plan dure 5 à 10 s » ; le raccourcir puis relancer passe.

## B. Sur RunPod (5090 : 32 Go, donc l'absence de plantage à 0,4 MP n'est PAS représentative de la carte de bureau)

Avant tout : **B0. le pod répond** (ComfyUI joignable, workflow chargé). Le chantier RunPod est écrit mais n'avait jamais été testé : si B0 échoue, le reste attend.

Pour lire ce qui est sorti : `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,duration -of csv=p=0 <fichier>.mp4`

- [ ] **B1. Aperçu à 0,2 MP, 10 s.** Attendu : environ 600×340, 24 i/s, 10 s. Relevé : durée du rendu ____ s (référence mesurée au bureau : 93 s).
- [ ] **B2. Final à 0,2 MP (upscale).** Attendu : environ ×2 par côté (1200×680), 48 i/s. Relevé : durée ____ s (bureau : environ 450 s).
- [ ] **B3. Final à 0,3 MP (natif).** Attendu : environ 730×410, **48 i/s** (interpolation conservée), pas d'étape d'upscale dans la progression.
      Relevé : taille ____ ; i/s ____ ; durée ____ s.
- [ ] **B4. Final à 0,4 MP (natif).** Mêmes attentes, environ 850×480. Relevé : taille ____ ; i/s ____ ; durée ____ s (bureau : environ 180 s).
- [ ] **B5. Le geste survit-il ?** Même plan, même seed, aperçu à 0,2 puis final à 0,4. Attendu : mouvement très proche (déjà constaté au bureau). Relevé : ____
- [ ] **B6. Comparaison de la voie « 0,4 natif » contre « 0,2 plus upscale ».** Même plan, même seed. Lequel est le plus net sur les gestes et les visages ? ____
- [ ] **B7. Console de rendu.** À 0,3 ou 0,4 MP : le bouton « Figer et rendre » remplace « Figer et prévisualiser », « Rendu final » disparaît, l'historique
      affiche « final · 0,4 MP ». À 0,2 MP : comme avant.
- [ ] **B8. Raccord `suite` entre deux résolutions.** Plan A rendu à 0,2 MP, plan B en `suite` rendu à 0,4 MP. Attendu : B démarre sur la dernière image de A
      (agrandie). Regarder si B part d'une image floue (hypothèse non vérifiée). Relevé : ____
- [ ] **B9. Plusieurs rendus à la suite.** Dix plans à 0,4 MP d'affilée : pas de dérive de temps ni de mémoire. Relevé : durée moyenne ____ s.

## C. Plus tard, quand la 5070 Ti est de nouveau disponible

- [ ] **C1. Rendu à 0,4 MP à côté du LLM chargé.** Attendu : pas de mémoire insuffisante. Sinon : Claude fait décharger le LLM avant les rendus natifs
      (une ligne dans `worker/index.ts`).
- [ ] **C2. Temps d'un film de 20 min de bout en bout** (création plus rendus) à 0,2 MP puis à 0,4 MP. Relevé : ____ / ____.
- [ ] **C3. Comparaison de qualité à l'aveugle** de la création (`npm run llm:banc`) : scénario en un appel contre scène par scène.

## D. Pistes tirées de `ComfyUI_MiniMaxH3_Director` (lues, jamais essayées)

Dépôt : github.com/AIMixer/ComfyUI_MiniMaxH3_Director (Apache-2.0). C'est un nœud « directeur » monolithique (timeline dans le nœud) : on ne l'adopte pas,
Cadence est déjà le directeur. On regarde ce qui s'en détache. Lecture faite du README et des en-têtes de code, aucun nœud exécuté.

- [ ] **D1. Passe d'upscale avec un modèle sans LoRA turbo.** Leur workflow « deuxième échantillonnage » met le LoRA turbo sur la première passe et un UNET
      propre sur la seconde. Chez nous la passe d'upscale (nœuds `135:*`) réutilise le modèle turbo. Essai : même plan, passe d'upscale avec un chargeur
      de modèle sans LoRA. Effort : faible (workflow seul). Relevé : netteté ____ ; durée ____ s.
- [ ] **D2. Décalage de sigma audio : 3 (leur défaut) contre 6 (le nôtre, nœud `195`).** Même plan à voix, écouter la voix. Effort : nul.
- [ ] **D3. Continuité réelle d'un plan `suite` : pack `NikoDemon80/ComfyUI-H3-Motion-Context`** (GPL-3.0 : on l'installe comme nœud externe, on n'en
      copie pas le code ; ComfyUI 0.34 ou plus). Il garde la fin du clip précédent **dans l'espace latent** (22 images, sans décodage ni dérive de couleur)
      et **prolonge le son** (18 images d'audio) au lieu de le recommencer ; un nœud « Trim » rogne ensuite ce préfixe (0,92 s). Aujourd'hui `suite` ne reprend
      qu'une image fixe. Essai : charger `example_workflows/H3-Motion-Context-v0.7.json` du pack dans ComfyUI, chaîner deux clips (Save Latent du premier,
      Load Latent du second), regarder la vitesse et la direction du geste, et écouter la voix ou la musique à la jonction.
      Contraintes lues dans le README : même résolution dans toute la chaîne (le nœud refuse sinon) ; la qualité du son se dégrade au fil des liens (graves
      conservés, aigus perdus) ; les LoRA turbo coûtent aussi du son ; le préfixe pesé dans le temps d'échantillonnage (+15 % de calcul sur un plan de 10 s).
      Relevé : continuité du geste ____ ; son à la jonction ____ ; durée ____ s.
- [ ] **D4. Visages lointains : « Face Refine » du Directeur.** Détecte et suit le visage (modèle YOLO `face_yolov8m.pt`), recadre autour (facteur 2,5),
      refait ce recadre à 768×768 avec H3, recolle seulement le visage avec un contour adouci. Ce serait la réponse aux expressions lointaines **sans** monter
      toute l'image à 0,4 MP. Mais il vit dans le nœud Directeur : à essayer là-bas d'abord, avant de décider de le reproduire. Relevé : visage plus net ____ ;
      durée ajoutée ____ s.
- [ ] **D5. « SelfLift » : première passe progressive** (étapes bruitées à basse résolution, agrandissement latent, dernières étapes en haute résolution).
      Pourrait rendre 0,4 MP moins coûteux. Il n'accepte que l'échantillonneur Euler (nous : er_sde) et vit lui aussi dans le Directeur. Relevé : durée à 0,4 MP
      ____ s contre ____ s ; qualité ____.
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

- [ ] **D7. Piste musicale existante (clip de 2 min) : un segment de la piste par plan, en audio de référence.** D'après la doc du Directeur (`docs/r2v-source-audio.md`),
      en r2v l'audio de référence passe par le VAE audio, entre dans le latent audio-vidéo et pilote le rythme et la bouche ; en mode « source » on pose le fichier
      d'origine tel quel et l'image « colle » au son (prompt : audio `fully_copy`). Motion Context n'est PAS pour cela : il prolonge du son généré, qui se dégrade
      au fil des liens. Essai : deux plans consécutifs de 8 à 10 s, chacun avec son segment de la piste en référence, limites de plans calées sur des temps forts ;
      poser la piste d'origine au montage. À regarder : l'image suit-elle le tempo (avec une musique sans voix) ? Motion Context et audio de référence se gênent-ils
      (le son épinglé est un repère de position, la référence une autre liste : effet combiné inconnu) ? Décalage à prévoir de 0,92 s avec Motion Context.
      Relevé : suivi du tempo ____ ; jonction ____.

- [ ] **D8. Règle de scénario à écrire (décidée, pas encore codée) : dans une scène `action`, une réplique va dans son propre plan, en `coupe`.** Une phrase dans
      `scenario-episode` et `scenario-scene`. Elle sert la lisibilité du combat et rend le pont applicable. À vérifier ensuite sur une création : les plans de combat
      n'ont plus de `<d>`, les répliques tombent dans des plans de réaction séparés.

## Journal des résultats

(à remplir : date, test, résultat en une ligne, ce qui a cassé)

| Date | Test | Résultat | Remarque |
|---|---|---|---|
| | | | |
