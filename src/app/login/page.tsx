import { redirect } from "next/navigation";
import { getSession, setSession, verifyLogin } from "@/lib/auth";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = verifyLogin(email, password);
  if (!user) redirect("/login?error=1");
  await setSession(user);
  redirect(user.role === "owner" ? "/dashboard" : "/my-work");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(session.role === "owner" ? "/dashboard" : "/my-work");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold text-zinc-900">Winkk Media Tracker</h1>
        <p className="mt-1 text-sm text-zinc-600">Sign in to manage clients and tasks.</p>
        {error ? <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">Invalid email or password.</p> : null}
        <form action={loginAction} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Email</label>
            <input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" defaultValue="owner@winkk.media" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Password</label>
            <input name="password" type="password" required className="mt-1 w-full rounded border px-3 py-2" defaultValue="password123" />
          </div>
          <button className="w-full rounded bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800">Sign in</button>
        </form>
        <p className="mt-4 text-xs text-zinc-500">Default owner: owner@winkk.media / password123</p>
      </div>
    </main>
  );
}
