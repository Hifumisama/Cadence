import { readFileSync } from "node:fs";
const verbs = /\b(slash(?:es)?|stab(?:s|bs)?|thrust(?:s)?|parr(?:y|ies|ied)|block(?:s|ed)?|deflect(?:s|ed)?|dodg(?:e|es|ed)|duck(?:s|ed)?|sidestep(?:s|ped)?|punch(?:es|ed)?|jab(?:s)?|hook(?:s|ed)?|kick(?:s|ed)?|knee(?:s|d)?|elbow(?:s|ed)?|swing(?:s)?|swept|sweep(?:s)?|lunge(?:s|d)?|strike(?:s)?|struck|slam(?:s|med)?|shove(?:s|d)?|push(?:es|ed)?|grab(?:s|bed)?|twist(?:s|ed)?|cut(?:s)? (?:through|the|a)|sever(?:s|ed)?|crack(?:s)?|smash(?:es|ed)?|whip(?:s|ped)?|wrap(?:s|ped)?|spin(?:s)?|flip(?:s|ped)?|leap(?:s)?|jump(?:s|ed)?)\b/gi;
for (const [nom, f] of [["ANCIEN", process.argv[2]], ["NOUVEAU", process.argv[3]]]) {
  const md = readFileSync(f, "utf8");
  const sections = md.split(/\n## \d+\. /).slice(1);
  console.log(`\n=== ${nom} ===`);
  for (const s of sections) {
    const titre = s.split("\n")[0];
    const bloc = /```text\n([\s\S]*?)\n```/.exec(s)?.[1] ?? "";
    const m = /detailed_description:\n([\s\S]*?)\n\noverall_soundscape:/.exec(bloc);
    const desc = m?.[1] ?? "";
    const shots = [...desc.matchAll(/\[Shot (\d+)(?:, [^\]]*)?\]( At (\d\d):(\d\d\.\d+),)?/g)];
    const tcs = shots.map((x) => x[2] ? Number(x[3]) * 60 + Number(x[4]) : 0);
    const mots = desc.split(/\s+/).filter(Boolean).length;
    const ouv = desc.split("[Shot 1]")[0];
    const cotes = /left of the frame|on the left|on the right|facing (left|right)/i.test(ouv);
    const refs = (s.match(/Références : (.*)/)?.[1] ?? "").split(" | ").map((x) => x.split(" (")[0].trim());
    const defs = (bloc.match(/subject_definitions:\n([\s\S]*?)\n\nsummary:/)?.[1] ?? "").split("\n");
    const defsAction = defs.filter((l) => /\b(lunging|running|advancing|attacking|rising|charging|walking|reeling|fleeing|swinging|spinning|fighting)\b/i.test(l)).length;
    const coups = (desc.match(verbs) ?? []).length;
    const abstraits = (desc.match(/\b(frantic|chaotic|whirlwind|relentless|desperate|violent(?:ly)?|powerful|massive|intense)\b/gi) ?? []).length;
    const chars = bloc.length;
    const durees = tcs.map((t, i) => (i < tcs.length - 1 ? tcs[i + 1] : 15) - t).map((x) => x.toFixed(1));
    console.log(`${titre}\n  plans:${shots.length} (durées ${durees.join("/")} s) | mots:${mots} | prompt:${chars} car. | côtés dans l'ouverture:${cotes ? "oui" : "non"} | verbes de coup:${coups} | adjectifs vagues:${abstraits} | définitions avec action:${defsAction}/${defs.length}\n  références (${refs.length}): ${refs.join(", ")}`);
  }
}
