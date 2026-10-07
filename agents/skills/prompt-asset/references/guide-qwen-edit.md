<!-- variantes: image, edition -->
# Qwen Image Edit 2511 — prompting an edit

> Grammar taken from the `assets-comfyui` skill (real production) and the model's official page: [ComfyUI, Qwen-Image-Edit-2511](https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511). The official docs give no prompt instruction; everything below comes from our practice `[project]`. The edit workflow is `workflows/image-refs/IMG_Simple_Edit.json` (up to three images: the first is the target of the modification).

## The principle

**Imperative instructions, not descriptions.** Do not redescribe the image: state the transformation. Image 1 is what gets modified (by default the asset's **starting image**). Images 2 and 3, if any, are references: cite them by rank ("image 2").

1. **One intention per instruction.** Stacking five modifications in one sentence gives an average result on all five.
2. **Name what must not move** when it is structural: "Preserve her exact facial identity, ruby-red eye color, tan skin tone".
3. **Several passes rather than all at once**, each starting from the previous output. One instruction per line.
4. English, like everything else.

With several images, say what role each plays: "Change the leather of the sofa in image 1 to the fur material shown in image 2." (example from the official workflow template). A reference image gives a material, a style or a subject; it does not move the camera.

Validated example:

```text
Crop tightly onto the woman's face, filling the frame with her eyes and upper face.
Preserve her exact facial identity, ruby-red eye color, tan skin tone, and loose hair strands falling across her cheek.
Sharpen focus on the eyes, add subtle catching highlights as if from nearby firelight.
```

## When NOT to edit (use generation)

Editing preserves the source image's structure. It fails in these three cases:

1. **The goal is an absence.** Removing a structural element (erasing the fingers of a hand, taking a silhouette out of a set) means fighting its main function: the model renders the element however many tries you make. Generate a concept the model already owns instead (a bridge rather than a palm without fingers, a wall rather than a set emptied of its character).
2. **The goal is to change the viewpoint.** Stepping back, going up, turning from front to three-quarter: these are geometric operations, not retouches. The model pastes an element over the existing image (a hill in the foreground, with nothing recomputed). Two views of the same place are **two generations**.
3. **The asset is a distinct element**, not another framing of the same subject: a visual effect (flames, lightning), a prop, a separate piece. It is generated from scratch, even if it has a proposed starting image. That link does not say how it is made.

What remains good for an edit: a blur, a light shift, a season, an element added or removed **within the image's plane**; a tight framing or a detail cropped from the master (the eyes, the hand, the blade).

## Official workflow settings

The repo's workflow (`IMG_Simple_Edit.json`) enables the Lightning LoRA by default: 4 steps, CFG 1, `euler` / `simple` sampler (without it: 40 steps, CFG 4). It accepts up to **three images**. These settings never go into a prompt.
