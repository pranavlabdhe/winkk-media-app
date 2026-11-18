/**
 * Copy the local SQLite database (data.sqlite) into the production Turso
 * database so the deployed app starts with the real team data.
 *
 * Usage:
 *   npm run db:push-turso              # create schema if needed, then replace data
 *   npm run db:push-turso -- --dry-run # only report row counts
 *
 * Required environment variables (from .env.local, .env, or the shell):
 *   TURSO_DATABASE_URL   libsql://<db>-<org>.turso.io
 *   TURSO_AUTH_TOKEN     token from `turso db tokens create <db>`
 *
 * Optional:
 *   SEED_OWNER_PASSWORD  when set, the owner account's password is replaced with
 *                        this value after the copy. Without it the copied hash is
 *                        kept as-is.
 *
 * The script is idempotent: every run replaces the remote rows with the local
 * rows (ids are preserved) and leaves schema creation behind it for the app.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "libsql";
import bcrypt from "bcryptjs";

for (const file of [".env.local", ".env.turso.local", ".env"]) {
  const full = path.join(process.cwd(), file);
  if (fs.existsSync(full)) {
    try {
      process.loadEnvFile(full);
    } catch {
      // Ignore malformed env files; missing values are reported below.
    }
  }
}

const dryRun = process.argv.includes("--dry-run");

const localPath = path.join(process.cwd(), "data.sqlite");
const remoteUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN;

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(localPath)) {
  fail(`Local database not found at ${localPath}. Run the app once to create it.`);
}
if (!remoteUrl) {
  fail(
    "TURSO_DATABASE_URL is not set. Add it to .env.local (or your shell) — see README → Deploy to Vercel (Turso)."
  );
}
if (!remoteUrl.startsWith("libsql://") && !remoteUrl.startsWith("https://")) {
  fail(`TURSO_DATABASE_URL does not look like a libSQL URL: ${remoteUrl}`);
}

// Parent tables must exist before the rows that reference them.
const TABLES = [
  "users",
  "clients",
  "bloggers",
  "tasks",
  "task_updates",
  "client_team",
  "posts",
  "feedback",
  "feedback_updates",
  "communications",
  "blogger_assignments",
  "meetings",
  "feedback_tasks",
  "activity_log",
  "app_settings",
];

const local = new Database(localPath, { readonly: true });
const remote = new Database(remoteUrl, { authToken: authToken || undefined });

function remoteExec(sql) {
  // The remote driver executes multi-statement SQL; a one-statement batch keeps
  // errors attributable to a single statement.
  return remote.exec(sql);
}

function withIfNotExists(sql) {
  return sql
    .replace(/^CREATE TABLE\s+(?!IF NOT EXISTS)/i, "CREATE TABLE IF NOT EXISTS ")
    .replace(/^CREATE UNIQUE INDEX\s+(?!IF NOT EXISTS)/i, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/^CREATE INDEX\s+(?!IF NOT EXISTS)/i, "CREATE INDEX IF NOT EXISTS ")
    .replace(/^CREATE TRIGGER\s+(?!IF NOT EXISTS)/i, "CREATE TRIGGER IF NOT EXISTS ");
}

function quote(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function objects(type, order) {
  return local
    .prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = ? AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
       ORDER BY ${order}`
    )
    .all(type);
}

try {
  remote.prepare("SELECT 1").get();
} catch (error) {
  fail(`Could not connect to Turso: ${error instanceof Error ? error.message : error}`);
}

const existing = new Set(
  remote
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name)
);

if (!existing.has("users")) {
  console.log("Remote database is empty — creating schema from data.sqlite …");
  for (const { sql } of [
    ...objects("table", "rowid"),
    ...objects("index", "rowid"),
    ...objects("trigger", "rowid"),
  ]) {
    try {
      remoteExec(withIfNotExists(sql));
    } catch (error) {
      fail(
        `Schema creation failed for:\n${sql}\n\n${error instanceof Error ? error.message : error}`
      );
    }
  }
}

const counts = new Map();
for (const table of TABLES) {
  const { c } = local.prepare(`SELECT COUNT(*) c FROM ${quote(table)}`).get();
  counts.set(table, Number(c));
}

console.log("\nLocal row counts:");
for (const table of TABLES) {
  console.log(`  ${table.padEnd(20)} ${counts.get(table)}`);
}

if (dryRun) {
  console.log("\nDry run only — nothing was written to Turso.");
  process.exit(0);
}

function insertRows(table) {
  const columns = local.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => row.name);
  if (!columns.length) return;
  const rows = local.prepare(`SELECT * FROM ${quote(table)}`).all();
  if (!rows.length) {
    remote.prepare(`DELETE FROM ${quote(table)}`).run();
    return;
  }

  const columnList = columns.map(quote).join(",");
  const rowPlaceholders = `(${columns.map(() => "?").join(",")})`;
  const batchSize = Math.max(1, Math.floor(500 / columns.length));

  const replace = remote.transaction(() => {
    remote.prepare(`DELETE FROM ${quote(table)}`).run();
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      const values = batch.flatMap((row) => columns.map((column) => row[column]));
      const placeholders = batch.map(() => rowPlaceholders).join(",");
      remote
        .prepare(`INSERT INTO ${quote(table)} (${columnList}) VALUES ${placeholders}`)
        .run(...values);
    }
  });
  replace();
}

try {
  // Children first so foreign keys never point at a row that is about to vanish.
  for (const table of [...TABLES].reverse()) {
    remote.prepare(`DELETE FROM ${quote(table)}`).run();
  }

  for (const table of TABLES) {
    insertRows(table);
  }
} catch (error) {
  fail(`Copy failed: ${error instanceof Error ? error.message : error}`);
}

let mismatch = false;
console.log("\nRemote row counts:");
for (const table of TABLES) {
  const { c } = remote.prepare(`SELECT COUNT(*) c FROM ${quote(table)}`).get();
  const remoteCount = Number(c);
  const ok = remoteCount === counts.get(table);
  if (!ok) mismatch = true;
  console.log(`  ${table.padEnd(20)} ${remoteCount} ${ok ? "✓" : `✖ expected ${counts.get(table)}`}`);
}

if (mismatch) {
  fail("Row counts do not match the local database.");
}

if (process.env.SEED_OWNER_PASSWORD) {
  const hash = bcrypt.hashSync(process.env.SEED_OWNER_PASSWORD, 10);
  const result = remote
    .prepare("UPDATE users SET password_hash=? WHERE role='owner'")
    .run(hash);
  console.log(`\nOwner password replaced for ${result.changes} account(s) from SEED_OWNER_PASSWORD.`);
}

console.log("\n✔ Turso is in sync with data.sqlite.\n");
