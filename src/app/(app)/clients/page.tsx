import { revalidatePath } from "next/cache";
import Link from "next/link";
import db from "@/lib/db";
import { DeleteButton } from "@/components/delete-button";

async function createClient(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  db.prepare(
    "INSERT INTO clients (name, instagram_handle, whatsapp_group, notes) VALUES (?,?,?,?)"
  ).run(
    name,
    String(formData.get("instagram_handle") || "").trim() || null,
    String(formData.get("whatsapp_group") || "").trim() || null,
    String(formData.get("notes") || "").trim() || null
  );
  revalidatePath("/clients");
}

async function deleteClient(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  if (id) db.prepare("DELETE FROM clients WHERE id = ?").run(id);
  revalidatePath("/clients");
}

export default async function ClientsPage() {
  const clients = db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM client_team ct WHERE ct.client_id=c.id) team_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.client_id=c.id AND t.status!='done') open_tasks_count,
              (SELECT COUNT(*) FROM posts p WHERE p.client_id=c.id) posts_count
       FROM clients c
       ORDER BY c.created_at DESC`
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#12143d]">
              Client Accounts &amp; Brands
            </h1>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Dedicated client hubs for restaurant branding, campaigns, team assignments, and unified activity timelines.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-slate-700 shadow-2xs">
            Active Accounts: <b className="text-[#12143d]">{clients.length}</b>
          </div>
        </div>
      </div>

      {/* Add New Client Form Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#ed8527]/10 text-[#ed8527]">
              +
            </span>
            <h2 className="text-sm font-bold text-[#12143d]">
              Register New Client Account
            </h2>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Client name is mandatory
          </span>
        </div>

        <form action={createClient} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Client Brand Name <span className="text-rose-500">*</span>
              </label>
              <input
                name="name"
                required
                placeholder="e.g. Solhaus Bistro"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instagram Handle
              </label>
              <input
                name="instagram_handle"
                placeholder="@solhaus.official"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                WhatsApp Group Name
              </label>
              <input
                name="whatsapp_group"
                placeholder="Solhaus & Winkk Core"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Internal Account Notes
              </label>
              <input
                name="notes"
                placeholder="Key deliverables, billing tier, etc."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto rounded-xl bg-[#ed8527] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 transition-all hover:bg-[#d97116] hover:shadow-lg active:scale-[0.99] cursor-pointer"
            >
              + Add Client Account
            </button>
          </div>
        </form>
      </div>

      {/* Client Accounts Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((c) => (
          <div
            key={c.id}
            className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-sm"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    <Link
                      href={`/clients/${c.id}`}
                      className="text-[#12143d] hover:text-[#ed8527] transition-colors"
                    >
                      {c.name}
                    </Link>
                  </h3>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {c.instagram_handle || "No IG handle"}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/clients/${c.id}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-[#12143d] hover:bg-[#12143d] hover:text-white transition-all shadow-2xs"
                >
                  Hub →
                </Link>
              </div>

              {/* Social / WhatsApp details */}
              <div className="space-y-1.5 rounded-xl bg-slate-50/70 p-3 text-xs border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">WhatsApp Group:</span>
                  <span className="font-semibold text-slate-800 line-clamp-1">
                    {c.whatsapp_group || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Team Assigned:</span>
                  <span className="font-semibold text-slate-800">
                    {c.team_count} member{c.team_count === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {c.notes && (
                <p className="text-xs text-slate-500 italic line-clamp-2">
                  &quot;{c.notes}&quot;
                </p>
              )}
            </div>

            {/* Bottom stats and action */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-50 px-2 py-0.5 font-bold text-amber-800 border border-amber-200">
                  {c.open_tasks_count} Open Tasks
                </span>
                <span className="rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-800 border border-blue-200">
                  {c.posts_count} Posts
                </span>
              </div>

              <form action={deleteClient}>
                <input type="hidden" name="id" value={c.id} />
                <DeleteButton confirmMessage={`Are you sure you want to delete ${c.name}?`} />
              </form>
            </div>
          </div>
        ))}

        {!clients.length && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-xs text-slate-500">
            No client accounts created yet.
          </div>
        )}
      </div>
    </div>
  );
}
