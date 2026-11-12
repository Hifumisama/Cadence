---
name: prompt-asset
description: Write the generation prompt of one registry asset (Krea 2 image or Qwen Image Edit edit) or of a presentation poster (variant affiche), and recommend the production method; the user decides.
metadata:
  language: instructions in English; output language per field (see "Output language")
---

# prompt-asset — write an asset's prompt

For **one registry asset**, you write the **generation prompt** (`promptGeneration`): what gets pasted into ComfyUI to make the image (Krea 2 for a generation, Qwen Image Edit for an edit) And you recommend the **production method**. The user decides.

The input tells which case you are in: an `asset`, or a poster (`cible`, `titre`, `resume`: see "A poster").

You do not write the asset's "role" in the video plans: it changes from plan to plan and is said in each plan's video prompt.

## Output language

- **English** (it goes to the image model): `promptGeneration`.
- **French** (the user reads it): `raisonMethode`, `remarques[].message` (always French, even when the rest of the output is English). `reflexion` is French too, but the user never sees it.
- Inputs (canonical description, plan roles) are in French. Translate the identifying traits into English for the prompt.
- Text shown in the image stays in its own language, between quotes (`"Le Voile Écarlate"`). A poster's title is copied exactly as given, never translated.
- Never change enum values, asset codes or JSON keys.

## What you receive

- The asset: code, type, **canonical description (French)**, critical or not.
- Its possible **starting image** (the registry's `parent`: a mere starting point, not a hierarchy), with its description and prompt.
- The **plans that cite it** (role, expected framing), when they exist: this says how the image will be used.
- The project's **style clause**, for information: ComfyUI adds it, you never repeat it.
- The other assets of the same family, to stay consistent.
- `asset.promptActuel`, when it is filled: the current prompt. **Polish it** (guide rule 8) and keep what already holds.
- `detailsDuBrief`, when the asset comes from the brief: the brief entry itself (`section` says which: `personnages`, `lieux` or `elements`; `entree` is the entry). `briefExtrait` holds the whole brief (characters, places, `elements`) for the family's consistency. See "The brief's details" below.
- `consigne` and `retourUtilisateur` (when present): the user's request. **It outranks your own choices.**

## A try from the asset's page (`methodeImposee`)

When the input has **`methodeImposee`**, the user wrote `consigne` (French, possibly empty) on the asset's page and the code has **already decided the method**: you do not choose it, whatever the rules of "Choosing the method" would say. `methode` in your output repeats `methodeImposee`, `raisonMethode` is one short sentence, `sources` is omitted.

- **`generation`** (the asset has no image yet): write the Krea 2 prompt from the canonical description, **completed and bent by the consigne** (the consigne wins on any point it covers). An empty consigne means "draw what the description says". `asset.promptActuel` is empty or the prompt of an earlier try: polish it, never repeat its mistakes.
- **`edition` with `imagesDeLEssai`**: the try carries 1 to 3 images, listed by `rang` (1, 2, 3) with their `role` (`base`: the asset's own image; `jointe`: an image the user attached) and `libelle` (what it shows). **Image 1 is the one that carries the changes**; images 2 and 3 only lend what the consigne takes from them (a face, an outfit, a material, a light). Cite them by rank in the instructions ("image 2") and say what is borrowed from each. When there is no `base`, image 1 is an attached image the consigne builds on; the asset's description still tells what the result is.
- **`edition`** (an image exists and is image 1): `consigne` says **what to change** on it. Write imperative Qwen instructions, one intention per line, that apply **only** what the consigne asks and name what must stay (identity, outfit, light, framing) unless the consigne changes it. `asset.promptActuel` is the prompt that made image 1: **it is context, never copied into the instructions** (the image already is that). The consigne can be short and colloquial ("plus âgée", "sans le chapeau"): turn it into precise visual instructions, in English. Do not describe the whole image.

## The principle that rules everything

**The canonical description is the source. Your prompt descends from it, it does not contradict it.** Reuse its vocabulary on the identifying traits, translated into English, word for word when possible. If the video claims to receive "an arm rebuilt from mismatched lighter-rust panels", the image cannot show "a rusty repaired arm".

**What is said wins; what is missing, you complete.** The more precise the description, the less you invent; the poorer it is, the more you decide, with a precise and original choice that fits the story, the tone and the project's style. A prompt that stays as bare as its description makes a generic image: that is the failure to avoid.

**What the image must NOT show outranks the description.** A reference image is reused by every plan, so some parts of a description never reach the prompt, even when written there:
- **a character**: every place, pose, action, gesture, held object, line of dialogue or scene mood ("assise sur un talus", "regarde l'horizon", "dit : …"). Keep only the appearance; the sheet is a turnaround on a plain background (Writing, rules 2 and 3);
- **a set**: every prop, accessory or loose object, unless it is a fixed, central part of the place (Writing, rule 10);
- **an effect**: every hand, fist, finger, arm or other body part (Writing, rule 11).
Drop them silently from the prompt (no negation: describe what is shown instead) and say in `reflexion` what you left out.

Start with `reflexion`: a short draft, never shown, where you list what is said (kept as is), what is missing (and your choice), and what you add to reach the length. Then write the prompt from it.

For an **edit**, the prompt is not a description: it is a transformation to apply to image 1 (by default the asset's starting image).

## The brief's details (`detailsDuBrief`)

The interview may have noted how things look, in French, in optional sub-fields. The canonical description often repeats them; the brief entry says **how sure** they are.

- **A character: `tenue`** feeds the outfit part of the paragraph (Writing, rule 3): `coupe` gives the cut of each of the three layers, `matieres` their materials, `couleurs` the dominant and secondary colours, `accessoires` the footwear and **worn** accessories (a carried object, a staff, a bag held in hand, stays out: it is a prop), `signeDistinctif` the silhouette signature or a mark. `evolution` is not drawn: the sheet shows the outfit at the start, unless this asset is the later state it describes. Fill the layers `tenue` leaves out yourself.
- **A set: `aspect`** feeds the set sheet: `lumiere` becomes the set's fixed light sentence, `matieres` and `palette` the surfaces and colours. `ambiance` is kept only as what can be seen in an empty place (drifting dust, wind-bent grass, still water); a crowd or a sound is left out (Writing, rule 9).
- **A prop or an effect: the `elements` entry** gives `couleur`, `ampleur` (the object's size, the effect's extent) and `comportement`. For an effect, turn the behaviour into a visible shape and texture (a spiral of thin strands, a burst of sparks, a slow rising column), still from an abstract emission point (Writing, rule 11): who casts it is never shown.
- **The `statut` of each sub-field decides how much you trust it.**
  - `fourni` (the user said it) and `delegue` (the user let the agent choose): settled. Keep it word for word, translated.
  - `deduit` (the agent assumed it, nobody confirmed) and `incertain` (said in vague terms, such as "inspirée de…" without a colour or a material): a **lead, never a certainty**. Keep its direction, but decide each detail precisely yourself (name the colours, the materials, the cut), and flag it in `remarques` with type `description-vague`, saying what you decided ("tenue incertaine : j'ai choisi une tunique de lin ocre…") so the user can correct it.
  - No `statut`: treat it like the canonical description.

## Choosing the method

The starting image is only a **proposal**: the registry is flat, and the method is decided by what the asset is, not by its link to another. **The link does not say how the asset is made.**

1. **No starting image**: generation (Krea 2).
2. **A starting image, and the asset is a tighter crop or a detail of the same image, or a STATE of the same subject** (a character, creature, set or prop with the same identity in another condition: older or younger, durably transformed, in a new outfit, burnt, at night, fire out, broken; or a close-up, cropped blade, blur, light change, added element): **edit**. The starting image must be produced first. A state is edited, not regenerated, precisely so that it stays recognisable as the same subject; if the change is so large that an edit would fail (see the three cases of `guide-qwen-edit.md`), recommend the method and the reason in `raisonMethode`, and copy the subject's identifying traits from the starting asset's description and prompt.
   - **Making an image from other images** is also an edit: image 1 is what gets modified, images 2 and 3 are references (a character to place in a set, a material to apply). List them in `sources`, in order, and cite them by rank in the prompt ("image 1", "image 2"). Three images at most.
3. **A starting image, but the asset is a different subject or generic matter, not a state of the starting subject** (a visual effect, a separate prop, a separate piece): **generation**. For consistency, read the starting asset's description and prompt, never its image.
4. **The goal is an absence, or a change of viewpoint**: **generation**, even with a starting image (see `guide-qwen-edit.md`).

If the case is ambiguous, recommend, give the reason in one sentence, and let the user choose.

## Writing

1. **Generation (Krea 2)**: continuous prose, in English, guided by `guide-krea2.md`. Subject only, no style. A character follows the guide's 4-view template; a **set** follows the guide's **3-view set sheet** (wide view, reverse view, landmark detail); a **prop** is one clear image by default and follows the guide's 3-view mini-sheet only when it carries the story and its shape changes with the angle (an effect stays plain prose); a **map** follows rule 12. **Length: 40 to 100 words** for a set, prop, effect or map, **150 to 220** for a character (the template's fixed sentence not counted). Spend them on what makes the image: materials and textures, colours, wear, scale, the arrangement of what is shown, the quality of the natural light for a set.
2. **A character is a turnaround sheet, alone, on a plain background.** The sheet is the identity reference for all plans: it shows **the character and nothing else**, standing in a neutral pose, on a plain background, **empty hands** (a held object drifts from one view to the next: it is a separate asset). No visual effect, no set, no other character, no action pose, no cinematic framing: what the character does is said later, in each plan's video prompt. **This rule outranks "the canonical description is the source"**: when the description places the character somewhere, in a pose, doing something or saying something ("assise sur un talus près de la mer", "lève la main", "crie : …"), you **ignore** all of it and keep only the appearance. An effect (fire, water, energy, smoke, aura) is never in a character's sheet.
3. **A character's identity lives in the prompt, and it is rich.** One single paragraph of **150 to 220 words** in English, in this order, then the template sentence at the very end:
   1. **identity**: age, gender, build and height, skin, face (shape, eyes, brows, nose, mouth, a mark), expression at rest;
   2. **hair**: length, cut, texture, colour, how it is tied or held (a ribbon, a braid, beads);
   3. **the outfit in three layers** (from `tenue` when the brief has it, see "The brief's details"): the **under layer** (shirt, tunic, bodysuit), the **main garment** (robe, coat, dress, armour, trousers and top), the **outer layer** (cloak, cape, shawl, jacket, sash); for each, the **cut**, the **material** (wool, quilted leather, raw silk, waxed cotton, brushed suede, ribbed knit), a **dominant and a secondary colour**, **patterns or embroidery** (chevrons, geometric trims, floral borders), **ornaments** (toggles, clasps, studs, piping) and **wear** (frayed hem, faded dye, ink stains, mended patch);
   4. **footwear and worn accessories**: boots, sandals or wraps; belt, pouch, bracelets, necklace, headband, gloves (worn, never held);
   5. **one silhouette signature**: the trait that makes the character recognisable from far away (a high collar, a long trailing scarf, an asymmetric pauldron, a wide-brimmed hat).
   **Enjoy designing the outfit**: give it a strong, specific identity that fits the character's culture, role and world (a tribe's fabrics, a guild's colours, a soldier's insignia), never a generic "simple clothes". What the description gives is kept word for word; everything it leaves out, **you decide**, precisely, and consistently with the story and the family's other assets. When a basic trait was missing (age, gender, outfit), flag `description-vague` in `remarques` saying **what you chose** ("genre non précisé : j'ai choisi une femme d'une trentaine d'années") so the user can correct it. **Never an "or"** in the prompt ("male or female", "tabby or bicolor"): pick one. A description that talks about voice, role or action instead of appearance is vague: same treatment.
4. **A character from an existing universe** (the brief has an `univers` field) is named by their **proper name** in the prompt, in addition to the described traits: the image model knows their features, and a generic label ("the hero", "the chosen one") leaves it to guess who is meant.
5. **Edit (Qwen)**: imperative instructions, one intention per line, one pass after another, guided by `guide-qwen-edit.md`. Name what must be preserved.
6. **No negative prompt.** Neither "without X" nor "no X": describe the wanted state ("clear sky, sharp horizon" rather than "no fog").
7. **Never any style in an asset prompt**: the project has a style clause, added separately.
8. **Complete without contradicting**: add details that serve the asset itself (material, colour, wear, texture, a distinguishing trait), none that contradicts the description or the brief, and no object or prop that would be a separate asset.
9. **A populated set and an empty set are two assets**: never describe a set with a crowd if it must be used empty, nor the reverse.
10. **A set, prop or effect is shown alone** (a set sheet shows only the place, a prop only the object, nothing in hands). If its description mentions a character or an action ("the cat sits on it"), leave that out of the prompt: who uses it is said in the plans, and a character drawn into a set's reference gets confused with their own sheet. Exception: a `keyframe` is a composite on purpose and combines its `sources`.
    **A set is the place, without its props.** Describe the architecture or the terrain, materials, vegetation, water, scale and layout; leave out every prop, accessory and loose object the description lists (a lantern, a board, a basket, a weapon on a rack): each is its own asset or prose in the plans, and an object drawn into the set image is copied into every shot. Keep an element only when it **is** the place or its centrepiece (a flying whale above the village: yes; an ice board on a wave: no). The **close-up detail** of the set sheet's third view is an **architectural or natural** element of the place (a carved doorframe, a weathered rock face, a frozen waterfall, a roof joint), never a prop.
11. **An effect is a generic material swatch.** Show the phenomenon itself (wisps of golden energy, drifting embers) isolated on a plain dark background, centred, **without any subject, body, set, scene or story context**, and without cinematic framing: it will be borrowed by many plans as texture, colour and motion, and a staged image would be reproduced as a stand-alone shot. Describe matter, colour, density and movement, nothing tied to one plan.
    **Never a hand, fist, finger, arm or any body part** in an effect, even when the description says where the effect comes from ("du feu jaillit de son poing", "l'eau tourne autour de ses mains"): the video model copies the body part into the shot as a stranger's limb. Replace the gesture by an **abstract emission point**: the effect bursts from a bright point at the centre of the frame, spirals out of a small glowing core, rises from the bottom edge.
12. **A map of an invented world** (the asset is a map: its description or its code says `carte`, `map`, a world, a continent, a kingdom to show from above). It is the one image drawn **from above**, and it does **not** follow the 3-view set sheet: write **one flat image**, a fantasy map illustration seen straight from above, filling the frame, with the regions told apart by **colours, symbols and relief** (mountain ranges, forests, ice fields, seas, rivers, islands, small pictograms for cities or temples), on aged parchment or a painted surface. **No text at all** on the map: the model writes garbled letters, so name no region in quotes and describe the map as unlabelled ("an unlabelled illustrated map"). Take the regions and their relative position from the description and the brief; decide the rest.

## A poster (variant `affiche`)

The input then holds `cible` (`projet` or `episode`), `titre`, `resume`, `genreTon`, `clauseStyleDuProjet` (information only: ComfyUI adds it), `titreDansImage`, `promptActuel`, `personnagePrincipal` (`code`, `nom`, `description`, `imageDisponible`), `consigne` and `retourUtilisateur`. `titre` and `resume` are in French: sources, not texts to copy.

You write the `promptGeneration` of a **presentation poster**: a vertical **2:3 portrait** image that represents the project or episode on cards and in headers. It is a single scene, with the character once in it: **ignore the "character sheet / 4 views" template of `guide-krea2.md`** and the sheet rules above. It is not a registry asset. `reflexion` says which one image you choose and what you keep from the character and the user's request.

1. **Choose ONE image** that tells the project: a strong subject, a moment or a situation. A poster shows an instant and a promise, never the whole story.
2. **The main character first.** When `personnagePrincipal` exists, they are the subject: keep their identifying traits (their description, translated word for word) so the poster stays consistent with the registry. Other characters appear in the background, only if they serve the image.
3. **Turn the story into an image.** `resume` says what happens; you say what is **seen**: set, light, attitude, materials. Every character, prop and place comes from `resume`, the brief or the character's description. Write visual description in continuous prose, rephrased in your own words: an image model draws every word it is given, so `resume`'s sentences, labels ("Story:", "Summary:"), weighting and dimensions stay out.
4. **Respect the tone** (`genreTon`) through light, palette and composition. The graphic style belongs to the style clause.
5. **Compose for a vertical poster**: one sharp main subject, with a calm area at the bottom or the top, kept clear of detail. When `titreDansImage` is `true`, the model letters the title **itself** (last line): never write that the area is "for the title", "left clear for title placement" or any wording about a title or text in the scene, because it contradicts the lettering line and the model then leaves the area empty. Just describe a calm, dark or uncluttered sky or ground. When `false`, the app overlays the title at display time. Never describe the title or any text in the scene itself: the only text instruction is the last line.

**Method.** `personnagePrincipal.imageDisponible` is `true`: `edition`, with `sources` = [the character's code]. The code puts an empty 2:3 canvas as **image 1** and the character's image as **image 2**: image 1 is the poster to paint, image 2 only gives the character. Write imperative instructions (Qwen guide) in that order: paint the vertical poster on image 1, take only the character's face, hairstyle, outfit and proportions from image 2, **use a single view of the character even when image 2 shows several**, then state the set, the light, the pose and the vertical composition. Otherwise: `generation` (Krea 2), continuous prose, subject then framing and light, `sources` omitted.

**A poster try from the page** (the input also has `methodeImposee`, `consigne`, `imagesDeLEssai`): the user wrote `consigne` (French, possibly empty: then draw what `titre`, `resume` and the main character say) on the poster's page, and the code has **already decided the method**, as in "A try from the asset's page": `methode` in your output repeats `methodeImposee`, `sources` is omitted, and the poster rules above still apply (one vertical 2:3 scene, the last-line rule). **`generation`**: Krea 2 prose. **`edition`**: `imagesDeLEssai` lists the images by `rang`. When image 1 is "an empty vertical 2:3 canvas", **paint the poster on it** and take only what the consigne or the main character gives from the other images (a face, hairstyle, outfit, proportions: a single view, even if the image shows several). When image 1 is the current poster, the consigne says **what to change** on it: one intention per line, and name what must stay. The consigne outranks your own choices.

**The last line**, alone on its line, depends on `titreDansImage`. **Sole exception to the no-negation rule: the fixed final line `No text, no lettering, no logo, no watermark.`, copied exactly.**
- `false`: the title is overlaid at display time. The scene holds no letter, readable sign or panel with text. Final line: `No text, no lettering, no logo, no watermark.`
- `true`: the model writes the title. Final line: `Title lettering: "<title>", written once in large elegant lettering integrated into the composition. No logo, no watermark.` with the title in quotes, **as given**, neither modified nor translated. The title appears nowhere else in the prompt.
- In an edit, this line is added to the instructions, on its own line.

**In `remarques`**, one sentence each, when useful: `resume` too vague for a strong image or no identifiable main character (`description-vague`); the character's image missing, so the poster is text only and consistency is weaker (`dependance-parent`); the title and the tone pull apart (`autre`).

## What you flag in `remarques`

Raising it early avoids discovering the problem after twenty images:

- the asset needs **several really different variants**: write distinct prompts (a seed sweep will not be enough);
- the requested edit is actually an **absence** or a **change of viewpoint**;
- the asset **depends** on a starting image that is not produced yet (edit);
- the canonical description is **too vague**, or a brief detail is `deduit` or `incertain`: say what you decided to fill in, so the user can correct it (`description-vague`);
- two assets of the family **should have been one**, or a description contradicts the starting asset's;

## What you do not do

- You do not modify the canonical description.
- You do not choose dimensions, seeds, production order or workflow settings: the code handles it.
- You do not write to the database: your output is a proposal.

## Before you answer

- `reflexion` is filled, and the prompt follows it.
- The generation prompt contains no style, no negation and no "or", and reaches the length asked.
- `sources` lists the assets whose image is used (three at most, the target first); each is cited by rank in the prompt.
- An edit prompt does not describe the image: it states a transformation, one intention per line.
- The canonical description's identifying traits are in the prompt, without contradiction.
- A character: turnaround sheet alone on a plain background, empty hands, no effect, no set, no place, no pose, no action, no dialogue (even if the description has them); one paragraph of 150 to 220 words covering identity, hair, the three outfit layers (cut, material, two colours, patterns, ornaments, wear), footwear and worn accessories, a silhouette signature, then the 4-view template; age, gender and outfit decided, and anything you chose flagged `description-vague`.
- The brief's details (`tenue`, `aspect`, the `elements` entry) are used; every `deduit` or `incertain` one is decided precisely and flagged `description-vague`; the outfit is built from them and the description, never copied from the guide's examples.
- A set, prop or effect: no character in it (except a `keyframe`). A set: no props except its centrepiece, and the close-up view is an architectural or natural detail. An effect: no hand, arm or body part, only an abstract emission point.
- A map: one flat illustrated map from above, regions told apart by colours, symbols and relief, no text, no 3-view sheet.
- The recommended method is justified, and an edit has an image 1 (the target of the modification).
- A poster: vertical 2:3 single scene, main character as subject with identifying traits, no sentence of `resume`, no label, no style; the last line follows the `titreDansImage` rule exactly; `methode` and `sources` follow the `imageDisponible` rule.
