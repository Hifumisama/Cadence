"use client";

import { useState, useTransition } from "react";
import { updatePromptSection } from "@/app/plans/[numero]/actions";

const LABELS: Record<string, string> = {
  subject_definitions: "subject_definitions",
  summary: "summary",
  retention_analysis: "retention_analysis",
  detailed_description: "detailed_description",
  overall_soundscape: "overall_soundscape",
  non_diegetic_music: "non_diegetic_music",
};

export function PromptSectionEditor({
  planId,
  section,
  initialContenu,
}: {
  planId: number;
  section: string;
  initialContenu: string;
}) {
  const [contenu, setContenu] = useState(initialContenu);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const onSave = () => {
    startTransition(async () => {
      await updatePromptSection(planId, section, contenu);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <div className="sec">
      <div className="sec-hd">
        <svg className="zbullet" viewBox="0 0 14 14" aria-hidden="true">
          <g fill="none" stroke="#c9a24b" strokeWidth="1.1">
            <path d="M7 1 L13 7 L7 13 L1 7Z" />
            <path d="M2.8 2.8 H11.2 V11.2 H2.8Z" strokeDasharray="1.2 1.8" />
          </g>
        </svg>
        <span className="sec-key">{LABELS[section] ?? section}</span>
        <span className="sec-actions">
          <span className="sec-count">{contenu.length} c.</span>
          <button className="btn btn-ghost" onClick={onSave} disabled={pending}>
            {pending ? "..." : saved ? "Enregistré" : "Enregistrer"}
          </button>
        </span>
      </div>
      <textarea
        value={contenu}
        onChange={(e) => setContenu(e.target.value)}
        rows={section === "detailed_description" ? 12 : 3}
      />
    </div>
  );
}
