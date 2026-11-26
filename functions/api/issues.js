const OWNER = "Albertranders";
const REPO = "Studieplussync";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) return json({ error: "Ugyldig forespørgsel." }, 403);
  if (!env.GITHUB_TOKEN) return json({ error: "Fejlrapportering er ikke konfigureret endnu." }, 503);
  let data;
  try { data = await request.json(); } catch { return json({ error: "Ugyldige formulardata." }, 400); }
  if (typeof data.website === "string" && data.website.trim()) return json({ ok: true }, 200);
  const title = clean(data.title, 120), details = clean(data.details, 5000);
  const code = clean(data.code, 8), browser = clean(data.browser, 300);\n  const email = clean(data.email, 254);\n  const consent = data.consent === "yes";
  if (!title || !details || !email) return json({ error: "Udfyld overskrift, e-mailadresse og fejlbeskrivelse." }, 400);\n  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return json({ error: "Indtast en gyldig e-mailadresse." }, 400);\n  if (!consent) return json({ error: "Du skal give tilladelse til at blive kontaktet om fejlrapporten." }, 400);
  if (title.length < 5 || details.length < 15) return json({ error: "Beskriv problemet lidt mere detaljeret." }, 400);
  const body = [
    "## Fejlbeskrivelse", details,
    code ? `## Fejlkode\n${code}` : "",
    browser ? `## Browser\n${browser}` : "",
    "---",
    "_Oprettet via StudieSyncs hjemmeside. Fjern private oplysninger fra rapporten, hvis du opdager nogen._"
  ].filter(Boolean).join("\n\n");
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
    method: "POST",
    headers: { "authorization": `Bearer ${env.GITHUB_TOKEN}`, "accept": "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json", "user-agent": "StudieSync-support" },
    body: JSON.stringify({ title, body, labels: ["bug"] })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error("GitHub issue creation failed", response.status, error.message || "");
    return json({ error: response.status === 401 || response.status === 403 ? "Supportens GitHub-forbindelse er ikke sat korrekt op." : "GitHub kunne ikke modtage fejlrapporten lige nu." }, 502);
  }
  const issue = await response.json();
  return json({ ok: true, number: issue.number });
}
function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") : "";
}
function json(value, status) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}