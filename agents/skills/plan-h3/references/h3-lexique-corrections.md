# H3 / Hailuo 3 corrections lexicon

> Every line cost a render. Source: real production of "Les Yeux de Rubis", episode 1.
> Format: **symptom → cause → wording that holds** · plan where observed.
> This file grows with each proven correction (see Step 7 of the chat skill `.claude/skills/fiche-de-plan`). Never add an untested hypothesis.

## §1 — Cutting and cadence

- **Intense action written in 1–2 shots → flat edit, fear or energy unreadable.** Cut cadence must follow intensity, not duration. Panicked run: one `[Shot]` every 1.5–2 s, distinct angles (eye level, ground, canted front, rear high-angle, high wide, low-angle). Far more dynamic and readable than a single take · SHOT 23 (plan 310).
- **Shot under ~1.5 s → H3 ignores the raw timecode and stretches or smooths the plan.** Spread durations with explicit per-shot instructions and stay at 1.5 s minimum · plan 110.
- **Multi-beat description without `Hard cut` or distinct angles → one smoothed movement.** Each shot: `Hard cut`, timecode, its own angle · plans 110, 125.
- **Deliberate continuous gesture: do not cut it.** The slap in one movement (plans 240+250+260) and the landing after the jump (140+150) hold by continuity; note them as such.
- **Calm by contrast.** The listening plans (330 to 360) only hold because the run before them cuts fast. Write in pairs: fast cadence during tension, slow cadence for the release and the final rhyme.
- **Prey / predator camera grammar.** Prey: shoulder cam, canted, low angles, short cuts, a crowd you crash into. Predator: locked camera, symmetrical frame, steady stride, a crowd that parts · plans 310 vs 370.

## §2 — Light and end state

- **Light drop described globally → the whole image goes to black.** Describe exposure as constant between two dated events, and have a visible gesture carry each change · plan 30.
- **Light match between two internal `[Shot]`s → does not hold.** Describe the end state of the first and the start state of the second separately, or remove the cut · plan 30.
- **A `<Picture N>` is not a first frame.** An image showing a state to be reached must be declared as an end state, otherwise the model places it at the opening and skips the build-up.

## §3 — Negative instructions

- **A negative instruction produces what it forbids.** Always rephrase as the wanted state. Example: the word `empty` in an end-of-plan description is enough to empty the room · plan 30.
- **Do not write "dagger not visible".** Write what is visible: "fingers settle on the leather strap" · SHOT 24.

## §4 — Camera and close-ups

- **A mention of walking or travel in an extreme close-up makes the background scroll behind the character.** Describe the camera as locked and the background as still whenever a plan is meant to be static · plans 320, 330, 340.
- **Push-in or dolly on a reveal → the model "rushes" the subject.** Forbid the movement on reveals by describing a held camera, then a clean pan · plan 110.
- **Precision vocabulary freezes a character** (`planted`, `isolated`, `square`, `exact`, `contained`): avoid it on any moving character.

## §5 — Crowd, extras, sets

- **Far extras smear at low resolution.** Prefer framings where the front row is large in the image, or a close balcony view rather than a distant wide shot · SHOT 23.
- **A set reference without extras cannot be declared as an end state: the model empties the plan of its characters.** Describe the final state in text, and convey the extras' presence through what the light reveals (silhouettes cut out against a lit area) · plan 30, SHOT 23b.
- **A populated set and an empty set are two assets.** A populated reference populates plans that should be empty: create a derivative of the master rather than overwrite it · bazaar alleys.

## §6 — Voice and durations

- **A line that is too long cannot be fixed in editing.** Measure the voice takes' durations before writing the plan, and split if the total exceeds the H3 ceiling (case 270 → 271/274/277).
- **Cuts of a dialogue plan: fit them to the real takes, never the reverse.** Place the cut on a meaning boundary (just before the key sentence) · SHOT 25.
