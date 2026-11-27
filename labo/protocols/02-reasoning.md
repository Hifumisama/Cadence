# Campagne 02 : la réflexion de Swift sur `scenario-scene`

**Suspendue le 2026-11-27** : une version légère est proposée, [expérience 04](../proposals/experiment-04-reasoning-light.md).

Écrit le 2026-11-27, **avant** tout appel. Mis à jour le même jour après la campagne 01 : base A, lecture en duels.
Partie technique et seuil de 3 min validés par GPT ; plafond à 28 000 jetons et relevé mémoire proposés par Claude et
approuvés par l'utilisateur. **La règle de qualité (conditions 1 à 3) est à valider avant le pilote.**

## Question

La réflexion, activée dès la première génération, améliore-t-elle assez la construction d'une scène pour justifier son
coût ? La réponse juge la construction des scènes, pas la progression de l'épisode.

## Versions

| | `enable_thinking` | `reasoning_effort` | Plafond de sortie |
|---|---|---|---|
| T0 | `false` | `"xhigh"` | 28 000 |
| T1 | `true` | `"xhigh"` | 28 000 |

- Seul `enable_thinking` diffère : même prompt (vérifié par son empreinte), même entrée, même température (celle du
  serveur, 1,0), même délai maximal (10 min), même contrôle de production avec son unique renvoi.
- **Base : A**, le prompt de production, passé par `--base A` : la [campagne 01](01-duration.md) n'a rien retenu
  (arbitrage de GPT). Donc aucune relance de durée.
- T0 n'est donc pas exactement la production : plafond à 28 000 au lieu de 16 384, effort nommé (sans effet quand la
  réflexion est coupée).

## Contexte du serveur : 45 056 jetons, un seul slot

Une réponse au plafond demande 28 000 jetons : il en reste **17 056** pour la demande. Estimations (nombre de
caractères, calé sur un seul appel mesuré : 9 362 jetons) :

| Demande | Jetons envoyés | Marge au plafond |
|---|---|---|
| Première génération, 9 scènes | 8 850 à 10 400 | au moins 6 600 |
| Renvoi de production | jusqu'à ≈ 14 000 (réponse précédente et alertes) | ≈ 3 000 |

La réflexion d'un tour précédent n'est pas renvoyée. Le plus gros appel avec réflexion jamais tracé fait 14 325 jetons.
Toute coupure est détectée et compte contre T1.

**Vérification réelle** : `pilot.md` et `verdict.md` donnent, pour **chaque appel, renvois compris**, les jetons envoyés
et écrits, la marge au plafond, la marge réelle et le motif d'arrêt. Le pilote peut n'avoir aucun renvoi : la marge d'un
renvoi reste alors une estimation jusqu'à la campagne. Avant le pilote, je relis la taille du contexte sur la ligne de
commande du serveur.

## Pilote

- 3 scènes, T1 seul, 1 répétition : entrée la plus courte (259·1), médiane (264·2), la plus longue (261·2).
- **Sorties exclues de l'évaluation**, non lues, cachées de la page du labo ; `read` et `score` les refusent.
- Bloquant : sortie hors schéma ou en échec, défaut de structure (description sans récit, « État en fin de plan »),
  troncature, plus de 10 min.
- Relevé : durée, jetons, marge de contexte, mémoire, alertes de production (pour information).

```bash
npm run labo -- run duration-259-261-264 --campaign 02 --base A --pilot --launch
```

## Campagne

- 9 scènes × 3 répétitions × T0 et T1 : 54 appels, plus renvois.
- Versions alternées scène par scène ; celle qui passe la première change à chaque fois (la seconde profite du prompt
  gardé en cache par le serveur).
- GPU libre : aucun rendu, file de Cadence vide.

```bash
npm run labo -- run duration-259-261-264 --campaign 02 --base A --launch
```

Avant les notes : aucun rapport comparatif, essai masqué dans la page, aucun résultat commenté.

## Ce qui est capturé à chaque appel

| Donnée | Origine |
|---|---|
| Jetons lus et écrits (réflexion comprise), motif d'arrêt, modèle servi | serveur |
| Temps de lecture et d'écriture, cache, brouillons MTP | serveur (`timings` de llama.cpp), s'il les renvoie |
| Durée de l'appel, temps des appels en échec, renvois, code d'erreur | labo |
| Jetons de réflexion | découpeur du modèle sur le texte gardé (compte exact de ce texte, balises exclues) ; sinon **estimation** par la part des caractères. La méthode est notée à côté de chaque valeur ; au-delà de 100 000 caractères gardés, le compte est un minimum |
| Pics de VRAM et de RAM | **plus haut niveau observé** par relevés de ComfyUI chaque seconde environ : un pic bref peut échapper, et la VRAM compte tout ce qui occupe la carte |

Une sonde en panne n'interrompt rien : la valeur manque, c'est tout.

## Lecture à l'aveugle

**Six [duels](qualitative.md)** T0 contre T1, sur les 6 scènes de la campagne 01 (259·2, 261·1, 261·2, 261·3, 264·1,
264·2), première répétition où les deux versions ont une sortie. **La réflexion n'est jamais montrée.**

## Règle de décision

La réflexion devient le fonctionnement normal de `scenario-scene` si les six sont vrais.

Qualité, **proposition à valider** (remplace les trois notes de la version précédente) :

1. T1 gagne au moins 4 duels sur 6 ;
2. T0 en gagne au plus 1 ;
3. T1 n'est jamais seul signalé comme trahissant une scène.

Au hasard pur, sans égalité, les conditions 1 et 2 sont remplies environ 1 fois sur 9 (7/64).

Technique, inchangée :

4. T1 n'a pas plus d'échecs techniques que T0 ;
5. aucune sortie de T1 n'est tronquée ;
6. le temps médian par scène de T1 est inférieur ou égal à 180 s.

Définitions :

- **Échec technique** : un enregistrement (scène, version, répétition) qui finit sur une erreur : sortie hors schéma
  après le renvoi, délai de 10 min dépassé, flux coupé, erreur du serveur, relance en échec.
- **Panne** : serveur injoignable. Elle n'est imputée à aucune version ; la paire est écartée des échecs et des temps,
  et signalée.
- **Tronquée** : au moins une réponse de l'enregistrement, renvoi compris, arrêtée sur la longueur (plafond ou contexte),
  même si le renvoi a rattrapé.
- **Temps par scène** : somme des appels de l'enregistrement, renvois, relance et appels en échec compris. Médiane sur
  toutes les scènes et répétitions.
- Un essai incomplet est non concluant.

Rien n'est appliqué en production par cette campagne : adopter la réflexion serait une décision séparée
(`LLM_CORPS_SCENARIO_SCENE` et `LLM_MAX_TOKENS_SCENARIO_SCENE`, sur chaque machine).

## Coût estimé (incertain avant le pilote)

Pilote : environ 6 min. Campagne : environ 10 min pour T0, 40 à 80 min pour T1. Lecture : 6 duels, soit 12 textes sans
note à donner ; sa durée n'est pas mesurée.

## Limites

Exploratoire : 6 duels, un seul lecteur qui connaîtra déjà ces scènes. Température 1,0, forte variabilité. Un texte plus
long peut trahir sa version.

## État du code

Le rejeu, le pilote et les conditions 4 à 6 sont prêts. Les conditions 1 à 3 et la lecture en duels de cette campagne
restent à coder **après validation de la règle** : `read` refuse la campagne 02 d'ici là, et `src/score-reasoning.ts`
applique encore l'ancienne règle à notes.
