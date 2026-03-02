import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export default async function AuthPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }
  return <LoginForm />;
}
