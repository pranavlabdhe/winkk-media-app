import Link from "next/link";
import { redirect } from "next/navigation";
import { clearSession, getSession } from "@/lib/auth";
import { ensureUnifiedLinks } from "@/lib/activity-service";

async function logoutAction() {
  "use server";
  await clearSession();
  redirect("/login");
}

const nav = [
  ["/my-work", "My Work"],
  ["/dashboard", "Dashboard"],
  ["/clients", "Clients"],
  ["/tasks", "Tasks"],
  ["/posts", "Social Posts"],
  ["/feedback", "Feedback"],
  ["/communications", "Communications"],
  ["/bloggers", "Bloggers"],
  ["/meetings", "Meetings"],
  ["/users", "Team"],
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  ensureUnifiedLinks();

  const visibleNav = nav.filter(([href]) => href !== "/users" || session.role === "owner");
  const roleLabel = session.job_title || (session.role === "owner" ? "Owner" : "Employee");

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="font-semibold text-zinc-900">Winkk Media Task Tracker</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-600">
              {session.name} · {roleLabel}
            </span>
            <form action={logoutAction}>
              <button className="rounded border px-2 py-1 hover:bg-zinc-50">Logout</button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 pb-3 text-sm">
          {visibleNav.map(([href, label]) => (
            <Link key={href} href={href} className="rounded px-2 py-1 text-zinc-700 hover:bg-zinc-100">
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}
