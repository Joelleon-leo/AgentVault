import { auth0 } from "@/lib/auth0";
import { getUserConnections, getActivityLog, getAgentPermissions } from "@/lib/store";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth0.getSession();
  const userId = session.user.sub;

  const connections = await getUserConnections(userId);
  const activity = await getActivityLog(userId, 10);
  const permissions = await getAgentPermissions(userId);

  return (
    <DashboardClient
      connections={connections}
      activity={activity}
      permissions={permissions}
      userName={session.user.name}
    />
  );
}
