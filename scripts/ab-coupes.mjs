import { execSync } from "node:child_process";
const [f, ...prompt] = process.argv.slice(2);
const out = execSync(`ffmpeg -hide_banner -i "${f}" -vf "scale=320:-1,select='gte(scene,0)',metadata=print:file=-" -an -f null - 2>NUL`, { encoding: "utf8", maxBuffer: 1e8, shell: true });
const pts = [...out.matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1]);
const sc = [...out.matchAll(/scene_score=([\d.]+)/g)].map((m) => +m[1]);
// pics locaux (fenêtre ±4 images) au-dessus d'un seuil bas
const pics = [];
for (let i = 4; i < sc.length - 4; i++) {
  const w = sc.slice(i - 4, i + 5);
  if (sc[i] >= 0.08 && sc[i] === Math.max(...w)) pics.push([pts[i], sc[i]]);
}
console.log("pics >= 0.08 :", pics.map(([t, s]) => `${t.toFixed(2)}(${s.toFixed(2)})`).join(" "));
console.log("timecodes du prompt :", prompt.join(" "));
