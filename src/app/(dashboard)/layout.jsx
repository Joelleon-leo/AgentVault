import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default async function DashboardLayout({ children }) {
  const session = await auth0.getSession();
  if (!session?.user) {
    redirect("/");
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}
