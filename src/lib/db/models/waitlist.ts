import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWaitlist extends Document {
  email: string;
  name?: string;
  source?: string;
  status: "pending" | "approved" | "invited";
  invitedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaitlistSchema = new Schema<IWaitlist>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    source: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "website",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "invited"],
      default: "pending",
    },
    invitedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

WaitlistSchema.index({ email: 1 }, { unique: true });
WaitlistSchema.index({ status: 1 });
WaitlistSchema.index({ createdAt: -1 });

const Waitlist: Model<IWaitlist> =
  mongoose.models.Waitlist ||
  mongoose.model<IWaitlist>("Waitlist", WaitlistSchema);

export default Waitlist;
