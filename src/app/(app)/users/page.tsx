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
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
        bcrypt.hashSync(newPassword, 10),
        id
      );
    }
  } catch {
    // Duplicate email
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12143d] text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              Agency Team &amp; Permissions
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Owner portal for team access, job titles, department assignments, and security resets.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-slate-700 shadow-2xs">
            Team Members: <b className="text-[#12143d]">{users.length}</b>
          </div>
        </div>
      </div>

      {/* Add Team Member Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#ed8527]/10 text-[#ed8527]">
              +
            </span>
            <h2 className="text-sm font-bold text-[#12143d]">
              Add New Team Member
            </h2>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Provision user login &amp; task assignments
          </span>
        </div>

        <form action={createUser} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                name="name"
                required
                placeholder="e.g. Rahul Sharma"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Email <span className="text-rose-500">*</span>
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="rahul@winkk.media"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Temporary Password <span className="text-rose-500">*</span>
              </label>
              <input
                name="password"
                type="password"
                required
                placeholder="Minimum 6 characters"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                System Role
              </label>
              <select
                name="role"
                defaultValue="employee"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              >
                <option value="employee">Employee (Standard access)</option>
                <option value="owner">Owner (Full administrative rights)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Job Title
              </label>
              <input
                name="job_title"
                placeholder="e.g. Senior Graphic Designer"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Department
              </label>
              <select
                name="department"
                defaultValue="design"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept.value} value={dept.value}>
                    {dept.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="w-full sm:w-auto rounded-xl bg-[#ed8527] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 hover:bg-[#d97116] transition-all cursor-pointer"
            >
              + Create Team Account
            </button>
          </div>
        </form>
      </div>

      {/* Team Roster Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 px-1">
          Active Team Directory ({users.length})
        </h3>

        <div className="grid gap-4 lg:grid-cols-2">
          {users.map((user) => (
            <div
              key={user.id}
              className={`rounded-2xl border bg-white p-5 shadow-xs transition-all hover:border-slate-300 space-y-4 ${
                !user.is_active ? "opacity-60 bg-slate-50" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#12143d] text-white font-bold text-sm">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      {user.name}
                      {!user.is_active && (
                        <span className="ml-2 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                          DEACTIVATED
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-500">{user.email}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {user.job_title || "No Title"}
                      </span>
                      <span>·</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {departmentLabel(user.department)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right text-xs space-y-1">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                      user.role === "owner"
                        ? "bg-[#12143d] text-white border-[#12143d]"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {user.role === "owner" ? "Owner" : "Employee"}
                  </span>
                  <div className="text-slate-500">
                    Open Tasks: <b className="text-slate-800">{user.open_tasks || 0}</b>
                  </div>
                  {user.overdue_tasks > 0 && (
                    <div className="text-rose-600 font-bold">
                      Overdue: {user.overdue_tasks}
                    </div>
                  )}
                </div>
              </div>

              {/* Edit User Form */}
              <form
                action={updateUser}
                className="grid gap-2.5 rounded-xl bg-slate-50/70 p-3.5 border border-slate-100 sm:grid-cols-3 text-xs"
              >
                <input type="hidden" name="id" value={user.id} />
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                    Name
                  </label>
                  <input
                    name="name"
                    defaultValue={user.name}
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={user.email}
                    required
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                    Job Title
                  </label>
                  <input
                    name="job_title"
                    defaultValue={user.job_title || ""}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                    Role
                  </label>
                  <select
                    name="role"
                    defaultValue={user.role}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                  >
                    <option value="employee">Employee</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                    Department
                  </label>
                  <select
                    name="department"
                    defaultValue={user.department || "other"}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept.value} value={dept.value}>
                        {dept.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                    Reset Password
                  </label>
                  <input
                    name="new_password"
                    type="password"
                    placeholder="New password"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div className="sm:col-span-3 flex justify-end">
                  <button
                    type="submit"
                    className="rounded-lg bg-[#12143d] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#20245e] transition-colors cursor-pointer shadow-2xs"
                  >
                    Save Changes
                  </button>
                </div>
              </form>

              {/* Deactivate Account Action */}
              {user.id !== session.id && (
                <div className="flex justify-end pt-1">
                  <form action={toggleUserActive}>
                    <input type="hidden" name="id" value={user.id} />
                    <button
                      type="submit"
                      className={`text-xs font-semibold cursor-pointer ${
                        user.is_active
                          ? "text-rose-600 hover:underline"
                          : "text-emerald-700 hover:underline"
                      }`}
                    >
                      {user.is_active ? "Deactivate Account" : "Reactivate Account"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
