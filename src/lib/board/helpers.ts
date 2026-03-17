import mongoose from "mongoose";
import Board, { IBoardDocument } from "@/lib/infra/db/models/board";
import { nanoid } from "nanoid";

export function generateDefaultColumns() {
  return [
    { id: nanoid(8), title: "To Do", color: "#6B7280", position: 0 },
    { id: nanoid(8), title: "In Progress", color: "#3B82F6", position: 1 },
    { id: nanoid(8), title: "Review", color: "#F59E0B", position: 2 },
    { id: nanoid(8), title: "Done", color: "#10B981", position: 3 },
  ];
}

export function generateDefaultLabels() {
  return [
    { id: nanoid(8), name: "Bug", color: "#EF4444" },
    { id: nanoid(8), name: "Feature", color: "#8B5CF6" },
    { id: nanoid(8), name: "Design", color: "#EC4899" },
    { id: nanoid(8), name: "Urgent", color: "#F97316" },
  ];
}

export async function getOrCreatePersonalBoard(
  userId: string,
): Promise<IBoardDocument> {
  const userOid = new mongoose.Types.ObjectId(userId);

  let board = await Board.findOne({ ownerId: userOid, scope: "personal" }).lean() as IBoardDocument | null;

  if (!board) {
    board = await Board.create({
      title: "My Tasks",
      ownerId: userOid,
      scope: "personal",
      members: [{ userId: userOid, role: "owner", joinedAt: new Date() }],
      columns: generateDefaultColumns(),
      labels: generateDefaultLabels(),
    });
  }

  return board;
}
