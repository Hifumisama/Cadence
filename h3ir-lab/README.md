# Banc d'essai Open H3 IR

Une page pour jouer avec le compilateur [Open H3 IR](https://github.com/ruashots/open-h3-ir) (Apache-2.0) : une intention (plus des images, des répliques, un
réalisateur) en entrée, le prompt H3 qu'il en tire en sortie, avec ses diagnostics, son manifeste et un volet pour le comparer à un autre prompt collé
(par exemple celui de `plan-h3`). Rien dans Cadence ne lit ce dossier, qui a son propre `.env` et son propre environnement Python.

## Lancer

```powershell
cd h3ir-lab
.\.venv\Scripts\python.exe serveur.py        # puis http://127.0.0.1:8421
```

`serveur.py` lance lui-même `h3ir serve` (sur 127.0.0.1:8420), sert la page et relaie `/api/*` : Open H3 IR ne déclare aucun CORS, une page ouverte
autrement ne pourrait pas l'appeler. Ctrl+C arrête les deux.

## Réglages (`.env`, modèle : `.env.example`)

- `H3IR_LLM_URL` : le point de terminaison OpenAI-compatible, `/v1` compris. Ici le llama-swap de Cadence : `LLM_LOCAL_URL` + `/v1`
  (`https://llamacpp-local.radiant-garden.fr/v1`). Le domaine `comfyui.radiant-garden.fr` est celui de ComfyUI (`COMFYUI_URL`), il ne sert pas de LLM
  (`/v1/models` y répond 404) : Open H3 IR n'en a pas besoin.
- `H3IR_LLM_MODEL` : modèle au démarrage. **La page a un sélecteur de modèle** (liste lue sur `{H3IR_LLM_URL}/models`) : le service n'accepte pas de modèle
  par requête, le choisir relance donc `h3ir serve` avec l'autre modèle (quelques secondes ; llama-swap charge le modèle à la première compilation).
- `H3IR_LAB_PORT` (8421), `H3IR_PORT` (8420), `H3IR_LLM_API_KEY` (inutile avec llama-swap).

## Installation (déjà faite ici)

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt     # open-h3-ir
Copy-Item .env.example .env                                       # puis renseigner l'URL
```

Python 3.10 ou plus ; `ffmpeg` seulement pour des vidéos de référence. Le contrôle : `h3ir doctor` (avec les variables du `.env` chargées) donne le point de
terminaison, les modèles, la latence et `vision_ok`.

## Réalisateurs

Le menu « Réalisateur » vient de `GET /v1/directors` : ce sont les profils livrés avec Open H3 IR (le réalisateur de Cadence a été retiré le 2026-10-20).
Une case permet aussi d'écrire un profil à la main.

## À savoir

- **Images** : il faut un modèle à vision. Avec `gemma4-26b-A4B-v2`, `h3ir doctor` répond `vision_ok: True`. À revérifier pour chaque modèle du sélecteur.
- **GPU partagé** : Open H3 IR appelle le LLM sans passer par le verrou GPU de Cadence (`lib/gpu.ts`), et llama-swap décharge un modèle pour en charger un autre.
  Ne le lancez pas pendant un rendu ComfyUI ou une création de projet.
- **Audio de référence** : décrivez le timbre dans la note (et fournissez la transcription) ; le service n'invente jamais de timbre et ne transcrit pas.
- Chaque compilation est un essai : « un seul essai ne mesure rien », disent ses auteurs. Relancez avec une autre seed avant de juger.
- Vérifié : lancement de `h3ir serve` par le relais, `/health`, `/v1/directors`, liste des modèles, `h3ir doctor`. Non vérifié : une compilation complète depuis la page.
