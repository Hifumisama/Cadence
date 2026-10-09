# Example — three replies from the facts

## 1. Options to choose from (the user gave a feeling)

`message`: "Je trouve l'épisode trop long, et la scène 1 traîne."
`faits`: `ceTour` empty; `decisions` empty; `duree`: actuelle "2:34", avecBrouillon "2:34", objectif "2:00", objectifTenu false, ecartSecondes 34; `pistes`:
1. "Couper quatre plans d'ambiance" — gain "−35 s", dureeApres "1:59"
2. "Resserrer les plans les plus longs" — gain "−7 s", dureeApres "2:27"
3. "Accélérer la scène 1" — gain "−13 s", dureeApres "2:21"

```json
{
  "reponse": "Tu es à 2:34 pour 2:00 visées, et la scène 1 est en effet la plus lente. Je vois trois pistes :\n1. Couper quatre plans d'ambiance (mouettes, filets, insert de l'écriture, la mer) : −35 s, on arrive à 1:59.\n2. Resserrer les plans les plus longs : −7 s, 2:27, sans rien supprimer.\n3. Accélérer la scène 1 seule : −13 s, 2:21.\nLaquelle tu gardes ? Tu peux en combiner plusieurs."
}
```

## 2. A decision kept, with a warning and a blocking conflict

`message`: "Plan 07 : une réplique plus sobre."
`faits`: `ceTour.creees` ["D3"]; `decisions` includes `D3` "Réplique du plan 07 plus sobre", statut "conflit", gain "0 s", constats: alerte (code) "La fiche de P07 cite l'ancienne réplique : à resynchroniser (dialogues à corriger).", alerte (code) "Le rendu de P07 sera périmé quand sa fiche sera resynchronisée.", bloquant (modele) "Le plan 08 est coupé (D1) parce que la réplique R01 du plan 07 disait déjà ce que l'insert montre ; plus sobre, elle le dit moins bien."; `duree`: avecBrouillon "1:52".

```json
{
  "reponse": "J'ai noté D3 : « Je ne reviendrai pas. ». Mais j'y vois un conflit avec D1 : on a coupé le plan 08 parce que la réplique du 07 disait déjà ce que l'insert montre, et plus sobre elle le dit moins bien. Ça bloque l'application tant qu'on n'a pas tranché. Trois sorties : on garde le 08 et la réplique sobre, on garde la réplique actuelle, ou on sacrifie le 08. À noter aussi : la fiche du plan 07 devra être resynchronisée, et son rendu sera périmé."
}
```

## 3. A refusal

`message`: "Mets le plan 22 à 9 secondes."
`faits`: `ceTour` empty; `decisions` empty; `refus`: [{contexte: "Décision « Durée du plan 22 »", raison: "Plan « P22 » introuvable (l'épisode a 14 plans)."}].

```json
{
  "reponse": "Je n'ai rien retenu : le plan 22 n'existe pas, l'épisode en compte 14. Tu pensais à quel plan ?"
}
```
