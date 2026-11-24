"use client";

import { useEffect, useState } from "react";
import { LANGUES_DIALOGUES, SANS_DIALOGUE } from "@/lib/projects/design";

/** The language step as a split-flap departures board (2026-11-24): one row per language, its name in its own script and a city;
 * the chosen row flips to « À L'AFFICHE », and a postcard from that city says hello in the language. Each row is a button. */

const VILLES: Record<string, string> = {
  Français: "Paris",
  English: "Londres",
  日本語: "Tokyo",
  한국어: "Séoul",
  中文: "Pékin",
  Deutsch: "Berlin",
  Русский: "Moscou",
  Português: "Lisbonne",
  Español: "Madrid",
  Italiano: "Rome",
  [SANS_DIALOGUE]: "Film muet",
};
const STATUT = "À L’AFFICHE";
/** The greeting and the line on the postcard, in the language itself. */
const CARTES: Record<string, { bonjour: string; mot: string }> = {
  Français: { bonjour: "Bonjour", mot: "Le film parlera français." },
  English: { bonjour: "Hello", mot: "The film will speak English." },
  日本語: { bonjour: "こんにちは", mot: "映画は日本語で話します。" },
  한국어: { bonjour: "안녕하세요", mot: "영화는 한국어로 말합니다." },
  中文: { bonjour: "你好", mot: "电影将说中文。" },
  Deutsch: { bonjour: "Hallo", mot: "Der Film spricht Deutsch." },
  Русский: { bonjour: "Привет", mot: "Фильм будет говорить по-русски." },
  Português: { bonjour: "Olá", mot: "O filme falará português." },
  Español: { bonjour: "Hola", mot: "La película hablará español." },
  Italiano: { bonjour: "Ciao", mot: "Il film parlerà italiano." },
  [SANS_DIALOGUE]: { bonjour: "…", mot: "Pas un mot : la musique et les sons racontent." },
};
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Letters that flip at random then settle, one after the other. */
function Palettes({ texte, anime }: { texte: string; anime: boolean }) {
  const [rendu, setRendu] = useState(texte);
  useEffect(() => {
    if (!anime || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRendu(texte);
      return;
    }
    let pas = 0;
    const t = window.setInterval(() => {
      pas++;
      setRendu(
        Array.from(texte)
          .map((c, i) => (c === " " || i < pas - 4 ? c : ALPHABET[Math.floor(Math.random() * ALPHABET.length)]))
          .join(""),
      );
      if (pas - 4 > texte.length) window.clearInterval(t);
    }, 45);
    return () => window.clearInterval(t);
  }, [texte, anime]);
  return (
    <span className="cn-palettes">
      {Array.from(rendu).map((c, i) => (
        <span key={i} className="cn-palette">{c === " " ? " " : c}</span>
      ))}
    </span>
  );
}

export function TableauLangues({ langue, choisir }: { langue: string; choisir: (l: string) => void }) {
  const lignes = [...LANGUES_DIALOGUES, SANS_DIALOGUE];
  const carte = CARTES[langue] ?? CARTES.Français!;
  return (
    <div className="cn-langue-mise">
    <div className="cn-tableau" role="group" aria-label="Langue des dialogues">
      <div className="cn-tableau-tete" aria-hidden="true"><span>Langue</span><span>Destination</span><span>Statut</span></div>
      {lignes.map((l) => {
        const choisie = l === langue;
        return (
          <button key={l} type="button" className="cn-tableau-ligne" aria-pressed={choisie} onClick={() => choisir(l)}>
            <span className="cn-tableau-langue" lang={l === SANS_DIALOGUE ? "fr" : undefined}>{l}</span>
            <span className="cn-tableau-ville">{VILLES[l]}</span>
            <span className="cn-tableau-statut">{choisie ? <Palettes key={l} texte={STATUT} anime /> : <span className="cn-tableau-vide">—</span>}</span>
          </button>
        );
      })}
    </div>
      <figure className="cn-carte-postale" key={langue} aria-live="polite">
        <span className="cn-postale-timbre" aria-hidden="true">{VILLES[langue]}</span>
        <span className="cn-postale-cachet" aria-hidden="true">Cadence · {new Date().getFullYear()}</span>
        <p className="cn-postale-bonjour" lang={langue === SANS_DIALOGUE ? "fr" : undefined}>{carte.bonjour}</p>
        <p className="cn-postale-mot">{carte.mot}</p>
        <figcaption>Carte postale de {VILLES[langue]}</figcaption>
      </figure>
    </div>
  );
}
