# File d'itérations — enchaîner « Itérer » sur plusieurs plans sans attendre

2026-11-09. Point de départ : « Itérer » était une demande bloquante (consigne → agent → recompilation Open H3 IR → rendu) qu'il fallait
attendre avant de passer au plan suivant. On veut itérer le plan 1, puis le plan 2, etc. sans attendre, avec une file classique.

## Décisions (utilisateur, 2026-11-09)

1. **La vue d'ensemble existe déjà** (Montage et Scénario montrent les plans et leur enchaînement).
2. **« Itérer » pose toujours une demande** : si personne ne tient la place elle part tout de suite, sinon elle attend dans la file. Pas
   d'empilement de consignes à l'échelle d'un plan (première version, abandonnée : table `consignes`, retirée).
3. **Une consigne est modifiable tant que son itération n'a pas démarré** (état `en_attente`) ; une fois partie à l'agent, elle ne l'est plus.
4. **La file vit dans le panneau des tâches**, une ligne par itération ; les consignes données sont un détail dépliable de la ligne.
5. **Pas de cascade automatique** sur les plans liés : un plan en `suite` dont le précédent a été re-rendu est marqué « à refaire », jamais
   relancé tout seul (phase 3).
6. **Rendre sur un précédent périmé** : on rend quand même, sur le rendu retenu actuel du précédent, et le rendu est provisoire (voir plus bas).
7. **Réglages** (durée, FPS, seed) : la dernière valeur demandée gagne.

## Phase 1 — faite : la file d'itérations

- `demandes.statut` gagne `en_attente` (varchar, aucune migration). Une itération posée alors qu'une autre est en cours (ou en attente) est créée
  `en_attente` : **aucune tâche posée**, tout ce qu'il faut pour la démarrer est gardé dans son contexte (`conversationUuid`, `renduId`, `planche`).
- `piloterDemandes` (worker) démarre la plus ancienne itération en attente quand plus aucune n'est en cours (`demarrerProchaineIteration`) : c'est
  là seulement que la tâche de l'agent est posée, avec la consigne **telle qu'elle est à ce moment**. Un échec au démarrage (plan sans rendu…)
  termine cette itération en erreur sans bloquer les suivantes.
- Une seule itération à la fois (le GPU est partagé) ; une seule par plan (en cours ou en attente), pour ne pas mêler deux bases d'essai.
- Panneau des tâches : l'itération en attente est une ligne de la file (« En file · consigne modifiable jusqu'au départ »), sa consigne se corrige
  dans la ligne (`corrigerConsigneIteration`), le ✕ l'annule (rien à interrompre). La page d'un plan n'attend plus une itération mise en file : elle
  le dit et on passe au plan suivant.
- Limite connue : l'essai de base choisi et les retouches du prompt sont appliqués au plan au moment de « Itérer », pas au départ de l'itération.

- **La consigne se corrige sur la page du plan** : un clic sur la ligne de la file y mène, et l'atelier montre la consigne en attente (modifiable,
  « Enregistrer la consigne » / « Retirer de la file ») à la place d'« Itérer ». Le panneau n'édite rien lui-même.

## Phase 2 — faite : réordonner la file

↑ ↓ dans la ligne d'une itération en attente. L'ordre de la file est `created_at` (pilote du worker comme panneau) : déplacer = échanger les dates
d'arrivée de deux voisines en attente (`deplacerIterationEnAttente`), sans colonne ni migration.

## Plus tard — toute tâche pourrait attendre ainsi

Même principe pour les autres demandes (fiche de plan, ajout de plan…) : une tâche en file reste modifiable tant que le worker ne l'a pas prise.
Seule l'itération de plan le fait pour l'instant.

## Phase 3 — faite : la file connaît les chaînes

- **Chaîne** = suite de plans consécutifs (`plans.ordre`) dont chacun, sauf le premier, est en `liaison = 'suite'` (pur, `lib/chaines.ts`).
- **Ordre de départ** : `demarrerProchaineIteration` prend la première itération en file qui n'a, EN FILE derrière elle, aucun plan qui la précède dans
  sa chaîne (transitif) : un plan en `suite` repart du rendu du précédent, donc passe après lui s'ils sont tous deux en file. Sans lien, ordre
  d'arrivée ; une coupe ne fait attendre personne. Le panneau montre l'ordre d'arrivée : l'ordre de départ peut s'en écarter pour un plan en `suite`.
- **« Raccord à refaire »**, dérivé et jamais relancé tout seul : un plan en `suite` dont le dernier rendu est parti de l'essai X du précédent
  (`jobs.raccord_job_id`) est marqué quand l'essai que le worker prendrait aujourd'hui est un autre (celui du latent pour un raccord par latent,
  celui de la dernière image sinon : `continuiteEffective`). C'est une `RaisonPerime` de plus (`raccord`, `lib/plans-perimes.ts`) : pastille « périmé »
  du Montage, alerte de la fiche, et le lot « relancer les périmés » (déjà là) le reprend, plan après plan dans l'ordre.
- **Base périmée** : sur la page d'un plan en `suite`, une note dit que le précédent est périmé ou a une itération en file, donc qu'un rendu
  maintenant serait provisoire. Rien ne bloque.
- Limite : « relancer les périmés » ne relance pas, dans le même clic, les plans dont le précédent vient seulement d'être relancé (leur raccord ne devient
  périmé qu'une fois le nouveau rendu du précédent terminé) : un second clic les prend.

## Rendre sur un précédent périmé (arbitrage 2026-11-09)

Cas A → B → C, B « périmé », itération sur C. **On rend C quand même**, sur le rendu retenu actuel de B, et ce rendu est **provisoire** :
- C n'attend que si B a une itération **en cours ou en file** : B va changer, rendre C dessus serait du gâchis. Un B simplement périmé ne bloque pas.
- Le rendu de C est un essai ordinaire (supprimable) : le « plan jetable » existe déjà.
- Marquage **transitif**, dérivé : C est « sur base périmée » si le rendu dont il part est lui-même périmé, « à refaire » dès que ce rendu a changé.
- Précédent annulé ou échoué : ne bloque pas, C part sur l'ancien rendu retenu, marqué provisoire.
