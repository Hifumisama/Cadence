---
name: assets-comfyui
description: Écrit les prompts de génération d'images de référence à partir d'un registre d'assets, pour un pipeline ComfyUI Z-Image Turbo (text-to-image) et Qwen Image Edit (image-to-image), puis suit la production — ordre de fabrication, statuts, seeds retenus, chemins de fichiers. Utilise ce skill dès qu'il faut produire, prompter ou suivre des images de référence pour de la vidéo IA, dès qu'on mentionne ComfyUI, Z-Image, Qwen Image Edit, un registre d'assets, une liste de courses d'images, ou qu'on demande comment fabriquer les références d'un plan ou d'un film — et aussi quand il s'agit simplement de mettre à jour l'état d'avancement d'un asset.
---

# Assets ComfyUI — registre → images de référence

Ce skill fabrique la couche exécutable du registre d'assets : un prompt par image à produire, dans la grammaire du modèle qui va la générer, plus le suivi de production.

Entrée : un `REGISTRE_ASSETS.md` produit par `fiche-de-plan`. Sortie : le même fichier, enrichi et tenu à jour.

## Les deux modèles, deux grammaires opposées

Le pipeline utilise deux modèles qui ne se prompt**ent pas** de la même façon. Se tromper de grammaire produit une image médiocre sans qu'on comprenne pourquoi.

### Z-Image Turbo — text-to-image, pour les masters

Modèle distillé 6B, conçu pour 8 étapes. Trois conséquences pratiques qui gouvernent l'écriture des prompts :

**Le negative prompt n'existe pas.** Ce n'est pas qu'il fonctionne mal : le modèle tourne à CFG 1 et les auteurs confirment qu'il n'entre pas dans le calcul. Toute exclusion doit être formulée **positivement dans le prompt positif**. « Pas de brouillard » n'a aucun effet ; « ciel dégagé, horizon net et découpé » en a un. C'est une contrainte d'écriture, pas une limite : décrire ce qu'on veut est de toute façon plus fiable que lister ce qu'on ne veut pas.

**Monter le CFG dégrade.** Sur un modèle distillé, augmenter la guidance pour « améliorer l'adhérence au prompt » produit l'inverse. Si un prompt ne prend pas, on reformule ou on change de seed — jamais on ne pousse le CFG.

**La variance de seed est faible.** Même prompt, seeds différents, images très proches. Quand un asset demande explicitement des variantes — trois carcasses en poses différentes, plusieurs états d'usure — un balayage de seeds ne suffira pas : il faut trois prompts réellement distincts, ou passer sur Z-Image Base pour ce cas précis. Signale-le dans le registre plutôt que de laisser découvrir le problème à la génération.

Réglages de départ : **8 étapes, CFG 1, 1024×1024**. Dimensions **divisibles par 32** — c'est un des principaux facteurs de dégradation et il se rate facilement. Ne pas générer directement en 2K : passer par un upscale puis une seconde passe de sampler à denoise ~0.3.

Forme du prompt : de la **prose descriptive continue**, pas une liste de tags. Sujet, matière, cadrage, angle, lumière, arrière-plan, dans cet ordre. Le modèle est fort en photoréalisme et en lumière cinématographique, autant le nourrir en conséquence.

### Qwen Image Edit — image-to-image, pour les dérivés

Grammaire inverse : **des instructions impératives**, pas des descriptions. On ne redécrit pas l'image, on énonce la transformation.

- Une intention par instruction. Empiler cinq modifications dans une phrase produit un résultat moyen sur les cinq.
- Nommer ce qui ne doit pas bouger quand c'est structurant : « en conservant la structure des plaques et la teinte de rouille ».
- Enchaîner plusieurs passes plutôt que tout demander d'un coup, en repartant à chaque fois de la sortie précédente.

C'est le mode par défaut de **tout asset qui a un parent** dans le registre. Un dérivé ne se régénère jamais de zéro : le champ `Dérivé de` est une instruction de méthode, pas une note documentaire. C'est ce qui garantit qu'un débris ressemble vraiment au personnage dont il vient, au lieu d'en être une variante approximative.

**Sauf quand le but est une absence.** Un modèle d'édition est construit pour préserver la structure de l'image source ; les versions récentes le sont encore davantage. Lui demander de *retirer* un élément structurant — effacer les doigts d'une main pour n'en garder que la surface, ôter une silhouette d'un décor — revient à combattre sa fonction principale, et il rendra l'élément quel que soit le nombre d'essais.

Le signal est simple : si la description canonique d'un asset dit ce qu'il ne doit **pas** être, il ne faut pas le dériver. Il n'y a alors aucune identité à préserver, donc aucune raison de partir d'un parent. Génère-le directement, et surtout **décris-le par un concept que le modèle possède déjà** — un pont métallique plutôt qu'une paume sans doigts, un mur plutôt qu'un décor vidé de son personnage. Demander un objet connu réussit là où demander une soustraction échoue.

**Et jamais pour changer de point de vue.** Une édition modifie ce qui est dans le cadre ; elle ne déplace pas la caméra. Reculer, monter, passer de face à trois quarts, cadrer la même scène d'un autre endroit — ce sont des opérations géométriques, pas des retouches. Le modèle y répondra en collant un élément par-dessus l'image existante : demande une vue depuis une colline surplombant un décor, et il ajoutera une colline au premier plan sans rien recalculer.

La règle pratique : **deux vues d'un même lieu sont deux générations, pas un parent et son dérivé.** Ne dérive un décor que pour ce qui reste dans le plan de l'image — un flou, une bascule de lumière, une saison, un élément ajouté ou retiré.

## Écrire les prompts

Pour chaque asset du registre, ajoute un bloc de production. La **description canonique** existante est la source ; le prompt en descend, il ne la réinvente pas.

**Asset master (sans parent)** :

```markdown
- **Prompt Z-Image** :
  ​```text
  [prose descriptive continue en anglais, 40 à 100 mots]
  ​```
- **Réglages** : 8 steps · CFG 1 · 1024×1024 · euler_ancestral / beta
```

**Asset dérivé** :

```markdown
- **Édition Qwen** — source : `ID_PARENT`
  ​```text
  [instructions impératives, une par ligne si plusieurs passes]
  ​```
```

Les prompts s'écrivent **en anglais** : les deux modèles y sont plus fiables, et surtout les prompts vidéo H3 sont en anglais — un vocabulaire commun entre l'image et la vidéo réduit la dérive entre ce qu'on fabrique et ce que le modèle vidéo croit recevoir.

**La cohérence avec le prompt vidéo est le vrai enjeu.** Si `subject_definitions` annonce un bras *rebuilt from mismatched lighter-rust panels* et que le prompt image dit *rusty repaired arm*, on fabrique une image qui ne correspond pas à ce qui est promis à H3. Reprends le vocabulaire de la description canonique mot pour mot sur les traits identifiants.

## Format et nommage des fichiers

### Choisir les dimensions

Les modèles de diffusion veulent des dimensions **divisibles par 32**, et c'est une des premières causes de rendu mou quand on l'oublie. Combiné à un ratio imposé, ça restreint sérieusement les résolutions disponibles — mieux vaut faire le calcul une fois pour le projet que découvrir le problème à l'étape d'upscale.

En **16:9 exact avec les deux côtés divisibles par 32**, les seules dimensions valides sont les multiples de **512 × 288** :

| | Dimensions | Mégapixels | Usage |
|---|---|---|---|
| ×1 | 512 × 288 | 0,15 | trop petit, sauf brouillon |
| ×2 | 1024 × 576 | 0,59 | génération vidéo en draft |
| ×3 | 1536 × 864 | 1,33 | plates et références de composition |
| ×4 | 2048 × 1152 | 2,36 | sortie après upscale ×2 d'un draft |

Rien n'existe entre 0,15 et 0,59 MP. Si une contrainte de vitesse impose une cible plus basse, il faut renoncer à l'un des trois : le 16:9 exact, la divisibilité par 32, ou la cible de vitesse. Le dire explicitement plutôt que de proposer une dimension approximative qui obligera à recadrer plus tard.

Pour un autre ratio, la même méthode : réduire le ratio à sa fraction irréductible, multiplier chaque terme par 32, et prendre les multiples entiers de ce couple.

Les références d'identité et de détail (visages, mains, objets isolés) restent en **carré 1024×1024** : elles ne portent pas de composition, donc aucune raison de leur imposer le ratio du film.

### Fichiers

| | Recommandation | Pourquoi |
|---|---|---|
| Format | **PNG, sRGB, 8 bits** | ComfyUI embarque le workflow dans les métadonnées PNG : l'image redonne son graphe. Reproductibilité gratuite. |
| Upload vers H3 | le même PNG | Le plafond est à ~30 Mo par image, un PNG 2K en pèse 5. Aucune raison de dégrader en JPEG. |
| Ratio | plates et composition au ratio du plan · identité et détails en carré | En mode référence, le cadrage peut être déduit des images fournies : une plate au bon ratio oriente, une fiche d'identité carrée n'impose rien. |
| Limites API | arêtes 256–5760 px, ratio entre 5:2 et 2:5 | Confortable, on ne les touche pas en pratique. |
| Nom | `ID_DE_L_ASSET_vNN.png` | L'ID exact du registre permet de vérifier par script que tout asset cité existe sur le disque. |

## Ordre de fabrication

Ne propose jamais une liste à plat. L'ordre se déduit de la structure du registre et il compte :

1. **Les masters dont d'autres assets dérivent.** Tout ce qui a des enfants passe en premier — un master modifié après coup invalide toute sa descendance.
2. **Les assets critiques.** Ceux dont l'échec compromet une séquence entière. À produire et faire valider avant d'engager le reste : découvrir au bout de vingt images que le plan clé est infaisable coûte cher.
3. **Les dérivés**, dans l'ordre de leur chaîne.
4. **Les décors et plates**, qui ne dépendent généralement de rien et peuvent se produire en parallèle dès le départ.

Quand un asset critique est aussi le parent d'un autre, la chaîne de dérivation l'emporte sur l'ordre des plans dans le film — il n'est pas rare que l'asset du dernier plan doive se fabriquer en premier.

## Tenir le registre à jour

Le registre est un fichier vivant. À chaque retour de production, mets-le à jour :

- **Statut** : ⬜ à produire → 🟡 en cours → ✅ validé
- **Fichier** : le chemin du PNG retenu
- **Seed** : le seed du tirage retenu — c'est ce qui rend une variante reproductible six semaines plus tard, et sans lui une image validée n'est plus qu'un fichier orphelin
- **Note** : ce qui a été appris, ce qui a résisté, ce qu'il faudra reprendre

N'écrase pas les prompts au fil des essais : quand un prompt évolue, garde la version qui a produit l'image validée. C'est elle qui documente le fichier, pas la dernière tentative en date.

Le versionnement se fait sous git, à la charge de l'utilisateur — le registre n'a besoin d'aucun outillage supplémentaire, seulement d'être tenu.

## À la fin d'une passe de production

Fais un point court : ce qui est validé, ce qui bloque, ce qui reste. Et signale les assets dont la production a révélé un problème en amont — une pose infaisable, une contrainte de cadrage intenable, deux assets qui auraient dû n'en faire qu'un. Ces retours remontent vers la fiche de plan ou le scénario, et il vaut mieux qu'ils remontent tôt.

Enregistre le registre mis à jour dans `/mnt/user-data/outputs/` et présente-le.
