"use client";

import { useEffect, useMemo, useRef, type CSSProperties, type PointerEvent as PE, type RefObject } from "react";
import { aimanter, cibleGlisser, debuts, DUREE_MIN_CLIP, familleStatut, formatTemps, pad2, type Clip, type PlanMontage, type SceneMontage } from "@/lib/montage/montage";

export type ModeTable = "mt" | "sc";

/** Teinte stable d'un plan (dégradé de son clip), tirée de son uuid : la même d'un rechargement à l'autre, sans rien stocker. */
export const teinte = (uuid: string): number => Math.round((parseInt(uuid.replace(/-/g, "").slice(0, 4), 16) / 0xffff) * 360);

/** La table de montage : barre d'outils (ordre affiché, zoom, aimantation, écart au scénario), règle, piste « Montage » (clips des entrées,
 * rognables et déplaçables), pistes audio « à venir », et en mode « Ordre des scènes » la bande des scènes et les plans du scénario.
 * Les gestes sont signalés au parent, qui met l'état à jour tout de suite et enregistre (components/montage/Montage.tsx). */
export function TableMontage(props: {
  mode: ModeTable;
  setMode: (m: ModeTable) => void;
  clips: Clip[];
  starts: number[];
  durees: number[];
  total: number;
  plans: PlanMontage[];
  scenes: SceneMontage[];
  decalees: ReadonlySet<number>;
  copies: ReadonlySet<number>;
  nbEntreesParPlan: ReadonlyMap<number, number>;
  differe: boolean;
  pps: number;
  setPps: (n: number) => void;
  aimant: boolean;
  setAimant: (v: boolean) => void;
  t: number;
  lecture: boolean;
  sel: number;
  live: number;
  depot: number | null;
  setDepot: (px: number | null) => void;
  scrollerRef: RefObject<HTMLDivElement | null>;
  binRef: RefObject<HTMLElement | null>;
  setBinSurvol: (v: boolean) => void;
  setFantome: (f: { x: number; y: number; texte: string } | null) => void;
  pause: () => void;
  selectionner: (k: number) => void;
  allerA: (t: number) => void;
  deplacer: (k: number, vers: number) => void;
  retirer: (k: number) => void;
  rogner: (k: number, debut: number, fin: number, fini: boolean) => void;
  deplacerScenario: (k: number, vers: number) => void;
  recaler: () => void;
}) {
  const { mode, clips, starts, durees, total, plans, pps, t, scrollerRef } = props;
  const dureesScenario = useMemo(() => plans.map((p) => p.dureePrevue), [plans]);
  const startsScenario = useMemo(() => debuts(dureesScenario), [dureesScenario]);
  const totalScenario = startsScenario.length ? startsScenario.at(-1)! + dureesScenario.at(-1)! : 0;
  const T = Math.ceil(Math.max(total, totalScenario)) + 6;
  const laneScenario = useRef<HTMLDivElement>(null);

  // Pendant la lecture, la table suit la tête de lecture.
  useEffect(() => {
    if (!props.lecture || mode !== "mt") return;
    const sc = scrollerRef.current;
    if (!sc) return;
    const x = t * pps;
    if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 80);
  }, [t, pps, props.lecture, mode, scrollerRef]);

  const xDe = (clientX: number) => {
    const sc = scrollerRef.current!;
    return clientX - sc.getBoundingClientRect().left + sc.scrollLeft;
  };

  const suivre = (mv: (ev: PointerEvent) => void, up: (ev: PointerEvent) => void) => {
    const fin = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", mv);
      document.removeEventListener("pointerup", fin);
      document.removeEventListener("pointercancel", fin);
      up(ev);
    };
    document.addEventListener("pointermove", mv);
    document.addEventListener("pointerup", fin);
    document.addEventListener("pointercancel", fin);
  };

  // --- Règle : se placer ---
  const surRegle = (e: PE<HTMLDivElement>) => {
    if (e.button !== 0) return;
    props.pause();
    props.allerA(xDe(e.clientX) / pps);
    suivre((ev) => props.allerA(xDe(ev.clientX) / pps), () => undefined);
  };

  // --- Rognage par les poignées ---
  const rognerDepuis = (e: PE<HTMLElement>, k: number, cote: "l" | "r") => {
    const c = clips[k]!;
    if (!c.rendu) return;
    props.pause();
    const x0 = e.clientX;
    const d0 = c.debut;
    const f0 = c.fin;
    const D = c.rendu.dureeSecondes;
    // La tête de lecture, exprimée dans le temps du rendu : l'aimant y colle un bord.
    const tete = t - starts[k]! + c.debut;
    let debut = d0;
    let fin = f0;
    suivre(
      (ev) => {
        const d = (ev.clientX - x0) / pps;
        if (cote === "l") debut = Math.min(Math.max(0, aimanter(d0 + d, props.aimant, tete)), f0 - DUREE_MIN_CLIP);
        else fin = Math.max(Math.min(D, aimanter(f0 + d, props.aimant, tete)), d0 + DUREE_MIN_CLIP);
        props.rogner(k, debut, fin, false);
      },
      () => props.rogner(k, debut, fin, true),
    );
  };

  // --- Déplacer un clip, ou le sortir vers « Hors montage » ---
  const surClip = (e: PE<HTMLDivElement>, k: number) => {
    if (e.button !== 0) return;
    const poignee = (e.target as HTMLElement).dataset.h as "l" | "r" | undefined;
    props.selectionner(k);
    if (poignee) {
      e.preventDefault();
      rognerDepuis(e, k, poignee);
      return;
    }
    const el = e.currentTarget;
    const x0 = e.clientX;
    const gauche = starts[k]! * pps;
    let bouge = false;
    let cible = k;
    let dehors = false;
    let surBin = false;
    suivre(
      (ev) => {
        const dx = ev.clientX - x0;
        if (!bouge && Math.abs(dx) < 5 && Math.abs(ev.clientY - e.clientY) < 5) return;
        if (!bouge) {
          bouge = true;
          props.pause();
          el.classList.add("is-drag");
        }
        el.style.transform = `translateX(${dx}px)`;
        const sr = scrollerRef.current!.getBoundingClientRect();
        const br = props.binRef.current?.getBoundingClientRect();
        dehors = ev.clientY > sr.bottom + 6 || ev.clientY < sr.top - 30;
        surBin = !!br && ev.clientX >= br.left && ev.clientX <= br.right && ev.clientY >= br.top && ev.clientY <= br.bottom;
        el.style.opacity = dehors ? "0.25" : "";
        props.setFantome(dehors ? { x: ev.clientX, y: ev.clientY, texte: clips[k]!.plan.titre } : null);
        props.setBinSurvol(surBin);
        const r = cibleGlisser(durees, k, (gauche + dx) / pps + durees[k]! / 2);
        cible = r.index;
        props.setDepot(dehors ? null : r.debut * pps);
      },
      (ev) => {
        el.style.transform = "";
        el.style.opacity = "";
        el.classList.remove("is-drag");
        props.setDepot(null);
        props.setFantome(null);
        props.setBinSurvol(false);
        if (bouge && dehors) {
          if (surBin) props.retirer(k);
        } else if (bouge) {
          if (cible !== k) props.deplacer(k, cible);
        } else {
          props.allerA(xDe(ev.clientX) / pps);
        }
      },
    );
  };

  // --- Ordre des scènes : déplacer un plan (il prend la scène de son nouveau voisin) ---
  const surPlanScenario = (e: PE<HTMLDivElement>, k: number) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const x0 = e.clientX;
    const gauche = startsScenario[k]! * pps;
    let bouge = false;
    let cible = k;
    suivre(
      (ev) => {
        const dx = ev.clientX - x0;
        if (!bouge && Math.abs(dx) < 5) return;
        if (!bouge) {
          bouge = true;
          el.classList.add("is-drag");
        }
        el.style.transform = `translateX(${dx}px)`;
        const r = cibleGlisser(dureesScenario, k, (gauche + dx) / pps + dureesScenario[k]! / 2);
        cible = r.index;
        props.setDepot(r.debut * pps);
      },
      () => {
        el.style.transform = "";
        el.classList.remove("is-drag");
        props.setDepot(null);
        if (bouge && cible !== k) props.deplacerScenario(k, cible);
      },
    );
  };

  // Règle : graduations selon le zoom.
  const pas = pps < 28 ? 10 : pps < 60 ? 5 : 1;
  const graduations: { s: number; grande: boolean }[] = [];
  for (let s = 0; s <= T; s += pas) graduations.push({ s, grande: s % (pas * 2) === 0 || (pas === 1 && s % 5 === 0) });

  // Bandes des scènes (plans consécutifs d'une même scène).
  const titreScene = new Map(props.scenes.map((s, i) => [s.id, { titre: s.titre, n: i + 1 }]));
  const bandes: { cle: string; x: number; w: number; libelle: string }[] = [];
  plans.forEach((p, k) => {
    const der = bandes.at(-1);
    const cle = String(p.sceneId ?? "sans");
    if (der && der.cle === cle && k > 0 && plans[k - 1]!.sceneId === p.sceneId) der.w += dureesScenario[k]! * pps;
    else {
      const sc = p.sceneId != null ? titreScene.get(p.sceneId) : null;
      bandes.push({ cle, x: startsScenario[k]! * pps, w: dureesScenario[k]! * pps, libelle: sc ? `Scène ${sc.n} · ${sc.titre}` : "Sans scène" });
    }
  });

  const indication =
    mode === "mt"
      ? "Glisser un plan pour le déplacer · tirer ses bords pour rogner · cliquer la règle pour se placer"
      : "Ordre du scénario : glisser un plan pour le changer de place ou de scène. Le montage final n’est pas touché.";

  return (
    <section className={`mt-table mode-${mode}`} aria-label="Table de montage">
      <div className="mt-tbar">
        <div className="mt-seg" role="group" aria-label="Ordre affiché">
          <button type="button" aria-pressed={mode === "mt"} onClick={() => props.setMode("mt")}>
            Montage final
          </button>
          <button type="button" aria-pressed={mode === "sc"} onClick={() => props.setMode("sc")}>
            Ordre des scènes
          </button>
        </div>
        {mode === "mt" ? (
          <>
            <label className="mt-zoom">
              Zoom <input type="range" min={16} max={120} step={2} value={pps} onChange={(e) => props.setPps(Number(e.target.value))} />
            </label>
            <button type="button" className="btn btn-ghost btn-mini" aria-pressed={props.aimant} title="Aimantation (S)" onClick={() => props.setAimant(!props.aimant)}>
              Aimantation : {props.aimant ? "oui" : "non"}
            </button>
            {props.differe ? (
              <span className="mt-pill" style={{ "--c": "var(--or-glow)" } as CSSProperties}>
                <i />
                Montage différent du scénario
              </span>
            ) : null}
            <button type="button" className="btn btn-ghost btn-mini" disabled={!props.differe} title="Remet les plans du montage dans l’ordre des scènes" onClick={props.recaler}>
              Recaler sur l’ordre des scènes
            </button>
          </>
        ) : null}
        <span className="mt-sp" />
        <span className="mt-hint">{indication}</span>
      </div>
      <div className="mt-tl">
        <div className="mt-labels">
          {mode === "mt" ? (
            <>
              <div className="l-regle" />
              <div className="l-v">Montage</div>
              <div className="l-a">Voix</div>
              <div className="l-a">Musique</div>
            </>
          ) : (
            <>
              <div className="l-sc">Scènes</div>
              <div className="l-v">Scénario</div>
            </>
          )}
        </div>
        <div className="mt-scroller" ref={scrollerRef}>
          <div className="mt-inner" style={{ width: T * pps + 40, "--pps": pps } as CSSProperties}>
            {mode === "mt" ? (
              <>
                <div className="mt-regle" onPointerDown={surRegle}>
                  {graduations.map(({ s, grande }) => (
                    <span key={s}>
                      <span className={`mt-tick${grande ? " is-grande" : ""}`} style={{ left: s * pps }} />
                      {grande ? (
                        <span className="mt-tick-l" style={{ left: s * pps }}>
                          {formatTemps(s).replace(".0", "")}
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
                <div className="mt-lane is-v">
                  {clips.map((c, k) => {
                    const f = familleStatut(c.plan.statut);
                    return (
                      <div
                        key={c.entree.id}
                        className={`mt-clip f-${f}${c.prevu ? " is-prevu" : ""}${k === props.sel ? " is-sel" : ""}${k === props.live ? " is-live" : ""}`}
                        tabIndex={0}
                        style={{ "--h": teinte(c.plan.uuid), left: starts[k]! * pps, width: c.duree * pps } as CSSProperties}
                        aria-label={`Plan ${k + 1}, ${c.plan.titre}, ${c.duree.toFixed(1)} secondes${c.prevu ? " prévues, pas encore de rendu" : ""}`}
                        onPointerDown={(e) => surClip(e, k)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            props.selectionner(k);
                            props.allerA(starts[k]!);
                          }
                        }}
                      >
                        {c.prevu ? null : (
                          <>
                            <span className="mt-poignee is-g" data-h="l" />
                            <span className="mt-poignee is-d" data-h="r" />
                          </>
                        )}
                        <span className="mt-clip-in">
                          <span className="mt-clip-n">
                            {pad2(k + 1)}
                            {props.decalees.has(c.entree.id) ? <span className="mt-clip-sc"> · sc. {pad2(c.plan.position)}</span> : null}
                          </span>
                          <span className="mt-clip-t">{c.plan.titre}</span>
                          <span className="mt-clip-d">
                            {c.duree.toFixed(1)} s{c.prevu ? " prévu" : ""}
                            {props.copies.has(c.entree.id) ? <span className="mt-tag is-neutre">copie</span> : null}
                            {c.plan.perime ? <span className="mt-tag">périmé</span> : null}
                            {f === "echoue" ? <span className="mt-tag is-err">échec</span> : null}
                          </span>
                        </span>
                        <span className="mt-clip-st" />
                      </div>
                    );
                  })}
                  {props.depot != null ? <div className="mt-depot" style={{ left: props.depot - 2 }} /> : null}
                </div>
                <div className="mt-lane is-a">
                  <span>À venir · pas encore de fichier voix séparé</span>
                </div>
                <div className="mt-lane is-a">
                  <span>À venir · musique d’épisode</span>
                </div>
                <div className="mt-tete" style={{ left: t * pps }} />
              </>
            ) : (
              <>
                <div className="mt-lane is-sc">
                  {bandes.map((b) => (
                    <div key={`${b.cle}-${b.x}`} className="mt-bande" style={{ left: b.x, width: b.w }} title={b.libelle}>
                      {b.libelle}
                    </div>
                  ))}
                </div>
                <div className="mt-lane is-v" ref={laneScenario}>
                  {plans.map((p, k) => {
                    const n = props.nbEntreesParPlan.get(p.id) ?? 0;
                    const f = familleStatut(p.statut);
                    return (
                      <div
                        key={p.uuid}
                        className={`mt-clip f-${f}${p.rendus.length ? "" : " is-prevu"}${n ? "" : " is-hors"}`}
                        style={{ "--h": teinte(p.uuid), left: startsScenario[k]! * pps, width: dureesScenario[k]! * pps } as CSSProperties}
                        aria-label={`Scénario, plan ${k + 1}, ${p.titre}${n ? "" : ", hors montage"}`}
                        onPointerDown={(e) => surPlanScenario(e, k)}
                      >
                        <span className="mt-clip-in">
                          <span className="mt-clip-n">{pad2(k + 1)}</span>
                          <span className="mt-clip-t">{p.titre}</span>
                          <span className="mt-clip-d">
                            {p.dureePrevue.toFixed(1)} s
                            {n ? <span className="mt-tag is-neutre">au montage{n > 1 ? ` ×${n}` : ""}</span> : <span className="mt-tag is-eteint">hors montage</span>}
                          </span>
                        </span>
                        <span className="mt-clip-st" />
                      </div>
                    );
                  })}
                  {props.depot != null ? <div className="mt-depot" style={{ left: props.depot - 2 }} /> : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
