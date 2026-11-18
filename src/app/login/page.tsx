import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession, setSession, verifyLogin } from "@/lib/auth";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = verifyLogin(email, password);
  if (!user) redirect(`/login?error=1&email=${encodeURIComponent(email)}`);
  await setSession(user);
  redirect(user.role === "owner" ? "/dashboard" : "/my-work");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(session.role === "owner" ? "/dashboard" : "/my-work");
  const { error, email } = await searchParams;
  // Pre-filled demo credentials are a development convenience only; a deployed
  // workspace must never offer an account to every visitor.
  const showDemoCredentials = process.env.NODE_ENV !== "production";
  const defaultEmail = email || (showDemoCredentials ? "owner@winkk.media" : undefined);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-radial from-slate-100 to-slate-200/80 p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-900/5">
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3 h-14 w-52 flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="Winkk Media Logo"
              width={208}
              height={56}
              priority
              className="object-contain"
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#12143d]">
            Team Portal Sign In
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Client-wise task tracking & agency operations
          </p>
        </div>

        {error ? (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-800">
            <svg className="h-4 w-4 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Invalid email or password. Please check your credentials.</span>
          </div>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Work Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-3 focus:ring-[#ed8527]/20"
              defaultValue={defaultEmail}
              placeholder="e.g. name@winkk.media"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Password <span className="text-rose-500">*</span>
              </label>
            </div>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-2xs transition-all focus:border-[#ed8527] focus:outline-none focus:ring-3 focus:ring-[#ed8527]/20"
              defaultValue={showDemoCredentials ? "password123" : undefined}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-[#ed8527] px-4 py-3 text-sm font-bold text-white shadow-md shadow-[#ed8527]/25 transition-all hover:bg-[#d97116] hover:shadow-lg hover:shadow-[#ed8527]/30 active:scale-[0.99] cursor-pointer"
          >
            Sign in to Workspace →
          </button>
        </form>

        {showDemoCredentials ? (
          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <p className="text-[11px] font-medium text-slate-400">
              Demo Credentials: <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-600">owner@winkk.media</code> / <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-600">password123</code>
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
