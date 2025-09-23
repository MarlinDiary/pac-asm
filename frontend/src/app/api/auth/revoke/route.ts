import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { auth } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ ok: true });
  }

  const accessToken = (session as typeof session & { accessToken?: string }).accessToken;

  if (!accessToken) {
    return NextResponse.json({ ok: true });
  }

  const clientId = process.env.AUTH_GITHUB_ID;
  const clientSecret = process.env.AUTH_GITHUB_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("Missing GitHub client credentials; skipping token revocation.");
    return NextResponse.json({ ok: false, skipped: true }, { status: 500 });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`https://api.github.com/applications/${clientId}/grant`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "PacAsm-App",
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    console.error("Failed to revoke GitHub grant", response.status, errorText);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
