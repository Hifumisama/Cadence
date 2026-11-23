<!-- variantes: image, generation, affiche -->
# MiniMax H3 Image — prompting an image generated from scratch

> Sources. **Official**: the caption-expansion instructions shipped with the model's ComfyUI template (the "prompt enhancer" of `MiniMax H3 Image`, text-to-image; we do not run it, its rules are taken here) and the node's description in ComfyUI (`MiniMaxH3ImageConditioning`). Every rule below is tagged `[official]` (from those instructions) or `[project]` (our workflow, our registry, our renders). The edit has its own guide (`guide-h3-image-edition.md`): same model, another prompt grammar.

## The model

- **One model for generation and edit** (MiniMax H3 Image, open weights). Our workflow (`IMG_01_TextToImage.json`): 6 steps, CFG 1, `euler` / `simple`, a zeroed negative (`ConditioningZeroOut`). `[project]`
- **No negative prompt.** "no X" cannot be obtained: describe what you want to see. `[project]`
- **Qwen3-VL text encoder**: it reads sentences, not tag lists. `[official]`
- **The model draws at 16 MP** and the workflow scales the result down before saving; it chooses the format (`ResolutionSelector`): 16:9 by default for a set or a character sheet, square for an effect or a detail, 2:3 for a poster. **The prompt never sets dimensions nor an aspect ratio.** `[project]`
- **No prompt enhancer.** The template has one (an LLM rewrites the prompt before drawing); we removed it: the prompt comes from you, to stay reproducible and fast. Its rules are below. `[project]`

## Writing the prompt

1. **One paragraph of natural, continuous English prose.** Not a list of tags. `[official]`
2. **Preserve every hard fact**: exact text, names, counts, colours, materials, left/right/top/bottom order. Then complete the image with **visible, inspectable content**: the goal is not more words, it is that every important part of the image has something concrete to show. `[official]`
3. **Required content must be visible, not implied.** Replace abstract mood and generic adjectives by specific visible cues (the light's direction, a material's wear, a colour named precisely). `[official]`
4. **Text in the image**: put the exact words in double quotes and say **where** they sit and in what lettering ("across the top, the word "MINIMAX" in thick felted cream letters"). H3 letters text cleanly; never invent text the request does not ask for. `[official, project]`
5. **Respect the subject count**: one primary subject stays one; background figures read as small silhouettes, not competing subjects. `[official]`
6. **A body in action: orientation relative to the camera, said explicitly**: front-facing, back-facing, left- or right-facing profile, front or rear three-quarter, and the direction of motion in the frame (leftward, toward the camera). Gaze, torso, leading limb and support foot agree with it, in one frozen instant. `[official]` (Posters and scenes; a character sheet has a neutral standing pose.)
7. **Hands and contact**: say which hand touches what, and keep the hands empty unless the request names a held object. `[official]`
8. **Use world knowledge as visible evidence only**: costume, architecture, tools, materials; no lore that cannot be seen. `[official]`
9. **Subject only, no style.** The project's style is added by ComfyUI after your prompt (style clause): never repeat it, never name a medium the clause already sets. `[project]`
10. **Complete what the description leaves out with a precise choice**; never contradict it; add no separate object or character. `[project]`
11. **An already detailed prompt is polished, not rewritten.** `[project]`

## Project templates

- **Character sheet** (a single description block, then the layout instruction; **the layout sentence is appended by the code**, `lib/assets/sheet-templates.ts`: the skill writes only the description) `[project]`:

  ```text
  [character description], neutral standing pose, plain light background, character has 4 views : front full-body view, body side view, body back view, detailed single headshot portrait on the right side of the image, in the foreground.
  ```

  The sheet shows the character **alone**, **empty hands**, with no effect, set or action pose: it serves as an identity reference, not as a scene illustration. A place, a pose, an action or a line of dialogue found in the canonical description is **left out** (the turnaround on a plain background wins over the description). `[project]`

  The description block is **one paragraph of 150 to 220 words**, in this order: identity (age, build, face), hair, the outfit in three layers (under layer, main garment, outer layer: cut, material, dominant and secondary colour, patterns, ornaments, wear), footwear and worn accessories, one silhouette signature. A short character prompt gives a plain, interchangeable costume that the video model then simplifies further. `[project]`

  The outfit part follows this pattern, every bracket filled with a precise choice taken from the brief's `tenue` and the description (what they leave out, you decide):

  ```text
  ... [under layer: cut, material, colour], [main garment: cut, material, dominant colour and secondary colour, closed by an ornament, a pattern on an edge], [outer layer: cut, material, lining or trim, one sign of wear]. [footwear], [belt and worn accessories]. [Her / His] silhouette: [one trait seen from far away]. ...
  ```

  Three short examples from three unrelated worlds, only to show the density expected. **Never reuse their garments, materials or colours**: they belong to no project.

  ```text
  City courier: a ribbed charcoal knit undershirt, a hip-length mustard canvas work jacket with brass snaps and reflective grey piping, a cropped oxblood rain cape whose seams are peeling; scuffed high-top boots, a cross-body webbing strap with a flat pouch. His silhouette: the cape's stiff pointed hood.
  Court elder: a high-necked under-robe of pale raw silk, an ankle-length ochre brocade robe with cinnabar cloud borders fastened by green stone toggles, a heavy black felt mantle with a frayed hem; soft felt slippers, a string of amber beads at the wrist. Her silhouette: the mantle's wide square shoulders.
  Station mechanic: a fitted slate-blue thermal bodysuit, olive quilted coveralls with orange hazard stitching and a dented steel chest plate, a sleeveless padded vest with one mismatched patch; magnetic-soled boots, a worn leather tool belt, fingerless gloves. Her silhouette: the oversized ribbed collar ring.
  ```

- **Set sheet** (one image, three views of the SAME deserted place; **the views sentence is appended by the code with a fixed layout** (wide view across the top half, reverse view bottom left, detail bottom right), `lib/assets/sheet-templates.ts`: the skill writes the description and ends with `Close-up detail of <landmark>.`) `[project]`:

  ```text
  [set description], deserted and still, even daylight [the set's fixed light sentence], the place has 3 views : wide establishing view at eye level, reverse view from the opposite side, close-up detail of [one landmark of the place].
  ```

  Why: a reference-to-video model can only reproduce a place's layout if it has seen it; one view says nothing about what is behind the camera. The sheet shows **the place alone** (no character, no action, no top-down map or floor plan: the video model would copy the bird's-eye view). **No props or loose objects** either, even when the description lists them: only the architecture or terrain and what is the place's centrepiece (a flying whale above a village: yes; an ice board on a wave: no); an object in the set image is copied into every shot. The **landmark of the close-up view** is architectural or natural (a carved lintel, a cracked ice wall, a gnarled root, a stone stair), never a prop. `[project]` The light sentence is the same in every prompt of the set and its states (the reference image governs the light of the video). The three views share one inventory: the same walls, openings and materials in each, nothing in one view that the others contradict. `[official, multi-view rule]`

- **Prop**: by default descriptive prose alone, one image: a clear 3/4 view, plain background, **nothing held in a hand**, one object. A **prop mini-sheet** is for an object that carries the story AND whose shape changes with the angle, or that has an inscription or a distinctive side: `[prop description], plain light background, the object has 3 views : three-quarter view, side view, close-up detail of [the distinctive part].` Never put a prop in a character's sheet or a set's sheet: crowded references drop details. `[project]`

- **Effect**: descriptive prose alone, with no sheet instruction. The video model copies an effect image too literally, so it stays a material swatch. **Never a hand, fist, finger, arm or any body part** in the image, even when the effect comes from one in the story: the video model copies the limb into the shot. The source becomes an **abstract emission point** ("the flames burst outward from a small white-hot point at the centre of the frame"). `[project]`

- **Map of an invented world**: the only top-down image, and **not** a sheet. One flat fantasy map illustration seen straight from above, filling the frame, regions told apart by colours, symbols and relief (mountains, forests, ice, seas, rivers, islands, small pictograms for cities). **No text** (rule of the skill): describe it as "an unlabelled illustrated map" and put no name in quotes. `[project]`

  ```text
  An unlabelled illustrated fantasy map of [the world], seen straight from above and filling the frame, [regions and their position, each with its colour, symbol and relief], painted on [aged parchment / a painted surface].
  ```

## Variants and seed

Do not assume a seed sweep gives useful variants: when an asset needs **several really different variants** (poses, wear states), write distinct prompts and flag it in `remarques`. `[project]`
