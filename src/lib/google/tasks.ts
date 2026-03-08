import { getGoogleServices } from "./client";

export interface TaskList {
  id: string;
  title: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
  links?: { type: string; description: string; link: string }[];
}

/**
 * List all task lists.
 */
export async function listTaskLists(userId: string): Promise<TaskList[]> {
  const { tasks } = await getGoogleServices(userId);

  const res = await tasks.tasklists.list({ maxResults: 100 });

  return (res.data.items || []).map((tl) => ({
    id: tl.id || "",
    title: tl.title || "",
  }));
}

/**
 * List tasks in a task list.
 */
export async function listTasks(
  userId: string,
  taskListId = "@default",
  options: { showCompleted?: boolean; maxResults?: number } = {}
): Promise<Task[]> {
  const { tasks } = await getGoogleServices(userId);

  const res = await tasks.tasks.list({
    tasklist: taskListId,
    showCompleted: options.showCompleted ?? false,
    maxResults: options.maxResults || 50,
  });

  return (res.data.items || []).map(formatTask);
}

/**
 * Create a new task.
 */
export async function createTask(
  userId: string,
  taskListId = "@default",
  options: { title: string; notes?: string; due?: string }
): Promise<Task> {
  const { tasks } = await getGoogleServices(userId);

  const res = await tasks.tasks.insert({
    tasklist: taskListId,
    requestBody: {
      title: options.title,
      notes: options.notes,
      due: options.due,
    },
  });

  return formatTask(res.data);
}

/**
 * Update a task.
 */
export async function updateTask(
  userId: string,
  taskListId: string,
  taskId: string,
  updates: { title?: string; notes?: string; status?: "needsAction" | "completed"; due?: string }
): Promise<Task> {
  const { tasks } = await getGoogleServices(userId);

  const res = await tasks.tasks.patch({
    tasklist: taskListId,
    task: taskId,
    requestBody: updates,
  });

  return formatTask(res.data);
}

/**
 * Delete a task.
 */
export async function deleteTask(
  userId: string,
  taskListId: string,
  taskId: string
): Promise<void> {
  const { tasks } = await getGoogleServices(userId);

  await tasks.tasks.delete({
    tasklist: taskListId,
    task: taskId,
  });
}

/**
 * Mark a task as completed.
 */
export async function completeTask(
  userId: string,
  taskListId: string,
  taskId: string
): Promise<Task> {
  return updateTask(userId, taskListId, taskId, { status: "completed" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTask(task: any): Task {
  return {
    id: task.id || "",
    title: task.title || "",
    notes: task.notes,
    status: task.status || "needsAction",
    due: task.due,
    completed: task.completed,
    links: task.links,
  };
}
