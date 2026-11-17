import { redirect } from "next/navigation";
import { clearSession, getSession } from "@/lib/auth";
import { ensureUnifiedLinks } from "@/lib/activity-service";
import Navbar from "@/components/navbar";

async function logoutAction() {
  "use server";
  await clearSession();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  ensureUnifiedLinks();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <Navbar user={session} logoutAction={logoutAction} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
      <footer className="mt-auto border-t border-slate-200/60 bg-white py-4 text-center text-xs text-slate-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#12143d]">Winkk Media</span>
            <span>· Restaurant Marketing Agency Tracker</span>
          </div>
          <div className="text-slate-400">
            Internal Operations Management System
          </div>
        </div>
      </footer>
    </div>
  );
}
