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
  const [selectedClientId, setSelectedClientId] = useState<number | undefined>(defaultClientId);
  const [items, setItems] = useState<FeedbackItem[]>([
    { key: 1, actionRequired: true, createTask: true },
  ]);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  function updateItem(key: number, patch: Partial<FeedbackItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      { key: nextKey++, actionRequired: true, createTask: true },
    ]);
  }

  function removeItem(key: number) {
    setItems((current) =>
      current.length > 1 ? current.filter((item) => item.key !== key) : current
    );
  }

  const isFeedbackType = type === "feedback";

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#ed8527]/10 text-[#ed8527]">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </span>
          <h2 className="text-sm font-bold text-[#12143d]">
            Log Client Interaction / Communication
          </h2>
        </div>
        <span className="text-[11px] font-medium text-slate-400">
          Tracks response SLAs & extracts feedback items
        </span>
      </div>

      <form action={logCommunicationAction} className="space-y-4">
        {/* Step 1: Communication Classification */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Communication Type <span className="text-rose-500">*</span>
            </label>
            <select
              name="communication_type"
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
            >
              <option value="">Select type *</option>
              {COMMUNICATION_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Channel
            </label>
            <select
              name="channel"
              defaultValue={defaultChannel}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
            >
              {COMMUNICATION_CHANNELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              SLA / Response Status
            </label>
            <select
              name="status"
              defaultValue="responded"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
            >
              <option value="responded">Responded in Time</option>
              <option value="pending">Pending Response</option>
              <option value="delayed">Delayed Response</option>
              <option value="missed">Missed Communication</option>
            </select>
          </div>
        </div>

        {/* Step 2: Client & Team Context */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Client Account <span className="text-rose-500">*</span>
            </label>
            <select
              name="client_id"
              required
              defaultValue={defaultClientId || ""}
              onChange={(e) => setSelectedClientId(Number(e.target.value) || undefined)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
            >
              <option value="">Select client *</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Handled by Executive <span className="text-rose-500">*</span>
            </label>
            <input
              name="executive_name"
              defaultValue={defaultExecutive}
              required
              placeholder="Your name / executive"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              WhatsApp Group / Phone / Contact
            </label>
            <input
              name="whatsapp_group"
              defaultValue={selectedClient?.whatsapp_group || ""}
              placeholder="e.g. Solhaus Marketing"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
            />
          </div>
        </div>

        {/* Timestamps */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Client Message Received Timestamp
            </label>
            <input
              name="client_message_at"
              type="datetime-local"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Our Response Timestamp
            </label>
            <input
              name="response_at"
              type="datetime-local"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Conversation Notes / Summary
          </label>
          <textarea
            name="notes"
            rows={2}
            placeholder="Summarize the client discussion, questions, or context..."
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 shadow-2xs focus:border-[#ed8527] focus:outline-none focus:ring-2 focus:ring-[#ed8527]/20"
          />
        </div>

        {/* Step 3: Extracted Feedback Items (When feedback type is chosen) */}
        {isFeedbackType && (
          <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Feedback Items in this Conversation
                </h3>
                <p className="text-[11px] text-amber-700">
                  Each item will create a distinct tracked record on the feedback board.
                </p>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="rounded-lg bg-white border border-amber-300 px-3 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer shadow-2xs"
              >
                + Add Another Feedback
              </button>
            </div>

            {items.map((item, index) => (
              <div
                key={item.key}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#12143d]">
                    Feedback Item #{index + 1}
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="text-xs text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Subject <span className="text-rose-500">*</span>
                    </label>
                    <input
                      name={`feedback_${index}_title`}
                      required
                      placeholder="e.g. Change reel music to trending audio"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-[#ed8527] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Category
                    </label>
                    <select
                      name={`feedback_${index}_category`}
                      defaultValue="creative"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-[#ed8527] focus:outline-none"
                    >
                      {FEEDBACK_CATEGORIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    What did the client say? <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    name={`feedback_${index}_description`}
                    required
                    rows={2}
                    placeholder="Specific revision instructions..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-[#ed8527] focus:outline-none"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Sentiment
                    </label>
                    <select
                      name={`feedback_${index}_sentiment`}
                      defaultValue="neutral"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                    >
                      {FEEDBACK_SENTIMENTS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Priority
                    </label>
                    <select
                      name={`feedback_${index}_priority`}
                      defaultValue="medium"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                    >
                      {FEEDBACK_PRIORITIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Assign to
                    </label>
                    <select
                      name={`feedback_${index}_assigned_to`}
                      defaultValue={currentUserId}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                    >
                      <option value="">Unassigned</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Expected Date
                    </label>
                    <input
                      name={`feedback_${index}_due_date`}
                      type="date"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      name={`feedback_${index}_action_required`}
                      checked={item.actionRequired}
                      onChange={(e) => updateItem(item.key, { actionRequired: e.target.checked })}
                      className="rounded text-[#ed8527]"
                    />
                    Action required
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      name={`feedback_${index}_create_task`}
                      checked={item.createTask}
                      onChange={(e) => updateItem(item.key, { createTask: e.target.checked })}
                      className="rounded text-[#ed8527]"
                    />
                    Create linked task
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-xs text-slate-500">
            {isFeedbackType
              ? "⚡ Will log the communication and create all listed feedback items with assigned tasks."
              : "General client interactions record communication SLA without creating feedback tickets."}
          </p>
          <button
            type="submit"
            className="w-full sm:w-auto rounded-xl bg-[#ed8527] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#ed8527]/20 transition-all hover:bg-[#d97116] hover:shadow-lg active:scale-[0.99] cursor-pointer"
          >
            + Log Communication
          </button>
        </div>
      </form>
    </div>
  );
}
