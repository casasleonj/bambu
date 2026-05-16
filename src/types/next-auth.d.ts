import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    mustChangePassword?: boolean;
  }
  interface Session {
    user?: User;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    displayName?: string;
    mustChangePassword?: boolean;
  }
}
