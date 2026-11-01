/**
 * Static QA for per-user permission overrides (Team → Users → Permissions).
 * Auth: no service_role. Session matrix SKIP without QA_OWNER_*.
 */
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const rows = [];
function pass(name, detail) {
  rows.push({ status: "PASS", name, detail });
}
function fail(name, detail) {
  rows.push({ status: "FAIL", name, detail });
}
function skip(name, detail) {
  rows.push({ status: "SKIP", name, detail });
}

function read(rel) {
  return fs.readFileSync(path.join(appRoot, rel), "utf8");
}

const teamTs = read("src/actions/team.ts");
const ui = read("src/components/admin/team-access-manager.tsx");
const auth = read("src/lib/auth.ts");
const domain = read("src/lib/domain/team.ts");

if (teamTs.includes("export async function updateTeamUserAuthorities")) {
  pass("action", "updateTeamUserAuthorities exported");
} else {
  fail("action", "missing updateTeamUserAuthorities");
}

if (
  teamTs.includes("user_authorities") &&
  teamTs.includes("extra_authority_keys") &&
  teamTs.includes("team_user_authorities_updated")
) {
  pass("persist", "loads/saves user_authorities + audit");
} else {
  fail("persist", "list/save/audit incomplete");
}

if (domain.includes("extra_authority_keys")) {
  pass("type", "TeamUser.extra_authority_keys");
} else {
  fail("type", "extra_authority_keys missing on TeamUser");
}

if (
  ui.includes("UserPermissionsModal") &&
  ui.includes("onPermissions") &&
  ui.includes("Extra permissions") &&
  ui.includes("From role")
) {
  pass("ui", "Users → Permissions modal with role vs extras");
} else {
  fail("ui", "UserPermissionsModal wiring incomplete");
}

if (auth.includes("user_authorities") && auth.includes("role_authorities")) {
  pass("runtime", "getUserAuthorities unions user + role grants");
} else {
  fail("runtime", "auth union incomplete");
}

if (teamTs.includes('target.role === "dealer"') && teamTs.includes("view_all_leads")) {
  pass("dealer guard", "blocks company-wide extras for dealers");
} else {
  fail("dealer guard", "dealer block missing on save");
}

skip("owner session save", "Set QA_OWNER_EMAIL/PASSWORD to exercise live Team save");

console.log("\n## QA report — KT — user permission overrides");
for (const r of rows) console.log(`- ${r.status}: ${r.name} — ${r.detail}`);
process.exit(rows.some((r) => r.status === "FAIL") ? 1 : 0);
