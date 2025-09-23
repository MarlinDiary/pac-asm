import NextAuth from "next-auth";
import GitHub from "@auth/core/providers/github";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import type { Account, User } from "@auth/core/types";

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
    authorized({ auth: session, request }: { auth: Session | null; request: NextRequest }) {
      const isHome = request.nextUrl.pathname === "/";
      const isProtected =
        request.nextUrl.pathname.startsWith("/level") ||
        request.nextUrl.pathname.startsWith("/challenge");

      if (isHome && session?.user) {
        const redirectUrl = new URL("/level/1", request.nextUrl);
        return Response.redirect(redirectUrl);
      }

      if (isProtected && !session?.user) {
        const redirectUrl = new URL("/", request.nextUrl);
        return Response.redirect(redirectUrl);
      }

      return true;
    },
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

      try {
        await fetch(`${backendBaseUrl}/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user.email,
            name: user.name,
            avatarUrl: user.image,
            githubId: account?.providerAccountId,
          }),
        });
      } catch (error) {
        console.error("Failed to sync user with backend", error);
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
