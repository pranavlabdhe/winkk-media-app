import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
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

// The secret is read on use rather than at module load: Next evaluates route
// modules during `next build`, where production runtime secrets are not set.
function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return "winkk-local-development-session-secret";
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function encodeSession(userId: number) {
  const payload = Buffer.from(JSON.stringify({ id: userId }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(raw: string): { id?: number } | null {
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("session_user")?.value;
  if (!raw) return null;
  let parsed: { id?: number } | null = null;
  try {
    parsed = decodeSession(raw);
  } catch {
    // A missing SESSION_SECRET in production lands here; treat the cookie as
    // invalid and send the visitor to the login page.
    return null;
  }
  if (!parsed?.id) return null;
  try {
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
  cookieStore.set("session_user", encodeSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session_user");
}
