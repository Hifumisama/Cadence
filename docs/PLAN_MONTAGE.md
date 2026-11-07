# Montage — table de montage de l'épisode

2026-11-07. La page « Plans » (frise verticale) est remplacée par **Montage** : `/p/<projet>/e/<épisode>/montage`. L'atelier d'un plan
(ex-page détail) est conservé tel quel sous `/montage/<uuid>`. Les anciennes adresses `/plans` et `/plans/<uuid>` redirigent (308,
`next.config.mjs`). Maquette de référence : `docs/maquettes/montage.html`.

## Décisions

1. **Montage remplace Plans.** La matrice d'assets (jamais utilisée) est retirée ; la lecture d'épisode est fondue dans le lecteur du
   Montage ; le décompte des statuts devient des pastilles dans l'en-tête ; les trois actions de lot (toutes les prévisualisations,
   relancer les périmés, passage de nuit) restent dans la barre d'outils.
2. **Deux ordres, sans que l'un remplace l'autre** (décision structurelle, nuance la règle « l'ordre des plans est `plans.ordre` ») :
   - **Ordre des scènes** = l'ordre du SCÉNARIO : `plans.ordre` + `plans.scene_id`, **inchangé**. Il donne toujours la position d'un plan
     (« 04 »), l'ordre des fiches, le plan précédent des raccords et ce que lisent les agents. Réordonnable depuis le Montage (mode
     « Ordre des scènes ») comme depuis Scénario : même action (`deplacerPlan`), un plan qui tombe chez un voisin prend sa scène.
   - **Montage final** = le film réel (lecture, export) : les entrées de la table `montage_entrees`, **ajoutée à côté**, dans l'ordre de
     leur `rang`. Ordre indépendant du scénario.
3. **Une entrée de montage** = (épisode, plan, rendu retenu, début, fin, rang). Un plan a 0, 1 ou plusieurs entrées.
   - Dupliquer = une entrée de plus sur le même plan (propre rognage, autre rendu retenu possible) ; **aucun fichier n'est copié**.
   - Retirer du montage = supprimer l'entrée, **jamais** le plan ni ses rendus. Un plan sans entrée apparaît dans « Hors montage ».
     On ajoute et on retire par glisser-déposer (bandeau ↔ table), pas par des boutons « Ajouter ». Le montage garde au moins une entrée.
   - « Recaler sur l'ordre des scènes » trie les entrées selon l'ordre du scénario (tri stable : les copies gardent leur ordre relatif,
     rognages et rendus retenus restent). Pastille « Montage différent du scénario » quand les deux divergent ; un clip dont le rang
     diffère affiche « sc. NN ».
4. **Rognage non destructif** : `debut_secondes` / `fin_secondes` sont relatifs au début du rendu ; `fin` null = jusqu'au bout (plan entier).
   Les bornes effectives sont toujours calculées contre la durée du rendu retenu (`bornes`, `lib/montage.ts`), au moins 0,5 s.
5. **Rendu retenu par entrée** : `rendu_retenu_id` (job) ; null = rendu par défaut du plan (son essai retenu `plans.rendu_retenu_id` s'il
   est lisible, sinon le plus récent lisible). Un rendu supprimé repasse au défaut (`on delete set null`). Seul un rendu terminé avec
   son fichier peut être retenu.
6. **Plans sans rendu** (brouillons compris) : ils occupent leur durée prévue (hachurés), la lecture continue sur un carton, l'export les
   ignore. La durée totale affichée est la somme des clips, sans comparaison au brief.
7. **Durée d'un rendu** : la durée nominale (`jobs.duree_utilisee`, sinon celle du plan). Un fichier réel dure souvent quelques images de
   plus (10,13 s pour 10 s) : lecteur et export coupent à la fin nominale, pour que l'export ait exactement la durée affichée.
8. **Naissance d'un montage** : la migration 0079 crée les entrées de chaque épisode existant à partir de l'ordre actuel (un plan = une
   entrée, essai retenu, plan entier). Un épisode sans aucune entrée la reçoit à l'ouverture de la page (`assurerMontage`). Un plan né
   d'une proposition d'agent entre dans un montage déjà commencé à la place que lui donne le scénario (`ajouterPlanNeAuMontage`).
9. **Export** : bouton « Exporter l'épisode » → l'action fige les segments (rendus retenus des entrées, dans l'ordre, rognage appliqué)
   dans `montage_exports` ; une boucle à part du worker (`worker/montage-export.ts`, ffmpeg, jamais le GPU) les met au même format
   (taille la plus grande, bandes noires, cadence la plus haute), ajoute un silence pour un rendu muet, concatène (H.264/AAC) et écrit
   `montage/<épisode>/episode.mp4`, **remplacé** à chaque export (pas de versionnage). La page interroge tant que l'export tourne, puis
   propose « Regarder » et « Télécharger ». L'export est aussi une **tâche du panneau du bandeau** (« Export du montage · <projet> »,
   segments et durée, notification de fin, « vu » / retirer comme les autres) : clé `montage:<id>` (`lib/montage-tache.ts`), affichée
   avec le genre « vidéo » mais **hors de la file GPU** (`estHorsFileGpu` : pas de rang parmi les tâches GPU, ne fait attendre
   personne « derrière une vidéo ») et sans bouton d'annulation (`estAnnulable`).
10. **Pistes voix / bruitages / musique** : emplacements grisés « à venir », aucune donnée inventée.

## Modèle

- `montage_entrees` (`db/schema.ts`) : `id`, `episode_id` (cascade), `plan_id` (cascade), `rendu_retenu_id` (jobs, set null), `rang`,
  `debut_secondes`, `fin_secondes`, `created_at`. `rang` est réécrit densément (0..n), jamais une clé (F03). L'id d'une entrée ne sert
  qu'aux actions, jamais dans une URL ni à l'écran.
- `montage_exports` : `episode_id`, `statut` (en_attente | en_cours | termine | echoue, varchar), `segments` (jsonb, l'instantané),
  `nb_ignores`, `fichier`, `duree_secondes`, `erreur`, dates, `vu_at` / `masque_at` (panneau des tâches, migration 0080).

## Code

- Règles pures (testées) : `lib/montage.ts` — bornes, clips, positions, glisser/insérer, aimantation, deux ordres, recalage, hors montage,
  place d'un plan né, segments et arguments ffmpeg de l'export.
- Écritures partagées : `lib/montage-db.ts` ; lecture de la page : `lib/queries-montage.ts` ; actions : `app/montage/actions.ts`.
- Interface : `components/montage/` (`Montage.tsx`, `TableMontage.tsx`, `Inspecteur.tsx`, `Manuel.tsx`, `useLecture.ts` : horloge globale
  et deux lecteurs vidéo qui alternent, le suivant préchargé).
- Les actions des plans eux-mêmes restent dans `app/plans/actions.ts` (ce n'est pas une route, ce sont les actions de l'atelier).

## Reste à faire / à vérifier

- Tests fonctionnels avec l'utilisateur : glisser-déposer à la souris réelle (vérifié par événements synthétiques), plein écran réel
  (le repli plein cadre est vérifié), export sur un épisode aux résolutions mélangées.
- Pistes audio séparées (voix, bruitages, musique d'épisode) quand ces données existeront.
- L'export n'a pas de progression mesurée (barre indéterminée « Encodage (ffmpeg) ») ni d'annulation ; les lignes de
  `montage_exports` ne sont pas purgées (une par export ; le worker ne purge que les tâches GPU).
- Durée réelle des fichiers (ffprobe) si l'écart avec la durée nominale devient gênant.
