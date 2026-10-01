# Cadence — Conception des agents de génération

> Statut : **conception ; la brique LLM est construite** (2026-10-01 : interface,
> fournisseur local, chargeur de skills, validation, traces — voir §9 et §13). Le reste
> (propositions, conversation, brief, application) l'est côté serveur depuis le 2026-10-02 — voir §14 ; l'interface reste à faire. Ce document fige le
> vocabulaire et le modèle de données avant d'écrire la moindre ligne. Il
> prolonge « Direction retenue pour l'agent d'itération » (`FRICTIONS.md`, F03)
> et « Agents — architecture commune » (`CAHIER_DES_CHARGES.md`). En cas de
> conflit, `FRICTIONS.md` reste la source de vérité des décisions actées.

## 1. Objectif

Partir d'une page vide — une conversation — et arriver à un **squelette de projet
complet et propre**, que l'on remplit ensuite à la main et par les workflows de
génération :

- la saison (une seule au début) et le ou les épisodes ;
- les scènes ;
- les fiches de plan (prompts H3, références, durées) ;
- les répliques ;
- le registre d'assets, avec un prompt de génération par asset (image ou voix).

Entrées acceptées : un **pitch** (texte libre) ou un **texte complet** (roman). Un
texte long peut donner **plusieurs épisodes** s'il y a assez de matière.

Les mêmes agents servent ensuite à **générer moins que le projet** (un épisode,
une scène, un seul plan) sur un projet déjà créé.

## 2. Vocabulaire

| Terme | Définition |
|---|---|
| **Brief** | Document structuré et sauvegardé, issu de la conversation : pitch, ton, style, personnages, lieux, durée visée, contraintes. Il alimente toutes les générations. Vivant : on peut le modifier. |
| **Portée** | Ce que la génération vise : `projet`, `saison`, `episode`, `scene`, `plan`. |
| **Mode** | Ce que la génération a le droit de faire à l'existant : `ajouter`, `completer`, `remplacer`. |
| **Proposition** | Lot de changements **mis de côté**, jamais appliqué tant que l'utilisateur ne l'a pas accepté. |
| **Changement** | Une ligne de proposition : créer, modifier ou supprimer un élément, avec son diff. |
| **Point de retour** | État antérieur des éléments touchés, conservé à l'application pour pouvoir annuler. |
| **Trace** | Journal de tout ce qu'un agent a reçu, produit et de ce que l'utilisateur en a fait. |

## 3. Principes non négociables

1. **Rien n'est appliqué sans proposition.** Un agent n'écrit jamais dans les
   tables métier : il écrit une proposition. Seule l'action « Appliquer », faite
   par l'utilisateur, touche l'existant.
2. **Le format est structuré et validé avant écriture.** Le modèle rend du JSON
   contre un schéma ; on le valide avec les contrôles déterministes existants
   (`lib/plan-checks.ts` : verbatim, 3 slots audio, plan ≤ 15 s), puis on
   applique en **une transaction**. Une validation qui échoue n'écrit rien.
3. **Le contrôle mécanique reste hors du modèle.** Verbatim, slots, durées :
   on ne fait pas confiance au LLM pour les respecter, on les vérifie.
4. **La durée se mesure, elle ne s'estime pas** (F03). Avant l'audio, l'agent
   choisit une durée de plan généreuse (marge de respiration comprise), **sans
   calcul mots par seconde** (décision du 2026-09-30) ; on l'allonge après la
   prise de voix. La mesure sur la prise réelle reste seule autorité.
5. **Pas de versionnage d'assets** (F01). Le point de retour est l'historique
   d'une proposition, pas une « v2 » au registre.
6. **Un asset manquant n'est jamais créé en silence.** La proposition le liste
   comme changement explicite, avec son prompt de génération.
7. **Un plan s'identifie par son `uuid`, s'ordonne par `ordre`** (F03) : un plan
   inséré ne renumérote rien.

## 4. La conversation et le brief

La conversation sert à **poser des questions** pour préciser ce qui servira à la
génération. Elle produit un brief, pas le projet.

Champs du brief (à affiner) : pitch, genre et ton, style visuel (alimente la
clause de style du projet), personnages et voix pressenties, lieux, arc de la
saison, nombre d'épisodes visés, durée d'épisode, contraintes et interdits,
langue des dialogues.

- **Pitch** : la conversation creuse par questions jusqu'à un brief exploitable.
- **Texte complet** : étape préalable de **résumé par chapitre** pour tenir dans
  le contexte, puis proposition de découpage en épisodes (par chapitres ou par
  arcs) que l'utilisateur valide avant de générer.
- **Projet existant sans brief** (les *Yeux de Rubis*, fait à la main) : action
  « reconstituer le brief depuis l'existant ». Elle produit une proposition, que
  l'utilisateur relit ; sans elle, les portées plus petites n'ont pas de
  contexte global.
- **Brief modifié après génération** : l'interface signale les éléments générés
  sur l'ancienne version, sans rien changer d'office.

## 5. Le pipeline « générer le projet »

Une suite d'étapes, chacune visible, corrigeable et relançable seule. Les assets
viennent **avant** les plans, puisque les plans les citent en références.

| # | Étape | Skill | Produit |
|---|---|---|---|
| 1 | Structure | `brief-projet` | saison, épisode(s), tirés du brief |
| 2 | Scénario | `scenario-episode` | scènes, plans (description narrative, durée), répliques avec locuteur |
| 3 | Registre | `prompt-asset`, `prompt-voix` | les masters connus par le brief (personnages, lieux) et leurs voix, avec prompt de génération |
| 4 | Plans | `plan-h3` | prompts H3, références, liaison des répliques ; propose aussi les assets manquants (accessoires, dérivés, effets) |

Le scénario ne déclare aucun asset : « l'histoire d'abord » (F03, 2026-09-29).
Le registre de l'étape 3 ne contient donc que ce que le **brief** nomme déjà
(personnages, lieux, voix pressenties). Ce que les plans réclament ensuite (un
accessoire, un gros plan en édition, un effet) arrive dans la proposition de
l'étape 4, comme changement explicite « créer l'asset », avec son prompt.

Chaque étape produit sa propre proposition. Une étape ne démarre qu'à partir de
l'état **appliqué** de la précédente (ou de sa proposition acceptée), jamais d'un
brouillon non validé.

Les skills de l'app vivent dans `agents/skills/<nom>/` (règles, guides, schéma
de sortie, exemples) : ce sont les prompts d'exécution de l'app, pas les skills
conversationnels de `.claude/skills/`, qui gardent leur usage en chat. Le
chargeur (`lib/llm/skills.ts`, construit le 2026-10-01) assemble le prompt selon la
convention du §9, sans manifeste : le dossier est la déclaration. Le lexique de corrections H3 reste dans
`.claude/skills/fiche-de-plan/references/`, partagé par `plan-h3` et
`iteration-plan`. Skills écrits : `plan-h3` (un plan), `iteration-plan`
(correction après visionnage) et `prompt-asset` (prompt d'un asset).
Ils s'appuient sur les textes d'assets : la description canonique (français,
pour l'humain) et le prompt de génération (`assets.promptGeneration`, avec sa
mise en page). Le **rôle** d'un asset n'est pas dans l'asset : il change d'un
plan à l'autre et s'écrit dans le prompt vidéo de chaque plan (`definition` de
chaque sujet). Un troisième skill, `prompt-asset`, écrit le prompt de génération
et recommande la méthode de fabrication (`assets.methodeGeneration`).

## 6. Portée × mode

### 6.1 Portées

| Portée | Exemple | Contexte donné au modèle |
|---|---|---|
| `projet` | « générer le projet » | brief |
| `saison` | régénérer la saison | brief, arc de la saison |
| `episode` | préparer l'épisode 2 | brief, résumé des épisodes précédents (continuité narrative seulement), registre |
| `scene` | remplir une scène | brief, résumé d'épisode, texte de la scène, registre, plans et répliques existants |
| `plan` | un plan de coupe entre deux plans | voir §6.3 |

La continuité **visuelle** se tient à l'échelle de l'épisode, pas de la série
(F03, révision 2026-09-28) : le contexte d'un épisode n'embarque pas les plans
des épisodes précédents.

### 6.2 Modes

1. **Ajouter** : ne modifie et ne supprime rien. Nouveau plan, nouvel épisode.
2. **Compléter** : remplit seulement ce qui est vide ou en brouillon.
3. **Remplacer** : écrase. La proposition affiche précisément ce qui sera perdu.

**Protégés par défaut** (le mode `remplacer` exige une confirmation dédiée qui
liste ce qui disparaît) :
- un plan avec un rendu réussi ;
- un asset au statut `valide` ;
- une réplique dont la prise est `validee` ;
- une voix dont la référence est déposée.

Exemple de résumé avant confirmation : *« Remplacer la saison 1 : 12 plans
rendus, 5 assets validés et 8 prises validées seront écrasés. »*

### 6.3 Un plan neuf dans une scène existante

L'utilisateur donne **une intention en une ligne** et **une position** :
« un plan de coupe sur la main de Maya, après le plan 04 ».

Contexte assemblé :
- le brief (ton, clause de style) ;
- le résumé de l'épisode et le **texte narratif de la scène** ;
- les **plans voisins** (avant et après) : raccord de mouvement, direction
  d'écran, exemple de `FRICTIONS.md` (entrée par la droite après un travelling
  vers la gauche) ;
- le registre d'assets, **d'abord ceux déjà cités dans la scène** ;
- les répliques de la scène ;
- les contraintes techniques (15 s, 3 slots audio, verbatim, marge de
  respiration en plan dialogué).

Sortie : une proposition qui contient
- le plan (position par `ordre`, sans renuméroter) ;
- ses références ;
- les **assets manquants**, en changements explicites (« `PROP_lettre` n'existe
  pas : le créer ? », avec son prompt d'image) ;
- les répliques nouvelles, créées comme entités autonomes et liées au plan ;
  le contrôle verbatim s'applique dès la proposition.

## 7. Propositions : modèle de données

Esquisse — pas une migration. Les noms suivent les conventions du dépôt
(français, `uuid` public + `id` serial interne).

**`briefs`**
`id`, `uuid`, `projectId`, `contenu` (jsonb), `version` (entier croissant, le
brief courant est la dernière), `source` (`conversation` | `reconstitue`),
`createdAt`.

**`conversations`** et **`conversation_messages`**
La conversation d'intake ; rattachée à un projet et, quand il existe, à un brief.

**`propositions`**
`id`, `uuid`, `projectId`, `portee`, `cibleId` (saison, épisode, scène ou plan
visé, selon la portée), `mode`, `etape`, `briefId`, `consigne` (l'intention de
l'utilisateur), `statut` (`en_cours` | `prete` | `appliquee` | `rejetee` |
`annulee`), `resume` (texte d'impact affiché avant application),
`createdAt`, `appliqueeAt`.

**`proposition_changements`**
`id`, `propositionId`, `ordre`, `action` (`creer` | `modifier` | `supprimer`),
`cibleType`, `cibleId` (null pour une création), `avant` (jsonb),
`apres` (jsonb), `protege` (booléen : touche un élément protégé),
`avertissements` (jsonb : sortie des contrôles), `decision`
(`en_attente` | `accepte` | `refuse`).

`avant` sert à la fois au diff et au **point de retour**.

**`agent_traces`** — *construite* (migration 0030, `db/schema.ts`)
`id`, `uuid`, `skill`, `fournisseur`, `modele`, `statut` (`ok` / `invalide` / `echoue`
/ `interrompu`), `projectId` (nullable), `messages` (entrée, hors prompt système),
`systemeEmpreinte` + `systemeCaracteres` (le prompt système vit dans git : on garde
son empreinte), `sortieBrute`, `json` (valide), `erreursValidation`, `erreur`,
`renvois`, `tokensEntree`, `tokensSortie`, `dureeMs`, `createdAt`. **À ajouter avec
les propositions :** `propositionId` (nullable) et `retourUtilisateur` (texte :
« l'épée apparaît »). C'est le journal de frictions automatisé et le jeu
d'évaluation (§10).

**Application** = une transaction : rejoue les changements `accepte`, écrit le
point de retour dans `avant`, passe la proposition à `appliquee`. **Annulation**
= rejoue `avant`, refusée si l'élément a changé depuis (elle le signale plutôt
que d'écraser).

## 8. Les agents et leurs outils

| Agent | Skill | Outils (actions serveur) |
|---|---|---|
| Intake | `brief-projet` | lire/écrire le brief, résumer un texte |
| Scénario | `scenario-episode` | lire le brief et le registre ; proposer saison/épisode/scènes/plans/répliques |
| Assets | `prompt-asset` | lire le registre, un asset et son parent ; proposer un prompt et une méthode |
| Voix | `prompt-voix` | lire un personnage et les voix au casting ; proposer une instruction et un texte de référence |
| Plans | `plan-h3` | lire plans, scène et registre ; proposer des plans, leurs refs et répliques ; lancer les contrôles |
| Itération | `iteration-plan` | lire un plan et son dernier rendu ; proposer une correction de prompt |

Tous les outils **de lecture** répondent directement. Tous les outils **d'écriture**
créent des changements de proposition — aucun n'écrit sur les tables métier.

Le point d'entrée existe déjà pour l'itération : le collage de prompt en bloc
de la fiche de plan. L'agent d'itération y écrira via une proposition, sans
nouvelle UI d'édition. Il corrige **après un visionnage réel**, jamais à
l'aveugle (F03).

## 9. Fournisseur de modèle

**État construit (2026-10-01) :** `lib/llm/`.
- `FournisseurLlm.generer(DemandeLlm) → ReponseLlm` ; `DemandeLlm` = prompt système,
  messages, schéma de sortie, `maxTokens`, `temperature`, `signal` (annulation),
  modèle ; `ReponseLlm` = texte, `json`, usage (jetons), durée, modèle, raison d'arrêt,
  réponse brute.
- Seul fournisseur : `compatibleOpenAI` (`/v1/chat/completions`, flux SSE, sortie
  contrainte par `response_format` json_schema). Configuration : `LLM_FOURNISSEUR`,
  `LLM_LOCAL_URL`, `LLM_LOCAL_MODELE`, `LLM_MODELE_<SKILL>` (voir `.env.example`).
- **Emplacement du fournisseur Claude** : `lib/llm/claude.ts`, qui implémentera
  `FournisseurLlm` avec `@anthropic-ai/sdk` (`ANTHROPIC_API_KEY` en `.env`, sortie
  structurée `output_config.format`, prompt caching du texte des skills) et sera
  branché dans `creerFournisseur` (`lib/llm/config.ts`) sous `LLM_FOURNISSEUR=claude`.
  Pas de fournisseur « abonnement ».
- `executerSkill(nom, entree, options)` : chargement du skill → appel → validation
  contre `sortie.schema.json` → un renvoi automatique avec les erreurs si besoin →
  trace (`agent_traces`). Jamais de JSON réparé en silence.
- **Convention du chargeur** (`chargerSkill`) : le prompt système = `regles.md`, puis
  les `guide-*.md` (ordre alphabétique), puis `exemples/*.md` (ordre alphabétique),
  puis les fichiers partagés déclarés dans le code (le lexique H3 pour `plan-h3` et
  `iteration-plan`), puis le contrat de sortie (`sortie.schema.json` en JSON compact).
  Chaque fichier a un titre `=== type : nom ===`. Pas de manifeste.
  **Variantes (2026-10-01)** : un guide peut se réserver à certains cas par une
  première ligne `<!-- variantes: image, generation -->` (retirée du prompt). Quand
  l'appelant passe une `variante` (`executerSkill(skill, entree, { variante })`, ou
  `options.variante` d'une tâche `agent_runs`, ou `--variante` aux scripts), seuls
  les guides sans déclaration et ceux qui la nomment sont chargés ; sans variante,
  tout est chargé. Pour `prompt-asset`, `variantePromptAsset(asset)`
  (`lib/llm/variantes.ts`) donne `sfx`, `generation` (Krea 2), `edition` (Qwen) ou
  `image` (les deux, quand la méthode reste à recommander) : le prompt passe de
  ≈ 7 100 à ≈ 3 700-5 000 jetons estimés, ce qui compte pour un modèle local.
- **VRAM partagée — construit (chantier 2)** : le serveur LLM local et ComfyUI
  tournent sur la même machine et ne tiennent pas ensemble en mémoire. Un appel LLM
  local est une **tâche de la file** (genre « llm », table `agent_runs`, traité par
  `worker/llm.ts`) : le GPU est une ressource unique, ordre image → llm → vidéo, sans
  préemption, et le worker décharge l'autre côté aux changements de domaine
  (`POST /free` sur ComfyUI, `GET /unload` sur llama-swap, au mieux). Poser un appel :
  `npm run llm:tache -- brief-projet [--projet <id>] [--suivre]` (le worker doit
  tourner) ; la tâche apparaît dans le panneau du header, avec annulation. Le résultat
  validé est dans `agent_runs.resultat`, la trace complète dans `agent_traces`.
  `npm run llm:essai` reste l'appel direct, hors file (ComfyUI au repos). Voir
  `docs/FRICTIONS.md` § « Ressource GPU unique ».
  **Conséquence pour la conversation (chantier 3)** : un échange en direct avec le
  modèle local attend, comme les autres tâches, la fin de la tâche GPU en cours (au
  plus quelques minutes : vidéo 1 min 30 à 4 min). Un fournisseur Claude, lui, n'occupe
  pas le GPU et n'entrera pas dans la file.

**Conception d'origine :**

Une interface unique `LLM` (entrée : messages, outils, schéma de sortie ; sortie :
texte ou appel d'outil, jetons), derrière laquelle on branche l'API ou un modèle
local.

- **Gros modèle** : découpage, scénario, diagnostic d'un défaut au visionnage
  (demande de la vision).
- **Petit modèle local** (piste) : tâches mécaniques et structurées — reformater
  au format H3, appliquer une correction, recaler un `<d>` sur une réplique
  modifiée. Le GPU est partagé avec ComfyUI : les deux doivent être séquencés.
- **Chemin retenu** : mesurer d'abord avec un gros modèle, accumuler les traces,
  puis distiller ou affiner un petit modèle sur ces données.

## 10. Évaluation

Les traces (§7) servent à mesurer, pas seulement à déboguer :

- compter séparément les itérations « prompt » et les redécoupages (case
  ouverte de `FRICTIONS.md`) ;
- **test d'entrée** : régénérer le squelette des *Yeux de Rubis* depuis le roman
  et le comparer à la version faite à la main ;
- taux de changements acceptés, refusés, modifiés après acceptation, par agent.

## 11. Déblocage des workflows

Débloqués progressivement, sur un système de tâches ComfyUI **dédié** (le worker
actuel n'est pas généralisé : décision du 2026-09-28) :

1. **Vidéo** : un seul workflow.
2. **Audio** : plus complexe, voix par voix. Débloqué **en même temps** que la
   vidéo, parce que le casting a un test vidéo.

Chaque type de tâche est activable par un réglage et reste en `stub` tant qu'il
n'est pas branché. Le bouton grisé « Générer » du casting devient actif au
moment où sa tâche l'est.

Conséquence assumée : les plans dialogués sont d'abord générés sans référence
`<Audio N>` (pas de lip-sync fiable), puis rejoués une fois la voix posée. Le
contrôle verbatim les signale déjà. Les durées sont recalées à ce moment.

## 12. Décisions restantes

- **Premier fournisseur** : API Claude ou autre ?
- **Skills** : rejoués tels quels, ou version condensée pour l'in-app ? À trancher
  par l'usage, avec les traces.
- **Granularité d'application** : par changement seulement, ou aussi par groupe
  (tous les plans d'une scène) ?
- **Découpage d'un roman en épisodes** : par chapitres ou par arcs — la
  proposition du modèle est validée par l'utilisateur avant toute génération.
- **Durée de vie des points de retour** : conservés indéfiniment ou purgés après
  N jours ?
- **Contradiction assumée avec le phasage** : le cahier des charges cadre la V1
  « sans agent ». Ce chantier est traité à part, après la clôture de V1, comme
  la direction du 2026-09-30 le prévoit.

## 13. Ordre de construction proposé

1. Interface `LLM` + trace — **fait (2026-10-01)**, fournisseur local ; intégration
   à la file du worker (genre « llm », libération de VRAM, annulation, header) —
   **fait (2026-10-01)** ; reste le fournisseur Claude.
2. Tables `propositions` / `proposition_changements` et l'écran de revue
   (diff, accepter/refuser, appliquer, annuler) — utile même sans agent, testable
   avec des propositions écrites à la main.
3. Conversation d'intake et brief.
4. « Générer le projet », étape par étape.
5. Portées réduites (épisode, scène, plan) et reconstitution du brief.
6. Agent d'itération sur un plan, après visionnage.

## 14. Système d'agents : conversation, brief, propositions (construit, 2026-10-02)

> **État construit (backend)** ; l'interface (popup à étapes) s'appuie sur l'API
> ci-dessous. Les tables du §7 ont pris leur forme définitive ici ; **le vocabulaire
> « mode » (§2, §6.2) est abandonné** (décision du 2026-10-02) : voir `FRICTIONS.md`,
> « Système d'agents ».

### Parcours
- **Profondeur complète** (création de projet) : Conversation → Brief → Proposition →
  Appliqué. Chaque tour de conversation est une tâche de la file (`conversation-agent`) ;
  la génération du brief est une tâche (`brief-projet`, un BROUILLON) ; la proposition est
  le **squelette**, construit en code depuis le brief (pas d'appel au modèle).
- **Profondeur courte** : Consigne → Proposition → Appliqué. Une tâche (`prompt-asset` pour un
  asset, `scenario-episode` pour un épisode ou un plan) dont le JSON est converti en code en
  changements.
- **Revue** : les changements sont groupés (écrasement en tête, brief, projet, saison,
  épisodes, scènes, plans, assets), cochables par changement ou par groupe, avec avant/après,
  avertissements, rangs déplacés pour une insertion de plan. **Application** : une
  transaction, tout ou rien, verrou de portée, confirmation d'un écrasement.

### Tables (migration 0033)
| Table | Rôle |
|---|---|
| `agent_conversations` | une par (projet, portée, cible) — UNIQUE (projet, portée, coalesce(cible, 0)) ; `profondeur`, `etape`, `messages` jsonb, `consigne`, `brief_pret`, `proposition_id` (courante) |
| `briefs` | un par projet : `contenu` jsonb (schéma de `brief-projet`), `statuts` jsonb (section → fourni / deduit / a_valider), `statut` (**partiel** = style et notes posés à la main / brouillon / valide), `version`. **Source unique de la clause de style et des notes** : `projects.clause_style` / `notes` n'en sont que des copies (`lib/agents/brief-db.ts`), voir `FRICTIONS.md` |
| `propositions` | `uuid`, `conversation_id` (set null), `skill` (`squelette` ou un skill), `portee` + `cible_id`, `statut` (en_generation / prete / appliquee / partielle / rejetee / echouee), `run_id` → `agent_runs`, `parent_id` (affinage), `consigne`, `retour`, `resume`, `contexte` (« contexte utilisé »), `erreur` |
| `proposition_changements` | `ordre`, `groupe`, `cle` (clé symbolique d'une création), `cible_type` (brief / projet / saison / episode / scene / asset / plan), `cible_ref`, `libelle`, `operation`, `avant`, `apres`, `position`, `avertissements`, `ecrase`, `coche`, `refuse_raison`, `applique_at` |
| `agent_runs` (+3 colonnes) | `but` (tour / brief / proposition), `conversation_id`, `proposition_id` |

### Code
- `lib/agents/types.ts` : types partagés (importables par l'UI) ; `SECTIONS_BRIEF`.
- Pur et testé (`lib/agents/agents.test.ts`) : `portee.ts` (verrou), `cochage.ts` (cochage par
  défaut, compteurs, groupes), `rangs.ts` (insertion d'un plan), `brief.ts` (statuts, sections,
  différences), `squelette.ts`, `conversion.ts` (sorties de skills → changements).
- Base : `applicateurs/` (un par cible : prévisualiser, vérifier, appliquer ; registre
  `applicateurs/index.ts` — une cible sans applicateur est refusée explicitement),
  `proposition-db.ts` (enregistrer les changements, appliquer en transaction), `contexte.ts`
  (entrées des skills et « contexte utilisé »), `runs.ts` (tâches), `service.ts` (toute la
  logique ; les actions n'en sont que des enveloppes), `lib/ordre-plans.ts` (ordre des plans).
- Worker : `worker/agents/postTraitement.ts`, appelé par `worker/llm.ts` dans la transaction
  d'écriture du résultat.
- Skills : `conversation-agent` (un tour, `{ reponse, briefPret }`), `brief-projet` (+ champ
  optionnel `statuts`), `scenario-episode` (portées `episode`, `plan-a-inserer`,
  `plan-a-corriger`).
- Essai : `npm run agents:e2e` (faux exécuteur injecté dans le vrai worker, base de dev,
  nettoyage complet).

### API (voir `app/agents/actions.ts`, documentation en tête de fichier)
Écritures (toutes `{ ok: true, … } | { ok: false, erreur }`) : `ouvrirConversation`,
`nouvelleConversation`, `envoyerMessage`, `reinitialiser`, `genererBrief`, `rejeterBrief`,
`modifierChampBrief`, `genererProposition`, `cocherChangement`, `cocherChangements`,
`corrigerChangement`, `rejeter`, `affiner`, `appliquerSelection`.
Lectures (`lib/queries-agents.ts`) : `trouverConversation`, `lireConversation`, `lireBrief`,
`lireProposition`, `lirePropositionCourante`, `apercuContexte`, `estimerGeneration`,
`listerPropositions`.
L'interface sonde `tache` (en_attente / en_cours) toutes les 3 s. La cible d'une
conversation se désigne `{ id }` (saison, épisode), `{ uuid }` (plan), `{ code }` (asset) ;
`VueConversation.cible` la renvoie dans cette forme (l'id interne d'un plan est aussi accepté).

### Étape 1 construite : écrire les scénarios (lots, 2026-10-02)
Voir `FRICTIONS.md`, « Écrire les scénarios des épisodes : un LOT de sous-tâches ». En bref :
une proposition peut être un **lot** (colonne `propositions.lot`), une tâche `agent_runs` par
sous-tâche (`cle_sous_tache`) ; le statut du lot se décide à chaque fin de sous-tâche
(`lib/agents/lots.ts`, `finaliserLot`) ; le header montre une entrée « 3/12 ».
Nouvelles actions : `genererScenarios(conversationUuid, { episodeIds?, consigne? })`,
`relancerSousTache(propositionUuid, cle, retour?)`, `annulerLot(propositionUuid)` ; lectures :
`VueProposition.lot`, `listerEpisodesPourScenariosVue`, `estimerScenariosVue`. Nouvelle cible de
changement : `replique`.

**Brancher les étapes 2 et 3 sur la même infrastructure** :
1. Une **étape = une proposition en lot** dont chaque sous-tâche est une tâche `agent_runs` d'un
   skill (`prompt-asset` par asset, `prompt-voix` par voix, `plan-h3` par plan) : choisis une clé
   (`asset:12`, `plan:<uuid>`), un libellé, et pose les tâches avec `creerRun(…, { cleSousTache,
   libelleSousTache })` dans une action `genererXxx` calquée sur `genererScenarios`
   (`lib/agents/service.ts`) — `nouvelleProposition(conv, { skill, lot: true, … })`.
2. Écris la **conversion en code** « sortie du skill → changements » (comme `depuisScenarioEpisode`,
   pure et testée) avec un préfixe de clés par sous-tâche et un `groupe` par unité (la revue en fait
   un groupe repliable), puis ajoute la branche correspondante dans
   `worker/agents/postTraitement.ts` (`postSousTacheLot` : épisode → remplacer par le skill/la clé).
3. Si la cible n'a pas d'applicateur, ajoutes-en un (`lib/agents/applicateurs/`, registre
   `index.ts`) : prévisualiser, vérifier, appliquer ; sans lui, le changement est refusé avec un
   message clair. Pour `plan-h3` : l'applicateur de fiche de plan (sections, `plan_refs`,
   assets manquants à créer) est le gros morceau.
4. Côté interface rien d'obligatoire : `ListeSousTaches`, la revue par groupe et le header
   fonctionnent pour tout lot ; ajoute un point d'entrée (« Continuer » à l'étape « Appliqué » de
   l'étape précédente) et, si utile, un sélecteur comme `ChoixEpisodes`.

### Reste à faire
Page Monitoring, point de retour, applicateurs de prompt H3 / de suppression / de modification
de réplique, **étapes 2 (registre d'assets + prompts) et 3 (plan-h3)**, fournisseur Claude,
enchaînement automatique des étapes, comparaison des modèles locaux sur les skills longs
(plan-h3 d'abord : l'essai de qualité sur les 27 plans réels de l'épisode 1).
