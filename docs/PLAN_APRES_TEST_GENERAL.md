# Plan après le test général (2026-10-03)

Feuille de route issue du test concret de l'application. Les décisions qui révisent `FRICTIONS.md` y sont
consignées explicitement au moment où elles sont codées. Cocher au fil de l'eau.

## Décisions prises

- Ordre de création : **brief → scénarios → registre d'assets (inventaire) → fiches**. Les fiches et l'itération
  interrogent d'abord le registre ; créer un asset reste possible (non bloquant).
- L'itération peut ajouter/retirer des références en s'appuyant sur le registre. Un retrait renumérote sans trou
  (`<Picture 1,2,3…>`) : c'est le code qui numérote, jamais le modèle.
- Création de projet : application automatique de chaque étape, sans revue ; seul retour arrière = supprimer le
  projet. Progression visible.
- Briefing : l'agent lève ses zones d'ombre à l'oral ; plus d'état « à valider » ; checklist « reste à définir ».
- Registre à un seul niveau : master → dérivés (les états d'un décor sont des dérivés du même master).
- Agent : un seul point d'accès, portée déduite de la page (plus petite en cas de doute), une conversation par projet.
- Seed : une seed par plan (déterministe, F04) + bouton « Nouvelle variante ».
- Cartes de style : reportées.

## Chantier 1 — Fiabilité de la file (D, K, J minimal)

- [x] D : serveur LLM injoignable → échec au bout d'un délai, route de santé configurable, délai d'inactivité du flux
- [x] D : le refus « tâche en cours » nomme la tâche bloquante + bouton Annuler
- [x] D : pastille serveur injoignable dans le header
- [x] D : lot échoué → bouton « Relancer » (aussi pendant que le lot tourne)
- [x] K : numéro de rendu, prompt/durée/seed conservés par rendu, `tentative` = rejeux seulement
- [x] K : seed par plan + « Nouvelle variante » + préfixe de fichier par rendu
- [x] J : la page du plan se met à jour à la fin du rendu

## Chantier 2 — Registre et références (N, G, I, H)

- [x] N : registre à un niveau (migration + règles + UI)
- [x] Renumérotation des références (code) + régénération subject_definitions / retention_analysis
- [x] G : étape « inventaire d'assets » avant les fiches ; fiches/itération citent le registre en priorité
- [x] I : l'itération peut ajouter/retirer des références du registre ; raison « rien n'est écrit » visible
- [x] H : génération d'images en lot

## Chantier 3 — Parcours de création (C, B, A)

- [x] B : checklist « reste à définir », fin des points à valider, éditeurs de listes à la place du JSON brut
- [x] C : installateur (page d'étapes) avec enchaînement automatique côté serveur
- [x] A : streaming du texte et de la réflexion

## Chantier 4 — Visionnage et cohérence (L, M, J aperçu)

- [x] L : frise de lecture bout à bout des plans
- [x] M : tableau assets × plans (planche d'épisode : non, la lecture suffit)
- [x] J : progression de l'étape en cours (aperçu image impossible : nœud d'API distant H3)

## Chantier 5 — Point d'accès unique à l'agent (F)

- [x] Point d'accès unique dans le bandeau, portée déduite de la page (élargissable)
- [ ] Une conversation par projet (migration) — NON FAIT : le verrou de portée en dépend, voir FRICTIONS 2026-10-03 (chantiers 4 et 5)
- [ ] Routage de l'intention vers les skills — NON FAIT

## Vérification

`npm run typecheck`, `npm test`, migrations, `scripts/agents-e2e.ts`, puis test fonctionnel guidé avec
l'utilisateur à la fin de chaque chantier.

## Reste à faire (rappels de l'utilisateur)

- **Voix → répliques.** Une fois une voix de référence générée puis VALIDÉE (adoptée), pouvoir générer les répliques des personnages avec
  cette voix : il faut brancher un workflow ComfyUI pour ça (clonage de la voix de référence + direction de jeu, cf. skill `voix-comfyui` et
  `workflows/voice-clone/`), puis une action « Générer les répliques » depuis le casting vocal / la fiche du plan.
- **Une conversation unique par projet + routage de l'intention** (chantier 5, voir plus haut) : non fait, décision à reprendre.
- **Cartes de style avec images** (briefing) : reportées.
- **Lot d'images : lancer la 2e vague** (dérivés en édition) automatiquement quand le master est adopté.
