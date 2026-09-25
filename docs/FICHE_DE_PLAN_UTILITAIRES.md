# FICHE DE PLAN — UTILITAIRES
> Les Yeux de Rubis · Modèle : MiniMax H3 (Hailuo 3) · 24 fps
> Plans hors récit, réutilisables à travers toute la série.

Ces entrées ne sont **jamais montées** et **ne portent pas de numéro de plan source**. Elles sont numérotées `T1`, `T2`… pour rester hors de la numérotation continue des épisodes — le registre d'assets ne doit pas se peupler de sujets de test.

Aucun asset n'est créé pour un utilitaire : ils se branchent exclusivement sur des assets déjà produits pour le récit.

---

## SHOT T1 — *Essai voix-image* — paramétrable par personnage

Valide qu'une voix figée **colle au physique** du personnage à l'écran. C'est le seul test que l'écoute au casque ne peut pas rendre : une voix peut être excellente dans l'absolu et sonner comme un doublage raté dès qu'elle est posée sur un visage.

Se joue **après** le test de tenue du `REGISTRE_VOIX.md`, et pour les voix critiques uniquement. Le test de tenue répond « est-ce toujours la même personne », celui-ci répond « cette personne, est-ce bien elle ».

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| — (non monté) | 8 s | 24 | full-reference |

**Variables** — seules ces trois lignes changent d'un passage à l'autre :

| Variable | Valeur |
|---|---|
| `{PERSO}` | l'asset personnage — `CHAR_maya`, `CHAR_tenanciere`… |
| `{DESCRIPTION}` | la description physique du personnage, reprise mot pour mot de son entrée au registre d'assets |
| `{REPLIQUE}` | la réplique testée, **identique au mot près** à celle générée en voix |

**Références (2/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `{PERSO}` | Identité du personnage |
| `<Picture 2>` | `DEC_auberge_salle` | Décor neutre — arrière-plan, hors foyer |

**Prompt**
```text
subject_definitions:
<Subject 1> is the character from <Picture 1>, {DESCRIPTION}.
<Subject 2> is the cabaret hall from <Picture 2>, a Moroccan-medina-style room with zellige tiling, carved columns and copper lanterns, seen here from a quiet corner away from the stage.

summary:
[reference generation] The target video holds a single locked medium shot of <Subject 1> standing in <Subject 2>, speaking one line directly to camera, with no gesture and no camera movement.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - facial structure, eye colour, hair and costume are retained exactly as framed in the reference.
<Subject 2> (appears in [Shot 1]): fully_preserved - the hall's tiling, columns and warm lantern light are retained as an out-of-focus background.

detailed_description:
Cinematic anime style, refined linework, warm even lantern light on the face with no dramatic shadow. [Shot 1, 00:00.000–00:08.000] A locked medium shot of <Subject 1>, framed from the chest up, standing still in a quiet corner of <Subject 2>, the hall softly out of focus behind. The camera does not move at any point. <Subject 1> faces the lens directly and speaks one single line, then falls silent and holds the gaze. There is no gesture, no step, no head tilt and no hand entering frame at any moment; the only motion in the entire video is the mouth, the eyes and the natural settle of breathing. The background stays empty of other people and nothing moves within it.
<d>[Français] {REPLIQUE}</d>

overall_soundscape:
A faint warm room tone, distant and low, with no music, no crowd and no footsteps.

non_diegetic_music:
N/A
```

**Notes**

- **L'audio généré par H3 est jeté, comme partout ailleurs.** La balise `<d>` n'est là que pour animer la bouche sur le bon phrasé et la bonne durée ; la voix retenue se monte par-dessus. Le test valide donc la chaîne de production réelle, pas un raccourci.
- **La réplique de la balise `<d>` doit être identique au mot près à celle générée en voix.** Sinon les lèvres bougent sur un autre phrasé, on voit un décalage, et on accuse la voix d'un problème qui vient du prompt.
- **Le plan se génère une seule fois par personnage.** On monte ensuite deux ou trois références candidates sur le même métrage : même image, même timing, même montage, seule la voix change. C'est un A/B propre, beaucoup plus lisible que trois plans différents avec trois voix différentes.
- **Aucun geste, aucun mouvement de caméra, aucune lumière d'intention.** Tout ce qui porterait l'émotion à l'image est retiré pour que la voix porte seule. Un plan expressif ferait passer une voix médiocre.
- **Deux passages par personnage, pas un** : le mode contrôle et le mode limite (voir presets). Une voix peut coller au visage au repos et ne plus coller du tout quand le personnage se fissure — c'est précisément là que se joue l'acte II.
- **Répliques hors épisode.** On ne teste jamais avec une ligne du découpage : on ne veut pas juger la voix en même temps que la scène.
- **Visionner deux fois, d'abord les yeux fermés, puis avec l'image.** Si la voix plaît à l'aveugle mais gêne à l'image, ce n'est pas un problème de timbre mais d'âge perçu ou d'énergie — et ça se corrige sur une autre manette.

### Presets de répliques

**Maya** — l'enjeu est de vérifier que sa langueur ne vieillit pas le personnage, et que sa perte de contrôle reste la même femme.

| Mode | Réplique |
|---|---|
| Contrôle | `Vous êtes déjà venu ici, non ? Non... je m'en souviendrais.` |
| Limite | `Écoutez-moi, s'il vous plaît. Je n'ai rien fait. Je vous le jure.` |

**La Tenancière** — pas de mode brisé : par règle de bible, elle ne se fissure jamais. Le second passage teste le murmure, qui est son seul écart autorisé.

| Mode | Réplique |
|---|---|
| Contrôle | `Tout ce qui entre dans cette maison est inscrit. Tout ce qui en sort aussi.` |
| Limite | `Vous pouvez partir quand vous voulez. Personne ne l'a jamais fait.` |

Les répliques limites de Maya sont volontairement construites sur des phrases courtes à fins montantes, et celles de la Tenancière sur des phrases longues à débit plat — chacune stresse exactement le marqueur que la bible lui assigne.
