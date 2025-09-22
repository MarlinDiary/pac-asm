import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const backendBaseUrl = process.env.BACKEND_API_BASE_URL ?? "http://localhost:4000";

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
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
    authorized({ auth: session, request }) {
      const isHome = request.nextUrl.pathname === "/";

      if (isHome && session?.user) {
        const redirectUrl = new URL("/level/1", request.nextUrl);
        return Response.redirect(redirectUrl);
      }

      return true;
    },
  },
  events: {
    async signIn({ user, account }) {
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
});
