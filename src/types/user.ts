export type UserStatus = "online" | "offline" | "in-meeting" | "dnd";

export type ThemeOption = "light" | "dark" | "auto";

export interface UserLocation {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
  label?: string;
  updatedAt?: string;
}

export interface UserPreferences {
  notifications: boolean;
  ghostModeDefault: boolean;
  theme: ThemeOption;
}

export interface User {
  id: string;
  email: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
  status: UserStatus;
  location?: UserLocation;
  preferences: UserPreferences;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
  status: UserStatus;
}

export interface CreateUserInput {
  email: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
}

export interface UpdateUserInput {
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  status?: UserStatus;
  location?: {
    coordinates: [number, number];
    label?: string;
  };
  preferences?: Partial<UserPreferences>;
}
