# Backlog Cadence

Ce qu'on décide ensemble. Mis à jour à chaque point d'étape. Risque : **faible** / **moyen** (creuser le besoin avant de coder) / **haut** (argumentaire et preuves).

## En attente d'un essai réel de l'utilisateur
- **Machine à états de revue** : fait (31b0cee, migrations 0085 et 0086). Reste à vérifier à la main : un projet créé par l'installateur et un « Itérer » sur un clip.
- Ensuite, **supprimer la colonne `coche`** (devenue « appliqué par défaut », recalculable). Faible.

## Production : mise à niveau faite le 2026-11-13
Migrations 0085 à 0087 et rangement des images d'assets par projet appliqués (un push sur `main` redémarre la prod via Watchtower : l'arrêter avant de pousser quand une migration de données est à faire à la main ; le script de rangement est dans l'historique git, `git log -- scripts/migrer-assets-par-projet.ts`).
Nettoyage fait (sauvegardes du NAS supprimées, script retiré du dépôt). Reste : regénérer les assets repassés « sans image » (projets 208 et 210 en local).

## À faire, décidé
- **Validation côté serveur (zod)** des server actions : en cours (branche menage/zod).

## Retours du test en profondeur (2026-11-13)
Lot rapide fait : onglets Assets/Tournage inversés, bouton « Retour au clap » retiré, état « Intention seule / Fiche rédigée » dans le tournage, prévisualisation en lot depuis le tournage, liste « Hors montage » plafonnée (~4 rangées), plans liés (« suite » / « suite rompue ») dans le montage.
À faire, dans l'ordre convenu :
- **Vérifications faites** : le ton n'était qu'un mot dans le brief (retiré, voir ci-dessous) ; Open H3 IR = 1 traduction + 1 à 3 essais de compilation (1 écriture + 0 à 2 corrections chacun), 92 % des fiches en un seul essai, 87 s en moyenne (81 compilations en local) ; le rythme fixe la durée cible des plans dans les skills de scénario (`PLAGES_RYTHME`) et le nombre de plans estimé.
- **Création, fait** : écran « Premier jet complet » (scènes, plans, durée, bouton « Voir le scénario ») à la place de l'écran des intents et du clap final ; l'écriture des fiches se fait depuis le Tournage. Slider et mot de ton retirés (le brief `genreTon` ne contient plus que les genres ; `genreTon` reste figé par la conception, à rouvrir si on veut que l'entretien y note le ton de l'histoire).
- **Création, reste** (moyen) : durées initiales variables, on garde l'estimation des plans (rythme à simplifier côté skills) ; temps estimé du squelette (demande des mesures du journal worker) ; mode de réflexion plus longue en option ; guillemets des dialogues (attention : Open H3 IR lit un `"` comme du texte à afficher, `nettoyerIntent` les remplace par `'` dans l'intent traduit).
- **Qualité** (haut, avec preuves et jugement de l'utilisateur) : densité d'information par durée de plan (exemples d'inventions à fournir) ; **template de prompt explicite** pour les références de décor (plusieurs vues) et pour l'affiche ; prompts d'assets (guide Qwen Image Edit) ; quantité de dialogue par clip (plafond mesuré, GPU).
- **Bugs à reproduire** : états non rechargés (montage), dialogues mal pris en compte, navigation/redirections (accès aux autres pages pendant une création inachevée).

## À décider avec l'utilisateur
- **Limite de 3 personnages qui parlent par plan** dans les skills `scenario-episode` / `scenario-scene` : garder, relever ou retirer, maintenant que les voix n'existent plus.
- **Relecture du scénario** : chantier à part entière (étape de l'installateur, 3 propositions appliquées sur 9). À cadrer ensemble avant toute décision.

## Idées retenues (utiles, pas lancées)
- **Fidélité par référence** (`plan_refs.retention`) choisie dans les cases de références du clip : `fully_preserved`, `partially_preserved`, `attribute_transfer`, `weak_reference`. Intérêt : décrire une variante au lieu de créer un asset (`partially_preserved`), « équiper » un personnage (`attribute_transfer`), limiter le nombre d'assets. Moyen (jugement visuel).

## Plus tard
- **Rework des prompts (skills)** : étude faite (1 échec sur 1187 runs ; le tool calling n'apporterait rien). Pistes : retirer `references-plan`, fusionner `accroche-scenariste` dans `conversation-agent`, `scenario-scene` avec `scenario-episode` (banc de comparaison d'abord), alléger les SKILL.md (162 Ko).
- **Recréation des docs** : brouillon de 6 pages courtes préparé (6 pages dans docs/, squelettes sourcés). À trancher avant : règle « une seule tâche GPU à la fois » contredite dans le code, lequel de VID_REF2VA ou de la chaîne en trois étapes est actif, « plan » ou « clip » dans les vues.
- **Tests e2e** (chantier différé).

## Futurs lointains : ne pas lancer sans demande
Storyboard (animatic), musique d'épisode, latents/chaîne de plans, banc de skills, bouton « vérifier le GPU » dans l'interface.

## Fait (2026-11-12 et 13)
Reset CSS condensé · Assets rangés par projet (260 images, local) · Docs retirée · `lib/` par domaines · noms de fichiers et commentaires en anglais · plan-h3 retiré · scripts jetables retirés · knip + CI · `.claude/` et `CLAUDE.md` refaits · robustesse (boucle vidéo, upload d'asset, délais ComfyUI) · notifications navigateur retirées · manuel du montage en popup · voix retirées · classes CSS mortes retirées · `service.ts` et `requests-db.ts` scindés · tests sur base jetable · propositions simplifiées.

## Gardé après examen
- **Repli LLM `references-plan`** (décidé le 2026-11-13) : 1 appel utile (plan drone sans décor nommé), coût faible. À réévaluer si l'usage sur les nouveaux projets reste à zéro.

## Refusé, avec la raison
- **Vue SQL `v_taches`** : la complexité de `listerTaches` est dans les mappeurs par type, les lots et la fenêtre de création, pas dans les 6 requêtes. Une vue ne la réduirait pas.
- **Séparer le dépôt en deux** : gain faible, coût de synchronisation élevé.
- **Tailwind, bibliothèques structurantes** (file de tâches, machine à états, zod sur les sorties LLM) : aucune ne remplace proprement l'existant.
