/** Utility for admin pages/middleware: is the current request an admin session? */
import "server-only";
import { currentAdmin } from "./admin-auth";
import type { AdminRow } from "./admin-auth";

export async function currentAdminFlag(): Promise<boolean> {
  return (await currentAdmin()) !== null;
}

export async function requireAdmin(): Promise<AdminRow> {
  const a = await currentAdmin();
  if (a === null) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/login");
    throw new Error("redirect"); // unreachable; satisfies the type checker
  }
  return a;
}
