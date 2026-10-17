# Cahier de test — le réalisateur (révision d'épisode)

À rejouer à l'écran, avec le vrai modèle (Qwen3.6-35B-A3B, réflexion coupée). Chaque cas dit **quoi écrire**, **ce qu'on doit voir**, et laisse une case à cocher. Note ce qui coince dans la colonne « Remarque » : on corrige ensuite.

Décisions de référence : `docs/FRICTIONS.md`, 2026-10-09 (« révision d'épisode », étapes 1 à 4, 3c). Conception : `docs/CONCEPTION_AGENTS.md` §16.

## 0. Préparer

1. `git switch feat/ecritures-realisateur`, puis `npm run db:migrate` (migration 0054).
2. Le **worker** doit tourner, avec le serveur LLM local joignable.
3. **Sème un projet neuf** : `npm run revision:semer` (le semis a changé : brief complet, fiches qui citent leurs répliques ; un projet semé avant ne convient pas à la partie fiches). Ouvre l'adresse affichée.

Ce que contient « Le sel » (épisode d'essai, 2:34 pour 2:00 visées, trois scènes) :

| Scène | Plans (durée, état) |
|---|---|
| Le port à l'aube | P01 Plan large du port (10 s, sans fiche) · P02 Les filets sur le quai (9, fiche) · P03 Maya traverse le quai (10, fiche) · **P04 Gros plan : ses mains serrent la lettre (8, rendu)** · P05 Mouettes dans le ciel (8) |
| La lettre | P06 Maya s'assoit sur la caisse de sel (14, fiche) · **P07 Maya lit la lettre (15, rendu)** · P08 Insert : l'écriture sur le papier (8) · P09 Le vieux pêcheur l'observe (12, fiche) · P10 Plan de coupe : la mer (10) |
| Le départ | P11 Maya se lève (10) · P12 Dialogue avec le pêcheur (15, fiche) · P13 Le bateau s'éloigne (15) · P14 Plan final (10) |

Répliques : **R01** « Je ne reviendrai jamais. » (Maya, dite dans P07) · **R02** « Tu pars ? » (le pêcheur, P12) · **R03** « Le sel ne ment pas. » (Maya, P12). Les fiches de P07 et P12 citent ces répliques mot pour mot.

Chaque cas repart d'un état propre : **« Abandonner le brouillon »** (sous la saisie), ou une nouvelle révision. Après une application, la page revient au plan ou au scénario : rouvre l'adresse du réalisateur, ou **relance le semis** pour repartir de zéro.

## 1. La conversation

| | Cas | Écris | Attendu | Remarque |
|---|---|---|---|---|
| ☐ | 1.1 Ouverture | (rien) | Un message d'accueil qui donne 14 plans, 2:34 pour 2:00, 3 scènes. Pas de fiche à droite. | |
| ☐ | 1.2 Ressenti seul | « C'est trop long. » | **Deux ou trois pistes** numérotées, chiffrées (« −35 s → 1:59 »…), différentes entre elles. **Aucune décision** : pas de fiche à droite. | |
| ☐ | 1.3 Choix d'une piste | « Prends la 1. » | Une décision apparaît, la fiche s'ouvre à droite, la barre du bas résume (« 1 décision : supprime N plans… · 1:5x pour 2:00 »). | |
| ☐ | 1.4 Combiner | (après de nouvelles pistes) « Combine la 1 et la 3. » | Deux décisions ; un plan visé par les deux n'est coupé qu'une fois (une note le dit). | |
| ☐ | 1.5 Mélange | « C'est trop long, mais ne touche pas à la scène 2, et supprime le 4. » | Une décision « supprime P04 » + des pistes qui **n'ont aucune opération sur P06 à P10**. | |
| ☐ | 1.6 Question | « Pourquoi couper le 10 ? » | Une réponse, **rien n'est créé**. | |
| ☐ | 1.7 Instruction sans objet | « Garde le 8. » (sans décision qui le coupe) | « Je n'ai rien changé », il dit pourquoi, il demande ce que tu voulais. **Jamais « c'est noté ».** | |
| ☐ | 1.8 Correction | (après « supprime les plans 4 et 7 ») « Coupe seulement le 4. » | La **même décision** est corrigée (elle ne double pas). | |
| ☐ | 1.9 Retrait | « Finalement non. » | La décision disparaît. | |
| ☐ | 1.10 Chiffres | (n'importe quand) | Les durées dites par le réalisateur sont **celles de la barre du bas / de la fiche** (il n'additionne rien lui-même). | |

## 2. Durées, suppression, déplacement

| | Cas | Écris | Attendu | Remarque |
|---|---|---|---|---|
| ☐ | 2.1 Durée | « Mets le plan 6 à 9 secondes. » | Décision, gain « −5 s ». Dans Détails : « Durée de P06… : 14 → 9 s ». | |
| ☐ | 2.2 Hors limites | « Mets le 6 à 30 secondes. » | Refus expliqué (un plan dure 5 à 15 s), rien de créé. | |
| ☐ | 2.3 Plan inexistant | « Supprime le plan 99. » | Refus expliqué (« le plan 99 n'existe pas »). | |
| ☐ | 2.4 Suppression d'un plan sans rendu | « Supprime le plan 10. » | Décision retenue. **Aucun faux blocage « rendu en cours »** (un plan simplement prêt à rendre n'est pas un rendu). | |
| ☐ | 2.5 Suppression d'un plan rendu | « Supprime le plan 4. » | Alerte « écrase le rendu réussi de P04 » ; **glissière rouge** ; la barre dit « écrase 1 élément validé ». | |
| ☐ | 2.6 Déplacement | « Mets le plan 8 juste après le plan 6. » | Décision ; Détails « Déplacer P08… » ; la scène du plan change au besoin. | |
| ☐ | 2.7 Conflit mécanique | Deux décisions : « supprime le 5 » puis « mets le 5 à 6 secondes ». | La seconde est **en conflit** (se déplie d'office), la glissière est inerte, la barre dit « trancher le conflit ». | |
| ☐ | 2.8 Sortie du conflit | « Finalement, ne le supprime pas. » | Le conflit se lève ; la glissière redevient libre. | |
| ☐ | 2.9 Objectif | Retire ou ajoute des coupes jusqu'à 2:00 | La barre de durée de la fiche passe « tenu » ; le réalisateur le dit sans inventer. | |

## 3. Les répliques et leur fiche (3c-1)

| | Cas | Écris | Attendu | Remarque |
|---|---|---|---|---|
| ☐ | 3.1 Réplique réécrite | « Rends la réplique du plan 7 plus sobre : "Je ne reviendrai pas." » | Décision. Détails : constat « la fiche de P07 cite la réplique mot pour mot : son dialogue est mis à jour » + « le rendu de P07 sera périmé ». | |
| ☐ | 3.2 Application | Glisse « Action ! » (rouge : P07 est rendu… seulement si la décision écrase quelque chose) | Après application, ouvre la **fiche du plan 07** : la balise `<d>` de `detailed_description` dit **« Je ne reviendrai pas. »**. Le plan affiche « Rendu périmé · prompt modifié ». | |
| ☐ | 3.3 Réplique supprimée | « Supprime la réplique "Tu pars ?" » | Décision ; constat « retirée de la fiche de P12 : à resynchroniser ». Après application, la balise reste dans la fiche (orpheline, contrôle verbatim) : normal. | |
| ☐ | 3.4 Fiche qui ne cite pas | (modifie à la main la fiche de P12 pour que "Le sel ne ment pas." ne soit plus mot pour mot, puis) « Change la réplique du plan 12 en "Le sel pardonne." » | Constat « ne cite pas l'ancienne réplique mot pour mot : à resynchroniser à la main ». La fiche n'est **pas** touchée à l'application. | |

## 4. Refondre une fiche, ajouter un plan (3c-2 et 3c-3)

| | Cas | Écris | Attendu | Remarque |
|---|---|---|---|---|
| ☐ | 4.1 Refonte | « Refais la fiche du plan 3, avec un cadrage plus serré. » | Décision « refondre la fiche de P03 » ; constat « réécrite juste après l'application, tu relis… ». Pas de changement de durée. | |
| ☐ | 4.2 Refonte d'un plan rendu | « Refais la fiche du plan 4. » | Alerte « le rendu de P04 sera périmé si tu acceptes la nouvelle fiche ». | |
| ☐ | 4.3 Sans fiche | « Écris la fiche du plan 1. » | Constat « n'a pas encore de fiche ». | |
| ☐ | 4.4 Ajout | « Il manque un plan de transition après le 3 : les filets qui sèchent au matin, 6 secondes. » | Décision « ajouter » ; il écrit **lui-même** le titre et la description ; la durée avec le brouillon passe **+6 s** (gain « +6 s »). Dans « Voir le scénario avec le brouillon » : le plan apparaît **dans la scène « Le port à l'aube »**, étiqueté « nouveau » et « fiche à relire ». | |
| ☐ | 4.5 Ajout hors limites | « Ajoute un plan de 25 secondes à la fin. » | Refus expliqué. | |
| ☐ | 4.6 Application avec fiches | Applique un chantier qui contient 4.1 et 4.4 | La barre dit « ajoute 1 plan, réécrit 2 fiches ensuite ». Après la glissière : la page de retour s'affiche, puis la **fenêtre des agents s'ouvre** sur l'épisode avec un **lot de 2 fiches** en cours d'écriture (une par plan). | |
| ☐ | 4.7 Relecture des fiches | Attends la fin du lot | Chaque fiche est une **proposition à relire** : rien n'est écrit tant que tu ne l'as pas acceptée. Une fiche qui remplace une existante est décochée (risque d'écrasement). | |
| ☐ | 4.8 Le plan ajouté | Va sur le scénario | Le plan est après P03, dans la même scène, 6 s, **durée de génération = durée au montage**, description du réalisateur ; sa fiche est vide jusqu'à ton acceptation. | |
| ☐ | 4.9 Ajout puis coupe du repère | Ajoute un plan après le 3, puis « supprime le 3 » | **Conflit** (« ajoute un plan après P03, que… coupe ») : la glissière est inerte. | |

## 5. Appliquer, quitter, revenir

| | Cas | Action | Attendu | Remarque |
|---|---|---|---|---|
| ☐ | 5.1 Glissière | Applique un chantier simple | Le plan supprimé a disparu, les suivants montent d'un rang (aucun trou), les durées sont à jour, **durée au montage = durée de génération**. | |
| ☐ | 5.2 Fermeture | (juste après) | La conversation se ferme (message de fin), la fiche devient un récapitulatif, le bouton « Nouvelle révision » apparaît. | |
| ☐ | 5.3 Retour | (juste après) | Retour sur **le plan d'où tu venais** (page d'un plan → « Réviser avec le réalisateur ») ou **le scénario de l'épisode**. Si le plan d'origine a été supprimé : le scénario. | |
| ☐ | 5.4 Quitter sans appliquer | Garde des décisions, va sur une autre page, reviens | La conversation et les décisions sont là ; les décisions en cours sont toujours listées (la salle n'a plus d'onglet : on la rouvre depuis le scénario ou depuis un plan). | |
| ☐ | 5.5 À revérifier | Garde une décision « supprime le plan 5 » ; supprime le plan 5 **à la main** ailleurs ; reviens | La décision est « en conflit » ou « à revérifier » ; la glissière est inerte. | |
| ☐ | 5.6 Abandonner | « Abandonner le brouillon » | Les décisions disparaissent, la conversation se ferme. | |
| ☐ | 5.7 Panne | Coupe le serveur LLM, envoie un message | Message d'échec et bouton « Réessayer » ; rien n'est perdu. | |
| ☐ | 5.8 Annulation d'un rendu | Lance un rendu sur un plan, demande de le supprimer | Le détail propose **« Annuler le rendu de Pxx »** ; une fois annulé, la décision se débloque. | |

## 6. À regarder en passant

- **Vitesse** : le premier message paie ~9 000 jetons d'entrée (quelques secondes à 40 s), les suivants moins.
- **Ton** : court, direct, sans salutation ; une question au plus ; pas de liste hors des pistes.
- **Honnêteté** : il ne dit jamais avoir fait ce qu'il n'a pas fait (cas 1.7, 1.8, 2.2, 2.3).
- **Avertissements en doublon** ou trop bavards dans les Détails.
- **Le moindre écart** entre ce que dit le réalisateur et ce qu'affichent la fiche et la barre : c'est le plus important à me rapporter.

## 7. Le cas réel qui avait bloqué (à rejouer)

| | Cas | Écris | Attendu | Remarque |
|---|---|---|---|---|
| ☐ | 7.1 Quatre plans avec répliques | Le message d'origine : « Je pense que tu peux découper le plan 01 en 4, chacun de 5 secondes : l'eau… (réplique de Katara : L'eau...), le feu… (Le feu...), la terre… (La terre...), l'air… (L'air...) » puis « Chaque plan dure 6 secondes. » | **Une seule décision** avec quatre ajouts ; la durée avec le brouillon augmente de 24 s ; dans « Voir le scénario » : quatre plans « nouveau » **avant le plan 01, dans l'ordre eau, feu, terre, air**, chacun avec sa réplique soulignée. Aucun refus, aucune « option en attente » inventée. | |
| ☐ | 7.2 « Juste avant » | « Mets-les juste avant le plan 01. » (si le lieu n'était pas dit) | Il place les plans avant P01 (pas après). | |
| ☐ | 7.3 Durée oubliée | Redemande sans donner de durée | Il **demande la durée**, une seule question, sans proposer d'autres options. | |
| ☐ | 7.4 Application | Glisse | Les quatre plans existent dans l'ordre, 6 s chacun, avec leur réplique liée (page du plan : une réplique à l'emplacement audio 1) ; un lot de **quatre fiches** s'écrit ; les fiches citent la réplique mot pour mot. | |
| ☐ | 7.5 Réplique sur un plan existant | « Fais dire "Tu pars ?" au pêcheur dans le plan 12. » | Décision « ajouter une réplique » ; constat « réplique créée et liée au plan, fiche réécrite ensuite » ; au-delà de 3 répliques sur un plan : bloquant. | |
| ☐ | 7.6 Réplique avec locuteur inconnu | « Ajoute une réplique de Zorg au plan 3 : "Salut." » | La réplique prend un locuteur libre (avertissement « absent du registre »), aucun asset n'est créé. | |
