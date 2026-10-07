---
name: style-clause
description: Condense a long image-style prompt into a short style clause (one or two English sentences, rendering only) that opens every video shot description.
metadata:
  language: instructions in English; the clause is written in English
---

# style-clause — condense a style prompt into a short clause

You receive the **long style prompt** of an image style (`descriptor`, English prose written for an image model) and its name. You write the **short style clause** that will open **every video shot description** sent to a video model (MiniMax Hailuo 3), and nothing else.

The long prompt is for the image model: it makes the reference pictures (characters, sets, props). Those pictures carry the style into the video. The video model only needs a short **anchor** at the start of each description, to keep the rendering coherent from shot to shot. Your clause is that anchor.

## Output language

- The clause is **English**. It is the only field.
- The name and the descriptor are sources: never copy a name from them into the clause.

## What you receive

A JSON object:

- `nom`: the style's name (it may contain the name of an artist, a studio or a work: a source only).
- `descriptor`: the long style prompt.

If a clause is rejected, you receive the list of its problems as a new message: answer again with a corrected clause.

## What the clause is

**One or two English sentences, between 15 and 40 words**, that describe the **RENDERING** only:

- the **medium and technique** (ink, gouache, cel animation, film stock, 3D render, paper cut-out…),
- the **line** (outline weight, no outline, hatching),
- the **colour** (palette, saturation, flat or graded),
- the **light** (soft, hard, simulated, practical, backlit),
- the **texture and finish** (grain, paper tooth, gloss, matte).

Keep the **technical terms** of the descriptor (they guide the model). Keep the **distinctive traits** that tell this style apart from the others: a clause that would fit any style is useless.

## What the clause never contains

1. **No proper name**: no artist, studio, author, work, character, brand, place or person. Not even in lowercase, not even as « in the manner of ». Art movements and techniques are fine (impressionism, art nouveau, ukiyo-e, cel shading).
2. **No subject**: no character, face, body, pose, costume, animal, object, landscape or situation. The clause must work in front of ANY scene.
3. **No camera and no movement**: no framing, no lens, no « dynamic », « sweeping », « cinematic action ». The shot description handles the camera.
4. **No story, no mood sentence**: « evoking nostalgia » is acceptable only as a rendering trait (« faded, nostalgic colour »); never an event or an emotion about a scene.
5. **No instruction to the model**: no « make », « ensure », no negative (« no », « without » only for a rendering trait, such as « no drawn outlines »).

## How to write it

1. Read the descriptor and list its rendering traits (medium, line, colour, light, texture).
2. Drop everything about a subject, a name, a composition or a mood.
3. Keep the **three or four most distinctive** traits, in the order medium → line → colour → light/texture.
4. Write one fluent sentence, or two short ones. Start with an article and the style's nature: « A grainy analog-film look: … », « A flat cel-animation look: … ».
5. Check the limits: 15 to 40 words, one or two sentences, no capital letter inside a sentence except for « I » or an art-movement name.

## Before you answer

- Is there any proper name in the clause? Remove it.
- Could the clause describe a person, an animal, a place? Rewrite it as a rendering.
- Is it between 15 and 40 words, and one or two sentences?
- Is it specific to this style, or would it fit any style?
