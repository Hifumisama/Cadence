# Plan — Conception d'un projet (page dédiée, bibliothèque de styles, scénariste)

Rédigé le 2026-10-07. Maquette validée : <https://claude.ai/artifact/5dp9BvLwAFzZAH2zEbVMyi> (privée, version 5).
Décisions de l'utilisateur du 2026-10-07 intégrées (§7). Ce n'est plus une « pré-conception » avant l'entretien : c'est la conception complète d'un projet, de la page de départ jusqu'à l'avancée de la préparation. Ce plan s'appuie sur une lecture du code (chemins entre parenthèses) ; ce que je n'ai pas
vérifié est marqué **à vérifier**.

## 1. Ce qu'on construit

Une page de création de projet en 8 scènes, avant et autour de l'entretien :

| # | Scène | Contenu | Où ça va |
|---|---|---|---|
| 1 | Format | Film (défaut) / Série (+ nombre d'épisodes prévus) | `projects.type` (`oneshot`/`serie`) |
| 2 | Genre et ton | 1 à 2 genres, curseur de ton prérempli par le genre | `brief.genreTon` (texte dérivé) |
| 3 | Durée et rythme | Durée par épisode, rythme, estimation du nombre de plans | `brief.dureeEpisodeSecondes`, `brief.rythme` |
| 4 | Langue | Les 10 langues de H3 + « Sans dialogue », français par défaut | `brief.langueDialogues` |
| 5 | Style | Bibliothèque filtrable (galerie / liste) ou style libre : prompt image + clause courte + image 2:3 facultative | `brief.style` |
| 6 | Scénario | Entretien avec « le scénariste » (accroche variable selon ton et genre), fiche de notes dépliable | `agent_conversations` |
| 7 | Clap | Récapitulatif complet, titre, affiche-aperçu | `projects.nom` |
| 8 | Avancée | Progression de la préparation | installateur existant (`creations_projet`) |

Principe : tout ce qui est quasi déterministe se choisit avant, l'agent ne parle plus que de ce qui demande une vraie
conversation (arc, fin, personnages).

## 2. Constats sur le code actuel

- Il n'y a **pas de page « nouveau projet »** : la création passe par la modale `components/projects/NouveauProjetModal.tsx`
  (`creerProjet` / `creerProjetSansRedirection`, `app/projects/actions.ts:21,41`). « Créer avec l'agent » ouvre ensuite
  `AgentDialogue` (étapes `consigne|conversation|brief|proposition|applique`, `lib/agents/types.ts:21`).
- Le brief (`BriefContenu`, `lib/agents/types.ts:113`) a déjà `genreTon` (une chaîne libre), `style{nom, clause}`,
  `langueDialogues` (chaîne libre), `dureeEpisodeSecondes`, `rythme` (enum `lent|mesure|soutenu|rapide|variable`).
  Il n'a ni format, ni nombre d'épisodes, ni bibliothèque de styles, ni image de style.
- L'entretien actuel : `notes-entretien` tient une **fiche** (`agent_conversations.fiche`, `lib/agents/fiche.ts`) ;
  `aTrancher` = `REQUIS` (arc, fin, genreTon, style, rythme, dureeEpisodeSecondes, personnages) moins ce qui est rempli
  (`fiche.ts:40,149`). `langueDialogues` n'est pas requis (défaut « Français », statut `deduit`, `ficheVersBrief`).
  Statuts de fiche : `fourni|delegue|deduit`, et `appliquerNotes` n'accepte `fourni` que sur citation vérifiée
  (`fiche.ts:97`).
- Le premier message de l'agent est écrit **en code** (`lib/agents/accroche.ts` : 10 pistes de genres, 3 tirées).
- **Le style est consommé uniquement sous forme de `clause`** : `projects.clauseStyle` (copie de `briefs.contenu.style.clause`,
  `synchroniserClauseStyle`, `lib/agents/brief-db.ts:13`) alimente plan-h3, prompt-asset, prompt-affiche et **la génération
  d'images** (`app/assets/generation-actions.ts:109`, `worker/comfyui/imageMapping.ts:23,45`, nœud `ids.style`).
- L'avancement existe déjà : page `/p/[id]/creation` (installateur), `lib/agents/creation.ts` (`ETAPES_CREATION` : brief,
  squelette, scenarios, registre, inventaire, prompts-inventaire, voix, fiches, prompts-fiches), `creation-vue.ts`,
  sondage `app/api/creation/[projectId]/route.ts`, action `lancerCreationProjet`.
- Stockage : `MEDIA_ROOT` (`./data`), service `app/api/media/[...path]/route.ts`, upload FormData avec plafond 10 Mo
  (`enregistrerPoster`). Dernière migration : `0051_fiche_entretien.sql` ; la suivante est 0052 (écrite à la main,
  idempotente, entrée dans `meta/_journal.json`).
- Aucune bibliothèque de styles ni image de présentation n'existe dans l'app.

## 3. Décisions proposées (à valider) et points de friction avec FRICTIONS.md

Je n'ai trouvé dans FRICTIONS.md aucune entrée sur la conception récente de l'entretien (fiche de notes, `aTrancher`,
commits f81685f / 791adf7) : il faudra l'écrire, en plus de l'entrée de cette feature (voir §7).

**D1 — Où vivent les choix de pré-conception.** Nouvelle table `preconceptions` (`project_id` unique, `contenu jsonb`,
`created_at`) qui garde les choix bruts (format, genres, ton + « touché », durée, rythme, langue, nombre d'épisodes
prévus, id du style). Le brief reçoit les valeurs **dérivées** (`genreTon` en texte, `style`, etc.) : la règle
« une seule source : `briefs.contenu` » (FRICTIONS, décision sur la clause de style) reste vraie pour tout ce que lisent
les agents. Raison : ne pas changer le schéma de sortie du skill `brief-projet`, que `notes-entretien` recopie sous
forme de sous-schémas (test `fiche.test.ts`).

**D2 — Deux champs de style.** Prompt image (long, bibliothèque ou libre) pour Krea 2, clause courte (1–2 phrases
d'anglais, rendu seulement) pour H3. C'est cohérent avec le guide H3 (style en 1–2 phrases avant `[Shot 1]`, le reste
passe par les images de référence). **Contradiction avec l'existant** : aujourd'hui la clause sert aussi à générer les
images. Proposition : `brief.contenu.style` gagne `promptImage?` et `image?` (nom de fichier 2:3), écrits uniquement par
le code (jamais par un agent : `appliquerNotes` et `sortieVersBrief` les préservent, test dédié) ; colonne copie
`projects.style_prompt_image` écrite par `synchroniserClauseStyle` ; `imageMapping` lit `promptImage ?? clauseStyle`
(les projets existants n'ont que la clause, aucun changement pour eux).
Le schéma `brief-projet` et le sous-schéma de `notes-entretien` doivent rester identiques (test) : décrire le champ comme
« rempli par l'application, laisser vide ».

**D3 — Création du projet au passage de la scène 5 à la 6.** Les scènes 1–5 vivent côté client (état sauvegardé dans
`sessionStorage`, mono-utilisateur) : abandonner ne laisse aucun projet orphelin. Au clic sur « Rencontrer le
scénariste », une action serveur crée le projet (nom provisoire « Sans titre », car `projects.nom` est requis),
la ligne `preconceptions`, la fiche préremplie et la conversation, puis redirige vers `/p/[id]/demarrage` (scènes 6–8,
persistantes au rechargement parce que tout est en base). Le titre se règle à la scène 7 (`modifierNomProjet`).

**D4 — Préremplissage de la fiche.** Écriture directe de la fiche avec statut `fourni` (nouvelle fonction pure
`ficheDepuisPreconception`, testée), parce que `appliquerNotes` exige une citation. Effet naturel : `aTrancher` tombe à
arc, fin, personnages ; le « déjà tranché » du contexte de `conversation-agent` se remplit sans toucher à la logique.
Les statuts d'affichage « choisi / par défaut » de la maquette s'obtiennent depuis `preconceptions` (ton non touché,
durée et langue non visitées), sans nouveau statut dans la fiche.

**D5 — Film = `oneshot`.** Pas de nouveau type. Le nombre d'épisodes prévus est une **information** transmise à l'agent
(contexte), il ne crée pas N épisodes : le projet garde la création d'un seul S01E01 comme aujourd'hui.

**D6 — Rythme.** L'enum du code a 5 valeurs (dont `soutenu`), la maquette en propose 4. Proposition : garder les 5 dans
l'enum et n'en montrer que 4 (`soutenu` reste accessible à l'agent) ; sinon ajouter la 5ᵉ à l'écran.

**D7 — Langues.** Liste fermée de 10 langues + « Sans dialogue ». **À vérifier** : comment `plan-h3` et
`prompt-voix` traitent un épisode sans dialogue (`extraitsBrief` lit `langueDialogues`, `contexte.ts:32`) ; il faudra
une valeur sentinelle explicite et un test.

**D8 — La clause courte des 245 styles n'existe pas encore.** Le fichier de bibliothèque contient le prompt long
(`descriptor`). Il faut produire une clause courte par style (script LLM local + relecture). **Hypothèse** : la clause
courte ne contient pas de noms d'auteurs ni de studios (H3 : décrire le rendu), alors que le prompt long les garde
(décision de l'utilisateur, 2026-10-07). Avertissement (non bloquant) si une clause libre contient un nom propre.

**D9 — Avancée (décidé).** La page `/p/[id]/creation` existante devient la scène 8 (une seule page d'avancée, pas de doublon). Réutiliser l'installateur : les 8 étapes de la maquette sont fictives, il faut les aligner sur `ETAPES_CREATION` (9 étapes réelles) et sur `progression()`.

**D10 — Fin de la modale (décidé).** Le bouton « Nouveau projet » mène à `/nouveau`. La modale `NouveauProjetModal` et le bouton « Créer » (projet vide) disparaissent : il n'y a pas encore de production en cours, et un futur « Importer un projet » (par exemple Les Yeux de Rubis, déjà en partie tourné) les remplacera. Les actions serveur `creerProjet` / `creerProjetSansRedirection` restent (scripts, tests, futur import).

**D11 — Accroche.** `accroche.ts` (pistes de genres tirées au hasard) est remplacé par des accroches choisies selon le
ton (léger / neutre / sombre) et le genre, avec un bouton « Une autre accroche » (réécrit le premier message tant que
l'utilisateur n'a pas répondu). Elle reste **écrite en code, sans LLM**. La variation du ton des questions suivantes
passe par une consigne ajoutée à `conversation-agent` (voix adaptée au ton, phrases variées). Les questions « canned »
de la maquette n'existent pas dans le vrai flux.

**D12 — Fiche de notes à l'écran.** La maquette affiche 5 sujets (arc, fin, héros, personnages et lieux, règles) ; la vraie
fiche exige 3 sections (`REQUIS`). Afficher les sections requises d'abord et les sections facultatives remplies
ensuite ; chaque note longue est dépliable.

## 4. Phases

Chaque phase se termine par `npx tsc --noEmit` et `npm test` verts, et un commit séparé. Taille : S < ½ journée,
M ≈ 1 journée, L > 1 journée.

### Phase 0 — Bibliothèque de styles (en cours, hors code applicatif) — S
- Agent en cours : références nommées remises dans les descriptions, `promptApercu` avec une femme dans une scène
  commune à variantes (`varianteApercu`). Résultat : `docs/krea2-styles-guide.final.json`.
- À faire par l'utilisateur : tri manuel des styles à supprimer.
- Script `npm run styles:apercus` (`scripts/styles-apercus.ts`, décidé) : génère à la chaîne les images 2:3 via ComfyUI (workflow `IMG_01_TextToImage`, Krea 2 Turbo : la scène dans le nœud « prompt », le descripteur du style dans le nœud « style », exactement comme une vraie génération), seed stable par style, reprise (saute les images déjà faites), options `--only`, `--limite`, `--force`, sortie `data/styles/<id>.webp`. Sans image, l'app affiche un dégradé neutre (comportement de la maquette).

### Phase 1 — Modèle et logique pure — M
- Migration `0052_preconception.sql` : table `preconceptions` ; colonne `projects.style_prompt_image` (nullable) ;
  entrée dans `meta/_journal.json` ; schéma Drizzle (`db/schema.ts`).
- `lib/agents/types.ts` : type `Preconception`, `BriefContenu.style.promptImage?` / `image?` ; schémas
  `brief-projet` et sous-schéma `notes-entretien` mis à jour ensemble.
- `lib/preconception.ts` (pur) : validation, `ton → texte` (« Drame + Thriller, sombre »), estimation du nombre de plans
  (mêmes règles que `scenario-episode`), `ficheDepuisPreconception`, `briefPartielDepuisPreconception`.
- `synchroniserClauseStyle` étend la copie à `style_prompt_image`.
- Tests : validation (langues, durée ≥ 30 s, 2 genres max), dérivation du ton, fiche `fourni` et `aTrancher` réduit à
  arc/fin/personnages, préservation de `promptImage` face à `appliquerNotes` et `sortieVersBrief`, non-régression des
  tests `fiche`, `brief-schema`, `brief-partiel`.

### Phase 2 — Bibliothèque dans l'app — M
- Import : `lib/styles/bibliotheque.json` (copie versionnée, id = slug du nom), chargeur typé, filtres (medium, rendu,
  palette, époque, ambiance, catégories) et recherche, sans dépendance serveur.
- Images de présentation servies par `app/api/media` depuis `data/styles/` (miniatures existantes réutilisables) ;
  repli dégradé si absente.
- Clauses courtes : écrites une fois pour les 245 styles dans `lib/styles/clauses.json` (pas de skill dans l'app : la
  bibliothèque est figée, un style libre se saisit à la main), contrôle automatique en test (longueur, pas de nom propre,
  pas de cadrage/mouvement) ; à relire à la main.
- Tests : chargeur, filtres, validation des clauses.

### Phase 3 — Page `/nouveau` (scènes 1 à 5) — L
- Route `app/nouveau/page.tsx`, composants `components/preconception/*` (ruban horizontal, scènes, ambiance, fader de
  ton au pointeur, règle de durée, bande de plans lisible, galerie et liste de styles avec aperçu agrandi, style libre
  avec upload 2:3 plafonné à 10 Mo). Jetons CSS de Cadence (anthracite, or ; écarlate seulement pour les alertes).
- Navigation clavier, `prefers-reduced-motion`, mobile (ruban défilant, liste par défaut).
- Action `creerProjetPreconcu(preconception)` : transaction projet + saison/épisode (comme `creerProjet`) +
  `preconceptions` + brief partiel (style, notes) + fiche + conversation ; redirige vers `/p/[id]/demarrage`.
- Avertissement de références nommées dans une clause libre (liste réduite, extensible).
- Tests : action (création atomique, rollback), reprise depuis `sessionStorage` (fonction pure).

### Phase 4 — Scène Scénario (entretien) — M
- Réutiliser le moteur existant (`envoyerMessage`, `postNotes`, `postTour`), pas `AgentDialogue` : nouvelle vue plein
  écran avec en-tête « Votre scénariste », fil, saisie, fiche de notes dépliable (sections `REQUIS` d'abord).
- `lib/agents/accroche.ts` réécrit (D11) + action `autreAccroche`.
- `conversation-agent/SKILL.md` : consigne de voix selon le ton, variété des tournures ; le « déjà tranché » inclut la
  pré-conception. `notes-entretien` : a priori inchangé.
- Tests : accroche (pools par ton et genre, déterminisme avec graine), `entreeTour` avec fiche préremplie,
  `brief-entree.test.ts`. Rejeu : `scripts/rejeu-creation.ts` (ajouter une fixture avec pré-conception) pour comparer
  avec la baseline HEAD 791adf7.

### Phase 5 — Clap et avancée (scènes 7 et 8) — M
- Clap : lecture de la fiche et de la pré-conception, titre modifiable, affiche-aperçu (composition client à partir de
  l'image de style, ce n'est pas l'affiche générée de `prompt-affiche`), « Lancer la préparation » =
  `genererBrief` (sans LLM) + `lancerCreationProjet`.
- Avancée : restyler `SuiviCreation` (numéros ronds, pourcentage compact) et le brancher sur `lireVueCreation` ;
  compteurs réels (plans, assets, prompts, fiches) depuis la base.
- Tests : `creation.test.ts` existant (progression), cas « sans dialogue » (étape voix passée).

### Phase 6 — Documentation et finition — S
- `docs/FRICTIONS.md` : entrée « Pré-conception » (décisions D1 à D12, ce qu'elle change dans l'entretien) ;
  entrée sur la conception de l'entretien actuel si absente.
- `docs/CONCEPTION_AGENTS.md`, `docs/guide/` si une page parle de la création de projet, `CLAUDE.md` (pointeur).
- Modale : renvoi de « Créer avec l'agent » vers `/nouveau` (D10).

## 5. Vérification

- Automatique : `npx tsc --noEmit`, `npm test` (≈ 493 tests aujourd'hui), tests ajoutés par phase.
- Avec l'utilisateur (le guider plutôt que lancer des vérifications navigateur coûteuses) : parcours complet de
  `/nouveau` sur ordinateur et téléphone, un projet « film sans dialogue », un projet « série » avec style libre et
  image, puis lecture des `agent_traces` du tour d'ouverture et du premier tour.
- Rejeu : `agents:rejeu` avant/après pour l'entretien (nombre de tours jusqu'au brief prêt, questions redondantes avec la
  pré-conception).

## 6. Risques

- **Images de style** : 245 images à générer ; le reste de l'app ne doit pas dépendre de leur présence.
- **Deux champs de style** : toucher `imageMapping` change le comportement de la génération d'images pour les nouveaux
  projets seulement (repli sur la clause) ; vérifier avec une génération réelle.
- **Schémas partagés** : `brief-projet` et `notes-entretien` doivent rester synchrones (test existant) ; le test échouera
  tant qu'ils ne sont pas modifiés ensemble.
- **Projet créé trop tôt** : D3 le crée à la scène 6 ; si l'utilisateur ferme l'onglet pendant l'entretien, le projet
  existe avec une conversation entamée (c'est le comportement actuel de « Créer avec l'agent »).
- **Qualité des clauses courtes** : générées en lot par un petit modèle ; relecture manuelle indispensable avant de les
  figer.

## 7. Décisions confirmées (2026-10-07)

1. D2 : `promptImage` et `image` dans `brief.style`, écrits par le code seulement. **OK.**
2. D8 : clause courte (vidéo) sans noms d'auteurs ni de studios, prompt long avec. **OK.**
3. D10 : la modale et « Créer » disparaissent, un « Importer un projet » viendra plus tard. **OK.**
4. D9 : `/p/[id]/creation` devient la scène 8. **OK.** Le nom de la feature passe de « pré-conception » à « conception ».
5. Images de présentation : un script les génère toutes à la chaîne (voir phase 0). **OK.**
