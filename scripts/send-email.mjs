/**
 * Send an HTML email via Resend.
 *
 *   node scripts/send-email.mjs --to someone@example.com \
 *     --subject "Asunto" --html path/to/body.html
 *
 * The API key is read from RESEND_API_KEY in the environment, falling back to
 * the gitignored .env.local next to package.json. Sender is quinela@aiclear.org
 * (aiclear.org is the verified domain on the Resend team that owns the key).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const to = arg("to");
const subject = arg("subject");
const htmlPath = arg("html");
if (!to || !subject || !htmlPath) {
  console.error('usage: node scripts/send-email.mjs --to a@b.com --subject "..." --html body.html');
  process.exit(1);
}

let key = process.env.RESEND_API_KEY;
if (!key) {
  const envFile = path.join(ROOT, ".env.local");
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, "utf8").match(/^RESEND_API_KEY=(.+)$/m);
    if (m) key = m[1].trim();
  }
}
if (!key) {
  console.error("RESEND_API_KEY not found in env or .env.local");
  process.exit(1);
}

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    from: "Gran Quinela Mundialista <quinela@aiclear.org>",
    to: to.split(",").map((s) => s.trim()),
    subject,
    html: fs.readFileSync(htmlPath, "utf8"),
  }),
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Resend error ${res.status}:`, JSON.stringify(body));
  process.exit(1);
}
console.log("sent:", body.id ?? JSON.stringify(body));
