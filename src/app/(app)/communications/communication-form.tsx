"use client";

import { useState } from "react";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_TYPES,
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SENTIMENTS,
} from "@/lib/constants";
import { logCommunicationAction } from "./actions";

type ClientOption = { id: number; name: string; whatsapp_group: string | null };
type UserOption = { id: number; name: string; job_title: string | null };

type FeedbackItem = { key: number; actionRequired: boolean; createTask: boolean };

let nextKey = 2;

export function CommunicationForm({
  clients,
  users,
  defaultExecutive,
  defaultClientId,
  defaultChannel = "whatsapp",
  currentUserId,
}: {
  clients: ClientOption[];
  users: UserOption[];
  defaultExecutive: string;
  defaultClientId?: number;
  defaultChannel?: string;
  currentUserId: number;
}) {
  const [type, setType] = useState("");
  const [items, setItems] = useState<FeedbackItem[]>([
    { key: 1, actionRequired: true, createTask: true },
  ]);

  function updateItem(key: number, patch: Partial<FeedbackItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((current) => [
      ...current,
      { key: nextKey++, actionRequired: true, createTask: true },
    ]);
  }

  function removeItem(key: number) {
    setItems((current) => (current.length > 1 ? current.filter((item) => item.key !== key) : current));
  }

  return (
    <form action={logCommunicationAction} className="space-y-3 rounded-lg border bg-white p-4">
      <div className="grid gap-2 md:grid-cols-4">
        <select
          name="communication_type"
          required
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="rounded border px-3 py-2 md:col-span-2"
        >
          <option value="">Communication type *</option>
          {COMMUNICATION_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          name="channel"
          defaultValue={defaultChannel}
          className="rounded border px-3 py-2"
        >
          {COMMUNICATION_CHANNELS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select name="status" className="rounded border px-3 py-2" defaultValue="responded">
          {["responded", "pending", "missed", "delayed"].map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>

        <select
          name="client_id"
          required
          defaultValue={defaultClientId || ""}
          className="rounded border px-3 py-2"
        >
          <option value="">Client *</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <input
          name="executive_name"
          required
          defaultValue={defaultExecutive}
          placeholder="Handled by *"
          className="rounded border px-3 py-2"
        />
        <input name="whatsapp_group" placeholder="Group / participants" className="rounded border px-3 py-2 md:col-span-2" />

        <label className="text-xs">
          Client message at
          <input
            name="client_message_at"
            type="datetime-local"
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="text-xs">
          Response at
          <input
            name="response_at"
            type="datetime-local"
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <div className="text-xs text-zinc-600 md:col-span-2 md:self-end">
          {type === "feedback"
            ? "The communication and every feedback item are saved together."
            : "General communication keeps the conversation history without creating feedback."}
        </div>

        <textarea
          name="notes"
          rows={2}
          placeholder="What was discussed — the full note stays visible on the communication record"
          className="rounded border px-3 py-2 md:col-span-4"
        />
      </div>

      {type === "feedback" && (
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Feedback received in this communication</div>
              <p className="text-xs text-zinc-600">
                One client call can contain several feedback items. Each one becomes its own record.
              </p>
            </div>
            <button
              type="button"
              onClick={addItem}
              className="rounded border px-2 py-1 text-xs"
            >
              + Add another feedback item
            </button>
          </div>

          {items.map((item, index) => (
            <div key={item.key} className="rounded border bg-zinc-50 p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Feedback {index + 1}
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    className="rounded border px-2 py-0.5 text-xs"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <input
                  name={`feedback.${index}.title`}
                  required
                  placeholder="Feedback subject *"
                  className="rounded border px-3 py-2 md:col-span-2"
                />
                <select name={`feedback.${index}.category`} className="rounded border px-3 py-2" defaultValue="creative">
                  {FEEDBACK_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select name={`feedback.${index}.sentiment`} className="rounded border px-3 py-2" defaultValue="neutral">
                  {FEEDBACK_SENTIMENTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <textarea
                  name={`feedback.${index}.description`}
                  required
                  rows={2}
                  placeholder="What exactly did the client say? *"
                  className="rounded border px-3 py-2 md:col-span-4"
                />

                <select name={`feedback.${index}.priority`} className="rounded border px-3 py-2" defaultValue="medium">
                  {FEEDBACK_PRIORITIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} priority
                    </option>
                  ))}
                </select>
                <select
                  name={`feedback.${index}.assigned_to`}
                  className="rounded border px-3 py-2"
                  defaultValue={currentUserId}
                >
                  <option value="">Assign if action needed</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.job_title ? ` · ${user.job_title}` : ""}
                    </option>
                  ))}
                </select>
                <label className="text-xs">
                  Expected resolution
                  <input
                    name={`feedback.${index}.due_date`}
                    type="date"
                    className="mt-1 w-full rounded border px-3 py-2"
                  />
                </label>
                <div className="space-y-1 self-center text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={`feedback.${index}.action_required`}
                      checked={item.actionRequired}
                      onChange={(event) =>
                        updateItem(item.key, { actionRequired: event.target.checked })
                      }
                    />
                    Action required
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={`feedback.${index}.create_task`}
                      checked={item.createTask}
                      onChange={(event) => updateItem(item.key, { createTask: event.target.checked })}
                    />
                    Create a follow-up task
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="w-full rounded bg-zinc-900 px-3 py-2 font-medium text-white md:w-auto">
        Log communication
      </button>
    </form>
  );
}
