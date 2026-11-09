# File de consignes — empiler les itérations, rendre une fois par chaîne

2026-11-09. Plan cadré, rien codé. Point de départ : aujourd'hui « Itérer » est une demande bloquante (consigne → agent → recompilation
Open H3 IR → rendu), une seule à la fois par plan (`demandes_une_en_cours_par_cible`), et le worker ne connaît pas les liens entre plans.
On veut dicter les consignes d'une scène après l'autre sans attendre, et ne payer qu'un rendu par plan.

## Décisions (utilisateur, 2026-11-09)

1. **La vue d'ensemble existe déjà** (Montage et Scénario montrent les plans et leur enchaînement) : rien à construire de ce côté.
2. **Les consignes s'empilent** par plan, sans attendre le rendu précédent.
3. **Plusieurs consignes d'un même plan = UN seul passage et UN seul rendu** qui les applique toutes. Tant qu'une consigne n'est pas
   partie, elle reste modifiable, réordonnable, supprimable (comme la file de Claude Code).
4. **Pas de cascade automatique.** Quand un plan est re-rendu, les plans en « suite » qui le prolongeaient sont **marqués « à refaire »**
   et attendent le feu vert de l'utilisateur (une cascade peut ne jamais finir quand plusieurs maillons d'une chaîne bougent).

## Modèle

- **Chaîne** = suite maximale de plans consécutifs (ordre `plans.ordre`) dont chacun, sauf le premier, est en `liaison = 'suite'`. Pur,
  calculé à la lecture (`lib/chaines.ts`), rien en base.
- **Consigne en attente** : nouvelle table `consignes` (`id`, `plan_id`, `texte`, `reglages` jsonb, `rang`, `created_at`). C'est un
  brouillon, pas une demande : elle ne pose aucune tâche. Choix volontaire de ne pas ajouter un statut `en_attente` à `demandes` : le
  pilote (`lib/demandes-db.ts`) reste intact, et l'index unique « une demande en cours par plan » aussi.
- **Lancer** un plan = fusionner ses consignes (dans l'ordre, numérotées) en une consigne, appeler `lancerDemandeIteration`, vider les
  brouillons. Si une demande est déjà en cours sur ce plan, les nouvelles consignes restent en attente et partent à sa fin (option
  « enchaîner automatiquement », décochée par défaut).
- **« À refaire » (raccord périmé)** : dérivé, pas stocké. Un plan en `suite` dont le dernier rendu a été calculé sur
  `jobs.raccord_job_id = X` est à refaire quand le rendu retenu du plan précédent n'est plus `X` (ou n'a plus le même latent). Se branche
  comme une `RaisonPerime` de plus dans `lib/rendus.ts` / `lib/plans-perimes.ts` : pastille, lot « relancer les périmés » déjà existant
  (`relancerPlansPerimes`), aucune relance automatique.

## Ordonnancement par chaîne

- Étapes **agent** et **recompilation** (appels LLM) : libres, dans l'ordre de lancement, sans lien entre plans.
- Étape **rendu** : un plan en `suite` ne pose son rendu que si son précédent n'a **aucune demande en cours** (sinon il reprendrait un
  latent bientôt caduc). Garde ajoutée dans le pilote, à l'étape de pose du rendu : décision `attendre` tant que le précédent est actif.
  La demande affiche « en attente du plan 03 ».
- Résultat sur A → B → C lancés ensemble : agents de A, B, C ; rendu de A ; puis B ; puis C. Chaque plan rendu une seule fois. Les plans
  d'une chaîne qui ne sont pas lancés ne sont pas touchés ; ceux déjà rendus en aval passent « à refaire » (décision 4).
- `worker/ordonnanceur.ts` ne change pas : la garde est dans le pilote, pas dans le choix des tâches (il choisit entre tâches posées).

## Phases

| # | Livrable | Contenu | Risque |
|---|---|---|---|
| 1 | File de consignes | table `consignes` + migration, actions (ajouter / modifier / supprimer / réordonner / lancer), zone « Consignes en attente » sur l'atelier d'un plan, lancer fusionne en une demande | faible |
| 2 | Lancer en lot | « Lancer les consignes de la scène / de l'épisode » : une demande par plan concerné, depuis Montage ou Scénario (pastille du nombre de consignes en attente par plan) | faible |
| 3 | Garde de chaîne | `lib/chaines.ts` (pur, testé) + attente du précédent à l'étape rendu + libellé d'attente dans le panneau | moyen : interaction avec le pilote |
| 4 | « À refaire » | raison de péremption « raccord » dérivée de `raccord_job_id`, pastille dans Montage/Scénario, inclusion dans « relancer les périmés » | moyen : définir « même latent » sans faux positifs |

Les phases 1-2 apportent l'essentiel du confort (dicter sans attendre) et se testent seules. 3-4 tiennent la promesse « un rendu par
plan ». Tests : `lib/chaines.test.ts`, extension de `lib/demandes.test.ts` (attente de chaîne), `plans-perimes` (raison raccord).

## Rendre sur un précédent périmé (arbitrage 2026-11-09, à confirmer)

Cas A → B → C, B « périmé », consigne sur C. **On rend C quand même**, sur le rendu retenu actuel de B, et ce rendu est **provisoire** :
- C n'attend que si B a une demande **en cours** (agent, recompilation, rendu) : il va changer, rendre dessus serait du gâchis certain
  (« en attente du rendu de B »). Un B simplement périmé, sans travail en cours, ne bloque pas.
- Le rendu de C est un essai ordinaire (supprimable, `supprimerEssai`) : le « plan jetable » existe déjà, rien de nouveau.
- Marquage **transitif**, toujours dérivé, jamais de relance automatique : C est « sur base périmée » si le rendu dont il part est
  lui-même périmé, « à refaire » dès que ce rendu a changé (`raccord_job_id` ≠ rendu retenu du précédent).
- B avec des consignes **en attente** (non lancées) : C part quand même, avec un avertissement (« B a 2 consignes en attente »).
- Précédent annulé ou échoué : ne bloque pas non plus, C part sur l'ancien rendu retenu, marqué provisoire.
- Lancer toute une chaîne d'un coup garde l'ordre A, B, C (garde de chaîne, phase 3).

## Questions ouvertes (à trancher en cours de route)

## Tranché (utilisateur, 2026-11-09)

- **Réglages** (durée, FPS, seed) de plusieurs consignes d'un même plan : la **dernière valeur demandée gagne**.
- **Où vit la file** : dans le **panneau des tâches**, comme une file classique. **Une ligne par plan/itération**, jamais une ligne par
  consigne : les consignes données pour ce plan sont un détail dépliable à l'intérieur de la ligne (pour ne pas alourdir une file longue).
  Les consignes en attente (modifiables) et celles déjà parties (lecture seule) s'y lisent au même endroit.
