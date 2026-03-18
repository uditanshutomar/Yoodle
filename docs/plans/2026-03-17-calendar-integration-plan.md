# Calendar Deep Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire calendar bidirectionally into meetings, tasks, messages, and Drive — making Yoodle's calendar the unified hub for all commitments.

**Architecture:** 9 features across 4 integration domains (meetings, tasks, messages, UI polish). Backend changes in API routes + AI tool executors. Frontend changes in CalendarPanel + EventDetailPopup. All features are independent and can be implemented in any order.

**Tech Stack:** Next.js App Router, MongoDB/Mongoose, Google Calendar API v3, Gemini AI tools, React + Framer Motion

---

### Task 1: Calendar Event Cleanup on Meeting Cancel

**Why:** When a meeting is cancelled via `DELETE /api/meetings/:id`, the Google Calendar event is orphaned forever. This is data corruption.

**Files:**
- Modify: `src/app/api/meetings/[meetingId]/route.ts` (the DELETE handler, lines 186-223)

**Step 1: Add deleteEvent import**

At the top of `src/app/api/meetings/[meetingId]/route.ts`, add the import:

```typescript
import { deleteEvent } from "@/lib/google/calendar";
```

**Step 2: Add calendar cleanup after meeting cancellation**

In the DELETE handler, after the successful `findOneAndUpdate` that sets status to "cancelled" (around line 204), but BEFORE the "if (!result)" check, add calendar cleanup:

```typescript
  // Clean up Google Calendar event if one was created
  if (result.calendarEventId) {
    try {
      await deleteEvent(userId, result.calendarEventId);
    } catch (calErr) {
      // Calendar cleanup is best-effort — don't fail the meeting cancellation
      // The event may already have been deleted externally
    }
  }
```

**Important:** The `findOneAndUpdate` currently uses `projection: { _id: 1, status: 1 }` which does NOT return `calendarEventId`. Change the projection to include it:

```typescript
// BEFORE:
{ new: true, projection: { _id: 1, status: 1 } },

// AFTER:
{ new: true, projection: { _id: 1, status: 1, calendarEventId: 1 } },
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/api/meetings/[meetingId]/route.ts
git commit -m "fix: clean up Google Calendar event when meeting is cancelled"
```

---

### Task 2: Calendar Event on Direct Meeting Creation (API Consistency)

**Why:** `POST /api/meetings` creates meetings WITHOUT calendar events, but the AI path (`create_yoodle_meeting`) always creates them. This inconsistency means UI-created scheduled meetings are invisible on Google Calendar.

**Files:**
- Modify: `src/app/api/meetings/route.ts` (the POST handler)

**Step 1: Read the current POST handler to understand its shape**

Read `src/app/api/meetings/route.ts` fully.

**Step 2: Add calendar event creation for scheduled meetings**

After the meeting is created in the POST handler, add:

```typescript
import { createEvent } from "@/lib/google/calendar";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("meetings:create");
```

Then after `Meeting.create(...)` succeeds, if `scheduledAt` is present:

```typescript
  // Auto-create Google Calendar event for scheduled meetings
  if (meeting.scheduledAt) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const yoodleLink = `${baseUrl}/meetings/${meeting.code}/room`;
      const durationMin = meeting.scheduledDuration || 30;
      const endDate = new Date(meeting.scheduledAt.getTime() + durationMin * 60000);

      const event = await createEvent(userId, {
        title: meeting.title,
        start: meeting.scheduledAt.toISOString(),
        end: endDate.toISOString(),
        description: `Join Yoodle meeting: ${yoodleLink}`,
        location: yoodleLink,
        addMeetLink: false,
      });

      if (event?.id) {
        await Meeting.updateOne({ _id: meeting._id }, { $set: { calendarEventId: event.id } });
      }
    } catch (calErr) {
      log.warn({ err: calErr, meetingId: meeting._id }, "failed to create calendar event for meeting");
      // Best-effort — meeting creation still succeeds
    }
  }
```

**Step 3: Verify build**

Run: `export PATH="/usr/local/bin:/usr/bin:/bin:$PATH" && cd /Users/uditanshutomar/Desktop/Yoodle && npx next build 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/app/api/meetings/route.ts
git commit -m "feat: auto-create Google Calendar event for scheduled meetings via API"
```

---

### Task 3: Task Deadlines Visible on Calendar (Unified View)

**Why:** Tasks with `dueDate` are invisible on the calendar. The calendar should be the single source of truth for "what's coming up."

**Files:**
- Modify: `src/components/dashboard/CalendarPanel.tsx`
- Modify: `src/app/api/calendar/events/route.ts` (add query param to include tasks)

**Step 1: Create a new API route for task deadlines**

Instead of modifying the calendar events API, create a lightweight endpoint. Actually — it's simpler to fetch tasks client-side and merge them. Add a `useMemo` merge in CalendarPanel.

In `CalendarPanel.tsx`, add a new state and fetch for task deadlines:

```typescript
// Add to state declarations (after events/monthEvents)
const [taskDeadlines, setTaskDeadlines] = useState<CalEvent[]>([]);
```

Add a fetch function:

```typescript
const fetchTaskDeadlines = useCallback(async () => {
    try {
        const now = new Date();
        let timeMin: Date, timeMax: Date;
        if (view === "Month") {
            const { gridStart, gridEnd } = getMonthData(weekOffset);
            timeMin = gridStart;
            timeMax = gridEnd;
        } else {
            const sunday = new Date(now);
            sunday.setDate(now.getDate() - now.getDay() + weekOffset * 7);
            sunday.setHours(0, 0, 0, 0);
            timeMin = sunday;
            timeMax = new Date(sunday);
            timeMax.setDate(sunday.getDate() + 7);
        }
        const res = await fetch(
            `/api/tasks/my?dueDateMin=${timeMin.toISOString()}&dueDateMax=${timeMax.toISOString()}&limit=50`,
            { credentials: "include" }
        );
        if (!res.ok) return;
        const data = await res.json();
        const tasks = data.data || [];
        const deadlines: CalEvent[] = tasks
            .filter((t: { dueDate?: string }) => t.dueDate)
            .map((t: { _id: string; title: string; dueDate: string; priority?: string }, i: number) => {
                const dueDate = new Date(t.dueDate);
                const dayIndex = dueDate.getDay();
                return {
                    id: `task-${t._id}`,
                    title: `📋 ${t.title}`,
                    time: "Due",
                    dayIndex,
                    startHour: 0,
                    duration: 24,
                    color: t.priority === "urgent" ? "#EF4444" : t.priority === "high" ? "#F59E0B" : "#6366F1",
                    bgColor: t.priority === "urgent" ? "#FEE2E2" : t.priority === "high" ? "#FEF3C7" : "#EEF2FF",
                    attendeeCount: 0,
                    isAllDay: true,
                    fullDate: dueDate,
                    isTaskDeadline: true,
                } as CalEvent;
            });
        setTaskDeadlines(deadlines);
    } catch { /* ignore */ }
}, [weekOffset, view]);
```

**Step 2: Add `isTaskDeadline` to CalEvent type**

```typescript
type CalEvent = {
    // ... existing fields ...
    isTaskDeadline?: boolean;
};
```

**Step 3: Merge task deadlines with calendar events**

Update the computed event lists:

```typescript
const allDayEvents = useMemo(() => [...events.filter((e) => e.isAllDay), ...taskDeadlines], [events, taskDeadlines]);
```

For month view, similarly merge:

```typescript
// In the MonthView usage, pass merged events
const mergedMonthEvents = useMemo(() => [...(monthEvents.length > 0 ? monthEvents : events), ...taskDeadlines], [monthEvents, events, taskDeadlines]);
```

**Step 4: Update the API route for task filtering**

Modify `src/app/api/tasks/my/route.ts` to accept `dueDateMin` and `dueDateMax` query params:

```typescript
const dueDateMin = searchParams.get("dueDateMin");
const dueDateMax = searchParams.get("dueDateMax");

// Add to the MongoDB query filter:
if (dueDateMin || dueDateMax) {
  filter.dueDate = {};
  if (dueDateMin) filter.dueDate.$gte = new Date(dueDateMin);
  if (dueDateMax) filter.dueDate.$lte = new Date(dueDateMax);
}
```

**Step 5: Call fetchTaskDeadlines alongside fetchEvents**

```typescript
useEffect(() => { fetchEvents(); fetchTaskDeadlines(); }, [fetchEvents, fetchTaskDeadlines]);
```

**Step 6: Verify build and commit**

```bash
git add src/components/dashboard/CalendarPanel.tsx src/app/api/tasks/my/route.ts
git commit -m "feat: show task deadlines on calendar as all-day events"
```

---

### Task 4: "Join Meeting" Button in CalendarPanel

**Why:** Calendar events linked to Yoodle meetings have the room link buried in `location` or `description`. The EventDetailPopup should show a prominent "Join Yoodle" button.

**Files:**
- Modify: `src/components/dashboard/CalendarPanel.tsx` (EventDetailPopup component, around line 240-348)

**Step 1: Improve Yoodle link detection**

The current detection is: `event.location?.includes("/meetings/join?code=")`. But the actual Yoodle links use TWO formats:
- `/meetings/join?code=yoo-xxx-xxx`
- `/meetings/yoo-xxx-xxx/room`

Update line 250:

```typescript
// BEFORE:
const yoodleLink = event.location?.includes("/meetings/join?code=") ? event.location : null;

// AFTER:
const yoodleLink = event.location?.match(/\/meetings\/(join\?code=|yoo-[a-z0-9]+-[a-z0-9]+\/room)/)
    ? event.location
    : event.meetLink?.match(/\/meetings\/(join\?code=|yoo-[a-z0-9]+-[a-z0-9]+\/room)/)
        ? event.meetLink
        : null;
```

This already feeds into the existing `meetLink` variable and the "Join Yoodle" button rendering. The button text already differentiates: `{yoodleLink ? "Join Yoodle" : "Join Meeting"}`.

**Step 2: Add Yoodle logo indicator on event cards**

In the week view event cards (line ~1371-1384), add a small video icon for Yoodle meetings:

After the title `<p>` tag in the event card, add:

```typescript
{(event.location?.includes("/meetings/") || event.meetLink?.includes("/meetings/")) && event.duration >= 0.5 && (
    <span className="text-[8px] text-[var(--text-muted)] flex items-center gap-0.5 mt-0.5">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        Yoodle
    </span>
)}
```

**Step 3: Verify build and commit**

```bash
git add src/components/dashboard/CalendarPanel.tsx
git commit -m "feat: improve Yoodle meeting detection and add meeting indicator on calendar events"
```

---

### Task 5: Conflict Detection on AI Event Creation

**Why:** When the AI creates a calendar event, it doesn't check for overlapping events. Users can get double-booked silently.

**Files:**
- Modify: `src/lib/ai/tools.ts` (the `create_calendar_event` case, around line 1020-1055)

**Step 1: Add conflict check before creating event**

In the `create_calendar_event` case, BEFORE calling `createEvent()`, add:

```typescript
      // Check for scheduling conflicts
      let conflictWarning = "";
      try {
        const conflictEvents = await listEvents(userId, {
          timeMin: args.start as string,
          timeMax: args.end as string,
          maxResults: 5,
        });
        if (conflictEvents.length > 0) {
          const conflictList = conflictEvents
            .map((e) => `"${e.title}" (${e.start}–${e.end})`)
            .join(", ");
          conflictWarning = ` ⚠️ Overlaps with: ${conflictList}`;
        }
      } catch { /* conflict check is best-effort */ }
```

Then append `conflictWarning` to the summary:

```typescript
// BEFORE:
summary: `Created event "${event.title}" ...`,

// AFTER:
summary: `Created event "${event.title}" ...${conflictWarning}`,
```

This means the AI agent will see the conflict in the tool result and can mention it to the user.

**Step 2: Verify build and commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat: add conflict detection when AI creates calendar events"
```

---

### Task 6: AI-Suggested Focus Blocks for Tasks

**Why:** When a task has a `dueDate` but no calendar block, the AI should proactively offer to create one. The system prompt already mentions this but nothing implements it.

**Files:**
- Modify: `src/lib/chat/agent-tools.ts` (the `fetchTasks` function, around line 333-394)

**Step 1: Cross-reference tasks with calendar in fetchTasks**

After fetching tasks, add a note about tasks that have due dates but might not have calendar blocks:

```typescript
    // Flag tasks with due dates approaching (within 3 days) that may need calendar blocks
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const needsCalendarBlock = validTasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) <= threeDaysFromNow && new Date(t.dueDate) > now && t.priority !== "none"
    );
    const calendarBlockNote = needsCalendarBlock.length > 0
      ? `\n💡 ${needsCalendarBlock.length} task(s) due within 3 days may need calendar blocks: ${needsCalendarBlock.map((t) => `"${t.title}" (due ${formatDay(new Date(t.dueDate!))})`).join(", ")}`
      : "";
```

Then append to the return string:

```typescript
    return `Tasks (${validTasks.length} pending ...):\n${formatted.join("\n")}${calendarBlockNote}`;
```

**Step 2: Add a new AI tool `create_focus_block`**

In `src/lib/ai/tools.ts`, add a new function declaration in the WORKSPACE_TOOLS array:

```typescript
    {
      name: "create_focus_block",
      description: "Create a calendar focus/work block for a specific task. Automatically titles the event with the task name and links back to the task.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          taskId: { type: SchemaType.STRING, description: "The task ID to create a focus block for" },
          start: { type: SchemaType.STRING, description: "Start time in ISO 8601 format" },
          end: { type: SchemaType.STRING, description: "End time in ISO 8601 format" },
          timeZone: { type: SchemaType.STRING, description: "IANA timezone (e.g. America/New_York)" },
        },
        required: ["taskId", "start", "end"],
      },
    },
```

And in the `executeWorkspaceTool` switch:

```typescript
      case "create_focus_block": {
        await connectDB();
        const taskId = args.taskId as string;
        if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
          return { success: false, summary: "Invalid task ID." };
        }
        const task = await Task.findById(taskId).select("title boardId").lean();
        if (!task) return { success: false, summary: "Task not found." };

        // Resolve timezone
        let tz = args.timeZone as string | undefined;
        if (!tz) {
          try {
            const user = await User.findById(userId).select("timezone").lean();
            tz = (user as { timezone?: string } | null)?.timezone || undefined;
          } catch { /* fallback */ }
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const taskLink = `${baseUrl}/boards/${task.boardId}?task=${taskId}`;

        const event = await createEvent(userId, {
          title: `🔨 ${task.title}`,
          start: args.start as string,
          end: args.end as string,
          description: `Focus block for task: ${task.title}\nOpen task: ${taskLink}`,
          timeZone: tz,
        });

        return {
          success: true,
          summary: `Created focus block "🔨 ${task.title}" from ${args.start} to ${args.end}`,
          data: { eventId: event.id, taskId, title: task.title },
        };
      }
```

Also add `import Task from "@/lib/infra/db/models/task";` at the top if not already present.

**Step 3: Verify build and commit**

```bash
git add src/lib/ai/tools.ts src/lib/chat/agent-tools.ts
git commit -m "feat: add focus block creation tool and surface tasks needing calendar blocks"
```

---

### Task 7: Smart Group Scheduling (Mutual Free Slots)

**Why:** When someone asks "when can we all meet?" in chat, the agent should check all mentioned users' calendars and return overlapping free slots. This is the killer team coordination feature.

**Files:**
- Modify: `src/lib/ai/tools.ts` (add new tool declaration + executor)

**Step 1: Add the tool declaration**

```typescript
    {
      name: "find_mutual_free_slots",
      description: "Find mutual free time slots across multiple team members for scheduling a meeting. Checks each user's Google Calendar and returns overlapping availability.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userEmails: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Email addresses of team members to check availability for",
          },
          date: { type: SchemaType.STRING, description: "Date to check in YYYY-MM-DD format (defaults to today)" },
          durationMinutes: { type: SchemaType.NUMBER, description: "Desired meeting duration in minutes (default 30)" },
          workHoursStart: { type: SchemaType.NUMBER, description: "Work hours start (24h, default 9)" },
          workHoursEnd: { type: SchemaType.NUMBER, description: "Work hours end (24h, default 18)" },
        },
        required: ["userEmails"],
      },
    },
```

**Step 2: Add the executor**

```typescript
      case "find_mutual_free_slots": {
        await connectDB();
        const emails = (args.userEmails as string[]) || [];
        if (emails.length === 0) return { success: false, summary: "No user emails provided." };

        const dateStr = (args.date as string) || new Date().toISOString().split("T")[0];
        const duration = (args.durationMinutes as number) || 30;
        const workStart = (args.workHoursStart as number) || 9;
        const workEnd = (args.workHoursEnd as number) || 18;

        // Resolve Yoodle user IDs from emails
        const users = await User.find({ email: { $in: emails } }).select("_id email").lean();
        const userMap = new Map(users.map((u) => [u.email, u._id.toString()]));

        const timeMin = `${dateStr}T${String(workStart).padStart(2, "0")}:00:00Z`;
        const timeMax = `${dateStr}T${String(workEnd).padStart(2, "0")}:00:00Z`;

        // Fetch all users' events in parallel
        const busySlots: { start: number; end: number }[][] = [];
        const checkedEmails: string[] = [];
        const failedEmails: string[] = [];

        // Always include the requesting user
        try {
          const myEvents = await listEvents(userId, { timeMin, timeMax, maxResults: 30 });
          busySlots.push(myEvents.map((e) => ({
            start: new Date(e.start).getTime(),
            end: new Date(e.end).getTime(),
          })));
          checkedEmails.push("you");
        } catch { /* requesting user's calendar failed */ }

        for (const email of emails) {
          const uid = userMap.get(email);
          if (!uid || uid === userId) continue; // skip self, already checked
          try {
            const events = await listEvents(uid, { timeMin, timeMax, maxResults: 30 });
            busySlots.push(events.map((e) => ({
              start: new Date(e.start).getTime(),
              end: new Date(e.end).getTime(),
            })));
            checkedEmails.push(email.split("@")[0]);
          } catch {
            failedEmails.push(email.split("@")[0]);
          }
        }

        // Merge all busy slots and find gaps
        const allBusy = busySlots.flat().sort((a, b) => a.start - b.start);
        const dayStart = new Date(`${dateStr}T${String(workStart).padStart(2, "0")}:00:00Z`).getTime();
        const dayEnd = new Date(`${dateStr}T${String(workEnd).padStart(2, "0")}:00:00Z`).getTime();
        const durationMs = duration * 60000;

        // Sweep line to find free windows
        const freeSlots: { start: string; end: string; minutes: number }[] = [];
        let cursor = Math.max(dayStart, Date.now()); // don't suggest past times

        for (const slot of allBusy) {
          if (slot.start > cursor && slot.start - cursor >= durationMs) {
            const slotEnd = Math.min(slot.start, dayEnd);
            if (slotEnd - cursor >= durationMs) {
              freeSlots.push({
                start: new Date(cursor).toISOString(),
                end: new Date(slotEnd).toISOString(),
                minutes: Math.round((slotEnd - cursor) / 60000),
              });
            }
          }
          cursor = Math.max(cursor, slot.end);
        }

        // Check remaining time after last event
        if (dayEnd > cursor && dayEnd - cursor >= durationMs) {
          freeSlots.push({
            start: new Date(cursor).toISOString(),
            end: new Date(dayEnd).toISOString(),
            minutes: Math.round((dayEnd - cursor) / 60000),
          });
        }

        const failedNote = failedEmails.length > 0 ? ` (couldn't check: ${failedEmails.join(", ")})` : "";
        return {
          success: true,
          summary: freeSlots.length > 0
            ? `Found ${freeSlots.length} mutual free slot(s) on ${dateStr} for ${checkedEmails.join(", ")}${failedNote}`
            : `No mutual free slots found on ${dateStr} for ${duration}+ minutes${failedNote}`,
          data: { date: dateStr, freeSlots, checkedUsers: checkedEmails, failedUsers: failedEmails },
        };
      }
```

**Step 3: Verify build and commit**

```bash
git add src/lib/ai/tools.ts
git commit -m "feat: add find_mutual_free_slots AI tool for team scheduling"
```

---

### Task 8: Post-Meeting Calendar Update with MoM Link

**Why:** After a meeting ends and MoM is generated, the Google Calendar event should be updated with a link to the meeting notes. This makes the calendar event a historical record.

**Files:**
- Modify: `src/app/api/meetings/[meetingId]/leave/route.ts` (lines 176-218, the MoM posting section)

**Step 1: After MoM is posted to conversation, also update the calendar event**

In the fire-and-forget async block that posts MoM (around line 177-218), after the MoM message is created, add:

```typescript
        // 3. Update calendar event with MoM summary (independent of step 2)
        try {
          if (result.calendarEventId && meetingWithMom?.mom?.summary) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
            const momLink = `${baseUrl}/meetings/${result._id}`;
            const momNote = `\n\n📝 Meeting Notes:\n${meetingWithMom.mom.summary}\n\nFull notes: ${momLink}`;

            await updateEvent(userId, result.calendarEventId, {
              description: (result.description || `Join Yoodle meeting`) + momNote,
            });
          }
        } catch (err) {
          log.warn({ err, meetingId: result._id }, "failed to update calendar event with MoM");
        }
```

Note: `updateEvent` is already imported at the top of this file.

**Step 2: Ensure the result object has `description` available**

The `findOneAndUpdate` on line 56 already returns the full meeting doc with `new: true`. The `calendarEventId` field is available. However, we need to make sure `description` is accessible — it may not be on the Meeting model. Check: if Meeting doesn't have a `description` field, just use a generic prefix.

Actually, looking at the code, the calendar event description was set during creation (e.g., "Join Yoodle meeting: {link}"). Since we're appending, we should read the current calendar event description first. But that's an extra API call. Simpler approach: just set the full description:

```typescript
        try {
          if (result.calendarEventId && meetingWithMom?.mom?.summary) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
            const yoodleLink = `${baseUrl}/meetings/${result.code}/room`;
            const momLink = `${baseUrl}/meetings/${result._id}`;
            const updatedDesc = [
              `Join Yoodle meeting: ${yoodleLink}`,
              ``,
              `📝 Meeting Notes:`,
              meetingWithMom.mom.summary,
              meetingWithMom.mom.keyDecisions?.length ? `\nKey Decisions: ${meetingWithMom.mom.keyDecisions.join("; ")}` : "",
              `\nFull notes: ${momLink}`,
            ].filter(Boolean).join("\n");

            await updateEvent(userId, result.calendarEventId, {
              description: updatedDesc,
            });
          }
        } catch (err) {
          log.warn({ err, meetingId: result._id }, "failed to update calendar event with MoM");
        }
```

**Step 3: Verify build and commit**

```bash
git add src/app/api/meetings/[meetingId]/leave/route.ts
git commit -m "feat: update Google Calendar event with MoM summary after meeting ends"
```

---

### Task 9: Yoodle Meeting Indicator on Calendar Events

**Why:** Users can't visually distinguish Yoodle meetings from regular calendar events. A small badge helps at a glance.

**Files:**
- Modify: `src/components/dashboard/CalendarPanel.tsx`

**Step 1: Add `isYoodleMeeting` to CalEvent**

In the `CalEvent` type, add:

```typescript
    isYoodleMeeting?: boolean;
```

**Step 2: Detect Yoodle meetings in event mapping**

In the `apiEventToCalEvent` function (line 174), after creating the event object, detect Yoodle links:

```typescript
// Add to the return object:
isYoodleMeeting: !!(event.location?.includes("/meetings/") || event.description?.includes("Yoodle meeting")),
```

Same for `apiEventToMonthEvent` (line 219).

Note: The `APICalendarEvent` interface doesn't include `description` in the mapping. Add it:

```typescript
interface APICalendarEvent {
    // ... existing fields ...
    description: string;  // already exists
}
```

Then pass `event.description` through to the detection.

**Step 3: Show indicator on event cards**

In the week view event cards (around line 1371-1384), after the title, add:

```typescript
{event.isYoodleMeeting && event.duration >= 0.5 && (
    <span className="inline-flex items-center gap-0.5 text-[8px] text-[var(--text-muted)] mt-0.5">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        Yoodle
    </span>
)}
```

In the collapsed view event cards (around line 1180), similarly:

```typescript
// After the title <p> tag, add if there's enough height:
```

For collapsed view, the events are very small (9px font), so just change the left border color for Yoodle meetings:

```typescript
// In the collapsed event rendering, modify borderLeft:
borderLeft: `2px solid ${event.isYoodleMeeting ? '#7C3AED' : event.color}`,
```

**Step 4: Verify build and commit**

```bash
git add src/components/dashboard/CalendarPanel.tsx
git commit -m "feat: add Yoodle meeting indicator badge on calendar event cards"
```

---

## Execution Order

All tasks are independent. Recommended order for maximum impact:

1. **Task 1** — Calendar cleanup on meeting cancel (fixes data corruption)
2. **Task 2** — Calendar event on direct meeting creation (consistency)
3. **Task 5** — Conflict detection on AI event creation (safety)
4. **Task 3** — Task deadlines on calendar (unified view)
5. **Task 4** — Join Meeting button improvement (UX)
6. **Task 6** — AI focus blocks for tasks (smart scheduling)
7. **Task 7** — Mutual free slots tool (team coordination)
8. **Task 8** — Post-meeting MoM on calendar (historical record)
9. **Task 9** — Yoodle meeting indicator (visual polish)

## Build Verification

After ALL tasks, run full build:
```bash
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
cd /Users/uditanshutomar/Desktop/Yoodle
npx next build
```
