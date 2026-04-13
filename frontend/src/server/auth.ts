import NextAuth from "next-auth";
import GitHub from "@auth/core/providers/github";
import { Buffer } from "node:buffer";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Account, User } from "@auth/core/types";
import type { AdapterSession } from "next-auth/adapters";

const backendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  callbacks: {
    async jwt({ token, account }: { token: JWT; account?: Account | null }) {
      if (account?.provider === "github") {
        token.accessToken = account.access_token;
      }

      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user && token.accessToken) {
        session.accessToken = token.accessToken as string;
      }

      return session;
    },
  },
  events: {
    async signIn({ user, account }: { user?: User | null; account?: Account | null }) {
      if (!user) {
        return;
      }

      const accessToken = typeof account?.access_token === 'string' ? account.access_token : undefined;
      if (!accessToken) {
        console.warn("Missing GitHub access token; skipping backend user sync.");
        return;
      }

      try {
        await fetch(`${backendBaseUrl}/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({}),
        });
      } catch (error) {
        console.error("Failed to sync user with backend", error);
      }
    },
    async signOut(
      message:
        | { token: JWT | null }
        | { session: AdapterSession | null | undefined | void }
    ) {
      const accessToken =
        "token" in message ? (message.token?.accessToken as string | undefined) : undefined;

      if (!accessToken) {
        return;
      }

      const clientId = process.env.AUTH_GITHUB_ID;
      const clientSecret = process.env.AUTH_GITHUB_SECRET;

      if (!clientId || !clientSecret) {
        console.warn("Missing GitHub client credentials; skipping token revocation.");
        return;
      }

      try {
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
        }
      } catch (error) {
        console.error("Failed to revoke GitHub grant", error);
      }
    },
  },
} satisfies Parameters<typeof NextAuth>[0];

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth(authConfig);
