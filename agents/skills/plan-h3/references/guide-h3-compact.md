# H3 guide — full-reference mode, compact version

> Condensed from `.claude/skills/fiche-de-plan/references/h3-guide-fullref.md` (official MiniMax guide), limited to the two task types Cadence uses: `reference generation` and `audio reference`. Video editing and continuation cases are left out on purpose. When in doubt, the full guide prevails.

The final prompt H3 receives has six sections (reference definitions, summary, retention analysis, detailed description, soundscape, music), all in English; only dialogue inside `<d>` and visible on-screen text keep their language. **The code assembles these six sections from your draft**: it numbers the references, places shot markers and timecodes, and writes the definition and retention lines. This guide says how to write **each field of your draft**.

## References: `nom` and `definition`

For each reference, two short English texts that the code assembles into one definition line:

- `nom`: how the plan names the asset ("Maya", "the Tenancière", "the narrow wooden corridor").
- `definition`: what it is **in this plan** and what it does, with no "is" or introducing verb ("leaning in close, her stride reduced to a bare inclination"). It may stay empty when the name is enough.

`retention` (optional) says how the plan reuses the reference:
- `fully_preserved` (default): kept entirely.
- `partially_preserved`: some traits change.
- `attribute_transfer`: traits pass to another subject.
- `weak_reference`: general resemblance only.
- For a sound: `reference` (default): the character of the sound is reused without copying the signal.

`retentionNote` says in one sentence what is kept.

## `summary`

A short English paragraph: who does what, where. It introduces no new reference and has no bracketed prefix (the code adds it). References are written `[[CODE]]`.

## `ouverture`

One or two English style sentences before the first shot: the project's style clause, the dominant light. No reference cited.

## `shots`

One object per shot: `debutSecondes` and `texte`.

1. The first shot starts at `0` and its text is a complete sentence ("A wide shot follows [[CHAR_maya]], Maya, running…").
2. Next shots start at their entry time. **The code writes "Hard cut to" before your text**, so start directly with a **noun phrase** describing the framing ("a low-angle shot of X, …", "an extreme close-up of X, …"), then continue the sentence. No verb right after ("holds on", "follows"), and never a number, timecode, "Hard cut" or "a sudden cut to": they would add to the code's.
3. **Camera**: a natural English action in the sentence (type, amplitude, speed), not a label stuck at the end. Medium amplitude and normal speed are omitted.
4. **References**: at the first appearance of an important reference in the plan, describe its traits, place in the frame and action; afterwards, only cite it. Every citation is written `[[CODE]]`.
5. **Speakers**: every physically produced voice gets an `(S1)`, `(S2)`… assigned once, in speaking order within the plan, and reused at each turn. A speaking character is written `[[CHAR_x]] (Sx)`. An off-screen speaker keeps the same form, marked `off-screen`. A voice-over with no character on screen: a stable description of the voice followed by `(Sx)`.
6. **Dialogue**: `<d>[Français] …</d>`, verbatim, punctuation included. Punctuation limited to `, . ? !`; a complete sentence ends with `.`, `?` or `!` before `</d>`. An unintelligible passage is written `[unclear]`.
7. **Cut-off dialogue**: `<scenetrans>` and `<cutoff>` with the matching continuity descriptions, when a line crosses a cut or is truncated by the end of the video.
8. **Length**: 350–500 words in all for a rich plan. A dialogue plan favours covering the whole spoken timeline over word count.

## `overall_soundscape` and `non_diegetic_music`

1. `overall_soundscape`: ambience and physical sounds over the whole video. Dialogue, singing and sounds synchronized to one shot stay in the `shots`. A sound reference may be cited here as `[[SFX_…]]`.
2. `non_diegetic_music`: music only the audience hears, described by instrumentation, tempo and dynamic evolution, never by mood words. `N/A` when there is none.
3. Never repeat dialogue in these two fields, and never copy the field name into them.
