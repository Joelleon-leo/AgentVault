// Real API service layer — calls actual GitHub, Gmail, Google Drive APIs
// using tokens stored in the Token Vault

// ======================== GITHUB ========================

export async function githubListIssues(accessToken) {
  const res = await fetch("https://api.github.com/issues?filter=assigned&state=open&per_page=10", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const issues = await res.json();
  return issues.map((i) => ({
    id: i.number,
    title: i.title,
    state: i.state,
    labels: i.labels?.map((l) => l.name) || [],
    created: i.created_at,
    repo: i.repository?.full_name || "unknown",
    url: i.html_url,
  }));
}

export async function githubListRepos(accessToken) {
  const res = await fetch("https://api.github.com/user/repos?sort=pushed&per_page=10", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const repos = await res.json();
  return repos.map((r) => ({
    name: r.full_name,
    language: r.language || "N/A",
    stars: r.stargazers_count,
    lastPush: r.pushed_at,
    url: r.html_url,
    private: r.private,
  }));
}

export async function githubListPRs(accessToken) {
  // Search for open PRs authored by or assigned to the user
  const res = await fetch("https://api.github.com/search/issues?q=is:pr+is:open+involves:@me&per_page=10", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((pr) => ({
    id: pr.number,
    title: pr.title,
    state: pr.state,
    author: pr.user?.login,
    repo: pr.repository_url?.split("/").slice(-2).join("/") || "unknown",
    url: pr.html_url,
  }));
}

export async function githubCreateIssue(accessToken, { owner, repo, title, body }) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const issue = await res.json();
  return { id: issue.number, title: issue.title, url: issue.html_url };
}

// ======================== GMAIL ========================

export async function gmailListMessages(accessToken) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=is:inbox", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
  const data = await res.json();
  const messages = data.messages || [];

  // Fetch details for each message
  const detailed = await Promise.all(
    messages.slice(0, 5).map(async (m) => {
      const detail = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!detail.ok) return null;
      const d = await detail.json();
      const headers = d.payload?.headers || [];
      const getHeader = (name) => headers.find((h) => h.name === name)?.value || "";
      return {
        id: m.id,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        unread: (d.labelIds || []).includes("UNREAD"),
      };
    })
  );
  return detailed.filter(Boolean);
}

export async function gmailSendMessage(accessToken, { to, subject, body }) {
  // Build RFC 2822 message
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodedMessage }),
  });
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
  const data = await res.json();
  return { sent: true, messageId: data.id, timestamp: new Date().toISOString() };
}

// ======================== GOOGLE DRIVE ========================

export async function driveListFiles(accessToken) {
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?pageSize=10&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,webViewLink)",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  const data = await res.json();
  return (data.files || []).map((f) => ({
    name: f.name,
    modified: f.modifiedTime,
    type: f.mimeType?.includes("document") ? "document"
      : f.mimeType?.includes("spreadsheet") ? "spreadsheet"
      : f.mimeType?.includes("presentation") ? "presentation"
      : f.mimeType?.includes("image") ? "image"
      : "file",
    url: f.webViewLink,
  }));
}
