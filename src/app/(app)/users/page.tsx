import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import { DEPARTMENTS, departmentLabel, isDepartment } from "@/lib/constants";

async function createUser(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "owner") return;

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "employee") === "owner" ? "owner" : "employee";
  const jobTitle = String(formData.get("job_title") || "").trim() || null;
  const departmentRaw = String(formData.get("department") || "other");
  const department = isDepartment(departmentRaw) ? departmentRaw : "other";
  if (!name || !email || !password) return;

  try {
    db.prepare(
      "INSERT INTO users (name,email,password_hash,role,job_title,department) VALUES (?,?,?,?,?,?)"
    ).run(name, email, bcrypt.hashSync(password, 10), role, jobTitle, department);
  } catch {
    // Duplicate email: leave the existing account untouched.
  }
  revalidatePath("/users");
  revalidatePath("/dashboard");
}

async function updateUser(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "owner") return;

  const id = Number(formData.get("id"));
  if (!id) return;
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!name || !email) return;
  const role = String(formData.get("role") || "employee") === "owner" ? "owner" : "employee";
  const jobTitle = String(formData.get("job_title") || "").trim() || null;
  const departmentRaw = String(formData.get("department") || "other");
  const department = isDepartment(departmentRaw) ? departmentRaw : "other";
  const newPassword = String(formData.get("new_password") || "");

  try {
    db.prepare(
      "UPDATE users SET name=?, email=?, role=?, job_title=?, department=? WHERE id=?"
    ).run(name, email, role, jobTitle, department, id);
    if (newPassword.trim()) {
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(bcrypt.hashSync(newPassword, 10), id);
    }
  } catch {
    // Duplicate email: keep the existing values.
  }
  revalidatePath("/users");
  revalidatePath("/dashboard");
}

async function toggleUserActive(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session || session.role !== "owner") return;
  const id = Number(formData.get("id"));
  if (!id || id === session.id) return;
  const user = db.prepare("SELECT is_active FROM users WHERE id=?").get(id) as any;
  if (!user) return;
  db.prepare("UPDATE users SET is_active=? WHERE id=?").run(user.is_active ? 0 : 1, id);
  revalidatePath("/users");
  revalidatePath("/dashboard");
}

export default async function UsersPage() {
  const session = await getSession();
  if (!session || session.role !== "owner") redirect("/dashboard");

  const users = db
    .prepare(
      `SELECT u.id,u.name,u.email,u.role,u.job_title,u.department,u.is_active,u.created_at,
              SUM(CASE WHEN t.status!='done' THEN 1 ELSE 0 END) open_tasks,
              SUM(CASE WHEN t.status!='done' AND t.due_date IS NOT NULL AND t.due_date < date('now') THEN 1 ELSE 0 END) overdue_tasks
       FROM users u
       LEFT JOIN tasks t ON t.assigned_to=u.id
       GROUP BY u.id
       ORDER BY u.is_active DESC, u.role DESC, u.name`
    )
    .all() as any[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm">
          Add team members, set their role/job title, and deactivate accounts when someone leaves without
          losing their task history.
        </p>
      </div>

      <form action={createUser} className="grid gap-2 rounded-lg border bg-white p-4 md:grid-cols-4">
        <input name="name" required placeholder="Name *" className="rounded border px-3 py-2" />
        <input name="email" type="email" required placeholder="Email *" className="rounded border px-3 py-2" />
        <input name="password" type="password" required placeholder="Temporary password *" className="rounded border px-3 py-2" />
        <select name="role" className="rounded border px-3 py-2">
          <option value="employee">employee</option>
          <option value="owner">owner</option>
        </select>
        <input name="job_title" placeholder="Job title e.g. Designer" className="rounded border px-3 py-2" />
        <select name="department" className="rounded border px-3 py-2">
          {DEPARTMENTS.map((department) => (
            <option key={department.value} value={department.value}>
              {department.label}
            </option>
          ))}
        </select>
        <button className="rounded px-3 py-2 md:col-span-2">Add team member</button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {users.map((user) => (
          <div key={user.id} className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold">
                  {user.name} {user.is_active ? "" : "· INACTIVE"}
                </div>
                <div className="text-sm">{user.email}</div>
                <div className="text-sm">
                  {user.job_title || "No job title"} · {departmentLabel(user.department)}
                </div>
              </div>
              <div className="text-right text-sm">
                <div>{user.role}</div>
                <div>Open: {user.open_tasks || 0}</div>
                <div>Overdue: {user.overdue_tasks || 0}</div>
              </div>
            </div>
            <form action={updateUser} className="mt-3 grid gap-2 md:grid-cols-3">
              <input type="hidden" name="id" value={user.id} />
              <input
                name="name"
                defaultValue={user.name}
                required
                placeholder="Name"
                className="rounded border px-2 py-1 text-sm"
              />
              <input
                name="email"
                type="email"
                defaultValue={user.email}
                required
                placeholder="Email"
                className="rounded border px-2 py-1 text-sm"
              />
              <input
                name="job_title"
                defaultValue={user.job_title || ""}
                placeholder="Job title"
                className="rounded border px-2 py-1 text-sm"
              />
              <select name="role" defaultValue={user.role} className="rounded border px-2 py-1 text-sm">
                <option value="employee">employee</option>
                <option value="owner">owner</option>
              </select>
              <select
                name="department"
                defaultValue={user.department || "other"}
                className="rounded border px-2 py-1 text-sm"
              >
                {DEPARTMENTS.map((department) => (
                  <option key={department.value} value={department.value}>
                    {department.label}
                  </option>
                ))}
              </select>
              <input
                name="new_password"
                type="password"
                placeholder="New password (optional)"
                className="rounded border px-2 py-1 text-sm"
              />
              <button className="rounded px-2 py-1 text-sm md:col-span-2">Save changes</button>
            </form>
            {user.id !== session.id && (
              <form action={toggleUserActive} className="mt-2">
                <input type="hidden" name="id" value={user.id} />
                <button className="rounded px-2 py-1 text-sm">
                  {user.is_active ? "Deactivate account" : "Reactivate account"}
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
