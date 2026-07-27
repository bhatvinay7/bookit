// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = "Admin" | "User";

export interface UserPublic {
  id: number;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  user: UserPublic;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
  role?: string;
}
