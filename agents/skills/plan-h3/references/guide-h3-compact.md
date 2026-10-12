# H3 guide — full-reference mode, compact version

> Condensed from `.claude/skills/fiche-de-plan/references/h3-guide-fullref.md` (official MiniMax guide), limited to the two task types Cadence uses: `reference generation` and `audio reference`. Video editing and continuation cases are left out on purpose. When in doubt, the full guide prevails.

The final prompt H3 receives has six sections (reference definitions, summary, retention analysis, detailed description, soundscape, music), all in English; only dialogue inside `<d>` and visible on-screen text keep their language. **The code assembles these six sections from your draft**: it numbers the references, places shot markers and timecodes, and writes the definition and retention lines. This guide says how to write **each field of your draft**.

## References: `nom` and `definition`

For each reference, two short English texts that the code assembles into one definition line:

- `nom`: how the plan names the asset ("Maya", "the Tenancière", "the narrow wooden corridor").
- `definition`: with no "is" or introducing verb, **the visible traits H3 must follow** (taken from the registry description: clothes, colours, materials, build, distinctive marks), then, in a few words, **the state it is in for this plan** ("in a torn indigo cloak, leaning in close, her stride reduced to a bare inclination"). Actions and movements belong in the shots; the definition anchors the identity. It may stay short for a set or an effect when the name already says it.

`retention` (optional) says how the plan reuses the reference:
- `fully_preserved` (default): kept entirely.
- `partially_preserved`: some traits change.
- `attribute_transfer`: traits pass to another subject.
- `weak_reference`: general resemblance only.
- For a sound: `reference` (default): the character of the sound is reused without copying the signal.

`retentionNote` says in one sentence what is kept.

Choose the **lightest level that fits the reference's role** (the one set for it when you defined it). What the plan adds (new actions, movement, a different background or event) is **not a loss of fidelity**: a character who runs, fights or cries stays `fully_preserved`. A visual effect (`VFX_…`) is never `fully_preserved`.

## `summary`

A short English paragraph: who does what, where. It introduces no new reference and has no bracketed prefix (the code adds it). References are written `[[CODE]]`.

## `ouverture`

One to three English sentences before the first shot: the project's style clause, the dominant light, and, when two or more characters act together, **the sides** ("Maya is always on the left of the frame facing right, the Tenancière on the right facing left; the fight runs left to right"). Names in plain prose, no `[[CODE]]` marker.

## `shots`

One object per shot: `debutSecondes` and `texte`.

1. The first shot starts at `0` and its text is a complete sentence ("A wide shot follows [[CHAR_maya]], Maya, running…").
2. Next shots start at their entry time. **The code writes "Hard cut to" before your text**, so start directly with a **noun phrase** describing the framing ("a low-angle shot of X, …", "an extreme close-up of X, …"), then continue the sentence. No verb right after ("holds on", "follows"), and never a number, timecode, "Hard cut" or "a sudden cut to": they would add to the code's.
3. **Camera**: a natural English action in the sentence (type, amplitude, speed), not a label stuck at the end: "the camera pushes in with small amplitude at slow speed toward the letter". Medium amplitude and normal speed are omitted. Motion types H3 knows: `zoom in / zoom out` (lens only, camera still), `push in / pull out` (camera moves), `pan left / right`, `truck left / right` (camera slides sideways), `tilt up / down`, `pedestal up / down` (camera rises or sinks), `arc shot` (around the subject), `tracking shot` (follows a moving subject), `static shot`, `shake slightly / strongly`, `POV`, `roll clockwise / counterclockwise`. Terms from fine-tuned H3 prompts: `swoop` (a curved flight through space, up and away or down onto the subject; seen to render), `dive` (a fast plunge toward the subject) and `whip-pan` (a very fast pan used as a transition; it can change the sides, so say who is where afterwards). The last two are less sure. Amplitude: `with small / large amplitude`; speed: `at slow / fast speed`. A camera that moves inside a shot is written in words and in time ("early in the shot the camera tracks to the right, then pushes in on the cracked floor", "smoothly reframing from the fighter to the fallen master"), never with degrees, percentages or coordinates.
4. **References**: at the first appearance of an important reference in the plan, describe its traits, place in the frame and action; afterwards, only cite it. Every citation is written `[[CODE]]`.
5. **Speakers**: every physically produced voice gets an `(S1)`, `(S2)`… assigned once, in speaking order within the plan, and reused at each turn. Several speakers at once: `(S1,S2)`. A speaking character is written `[[CHAR_x]] (Sx)`. An off-screen speaker keeps the same form, marked `off-screen`. **At a speaker's first line**, give enough to fix the voice: pitch, timbre, pace, accent ("with a low, slightly raspy voice, slow pace (S1)"); delivery and gesture stay outside `<d>`. A voice-over with no character on screen: a stable description of the voice followed by `(Sx)`, written **exactly** `says in an off-screen voiceover: <d>…</d> while his/her lips remain completely closed` (the closed-lips clause after **every** voice-over `<d>`).
6. **Dialogue**: `<d>[Français] …</d>`, verbatim, punctuation included. Punctuation limited to `, . ? !`; a complete sentence ends with `.`, `?` or `!` before `</d>`. An unintelligible passage is written `[unclear]`.
7. **On-screen text** (sign, label, subtitle, neon): in English double quotes, verbatim and in its own language ("a red neon sign reading "营业中"").
8. **Cut-off dialogue**: `<scenetrans>` and `<cutoff>` with the matching continuity descriptions, when a line crosses a cut or is truncated by the end of the video. The whole line stays in one `<d>`, in the shot where it begins; `<scenetrans>` sits outside the `<d>`, in **both** shots around the cut, with a sentence of continuity (the line continues seamlessly across the cut). Speech is mentioned only in the sentence that carries its `<d>`; elsewhere describe the look, the gesture, the silence.
9. **Length**: the whole assembled prompt stays under 7,000 characters. A dialogue plan favours covering the whole spoken timeline over length.

## `overall_soundscape` and `non_diegetic_music`

1. `overall_soundscape`: **one to four sentences**, one paragraph: ambience, physical action sounds and non-verbal human sounds (breath, laughter, footsteps) over the whole video. `N/A` only if complete silence is requested. Dialogue, singing and sounds synchronized to one shot stay in the `shots`. A sound reference may be cited here as `[[SFX_…]]`.
2. `non_diegetic_music`: **one to three sentences**; music only the audience hears, described by instrumentation, tempo and dynamic evolution, never by mood words. `N/A` when there is none.
3. Never repeat dialogue in these two fields, and never copy the field name into them.
