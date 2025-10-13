import fs from "node:fs/promises";
import { execSync } from "node:child_process";
import OpenAI from "openai";

const sh = (c) => execSync(c, { stdio: "inherit" });
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_PROJECT_ID
});

async function main() {
  const goal =
    process.env.AGENT_GOAL ||
    "Fix sticky Station Drawer: open on marker click, stay open until closed (Close/ESC). No Leaflet <Popup>. Do NOT touch /api/**.";

  // Focused file list (adjust if needed)
  const focus = [
    "components/EnhancedMapV2.jsx",
    "components/EnhancedMap.jsx",
    "components/Map/ClientMap.tsx",
    "components/Map/CouncilLayer.tsx",
    "components/ClusterLayer.tsx",
    "components/StationDrawer.tsx",
    "pages/index.jsx"
  ];

  let context = "";
  for (const f of focus) {
    try { context += `\n\n===== FILE: ${f} =====\n` + await fs.readFile(f, "utf8"); } catch {}
  }

  const system = `
You are a senior release engineer.
Return ONE bash script that:
- edits only UI files under components/** or pages/**; never /api/**
- NEVER adds any Leaflet <Popup>
- wires StationDrawer into the active map so clicking a station opens it and it stays open until Close/ESC
- uses sed/awk/heredoc edits; idempotent
- ends with: npm run build || true
Output ONLY a fenced bash block.
`.trim();

  const user = `Goal: ${goal}\n\nRepo excerpts (read-only):\n${context}`.trim();

  const resp = await client.responses.create({
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.2
  });

  const text = resp.output_text || "";
  const m = text.match(/```bash([\s\S]*?)```/);
  if (!m) throw new Error("No bash block in agent output.");

  await fs.writeFile(".agent_patch.sh", m[1].trim() + "\n", { mode: 0o755 });

  // Work on a new branch per run
  const branch = `agent/ui-fix-${Date.now()}`;
  sh(`git switch -c ${branch}`);
  sh(`bash .agent_patch.sh`);

  // Guardrail: no Popups reintroduced
  try { sh(`git grep -n "<Popup"`); throw new Error("Leaflet <Popup> found. Aborting."); } catch {}

  sh(`git add -A`);
  sh(`git commit -m "ui(agent): wire sticky StationDrawer; no Leaflet Popup; UI-only" || true`);
  sh(`git push -u origin ${branch}`);

  // Try to open a PR (if gh cli available), otherwise print branch
  try {
    sh(`gh pr create --fill --title "UI: sticky Station Drawer (agent)" --body "Auto UI-only patch. Vercel will build a Preview."`);
  } catch {
    console.log(`\nCreated branch: ${branch}\nOpen a PR from this branch.`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
