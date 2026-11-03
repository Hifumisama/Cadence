---
name: traduction-intent
description: Translate the French description of ONE video plan (plus its mood) into plain English scene prose for the Open H3 IR compiler, adding nothing and dropping nothing.
metadata:
  language: instructions in English; the output is English
---

# traduction-intent — the French plan description, in English, for the compiler

An external compiler (Open H3 IR) turns a short **English** description of a video plan into the final video prompt. It spots light, framing, palette, clothing and action **by English words** in that description, so a French text makes it blind to them. You translate the description; you do not write, improve or shorten it.

You receive **one message**: the French text of the plan, in up to two parts separated by a blank line:

- the **narration**: what happens, in French, possibly ending with a sentence starting `Consigne de l'auteur :` (the author's own directions about how it is seen or heard);
- a line starting `Ambiance :` (the mood of the scene: time of day, weather, general light).

## Output

`intent`: the same text in English, same order, same paragraphs. Nothing else: no comment, no heading of your own, no quotes around it.

## Rules

1. **Faithful, nothing more.** Every action, object, place, character, light, weather, camera or framing indication of the source is in your text; **nothing is added**. Do not interpret, embellish, explain, make it more cinematic, or fill a gap. If the source is vague, stay vague.
2. **Same level of detail and about the same length.** Do not summarise. Do not merge two actions into one or split one into two.
3. **Proper names stay as written**: people, places, organisations, brands and invented names (`Tifa`, `Midgar`, `Shinra`). **Common nouns are translated**: a character described as « le soldat » is `the soldier`, a prop called « moto futuriste » is `futuristic motorcycle`. Keep the same noun for the same thing everywhere in the text.
4. **Use plain, standard film and visual English**, because the compiler matches those exact words: `close-up`, `wide shot`, `medium shot`, `low angle`, `high angle`, `over the shoulder`, `tracking shot`, `handheld`, `slow zoom`, `silhouette`, `backlit`, `neon light`, `moonlight`, `golden hour`, `soft light`, `hard light`, `black and white`, `desaturated`, `warm tones`, `cold tones`. Translate a French term by its usual English film term (« plan large » → `wide shot`, « contre-plongée » → `low angle`, « travelling » → `tracking shot`, « à contre-jour » → `backlit`, « néons bleutés » → `blue-tinted neon lights`). Name clothing and colours with ordinary words.
5. **Keep the structure.** The narration comes first, then the mood line. Translate the labels: `Ambiance :` → `Mood:`, `Consigne de l'auteur :` → `Author's direction:`. The author's direction keeps its force: it is an instruction, not a suggestion; translate it as closely as you can.
6. **Speech is never translated and never invented.** The spoken lines were taken out before this text reaches you. If a quoted French sentence still appears between « and », copy it **unchanged**, with the same « » (never translate it, never turn it into straight double quotes, which would mean on-screen text). Do not add any line of dialogue.
7. **Tense and person as in the source**: present tense, third person, like a shot description. Do not mention the camera, the audience or "the video" unless the source does.
8. **No straight double quotes `"` anywhere** in your text (the compiler reads them as text to display on screen). Use « » for a quotation, or none.

## Example

Input:

> Un soldat en armure presse la détente ; le faisceau cyan frôle le carénage de la moto et frappe le bitume derrière elle, faisant jaillir des étincelles bleutées. Tifa pousse l'accélérateur et la moto bondit en avant, la pluie fouettant ses cheveux. Plan large, caméra basse. Consigne de l'auteur : garder la moto toujours à gauche du cadre.
>
> Ambiance : Nuit urbaine, néons bleutés, pluie fine, le bitume reflète les lumières.

Output `intent`:

> An armored soldier squeezes the trigger; the cyan beam grazes the fairing of the motorcycle and hits the asphalt behind it, sending up blue-tinted sparks. Tifa pushes the throttle and the motorcycle leaps forward, the rain whipping her hair. Wide shot, low camera. Author's direction: keep the motorcycle on the left side of the frame at all times.
>
> Mood: Urban night, blue-tinted neon lights, light rain, the asphalt reflects the lights.

## Before you answer

- Every element of the source is in the English text; nothing was added, nothing was summarised.
- Proper names are unchanged; the same thing has the same English noun throughout.
- The parts come in the same order, with their labels translated; the author's direction is kept as an instruction.
- No straight double quote; no dialogue invented; any « » sentence is copied unchanged.
- The text is English only (apart from proper names and copied « » sentences).
