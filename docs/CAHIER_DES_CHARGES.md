# CADENCE — Cahier des charges

> Interface de production pour Les Yeux de Rubis. Ce document exécute des
> décisions déjà prises dans `FRICTIONS.md`. Il n'en invente aucune : chaque
> page ci-dessous répond à une friction identifiée et tranchée (F01 à F06),
> pas à une idée nouvelle non éprouvée.

## Identité visuelle (2026-09-25)

- **Fond quasi-noir, anthracite** — pas de rouge en fond : ça fatiguerait sur
  de longues sessions et écraserait les aperçus vidéo/image, qui doivent
  rester les éléments les plus saturés à l'écran.
- **Écarlate et or réservés aux accents** — statuts, états actifs, éléments
  validés. Le rouge est un signal (ce qui est en cours, ce qui est validé),
  pas un décor.
- **Motifs zellige en pointillé, pas en fond** — séparateurs, puces, icônes.
  Clin d'œil discret au décor du cabaret sans charger l'interface.
- **Typo double** : sans-serif géométrique et sobre pour les données
  (fiches, listes, statuts), police plus travaillée réservée au seul nom
  de l'app.
- **Fil rouge littéral** : une fine ligne qui relie visuellement les pages
  (frise Shots, frise Scénario), écho graphique du numéro de plan comme
  pivot du système.

## Objectif

Remplacer la gestion actuelle (fichiers markdown + ComfyUI manuel + moi en
copilote de rédaction) par une interface qui orchestre le même pipeline,
sans changer la logique métier déjà validée — juste la rendre plus rapide à
manipuler et moins sujette à l'oubli.

## Principe directeur : le numéro de plan comme pivot

> **Révisé le 2026-09-29 (F03)** : il n'y a plus de numéro de plan. Le plan
> s'identifie par un UUID, s'ordonne par une position réordonnable
> (glisser-déposer) et s'affiche par son rang dans l'épisode. Le reste de
> cette section décrit le principe d'origine (un plan traverse les quatre
> pages) ; « numéro de plan » se lit désormais « plan ».

Le plan (à l'origine numéroté par dizaines, continu sur toute la série, jamais
réutilisé — cf. F03) n'est pas qu'un identifiant technique. C'est la clé qui
relie tout :

```
Scénario (frise narrative)
   → définit des plans, dans l'ordre, avec leur numéro
Fiche de plan (par numéro de plan)
   → précise prompt, refs, son, dialogue pour ce plan
Registre d'assets (Personnages / Décors / Voix)
   → alimenté et consulté par les fiches de plan
Shots (frise de production)
   → suit l'état de génération de chaque plan
```

Une même donnée (le plan) traverse les quatre pages. Le modèle de données de
l'app doit avoir **le plan comme table centrale**, avec des clés étrangères
vers scénario, fiche de plan, assets utilisés, et statut de génération —
pas quatre silos qui se resynchronisent à la main.

---

## Pages

### 1. Scénario — frise chronologique

**Rôle :** point d'entrée du pipeline. Une frise continue sur toute la
série (pas de reset par épisode), où chaque section narrative couvre une
plage de numéros de plan.

- Lecture : parcourir l'histoire dans l'ordre, voir quel épisode/quelle
  scène couvre quels plans.
- Écriture : agent scénario (chat intégré) qui prend un texte source narratif
  (façon les fichiers "Maya") et produit un découpage — reprise du skill
  `scenario` existant, exposé comme conversation dans l'app plutôt que dans
  Claude directement.
- Sortie : la création/modification d'une section crée ou met à jour les
  plans correspondants, qui apparaissent ensuite dans Shots et attendent
  leur Fiche de plan.

### 2. Personnages — vue en arbre

- Nœud racine par personnage : nom, voix de référence (lien vers le
  catalogue voix), design canonique.
- Branches : dérivés (costumes, expressions, props liés) — chaque branche
  garde son statut ✅ / 🟡 / ⬜.
- Agent personnage (chat) : génère fiches et prompts Krea 2/Qwen Image Edit
  pour un nouveau dérivé, à partir du skill `assets-comfyui`.
- Pas de versionnage (F01, tranché 2026-09-25) : une retouche remplace le
  nœud, elle n'empile pas d'historique.

### 3. Décors — vue en arbre

Même structure que Personnages. Les branches représentent les **états**
d'un décor (jour/nuit, intact/détruit...) plutôt que des dérivés d'apparence.
Agent décor sur le même principe.

### 4. Shots — frise de production

- Liste ordonnée de tous les plans de la série (les trous laissés par les
  plans supprimés restent visibles, jamais renumérotés — F03).
- Statut par plan : `en attente` / `en cours` / `échoué` / `rejoué` /
  `terminé` (F04).
- Contrôle de la queue batch : déclenchement du passage nuit (upscale en
  masse), rejeu automatique (2 tentatives avant signalement, à confirmer).
- Clic sur un plan → ouvre sa Fiche de plan.

### 5. Fiche de plan — édition détaillée

Le cœur de la friction la plus fréquente (F03, 2 à 30 itérations/plan).

- Récupère automatiquement les refs depuis le registre (persos, décors,
  voix) en fonction du plan.
- Aperçu vidéo de la dernière génération, avec import manuel possible pour
  un plan déjà tourné hors pipeline (traçabilité, 2026-09-30).
- Édition manuelle du prompt : 6 sections, ou collage en bloc d'un prompt
  H3 déjà rédigé (2026-09-30) — reste la seule voie en V1 (sans agent). Un
  agent d'itération dédié par plan, qui écrirait dans ce même point d'entrée,
  est la direction retenue pour l'après-V1 — voir "Points ouverts".
- Slots dédiés : dialogue, bruitage, durée voix mesurée (F02).
- Bouton relance → repart dans la queue Shots.

### 6. Casting vocal — catalogue

- Catalogue de voix nommées, chacune avec un échantillon écoutable.
- Sélection d'une voix → lance le doublage via le workflow ComfyUI
  Qwen3-TTS existant.
- Test A/B intégré : reprise du plan-utilitaire `T1` (déjà écrit dans
  `FICHE_DE_PLAN_UTILITAIRES.md`), détaché comme outil autonome.
- Agent voix (chat) éventuel pour la conception de nouvelles voix
  (`VoiceDesign`).
- Confirmé en scope V1 malgré un volume actuellement faible (4 voix) —
  décision assumée : mieux vaut la structure prête avant que le besoin
  n'explose sur S02+.

---

## Agents — architecture commune

Chaque agent est un chat intégré à l'app, façon interface Claude, mais
scopé à sa catégorie :

- **Un agent = un skill existant**, exposé comme prompt système : `scenario`,
  `assets-comfyui`, `voix-comfyui` (les skills `fiche-de-plan` et
  `voix-comfyui` couvrent respectivement la génération technique et le
  casting).
- Chaque agent a accès aux outils propres à son domaine : lire/écrire le
  registre correspondant, lancer un job ComfyUI, consulter le plan courant.
- Techniquement, ça veut dire un appel API (Claude ou équivalent) côté
  back — une brique nouvelle par rapport à F04, qui n'appelait jusque-là
  que l'API ComfyUI.

---

## Intégrations techniques nécessaires

| Intégration | Usage | Statut |
|---|---|---|
| API ComfyUI | lancer jobs image/vidéo/voix, suivre le statut, récupérer les résultats | validée (F04, déterminisme testé) |
| API Claude (ou équivalent) | agents de chat par catégorie | nouvelle brique, non testée dans ce contexte |
| Stockage | source de vérité des registres, fiches, scénario | à trancher — voir points ouverts |

---

## Phasage proposé (à valider)

Rien n'est explicitement hors scope cette fois — mais tout construire d'un
bloc (6 pages + 2 API externes + N agents) est un risque d'ingénierie, pas
juste une question de ROI qu'on a déjà tranchée. Proposition :

1. **V1** — Shots (queue F04) + Fiche de plan (boucle F03), sans agent :
   pure automatisation de ce qui est déjà spécifié et validé. Débloque la
   friction la plus fréquente en premier.
2. **V2** — Personnages + Décors en arbre (F01) : la valeur est dans la
   vue, pas encore dans la génération assistée — pas d'agent nécessaire.
3. **V3** — Casting vocal (catalogue + test A/B) : structure indépendante,
   peu couplée au reste, peut se brancher à tout moment.
4. **V4** — Scénario (frise) + agents de chat sur toutes les pages : la
   brique la plus lourde à la fois techniquement (API Claude, orchestration
   par skill) et en risque produit (un agent mal calibré peut dégrader la
   qualité par rapport à une conversation directe avec moi).

## Points encore ouverts

- **Stockage** : l'app lit/écrit directement les fichiers markdown
  existants, ou migration vers une base structurée ? Impacte fortement
  l'effort de développement.
- **Agent sur la Fiche de plan** — direction retenue (retour utilisateur
  2026-09-30), à séquencer après V1 : un agent crée d'abord un squelette de
  tous les prompts H3 nécessaires (skills de rédaction à durcir pour ça),
  une première vidéo d'un seul plan est générée, puis un agent dédié itère
  prompt par prompt pour corriger les défauts constatés au visionnage.
  Contredit le cadrage "V1 sans agent" du phasage ci-dessous si absorbé
  dedans — à traiter comme un chantier séparé, après la fermeture de V1
  telle que scopée, pas comme une condition de sa clôture. Le point d'entrée
  (collage de prompt en bloc, Fiche de plan) est déjà prêt à le recevoir.
  Le garde-fou vocabulaire à risque (F03, motif du 25/09) est abandonné :
  reste la vigilance de l'utilisateur au visionnage, pas un système dédié.
- **Utilisateur unique ou multi-utilisateur** : un collaborateur pourrait
  rejoindre le projet un jour (mentionné pour F05) — ça change la question
  de l'authentification et du conflit d'écriture concurrent.
- **Skills réutilisés tels quels ou adaptés** : les agents rejouent-ils le
  contenu exact des skills `scenario` / `assets-comfyui` / `voix-comfyui`,
  ou une version condensée pensée pour un usage in-app plus court que la
  conversation actuelle ?
