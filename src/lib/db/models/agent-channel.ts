import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const CHANNEL_STATUS = ["active", "closed"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUS)[number];

export interface IChannelMessage {
  fromAgentId: Types.ObjectId;
  fromUserId: Types.ObjectId;
  fromUserName: string;
  content: string;
  type: "agent" | "user" | "system";
  timestamp: Date;
}

export interface IChannelParticipant {
  agentId: Types.ObjectId;
  userId: Types.ObjectId;
  userName: string;
  joinedAt: Date;
}

export interface IAgentChannel {
  /** Human-readable topic for this collaboration */
  topic: string;
  /** The two (or more) agent participants */
  participants: IChannelParticipant[];
  /** Conversation messages between the agents */
  messages: IChannelMessage[];
  status: ChannelStatus;
  /** Who initiated the collaboration */
  initiatorUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAgentChannelDocument extends IAgentChannel, Document {
  _id: Types.ObjectId;
}

const channelMessageSchema = new Schema<IChannelMessage>(
  {
    fromAgentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
    },
    fromUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fromUserName: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["agent", "user", "system"],
      default: "agent",
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const channelParticipantSchema = new Schema<IChannelParticipant>(
  {
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const agentChannelSchema = new Schema<IAgentChannelDocument>(
  {
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    participants: {
      type: [channelParticipantSchema],
      validate: {
        validator: (v: IChannelParticipant[]) => v.length >= 2,
        message: "A collaboration channel needs at least 2 participants.",
      },
    },
    messages: {
      type: [channelMessageSchema],
      default: [],
    },
    status: {
      type: String,
      enum: CHANNEL_STATUS,
      default: "active",
    },
    initiatorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "agent_channels",
  }
);

agentChannelSchema.index({ "participants.userId": 1 });
agentChannelSchema.index({ "participants.agentId": 1 });
agentChannelSchema.index({ status: 1 });

const AgentChannel: Model<IAgentChannelDocument> =
  mongoose.models.AgentChannel ||
  mongoose.model<IAgentChannelDocument>("AgentChannel", agentChannelSchema);

export default AgentChannel;
