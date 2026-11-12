/** CUSTOM staging PROFILES (`director_profile` of Open H3 IR: a name and a paragraph of habits, 5000 characters at most), as opposed to the 7 bundled profiles
 * (`styles-camera.ts`, `director`). These are real staging choices, on a par with the directors: the « Mise en scène » screen of `/nouveau`, the project's Brief,
 * the scene and the clip offer them (lib/h3ir/settings.ts, `ChoixMiseEnScene`), and lib/h3ir/brief.ts sends them as `director_profile`. The package expects HABITS
 * of direction (camera, framing, light, body acting, rhythm, sounds, music), not clips; the `name` only goes to the report, never to the writer; no studio name, author or work.
 *
 * File with no import at all, on purpose: the interface (client component) reads it, like `styles-camera.ts`.
 * They mainly govern HOW IT MOVES and HOW IT IS SHOT; the APPEARANCE (material, drawing) comes from the reference images, hence from the project's style (« claymation » attempt, 2026-11-07). */
export type ProfilPerso = { name: string; notes: string };
/** What a menu shows: short label and one-line summary (in French). */
export type FichePerso = { libelle: string; resume: string };

/** The identifiers (stored in `style_camera`, varchar(20)): the order is that of the menus. The two tables below are typed on them, so they cannot diverge. */
export const IDS_PROFILS_PERSO = ["claymation", "anime-nerveux", "anime-contemplatif", "3d-cinema", "sitcom", "horreur"] as const;
export type ProfilPersoId = (typeof IDS_PROFILS_PERSO)[number];

export const PROFILS_PERSO: Record<ProfilPersoId, ProfilPerso> = {
  claymation: {
    name: "Plasticine stop-motion",
    notes:
      "Everything is a handmade plasticine puppet film shot frame by frame on a miniature set. Figures are sculpted clay with visible fingerprints, dents and seams, simple rounded faces with exaggerated brows and mouths. " +
      "Movement is deliberate and slightly stepped, about twelve poses per second, with a handmade jerkiness: weight shows as squash on landing and a slow settle, a run is a series of small hops, a leap is a held pose then a sudden pop. " +
      "The camera sits on a tripod at miniature scale, locked or moving in small, patient increments, with shallow depth of field that makes the set look tiny. " +
      "Light is warm, even studio light on a tabletop set with small soft shadows; surfaces are cardboard, fabric, painted foam and modelling clay, with props that look made by hand. " +
      "Sound is close and foley-like, with small organic noises of clay, cloth and tapping; voices are plain and slightly theatrical. Music, if any, is light, quirky and acoustic.",
  },
  "anime-nerveux": {
    name: "Action animation, fast and punchy",
    notes:
      "Everything is shot like hand-drawn action animation, built on contrast between held poses and sudden bursts. Bodies hit extreme, exaggerated poses and hold them for a beat, then snap to the next with an abrupt acceleration; motion is strongly eased, with a hard start and a slow, sharp stop. " +
      "Impacts are sold by a freeze, a slight shake of the whole frame and a trailing smear, not by realism of weight. Characters react in close, tight shots on the eyes and mouth before and after every big move. " +
      "The camera is sweeping and fast: wide arcs around the action, quick pushes into the face, sudden low angles, swift whip-like pans that settle hard on the target. Framing is dramatic and slanted, with characters thrown toward the lens. " +
      "Light is graphic and contrasty, with hard-edged shadows and bright flashes at the peak of each move. Sound is sharp and exaggerated: whooshes on every motion, a loud hit on every impact, abrupt silences before a burst. Music, if any, is driving and loud.",
  },
  "anime-contemplatif": {
    name: "Dreamlike contemplative animation",
    notes:
      "Everything is shot like gentle hand-painted animation that takes its time. Movement is slow and soft: characters move with unhurried, natural gestures, and the world keeps moving around them, with wind in the grass and hair, drifting clouds, rippling water, falling leaves and floating dust in the light. " +
      "The camera is mostly still or glides very slowly, with long calm shots that let a place be looked at before anything happens in it. Wide views of landscape and sky alternate with small details: a hand on a railing, steam from a cup, an insect on a leaf. " +
      "Pauses are part of the action: a character stops, looks, breathes, and the frame stays with them. Eyes are expressive and quiet, reactions are small. Light is soft, warm and golden, with gentle cloud shadows and a faint haze in depth. " +
      "Sound is mostly ambient: wind, birds, distant water, footsteps and cloth, with long silences between sounds. Music, if any, is a simple, tender, slow melody on piano or strings.",
  },
  "3d-cinema": {
    name: "Feature-length 3D animation",
    notes:
      "Everything is shot like a big-budget animated feature built on clear, readable staging and expressive acting. Characters act with their whole body: wide gestures, big eyebrow and mouth changes, anticipation before every move and a springy overshoot after it, with warm comic timing. " +
      "The virtual camera is fluid and confident: smooth tracking beside the action, graceful cranes and arcs, slow pushes on emotional beats, and clean wide shots that always show where everyone is. Framing is balanced and cinematic, with a clear foreground, middle ground and background and a strong silhouette for each character. " +
      "Light is polished and motivated: a warm key light, soft rim light to separate characters from the background, gentle bounce light in the shadows and a touch of glow in the highlights. " +
      "Sound is rich and clean: precise effects on every gesture, expressive voices with room for pauses. Music, if any, is a full orchestra with a clear theme that swells at the emotional peak.",
  },
  sitcom: {
    name: "Multi-camera sitcom",
    notes:
      "Everything is shot like a studio comedy on a stage set with several fixed cameras. Most of the scene plays in wide, static shots that show the whole room and everyone in it, with characters facing slightly toward the audience and entering and leaving through doors. " +
      "Dialogue is covered in plain shot and reverse shot, medium shots over the shoulder, held until the line lands, with a quick reaction shot on the listener. The camera almost never moves; a slow push-in or a pan to follow someone crossing the room is rare. " +
      "Light is flat, bright and even, with no dramatic shadows, as if the whole set were lit from above. " +
      "Rhythm is set by the lines: quick back-and-forth exchanges, a beat of silence after a joke, a double take. Acting is broad and clear, with big expressions and gestures readable from far away. " +
      "Sound is clean dialogue in a lively room, with small foley and room tone. There is no background music during the scene.",
  },
  horreur: {
    name: "Slow-burn horror",
    notes:
      "Everything is shot like a horror film built on waiting and dread. Long, static shots hold on a space while nothing seems to happen; the frame is off-balance, with the subject pushed to an edge and a large empty area of dark room beside it, so the viewer keeps scanning the empty part. " +
      "The camera drifts very slowly forward or sideways, or does not move at all; handheld unease appears only briefly. Characters move cautiously, stop, listen, glance behind them. Reactions are small and held: breathing, eyes widening, a hand freezing. " +
      "Light is scarce and low: a single weak practical source, deep shadow, cold colour, dark corners that hide shapes, and a flicker or a cut to darkness at the worst moment. " +
      "Sound carries the fear: room tone, a distant creak, a muffled drip, breathing, long silences. Then a sudden rupture, a loud bang, a quick movement into frame or an abrupt cut, followed by a stunned quiet. Music, if any, is a low drone or sparse dissonant notes, never a melody.",
  },
};

/** The labels and summaries of the custom profiles, for the menus. */
export const FICHES_PERSO: Record<ProfilPersoId, FichePerso> = {
  claymation: { libelle: "Stop-motion en pâte à modeler", resume: "Poses saccadées, caméra de table, lumière chaude de studio miniature." },
  "anime-nerveux": { libelle: "Anime d'action", resume: "Poses extrêmes tenues, accélérations brusques, caméra ample et rapide." },
  "anime-contemplatif": { libelle: "Anime contemplatif", resume: "Lenteur, vent, plans de contemplation, silences et détails de nature." },
  "3d-cinema": { libelle: "Animation 3D de cinéma", resume: "Jeu d'acteur exagéré, caméra virtuelle fluide, mise en scène lisible." },
  sitcom: { libelle: "Sitcom", resume: "Plans larges fixes, champ/contrechamp, lumière plate, aucune musique de fond." },
  horreur: { libelle: "Horreur lente", resume: "Attente, cadrages décentrés, longs plans fixes, lumière chiche, rupture brusque." },
};
