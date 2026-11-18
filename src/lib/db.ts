import Database from "libsql";
import path from "path";
import bcrypt from "bcryptjs";

const dbPath = path.join(process.cwd(), "data.sqlite");
// In production the database lives in Turso (libSQL). Locally we keep using the
// on-disk SQLite file so development works without network access.
const remoteUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN;

type LibsqlOptions = NonNullable<ConstructorParameters<typeof Database>[1]> & {
  authToken?: string;
};

const db = remoteUrl
  ? new Database(remoteUrl, (authToken ? { authToken } : undefined) as LibsqlOptions)
  : new Database(dbPath);

if (!remoteUrl) {
  try {
    // Several build/render workers can open this file at once; wait briefly for
    // a concurrent checkpoint instead of failing the whole build.
    db.pragma("busy_timeout = 5000");
    db.pragma("journal_mode = WAL");
  } catch {
    // The database is already in WAL mode if another process got there first.
  }
}
try {
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
} catch {
  // Some remote libSQL connections reject PRAGMA statements; foreign keys are
  // enforced server-side in that case.
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * One-time migration to the interaction architecture:
 * - legacy feedback states move into the lifecycle column,
 * - existing feedback gets a subject,
 * - existing feedback/task links are copied into the join table,
 * - communications record who logged them.
 */
function migrateInteractions() {
  const claim = db
    .prepare("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('interaction_uda_v1','done')")
    .run();
  if (claim.changes === 0) return;

  const owner = db.prepare("SELECT id FROM users WHERE role='owner' ORDER BY id LIMIT 1").get() as any;

  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE feedback SET status = CASE action_status
           WHEN 'implemented' THEN 'resolved'
           WHEN 'ignored' THEN 'closed'
           WHEN 'requires_discussion' THEN 'under_review'
           ELSE 'new' END`
      ).run();

      db.prepare(
        "UPDATE feedback SET title = substr(content,1,80) WHERE title IS NULL OR title = ''"
      ).run();

      db.prepare(
        `INSERT OR IGNORE INTO feedback_tasks (feedback_id, task_id)
         SELECT id, task_id FROM feedback WHERE task_id IS NOT NULL`
      ).run();

      if (owner) {
        db.prepare("UPDATE communications SET recorded_by=? WHERE recorded_by IS NULL").run(
          owner.id
        );
      }

      db.prepare(
        `UPDATE feedback SET resolved_at=created_at
         WHERE resolved_at IS NULL AND status IN ('resolved','closed')`
      ).run();
    })();
  } catch (error) {
    db.prepare("DELETE FROM app_settings WHERE key='interaction_uda_v1'").run();
    console.error("Interaction migration failed", error);
  }
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','employee')),
      job_title TEXT,
      department TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      instagram_handle TEXT,
      whatsapp_group TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      client_id INTEGER,
      assigned_to INTEGER NOT NULL,
      assigned_by INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('todo','in_progress','done')),
      category TEXT NOT NULL DEFAULT 'other',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
      due_date TEXT,
      origin_module TEXT NOT NULL DEFAULT 'tasks',
      linked_blogger_id INTEGER,
      activity_at TEXT,
      follow_up_of_task_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(assigned_by) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS task_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS client_team (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      task_id INTEGER,
      title TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'Instagram',
      scheduled_at TEXT,
      published_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('scheduled','published','pending','missed')),
      caption TEXT,
      post_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      post_id INTEGER,
      task_id INTEGER,
      content TEXT NOT NULL,
      action_status TEXT NOT NULL CHECK(action_status IN ('implemented','ignored','pending','requires_discussion')),
      action_taken TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE SET NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS feedback_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS communications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      task_id INTEGER,
      executive_name TEXT NOT NULL,
      whatsapp_group TEXT,
      client_message_at TEXT,
      response_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('responded','pending','missed','delayed')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS bloggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      handle TEXT,
      contact TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS blogger_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blogger_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      task_id INTEGER,
      scheduled_date TEXT,
      assignment_status TEXT NOT NULL CHECK(assignment_status IN ('assigned','in_progress','completed','cancelled')),
      completion_status TEXT NOT NULL CHECK(completion_status IN ('not_started','in_progress','completed')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(blogger_id) REFERENCES bloggers(id) ON DELETE CASCADE,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      task_id INTEGER,
      title TEXT NOT NULL,
      meeting_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('upcoming','completed','cancelled')),
      discussion_notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      task_id INTEGER,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feedback_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(feedback_id, task_id),
      FOREIGN KEY(feedback_id) REFERENCES feedback(id) ON DELETE CASCADE,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  // Safe upgrades for databases created by earlier versions of the app.
  ensureColumn("users", "job_title", "TEXT");
  ensureColumn("users", "department", "TEXT");
  ensureColumn("users", "is_active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("tasks", "category", "TEXT NOT NULL DEFAULT 'other'");
  // Priority is a stored, user-set task property. Tasks created before this
  // column existed are backfilled to Medium below.
  ensureColumn("tasks", "priority", "TEXT NOT NULL DEFAULT 'medium'");
  ensureColumn("tasks", "updated_at", "TEXT");
  ensureColumn("tasks", "origin_module", "TEXT NOT NULL DEFAULT 'tasks'");
  ensureColumn("tasks", "linked_blogger_id", "INTEGER");
  ensureColumn("tasks", "activity_at", "TEXT");
  ensureColumn("tasks", "follow_up_of_task_id", "INTEGER");
  // Tracks when the task was last handed to its current assignee. Existing
  // rows fall back to their creation date, which is when they were assigned.
  ensureColumn("tasks", "assigned_at", "TEXT");
  ensureColumn("posts", "task_id", "INTEGER");
  ensureColumn("feedback", "task_id", "INTEGER");
  ensureColumn("communications", "task_id", "INTEGER");
  ensureColumn("blogger_assignments", "task_id", "INTEGER");
  ensureColumn("meetings", "task_id", "INTEGER");
  db.prepare("UPDATE tasks SET updated_at = COALESCE(updated_at, created_at)").run();
  db.prepare("UPDATE tasks SET assigned_at = COALESCE(assigned_at, created_at)").run();
  // Legacy rows and unknown values always fall back to the Medium default.
  db.prepare(
    "UPDATE tasks SET priority = 'medium' WHERE priority IS NULL OR priority = '' OR priority NOT IN ('high','medium','low')"
  ).run();

  // Communication is the interaction record; feedback is a specialised record
  // created from it. These columns keep the interaction history immutable while
  // the feedback row owns its own lifecycle.
  ensureColumn("communications", "communication_type", "TEXT NOT NULL DEFAULT 'general'");
  ensureColumn("communications", "channel", "TEXT NOT NULL DEFAULT 'whatsapp'");
  ensureColumn("communications", "recorded_by", "INTEGER");
  ensureColumn("feedback", "communication_id", "INTEGER");
  ensureColumn("feedback", "title", "TEXT");
  ensureColumn("feedback", "category", "TEXT NOT NULL DEFAULT 'other'");
  ensureColumn("feedback", "sentiment", "TEXT NOT NULL DEFAULT 'neutral'");
  ensureColumn("feedback", "priority", "TEXT NOT NULL DEFAULT 'medium'");
  ensureColumn("feedback", "action_required", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("feedback", "assigned_to", "INTEGER");
  ensureColumn("feedback", "due_date", "TEXT");
  ensureColumn("feedback", "status", "TEXT NOT NULL DEFAULT 'new'");
  ensureColumn("feedback", "resolved_at", "TEXT");
  ensureColumn("feedback_updates", "user_id", "INTEGER");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON tasks(client_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_at ON tasks(assigned_at);
    CREATE INDEX IF NOT EXISTS idx_task_updates_task_id ON task_updates(task_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_client_team_unique ON client_team(client_id, user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_task_unique ON posts(task_id) WHERE task_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_task_unique ON feedback(task_id) WHERE task_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_communications_task_unique ON communications(task_id) WHERE task_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_blogger_assignments_task_unique ON blogger_assignments(task_id) WHERE task_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_task_unique ON meetings(task_id) WHERE task_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_activity_log_client ON activity_log(client_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_log_task ON activity_log(task_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_communication ON feedback(communication_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_tasks_task ON feedback_tasks(task_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_comm_title_unique
      ON feedback(communication_id, lower(title))
      WHERE communication_id IS NOT NULL AND title IS NOT NULL;
  `);

  // Keep assigned_at accurate no matter which code path creates or reassigns a
  // task (task board, feedback, meeting, communication, seeded demo data).
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_tasks_assigned_at_insert
    AFTER INSERT ON tasks
    FOR EACH ROW
    WHEN NEW.assigned_at IS NULL
    BEGIN
      UPDATE tasks SET assigned_at = COALESCE(NEW.created_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_tasks_assigned_at_reassign
    AFTER UPDATE OF assigned_to ON tasks
    FOR EACH ROW
    WHEN NEW.assigned_to IS NOT OLD.assigned_to
    BEGIN
      UPDATE tasks SET assigned_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  migrateInteractions();

  const demoPasswordHash = bcrypt.hashSync(
    process.env.SEED_DEMO_PASSWORD || "password123",
    10
  );
  const ownerPasswordHash = bcrypt.hashSync(
    process.env.SEED_OWNER_PASSWORD || process.env.SEED_DEMO_PASSWORD || "password123",
    10
  );

  function seedUser(
    name: string,
    email: string,
    role: "owner" | "employee",
    jobTitle: string,
    department: string,
    passwordHash = demoPasswordHash
  ) {
    const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email) as any;
    if (!existing) {
      db.prepare(
        "INSERT INTO users (name,email,password_hash,role,job_title,department) VALUES (?,?,?,?,?,?)"
      ).run(name, email, passwordHash, role, jobTitle, department);
    } else {
      db.prepare(
        "UPDATE users SET job_title=COALESCE(job_title,?), department=COALESCE(department,?) WHERE email=?"
      ).run(jobTitle, department, email);
    }
  }

  seedUser("Owner", "owner@winkk.media", "owner", "Owner", "management", ownerPasswordHash);
  seedUser(
    "Social Media Executive",
    "social@winkk.media",
    "employee",
    "Social Media Executive",
    "social"
  );
  seedUser("Designer 1", "designer1@winkk.media", "employee", "Designer", "design");
  seedUser("Designer 2", "designer2@winkk.media", "employee", "Designer", "design");
  seedUser(
    "Marketing Strategist",
    "strategy@winkk.media",
    "employee",
    "Marketing Strategist",
    "strategy"
  );

  const seedClients = ["Solhaus", "Grill Master", "Rasraj"];
  for (const clientName of seedClients) {
    const existing = db.prepare("SELECT id FROM clients WHERE name=?").get(clientName) as any;
    if (!existing) db.prepare("INSERT INTO clients (name) VALUES (?)").run(clientName);
  }

  // Seed sensible client ownership once. The owner can change it from each client page.
  const teamSeed = db
    .prepare("SELECT value FROM app_settings WHERE key='client_team_seeded'")
    .get() as any;
  if (!teamSeed) {
    const social = db.prepare("SELECT id FROM users WHERE email='social@winkk.media'").get() as any;
    const strategist = db
      .prepare("SELECT id FROM users WHERE email='strategy@winkk.media'")
      .get() as any;
    const clients = db.prepare("SELECT id FROM clients WHERE name IN ('Solhaus','Grill Master','Rasraj')").all() as any[];
    const insertTeam = db.prepare("INSERT OR IGNORE INTO client_team (client_id,user_id) VALUES (?,?)");
    for (const client of clients) {
      if (social) insertTeam.run(client.id, social.id);
      if (strategist) insertTeam.run(client.id, strategist.id);
    }
    db.prepare("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('client_team_seeded','1')").run();
  }
}

initDb();
export default db;
