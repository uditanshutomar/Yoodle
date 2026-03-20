# AI Calendar Assist — Design Document

**Date:** 2026-03-20
**Status:** Approved

## Overview

Add AI-powered suggestions to the CalendarPage event creation form. As users fill out the form, AI progressively suggests titles, attendees, agenda items, and reference documents — each with reasoning explaining *why*. The existing Yoodler chat already handles full event creation independently via tools; this design adds inline AI assist to the manual form.

## Approach: Hybrid (New Route + Existing Tools + Gemini)

A new API route (`/api/ai/calendar-assist`) gathers data using existing workspace tool functions (contacts, meetings, drive files, board tasks) and calls Gemini only for creative synthesis (title completions, agenda generation, relevance ranking with reasoning).

## API Route

### `POST /api/ai/calendar-assist`

Authenticated, rate-limited under the `ai` preset (20/min). Returns structured JSON, not streaming.

### Request Shapes

```typescript
// Title suggestions (as user types, debounce 800ms, min 3 chars)
{ field: "titles", partial: "Sprint Pl" }

// Attendee suggestions (after title confirmed)
{ field: "attendees", title: "Sprint Planning", existingAttendees: ["userId1"] }

// Agenda suggestions (after attendees set)
{ field: "agenda", title: "Sprint Planning", attendees: ["userId1", "userId2"] }

// Reference doc suggestions (after agenda set)
{ field: "references", title: "Sprint Planning", attendees: [...], agenda: "..." }
```

### Response Shapes

```typescript
// Titles
{
  suggestions: [
    { value: "Sprint Planning - Q1 Review", reason: "You had a similar meeting last month" },
    { value: "Sprint Planning with Design Team", reason: "Priya and Arjun are on the design board" },
  ],
  suggestYoodleRoom: true,
  yoodleRoomReason: "Your last 3 sprint meetings used Yoodle Rooms"
}

// Attendees
{
  suggestions: [
    { userId: "abc", name: "Priya Sharma", displayName: "Priya", avatarUrl: "...", reason: "Attended your last 3 sprint meetings" },
  ]
}

// Agenda
{
  suggestions: [
    { value: "Review sprint velocity and burndown", reason: "Based on current board progress" },
  ]
}

// References
{
  suggestions: [
    { title: "Sprint Retrospective Notes", url: "https://docs.google.com/...", type: "doc", reason: "Last edited by you 2 days ago" },
  ]
}
```

### Internal Data Gathering Per Field

| Field | Data gathered (existing tools) | Gemini used for |
|-------|-------------------------------|-----------------|
| `titles` | Recent meetings (list_calendar_events), board names | Creative title completions + reasoning |
| `attendees` | Contacts (search_contacts), recent meeting participants, board members | Ranking + reasoning |
| `agenda` | Board tasks (searchBoardTasks), recent meetings with same attendees | Generating talking points + reasoning |
| `references` | Drive files (search_drive_files) scoped to title keywords | Ranking relevance + reasoning |

Yoodle Room suggestion based on: past meetings with similar title/attendees, whether attendees are all Yoodle users, recurring meeting patterns.

## Progressive Trigger Chain

```
User types title (debounce 800ms, min 3 chars)
  → fetch titles → title dropdown (autocomplete style)
  → suggestYoodleRoom auto-toggles switch if true

User confirms title
  → fetch attendees → chips below attendees field

User adds attendees (AI or manual)
  → fetch agenda → chips below agenda textarea

Agenda set
  → fetch references → chips below reference links field
```

Each stage clears downstream suggestions when its input changes.

## UI Components

### `AISuggestionChips` (new reusable component)

Renders a list of suggestion chips with:
- ✨ AI Suggestions header (yellow #FFE600 accent)
- Each chip: icon/avatar + primary text + reason subtext + ✕ dismiss + click-to-add
- Loading skeleton (pulsing chip outlines) while fetching
- "Dismiss all" link
- Empty state: section doesn't render (no "No suggestions" noise)
- Neo-brutalist styling: 2px border, offset shadow, rounded-2xl

Title suggestions render as a dropdown (picking one), not chips.

### `useCalendarAssist` (new custom hook)

Manages:
- Suggestion state for all 4 fields
- Debounce (800ms for title typing, instant for field transitions)
- AbortController for canceling stale requests
- Loading states per field
- Progressive trigger logic
- 60s stale cache for re-opened forms

## Error Handling

- **AI failures are non-fatal.** Form works exactly as today if AI is unavailable.
- **10s timeout** per request. Abort and let user continue manually.
- **Rate limit (429):** Silently stop requesting for that form session.
- **No Google connection (403):** Skip reference doc suggestions. Others still work from Yoodle data.

## Edge Cases

| Case | Behavior |
|------|----------|
| Title < 3 chars | Don't trigger |
| User types fast | Cancel previous request (AbortController), use latest |
| User ignores all suggestions | Form submits as normal |
| Title changes after attendees suggested | Clear downstream, re-trigger |
| Duplicate suggestion (already added) | Filter before rendering |
| No data found | Empty suggestions, section hidden |

## Files to Create

| File | Purpose |
|------|---------|
| `src/app/api/ai/calendar-assist/route.ts` | API route — dispatch by field, gather data, Gemini synthesis |
| `src/components/calendar/AISuggestionChips.tsx` | Reusable suggestion chip component |
| `src/components/calendar/useCalendarAssist.ts` | Hook — state, debounce, abort, progressive triggers |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/calendar/CalendarPage.tsx` | Wire useCalendarAssist into CreateEventModal, render AISuggestionChips below fields, title autocomplete dropdown |

## Scope Boundary (NOT building)

- AI editing of existing events (PATCH)
- EventDetailModal AI features
- Post-meeting AI features
- Calendar analytics or insights
- Streaming responses in the form
- Persistent suggestion history
- Training/feedback loop on accepted/dismissed suggestions

## Existing Chat Integration (No Changes Needed)

The Yoodler AI Drawer already supports full event creation from chat via existing tools: `create_yoodle_meeting`, `create_calendar_event`, `search_contacts`, `search_drive_files`, `create_meeting_agenda`. Users can create events with attendees, agenda, and docs entirely from chat without opening the calendar page.
