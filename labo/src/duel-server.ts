/** Serves a duel page on this machine only, and writes the answers into the run's folder: nothing to download or paste. Stops by itself
 * once they are saved. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { checkDuelVotes, type DuelKey, type DuelVotes } from "./duel";

const MAX_BYTES = 100_000;

async function readBody(request: IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of request) {
    size += (part as Buffer).length;
    if (size > MAX_BYTES) throw new Error("Réponses trop longues.");
    parts.push(part as Buffer);
  }
  return Buffer.concat(parts).toString("utf8");
}

/** Resolves once listening; `saved` resolves with the file written. `name`: the folder of the reading inside the run. */
export function serveDuels(folder: string, port: number, name = "confirmation"): Promise<{ url: string; saved: Promise<string>; close: () => void }> {
  const target = join(folder, name);
  const votesFile = join(target, "votes.json");
  if (existsSync(votesFile)) throw new Error(`Réponses déjà enregistrées : ${votesFile}.`);
  const page = readFileSync(join(target, "duels.html"), "utf8");
  const key = JSON.parse(readFileSync(join(target, "key.json"), "utf8")) as DuelKey;

  let done: (file: string) => void;
  const saved = new Promise<string>((resolve) => (done = resolve));
  let host = "";
  const server = createServer(async (request, response) => {
    const answer = (status: number, text: string, type = "text/plain") => {
      response.writeHead(status, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store", connection: "close" });
      response.end(text);
    };
    // Another site open in the browser must not reach this server: its own name, and a type it cannot send without asking first.
    if (request.headers.host !== host) return answer(403, "Hôte refusé.");
    if (request.method === "GET" && request.url === "/") return answer(200, page, "text/html");
    if (request.method !== "POST" || request.url !== "/votes") return answer(404, "Rien ici.");
    if (!request.headers["content-type"]?.startsWith("application/json")) return answer(415, "JSON attendu.");
    try {
      const votes = JSON.parse(await readBody(request)) as DuelVotes;
      checkDuelVotes(key, votes);
      writeFileSync(votesFile, `${JSON.stringify(votes, null, 2)}\n`, { flag: "wx" });
    } catch (e) {
      return answer(400, (e as Error).message);
    }
    response.on("finish", () => {
      server.close();
      done(votesFile);
    });
    answer(200, "Enregistré.");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve({ url: `http://${host}/`, saved, close: () => void server.close() });
    });
  });
}
