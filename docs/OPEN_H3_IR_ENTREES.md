# Open H3 IR — les entrées de `POST /v1/briefs`

Mini-doc de référence, tirée du paquet installé (`h3ir-lab/.venv/.../h3ir/` : `service.py`, `contract.py`, `models.py`, `director.py`) et de `lib/h3ir/brief.ts`.
Le service refuse toute clé inconnue (422 `unknown-field`) : le contrat est fermé. Seule `intent` est obligatoire.

## Le brief (`BriefIn`)

| Clé | Type / valeurs | Défaut | Ce que ça fait | Cadence l'envoie ? |
|---|---|---|---|---|
| `intent` | texte | — | La demande, en prose. Le paquet ne repère lumière, cadrage, palette, action, interdits que sur des mots **anglais**. | oui (traduit par `traduction-intent`) |
| `assets` | liste d'`AssetIn` | `[]` | Les références (voir plus bas). Max : 9 images, 3 vidéos, 3 audios, 3 bandes-son de vidéo. | oui |
| `seconds` | nombre | 5 | Durée nominale. | oui |
| `aspect` | `21:9` `16:9` `4:3` `1:1` `3:4` `9:16` | `16:9` | Format du cadre. | non (défaut) |
| `megapixels` | 0,25 à 2,5 | natif (768 sur le petit côté) | Taille du canvas. Plus grand = plus de temps et de VRAM. < 0,25 refusé. | oui, fixé à 0,4 |
| `dialogue` | liste de `{text, language, speaker, voiceover}` | `[]` | Répliques, collées **telles quelles** (aucun modèle ne les réécrit). `voiceover` = voix off. `language` : Arabic, Chinese, English, French, German, Italian, Japanese, Korean, Portuguese, Russian, Spanish (liste publiée, pas une limite). | oui |
| `onscreen_text` | liste de textes | `[]` | Texte visible dans le cadre, donné au rédacteur **mot pour mot** entre guillemets droits (vérif. `H2` si absent du prompt). Posé sur le **shot 1** (sauf si un beat le revendique) : on ne choisit pas le shot. Sans lui, `bold`/`extreme` peuvent en ajouter seuls ; « no text » dans l'intent ou `constraints` l'interdit. | non (à ajouter : titres de séquence) |
| `shots` | entier | libre | Nombre de plans **imposé**. 1 à 10, et chaque plan doit tenir ≥ 1,2 s dans la durée nominale (sinon `shots-do-not-fit`). Absent = le paquet décide. | optionnel |
| `loras` | liste d'objets `{id,…}` | `[]` | LoRA du registre local du service (dossiers `howtouse.md`). Aucun registre configuré ici : inutilisable pour l'instant. | non |
| `silent` | booléen | `false` | **Pas de musique de fond** (`music` = `N/A`). Ambiance et sons synchrones restent : ce n'est pas « sans aucun son ». | non |
| `constraints` | liste de textes | `[]` | Interdits et contraintes explicites (« pas de dialogue »…). Une interdiction explicite l'emporte sur tous les réglages. | non |
| `creativity` | `restrained` `balanced` `bold` `extreme` | `balanced` | Combien le rédacteur peut **ajouter** à ce qui est demandé (réplique, musique, texte, événement). Ce n'est pas « plus de plans » ni « plus de mouvements » : l'axe est l'ajout. | oui (héritage projet/scène/plan) |
| `director` | id d'un des 7 profils : `cameron` `tarantino` `anderson` `villeneuve` `bigelow` `wong` `spielberg` | vide | Le goût qui comble ce que la demande laisse ouvert (caméra, cadrage, lumière, corps, musique). Ne décide jamais du nombre de plans ni des coupes ; la demande explicite l'emporte. | oui |
| `director_profile` | `{name, notes}`, notes ≤ 5000 car. | `null` | Un style à soi, à la place d'un profil livré. `notes` = des habitudes, pas des plans (« dire les habitudes, pas les shots »). `name` ne va qu'au rapport, jamais au rédacteur. Il règle le mouvement, le rythme et la caméra, pas l'apparence (qui vient des références). | **oui pour six profils perso** (`lib/h3ir/profils-perso.ts` : claymation, anime-nerveux, anime-contemplatif, 3d-cinema, sitcom, horreur), choisis comme un réalisateur ; pas de texte libre |
| `effort` | `fast` `standard` `max` | `standard` | Voir ci-dessous. | non, toujours `standard` |
| `seed` | entier | 7 | Déterminisme : même brief + même seed → même fiche. | oui (`plans.seed`) |
| `transcripts` | `{sha256: texte}` | `{}` | Transcription des audios joints. Le service **ne transcrit jamais** (il ne sait pas entendre) : il faut passer le texte. Seulement les mots : timbre, ton et tempo vont dans la `note` de l'asset. | oui |
| `answer` | `{clé: valeur}` | `null` | Réponse à la seule question que le paquet pose (image = première image ou référence ?). Cadence déclare toujours le rôle : la question n'arrive pas. | non (inutile) |

## À propos de `effort`

- Il n'impose aucune méthode de réflexion. Le LLM du paquet est un modèle « à raisonnement » (type Qwen3 via vLLM) ; par défaut le code coupe ce mode (`enable_thinking: false`, `H3IR_LLM_THINKING`).
- `effort: max` active `thinking_prose` : le mode réflexion n'est plus coupé pour la **rédaction de la prose de chaque shot** (budget 20 000 tokens, deuxième essai avec seed+101 si la prose est trop courte). Le modèle écrit d'abord son raisonnement libre, puis la prose.
- Les appels structurés (découpage en beats, JSON) restent sans réflexion : le mode réflexion annule la contrainte de schéma et dégrade la précision d'extraction (mesures du paquet, `backend.py`).
- `fast` et `standard` sont identiques côté rédacteur. Cadence envoie `standard`.
- Effet sur la qualité : non mesuré. Un test à l'aveugle (comme le banc plan-h3) trancherait ; `max` est plus lent.

## Une référence (`AssetIn`)

| Clé | Valeurs | Rôle de la clé |
|---|---|---|
| `path` **ou** `sha256` **ou** `url` | chemin lisible par le service / hash d'un fichier envoyé par `PUT /v1/assets/{sha256}` | La source. **Pas les deux à la fois** (`asset-two-sources`). `path` suppose un système de fichiers commun. |
| `kind` | `image` `video` `audio` | Défaut `image`. |
| `role` | voir tableau ci-dessous | Pourquoi le fichier est joint. **À toujours déclarer** : omis, le paquet devine (il peut basculer en première image du clip, et prend un audio pour de la musique de fond). |
| `note` | texte | Indice libre (« l'homme »). Pour un audio, c'est la **seule** description du son. |
| `replaces` | texte | Sur `replacement_subject` seulement : qui, dans le clip édité, cette image remplace. Refusé sur tout autre rôle. |
| `sizing` | `match` `max` | Calage de la taille sur le canvas ou au maximum. |
| `seconds`, `frames` | nombres | Durée / nombre d'images d'une vidéo ou d'un audio. |
| `paired_video_path` / `paired_video_sha256` | | La vidéo dont l'audio est la bande-son. |
| `provenance` | objet | Origine du fichier (traçabilité). |

### Rôles autorisés par type de fichier

| Fichier | Rôles |
|---|---|
| image | `frame_anchor_first`, `frame_anchor_last`, `subject`, `environment`, `style`, `storyboard`, `placed_subject`, `replacement_subject` |
| vidéo | `edit_source`, `continuation_source`, `subject`, `environment`, `style`, `storyboard`, `structure` (prête seulement le mouvement de caméra et le rythme de coupe) |
| audio | `voice_timbre`, `bgm`, `music_style`, `beat_reference`, `sfx` |

Cadence n'utilise aujourd'hui que `subject` (personnage, prop, oth), `environment` (décor), `storyboard` (keyframe) et `style` (vfx, depuis le
2026-11-09 : un effet n'est jamais repris tel quel), via `ROLE_PAR_TYPE` ; en audio, `voice_timbre` (voix fixée d'un personnage qui parle) (le rôle `sfx` du paquet n'est plus envoyé : les bruitages ont été retirés de Cadence, 2026-11-10). VFX en `style` : à valider au banc de rendu.

## Le mode de génération

Il **n'est pas une entrée** : le paquet le déduit des rôles (`t2va`, `i2va`, `fl2va`, `l2va`, `ref2va`). Sans image : `t2va`. Avec `frame_anchor_first` : `i2va`. Avec `frame_anchor_last` aussi : `fl2va`. Des références `subject` / `environment` : `ref2va`.

## Mouvements de caméra connus du paquet

`Zoom In`, `Zoom Out`, `Push In`, `Pull Out`, `Pan Left`, `Pan Right`, `Truck Left`, `Truck Right`, `Tilt Up`, `Tilt Down`, `Pedestal Up`, `Pedestal Down`, `Arc Shot`, `Tracking Shot`, `Static Shot`, `Shake Slightly`, `Shake Strongly`, `POV`, `Roll Clockwise`, `Roll Counterclockwise`.

## Les refus (codes d'erreur utiles)

- 422 : `unknown-field`, `intent-empty`, `duration-invalid`, `aspect-invalid`, `shots-invalid`, `shots-do-not-fit`, `over-capacity` (trop de références), `unknown-role`, `replaces-without-the-role`, `asset-two-sources`, `asset-missing`, `asset-not-uploaded`, `director-profile-invalid`, `malformed-request`.
- 503 `llm-unavailable`, 502 `llm-error` : le LLM du paquet.

## Ce qui n'est PAS envoyé par Cadence et pourrait servir

À étudier, rien décidé : `silent` (pas de musique de fond), `constraints` (interdits propres au plan, ex. « no dialogue »), `onscreen_text` (cartons, titres), `effort: "max"` (réflexion avant rédaction), et les rôles `style`, `structure`, `frame_anchor_*`, `continuation_source` (le chantier « plans suite » du futur).

Source de vérité : `h3ir.contract.snapshot()` publie le contrat de la version installée ; `GET /v1/directors` donne le texte de chaque profil.
