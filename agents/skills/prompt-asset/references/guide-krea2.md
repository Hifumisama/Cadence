<!-- variantes: image, generation -->
# Krea 2 (Turbo) — prompting a master or an asset generated from scratch

> Sources. **Official**: [krea-ai/krea-2, `docs/prompting.md`](https://github.com/krea-ai/krea-2/blob/main/docs/prompting.md) and [`docs/expansion.txt`](https://github.com/krea-ai/krea-2/blob/main/docs/expansion.txt) (retrieved 2026-09-30); [ComfyUI, Krea-2 workflow](https://docs.comfy.org/tutorials/image/krea/krea-2). **Community, unofficial**: a third-party author's prompt-block guide (order framing → light → subject → set → style, word weighting, pose scheme). Every rule below is tagged `[official]`, `[community]` or `[project]` (observed on our renders, or inherited from our registry). A `[community]` rule is a lead to test, never a fact.

## The model

- **Turbo**: distilled to **8 steps**, no guidance (CFG 0 or 1). `[official]` Our workflow (`IMG_01_TextToImage.json`): 8 steps, CFG 1, `euler` / `simple`, with a `ConditioningZeroOut` on the negative. `[project]`
- **No negative prompt.** The negative is zeroed: "no X" cannot be obtained. Describe what you want to see. `[project]`, consistent with the community guide ("negations do not work reliably").
- **Qwen3-VL 4B text encoder**: it reads sentences, not labels. `[official]`
- **Resolution**: up to 2K. `[official]` The workflow chooses the format (`ResolutionSelector`: aspect ratio and megapixels): 16:9 by default for a set, a plate or a character sheet, square for an effect or a detail. `[project]` The prompt never sets dimensions.
- **"CharacterDesign" LoRA**: the workflow can enable it for a character sheet (4 views). `[project]`
- The workflow exposes a **prompt_enhance** mode (an LLM expands the prompt). We do not use it: the prompt comes from the agent, to stay reproducible. `[project]`

## Writing the prompt

1. **Natural language, continuous prose, in English.** Not a list of tags. `[official]`
2. **Long and detailed gives the best results**, but the model already holds a correct image with little. `[official]` Aim for 40 to 100 words for a simple asset, more for a rich character. `[project]`
3. **Text in the image**: wrap the words to display in quotes `"…"`. `[official]` (the "Le Voile Écarlate" sign from the registry)
4. **Subject only, no style.** The project's style is added by ComfyUI from the style clause: do not repeat it in an asset prompt. `[project]`
5. **Suggested order**: framing and light first, subject (the longest block) next, set, then style. `[community]` Each block on its own line improves coherence. `[community]` Our registry writes from subject to framing: both produced validated images, so do not rewrite a prompt that worked to respect this order. `[project]`
6. **Stay faithful to the description**: add no object, prop or character that the description does not say. `[official, expansion.txt]`
7. **A requested medium is a respected medium**: do not switch from one rendering to another to work around a difficulty. `[official, expansion.txt]`
8. **An already detailed prompt is polished, not rewritten.** `[official, expansion.txt]`
9. **Do not over-specify**: do not invent an outfit, colour or material that the input does not support. `[official, expansion.txt]`
10. **One paragraph** per prompt. `[official, expansion.txt]`

## Project templates

- **Character sheet** (a single description block, then the layout instruction) `[project]`:

  ```text
  [character description], neutral standing pose, plain light background, character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground.
  ```

  The sheet shows the character **alone**, **empty hands**, with no effect, set or action pose: it serves as an identity reference, not as a scene illustration.

- **Set, prop, effect**: descriptive prose alone, with no sheet instruction.

## Variants and seed

This guide does not document Krea 2 Turbo's seed variance. Do not assume a seed sweep gives useful variants: when an asset needs **several really different variants** (poses, wear states), write distinct prompts and flag it in `remarques`. `[project, to verify on Krea 2]`

## Weighting and pose (community, to test)

The community workflow offers word weighting `(word:1.5)` through a dedicated node and a detailed pose scheme (silhouette, weight distribution, torso orientation…). They are not part of our workflow: **do not write them** in an asset prompt until they are wired in and tested.
