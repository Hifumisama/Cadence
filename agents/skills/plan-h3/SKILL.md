---
name: plan-h3
description: Write the draft of ONE shot-plan for MiniMax H3 (Hailuo 3), full-reference mode, as a JSON draft that the code assembles into the final video prompt.
metadata:
  language: instructions in English; output language per field (see "Output language")
---

# plan-h3 — write the video prompt of one plan

You write **one plan** for MiniMax H3 (Hailuo 3), full-reference mode, 24 fps. You return a **JSON draft**; the code assembles the final prompt. This file says who does what, then the writing rules.

## Output language

- **French** (the user reads it): `titre`, `references[].role`, `assetsManquants[].description`, `assetsManquants[].raison`, `notes`.
- **English** (it goes to the video model): `references[].nom`, `references[].definition`, `references[].retentionNote`, `summary`, `ouverture`, `shots[].texte`, `overall_soundscape`, `non_diegetic_music`.
- **Dialogues keep their own language**: inside `<d>[Français] …</d>`, verbatim. Never translate a line.
- Inputs (brief, registry descriptions, instruction) may be in French. Read them, write the English fields yourself.
- Never change asset codes, enum values or JSON keys.

## What you receive

The application assembles the context. Nothing is guessed.

- **Brief**: visual style (the style clause), arc, characters and places.
- **Episode and scene**: episode summary; scene title and function, with the intention of **all its plans** in order (`cePlan` marks yours). Read neighbouring intentions to know **who** does what: a character's gesture may be named only in the next plan.
- **What to write**: the plan's one-line intention and its position in the scene.
- **Neighbouring plans** (before and after), for continuity: title, intention and duration of each.
- **Scene genre and mood** (`scene.genre`, `scene.ambiance`) when present. The genre loaded the matching writing guide (`guide-genre-…`, in this prompt). The mood (time of day, weather, general light) is the frame **every plan of the scene holds**.
- **Registry**: for each candidate asset: code, type, canonical description (French), method, **generation prompt** (English), `aUnFichier` (the image or sound already exists). These keep you faithful to the asset; the asset's role in THIS plan is yours to write. An asset without a file is still referenced: it will be produced.
- **`assetsProposesParLeLot`** (sometimes): assets that other plans of the same batch already propose to create. They do not exist yet: **they are not references**, and you do not redeclare them in `assetsManquants`. If your plan needs one, describe it in prose.
- **Lines of dialogue** linked to this plan: uuid, speaker, exact text, measured duration if the take exists.
- **Examples**: four complete drafts, for the form only.
- **The user's instruction** (`consigne`): an intention for this plan (or all plans of a batch). Follow it without rewriting the story. On a retry, their **feedback** (`retourUtilisateur`) and sometimes your previous draft (`propositionPrecedente`): fix what the feedback targets, keep the rest.

## What the code does for you

- It assigns **all labels** and numbers. You never write a numbered label, shot number, timecode or "Hard cut".
- It replaces each `[[CODE]]` with the reference's label, writes the definition and retention lines (with the shots where each reference appears), and adds the `summary` prefix, `[Shot N]`, `At MM:SS.mmm,` and `Hard cut to`.
- It derives the **voice** audio references from `repliques` and enforces the limits: 6 images, 3 audio, **voice wins over sound effects**.
- It checks verbatim dialogue, durations and shot structure.

## What you write

The output contract is `assets/sortie.schema.json`. Each example is a complete draft **as you must return it**. In short:

- **`references`**: the plan's assets, in the order you want: characters, extras, props and effects, then set. Per item: `asset` (registry code), `nature`, `role` (French), `nom` and `definition` (English). Your order is the label order.
  - `nature: "image"`: the asset is cited by its image (character, extra, prop, effect, set).
  - `nature: "son"`: a registry sound effect (`SFX_…`), cited as an audio reference.
  - **A voice is never a reference**: it comes from `repliques`.
  - **Anything that needs no reference goes in prose** in the shots, without a marker: the video model interprets it. An asset missing from the registry is not a reference: declare it in `assetsManquants` and describe it in prose.
- **One marker only** to point at a reference: its code in double brackets, `[[CHAR_maya]]`. Never write `<Subject 1>`, `<Picture 1>` or `{picture}`.
- **`summary`**, **`ouverture`**, **`shots`**, **`overall_soundscape`**, **`non_diegetic_music`**: each in its own field, without repeating the field name.
- **`repliques`**, **`assetsManquants`**, **`notes`**, **`titre`**, **`dureeSecondes`**.

`references/guide-h3-compact.md` gives the form of each field; the rules below say what to write.

**Examples show the form, never the content.** Do not copy any sentence from an example (set description, soundscape, music). Write this plan's own from its intention and the registry.

## Writing rules

### 1. Assets

1. **The registry is completed before the plans** (asset inventory over all plans). The prop, set state or effect you need almost always exists, **sometimes under another name** (the oil lamp is `PROP_lanterne`). **Search the registry first**, descriptions as well as codes. Declare a missing asset only as a last resort, when nothing existing can play the role: every extra asset is a duplicate to clean up.
2. Use only **existing registry codes** in `references`. Never invent one. A missing asset goes in `assetsManquants` (proposed code, type, optional starting image `parent`, French description, reason) and is described in prose.
3. A **composite reference** (type `keyframe`: character, effect and prop combined in one pose) is a reference like any other, but H3 follows it closely. Cite it only if the plan wants exactly that pose, and never in addition to the individual assets it combines. If it is missing and truly needed, declare it in `assetsManquants` (type `keyframe`) and list the elements to combine in `raison` (three source images at most).
4. **One reference = one asset, reused.** A new asset is justified only if the image must really differ: clearly different pose, detail framing that cropping cannot give, altered state.
5. **Six images at most.** Beyond that, arbitrate: keep what carries identity and framing, sacrifice what text can describe alone (it goes to prose), and say so in `notes`.
6. **One reference carries a character's face.** Several face references dilute identity.
7. **Fill free slots usefully** (set, validated detail) only if you can say why. Otherwise leave them free.
8. **An effect (`VFX_…`) is a material, not a subject.** Cited as an image, H3 treats it as content to keep and may show the reference itself as a stand-alone shot unrelated to the plan. So its `retention` is **never `fully_preserved`**: `weak_reference` (only colour, texture, motion are borrowed) or `attribute_transfer` (the effect passes onto a named subject: "golden energy on Maya's hands"). `retentionNote` says what is borrowed, where it lands **and what the reference does not own** (an effect supplies no framing or composition). In the shots, the effect is always **something a subject does or undergoes** (energy wraps her forearms), never a scene of its own; the effect's own reference, with its original framing, must not drive the composition of the plan.
9. **A populated set and an empty set are two assets.** A populated reference populates plans that should be empty. Do not take the full room for an empty-room plan.
10. **A registry asset that the shots show is a reference** (up to the six): a held weapon or prop seen up close, a set used for a whole shot. Do not drop it to shorten the text: without its image the video model draws another one (a dagger becomes a sword).

### 2. Cut into shots — cadence follows intensity

Shot count follows **action intensity, not plan duration**. The cadences below are **defaults**: a longer shot is allowed, even in a fast edit, when the choice is explicit and justified in `notes` (or in the shot's text through a camera that moves inside it).

| Action | Cadence | Camera |
|---|---|---|
| **Intense**: run, flight, fall, panic | one shot every **1.5–2 s** by default | mobile, varied angles (ground, high-angle, canted, high wide, insert) |
| **Fight between characters** | one shot every **2.5–4 s**, each holding a linked exchange | the camera moves **inside** the shot (tracking, pan, push-in, arc) for the dynamism; the cut falls before or after a contact, never on it, with both fighters in frame |
| **Moderate**: determined walk, exchange, transition | one shot every **2–3 s** | simple movements, alternating shot sizes |
| **Calm or held tension**: listening, waiting, reaction | one shot every **2.5–4 s**, or a single held shot | locked, symmetrical, eye level |

1. **Aim for at least 1.5 s per shot** (strong advice): below it, H3 often stretches or smooths. Go below only for a deliberate effect (a flash-cut in intense action) and say so in `notes`.
2. Each shot after the first is a hard cut **with a distinct camera angle**. Without it, H3 renders one smoothed movement. You give `debutSecondes`; the code writes the marker, timecode and `Hard cut to`. Your text starts directly with the framing ("a low-angle shot of…").
3. **First shot at `0`**, strictly increasing starts; the last shot should also last at least 1.5 s before the end of the plan.
4. **Deliberate continuous gesture**: when continuity of the gesture is the effect (a slap in one movement), the gesture itself stays inside one shot and is not cut; cuts may frame what comes before or after it. Say so in `notes`.
5. **Cadence tells the character's state by contrast.** A character in danger is filmed as prey (shoulder cam, canted, low angles, short cuts); the same character taking control, as a predator (locked camera, symmetrical frame, long cuts). Calm only has weight after fast: think of plans in pairs with their neighbours.
6. **A cut must bring something new**: a subject, a space, a state or a viewpoint. A cut that reveals none is replaced by a camera movement inside the shot. Every cut is a junction where the end of one movement and the start of the next must match: **each shot starts by picking up the last gesture of the previous one** (the flames hit the stone, then the next shot opens on the slab cracking under them). Render bench: 8 shots cut at the contact with one fighter in frame mismatched; 4 shots and 6 shots that each pick the gesture up matched.
7. **Spread fear or urgency signals across the cuts** (look over the shoulder, uneven stride, hand slapping a wall, visible breath). One readable signal per shot is enough.

### 3. Write what can be seen

1. **English body.** Only dialogues (inside `<d>`) and on-screen text keep their language.
2. **Every detail is visible or audible.** An intention cannot be prompted. "The first decision we see her make" means nothing to the model; "her walk stops, her head turns slowly" does. Turn each intention into an observable event.
3. **Never phrase an instruction as a negation** (the only exception is the short closing line of §6). "No crowd" makes a crowd appear. Describe the wanted state: "the corridor is empty" becomes "indigo light falls on a bare floor". (The word `empty` in an end-of-plan description is enough to empty the room.)
4. **Camera movement is a natural action in the sentence** (`the camera pushes in slowly`), not a label.
5. **Editing vocabulary, French → English**: travelling avant = `push in`, panoramique = `pan`, contre-plongée = `low-angle`, plan d'ensemble = `wide shot`, gros plan = `close-up`, caméra fixe = `static shot`.
6. **A reference image is not a first frame.** An image showing an **end state** (final pose, already transformed set) must be declared as such in `definition`, otherwise the model places it at the opening and skips the build-up. A set image holds no characters: declared as an end state, it clears the plan of them. Describe the final state in text and show the extras through what the light reveals (silhouettes cut out against a lit area).
7. **When two or more subjects are in the frame, every sentence names its subject** (`[[CODE]]`, or its role noun in `ouverture`). Each action carries its named subject ("[[CHAR_a]] grips [[CHAR_b]]'s wrist").
8. **Precision vocabulary freezes a character** (`planted`, `isolated`, `square`, `exact`, `contained`). Reserve it for a character who stays still.
9. **Static shot or close-up: say the camera is locked and the background stays still.** Any mention of walking makes the background scroll behind the character.
10. **Reveal: held camera, then a clean pan.** A push-in or a dolly makes the model rush the subject.
11. **Light**: describe exposure as constant between two dated events, and have a visible gesture carry each change. Across two internal shots, describe the end state of the first and the start state of the second.
12. **Distant crowd**: far extras smear. Frame with the front row large in the image.
13. **Sound**:
    - Sound **tied to an action** (impact, contact, footsteps, an object falling, a door) is written in the text of the shot where it happens, at that very moment.
    - **Background sound** (distant metallic noise, crowd murmur, wind, room tone) goes in `overall_soundscape`.
    - Music only the audience hears goes in `non_diegetic_music`, by instrumentation, tempo and dynamics.
    - A registry sound effect is added as a `son` reference; otherwise describe it in prose.

### 4. Dialogue

1. Each line linked to the plan is quoted **word for word**, punctuation included, in a `<d>[Français] …</d>` of one of the `shots`, with a speaker `(Sx)`, and listed in `repliques`. Each `<d>` matches a linked line and vice versa. This holds for characters and voice-over alike; the code blocks generation otherwise.
2. **Never rephrase or translate a line.** If it seems wrong, say so in `notes`: the text is edited in the line itself, not in the prompt.
3. **Breathing margin of at least 2 s in total**, split between before the first syllable and after the last (time to settle the gaze). A 14 s line in a 15 s plan does not breathe.
4. **Duration of a dialogue plan**: if the takes exist, sum of measured durations plus the margin. Otherwise pick a generous duration; it will grow after the voice take. **Never compute a duration from a word count.**
5. If voice and margin exceed 15 s, do not force it. Propose in `notes` a split at a meaning boundary, between two lines, never mid-line, with an angle change (for example the listener's reaction).
6. Lip-sync comes from the voice take, which the code plugs in as an audio reference. You write `<d>`: it makes the mouth move on the right phrasing.
7. When a line crosses a cut or is truncated by the end of the video, use `<scenetrans>` and `<cutoff>` (see the guide).

### 5. Continuity

1. **The scene mood is held.** If `scene.ambiance` is given, `ouverture` and the shots respect it (time of day, weather, light). Do not invent another light per plan. A mood change is allowed only if the plan's intention says so, and it plays out through a visible gesture.
2. **A character only heard is not an image reference.** A voice-over or off-screen narrator is written `(Sx)` and takes none of the six image slots.
3. **Gestures come from the brief**: a character with a `gestuelle` keeps it from plan to plan.
4. Take the brief's distinctive traits (characters, places, palette) and apply them without commenting on them.
5. Two plans that must answer each other visually share the same asset or a derivative. Do not make two images that should be the same.
6. Match the neighbouring plans from their title and intention: what they say happens holds in your plan (who is where, what just occurred, what comes next). Every continuity detail comes from those texts.
7. **Two or more characters acting together: fix the sides in `ouverture`**, in one sentence (who is on the left of the frame, who on the right, facing which way). Keep it in every side-on, low or two-person shot; change it only through a stated move, and then say where each character ends.
8. **Cut on the movement.** The next shot picks the gesture up mid-motion, with **both** characters in the frame at the moment of contact. Never cut to a single character on the instant of a blow: the contact is never seen.
9. **Say where everyone is after each cut**, in one real space: a broken wall opens onto a named adjoining room, a thrown object ends somewhere visible.

### 6. Length

The assembled prompt (definitions, summary, retention, shots, sound, music) stays **under 7,000 characters**: past about 12,000 characters a 15 s fight was the least readable, and a very short one invents what it does not say. Spend the budget on **what is seen and done**: for each blow, who strikes, with which limb or weapon, what it touches and what moves in reaction. Adjectives and moods ("frantic", "chaotic", "a whirlwind of fabric") are not actions. At a subject's first appearance, a shot gives its place in the frame and its action, plus **at most one identifying trait**; the reference `definition` carries the rest of the identity. A dialogue plan favours covering the whole spoken timeline over length.

**Closing line.** After the last shot, one short sentence of constraints is allowed to protect identity and count, never behaviour or content: "Exactly two fighters; no identity drift or left-right reversal; no text." (Render tests J to M used it and held.) Everything else stays phrased as the wanted state (§3.3).

## Retention: choose the lightest level that fits

`fully_preserved` is for what must be recognisable (a character, a set, a prop). New actions, movements or events in the plan are **not** a loss of fidelity: a running or crying character is still `fully_preserved`. Use `partially_preserved` only when a defined trait really changes (a costume torn, a set altered), `attribute_transfer` when a trait passes to another subject, `weak_reference` when only the general look is borrowed (always the case for an effect, see assets rule 8). A sound reference is `reference` by default: the character of the sound is reused, the signal is not copied.

## Before you answer

- Every cited `[[CODE]]` is in `references`, and every reference is cited at least once. No numbered label, no `{picture}`.
- Every `<d>` is verbatim; all linked lines are cited and listed in `repliques`.
- First shot at `0`, increasing starts, a distinct angle per shot; a shot shorter than 1.5 s, or a cadence slower than the defaults of section 2, carries its reason in `notes`; no timecode, no `Hard cut`, no `[Shot N]` in the texts.
- Sounds tied to an action sit in the shot's text; only background sound sits in `overall_soundscape`; `non_diegetic_music` is instrumentation, tempo and dynamics, or `N/A` alone.
- Two or more characters acting together: the sides are fixed in `ouverture`, each cut picks the movement up with both in frame at contact, and a fight shot holds a readable exchange, not an isolated blow smeared with five actions.
- The assembled prompt stays under 7,000 characters; each blow is described concretely (who, which limb or weapon, what it touches, what moves).
- Each `definition` reads "visible traits from the registry, then a static state" (`in her deep-red costume, ruby eyes, breathless`): the action verbs (`lunging`, `advancing`, `running`) go in the shots.
- `nature: "son"` only for a sound effect (`SFX_…`); a voice is not a reference.
- Every behaviour is phrased as the wanted state; precision vocabulary only on a character who stays still.
- English body, dialogues in their own language; French only in `titre`, `role`, `description`, `raison`, `notes`.
- `dureeSecondes` is an integer from **5** to 15; a dialogue plan keeps 2 s of margin in total.
