"use client";

/**
 * Admin session keep-alive. Pages renders cannot touch cookies, so this client
 * helper pings /api/admin/ping (a route handler) which rolls the idle timer and
 * restores an expired access token from the refresh token.
 *
 * - In the admin chrome (redirectWhenAlive=false): silent keep-alive.
 * - On the login page (redirectWhenAlive=true): if the still-stored refresh
 *   token transparently restores the session, bounce the user into the
 *   dashboard instead of showing a login form they'd have to redo.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SessionPing({ redirectWhenAlive = false }: { redirectWhenAlive?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = () => {
      fetch("/api/admin/ping", { cache: "no-store" })
        .then((r) => {
          if (r.ok && redirectWhenAlive) router.replace("/admin");
          return r;
        })
        .catch(() => undefined);
    };
    check();
    timer = setInterval(check, 4 * 60 * 1000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [redirectWhenAlive, router]);
  return null;
}
