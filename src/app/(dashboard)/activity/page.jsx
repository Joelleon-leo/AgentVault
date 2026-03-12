import { auth0 } from "@/lib/auth0";
import { getActivityLog } from "@/lib/store";
import ActivityClient from "./ActivityClient";

export default async function ActivityPage() {
  const session = await auth0.getSession();
  const userId = session.user.sub;
  const log = await getActivityLog(userId, 100);

  return <ActivityClient initialLog={log} />;
}
