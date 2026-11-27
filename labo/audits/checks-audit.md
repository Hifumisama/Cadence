# Audit des contrôles de `scenario-scene` et de leurs renvois

2026-11-27, demandé par GPT. Données déjà enregistrées par le labo : **70 premières réponses, 38 renvois** (campagne 01
et essais suivants). Aucun appel de modèle, aucun changement de production.

Comptes : [checks-counts.md](checks-counts.md) (`npm run labo -- audit`). Jugement de chacune des 80 alertes :
`checks-verdicts.json`. **Ce jugement est le mien** (une lecture, non aveugle) : à contester au besoin.

## En bref

- **29 renvois sur 38 n'avaient aucune alerte juste.**
- Après une alerte « gestes répétés », **19 réponses sur 23** gagnent un geste de la liste dictée par le message (23 % des
  cas entre deux générations sans renvoi). **Les 19 ajouts sont absents de la scène demandée et des paroles de l'auteur.**
- **8 renvois sur 38 suppriment des plans** (6 à 14 s de moins).
- Campagne 01 : les renvois pèsent **38 appels sur 102** et **29 % du temps** de génération.
- Les contrôles de structure **ne se sont jamais déclenchés**.

## 1. Les contrôles

| Contrôle | Nature | Alertes | Justes | Effet du message de renvoi |
|---|---|---|---|---|
| Schéma, JSON, réponse coupée | indispensable | 0 observée | – | demande une réponse conforme |
| Récit absent, ligne « État en fin de plan » | indispensable | 0 | – | neutre |
| Liaison du premier plan | règle exacte | 0 | – | impose `suite` ou `coupe` |
| Plus d'un temps fort | règle exacte | 0 | – | neutre |
| Gestes répétés | motifs sur les mots | 29 | **4** | **dicte** saut, glissade, pied frappé, cambrure, coup de jambe |
| Plan immobile | motifs sur les mots | 13 | 6 | demande une action continue ou une fusion |
| Plan vide | motifs sur les mots | 12 | **0** | demande de faire agir un personnage, de couper ou de fondre |
| Phrases partagées | comparaison de texte | 26 | 26 | demande de fusionner ou de dire ce qui change |

## 2. Faux positifs

**Gestes répétés (25 sur 29 non justifiées)**

- 16 : le mot ne désigne pas un geste du personnage (vêtements, cheveux, pétales, reflets, couleurs, un mouvement de
  tête, des pas qui « s'allongent » pris pour un corps qui s'allonge).
- 7 : le second plan apporte autre chose, que le détecteur ne connaît pas (il ne voit que 7 familles de gestes), parfois
  exactement le moment demandé.
- 2 : la continuation d'un mouvement d'un plan à l'autre, que le skill exige avant une `suite`.

**Plan immobile (7 sur 13)** : 6 fois le personnage agit pendant le plan (le mot « statique » décrit une manière, ou seule la
toute fin se pose) ; 1 fois l'immobilité accompagne le titre demandé.

**Plan vide (12 sur 12 demandés par la scène)** : un personnage qui disparaît, un lieu vide à l'arrivée, un titre. Ici la
règle du skill (pas de plan vide) **contredit le traitement** : l'alerte est exacte, la correction demandée ne l'est pas.

**Phrases partagées** : exactes, mais concentrées (7 réponses, surtout une scène) et les positions redonnées après une
`coupe` peuvent en faire partie.

## 3. Ce que les renvois changent

- **Ajouts** : voir « En bref ». La cambrure apparaît dans 14 de ces réponses.
- **Cas vérifié** : un moment demandé par l'auteur remplacé par un geste de la liste
  ([analyse des skills](../proposals/scenario-skills-analysis.md), § 1).
- **Pertes** : 8 renvois suppriment des plans. Sur les 11 qui citent un plan vide, 5 gardent un plan vide et 5 perdent
  des plans.
- **Phrases partagées** : le renvoi les fait toutes disparaître **1 fois sur 7** (en ne gardant que 23 % du texte) ; les 2
  fois où il ne portait que sur elles, aucune paire n'a disparu.
- Le nombre d'alertes baisse presque toujours : **le contrôle est satisfait même quand le texte s'éloigne de la
  demande**. Ce compte ne mesure pas la qualité.
- Conséquence pour la campagne 01 : ses durées sont celles des réponses après renvoi.

## 4. Défauts du mécanisme (lus dans le code)

1. Le message dit toujours « Ta réponse **ne respecte pas le schéma de sortie** » (`lib/llm/execute.ts`), même pour une
   remarque de style, et n'autorise pas à garder la réponse.
2. Si le renvoi produit une réponse hors format, **la première réponse, valide, est perdue** et la tâche échoue (jamais
   observé ici).
3. La seconde réponse est gardée sans être revérifiée, même moins bonne.
4. La trace de production ne garde ni la première réponse ni les alertes d'un renvoi réussi : impossible d'auditer
   après coup.
5. La **relecture** reçoit ces mêmes messages, liste de gestes comprise, et son skill impose de traiter chacun
   (`lib/agents/context.ts`). Même risque, **non mesuré** (aucune donnée de relecture au labo).

Non audités : les contrôles de l'inventaire et des notes d'entretien, de la même famille.

## 5. Proposition d'évolution (rien n'est fait)

**Principe : on ne renvoie au modèle qu'une erreur certaine, qui empêche l'application de fonctionner. Le reste informe
l'auteur.**

| | Proposition |
|---|---|
| Schéma, récit, « État en fin de plan », liaison, temps fort | **bloquant**, inchangé |
| Gestes répétés | **retiré** (4 justes sur 29 : même comme information, c'est du bruit) |
| Immobile, vide, phrases partagées | **information** montrée à l'auteur, sans renvoi |
| Message de renvoi | dire la vraie raison ; « corrige cela seulement, garde le reste, n'ajoute rien » |
| Renvoi raté | garder la dernière réponse valide |
| Trace | garder la première réponse et les alertes |
| Relecture | ne plus recevoir de liste de gestes ; signalements « à vérifier », sans obligation (à décider après mesure) |

Où montrer les alertes dans l'interface reste à concevoir : aujourd'hui elles n'y apparaissent pas.

**Risque** : ces contrôles sont nés de défauts réels vus en vidéo (plans figés, secondes vides, gestes en boucle). Les
retirer peut les faire revenir, et le labo ne juge que du texte.

### Avant de décider : une vérification gratuite

Les deux versions existent déjà pour chaque renvoi. **Quatre duels à l'aveugle, première réponse contre réponse
renvoyée**, sans génération. Choix fixé d'avance : parmi les renvois sans alerte juste, un par scène, dans l'ordre des
scènes puis des répétitions, sur quatre scènes différentes. L'auteur tranche ; les lecteurs IA relèvent les défauts.

## Limites

Un jugement d'alerte par un seul lecteur ; trois films, un auteur ; surtout sans réflexion, avec des variantes de prompt
mêlées ; des réponses d'une même scène ne sont pas indépendantes ; rien n'est vu en vidéo.
