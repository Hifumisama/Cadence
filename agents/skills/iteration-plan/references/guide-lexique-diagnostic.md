# H3 diagnosis lexicon (iteration)

> Derived from `plan-h3/references/h3-lexique-corrections.md` (kept there for `plan-h3`). Every line cost a render. Format: **symptom → cause → lever**. You no longer write the video prompt: Open H3 IR compiles it from the intent, the duration, the references and the two settings. So each lesson ends on the lever that treats it here (`reglages`, `references`, `dureeSecondes`, or a sentence of the intent).

## Cutting and cadence

- **Intense action that feels flat, energy unreadable** → too few cuts for its intensity. Lever: `creativite` up one step (`bold`), or a `styleMiseEnScene` with fast cutting; the intent says the action beat by beat.
- **A beat ignored or smoothed away** → the plan is too short for what it holds (a shot under ~1.5 s is skipped). Lever: `dureeSecondes` up, or remove a beat from the intent.
- **Several beats melted into one smooth movement** → the intent tells them as one sentence. Lever: the intent tells each beat as its own sentence, in order.
- **Fight: no exchange, or 4–5 actions smeared together** → too many blows for the time. Lever: fewer blows in the intent (one linked exchange of 2–4 blows), or more duration.
- **Each shot starts afresh, cuts do not match** → the intent does not say what links them. Lever: the intent opens each beat on the end of the previous one (the flames hit the stone, then the slab cracks).
- **Sides flip between cuts** → nobody says who is left and right. Lever: one sentence at the start of the intent fixes the sides against a landmark of the place.
- **Contact of a blow never seen** → the cut lands on one character at the instant of the blow. Lever: the intent says both are in frame at contact.
- **A named martial move does nothing** → the name alone does not drive the render. Lever: the intent describes the body mechanics and the receiver's reaction.
- **The plan blurs** → too much in it. Lever: cut the intent down; never add.
- **Calm without weight** → slow cadence with no contrast. Lever: `styleMiseEnScene` (a contemplative style) and say it in `verification`; the contrast comes from the neighbour plan, which you do not touch.

## Light and end state

- **The whole image drops to black** → a light change told globally. Lever: the intent ties each light change to a visible gesture (a hand covers the lamp).
- **The plan opens on the state it should reach, the build-up is skipped** → a reference image shows the END state. Lever: `references.retirer` that image, or replace it with an image of the starting state (`references.ajouter`, or `manquants`).

## Negative instructions

- **A negative instruction produces what it forbids** ("no sword", "empty room" fills or arms the frame). Lever: the intent states the wanted state ("her hands rest on the leather strap").

## Camera and close-ups

- **The background scrolls in a close-up** → walking or travel mentioned in a tight plan. Lever: remove the travel from the intent; `creativite` down (`restrained`) for a held frame.
- **The camera rushes a reveal** → a push-in style on a reveal. Lever: `styleMiseEnScene` with a held or slow camera, or `creativite` down.
- **A moving character freezes** → precision words (planted, square, exact) in the intent. Lever: remove them from the intent.
- **Camera too wild / too static for the request** → the settings, not the text. Lever: `creativite` (restrained < balanced < bold < extreme) and `styleMiseEnScene`; never a camera sentence in the intent.

## Identity, sets, props

- **A character drifts, a place is badly recognized, a prop disappears** → its image is missing from the references. Lever: `references.ajouter` (search the registry), or `manquants` if nothing fits.
- **An unwanted state or pose imposed** → an excessive reference. Lever: `references.retirer`.
- **Far extras smeared** → they are too small in frame. Lever: the intent brings the front row close.
- **A populated set used for an empty-room plan → the room fills up** → the wrong state of the set. Lever: the empty state of the set (`references`, or `manquants` with the set as `parent`).

## Voice and durations

- **A line too long for the plan** → no fix in editing. Lever: `dureeSecondes` up (10 s at most), or shorten the line in the intent when the user asks.
