import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const USER_STATUS = ["online", "offline", "in-meeting", "dnd"] as const;
export type UserStatus = (typeof USER_STATUS)[number];

export const THEME_OPTIONS = ["light", "dark", "auto"] as const;
export type ThemeOption = (typeof THEME_OPTIONS)[number];

export interface IUserLocation {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
  label?: string;
  updatedAt?: Date;
}

export interface IUserPreferences {
  notifications: boolean;
  ghostModeDefault: boolean;
  theme: ThemeOption;
}

export interface IUser {
  email: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
  status: UserStatus;
  location?: IUserLocation;
  preferences: IUserPreferences;
  magicLinkToken?: string;
  magicLinkExpires?: Date;
  refreshTokenHash?: string;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {
  _id: Types.ObjectId;
}

const locationSchema = new Schema<IUserLocation>(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number],
      required: true,
    },
    label: {
      type: String,
    },
    updatedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const preferencesSchema = new Schema<IUserPreferences>(
  {
    notifications: {
      type: Boolean,
      default: true,
    },
    ghostModeDefault: {
      type: Boolean,
      default: false,
    },
    theme: {
      type: String,
      enum: THEME_OPTIONS,
      default: "auto",
    },
  },
  { _id: false }
);

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    avatarUrl: {
      type: String,
    },
    status: {
      type: String,
      enum: USER_STATUS,
      default: "offline",
    },
    location: {
      type: locationSchema,
    },
    preferences: {
      type: preferencesSchema,
      default: () => ({
        notifications: true,
        ghostModeDefault: false,
        theme: "auto",
      }),
    },
    magicLinkToken: {
      type: String,
      index: {
        sparse: true,
      },
    },
    magicLinkExpires: {
      type: Date,
    },
    refreshTokenHash: {
      type: String,
    },
    lastSeenAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "users",
  }
);

userSchema.index({ "location": "2dsphere" });

const User: Model<IUserDocument> =
  mongoose.models.User || mongoose.model<IUserDocument>("User", userSchema);

export default User;
