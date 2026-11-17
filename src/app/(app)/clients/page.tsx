import { revalidatePath } from "next/cache";
import Link from "next/link";
import db from "@/lib/db";

async function createClient(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  db.prepare("INSERT INTO clients (name, instagram_handle, whatsapp_group, notes) VALUES (?,?,?,?)").run(
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
  const clients = db.prepare("SELECT * FROM clients ORDER BY created_at DESC").all() as any[];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Clients</h1>
      <form action={createClient} className="grid gap-2 rounded-lg border bg-white p-4 md:grid-cols-5">
        <input name="name" placeholder="Client name *" required className="rounded border px-3 py-2" />
        <input name="instagram_handle" placeholder="Instagram handle" className="rounded border px-3 py-2" />
        <input name="whatsapp_group" placeholder="WhatsApp group" className="rounded border px-3 py-2" />
        <input name="notes" placeholder="Notes" className="rounded border px-3 py-2" />
        <button className="rounded bg-zinc-900 px-3 py-2 text-white">Add client</button>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left"><tr><th className="p-2">Name</th><th className="p-2">Instagram</th><th className="p-2">WhatsApp</th><th className="p-2">Notes</th><th className="p-2">Actions</th></tr></thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2 font-medium"><Link className="text-blue-700 hover:underline" href={`/clients/${c.id}`}>{c.name}</Link></td>
                <td className="p-2">{c.instagram_handle || "-"}</td>
                <td className="p-2">{c.whatsapp_group || "-"}</td>
                <td className="p-2">{c.notes || "-"}</td>
                <td className="p-2">
                  <form action={deleteClient}><input type="hidden" name="id" value={c.id} /><button className="text-red-700 hover:underline">Delete</button></form>
                </td>
              </tr>
            ))}
            {clients.length === 0 && <tr><td className="p-4 text-zinc-500" colSpan={5}>No clients yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
