# Chantier — transformation du réalisateur (cadrage, rien n'est construit)

Document de préparation, écrit le 2026-10-12. Il fixe le point de départ, la cible telle que l'utilisateur l'a décrite, les
questions à trancher et un découpage possible. Aucune ligne de code n'est touchée. Les décisions déjà actées vivent dans
`docs/FRICTIONS.md` (2026-10-09, « Le réalisateur : une conversation par épisode… ») ; ce document ne les remplace pas, il liste
ce qu'une transformation viendrait **contredire ou prolonger**.

## 1. Point de départ (ce qui existe)

- **Un réalisateur par épisode** : page plein cadre `/p/<projet>/realisateur/<épisode>`, gabarit `cn-*`, monogramme « R ».
  Conversation libre, décisions épinglées (en discussion, retenu, à surveiller, en conflit, appliqué), glissière « Action ! »,
  fermeture automatique à l'application, pas d'annulation après coup.
- **Deux appels par tour** : `realisateur-analyse` (opérations, jamais de prose ; réflexion activée) puis `realisateur-reponse`
  (formule à partir des faits du code). Modèle Qwen3.6-35B-A3B (`LLM_MODELE_REALISATEUR_*`).
- **Moteur** : `lib/agents/revision/` (`revision-db`, `entrees`, `faits`, `vue-episode`, `analyse`), décisions = brouillon
  (`revision_decisions`, migration 0054), application = une proposition de portée épisode via `appliquerProposition`.
- **Applicateurs d'écriture** : `lib/agents/applicateurs/{plan,replique}.ts` (supprimer, déplacer, modifier ; fiches refondues
  avec `plan-h3`, plans ajoutés avec `scenario-episode`, 3c).
- **Hors du réalisateur** : `iteration-plan` (« Corriger après visionnage », vignettes du rendu), qui vient d'être refondu dans la
  fiche de plan (Itérer sans confirmation, planche optionnelle). Le bouton « Demander au réalisateur » de la fiche de plan renvoie
  vers la salle d'épisode, sans tiroir de dialogue.
- **Le scénariste** : conversation de conception du projet (étape 6), avec notes d'entretien, brief, cartes de choix. Il écrit le
  scénario initial puis s'arrête à l'avancée de la préparation.

## 2. Cible (ce que l'utilisateur a dit, à confirmer)

1. Le réalisateur devient un **agent de réécriture au niveau du projet**, plus seulement d'un épisode : « nouvelle scène »,
   « retravailler cette scène », « ce film est trop long », sans choisir d'abord l'épisode.
2. Piste : **le fusionner avec un scénariste amélioré**, pour qu'il n'y ait qu'un interlocuteur de l'écriture, avant et après
   la production, au lieu de « scénariste avant, réalisateur après ».
3. Il doit rester accessible **depuis la fiche de plan** (bouton « Demander au réalisateur » avec ce plan en contexte), en tiroir
   de dialogue plutôt qu'en changement de page.
4. Un bouton **« Tout générer »** vit dans le scénario (hors de ce chantier, mais il consomme les mêmes entrées).

## 2 bis. Décisions de l'utilisateur (2026-10-12)

- **Q1 : un seul fil par projet**, avec un sujet par échange. Le réalisateur écrit « au plus haut possible » : la portée est le projet.
- **Déroulé, sur le modèle du scénariste** : message d'accroche, discussion, **pile de décisions** qui se remplit. Dès qu'une décision
  utilisateur est détectée, l'agent explique quels plans sont touchés et pourquoi. L'utilisateur peut à tout moment voir les changements
  proposés (comme si on réécrivait une partie du projet). Pour simplifier, l'agent peut réécrire directement les fiches.
- **Fin de discussion** : dès qu'il y a au moins une décision validée, on passe à un **écran de vérification** qui montre les changements
  et demande un accord concret (écrasements quasi certains).
- **Q5 : le réalisateur ne regarde pas les rendus** (coût insoutenable sur un gros projet). `iteration-plan` et la planche restent à la fiche de plan.
- Question ouverte : les plans touchés doivent-ils être regénérés ? (proposition : voir la discussion, à valider.)

## 3. Questions à trancher avant de construire

| # | Question | Pourquoi ça compte |
|---|---|---|
| Q1 | Une conversation **par projet** (un seul fil) ou **par sujet** (nouveau fil à chaque demande) ? | Le brouillon de décisions est aujourd'hui attaché à l'épisode et se vide à l'application. Un fil unique grossit sans fin. |
| Q2 | Fusion avec le scénariste : **un seul agent / un seul skill**, ou **un seul écran, deux skills** ? | Le scénariste écrit du neuf avec un brief ; le réalisateur critique de l'existant avec des faits calculés. Leurs prompts n'ont pas la même discipline. Un seul écran est bon marché, un seul skill est risqué pour un petit modèle local. |
| Q3 | La **portée** d'une demande : épisode, scène, plan, ou projet entier ? Qui la détermine (code ou modèle) ? | Le verrou de portée de `appliquerProposition` couvre l'épisode ; un projet entier demande un verrou plus large et des constats multi-épisodes. |
| Q4 | Les **constats calculés par le code** (durée, protégés, périmés) : sur tout le projet à chaque tour ? | Coût de calcul et taille du contexte envoyé au modèle (≈ 5 500 jetons déjà pour un épisode). |
| Q5 | **Rendus** : le réalisateur sait-il regarder une vidéo (planche, comme « Montrer au chef opérateur ») ? | Aujourd'hui seul `iteration-plan` lit les vignettes. Les faire entrer dans le réalisateur, c'est ce que FRICTIONS appelait « absorber iteration-plan » (reporté en 3c). |
| Q6 | **Sortie** de la conversation à l'application : on garde « elle se ferme » ? | Contredit-elle un fil de projet qui dure ? |
| Q7 | Le tiroir de dialogue sur la fiche de plan : **même fil** que la salle, ou fil local au plan ? | Évite d'avoir deux brouillons concurrents. |

## 4. Découpage proposé (chaque étape livrable seule)

- **A. Tiroir depuis la fiche de plan** : le bouton ouvre la conversation de l'épisode dans un panneau latéral au lieu de changer
  de page, avec `?plan=<uuid>` en contexte. Pas de nouvel agent. Réponse à Q7 : même fil. Petit, utile tout de suite.
- **B. Portée élargie** : permettre `projet` dans le verrou de portée et les constats, sans changer l'interface. Prérequis de tout le
  reste ; dépend de Q3 et Q4.
- **C. Réalisateur de projet** : page `/p/<projet>/realisateur` (le réalisateur d'épisode devient une vue filtrée), nouvelle
  gestion du fil (Q1, Q6).
- **D. Rapprochement avec le scénariste** (Q2) : d'abord un écran commun, ensuite seulement, si les essais le justifient, un
  skill commun. À mesurer avec le banc d'essai plutôt que décider sur plan.
- **E. Regarder le rendu** (Q5) : réutiliser `lib/planche-vignettes.ts` et la case « Montrer au chef opérateur ».

Ordre conseillé : A, puis B + C ensemble, puis E, puis D en dernier (le plus risqué, le moins pressé).

## 5. Ce que ce chantier contredit ou touche dans FRICTIONS

- « Une conversation libre **par épisode** » et « elle se ferme automatiquement à l'application » (2026-10-09) : à revoir (Q1, Q6).
- « `iteration-plan` est **absorbé** » (2026-10-09) puis « `iteration-plan` conservé » (3c) puis fiche de plan 2026-10-12 : trois
  états successifs, à clarifier une fois pour toutes (Q5).
- « Pas d'annulation après application » : inchangé, les garde-fous restent avant le geste.

## 6. À lire avant de s'y mettre

`docs/CAHIER_DE_TEST_REALISATEUR.md` (parcours à tester à l'écran, jamais vus à l'écran à ce jour), `docs/maquettes/revision-episode.html`, `docs/maquettes/cascade-chantier.html`,
`lib/agents/revision/`, `agents/skills/realisateur-*`, `components/revision/SalleRevision.tsx`.
