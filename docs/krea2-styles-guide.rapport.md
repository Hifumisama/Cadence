# Nettoyage de `krea2-styles-guide.json` — rapport

Source intacte : `docs/krea2-styles-guide.json`. Résultat : `docs/krea2-styles-guide.nettoye.json`.
Les 286 entrées sont toutes là, dans le même ordre, avec le même `name`. Champs ajoutés : `descriptor` (version nettoyée), `descriptorOriginal`, `modifie`, et `nomNeutre` + `nomsPropres: true` quand le `name` contient un nom propre.
Les numéros `#n` ci-dessous sont l'index (base 0) dans le tableau.

## Chiffres

- **243 entrées modifiées / 286** ; 43 inchangées (déjà purement techniques : Technical Drawing, Low Poly, Fish-Eye, HDR, Origami, Watercolor Painting…).
- **121 entrées avec `nomNeutre`** (nom propre d'artiste, studio, œuvre, marque ou modèle IA dans `name`).
- Mots à risque de bleed, comptés dans tous les descriptors, avant → après :
  character 90 → 11, portrait(s/ure) 43 → 0, posing/pose(s) 45 → 0, figure(s/ative) 30 → 2, skin 32 → 0, anatomy/anatomical 33 → 0, eyes/eye 21 → 5, facial/face(s) 19 → 1, hair 11 → 0, body 10 → 0.
  Ce qui reste n'a rien à voir avec un sujet : « brush character », « honest character » (= qualité), « eye-catching », « guides the eye », « first-person », « angular faces » (faces d'un volume isométrique), « expression » au sens de la ligne. Seule exception : « toy-figure » / « collectible figure » (#87 Funko Pop), parce que c'est le principe même du style.
- Aucun nom propre de la liste de contrôle ne reste dans les descriptors nettoyés ni dans les `nomNeutre`. Le script cherchait la liste fournie plus 665 termes, dont tous les mots capitalisés trouvés dans les clauses « Influenced by / reminiscent of / inspired by » d'origine. Les seuls résultats étaient des faux positifs, comme les mots en majuscule d'un `nomNeutre` (« Photography ») ou « Edo-period ».

## Types de corrections

1. **Bleed sujet**. J'ai remplacé tout ce qui décrit une figure : yeux, visages, anatomie, poses, peau, cheveux, costumes, « character design », proportions de personnage, émotions. Les formulations neutres utilisées sont *shapes, forms, surfaces, elements, staging, silhouette, subject*. Dans les clauses d'influence aussi : « character-design practice » devient « design / shape-design practice », « portrait lighting » devient « studio / backlighting », etc.
2. **Noms propres**. J'ai supprimé les artistes, studios, œuvres, magazines et marques : Pixar, Ghibli, Disney, Marvel, Vogue, Kodachrome, Adobe, ArtStation, Nintendo, Danbooru, Niji… Dans `#95`, il y avait aussi des noms de personnes réelles. À leur place, j'ai mis des traditions ou techniques génériques (« 1970s Japanese television animation », « Brandywine school of golden-age illustration », « Italian Baroque tenebrism »…). J'ai gardé les mouvements : impressionnisme, Art Nouveau, Bauhaus, ukiyo-e, Dada, Vienna Secession, New York School.
3. **Compensation**. Quand le retrait d'une référence vidait le style de sa spécificité, j'ai ajouté le trait de rendu qu'elle portait : palette, technique ou effet. Exemples : palette cobalt/jaune de chrome pour #42 Van Gogh, sépia et teal pour #241, raclette (squeegee) pour #263, contours de papier jauni et misregistration pour #180. Je n'ai ajouté aucun sujet.
4. **Format**. J'ai conservé la phrase longue en anglais de chaque entrée, ainsi que sa forme d'origine (« A … style built on … Influenced by: … » ou « … aesthetics characterized by …, rooted in … »).

## Styles qui dépendent du sujet (gardés, mais à surveiller)

Je les ai généralisés autant que possible. Leur identité reste pourtant liée à une personne ou à une figure : sur un décor ou un accessoire, ils risquent d'ajouter quelqu'un ou de perdre leur sens.

- **Très dépendants** (le style *est* un cadrage ou un rendu de personne) : #28 Selfie Photo, #99 LinkedIn Pro Portrait, #205 Full Body Photo, #170 Milo Manara Style, #252 Robin Eley Style, #95 Instagram Model Glamour, #98 Playboy/Maxim, #217 Streamer Glam Selfie, #59 Character Design Illustration, #64 Loose Crosshatched Character Sketch, #254 Expressive Character Illustration, #61 Caricature, #185 Wojak.
- **Figurine ou objet-personnage** : #36 Corporate Memphis (personnages à membres tubulaires), #85 Muppets, #86 LEGO Minifigure, #87 Funko Pop. Je les ai réécrits en « tout sujet rendu comme un jouet ou une marionnette ».
- **Glamour / pin-up / portrait** : #5 Granblue Pin-Up, #48 Artgerm, #49 Boris Vallejo, #50 Pin-Up, #145 Ultrarealistic Anime Pin-Up, #236 Sakimichan, #276 2020s Pin-Up, #164 Frank Cho, #173 Zenescope, #94 Photoshoot, #96 GQ, #97 Supermodel, #220 Vogue, #192 Annie Leibovitz, #194 Backlit Portraiture, #196 Butterfly Lighting, #198 Commercial Beauty, #214 Peter Lindbergh, #216 Soft Beauty-Dish Portrait, #219 Rembrandt-Inspired Photography, #224 Ornamental Patterns Hyperrealism Portrait, #245 Charlie Bowater, #261 Loish, #265 Agnes Cecile, #268 Anato Finnstark, #146 Romantic Anime-Photographic Hybrid.
- **Anatomie / pose / héroïsme** : #3 Chibi (proportions super-deformed devenues « formes compactes de jouet », à vérifier), #19 Fashion Sketch, #37 Soviet Propaganda Poster, #47 Alex Ross, #124 Boichi, #131 Murata, #139 JoJo, #140 Sailor Moon, #142 Junji Ito, #150 Simpsons, #152 Family Guy, #168 Marvel, #169 Marvel Cover, #172 DC, #174 Ryan Benjamin, #175 Travis Charest, #244 X-Ray (« anatomique » devenu « structure interne »), #255 Splatterpunk, #281 Giallo et #282 Grindhouse (figure centrale devenue « élément central »).

## Groupes de quasi-doublons (rien n'a été supprimé)

Les membres sont cités avec leur `name` exact. ★ marque le membre qui me semble le plus riche.

**A. Texte quasi identique : à trancher en priorité**

| Groupe | Ce qui les rapproche / les distingue |
|---|---|
| `Cel Shading` (#110) = `Toon Shader` (#156) | Texte mot pour mot identique, un seul mot change (« cel-animation »). Garder l'un ou l'autre. |
| `Claymation` (#83) ~ ★`Wallace and Gromit Style` (#84) | Même phrase. #84 ajoute l'asymétrie et une touche excentrique. |
| `Boichi Style` (#124) ~ ★`Murata Hyperrealism` (#131) | Même structure et même rendu (manga hyper-détaillé, hachures sculpturales). |
| ★`Travis Charest Style` (#175) ~ `Adi Granov Style` (#176) | Même phrase de rendu glossy. #176 se distingue un peu par ses surfaces métalliques. |
| ★`Hyper-Stylized Illustration` (#223) ~ `Hyper-Stylized Digital Painting` (#259) | Textes jumeaux. Seule différence : trait graphique (#223) ou pinceau peint (#259). |
| `Jackson Pollock Style` (#44) ~ `Abstract Expressionism` (#262) | Textes jumeaux. #44 = drips et all-over, #262 = gestuel au pinceau. Distincts si on garde cette nuance. |
| `Cross Process Photography` (#200) ~ ★`Cross-Processed Film Photography` (#201) | Même technique. #201 est plus descriptif. |
| `Very Simplistic Doodle` (#22) ~ `Doodle` (#189) | Mêmes références et même idée. #22 est plus radical (aucun ombrage). |
| `Gris Grimly Style` (#62) ~ ★`Tim Burton Style` (#63) | Macabre gothique filiforme, quasi identiques. Variantes : `Gris Grimly-Inspired Hyperrealism` (#238, fini hyperréaliste) et `Invader Zim Style` (#147, cartoon plat), qui restent distinctes. |
| ★`Yoshitaka Amano Style` (#136) ~ `Yoshitaka Amano Fine Art` (#137) | Même univers éthéré à l'encre et au lavis. #137 est plus abstrait et doré. |
| `Hyperrealism` (#277) ~ ★`Ultrarealism` (#278) | Même promesse de fidélité photographique. |
| `Impasto` (#68) ~ `Thick Brushstrokes Painting` (#285) ~ ★`Absolute Painterly Style` (#239) | Empâtement gestuel, presque mot pour mot. À côté : `Brushwork Emphasis` (#65, bravura lumineuse) et `Van Gogh Style` (#42, tourbillons et palette), qui restent distincts. |
| `Instagram Model Glamour Photography` (#95) ~ `Playboy / Maxim-Style Photoshoot` (#98) ~ `Streamer Glam Selfie Realism` (#217) | Glamour retouché à la lumière flatteuse. #217 ajoute ring-light et bokeh. Les trois dépendent du sujet. |

**B. Très proches (rendu voisin, nuance réelle)**

- `Film Noir 1` (#111) ~ ★`Film Noir 2` (#207) ~ `Hitchcockian Photo` (#112). `Sin City Photography` (#113) s'en distingue par la couleur sélective.
- `Tenebrism` (#272) ~ `Chiaroscuro` (#273) ~ `Interplay of Shadow and Light` (#250) ~ ★`Rembrandt Painting` (#269) ~ `Dark Fantasy Illustration` (#253). En photo : `Low-Key Photography` (#212) ~ `Rembrandt-Inspired Photography` (#219).
- `Painting` (#41) ~ ★`Contemporary Oil Painting` (#284) ~ `Digital Painting` (#234).
- `Watercolor Painting` (#283) ~ ★`Wet-on-Wet Watercolor Ink Painting` (#46).
- `Children's Book Drawing` (#53) ~ ★`Vintage Children's Book Drawing` (#54) ~ `Whimsical Illustration` (#57) ~ `Playful Hand-Drawn Illustration` (#21).
- `Collector Storybook Illustration` (#55) ~ `Bookplate Illustration` (#56). Mêmes références d'origine, mais #56 reste gravé et ornemental.
- `Alphonse Mucha Masterwork` (#267) ~ `Kay Nielsen Style` (#258) : Art Nouveau ornemental. Nuance : poster doré pour #267, conte japonisant pour #258.
- `James Jean Style` (#256) ~ `Victo Ngai Style` (#257) : textes très proches (surréalisme ornemental). #257 est plus coloré et décoratif.
- `Flat Illustration` (#225) ~ `Vector Art` (#226) ~ `Design` (#35).
- `Design` (#35) ~ `Poster Art` (#39) ~ `Contemporary Commercial Illustration` (#40) ~ `Commercial Illustration` (#280). #280 est le plus marqué : couverture de magazine, golden age.
- `Minimalism` (#229) ~ `Minimalist Line Art` (#228). Distincts si l'on tient à la ligne continue.
- `Pop Art` (#88) ~ `Variable-Size Ben-Day Dots Illustration` (#89) ; `Playful Retro Pop` (#232) ~ `Butcher Billy Style` (#221).
- `Analog Photography` (#24) ~ `35mm Photography` (#190) ; `Photography` (#23) ~ `Natural Lighting Photography` (#71) ~ `Candid Photography` (#197).
- `Photoshoot` (#94) ~ `Supermodel Photoshoot` (#97) ~ ★`Vogue Magazine` (#220) ~ `GQ Photoshoot` (#96) ~ `Editorial Photography` (#199).
- `Neon Photography` (#76) ~ ★`Cyberpunk Photography` (#115) ~ `Hyper Synthwave` (#215).
- `Night Photography` (#213) ~ ★`Brassaï Night Photography` (#26).
- `3D Render` (#77) ~ `Pixar  Animation` (#78) ~ `Cinematic Final Fantasy 3D Render` (#79).
- `Anime Style` (#0) ~ `Anime Illustration` (#143) ~ ★`Cinematic Anime` (#125) ~ `Anime Key Visual` (#141).
- ★`Berserk Manga Style` (#121) ~ `Ultradetailed Manga Illustration` (#144).
- `Jujutsu Kaisen Style` (#120) ~ `Bleach Style` (#122).
- `Pony 2.5D Realism` (#134) ~ `Pony/Illustrious Checkpoint Style` (#135) ~ `Polished Ultrarealistic Anime Pin-Up` (#145) ~ `Sakimichan Style` (#236) ~ `Granblue Fantasy Pin-Up Style` (#5) ~ `Artgerm Style` (#48).
- `Pin-Up` (#50) ~ `2020s Pin-Up` (#276) : vintage contre digital.
- ★`Manhwa Ultradetailed Art` (#130) ~ `Solo Leveling Art` (#133) ~ `Shindol Style` (#9).
- `Cartoon Style` (#11) ~ `Modern Cartoon` (#153) ~ `Hanna-Barbera Style` (#14) ~ `Nickelodeon Animation Style` (#148) ~ `Adventure Time Style` (#13) ~ `Rick and Morty Style` (#149) ; `Simpsons Style` (#150) ~ `Family Guy Style` (#152).
- `Marvel Comics Style` (#168) ~ `DC Comics Style` (#172) ; `Alex Ross Style` (#47) ~ `American Comic Realism` (#51) ~ `Marvel Cover Art` (#169).
- `Frank Miller Style` (#159) ~ `Bold Contour Style` (#177) ~ `Hellboy Style` (#32).
- ★`Bande Dessinée (Hergé/Goscinny Tradition)` (#163) ~ `Clean Line Art` (#178) ; `Comic Européen Prestige` (#157) ~ ★`Franco-Belgian Ultradetailed Comics` (#162) ~ `Enki Bilal-Inspired…` (#165).
- `Comics Style` (#29) ~ `Vintage Comics` (#180) : #180 se distingue par la trame et l'aspect imprimé.
- `Airbrush Fantasy` (#70) ~ ★`Boris Vallejo Style` (#49).
- ★`Cover Art` (#249) ~ `American Pulp Illustration` (#158) ~ `Adventure Illustration` (#264).
- `Kekai Kotaki Style` (#251) ~ `Contemporary Fantasy Art` (#246) ~ ★`ArtStation Masterpiece` (#240).
- `Drawing` (#17) ~ `Sketch` (#184) ; `Loose Crosshatched Character Sketch` (#64) ~ `Expressive Character Illustration` (#254).
- `Etching` (#93) ~ `Ink Pen Drawing` (#66) ; `Bernie Wrightson Gothic` (#242) ~ `Crosshatched Graphic Novel` (#161).
- `Collage` (#233) ~ `Mixed Media` (#105) ; `Bill Sienkiewicz Expressionism` (#274) ~ `Ashley Wood Illustration` (#271).
- `Giallo Poster Art` (#281) ~ `Grindhouse Poster Illustration` (#282).
- `Charcoal Rendering` (#181) ~ `Conté Pastel` (#186) : proches, mais le médium diffère.

## Catégories (effectifs, pour les filtres de l'UI)

Une entrée peut avoir plusieurs catégories.

| Catégorie | Effectif |
|---|---|
| Illustration | 176 |
| Photography | 55 |
| Anime & Manga | 41 |
| Painting & Fine Art | 41 |
| Character & Concept | 40 |
| Comics & Graphic Novels | 33 |
| Cartoon & Animation | 23 |
| Drawing & Sketch | 20 |
| Design & Posters | 19 |
| 3D & Render | 17 |
| Cinema & Lighting | 15 |
| Craft & Material | 11 |
| Commercial & Editorial | 10 |
| Gaming | 7 |
| Printmaking & Graphic Art | 6 |

« Illustration » couvre 62 % des entrées, ce qui le rend peu discriminant comme filtre. « Character & Concept » porte en lui-même le bleed sujet ; un renommage (« Concept & Fantasy ») mériterait réflexion.

## Doutes

- **Termes techniques éponymes conservés** : « Ben-Day dots » (#88, #89), « Conté crayon » (#186), « Bézier-path » (#226), « Carrara marble » (#104, un lieu), « Brandywine school » (#264, une école régionale). Je les ai traités comme des noms de technique. À retirer si tu veux zéro nom propre. Par contre, « Rembrandt lighting » est remplacé par une périphrase (#219).
- **Noms de modèles IA dans `name`** (Pony, Illustrious, MidJourney Niji) : traités comme des marques, avec un `nomNeutre`. Leur descriptor parle encore de « checkpoint-trained diffusion-model aesthetic », ce qui est générique.
- **`Cyberpunk` (#155)** : le name est générique (pas de `nomNeutre`), mais le descriptor d'origine commençait par « Edgerunners Style: », que j'ai retiré.
- **Sens volontairement déplacés** : #3 Chibi, #86 LEGO, #87 Funko, #244 X-Ray et #142 Junji Ito ont été transposés à « tout sujet ». À tester en image : ces styles pourraient perdre leur intérêt hors personnage.
- **Champs mal formés à l'origine** (corrigés dans le descriptor nettoyé, `descriptorOriginal` intact) : « Influenced byy » (#164), virgules finales (#219, #251…), clause « inspired by » collée sans espace (#95).
- `name` d'origine conservé tel quel, y compris ses coquilles (`Pixar  Animation` avec double espace, `Classic disney`, `Saul Steinbeck` pour Saul Steinberg). *(Corrigées dans la passe finale, voir ci-dessous.)*

## Passe finale

Source : `docs/krea2-styles-guide.nettoye.json` (286 entrées, non modifié). Résultat : `docs/krea2-styles-guide.final.json`, **245 entrées** (41 suppressions), même ordre relatif.
Champs ajoutés sur chaque entrée : `dependantSujet` (booléen) et `filtres` (`medium`, `rendu`, `palette`, `epoque`, `ambiance`). `descriptor`, `descriptorOriginal`, `nomNeutre`, `nomsPropres`, `categories` et `modifie` sont repris à l'identique. Les termes techniques éponymes (Ben-Day, Conté, Bézier, Carrara, Brandywine school…) sont gardés. Les `#n` restent les index du fichier `.nettoye.json`.

### Vocabulaire des filtres (fermé) et effectifs

Effectifs comptés sur les 245 entrées. `medium` et `epoque` prennent une valeur, `rendu`, `palette` et `ambiance` une ou deux : leurs totaux dépassent donc 245.

| `medium` | n | `rendu` | n | `palette` | n | `epoque` | n | `ambiance` | n |
|---|---|---|---|---|---|---|---|---|---|
| photo | 42 | trait net | 55 | saturé | 86 | contemporain | 129 | élégant | 66 |
| peinture numérique | 38 | texturé / matière | 55 | naturel | 38 | intemporel | 31 | ludique | 47 |
| peinture | 36 | aplats | 54 | chaud | 36 | rétro 70–90 | 28 | énergique | 36 |
| encrage BD | 28 | lisse / poli | 41 | monochrome | 32 | milieu XXe | 22 | épique | 34 |
| dessin animé / cel | 27 | clair-obscur | 41 | désaturé | 31 | début XXe | 15 | doux | 33 |
| dessin | 19 | détaillé / ornemental | 32 | pastel | 25 | ancien / classique | 14 | dramatique | 31 |
| graphisme / vectoriel | 14 | photoréaliste | 28 | sombre | 23 | futuriste | 6 | brut | 30 |
| papier & matière | 13 | lumineux / émissif | 26 | froid | 10 | | | onirique | 29 |
| encre & lavis | 10 | lavis / fondu | 23 | néon | 8 | | | inquiétant | 29 |
| gravure / impression | 7 | hachuré | 19 | | | | | nostalgique | 25 |
| 3D | 7 | grain / pellicule | 11 | | | | | froid / technique | 17 |
| pixel / low-poly | 4 | géométrique | 11 | | | | | | |

Conventions de classement :
- **medium** : *encrage BD* = BD et manga encrés (y compris noir et blanc) ; *dessin animé / cel* = anime et cartoon en aplats cel ; *peinture numérique* = rendu peint ou à l'aérographe numérique (concept art, glamour glossy, webtoon) ; *encre & lavis* = encre au pinceau, lavis, plume + aquarelle ; *papier & matière* = papier découpé, pâte à modeler, feutrine, jouets, mosaïque, vitrail, marbre, kintsugi ; *gravure / impression* = gravure, lithographie, sérigraphie, trame Ben-Day.
- **epoque** : la période *visuelle* de référence du style, pas la date de l'œuvre citée. *Intemporel* = technique sans marqueur d'époque (dessin technique, clair-obscur photo, origami…).
- **palette** : *naturel* = couleurs fidèles au réel, sans parti pris.

Limites : *pixel / low-poly* (4 : 8-Bit, Minecraft, PS1, Low Poly) et *futuriste* (6) restent petits mais sans équivalent ailleurs ; *contemporain* (129) et *saturé* (86) dominent, parce que la majorité du catalogue est de l'illustration numérique actuelle. Le croisement avec `medium` les rend discriminants.

### Styles dépendants du sujet

`dependantSujet: true` sur **54 entrées** : toutes celles de la section « Styles qui dépendent du sujet » ci-dessus qui n'ont pas été supprimées (9 l'ont été : #49, #96, #97, #98, #124, #152, #172, #236, #254). `false` partout ailleurs. `Airbrush Fantasy` (#70), conservé à la place de `Boris Vallejo Style`, est à `false`.

### Coquilles de `name` corrigées

| Avant | Après |
|---|---|
| `Pixar  Animation` (#78) | `Pixar Animation` (double espace) |
| `Classic disney Feature Animation` (#154) | `Classic Disney Feature Animation` |
| `Saul Steinbeck Art` (#188) | `Saul Steinberg Art` |
| `Movie Digital art` (#260) | `Movie Digital Art` (casse) |

### Suppressions (41)

Pour chaque groupe, j'ai gardé le membre le plus riche ou le plus utile. Les entrées conservées n'ont pas changé.

| Supprimé | Conservé | Raison |
|---|---|---|
| `Toon Shader` (#156) | `Cel Shading` (#110) | Texte mot pour mot identique (seul « cel-animation » change). |
| `Wallace and Gromit Style` (#84) | `Claymation` (#83) | Même phrase ; Claymation garde le rendu pâte à modeler sans les ajouts liés au sujet (proportions, décor domestique) ni nom propre. |
| `Boichi Style` (#124) | `Murata Hyperrealism` (#131) | Même structure et même rendu (manga hyper-détaillé, hachures sculpturales) ; Murata un peu plus complet. |
| `Adi Granov Style` (#176) | `Travis Charest Style` (#175) | Même phrase de rendu glossy ; la seule nuance (surfaces métalliques/armures) décrit un sujet. |
| `Hyper-Stylized Digital Painting` (#259) | `Hyper-Stylized Illustration` (#223) | Textes jumeaux (exagération assumée) ; la variante peinte est couverte par Absolute Painterly Style et Digital Painting. |
| `Cross Process Photography` (#200) | `Cross-Processed Film Photography` (#201) | Même technique (cross-processing) ; #201 décrit le procédé, #200 seulement l'ambiance. |
| `Very Simplistic Doodle` (#22) | `Doodle` (#189) | Mêmes références et même idée ; Doodle couvre le gribouillis, l'absence d'ombrage en plus est marginale. |
| `Gris Grimly Style` (#62) | `Tim Burton Style` (#63) | Macabre gothique filiforme quasi identique ; Tim Burton Style plus riche (contrastes, spirales, rayures). |
| `Yoshitaka Amano Fine Art` (#137) | `Yoshitaka Amano Style` (#136) | Même univers éthéré encre/lavis ; Amano Fine Art n'ajoute qu'un peu d'abstraction et de dorure. |
| `Hyperrealism` (#277) | `Ultrarealism` (#278) | Même promesse de fidélité photographique ; Ultrarealism va un cran plus loin. |
| `Thick Brushstrokes Painting` (#285) | `Absolute Painterly Style` (#239) | Presque mot pour mot ; Absolute Painterly Style conservé. Impasto (#68, relief physique de la matière) reste distinct. |
| `Playboy / Maxim-Style Photoshoot` (#98) | `Instagram Model Glamour Photography` (#95) | Glamour retouché à lumière flatteuse, même rendu ; Instagram Model Glamour plus descriptif sur la lumière et la retouche. |
| `Film Noir 1` (#111) | `Film Noir 2` (#207) | Même film noir contrasté ; Film Noir 2 plus complet (brume, surfaces mouillées, angles). |
| `Interplay of Shadow and Light` (#250) | `Tenebrism` (#272) | Contraste lumière/ombre à frontière nette = ténébrisme ; Tenebrism plus précis. |
| `Painting` (#41) | `Contemporary Oil Painting` (#284) | Texte presque identique (brosse visible, glacis, valeurs) ; la version contemporaine est plus précise. |
| `Watercolor Painting` (#283) | `Wet-on-Wet Watercolor Ink Painting` (#46) | Mêmes lavis transparents et bords fondus ; Wet-on-Wet Watercolor Ink Painting plus riche. |
| `Children's Book Drawing` (#53) | `Vintage Children's Book Drawing` (#54) | Même album jeunesse doux ; la version vintage ajoute papier jauni et couleurs d'impression. |
| `Whimsical Illustration` (#57) | `Playful Hand-Drawn Illustration` (#21) | Même illustration fantaisiste à formes rebondies ; Playful Hand-Drawn plus concret (trait encré, lavis, détails griffonnés). |
| `Design` (#35) | `Flat Illustration` (#225) | Graphisme épuré à aplats, quasi identique à Flat Illustration, plus précis. |
| `Playful Retro Pop` (#232) | `Butcher Billy Style` (#221) | Même rétro-pop à aplats et contours ; Butcher Billy Style ajoute trames et typographie comics. |
| `35mm Photography` (#190) | `Analog Photography` (#24) | Même photo argentique (grain, rendu chimique) ; Analog Photography plus riche (halation, dynamique). |
| `Photography` (#23) | `Natural Lighting Photography` (#71) | Photo naturaliste générique ; Natural Lighting Photography dit la même chose avec plus de précision. |
| `Supermodel Photoshoot` (#97) | `Vogue Magazine` (#220) | Même éditorial mode studio (lumière sculptante, retouche) ; Vogue Magazine conservé. |
| `GQ Photoshoot` (#96) | `Vogue Magazine` (#220) | Même phrase d'éditorial magazine ; la nuance « menswear » décrit un sujet. |
| `Neon Photography` (#76) | `Cyberpunk Photography` (#115) | Néon nocturne contrasté ; Cyberpunk Photography reprend tout et ajoute gels, brume humide, surfaces mouillées. |
| `Night Photography` (#213) | `Brassaï Night Photography` (#26) | Photo de nuit à poches de lumière ; Brassaï Night Photography plus riche (réverbères dans la brume, pavés mouillés). La nuit en couleur reste couverte par Cyberpunk Photography. |
| `Anime Illustration` (#143) | `Anime Style` (#0) | Anime générique à cel-shading, même contenu ; Anime Style plus développé. |
| `Ultradetailed Manga Illustration` (#144) | `Berserk Manga Style` (#121) | Manga seinen ultra-détaillé à hachures ; Berserk Manga Style plus riche. |
| `Jujutsu Kaisen Style` (#120) | `Bleach Style` (#122) | Shōnen anguleux à ombres encrées ; Bleach Style conservé (la nuance de JJK, effets d'énergie maudite, est un sujet). |
| `Pony/Illustrious Checkpoint Style` (#135) | `Polished Ultrarealistic Anime Pin-Up` (#145) | Anime glossy semi-réaliste à reflets spéculaires ; Polished Ultrarealistic Anime Pin-Up plus précis (rendu laqué). |
| `Sakimichan Style` (#236) | `Polished Ultrarealistic Anime Pin-Up` (#145) | Même fusion anime/photoréalisme glossy à l'aérographe ; Polished Ultrarealistic Anime Pin-Up conservé. |
| `Family Guy Style` (#152) | `Simpsons Style` (#150) | Sitcom animée à aplats et gros contours, quasi identique ; Simpsons Style a une palette définie. |
| `DC Comics Style` (#172) | `Marvel Comics Style` (#168) | Même phrase super-héros mainstream ; Marvel Comics Style plus précis (trame, points d'énergie, quadrichromie). |
| `Bold Contour Style` (#177) | `Frank Miller Style` (#159) | Gros aplats noirs pulp-noir ; Frank Miller Style décrit la même chose plus complètement. |
| `Clean Line Art` (#178) | `Bande Dessinée (Hergé/Goscinny Tradition)` (#163) | Ligne claire franco-belge ; Bande Dessinée (Hergé/Goscinny) plus riche (aplats, décors, impression album). |
| `Comic Européen Prestige` (#157) | `Franco-Belgian Ultradetailed Comics` (#162) | BD franco-belge prestige ; Franco-Belgian Ultradetailed Comics plus précis (hachures, gradations). |
| `Boris Vallejo Style` (#49) | `Airbrush Fantasy` (#70) | Même fantasy à l'aérographe des années 70–80 ; Airbrush Fantasy conservé, sans la dépendance au sujet (formes héroïques sculptées). |
| `Contemporary Fantasy Art` (#246) | `ArtStation Masterpiece` (#240) | Concept art fantasy « premium » générique ; ArtStation Masterpiece plus descriptif. |
| `Drawing` (#17) | `Sketch` (#184) | Dessin au trait observé, hachures légères ; Sketch dit la même chose avec plus de précision. |
| `Expressive Character Illustration` (#254) | `Loose Crosshatched Character Sketch` (#64) | Esquisse expressive à modelé exagéré ; Loose Crosshatched Character Sketch plus concret (hachures, trait cherché). |
| `Crosshatched Graphic Novel` (#161) | `Bernie Wrightson Gothic` (#242) | Même plume hachurée des comics d'horreur des années 70 ; Bernie Wrightson Gothic plus riche. |

Deux choix vont contre l'étoile ★ du rapport : `Claymation` est préféré à `Wallace and Gromit Style`, et `Airbrush Fantasy` à `Boris Vallejo Style`. Dans les deux cas, le membre retenu est générique et sans dépendance au sujet.

### Groupes gardés malgré la proximité (nuance réelle)

- `Jackson Pollock Style` (#44) / `Abstract Expressionism` (#262) : coulures all-over contre geste au pinceau.
- `Impasto` (#68) / `Absolute Painterly Style` (#239) : relief physique de la pâte contre touche lâche.
- `Tenebrism` (#272) / `Chiaroscuro` (#273) / `Rembrandt Painting` (#269) / `Dark Fantasy Illustration` (#253) : transition abrupte, transition graduelle, empâtement chaud, genre. `Low-Key Photography` (#212) / `Rembrandt-Inspired Photography` (#219) : éclairage différent.
- `Hitchcockian Photo` (#112) et `Sin City Photography` (#113) à côté de `Film Noir 2` : cadrage voyeur, couleur sélective.
- `Digital Painting` (#234) à côté de `Contemporary Oil Painting` : le médium diffère.
- `Collector Storybook` / `Bookplate` ; `Mucha` / `Kay Nielsen` ; `James Jean` (lavis translucide) / `Victo Ngai` (gouache à motifs) ; `Flat Illustration` / `Vector Art` (dégradés) ; `Poster Art` / `Contemporary Commercial` / `Commercial Illustration` (trois époques) ; `Minimalism` / `Minimalist Line Art` ; `Pop Art` / `Ben-Day` à taille variable.
- `Candid Photography` (pris sur le vif) ; `Photoshoot` (#94, studio générique hors mode) et `Editorial Photography` (#199, lumière narrative) à côté de `Vogue Magazine` ; `Hyper Synthwave` à côté de `Cyberpunk Photography`.
- `3D Render` / `Pixar Animation` / `Cinematic Final Fantasy 3D Render` : neutre, cartoon chaud, cinématique réaliste.
- `Cinematic Anime` / `Anime Key Visual` ; `Manhwa Ultradetailed` / `Solo Leveling` / `Shindol` (trois palettes) ; `Pony 2.5D` / `Granblue` / `Artgerm` / `Polished Anime Pin-Up` ; `Pin-Up` / `2020s Pin-Up`.
- Cartoons : chacun porte une époque ou un trait distinct (`Cartoon Style` classique, `Modern Cartoon`, `Hanna-Barbera`, `Nickelodeon`, `Adventure Time`, `Rick and Morty`).
- `Alex Ross` (gouache) / `American Comic Realism` (encrage fin) / `Marvel Cover Art` (numérique saturé) ; `Hellboy` (lavis, folklore) à côté de `Frank Miller` ; `Enki Bilal` ; `Comics Style` / `Vintage Comics` (trame imprimée).
- `Cover Art` / `American Pulp` / `Adventure Illustration` (trois traditions) ; `Kekai Kotaki` (touche lâche, halo) à côté d'`ArtStation Masterpiece`.
- `Etching` / `Ink Pen Drawing` ; `Collage` / `Mixed Media` ; `Sienkiewicz` / `Ashley Wood` ; `Giallo` / `Grindhouse` ; `Charcoal` / `Conté`.

### Vérification (script)

JSON valide, 245 entrées. Chaque entrée a les 5 axes et 1 ou 2 valeurs du vocabulaire fermé selon l'axe. `dependantSujet` est un booléen sur toutes. Aucun doublon de `name`.


## Version finale du fichier (nettoyage terminé)

- Champs retirés de `krea2-styles-guide.final.json` : `descriptorOriginal`, `modifie`, `dependantSujet` (le texte d'origine reste dans `krea2-styles-guide.json`, la liste des styles liés à un sujet dans ce rapport).
- Champ ajouté : `promptApercu` = scène commune + `descriptor`. Scène commune, sans personnage et identique pour tous les styles, pour que les vignettes se comparent :

> A small wooden rowing boat moored at a weathered stone jetty on a calm lake, a lit lantern hanging from the mooring post, a hillside village and layered mountains fading into the distance at dusk. Vertical 2:3 composition.

- Ces prompts servent à générer l'image de présentation 2:3 de chaque style (une image par entrée, 245 au total). *(Remplacé : voir « Réintroduction des références ».)*

## Réintroduction des références

Décision de l'utilisateur (2026-10-07), qui revient sur la consigne de nettoyage : sans noms propres, les styles se mélangent. Les noms d'artistes, studios, œuvres et marques sont donc remis dans `descriptor`. Le tri manuel des noms non pertinents se fera ensuite, entrée par entrée.

Sauvegarde avant modification : `docs/krea2-styles-guide.final.avant-references.json`. L'original et le `.nettoye.json` n'ont pas été touchés.

### Méthode

Point de départ : le `descriptor` nettoyé. Le travail anti-bleed reste acquis : aucune description de sujet n'a été réintroduite. Chaque entrée finale a été rapprochée de l'original par `name`. Les 4 noms corrigés (`Pixar Animation`, `Classic Disney Feature Animation`, `Saul Steinberg Art`, `Movie Digital Art`) ont été rapprochés à la main.

- **Clause « Influenced by: … »** (128 entrées) : les éléments de la clause d'origine qui contiennent un nom propre sont replacés en tête de la clause, dans leur ordre d'origine. Les éléments du nettoyage (périphrases, techniques, compensations) suivent. On ne supprime aucune technique : la périphrase reste à côté du nom (ex. Ghibli : « Hayao Miyazaki, Studio Ghibli production technique, traditional Japanese feature-animation background painting, … »).
- **Clauses « reminiscent of … , inspired by … »** (44 entrées) : le « rooted in … » du nettoyage est gardé et la queue d'origine est recollée telle quelle derrière (ex. Bruce Timm Noir : « …, rooted in 1990s art-deco-inflected TV animation …, reminiscent of Bruce Timm and Darwyn Cooke, inspired by Batman: The Animated Series and DC: The New Frontier. »).
- **Éléments à nom propre qui décrivaient un sujet** : seuls le nom et la technique sont gardés.
  - `Cygames character-art direction` devient `Cygames art direction` (Granblue).
  - `Nintendo character-art direction` devient `Nintendo art direction` (Zelda Wind Waker).
  - `Final Fantasy character-art tradition` devient `Final Fantasy illustration tradition` (Yoshitaka Amano).
  - `LinkedIn/business-platform portrait convention` devient `… profile-photo convention`.
  - `Vanity Fair Portraits` / `Vanity Fair Portraiture` deviennent `Vanity Fair` (Annie Leibovitz, Butterfly Lighting).
- **Noms dans le corps du texte**, remis à leur place d'origine :
  - `Edgerunners Style:` en tête de `Cyberpunk`.
  - `single-source "Rembrandt lighting"` dans `Rembrandt-Inspired Photography`, devant la périphrase.
  - `adult-swim animation tradition` (Rick and Morty). Ce nom de marque en minuscules a échappé à la détection automatique.
- **Cas particuliers**
  - `Instagram Model Glamour Photography` : la clause d'origine était mal formée (« lighting.inspired by … , »). Elle devient « contemporary Instagram/social-media influencer photography » + « …, inspired by Demi Rose photoshoot, Amouranth Stream, Emily Ratajkowski glamour photo. ».
  - `Saul Steinberg Art` : la coquille d'origine « Saul Steinbeck » est corrigée en « Saul Steinberg ».
- **Inchangées** : 72 entrées dont le texte d'origine n'avait aucun nom propre, ou dont le nettoyage avait conservé les noms (mouvements : Bauhaus, Art Nouveau, ukiyo-e…).
- Les champs `nomNeutre` et `nomsPropres` sont supprimés. Chaque entrée garde `name`, `descriptor`, `categories` et `filtres`, et reçoit `varianteApercu` et `promptApercu`.

**Chiffres** : 173 descriptors modifiés sur 245, 72 inchangés.

**À regarder en priorité au tri manuel** :
- Personnes réelles hors artistes : Demi Rose, Amouranth, Emily Ratajkowski (Instagram Model Glamour Photography).
- Titres d'œuvres qui sont aussi des noms de personnages : Harley Quinn, Power Girl (Amanda Conner), Batman (Bruce Timm Noir), Tomie (Junji Ito)…
- Titres porteurs d'un sujet : « Men in the Cities » (Charcoal Rendering).

Ces noms risquent de faire apparaître le personnage ou la personne plutôt que le rendu.

### Aperçus : scène avec personnage et variantes

`promptApercu = <scène de la variante> + " " + descriptor`, avec le descriptor qui contient maintenant les références. Le champ `varianteApercu` donne l'identifiant de la variante utilisée, pour regrouper les aperçus ou les relancer. Toutes les scènes gardent la même situation de fond (une jeune femme, une jetée, un lac, une lanterne, le crépuscule, un village ou une ville, des montagnes) et ne nomment jamais le style. Le style vient uniquement du descriptor.

Base :

> A young woman in a long coat standing on a weathered stone jetty on a calm lake at dusk, holding a lit lantern, a hillside village and layered mountains fading into the distance behind her. Vertical 2:3 composition.

| `varianteApercu` | n | Pour | Scène exacte |
|---|---|---|---|
| `base` | 43 | Peinture, dessin, anime/BD sans ambiance marquée | *(base ci-dessus)* |
| `photo` | 35 | `medium` photo | A young woman in a plain wool coat and scarf standing on a weathered stone jetty on a calm lake at dusk, holding a lit lantern, a hillside village with a few lit windows and layered mountains fading into the distance behind her. Vertical 2:3 composition. |
| `fantasy` | 43 | Ambiance onirique / épique, fantasy | A young woman in a long hooded cloak standing on a weathered stone jetty on a misty lake at dusk, holding a lantern that glows with a soft otherworldly light, wisps of mist drifting over the water, a hillside village and layered mountains fading into the distance behind her. Vertical 2:3 composition. |
| `scifi` | 8 | Époque futuriste, palette néon, cyberpunk / synthwave | A young woman in a long high-collared coat standing on a metal jetty of a floating city on a calm lake at dusk, holding a glowing lantern, lit towers and luminous signs reflected on the water instead of a village, layered mountains fading into the distance behind her. Vertical 2:3 composition. |
| `sombre` | 27 | Ambiance inquiétante, horreur, gothique, noir | A young woman in a long dark coat standing on a weathered stone jetty on a still lake at dusk, holding a dimly lit lantern, thick fog rolling over the water, a pale silhouette half-submerged in the water a few meters away, a hillside village with dark windows and layered mountains barely visible behind her. Vertical 2:3 composition. |
| `ludique` | 31 | Ambiance ludique (cartoon, mignon, humour) | A young woman in a long coat with a simple rounded silhouette standing on a small stone jetty on a calm lake at dusk, holding a moon-shaped lantern, little toy boats floating on the water, a hillside village of tiny houses and rounded mountains behind her. Vertical 2:3 composition. |
| `retro` | 16 | Époque début XXe / milieu XXe / rétro 70–90 (hors photo) | A young woman in a long period coat and cloche hat standing on a weathered stone jetty on a calm lake at dusk, holding a brass oil lantern, an old painted sign for a lakeside inn beside the jetty, a hillside village and layered mountains fading into the distance behind her. Vertical 2:3 composition. |
| `volume` | 22 | 3D, pixel / low-poly, papier & matière (pâte, jouets, mosaïque, vitrail…) | A young woman in a long coat standing at the end of a small stone jetty on a calm lake at dusk, holding a lit lantern, a rowing boat moored beside her, a compact hillside village of simple houses and layered mountains behind her. Vertical 2:3 composition. |
| `graphique` | 20 | Graphisme / vectoriel, gravure / impression, Design & Posters | A young woman in a long coat standing on a straight stone jetty that leads toward the center of a calm lake at dusk, holding a lit lantern, her silhouette set against a large setting sun, a hillside village and layered mountains forming stacked bands behind her. Vertical 2:3 composition. |

Attribution : une règle sur `filtres`, `categories` et le texte du descriptor, appliquée dans cet ordre de priorité : scifi, sombre, volume, ludique, photo, fantasy, graphique, retro, base. La règle a ensuite été corrigée à la main pour 12 entrées :

| Entrée | Variante |
|---|---|
| Soviet Propaganda Poster | graphique |
| Pop Art | graphique |
| Variable-Size Ben-Day Dots Illustration | graphique |
| PS1 Graphics | volume |
| Fish-Eye Photography | photo |
| Sitcom Still | photo |
| Bleach Bypass Photography | photo |
| 70s Anime | retro |
| Stranger Things-Inspired Art | retro |
| Pin-Up | retro |
| Solo Leveling Art | fantasy |
| Zelda Wind Waker Style | ludique |

### Vérification (script)

Les contrôles suivants passent tous :
- JSON valide, 245 entrées, mêmes `name` dans le même ordre ;
- `filtres` et `categories` identiques à la sauvegarde ;
- `nomNeutre` et `nomsPropres` absents ;
- chaque `promptApercu` contient « woman » et se termine par le `descriptor`.

Mots de sujet (eyes, face, pose, portrait, skin, anatomy, hair, body, figure, character, costume, limbs…) : aucun n'a été ajouté par rapport au descriptor nettoyé, sur les 245 entrées. Un échantillon de 15 entrées modifiées, tirées au hasard, a aussi été relu (texte ajouté = noms propres et titres uniquement).
