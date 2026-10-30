# Plan : intégrer la vidéo en trois étapes au worker (2026-10-30)

Chantier ouvert après le labo (`docs/CAHIER_DE_TESTS.md`, journal du 2026-10-30). Les trois workflows (`workflows/video-generation/VID_Generation.json`,
`VID_UPSCALE.json`, `VID_Finition.json`) sont validés de bout en bout par `workflows/labo/simuler-prod.mjs` ; il reste à les brancher sur le worker.
Contrat des nœuds : `workflows/README.md`, section « Contrat de la vidéo en trois étapes ».

## Décisions (utilisateur, 2026-10-30)

- **Prévisualisation = génération à 0,4 MP** (plus de brouillon à 0,2 MP). **Rendu final = upscale ×1,5 puis finition** (RIFE, RTX 1080p), toujours
  lancé *après* validation de la prévisualisation, le plus souvent **en lot** (99 % des cas), parfois pour un seul plan.
- **L'upscale reste exclusif sur le GPU** (le verrou actuel du worker ne change pas) : il décharge le LLM et rien ne tourne à côté.
- **Un plan modifié après sa prévisualisation n'est jamais upscalé à partir d'un latent périmé** (l'upscale serait calculé pour un rendu qui n'est
  plus celui du plan). Détecté avec la comparaison qui existe déjà (`lib/plans-perimes.ts` : références, prompt, durée) faite contre la
  prévisualisation retenue, plus la seed ; pas d'empreinte à stocker.
- **Mais choisir un plan périmé dans le lot, c'est accepter de le régénérer** (décision du 2026-10-30, à cause des règles de continuité entre
  plans) : un rendu final sans prévisualisation valable enchaîne génération, upscale et finition, avec la fiche telle qu'elle est maintenant. Le lot
  ne restaure donc plus le prompt du rendu retenu. Le lot doit pouvoir **se composer** (case à cocher par plan, comme « Toutes les prévisualisations » ;
  aujourd'hui `lancerUpscaleEpisode` prend tous les plans prêts) : les plans à jour sont cochés, les périmés sont signalés « à régénérer ».
- **Latents laissés sur ComfyUI** (quelques Mo chacun) ; pas de rotation dans cette version, purge manuelle côté serveur.
- **Plan en liaison « suite »** : le latent du plan précédent alimente la prévisualisation (Motion Context) ; sans latent, repli sur l'image de
  raccord actuelle (`worker/raccord.ts`). Le lien entre plans est la colonne `plans.liaison`, qui existe déjà.
- Hors chantier : les chaînes de plans comme unité (déplacement en bloc, rupture manuelle du lien, invalidation en cascade).

## Phases

0. **Workflows promus** (fait) : `VID_Generation`, `VID_UPSCALE`, `VID_Finition` dans `workflows/video-generation/`, contrat dans `workflows/README.md`.
   `VID_REF2VA.json` reste jusqu'à la bascule (des tests et `scripts/banc-video.ts` le lisent).
1. **Base** (fait) : migration 0073 sur `jobs` : `latent_dossier` (varchar) et `job_source_id` (le rendu final pointe sa prévisualisation) ;
   0074 retire `empreinte_entree`, devenue inutile (voir « Ce que l'application fait déjà »). Aucune valeur d'enum ajoutée.
2. **Mapping et client** (fait : `worker/comfyui/mappingTroisEtapes.ts`, `injecterReferences` partagée avec l'ancien mapping, `pollFin`, 11 tests) : un jeu d'ids de nœuds par étape, l'injection des références réutilisée ; `poll` accepte une fin sans fichier (l'upscale ne produit qu'un latent) ; récupération du brouillon
   et du mp4 final.
3. **Worker** : prévisualisation = `VID_Generation` (brouillon dans `plans/<id>/`, latent sous un dossier propre au rendu) ; plan en suite = chargement du
   latent du plan précédent, repli sur l'image ; rendu final = `VID_UPSCALE` puis `VID_Finition` à partir de la prévisualisation retenue si elle est à jour, sinon `VID_Generation` d'abord (le plan
   est régénéré, avec ses nouveaux latents) ; le plan passe
   `previsualise` puis `termine` comme aujourd'hui. Un lot enchaîne les upscales sans que le LLM se recharge entre deux.
4. **Nettoyage** : retrait des résolutions 0,2 / 0,3 (`lib/resolution-video.ts`), de `cablerSortie` et de `VID_REF2VA.json` ; interface : le
   rendu final (« Rendu final avec celui-ci », « Lancer l'upscale » en lot) exige une prévisualisation retenue, avec latent, et à jour.
5. **Tests** : tests de contrat qui lisent les trois JSON, stub étendu aux trois étapes, puis un test guidé avec l'utilisateur sur son ComfyUI.

## Ce que l'application fait déjà (lu le 2026-10-30)

- **Un rendu final est aujourd'hui un rejeu déterministe** : même seed, prompt, références et durée que la prévisualisation retenue, et le rendu
  repart de zéro à pleine qualité. `appliquerRendu` (`app/plans/actions.ts`) remet la seed, la durée et, au besoin, le prompt du rendu retenu sur
  le plan avant de lancer. Avec les latents, le rendu final part du **latent de la prévisualisation** : il n'a plus à rejouer le plan, mais il
  doit pointer cette prévisualisation (`jobs.job_source_id`).
- **Le lot existe** : `lancerUpscaleEpisode` (les plans « prêts », `pretUpscaleAt` + `renduRetenuId`). Il restaure aujourd'hui le prompt du rendu
  retenu sur le plan, ce qui écraserait en silence une modification faite depuis : à remplacer par un refus (le plan est compté « périmé »).
- **Détecter une fiche périmée existe** : `getPlansPerimes` (`lib/plans-perimes.ts`, `raisonsContenuPerime` dans `lib/rendus.ts`). Il compare au
  dernier rendu terminé ; le rendu final le comparera à la prévisualisation source, avec la seed en plus.
- **Création d'un rendu** : `creerJobRelance` (`lib/job-relance.ts`) ; il écrit encore `VID_REF2VA.json` et gère `activerUpscale` / résolution.

## À lire avant la phase 2

`scripts/banc-video.ts`, `worker/comfyui/banc-variantes*.ts` et `worker/comfyui/stubClient.ts` (lisent `VID_REF2VA.json` ou simulent un rendu),
`lib/queries-raccord.ts` (le rendu retenu du plan précédent), `lib/rendus.ts`.
