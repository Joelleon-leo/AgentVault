import { auth0 } from "@/lib/auth0";
import { getAvailableServices, getUserConnections, getAllTokenMetadata } from "@/lib/store";
import { isOAuthConfigured } from "@/lib/oauth-config";
import { Suspense } from "react";
import ConnectionsClient from "./ConnectionsClient";

export default async function ConnectionsPage() {
  const session = await auth0.getSession();
  const userId = session.user.sub;

  const available = getAvailableServices().map((s) => ({
    ...s,
    oauthConfigured: isOAuthConfigured(s.id),
  }));
  const connected = await getUserConnections(userId);
  const tokenMeta = await getAllTokenMetadata(userId);

  return (
    <Suspense fallback={<div>Loading connections...</div>}>
      <ConnectionsClient available={available} initialConnected={connected} initialTokenMeta={tokenMeta} />
    </Suspense>
  );
}
