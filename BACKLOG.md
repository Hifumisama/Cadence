# Backlog Cadence

Ce qu'on décide ensemble. Mis à jour à chaque point d'étape. Risque : **faible** / **moyen** (creuser le besoin avant de coder) / **haut** (argumentaire et preuves).

## En attente d'un essai réel de l'utilisateur
- **Machine à états de revue** : fait (31b0cee, migrations 0085 et 0086). Reste à vérifier à la main : un projet créé par l'installateur et un « Itérer » sur un clip.
- Ensuite, **supprimer la colonne `coche`** (devenue « appliqué par défaut », recalculable). Faible.

## Production : mise à niveau faite le 2026-11-13
Migrations 0085 à 0087 et rangement des images d'assets par projet appliqués (procédure : un push sur `main` redémarre la prod via Watchtower, d'où l'arrêt préalable de Watchtower, puis `docker compose -f docker-compose.prod.yml` : stop, pg_dump, pull, `run --rm worker` pour migrer puis lancer `scripts/migrer-assets-par-projet.ts` à blanc puis `--appliquer`, enfin `up -d`).
Reste à nettoyer quand tout est vérifié : le dossier `_sauvegarde_assets_<date>` et le fichier `cadence-avant-migration.sql` sur le mini PC, le script `scripts/migrer-assets-par-projet.ts`, facultatif `voix/` sur le NAS. Regénérer les assets repassés « sans image » (projets 208 et 210 en local).

## À faire, décidé
- **Validation côté serveur (zod)** des server actions : en cours (branche menage/zod).

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
