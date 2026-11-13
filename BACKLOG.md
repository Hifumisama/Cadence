# Backlog Cadence

Ce qu'on décide ensemble. Mis à jour à chaque point d'étape. Risque : **faible** / **moyen** (creuser le besoin avant de coder) / **haut** (argumentaire et preuves).

## En attente d'un essai réel de l'utilisateur
- **Machine à états de revue** : fait (31b0cee, migrations 0085 et 0086). Reste à vérifier à la main : un projet créé par l'installateur et un « Itérer » sur un clip.
- Ensuite, **supprimer la colonne `coche`** (devenue « appliqué par défaut », recalculable). Faible.

## À faire, décidé
- **Collision des fichiers d'assets entre projets** (8 codes concernés). Un dossier `assets/<projet>/`, script à usage unique : déplacement, récupération des images écrasées depuis `data/generations`, passage à blanc d'abord. Moyen. Ne pas lancer pendant une création de projet.
- **Validation côté serveur (zod)** des server actions. Faible. Après la migration des fichiers.
- **Remplacer le reset CSS copié de Tailwind** (~390 lignes de `globals.css`). Faible, mais à valider à l'œil.

## À décider avec l'utilisateur
- **Repli LLM `references-plan`** (~300 lignes, 1 appel contre 73 fiches) : le retirer = alerte ou choix par défaut quand le code hésite sur les images de référence. Moyen.
- **Limite de 3 personnages qui parlent par plan** dans les skills `scenario-episode` / `scenario-scene` : garder, relever ou retirer, maintenant que les voix n'existent plus.
- **Relecture du scénario** : chantier à part entière (étape de l'installateur, 3 propositions appliquées sur 9). À cadrer ensemble avant toute décision.

## Idées retenues (utiles, pas lancées)
- **Fidélité par référence** (`plan_refs.retention`) choisie dans les cases de références du clip : `fully_preserved`, `partially_preserved`, `attribute_transfer`, `weak_reference`. Intérêt : décrire une variante au lieu de créer un asset (`partially_preserved`), « équiper » un personnage (`attribute_transfer`), limiter le nombre d'assets. Moyen (jugement visuel).

## Études (lecture seule, peuvent se faire en parallèle)
- **Skills ou outils** : ce qui devrait être un skill de l'application, un outil, ou du code.
- **Recréation des docs** (à repartir de zéro, courte).
- **Tests e2e** (chantier différé).

## Futurs lointains : ne pas lancer sans demande
Storyboard (animatic), musique d'épisode, latents/chaîne de plans, banc de skills, bouton « vérifier le GPU » dans l'interface.

## Fait (2026-11-12 et 13)
Docs retirée · `lib/` par domaines · noms de fichiers et commentaires en anglais · plan-h3 retiré · scripts jetables retirés · knip + CI · `.claude/` et `CLAUDE.md` refaits · robustesse (boucle vidéo, upload d'asset, délais ComfyUI) · notifications navigateur retirées · manuel du montage en popup · voix retirées · classes CSS mortes retirées · `service.ts` et `requests-db.ts` scindés · tests sur base jetable · propositions simplifiées.

## Refusé, avec la raison
- **Vue SQL `v_taches`** : la complexité de `listerTaches` est dans les mappeurs par type, les lots et la fenêtre de création, pas dans les 6 requêtes. Une vue ne la réduirait pas.
- **Séparer le dépôt en deux** : gain faible, coût de synchronisation élevé.
- **Tailwind, bibliothèques structurantes** (file de tâches, machine à états, zod sur les sorties LLM) : aucune ne remplace proprement l'existant.
