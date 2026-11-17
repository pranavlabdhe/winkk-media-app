import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  redirect(session ? (session.role === "owner" ? "/dashboard" : "/my-work") : "/login");
}
