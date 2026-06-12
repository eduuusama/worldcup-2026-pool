/**
 * Server-only helpers for reading/writing data/results.json on GitHub via the
 * Contents API, shared by the result-updating routes. Keeping git as the single
 * source of truth means a commit here triggers a redeploy and the live site
 * stays in lockstep with whatever updated the scores.
 *
 * Not imported by any client component — uses Buffer + a server token.
 */
import type { Results } from "./types";

const REPO = process.env.GITHUB_REPO ?? "eduuusama/worldcup-2026-pool";
const BRANCH = "main";
const RESULTS_PATH = "data/results.json";

export async function ghGetResults(token: string): Promise<{ results: Results; sha: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${RESULTS_PATH}?ref=${BRANCH}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { results: JSON.parse(content) as Results, sha: data.sha as string };
}

export async function ghPutResults(token: string, results: Results, sha: string, message: string) {
  const body = {
    message,
    content: Buffer.from(JSON.stringify(results, null, 2) + "\n").toString("base64"),
    sha,
    branch: BRANCH,
    committer: { name: "Quinela Bot", email: "quinela@aiclear.org" },
  };
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${RESULTS_PATH}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub PUT failed ${res.status}: ${await res.text()}`);
}

/** Pull the first JSON value (object or array) out of an LLM response. */
export function extractJson<T>(text: string): T | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) return null;
  const open = cleaned[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === open) depth++;
    else if (cleaned[i] === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
