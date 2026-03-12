import { auth0 } from "@/lib/auth0";
import { getAgentPermissions, getAgentPolicies } from "@/lib/store";
import PermissionsClient from "./PermissionsClient";

export default async function PermissionsPage() {
  const session = await auth0.getSession();
  const userId = session.user.sub;
  const permissions = await getAgentPermissions(userId);
  const policies = await getAgentPolicies(userId);

  return <PermissionsClient initialPermissions={permissions} initialPolicies={policies} />;
}
