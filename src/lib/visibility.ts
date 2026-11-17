import type { SessionUser } from "./auth";

export type SqlScope = {
  sql: string;
  params: number[];
};

/**
 * Rows are visible to owners in full. Employees see records for clients they
 * are explicitly assigned to (client_team) plus clients they hold tasks for.
 */
export function clientVisibilityScope(
  session: SessionUser,
  alias: string
): SqlScope {
  if (session.role === "owner") return { sql: "", params: [] };
  return {
    sql: `(${alias}.client_id IN (SELECT client_id FROM client_team WHERE user_id=?)
           OR ${alias}.client_id IN (
             SELECT client_id FROM tasks
             WHERE assigned_to=? AND client_id IS NOT NULL
           ))`,
    params: [session.id, session.id],
  };
}
