import NextAuth from 'next-auth'
import GithubProvider from 'next-auth/providers/github'

const handler = NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          scope: 'read:user user:email repo',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token
      }
      if (profile) {
        token.githubId = String((profile as Record<string, unknown>).id || '')
        token.githubUsername = (profile as Record<string, unknown>).login as string || ''
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.githubId = token.githubId as string
      session.githubUsername = token.githubUsername as string
      return session
    },
  },
  pages: {
    signIn: '/new',
  },
})

export { handler as GET, handler as POST }
