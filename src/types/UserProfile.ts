export type UserRole = "owner" | "staff";

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};