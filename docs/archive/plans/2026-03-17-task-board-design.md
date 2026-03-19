# Yoodle Task Board — Design Document

**Date:** 2026-03-17
**Status:** Approved
**Scope:** Full kanban task board with deep AI integration, personal + conversation boards, meeting/email/doc linking

---

## 1. Overview

Replace the current Google Tasks-backed task panel with a MongoDB-backed kanban board that supports:
- Personal boards (dashboard) and conversation boards (group chats)
- Drag-and-drop columns with dnd-kit
- Rich task detail: assignees, priority, labels, subtasks, comments, activity log
- Task sharing, transfer, and collaboration
- Meeting ↔ task linking (schedule meetings from tasks, create tasks from MoM)
- Deep 2-way AI integration (Doodle creates/manages tasks AND tasks inform Doodle's context)
- Google Drive doc attachment

## 2. Data Model (MongoDB)

### Board

```typescript
interface IBoard {
  _id: ObjectId;
  title: string;
  description?: string;
  ownerId: ObjectId;                    // creator
  scope: "personal" | "conversation";
  conversationId?: ObjectId;            // links to group chat (scope=conversation)
  members: IBoardMember[];
  columns: IBoardColumn[];
  labels: IBoardLabel[];
  createdAt: Date;
  updatedAt: Date;
}

interface IBoardMember {
  userId: ObjectId;
  role: "owner" | "editor" | "viewer";
  joinedAt: Date;
}

interface IBoardColumn {
  id: string;          // nanoid
  title: string;       // "To Do", "In Progress", "Review", "Done"
  color: string;       // hex color
  position: number;    // ordering
  wipLimit?: number;   // optional WIP limit
}

interface IBoardLabel {
  id: string;          // nanoid
  name: string;        // "Bug", "Feature", "Design", etc.
  color: string;       // hex color
}
```

**Default columns on creation:** To Do, In Progress, Review, Done

**Indexes:**
- `ownerId` + `scope` (list user's boards)
- `conversationId` (unique sparse, lookup board from chat)
- `members.userId` (find boards user is member of)

### Task

```typescript
interface ITask {
  _id: ObjectId;
  boardId: ObjectId;
  columnId: string;         // references Board.columns[].id
  position: number;         // ordering within column (float for easy reorder)
  title: string;
  description?: string;     // markdown
  priority: "urgent" | "high" | "medium" | "low" | "none";
  creatorId: ObjectId;
  assigneeId?: ObjectId;
  collaborators: ObjectId[];  // people who can see + get notified
  labels: string[];           // references Board.labels[].id
  dueDate?: Date;
  startDate?: Date;
  subtasks: ISubtask[];
  linkedDocs: ILinkedDoc[];
  linkedEmails: ILinkedEmail[];
  meetingId?: ObjectId;       // linked meeting
  parentTaskId?: ObjectId;    // for sub-issues
  source: ITaskSource;        // how this task was created
  estimatePoints?: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface ISubtask {
  id: string;           // nanoid
  title: string;
  done: boolean;
  assigneeId?: ObjectId;
}

interface ILinkedDoc {
  googleDocId: string;
  title: string;
  url: string;
  type: "doc" | "sheet" | "slide" | "pdf" | "file";
}

interface ILinkedEmail {
  gmailId: string;
  subject: string;
  from: string;
}

interface ITaskSource {
  type: "manual" | "ai" | "meeting-mom" | "email" | "chat";
  sourceId?: string;   // meetingId, gmailId, conversationId, etc.
}
```

**Indexes:**
- `boardId` + `columnId` + `position` (list tasks in column order)
- `assigneeId` + `dueDate` (my tasks, sorted by due date)
- `boardId` + `updatedAt` (recent activity)
- `meetingId` (sparse, find tasks linked to a meeting)
- `parentTaskId` (sparse, find sub-issues)
- Text index on `title` + `description`

### TaskComment

```typescript
interface ITaskComment {
  _id: ObjectId;
  taskId: ObjectId;
  authorId: ObjectId;
  type: "comment" | "activity";  // activity = auto-logged changes
  content: string;
  changes?: {                     // for activity type
    field: string;
    from: string;
    to: string;
  };
  createdAt: Date;
}
```

**Indexes:**
- `taskId` + `createdAt` (paginated comments)

## 3. Board Types & Scoping

| Type | Who sees it | How it's created | Auto-members |
|------|------------|-----------------|-------------|
| **Personal** | Owner + shared collaborators | Auto-created on first use, or manually | Just the owner |
| **Conversation** | All group members | "Create Board" from group chat header | All group participants as editors |

- Personal board: dashboard Tasks card expands into this
- Conversation board: accessible from group chat header, synced with group membership
- When a user joins/leaves a group chat, their board membership updates automatically

## 4. Sharing & Permissions

### Board-level roles
- **Owner**: Full control (rename, delete board, manage columns/labels, manage members)
- **Editor**: Create/edit/move/delete tasks, add comments
- **Viewer**: Read-only, can add comments

### Task-level sharing
- Any task can have `collaborators[]` — non-board-members who get access to that specific task
- Collaborators can view, comment, and update the task but not other board tasks
- Shared via user search (same as chat participant search)

### Task transfer
- Change `assigneeId` to transfer ownership
- Original creator stays as collaborator
- Activity log records the transfer

## 5. Task Detail View

Slide-over panel (right side, like existing MeetingDetail drawer):

### Header
- Title (editable inline, auto-save on blur)
- Priority badge (dropdown: urgent/high/medium/low/none)
- Column/status dropdown (move between columns)
- Close button

### Properties sidebar (right column)
- **Assignee**: User search dropdown with avatar
- **Due date**: Date picker, color-coded (overdue=red, today=orange, future=gray)
- **Labels**: Multi-select from board labels
- **Estimate**: Number input (story points)
- **Board**: Read-only, shows which board

### Body (left column)
- **Description**: Markdown editor (inline, click to edit)
- **Subtasks**: Checklist with per-item assignee, progress bar at top
- **Linked docs**: List of Google Drive docs with "Attach from Drive" button (uses existing Drive search)
- **Linked emails**: List of Gmail threads with subject + from
- **Meeting link**: Shows linked meeting (if any) or "Schedule meeting" / "Link existing meeting" buttons

### Footer tabs
- **Comments**: Threaded comments with user avatars
- **Activity**: Auto-logged changes (status changed, assignee changed, priority changed, etc.)

## 6. Meeting ↔ Task Integration

### Task → Meeting
- "Schedule meeting" on a task detail creates a meeting pre-filled with:
  - Title: task title
  - Participants: task assignee + collaborators
  - Links `meetingId` back to the task
- "Link existing meeting" lets user search past meetings

### Meeting → Tasks
- When MoM is generated (existing `/api/meetings/[meetingId]/mom`), each `actionItem` can be converted to a board task
- Created tasks link back to the meeting via `meetingId` and `source: { type: "meeting-mom", sourceId: meetingId }`
- Task inherits meeting attendees as collaborators

### In-meeting context
- Meeting room sidebar can show linked task status
- Post-meeting: task status updated based on meeting outcomes

## 7. AI Integration (2-Way)

### AI → Tasks: New tools for `tools.ts`

```typescript
// Board management
create_board_task       // Create task with all fields, on any accessible board
update_board_task       // Update title, description, priority, due date, labels
move_board_task         // Change column (status)
assign_board_task       // Assign/reassign to a user
delete_board_task       // Delete a task
list_board_tasks        // List with filters (board, assignee, priority, column, due date)
search_board_tasks      // Text search across titles + descriptions
generate_subtasks       // AI generates subtask breakdown from task description
attach_doc_to_task      // Search Drive → attach doc to task
create_task_from_meeting // Convert MoM action item → board task with back-link
create_task_from_email  // Extract action from email → board task with email link
list_boards             // List user's accessible boards
```

All write operations use `propose_action` for user confirmation.

### Tasks → AI: Context expansion

Add to `workspace-context.ts` alongside emails, calendar, and drive:

```xml
<board-tasks>
  <my-tasks count="12" overdue="3" due-today="2">
    <task id="..." title="Fix auth bug" board="Frontend" column="In Progress"
          priority="high" due="2026-03-18" overdue="true" assignee="You" />
    <task id="..." title="Design review" board="Frontend" column="To Do"
          priority="medium" due="2026-03-20" assignee="You" />
    <!-- up to 15 most relevant tasks -->
  </my-tasks>
  <shared-boards>
    <board name="Frontend Team" total="24" in-progress="8" blocked="2" overdue="5" />
    <board name="API Redesign" total="12" in-progress="3" blocked="0" overdue="1" />
  </shared-boards>
</board-tasks>
```

### AI-Powered Features

**Daily briefing enhancement** (`/api/ai/briefing`):
- Tasks due today/tomorrow
- Overdue tasks needing attention
- Tasks recently assigned to you
- Board activity summary (new tasks in shared boards)

**Conversational task management examples:**
- "What's overdue?" → reads board-tasks context
- "What should I focus on today?" → cross-references calendar + tasks + emails
- "Give me a standup update" → completed yesterday, in progress, blocked
- "Move all design tasks to next week" → bulk update via propose_action
- "Create a task from that email from Sarah" → reads email, creates linked task
- "Break down the onboarding redesign into subtasks" → generates subtask list
- "Attach the API spec doc to the auth migration task" → searches Drive, attaches

**Smart suggestions (phase 2):**
- Priority suggestion based on due date proximity and workload
- Assignee suggestion based on who handles similar tasks
- Duplicate detection when creating similar tasks
- Auto-status from chat context ("I finished the auth fix" → suggest moving to Done)

## 8. Conversation Board Integration

When a group chat creates a board:
- All group participants auto-added as board editors
- Group admin = board owner
- Board accessible from chat header (icon/tab)
- Doodle in that chat gains board context
- "Doodle, add that as a task and assign to Sarah" works in group chat
- Member sync: joining/leaving group updates board membership

## 9. Dashboard Integration

### Tasks card (compact view)
- Shows "My Tasks" across all boards: assigned to me, sorted by due date
- Count badge showing total pending
- Click → expands to full kanban board overlay

### Full board view (expanded overlay)
- Full-screen overlay (like existing calendar expand)
- Board selector dropdown (Personal, + each conversation board)
- Kanban columns with drag-and-drop (dnd-kit)
- Filter bar: by assignee, priority, label, due date
- "+ Add task" button per column
- Click card → task detail slide-over

## 10. API Routes

```
GET    /api/boards                           — List user's boards
POST   /api/boards                           — Create board
GET    /api/boards/[boardId]                  — Get board details
PATCH  /api/boards/[boardId]                  — Update board (title, columns, labels)
DELETE /api/boards/[boardId]                  — Delete board (owner only)

GET    /api/boards/[boardId]/tasks            — List tasks (with filters)
POST   /api/boards/[boardId]/tasks            — Create task
GET    /api/boards/[boardId]/tasks/[taskId]    — Get task detail
PATCH  /api/boards/[boardId]/tasks/[taskId]    — Update task
DELETE /api/boards/[boardId]/tasks/[taskId]    — Delete task
POST   /api/boards/[boardId]/tasks/reorder     — Batch reorder (after drag-drop)

GET    /api/boards/[boardId]/tasks/[taskId]/comments  — List comments
POST   /api/boards/[boardId]/tasks/[taskId]/comments  — Add comment

POST   /api/boards/[boardId]/members          — Add member
DELETE /api/boards/[boardId]/members/[userId]  — Remove member
PATCH  /api/boards/[boardId]/members/[userId]  — Change role

GET    /api/tasks/my                          — My tasks across all boards (for dashboard)
```

## 11. Tech Stack

- **Drag & drop**: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- **Database**: MongoDB via existing Mongoose setup
- **API**: Next.js App Router API routes with Zod validation
- **Frontend**: React + Framer Motion + Tailwind (matching Yoodle design system)
- **Real-time**: Redis pub/sub for live board updates (phase 2)

## 12. Implementation Phases

### Phase 1: Core Board (MVP)
- MongoDB models (Board, Task, TaskComment)
- API routes (CRUD for boards, tasks, comments)
- Dashboard TasksPanel → KanbanBoard expand overlay
- Drag-and-drop columns and cards (dnd-kit)
- Task detail slide-over (title, description, assignee, priority, due date, subtasks)
- Personal board auto-creation

### Phase 2: Sharing & Collaboration
- Conversation boards (create from group chat)
- Board member management
- Task sharing (collaborators)
- Comments and activity log
- Member sync with group chats

### Phase 3: AI Integration
- New AI tools in tools.ts (10 tools)
- Board-tasks in workspace-context.ts
- Briefing enhancement
- Conversational task management
- MoM → task conversion

### Phase 4: Document & Email Linking
- Google Drive doc attachment (search + attach)
- Email → task creation with link
- Meeting → task linking
- Smart suggestions (priority, assignee, duplicates)
