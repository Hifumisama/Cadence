# Qwen3-TTS VoiceDesign — écrire une instruction

> Repris du skill de chat `voix-comfyui` (pratique du projet), à l'exception de ce qui concernait les réglages de température, de seed et du test de tenue, que l'application n'utilise plus. Le workflow du dépôt qui crée les timbres est `workflows/voice-clone/VOX_Voice-design.json` (nœud `Qwen3TTSEngineNode`, paramètre `instruct`).

## Le modèle

`Qwen3-TTS-12Hz-1.7B-VoiceDesign` crée un **timbre depuis une description en prose**, sans audio de référence : le personnage ressemble à quelqu'un qui n'existe pas. C'est la garantie qu'on ne clone la voix de personne. Famille Apache-2.0, usage commercial autorisé, dix langues dont le français.

## L'instruction (`instruct`)

De la **prose libre**. Plus c'est détaillé, meilleur c'est : `young voice` est mauvais, `female, 22 years old, bright and energetic tone with clear articulation` est bon. Un paragraphe est la bonne longueur ; le modèle hiérarchise une description longue au lieu de la moyenner, donc **ne rationne pas les attributs**.

**Quatre dimensions, dans cet ordre :**

1. **Identité** : genre, âge, registre (`female, 50s, deep contralto`).
2. **Origine** : **toujours nommer la langue native** du personnage (`native French speaker`, `native Japanese speaker`), y compris pour les rôles secondaires. Ce n'est pas qu'un garde-fou anti-accent : sans elle, le modèle interpole entre la langue de l'instruction et celle du texte, et la prononciation se déforme (liaisons bancales, voyelles tirées vers l'anglais). C'est un ancrage de prosodie autant que d'identité.
3. **Prosodie** : débit, intonation, ce que font les fins de phrase.
4. **État** : l'attitude, pas juste le son (`amused superiority`, `entirely without warmth`).

**L'instruction est en anglais, même quand le texte est français.** La langue du texte est un paramètre séparé (`language`), et la combinaison est native et documentée. Dans le workflow du dépôt, ce paramètre est sur `Auto`.

## Ce qui ne marche pas, et pourquoi

- **Pas de négation.** `not nasal`, `no brightness` n'ont aucun effet fiable. Décris ce qu'on veut.
- **Pas de description de prise de son.** `close-miked`, `studio reverb` décrivent un micro, pas une gorge : ça pousse vers du souffle artificiel.
- **Attributs qui s'additionnent en douce.** Plusieurs mots peuvent pousser dans le même sens sans qu'on le voie : `bright` + mélodie haute + `quiet volume` donnent une voix fluette ; `slow` + `even` + `calm` donnent une voix morte. Relis la somme, pas chaque mot, et ajoute le contrepoids (résonance, corps, mélodie) quand elle penche.
- **L'accent est un piège** quand la langue cible n'est pas l'anglais. Demander un accent étranger sur un texte français produit une caricature de doublage, pas une singularité. N'en demander un que si le personnage est *écrit* comme étranger ; sinon, préciser la prononciation native visée, sans quoi le modèle en invente une.
- **Les mots qui traînent un accent** : `aristocratic`, `posh`, `Southern` sont des marqueurs régionaux déguisés en marqueurs de classe. Pour viser une autorité, décris la **fonction** (femme d'État, dirigeante, commandant).
- **Ne jamais écrire « la voix de tel personnage »** : décris les qualités, pas la source. Une référence externe décrit presque toujours une prosodie ou un accent, pas un timbre : traduis-la, et trie ce qui est transposable.

## Diagnostics

- **« Voix plate »** : la prosodie est-elle décrite explicitement, ou seulement implicite ? La ponctuation du texte de test porte-t-elle des chutes de phrase ? Ce n'est presque jamais le registre qui est en cause.
- **« Toutes les voix se ressemblent »** : les descriptions ne différencient pas assez. Change une dimension franche (registre, débit, état) plutôt que des nuances, et affine **un attribut à la fois**. Si l'utilisateur dit qu'un timbre est « bizarre » sans préciser, demande quelle manette bouger : trop grave, trop âgé, accent bancal, débit mécanique appellent quatre corrections différentes.

## Le pipeline à deux moteurs

Le workflow du dépôt (`workflows/voice-clone/VOX_Voice-design.json`) enchaîne deux moteurs, et c'est le meilleur résultat obtenu :

1. `Qwen3TTSEngineNode` + `UnifiedVoiceDesignerNode` : l'instruction (`voice_instruction`) et un **texte de référence anglais constant** (`reference_text`, ex. « Welcome adventurer, and be my guest… ») produisent la voix de référence.
2. `CosyVoiceEngineNode` (Fun-CosyVoice3-0.5B-RL) + `UnifiedTTSTextNode` : la réplique **française** est dite en clonant cette référence (`opt_narrator`).

La voix vient donc de l'instruction ; la langue de la réplique, de CosyVoice3. Le workflow `VOX_Generate_Sound_From_Characters.json` reprend la seconde moitié à partir d'un fichier de référence (`CharacterVoicesNode` : fichier, texte de référence, `trim_start` / `trim_end`), et `VOX_Doublage_voix_Audio.json` convertit un audio enregistré vers cette voix.

## La voix de référence

- **Une seule génération**, instruction figée. **10 à 15 secondes** suffisent ; la durée se mesure sur l'audio.
- **FLAC ou WAV, jamais MP3** : la référence part dans un modèle de clonage, qui recopierait les artefacts de compression.
- **Ni musique ni réverbération** : le modèle recopie l'acoustique, pas seulement la voix.
- **Trim des silences de bord**, normalisation.
- **Si la voix décroche sur les répliques, rallonger la référence est le premier levier**, avant de refaire un casting : plusieurs blocs d'une douzaine de secondes, en parallèle pour qu'aucun bloc ne cumule la dérive du précédent, puis concaténation.
