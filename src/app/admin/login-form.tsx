"use client";

import { useActionState } from "react";
import { doLogin, type LoginState } from "@/app/admin/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(doLogin, {});
  return (
    <form action={action}>
      <label>Email</label>
      <input type="email" name="email" autoComplete="username" required autoFocus />
      <label>Password</label>
      <input type="password" name="password" autoComplete="current-password" required />
      {state.err ? <p className="flash bad">{state.err}</p> : null}
      <p style={{ marginTop: 14 }}>
        <button className="b" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </p>
    </form>
  );
}
