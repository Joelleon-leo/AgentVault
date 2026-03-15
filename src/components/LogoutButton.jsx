"use client";

export default function LogoutButton() {
  return (
    <a
      href="/api/auth/logout"
      className="button logout"
    >
      Log Out
    </a>
  );
}