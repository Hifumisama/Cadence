<!-- variantes: image, edition, affiche -->
# MiniMax H3 Image — prompting an edit

> Sources. **Official**: the instruction-enhancement rules shipped with the model's ComfyUI template (the "prompt enhancer" of `MiniMax H3 Image`, image edit; we do not run it, its rules are taken here) and the node's description (`MiniMaxH3ImageConditioning`: "The prompt refers to them as <Picture 1>, <Picture 2>, … image_1 is the picture to edit"). Every rule is tagged `[official]` or `[project]`. The edit workflow is `workflows/image-refs/IMG_Simple_Edit.json`: **up to six images**, the first is the target of the modification.

## The model and the workflow

- Same model as the generation (`guide-h3-image-generation.md`), 6 steps, CFG 1, no negative. `[project]`
- **The images are cited `<Picture 1>`, `<Picture 2>`…** in their order, written as is, without backticks. `<Picture 1>` is the image that gets modified (by default the asset's **starting image**); the others are references (a face, an outfit, a material, a place, a light). `[official]`
- **Output size**: the result follows image 1, except for a poster, which the code sets to 2:3. The prompt never sets dimensions. `[project]`
- **No style line.** The code appends the project's style clause as the last line (`Keep the result in this art style: …`): never write the style yourself, never describe the rendering medium. `[project]`

## The structure of an edit prompt

An edit prompt is **not** an imperative list, and not a description of the whole image: it is one continuous English paragraph describing **the target image** by its relation to the source pictures, in three parts, in this order. `[official]`

1. **Subjects.** Name each source element the target keeps, transforms or borrows, with its picture and a few visible cues that identify it without doubt: `The woman with a high dark ponytail and ruby-red eyes in <Picture 1> is <Subject 1>.` Name a **property** rather than a whole object when only the property is borrowed: `The brass colour of the lamp in <Picture 2> is <Subject 2>.` One Subject per element that needs its own judgement; do not split a person into face, hair and every garment when they move together. Brand-new content gets no Subject number.
2. **Overview, then one relation per Subject.** One sentence beginning with `The target image` says the result. Then each Subject gets **its own** clause, never merged with another:
   - **fully preserved**: only the short sentence `<Subject 1> is fully preserved.`, when nothing about it changes;
   - **partially preserved**: what stays (identity, face, proportions, design) and what changes (pose, expression, outfit, state), before → after when known: `<Subject 1> is partially preserved; her face, hair and proportions remain, while her outfit changes to a winter coat.`;
   - **attribute transfer**: the exact property moved onto a carrier: `<Subject 2> supplies the exact colour of the new coat.` Only that property travels;
   - **weak reference**: a quality that guides without being copied: `<Subject 3> serves as a weak reference for the palette; colours and placement may vary.`
3. **Only what changes or is new.** Describe richly and concretely the changed attributes, the new elements and their integration (contact, scale, shadow, light, perspective). **Never re-describe** a fully preserved Subject: use its bare token as an anchor (`beside <Subject 1>`). For a partially preserved one, describe only its changes.

Validated pattern (official example):

```text
The black horse in <Picture 1> is <Subject 1>. The target image shows <Subject 1> beside a newly added luminous pearl. <Subject 1> is fully preserved. The pearl emits a cool glow onto the ground beside <Subject 1>.
```

## Rules

1. **Faithful to the sources, inventive in the change.** What you say of a source picture must be visible in it (never invent an attribute, a word or an accessory); what the consigne introduces is imagined fully and concretely, inside the changed scope only. `[official]`
2. **Name what must stay** when it is structural (face, eye colour, skin tone, proportions; for a set, architecture, layout and framing): the relation clause carries it. `[official, project]`
3. **Text**: copy readable source text exactly when it matters; give the complete new wording of any changed or added text, in quotes. `[official]`
4. **A grid or several panels**: state the number of rows and columns explicitly. `[official]`
5. **An edit adds no place, pose or effect to a character sheet**, and no prop to a set, unless the consigne asks for it: the result stays a reference image (turnaround on a plain background, or the place alone). `[project]`
6. **One subject from a multi-view sheet**: when `<Picture 1>` is a character sheet (several views) and the target is a scene or a poster, say that the target shows **one single** figure instead of the multiple views. `[official example, project]`
7. English, one paragraph, no headings, no "please", no "generate". `[official]`

## When NOT to edit (use generation)

Inherited from Qwen Image Edit (2026-10), **to be re-tested on H3**, which rebuilds a whole scene around a reference better (`[project]`). Until then, the rule holds:

1. **The goal is an absence.** Removing a structural element (the fingers of a hand, a silhouette out of a set) fights the image's main function. Generate a concept the model already owns instead.
2. **The goal is to change the viewpoint** of the same place (stepping back, going up, turning to three-quarter): two views of the same place are **two generations**.
3. **The asset is a different subject or generic matter**, neither another framing nor a state of the same subject: a visual effect, a separate prop, a separate piece. (A state of a character, creature, set or prop is NOT in this case: it is edited from the master.)

What is good for an edit: a light shift, a season, an element added or removed; a **state** of the same subject (damage, transformation, older, another outfit, day or night); a tight framing or a detail of the master; a character placed into a new scene or a poster from their sheet.
