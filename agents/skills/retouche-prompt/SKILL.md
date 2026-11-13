---
name: retouche-prompt
description: Edit an existing MiniMax H3 video prompt (six sections) so that it follows ONE author instruction, changing only what the instruction needs and leaving every other word untouched.
metadata:
  language: instructions in English; the prompt and its edits are English; the spoken lines keep their language
---

# retouche-prompt — a surgical edit of a video prompt that already works

The author watched a render, liked it, and wants **one thing changed** (add a spoken line, move or remove one, adjust a gesture, a camera move or a detail). The video prompt of that render is given to you. You return the **same prompt with the smallest edit that carries out the instruction**. Everything the author did not mention must come out **word for word identical**: the model that renders the video is re-sampled by any rewording, and the author loses the result they liked.

## Input

One message with these parts:

- `INSTRUCTION`: what the author asks, in French.
- `PLAN DESCRIPTION BEFORE` (optional): the French description of the plan when the render of the prompt was made. When it is present, the author edited the plan text since then: **the difference between BEFORE and NOW is what to carry into the prompt** (the INSTRUCTION may only say that the text changed).
- `PLAN DESCRIPTION NOW`: the French description of the plan after the instruction (a reference for what should be seen and heard; spoken lines appear as `Name : « text »`).
- `SPOKEN LINES REQUIRED`: the exact lines that must be spoken in the final prompt, verbatim, one per line as `Name | text` (may be empty: then no line is spoken).
- `PROMPT`: the current prompt, six sections, each introduced by its name and a colon: `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`.

## Output

- `refonte`: `false` when a local edit can carry out the instruction. `true` only when the instruction asks to rebuild the plan (a different action, a different location, a new story beat, many shots changed) so that no local edit would honour it. In that case put a short `raison` and leave `sections` empty strings.
- `sections`: the six sections, complete. A section you did not need to touch is copied **exactly** as given, character for character.
- `modifications`: one short French sentence per edit you made (what changed, in which section). It is shown to the author.

## Rules

1. **Minimal edit.** Change the fewest words that carry out the instruction. Never reword, reorder, "improve" or shorten a sentence that the instruction does not concern. Never change the style sentence, the lighting, the subject descriptions, the camera of a shot you were not asked to touch.
2. **Labels are fixed.** Keep every `<Subject N>` and `<Picture N>` exactly as in the prompt. Do not add, remove, renumber or merge them. `subject_definitions` and `retention_analysis` are copied unchanged unless the instruction is about a character's or an object's look.
3. **Speech.** A spoken line is written inside `<d>...</d>` with the language between square brackets first, for example `<d>[French] Venez.</d>`. Use the language tag already used by the other lines of the prompt, or the one shown in the required lines when the prompt has none (French is written `[French]`). A line is copied **verbatim from `SPOKEN LINES REQUIRED`**: same words, same punctuation, same case, never translated, never completed, never paraphrased. Each required line appears **once** and only once in the whole prompt. A line that is in the prompt but not in the required list is removed, together with the words that introduced it (its sentence), and nothing else.
4. **Who speaks and when.** Introduce a new line the way the prompt already introduces speech if it does (same pattern, same person naming). A voice-over is not on screen: write it as a voice heard, for example `the narrator's voice is heard in voice-over, <d>[French] ...</d>`, and place it in the shot and at the moment the instruction names (« en fin de plan », « quand le caractère apparaît »). When the instruction gives no moment, put it in the last shot. If the prompt has timestamps, keep them and do not move any.
5. **Do not spend time you do not have.** A short line fits a short moment; do not lengthen the plan or add a shot. If a required line cannot be placed without rebuilding the shots, answer `refonte: true`.
6. **Sound sections.** `overall_soundscape` and `non_diegetic_music` change only when the instruction is about sound or music.
7. **English prose, no commentary.** Edits you write are in English (the language of the prompt), apart from spoken lines, which keep their own language. No straight double quote `"` in the prose (it would be read as text to show on screen); use none.
8. **Text changed since the render.** With a BEFORE description, find what differs from NOW (an action, a gesture, a detail, a spoken line, a camera idea) and edit only the matching passages of the prompt. If the difference is deep (a different action, place or story beat, most of the text rewritten), answer `refonte: true`.
9. **No invention.** Do not add actions, objects, effects or camera moves that neither the instruction nor the text difference asks for.

## Before you answer

- Every section you did not need to change is identical to the input.
- Labels (`<Subject N>`, `<Picture N>`) are the same set as in the input.
- Every required line appears exactly once, verbatim, in a `<d>` block; no other spoken line remains.
- You changed the smallest number of words that carry out the instruction, and `modifications` lists them.
