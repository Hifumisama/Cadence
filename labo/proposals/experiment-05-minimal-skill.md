# Expérience 05 : `scenario-scene` à partir d'un noyau artistique minimal

Demandée le 2026-11-27 ; annoncée par l'auteur comme le **dernier test**. En attente du prompt S1. Aucun appel fait.

## Versions

- **S0** : skill de production, sans réflexion. **S1** : prompt proposé par GPT, sans réflexion.
- Même modèle, mêmes entrées, mêmes paramètres, même structure JSON, plans de 4 à 10 s.
- Premières réponses, sans relance heuristique (seule une réponse hors format est renvoyée). Alertes et mesures relevées.
- Un duel à l'aveugle ; l'auteur choisit.

## Ce que S1 doit respecter

Vérifié dans le code. Rien d'artistique.

| Obligation | Qui en dépend |
|---|---|
| Un récit dans chaque description | Open H3 IR refuse un plan sans récit |
| Répliques `NOM : « texte »`, une par ligne, après le récit ; nom du registre ou `voix off` | découpées par le code |
| `liaison` : `suite` = la vidéo continue le plan précédent sans coupe, sinon `coupe` | rendu |
| Premier plan : `coupe` sans scène précédente ; `suite` si `etatEntree` reprend son `etatSortie` | contrôle, rendu |
| `tempsFort` vrai sur un plan au plus, celui du moment marqué « (temps fort) », sans écrire la marque | intensité maximale au rendu |
| Texte en français, répliques dans la langue du brief | interface, traduction |
| Chaque description se suffit, sans renvoi à un autre plan | plans déplaçables, traduits un par un |
| Consignes de l'auteur sur l'image ou le son : ligne `Consigne de l'auteur :` | lue par la traduction |
| Personnages nommés comme au registre ; titres de plans distincts | références ; réécriture d'une scène |
| Partir de `etatEntree`, arriver à `etatSortie`, montrer les moments de la scène et pas ceux des autres | scènes écrites en parallèle |

Les champs, la durée entière de 4 à 10 s et le format sont imposés par le schéma.

À transmettre comme information, pas comme règle : la description est traduite telle quelle vers le prompt vidéo.

Non repris : mouvement, durées par rythme, regroupements, climax, interdiction de caméra, formules à éviter.

## Le schéma réintroduit les anciennes règles

Le prompt envoyé est `SKILL.md` **suivi du schéma de sortie, descriptions comprises** (`lib/llm/skills.ts`). Ces
descriptions redisent les anciennes consignes (positions et repères, gestes visibles, pas de caméra, durées selon le
rythme, regroupement, marge des dialogues, « rule 9 »).

**Les skills repensés de l'expérience 04 (T2, T3) les ont donc reçues** : ils n'étaient pas indépendants de l'ancien.

Proposition pour S1 : une copie du schéma dans le labo, **même structure et mêmes contraintes**, aux descriptions
réduites au sens technique de chaque champ. S0 garde le schéma de production.

## S1 reçu : comparaison avec les obligations

Prompt de GPT enregistré tel quel : [`SKILL.md`](scenario-scene-minimal/SKILL.md) (≈ 670 mots ; seul ajout, l'en-tête
exigé par le chargeur, non envoyé au modèle).

**Déjà couvert** : récit, sens de `suite` et `coupe`, français, noms du registre, moments, états d'entrée et de sortie,
format des répliques, convention `Consigne de l'auteur`, renvoi au contrat de sortie pour `tempsFort`.

**Manquant**, à ajouter à la fin du prompt si l'auteur est d'accord :

```markdown
## Technical contract

- Each description stands alone: plans are translated one by one and can be reordered. Never refer to another plan.
- Tell the ending inside the narrative, never as a separate labelled line.
- Write only this scene: the other scenes of the treatment are written separately.
- Each dialogue line is on its own line, after the narrative; `voix off` names a narrator.
- An author's direction goes on its own line after the narrative, starting `Consigne de l'auteur :`.
- The scene's first plan is `suite` when `scene.etatEntree` repeats `scenePrecedente.etatSortie`, and `coupe` when there
  is no previous scene.
```

**Schéma neutralisé** : [`sortie.schema.json`](scenario-scene-minimal/sortie.schema.json), même structure et mêmes
contraintes (vérifié), titres distincts et `tempsFort` gardés dans leur description.

La scène proposée n'a ni réplique ni temps fort, et ne prolonge pas la précédente : le test ne dira rien de ces trois
points.

## Résultat (2026-11-27)

**L'auteur préfère S0** (production). Aucun motif donné. Il avait d'abord parlé du texte « A » ; la réponse retenue est
celle enregistrée sur la page.

| | S0 production | S1 noyau minimal |
|---|---|---|
| Plans / durée brute (cible 58 s) | 6 / 48 s | 7 / 68 s (un par moment) |
| Mots de récit | 841 | 506 |
| Plans contenant « Ce plan » | **6/6** | **0/7** |
| Enchaînements `suite` | 0 | 5 |
| Titre du film écrit | oui | non |
| Temps / alertes de production | 31 s / 1 | 28 s / 1 |

Les deux alertes portent sur le plan du titre, demandé par la scène (voir l'[audit](../audits/checks-audit.md)).

Lecteur Claude (isolement imparfait) : **S1 devant S0**, plus lisible ; défauts de S0 : gloses en fin de plan, fautes,
plan surchargé ; de S1 : un objet mal suivi, titre jamais écrit. ChatGPT : en attente.

Limites : une scène, une génération, un film ; l'auteur connaît le style actuel.

## Déroulé (validé par l'auteur)

- **Scène 264·3** (58 s, 7 moments, format de traitement actuel). L'auteur connaît la scène, pas les nouveaux textes.
- S0 repris de la campagne 01, version A, répétition 2, premier appel : jamais lu. Même modèle, même corps de requête,
  même plafond de 16 384 jetons (vérifié par le code). **1 appel GPU.**
- Premières réponses ; un duel pour l'auteur ; même fichier anonyme pour un agent Claude et pour ChatGPT, qui relèvent
  les défauts sans voter.

```bash
npm run labo -- run duration-259-261-264 --campaign 04 --round 4 --reuse labo/runs/<campagne 01> --launch
```
