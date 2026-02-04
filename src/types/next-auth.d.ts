declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      image?: string | null
    }
  }

  interface User {
    id: string
    name?: string | null
    image?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
  }
}
