---
name: voix-comfyui
description: Conçoit, fige et produit les voix de personnages pour de la vidéo IA — voice design sans clonage d'humain, banque de références stables, puis génération des répliques avec direction de jeu en langage naturel. Pipeline Qwen3-TTS (VoiceDesign pour le timbre, Base pour le clonage et les prises), et tenue d'un REGISTRE_VOIX.md. Utilise ce skill dès qu'il faut donner une voix à un personnage, choisir ou tester un modèle TTS local, écrire ou diriger des dialogues pour la génération audio, fabriquer une référence de clonage, diagnostiquer une voix instable, plate ou un timbre qui dérive entre deux répliques — et aussi quand il s'agit simplement de mettre à jour l'état d'avancement d'une voix. Déclenche-le aussi quand quelqu'un dit juste que les voix de son modèle vidéo sonnent mal, sans nommer de modèle TTS.
---

# Voix ComfyUI — du timbre à la réplique

Ce skill fabrique la couche audio parlée d'un film IA : une banque de voix figées, puis une prise par réplique.

Entrée : une `FICHE_DE_PLAN_*.md` (les répliques y sont déjà, dans les balises `<d>[Langue]…</d>`). Sortie : un `REGISTRE_VOIX.md` tenu à jour, et les prises audio.

C'est le pendant sonore de `assets-comfyui` : mêmes conventions de registre, mêmes statuts, même discipline de référence.

## Le principe fondateur : le modèle ne fait pas l'iconicité

Une voix mémorable ne vient pas du modèle. Elle vient d'**une contrainte physique tenue sans exception**, décidée avant la première génération et inscrite dans le registre.

Une règle par personnage, énoncée en une phrase, jamais enfreinte :

- « son souffle est toujours audible avant la phrase, jamais coupé au montage »
- « débit et volume rigoureusement constants, quoi qu'elle dise »
- « il ne finit jamais ses phrases, la dernière syllabe tombe »

Le corollaire est ce qui compte : la règle **interdit** des directions de jeu. Un personnage dont la règle est « ne varie jamais » n'a droit à aucune émotion haute, jamais. Le jour où il l'enfreint, c'est un événement d'épisode, pas une option de génération.

Écris cette règle dans le registre avant les prompts. Si tu ne peux pas l'écrire, le personnage n'a pas encore de voix — il a un timbre, ce qui n'est pas la même chose.

**La rime avec la mise en scène est le meilleur guide.** Si le découpage dit qu'un personnage ne s'arrête jamais de marcher, sa règle vocale est déjà écrite : il ne s'arrête jamais de parler non plus, même pour frapper.

## Le modèle : Qwen3-TTS

Famille Apache-2.0, usage commercial autorisé, 10 langues dont le français. Trois modèles, deux rôles :

| Modèle | Rôle | Quand |
|---|---|---|
| `Qwen3-TTS-12Hz-1.7B-VoiceDesign` | crée un timbre depuis une description en prose | phases 1 et 2 uniquement |
| `Qwen3-TTS-12Hz-1.7B-Base` | clone la référence et joue les répliques | phases 3 et 4 |
| `…-CustomVoice` | 9 timbres préréglés avec contrôle de style | dépannage, figurants |

**On ne vole la voix de personne** : VoiceDesign travaille sans audio de référence, le personnage ressemble à quelqu'un qui n'existe pas. Ne jamais partir d'un extrait d'un comédien réel, et ne jamais écrire « la voix de tel personnage » dans une instruction — décrire les qualités, pas la source.

1,7 B, ~3,4 Go : les deux modèles tiennent sans difficulté sur une carte 16 Go, mais le workflow officiel les charge séquentiellement de toute façon.

### Écrire une instruction

`instruct` est de la **prose libre**, et la doc est formelle : plus c'est détaillé, meilleur c'est. `young voice` est mauvais, `female, 22 years old, bright and energetic tone with clear articulation` est bon.

Quatre dimensions à couvrir, dans cet ordre :

1. **Identité** — genre, âge, registre (`female, 50s, deep contralto`)
2. **Origine** — **toujours nommer la langue native du personnage** (`native French speaker`, `native Japanese speaker`). Ce n'est pas qu'un garde-fou anti-accent : sans elle, le modèle interpole entre la langue de l'instruction et celle du texte, et la prononciation se déforme — liaisons bancales, voyelles tirées vers l'anglais. C'est un ancrage de prosodie autant que d'identité, et il se met dans **toutes** les instructions, y compris les rôles secondaires
3. **Prosodie** — débit, intonation, ce que font les fins de phrase
4. **État** — l'attitude, pas juste le son (`amused superiority`, `entirely without warmth`)

Anglais pour l'instruction, même quand le texte est français : `language` est un paramètre séparé, la combinaison est native et documentée.

**Piège hérité des petits modèles : ne pas rationner les attributs.** Qwen3-TTS hiérarchise une description longue au lieu de la moyenner. Un paragraphe est la bonne longueur.

**Pas de négation.** `not nasal`, `no brightness` n'ont aucun effet fiable. Décrire ce qu'on veut.

**Surveiller les attributs qui s'additionnent en douce.** Une description peut être juste attribut par attribut et fausse au total, parce que plusieurs poussent dans le même sens sans qu'on le voie. Le cas le plus fréquent : `bright` + mélodie haute + `quiet volume` donnent une voix fluette, alors qu'aucun des trois ne demandait de la minceur. Idem `slow` + `even` + `calm`, qui donnent un mort. Relire chaque description en se demandant non pas ce que chaque mot ajoute, mais **vers où ils tirent tous ensemble** — et ajouter explicitement le contrepoids (résonance, corps, mélodie) quand la somme penche.

**Pas de description de prise de son.** `close-miked`, `studio reverb` décrivent un micro, pas une gorge — ça pousse vers du souffle artificiel.

**L'accent est un piège quand la langue cible n'est pas l'anglais.** Demander un accent étranger sur un texte français produit une caricature de doublage, pas une singularité. N'en demander un que si le personnage est *écrit* comme étranger, et préciser sinon la prononciation native visée — sans quoi le modèle en invente une.

**Attention aux mots qui traînent un accent avec eux.** `aristocratic`, `posh`, `Southern` sont des marqueurs régionaux déguisés en marqueurs de classe ou de caractère. Pour viser une autorité, décrire **la fonction** — femme d'État, dirigeante, commandant — plutôt que la naissance.

### Les paramètres qui comptent

| Paramètre | Défaut | Ce qu'il fait |
|---|---|---|
| `temperature` | `0.9` | La variation. **C'est la manette du casting** : monter pour explorer des timbres différents, descendre pour stabiliser une fois le bon trouvé. |
| `top_k` / `top_p` | `50` / `1.0` | Réglages d'échantillonnage, à laisser tels quels tant que `temperature` suffit. |
| `repetition_penalty` | `1.05` | Contre les boucles sur les textes longs. |
| `max_new_tokens` | `2048` | Monter pour les répliques longues. |

**Diagnostic « toutes les voix se ressemblent » :** c'est `temperature` qu'il faut monter, pas la description qu'il faut réécrire. Deux instructions différentes à température basse convergent vers le même locuteur — on croit alors comparer des mots alors qu'on compare des variations d'une seule gorge. Faire le tour de température **avant** de conclure qu'une description a échoué.

**Diagnostic « voix plate » :** vérifier dans l'ordre — (1) la prosodie est-elle décrite explicitement, ou seulement implicite ? (2) la ponctuation du texte de test porte-t-elle des chutes de phrase ? (3) `temperature` n'est-elle pas trop basse ? Ce n'est presque jamais le registre qui est en cause.

## Les quatre phases

L'ordre n'est pas négociable : chaque phase produit le verdict dont la suivante a besoin.

**Le point de validation est la phase 3, pas la phase 2.** Les phases 1 et 2 vont vite et restent révisables ; ne pas y chercher la perfection, le seul juge est le modèle qui produira les répliques. Sauter la 3 est en revanche la faute la plus coûteuse du pipeline — on découvre alors en pleine production que la voix se délite sous la peur, après avoir écrit tout un script sur elle.

### Phase 1 — Casting du timbre (VoiceDesign)

Une phrase courte et neutre, plusieurs instructions concurrentes.

**Deux balayages, et l'ordre compte.** D'abord la température sur une seule instruction, pour vérifier que le modèle produit bien des timbres distincts. Ensuite seulement les instructions concurrentes, à température figée, pour les départager. L'inverse — comparer des descriptions avant de savoir si la manette de variation est ouverte — fait perdre des tours entiers sur de faux verdicts.

Affiner **un attribut à la fois**. Si l'utilisateur dit qu'un timbre est « bizarre » sans préciser, demander quelle manette bouger — trop grave, trop âgé, accent bancal, débit mécanique appellent quatre corrections différentes et deviner coûte plus cher que demander.

**Écouter ce qui manque, pas ce qui gêne.** Un utilisateur qui décrit une voix par une référence externe (« comme tel personnage ») décrit presque toujours une **prosodie** ou un **accent**, rarement un timbre. Traduire la référence en qualités, jamais la citer — et trier : dans une voix de personnage étranger, l'accent appartient à ce personnage-là, pas forcément à celui qu'on construit. Reprendre ce qui est transposable, laisser le reste.

### Phase 2 — La référence (VoiceDesign)

**Dix à quinze secondes suffisent**, en une seule génération, instruction figée.

**La référence ne joue pas.** Tout ce qu'elle contient d'émotion se retrouve collé dans chaque réplique ensuite, par-dessus la direction de jeu. Texte factuel, in-world, sans enjeu — un personnage qui décrit un lieu ou une habitude. Et riche phonétiquement : voyelles ouvertes, nasales, groupes consonantiques, quelques fins de phrase descendantes.

**Neutre ne veut pas dire mort**, et c'est la nuance la plus souvent ratée. La référence ne porte pas d'*émotion*, mais elle doit porter la *mélodie* du personnage — sinon le clonage fige un métronome et aucune direction de jeu ne le rattrapera ensuite. Des phrases courtes au milieu du texte obligent le modèle à relancer, et c'est dans la relance qu'on entend qui parle.

**La ponctuation est un levier de prosodie**, pas un détail de saisie : le point crée une chute nette, la virgule une pause courte, les points de suspension une hésitation traînante. Écrire le texte de référence avec la ponctuation du personnage.

Puis trim des silences de bord et normalisation.

Quatre points techniques qui décident de la réutilisabilité du fichier :

- **FLAC ou WAV, jamais MP3.** La référence part dans un modèle de clonage : il recopierait les artefacts de compression.
- **Conserver le `ref_text` avec le fichier.** `create_voice_clone_prompt` le prend en entrée — sans lui, la référence est diminuée. Le stocker dans le registre, pas seulement dans un script.
- **Conserver l'instruction et la température** qui ont produit la référence, pas la dernière tentative.
- **Pas de musique ni de réverbération** dans la référence : le modèle recopie l'acoustique, pas seulement la voix.

Nommage : `VOX_<id>_ref_vNN.flac`. Ce fichier est un asset critique — s'il est perdu, le personnage l'est aussi. À sauvegarder avec les assets image.

**Si la phase 3 décroche, rallonger la référence est le premier levier**, avant de refaire un casting. Fabriquer deux ou trois blocs d'une douzaine de secondes, le premier en VoiceDesign, les suivants **en clonage du premier**, en parallèle et non en série pour qu'aucun bloc ne cumule la dérive du précédent. Concaténation, et on rejoue le test de tenue.

### Phase 3 — Le test de tenue (Base + clone prompt)

**Ce test se fait côté Base, sur le clone prompt, pas côté VoiceDesign.** Valider la stabilité dans le modèle de design revient à valider un chemin qu'on n'empruntera jamais.

Construire le `voice_clone_prompt` depuis la référence, puis une seule réplique générique, répétée sous six directions de jeu. La réplique doit contenir les trois endroits où une voix trahit son état : une attaque courte, une tenue longue à respirer, une chute de phrase. Contenu strictement factuel — tout ce qu'on entendra viendra de l'instruction.

Les six couvrent les deux axes, intensité et valence :

| Direction | Rôle dans le test |
|---|---|
| calme, neutre, posé | **le témoin** — les cinq autres se comparent à lui |
| peur | souffle court, larynx qui remonte |
| colère | pression et saturation, c'est là que le timbre part le plus loin |
| joie vive | hauteur et éclat, le plus dur pour une voix conçue grave |
| tristesse | débit qui s'affaisse, fin de phrase dévoisée |
| amusement | le sourire dans la voix |

Ajouter une septième branche en murmure seul, sans émotion : c'est un mode à part, et presque tout film en a besoin.

**Le critère n'est pas la qualité du jeu, c'est l'identité.** La question n'est jamais « est-ce que la peur est bien jouée » mais « est-ce toujours la même personne ». Comparer chaque prise au témoin sur la couleur des voyelles, la fin de phrase et l'attaque.

**Pour un personnage dont la règle interdit la variation, le test est inversé** : on ne vérifie pas qu'il joue les six, on vérifie qu'on les entend à peine. Les générer quand même, et si la courbe bouge nettement, c'est la référence qui porte trop de jeu.

Verdict : la joie vive et la colère décrochent en premier. Un décrochage sur une émotion que le personnage ne traverse jamais dans le film est acceptable — le dire explicitement dans le registre, avec la mention qu'il faudra rouvrir le casting si un épisode ultérieur l'appelle.

Une voix validée en neutre seulement est validée à moitié. Pas de ✅ dans le registre avant cette phase.

### Phase 4 — Les répliques

Reprendre les répliques de la fiche de plan **mot pour mot** — elles sont déjà validées et déjà dans les prompts vidéo. Les réécrire ici désynchronise l'audio du mouvement des lèvres.

Une ligne de tableau par réplique : shot, plan, voix, **instruction de jeu**, durée cible tirée de la fiche de plan.

La direction de jeu est de la prose, et elle porte sur toute la génération — donc **une génération par réplique**, jamais un bloc de dialogue tagué. C'est de toute façon ce qu'on veut : chaque réplique a sa propre couleur et sa propre durée à mesurer.

Trois règles de prise :

- **Les non-verbaux se génèrent isolément.** Demandés dans la même génération que du texte, ils sont avalés. Un souffle coupé, une inspiration hachée, un rire sec sont des prises à part, montées à la main.
- **Les silences longs se font en coupant la réplique en deux générations**, pas en empilant de la ponctuation. Écarter au montage.
- **L'instruction de jeu d'un personnage à règle stricte ne change jamais d'une réplique à l'autre.** La figer comme une chaîne constante dans le registre, et la recopier telle quelle. C'est la seule façon de garantir qu'un débit « rigoureusement constant » l'est vraiment.

## L'articulation avec le modèle vidéo

**La prise audio est un asset d'entrée du plan, pas une couche de montage.** Les modèles vidéo qui acceptent une référence audio (ref2va) synchronisent le mouvement des lèvres sur la piste fournie au lieu d'inventer un phrasé. Dans ce cas la voix se fabrique impérativement avant la vidéo — ce n'est plus une bonne pratique, c'est une dépendance.

**Sinon, les balises de dialogue restent dans les prompts vidéo.** On jette la piste audio du modèle vidéo, pas ses lèvres : c'est la balise `<d>` qui fait bouger la bouche sur le bon phrasé. Convention de doublage anime classique — la synchro approximative passe inaperçue en style dessiné, et les outils de resynchro labiale donnent souvent un résultat pire que le décalage qu'ils corrigent.

**La voix fixe la durée du plan, jamais l'inverse.** On génère la réplique, on mesure sa durée réelle, et c'est elle qui fixe les timecodes du prompt vidéo. Générer 9 s de vidéo puis tenter d'y loger 11 s de dialogue coûte une régénération à chaque fois. Ce retour remonte vers la fiche de plan, il vaut mieux qu'il remonte tôt.

**Vérifier le taux d'échantillonnage à la concaténation** plutôt que de laisser un nœud le faire à la volée.

## Tenir le registre

Un `REGISTRE_VOIX.md` unique pour toute la série, jamais dupliqué par épisode — une voix conçue à l'épisode 1 sert au 7.

Par voix : **ID**, statut (⬜ à concevoir · 🟡 en essais · ✅ figée), critique ou non, **la règle absolue** du personnage, l'instruction de design retenue, la **température**, le fichier de référence **et son `ref_text`**, et les émotions où la voix ne tient pas.

Ne pas écraser les instructions au fil des essais : garder celle qui a produit la référence validée. Garder aussi les écartées avec leur verdict — c'est ce qui évite de les retester six semaines plus tard.

**Identifiants uniques à travers les personnages.** Deux candidats nommés « A » dans deux sections différentes rendent tout verdict ambigu dès qu'on en parle à l'oral. Préfixer par le personnage.

Nommage des prises : `S01_shot19_VOX_tenanciere_take03.flac`, pour qu'un script puisse vérifier que chaque shot parlant a sa piste.

## À la fin d'une passe

Point court : ce qui est figé, ce qui bloque, ce qui reste. Et surtout les retours qui remontent en amont — une réplique intenable dans la durée du plan, deux personnages dont les voix se confondent au montage, une émotion demandée par le découpage qu'aucune référence ne tient. Ces retours vont vers la fiche de plan ou le scénario.

**Deux personnages qui partagent une séquence en champ-contrechamp doivent être castés l'un contre l'autre**, pas séparément. Si leur trait dominant est le même — deux voix lentes, deux voix graves — l'écart doit être créé ailleurs, et c'est une décision de casting, pas de montage.

Enregistre le registre mis à jour dans `/mnt/user-data/outputs/` et présente-le.
