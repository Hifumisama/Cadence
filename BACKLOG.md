# Backlog Cadence

Ce qu'on décide ensemble. Mis à jour à chaque point d'étape. Risque : **faible** / **moyen** (creuser le besoin avant de coder) / **haut** (argumentaire et preuves).

## En attente d'un essai réel de l'utilisateur
- **Machine à états de revue** : fait (31b0cee, migrations 0085 et 0086). Reste à vérifier à la main : un projet créé par l'installateur et un « Itérer » sur un clip.
- Ensuite, **supprimer la colonne `coche`** (devenue « appliqué par défaut », recalculable). Faible.

## À faire en production (rien n'a été poussé : la prod n'a pas encore ces changements)
Piège : un push sur `main` construit les images (GitHub), Watchtower les tire et redémarre web et worker tout seul, et le worker applique les migrations au démarrage. Les chemins d'images d'assets changent (`assets/<projet>/`) mais le script de migration des fichiers n'est PAS automatique : sans lui, toutes les images d'assets apparaissent manquantes. D'où la procédure manuelle, dans le dossier du mini PC (`docker-compose.prod.yml` + `.env`), avec `C="docker compose -f docker-compose.prod.yml"` :
1. `$C stop watchtower web worker` (Postgres reste allumé), puis pousser sur `main` et attendre la fin de l'action « Images application » sur GitHub.
2. Sauvegarde de la base : `$C exec postgres pg_dump -U cadence cadence > cadence-avant-migration.sql`.
3. `$C pull web worker`.
4. Migrations, sans démarrer le worker : `$C run --rm worker sh -c "npm run db:migrate"` (0085 voix, 0086 statuts, 0087 par_defaut).
5. Fichiers d'assets, à blanc : `$C run --rm worker npx tsx scripts/migrer-assets-par-projet.ts` ; lire la liste (assets « perdus » = repassent sans image) ; puis avec `--appliquer` (copie d'abord data/assets dans `_sauvegarde_assets_<date>` sur le NAS).
6. `$C up -d` (relance web, worker, watchtower). Vérifier une fiche d'asset et le montage.
7. Plus tard : supprimer la sauvegarde du NAS et le script (`scripts/migrer-assets-par-projet.ts`). Facultatif : supprimer `voix/` sur le NAS.
Local : fait le 2026-11-13 (260 images rangées, 16 assets repassés « sans image » dont 11 victimes de la collision à regénérer dans les projets 208 et 210).

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
