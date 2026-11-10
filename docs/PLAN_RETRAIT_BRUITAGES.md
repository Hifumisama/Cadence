# Retrait des bruitages (assets `sfx`) — inventaire

2026-11-10. Origine : note de l'utilisateur au test FI-12 du cahier (« c'est tellement peu voire pas utilisé que l'on peut faire sauter complètement le système de bruitages
de l'app »). **Approuvé le 2026-11-10, fait sur la branche `retrait-bruitages`** (voir « Fait » en bas). Décisions : colonne `assets.duree_secondes` retirée, lecteur audio de `AssetPreview` gardé (voix), workflow et modèles Stable Audio 3 retirés (workflow et manifeste GPU).

## Ce qui reste, et ce qui n'est PAS touché

- **Les voix** : le champ voix du personnage (`assets.voix_*`, master), les références audio de voix (`<Audio N>`, rôle `voice_timbre`) et leur plafond de 3 audios. La voix
  n'a plus à « primer sur les bruitages » : la règle disparaît, la contrainte reste le plafond.
- **Open H3 IR** (paquet `h3ir-lab`) : le rôle `sfx` y existe, mais l'application cesse simplement de l'envoyer. Aucun changement côté paquet.
- **Les autres types d'assets** (personnage, décor, prop, vfx, keyframe, oth) et leur génération d'image.

## Données (petit)

| Quoi | Volume | Action |
|---|---|---|
| Assets `type = 'sfx'` | 2 (projets 29 et 233) | supprimés (migration de données), avec leurs fichiers sous `data/` |
| Générations audio de ces assets | 2 | supprimées avec eux |
| `plan_refs` vers un `sfx` | **0** | rien |
| Colonne `assets.duree_secondes` (durée du son, seul usage : sfx) | colonne | retirée par une migration (ou laissée, inoffensive : à trancher) |
| `type` d'asset | `varchar` sans enum | rien à migrer, juste le retirer des listes de types |

## Code, par couche (≈ 45 fichiers dont ≈ 16 de tests)

**1. Génération audio (Stable Audio 3) — à supprimer**
- `workflows/audio/SFX_Generate_Sounds.json`, `worker/comfyui/audioMapping.ts` (+ test), la méthode « audio » de `worker/images.ts` et la variable `COMFYUI_WORKFLOW_AUDIO_PATH`.
- `lib/asset-generation.ts` : la branche audio (messages « un son se génère avec la génération audio… », `estSon`, durée).
- `deploy/gpu/models.manifest` : les modèles Stable Audio 3 (checkpoint + encodeur de texte, lignes ~29-33) ; `workflows/README.md`, README du déploiement GPU, contrôle `npm run gpu:verifier`.
- `app/assets/essai-actions.ts` (essai de son), `app/assets/actions.ts` (durée du son).

**2. Registre et types**
- `lib/assetCode.ts` (`TYPES_ASSET`, préfixe `SFX_`), `lib/registre-types.ts`, `lib/assetMedia.ts` (type → audio), `lib/llm/variantes.ts` (variante `sfx` du skill), `lib/llm/skills.ts` (commentaire).
- `lib/agents/essai-asset.ts` (branche son), `lib/agents/applicateurs/asset.ts` (validation de durée), `lib/agents/conversion.ts` (durée du son, natures image/son).

**3. Pipeline des plans (références, fiche, compilation)**
- `lib/agents/fiches.ts` (contrôle « n'est pas un bruitage », message « la voix prime »), `lib/agents/plan-h3-controles.ts` (nature « son »), `lib/agents/plan-h3-assemblage.ts` (slots `<Audio k>` des bruitages), `lib/agents/iteration-plan.ts`, `lib/agents/inventaire.ts`, `lib/agents/contexte.ts`, `lib/agents/references-plan.ts`.
- Open H3 IR : `lib/h3ir/brief.ts` (bloc « Bruitages » : rôle `sfx`, avertissements « non transmis »), `lib/h3ir/conversion.ts` (rôle → « Bruitage »), `lib/h3ir/brief-plan.ts`, `lib/h3ir/references-plan.ts`, `lib/h3ir/references-plan-db.ts`, `lib/h3ir/references-ecriture.ts`.
- Plus simples (filtres `type !== "sfx"` qui deviennent inutiles) : `lib/plan-checks.ts`, `lib/queries-voix-plan.ts`, `lib/agents/voix-du-prompt.ts` (commentaires).
- **Worker** : `worker/index.ts` (~l.131-167 : `audioBruitages`, emplacements laissés par les voix). Les voix restent.

**4. Interface**
- À supprimer : `components/assets/AtelierSon.tsx`, la popup de génération audio (CSS `app/globals.css` ~l.3919), l'option « bruitage » de `AjouterAssetForm.tsx`, la voie « Bruitages » du Montage (`components/montage/TableMontage.tsx`, déjà « À venir »).
- À simplifier : `components/assets/FicheAsset.tsx` (bloc `type === "sfx"`), `AssetPreview.tsx` (lecteur audio : garder pour la voix si le master l'utilise), `RegistreAssets.tsx` (ordre des types), `components/ui/Icone.tsx`, `app/p/[projectId]/assets/page.tsx` et `[code]/page.tsx`, `ReferencesCases.tsx` (libellé « audio de référence (voix, bruitage) » → voix).

**5. Skills (prompts des agents)**
- `agents/skills/prompt-asset/SKILL.md` (variante `sfx`) et `references/guide-stable-audio-sfx.md` (supprimé), `agents/skills/inventaire-assets/SKILL.md`, `agents/skills/plan-h3/SKILL.md` et `assets/sortie.schema.json` (nature `son`).

**6. Documentation**
- `CLAUDE.md` : la règle non négociable « **La voix prime sur les bruitages** en cas de concurrence de slots audio » est retirée (à valider : c'est une règle du dépôt).
- `docs/CAHIER_DES_CHARGES.md`, `docs/PLAN_MONTAGE.md`, `docs/OPEN_H3_IR_ENTREES.md`, `README.md`.

**7. Tests à adapter ou supprimer** : `fiches.test.ts`, `prompt-asset.test.ts`, `plan-h3-controles.test.ts`, `h3ir/brief.test.ts`, `references-plan.test.ts` (agents et h3ir), `h3ir/conversion.test.ts`, `worker/comfyui/audioMapping.test.ts`, `references-ecriture.test.ts`, `images-projet.test.ts`, `h3ir/preparation.test.ts`, `asset-generation.test.ts`, `inventaire.test.ts`, `generation-lot.test.ts`, `iteration-plan.test.ts`, `plan-h3-assemblage.test.ts`, `plan-h3-exemples.test.ts`, `plan-checks.test.ts`, `references.test.ts`, `worker/comfyui/sortie.test.ts`.

## Ordre de travail proposé (quatre étapes, chacune livrable et testée)

1. **Interface et génération** : retirer l'atelier son, l'ajout d'un bruitage, la génération audio (workflow, worker, manifeste GPU). Plus aucun moyen d'en créer.
2. **Pipeline des plans** : retirer le type du registre, des contrôles, de la compilation Open H3 IR et du worker. Les voix restent intactes.
3. **Skills et documentation**, dont la règle de `CLAUDE.md`.
4. **Données** : suppression des 2 assets et de leurs fichiers, migration de la colonne `duree_secondes` (si retirée).

## Points à trancher avant de commencer

- Retirer la colonne `assets.duree_secondes` (migration) ou la laisser ?
- Garder le lecteur audio de `AssetPreview` (utile à la voix master) : oui par défaut.
- Les modèles Stable Audio 3 du manifeste GPU : retirés de l'image (gain d'espace disque, image à reconstruire).

## Risques

- **Worker** : les fichiers de `lib/` partagés avec le worker redémarrent le worker (`tsx watch`) : à faire quand aucun rendu ne tourne.
- **Aucun risque de données** : pas de référence de plan vers un bruitage, 2 assets isolés.
- **Rien à migrer côté Open H3 IR** : le rôle `sfx` reste disponible, simplement inutilisé.

## Fait (2026-11-10)

- **Interface** (commit `7b45c6d`, sur `retours-projet-236`) : atelier son, onglet « Son », voie « Bruitages » du Montage, popup de génération audio, option « bruitage » de l'ajout d'asset.
- **Code partagé avec le worker** (commit `558b7ff`, branche `retrait-bruitages`, à fusionner quand le worker peut redémarrer) : génération audio (workflow, mapping, branche de `worker/images.ts`, constantes `lib/asset-generation.ts`), type `sfx` du registre, nature « son » du chemin plan-h3, bloc « Bruitages » et rôle `sfx` d'Open H3 IR, emplacements audio du worker (seules les voix), variante `sfx` du skill `prompt-asset` (schéma à une seule forme), `methodeApplicable` et `raisonNonGenerable` (devenus sans objet).
- **Déploiement GPU** : modèles Stable Audio 3 et encodeur Qwen 3.5 2B retirés de `deploy/gpu/models.manifest` ; `workflows/audio/SFX_Generate_Sounds.json` supprimé.
- **Doc** : règle « la voix prime sur les bruitages » retirée de `CLAUDE.md`.
- **Migration `0081_retrait_bruitages`** : supprime les 2 assets `sfx` (et leurs essais), retire `assets.duree_secondes`. À lancer APRÈS la fusion et le redémarrage du worker (l'ancien code lit cette colonne). Les 3 fichiers audio sous `data/` sont à supprimer à la main.
