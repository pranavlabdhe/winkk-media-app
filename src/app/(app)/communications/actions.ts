"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  InteractionError,
  addFeedbackToCommunication,
  createCommunication,
  createFeedbackTask,
  reclassifyCommunication,
  updateFeedbackLifecycle,
  type FeedbackDraft,
} from "@/lib/interaction-service";

function refresh(clientId?: number | null) {
  for (const path of ["/communications", "/feedback", "/tasks", "/my-work", "/dashboard", "/clients"]) {
    revalidatePath(path);
  }
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

function failurePath(base: string, message: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ error: message, ...extra });
  return `${base}?${params.toString()}`;
}

function parseFeedbackDrafts(formData: FormData): FeedbackDraft[] {
  const indexes = new Set<string>();
  for (const key of formData.keys()) {
    // The current form uses underscore names (feedback_0_title); also accept
    // the earlier dotted format so an open form from an older build can submit.
    const match = /^feedback[._](\d+)[._](?:title|description|category|sentiment|priority|action_required|assigned_to|due_date|create_task)$/.exec(key);
    if (match) indexes.add(match[1]);
  }
  return [...indexes]
    .sort((a, b) => Number(a) - Number(b))
    .map((index) => {
      const get = (field: string) =>
        String(
          formData.get(`feedback_${index}_${field}`) ??
            formData.get(`feedback.${index}.${field}`) ??
            ""
        );
      return {
        title: get("title"),
        description: get("description"),
        category: get("category"),
        sentiment: get("sentiment"),
        priority: get("priority"),
        actionRequired: get("action_required") === "on",
        assignedTo: get("assigned_to") ? Number(get("assigned_to")) : null,
        dueDate: get("due_date") || null,
        createTask: get("create_task") === "on",
      } satisfies FeedbackDraft;
    });
}

export async function logCommunicationAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  let createdId: number | null = null;
  try {
    const result = createCommunication(
      {
        clientId: Number(formData.get("client_id")),
        executiveName: String(formData.get("executive_name") || ""),
        channel: String(formData.get("channel") || "whatsapp"),
        whatsappGroup: String(formData.get("whatsapp_group") || "") || null,
        clientMessageAt: String(formData.get("client_message_at") || "") || null,
        responseAt: String(formData.get("response_at") || "") || null,
        status: String(formData.get("status") || "responded"),
        notes: String(formData.get("notes") || "") || null,
        communicationType: String(formData.get("communication_type") || ""),
        taskId: formData.get("task_id") ? Number(formData.get("task_id")) : null,
        feedback: parseFeedbackDrafts(formData),
      },
      session.id
    );
    createdId = result.communicationId;
    refresh(Number(formData.get("client_id")));
  } catch (error) {
    if (error instanceof InteractionError) {
      redirect(failurePath("/communications", error.message));
    }
    throw error;
  }

  redirect(`/communications?communication=${createdId}&saved=1`);
}

export async function updateCommunicationAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const id = Number(formData.get("id"));
  if (!id) return;

  const current = db.prepare("SELECT * FROM communications WHERE id=?").get(id) as any;
  if (!current) return;

  const nextStatus = String(formData.get("status") || current.status);
  const nextChannel = String(formData.get("channel") || current.channel || "whatsapp");
  const nextNotes = String(formData.get("notes") || "") || null;
  const nextResponseAt = String(formData.get("response_at") || "") || null;

  db.prepare(
    "UPDATE communications SET status=?, channel=?, notes=?, response_at=? WHERE id=?"
  ).run(nextStatus, nextChannel, nextNotes, nextResponseAt, id);

  const changed: string[] = [];
  if (current.status !== nextStatus) changed.push(`status updated to ${nextStatus}`);
  if ((current.channel || "whatsapp") !== nextChannel) changed.push("channel updated");
  if ((current.notes || null) !== nextNotes) changed.push("note updated");
  if ((current.response_at || null) !== nextResponseAt) changed.push("response time updated");

  if (changed.length) {
    const { logActivity } = await import("@/lib/activity-service");
    logActivity({
      clientId: current.client_id,
      taskId: current.task_id,
      entityType: "communication",
      entityId: id,
      action: "updated",
      summary: `Communication ${changed.join(", ")}.`,
      userId: session.id,
    });
  }
  refresh(current.client_id);
}

export async function addFeedbackAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const communicationId = Number(formData.get("communication_id"));
  if (!communicationId) return;

  try {
    const feedbackId = addFeedbackToCommunication(
      communicationId,
      {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        category: String(formData.get("category") || "other"),
        sentiment: String(formData.get("sentiment") || "neutral"),
        priority: String(formData.get("priority") || "medium"),
        actionRequired: formData.get("action_required") === "on",
        assignedTo: formData.get("assigned_to") ? Number(formData.get("assigned_to")) : null,
        dueDate: String(formData.get("due_date") || "") || null,
        createTask: formData.get("create_task") === "on",
      },
      session.id
    );
    refresh(
      (db.prepare("SELECT client_id FROM communications WHERE id=?").get(communicationId) as any)
        ?.client_id
    );
    redirect(`/feedback?feedback=${feedbackId}&saved=1`);
  } catch (error) {
    if (error instanceof InteractionError) {
      redirect(failurePath("/communications", error.message, { communication: String(communicationId) }));
    }
    throw error;
  }
}

export async function reclassifyCommunicationAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const id = Number(formData.get("id"));
  const nextType = String(formData.get("communication_type") || "");
  if (!id || !nextType) return;

  try {
    reclassifyCommunication(id, nextType, session.id);
    refresh(
      (db.prepare("SELECT client_id FROM communications WHERE id=?").get(id) as any)?.client_id
    );
    redirect(`/communications?communication=${id}&saved=1`);
  } catch (error) {
    if (error instanceof InteractionError) {
      redirect(failurePath("/communications", error.message, { communication: String(id) }));
    }
    throw error;
  }
}

export async function updateFeedbackAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const id = Number(formData.get("id"));
  if (!id) return;

  try {
    updateFeedbackLifecycle(
      id,
      {
        status: formData.get("status") ? String(formData.get("status")) : undefined,
        title:
          formData.get("title") !== null ? String(formData.get("title") || "") : undefined,
        description:
          formData.get("description") !== null
            ? String(formData.get("description") || "")
            : undefined,
        category:
          formData.get("category") ? String(formData.get("category")) : undefined,
        sentiment:
          formData.get("sentiment") ? String(formData.get("sentiment")) : undefined,
        actionTaken:
          formData.get("action_taken") !== null
            ? String(formData.get("action_taken") || "")
            : undefined,
        assignedTo:
          formData.get("assigned_to") !== null
            ? Number(formData.get("assigned_to")) || null
            : undefined,
        dueDate:
          formData.get("due_date") !== null
            ? String(formData.get("due_date") || "") || null
            : undefined,
        priority: formData.get("priority") ? String(formData.get("priority")) : undefined,
      },
      { id: session.id, role: session.role }
    );
    refresh(
      (db.prepare("SELECT client_id FROM feedback WHERE id=?").get(id) as any)?.client_id
    );
  } catch (error) {
    if (error instanceof InteractionError) {
      const feedback = db
        .prepare("SELECT communication_id FROM feedback WHERE id=?")
        .get(id) as any;
      redirect(
        failurePath(
          "/feedback",
          error.message,
          feedback?.communication_id
            ? { communication: String(feedback.communication_id) }
            : undefined
        )
      );
    }
    throw error;
  }
}

export async function createFeedbackTaskAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const feedbackId = Number(formData.get("feedback_id"));
  const assignedTo = Number(formData.get("assigned_to"));
  if (!feedbackId || !assignedTo) return;

  try {
    createFeedbackTask(
      feedbackId,
      {
        assignedTo,
        dueDate: String(formData.get("due_date") || "") || null,
        priority: String(formData.get("priority") || ""),
      },
      session.id
    );
    refresh(
      (db.prepare("SELECT client_id FROM feedback WHERE id=?").get(feedbackId) as any)?.client_id
    );
    redirect(`/feedback?feedback=${feedbackId}&saved=1`);
  } catch (error) {
    if (error instanceof InteractionError) {
      redirect(failurePath("/feedback", error.message, { feedback: String(feedbackId) }));
    }
    throw error;
  }
}

export async function addFeedbackNoteAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const feedbackId = Number(formData.get("feedback_id"));
  const note = String(formData.get("note") || "").trim();
  if (!feedbackId || !note) return;

  db.prepare("INSERT INTO feedback_updates (feedback_id,note,user_id) VALUES (?,?,?)").run(
    feedbackId,
    note,
    session.id
  );
  const feedback = db.prepare("SELECT * FROM feedback WHERE id=?").get(feedbackId) as any;
  const { logActivity } = await import("@/lib/activity-service");
  logActivity({
    clientId: feedback?.client_id,
    taskId: feedback?.task_id,
    entityType: "feedback",
    entityId: feedbackId,
    action: "note",
    summary: note,
    userId: session.id,
  });
  refresh(feedback?.client_id);
}

/**
 * Standalone feedback intake used on the Feedback page.
 * It always creates the originating communication, so no feedback exists
 * without an interaction record.
 */
export async function quickLogFeedbackAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const clientId = Number(formData.get("client_id"));
  const now = new Date().toISOString().slice(0, 16);
  let feedbackId: number | null = null;

  try {
    const result = createCommunication(
      {
        clientId,
        executiveName: String(formData.get("executive_name") || session.name),
        channel: String(formData.get("channel") || "whatsapp"),
        clientMessageAt: String(formData.get("client_message_at") || now),
        responseAt: String(formData.get("response_at") || now),
        status: "responded",
        notes: String(formData.get("notes") || "") || null,
        communicationType: "feedback",
        feedback: [
          {
            title: String(formData.get("title") || ""),
            description: String(formData.get("description") || ""),
            category: String(formData.get("category") || "other"),
            sentiment: String(formData.get("sentiment") || "neutral"),
            priority: String(formData.get("priority") || "medium"),
            actionRequired: formData.get("action_required") === "on",
            assignedTo: formData.get("assigned_to") ? Number(formData.get("assigned_to")) : null,
            dueDate: String(formData.get("due_date") || "") || null,
            createTask: formData.get("create_task") === "on",
          },
        ],
      },
      session.id
    );
    feedbackId = result.feedbackIds[0] || null;
    refresh(clientId);
  } catch (error) {
    if (error instanceof InteractionError) {
      redirect(failurePath("/feedback", error.message));
    }
    throw error;
  }

  redirect(`/feedback?feedback=${feedbackId}&saved=1`);
}
