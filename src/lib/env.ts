/**
 * Typed environment access. Reads once per process; validates placeholders loudly
 * so a misconfigured deployment fails fast with an obvious message, never silently.
 */
const MISSING: string[] = [];

function env(name: string): string {
  const v = process.env[name] ?? "";
  if (v === "" || v.includes("PLACEHOLDER")) MISSING.push(name);
  return v;
}

function envOpt(name: string): string {
  return (process.env[name] ?? "").trim();
}

function siteUrl(): string {
  const v = envOpt("NEXT_PUBLIC_SITE_URL") || envOpt("VERCEL_PROJECT_PRODUCTION_URL") || "";
  return v.replace(/\/+$/, "");
}

/** True when the value is missing/placeholder (used by diagnostics). */
function missing(name: string): boolean {
  const v = process.env[name] ?? "";
  return v === "" || v.includes("PLACEHOLDER");
}

export const envFlags = { missing };

if (MISSING.length > 0 && process.env.NODE_ENV === "production") {
  // Fail fast: don't run with a broken config in production.
  console.error(
    `[w3e] Missing/placeholder environment variables: ${MISSING.join(", ")}. ` +
      "Configure them in the Vercel project settings.",
  );
}

export const ENV = {
  get siteUrl() {
    return siteUrl();
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get supabaseUrl() {
    return env("NEXT_PUBLIC_SUPABASE_URL");
  },
  get anonKey() {
    return env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get serviceKey() {
    return env("SUPABASE_SERVICE_ROLE_KEY");
  },
  get appKey() {
    return env("APP_KEY");
  },
  get resendApiKey() {
    return env("RESEND_API_KEY");
  },
  get mailFromName() {
    return envOpt("MAIL_FROM_NAME") || "Web3Edu";
  },
  get mailFromAddress() {
    return env("MAIL_FROM_ADDRESS");
  },
  get mailReplyTo() {
    return envOpt("MAIL_REPLY_TO");
  },
  get webhookSecret() {
    return env("RESEND_WEBHOOK_SECRET");
  },
  get cronSecret() {
    return env("CRON_SECRET");
  },
  get supportEmail() {
    return envOpt("SUPPORT_EMAIL");
  },
  get privacyEmail() {
    return envOpt("PRIVACY_EMAIL");
  },
};
