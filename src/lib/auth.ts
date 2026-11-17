import { cookies } from "next/headers";
import db from "./db";
import bcrypt from "bcryptjs";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: "owner" | "employee";
  job_title: string | null;
  department: string | null;
};

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("session_user")?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const user = db
      .prepare("SELECT id,name,email,role,job_title,department FROM users WHERE id = ? AND is_active=1")
      .get(parsed.id) as SessionUser | undefined;
    return user || null;
  } catch {
    return null;
  }
}

export function verifyLogin(email: string, password: string): SessionUser | null {
  const user = db
    .prepare(
      "SELECT id,name,email,role,job_title,department,password_hash FROM users WHERE email = ? AND is_active=1"
    )
    .get(email) as any;
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    job_title: user.job_title,
    department: user.department,
  };
}

export async function setSession(user: SessionUser) {
  const cookieStore = await cookies();
  const value = Buffer.from(JSON.stringify({ id: user.id }), "utf8").toString("base64url");
  cookieStore.set("session_user", value, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session_user");
}
