import type { Metadata } from "next";
import { BodyAdmin } from "@/app/admin/body-admin";
import { LoginForm } from "@/app/admin/login-form";
import "../admin.css";

export const metadata: Metadata = {
  title: "Admin sign-in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <>
      <BodyAdmin />
      <div className="adm">
        <main className="adm-main">
          <div className="narrow">
            <h1>Web3Edu admin</h1>
            <LoginForm />
          </div>
        </main>
      </div>
    </>
  );
}
