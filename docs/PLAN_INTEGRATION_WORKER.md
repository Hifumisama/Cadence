# Plan : intégrer la vidéo en trois étapes au worker (2026-10-30)

Chantier ouvert après le labo (`docs/CAHIER_DE_TESTS.md`, journal du 2026-10-30). Les trois workflows (`workflows/video-generation/VID_Generation.json`,
`VID_UPSCALE.json`, `VID_Finition.json`) sont validés de bout en bout par `workflows/labo/simuler-prod.mjs` ; il reste à les brancher sur le worker.
Contrat des nœuds : `workflows/README.md`, section « Contrat de la vidéo en trois étapes ».

## Décisions (utilisateur, 2026-10-30)

- **Prévisualisation = génération à 0,4 MP** (plus de brouillon à 0,2 MP). **Rendu final = upscale ×1,5 puis finition** (RIFE, RTX 1080p), toujours
  lancé *après* validation de la prévisualisation, le plus souvent **en lot** (99 % des cas), parfois pour un seul plan.
- **L'upscale reste exclusif sur le GPU** (le verrou actuel du worker ne change pas) : il décharge le LLM et rien ne tourne à côté.
- **Un plan modifié après sa prévisualisation ne peut pas passer en rendu final** : il faut refaire la prévisualisation (sinon l'upscale serait
  calculé pour rien). Détecté par une empreinte de l'entrée de la génération.
- **Latents laissés sur ComfyUI** (quelques Mo chacun) ; pas de rotation dans cette version, purge manuelle côté serveur.
- **Plan en liaison « suite »** : le latent du plan précédent alimente la prévisualisation (Motion Context) ; sans latent, repli sur l'image de
  raccord actuelle (`worker/raccord.ts`). Le lien entre plans est la colonne `plans.liaison`, qui existe déjà.
- Hors chantier : les chaînes de plans comme unité (déplacement en bloc, rupture manuelle du lien, invalidation en cascade).

## Phases

0. **Workflows promus** (fait) : `VID_Generation`, `VID_UPSCALE`, `VID_Finition` dans `workflows/video-generation/`, contrat dans `workflows/README.md`.
   `VID_REF2VA.json` reste jusqu'à la bascule (des tests et `scripts/banc-video.ts` le lisent).
1. **Base** : migration sur `jobs` : `latent_dossier` (varchar), `job_source_id` (le rendu final pointe sa prévisualisation), `empreinte_entree`
   (varchar). Aucune valeur d'enum ajoutée.
2. **Mapping et client** : un jeu d'ids de nœuds par étape, l'injection des références réutilisée, empreinte de l'entrée (prompt, durée, seed,
   références avec le contenu des fichiers) ; `poll` accepte une fin sans fichier (l'upscale ne produit qu'un latent) ; récupération du brouillon
   et du mp4 final.
3. **Worker** : prévisualisation = `VID_Generation` (brouillon dans `plans/<id>/`, latent sous un dossier propre au rendu) ; plan en suite = chargement du
   latent du plan précédent, repli sur l'image ; rendu final = `VID_UPSCALE` puis `VID_Finition`, refusé si l'empreinte a changé ; le plan passe
   `previsualise` puis `termine` comme aujourd'hui. Un lot enchaîne les upscales sans que le LLM se recharge entre deux.
4. **Nettoyage** : retrait des résolutions 0,2 / 0,3 (`lib/resolution-video.ts`), de `cablerSortie` et de `VID_REF2VA.json` ; interface : le
   bouton de rendu final exige une prévisualisation à jour, avec une action « tout upscaler » pour le lot.
5. **Tests** : tests de contrat qui lisent les trois JSON, stub étendu aux trois étapes, puis un test guidé avec l'utilisateur sur son ComfyUI.

## À lire avant de coder la phase 1

`app/` (où se lance un rendu et d'où vient le bouton « rendu final »), `lib/job-relance.ts`, `lib/queries-raccord.ts`, `scripts/banc-video.ts`
et `worker/comfyui/banc-variantes*.ts` (lisent `VID_REF2VA.json`).
