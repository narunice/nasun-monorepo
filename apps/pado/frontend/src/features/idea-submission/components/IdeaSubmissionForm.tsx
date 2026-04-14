import { useState, useMemo } from "react";
import { useSigner } from "@nasun/wallet";
import { useChat } from "../../social/hooks/useChat";
import { submitIdea, type IdeaSubmitError } from "../api/submit";

const MAX_TITLE = 100;
const MAX_DESCRIPTION = 2000;

type UiState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; error: IdeaSubmitError };

export function IdeaSubmissionForm() {
  const { address: walletAddress } = useSigner();
  // useChat() keeps the chat-server WebSocket alive while this page is mounted,
  // which is what issues the REST sessionToken used by the submit API.
  const { isConnected } = useChat();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<UiState>({ kind: "idle" });

  const canSubmit = useMemo(() => {
    if (state.kind === "submitting") return false;
    if (!walletAddress) return false;
    if (!isConnected) return false;
    if (title.trim().length === 0) return false;
    if (description.trim().length === 0) return false;
    return true;
  }, [state.kind, walletAddress, isConnected, title, description]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setState({ kind: "submitting" });
    const result = await submitIdea({
      title: title.trim(),
      description: description.trim(),
    });
    if (result.ok) {
      setState({ kind: "success" });
      setTitle("");
      setDescription("");
    } else {
      setState({ kind: "error", error: result.error });
    }
  }

  const titleRemaining = MAX_TITLE - title.length;
  const descRemaining = MAX_DESCRIPTION - description.length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-theme-text-primary">
          Ideas for Prediction Markets
        </h1>
        <p className="">
          Help shape Pado into the best prediction markets. Tell us what you
          like and dislike about other prediction markets. What kind of markets
          you want. Technical ideas are also welcome. Accepted submissions earn
          Nasun points.
        </p>
      </header>

      {!walletAddress && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Connect your Nasun wallet to submit an idea.
        </div>
      )}

      {walletAddress && !isConnected && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-theme-text-muted">
          Connecting to the chat server&hellip;
        </div>
      )}

      {state.kind === "success" && (
        <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-sm text-green-200">
          <p className="font-medium">Submitted. Thanks for your input.</p>
        </div>
      )}

      {state.kind === "error" && state.error.kind === "not_registered" && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200 space-y-2">
          <p>This wallet is not linked to a Nasun account.</p>
          <a
            href="https://nasun.io/my-account"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block underline hover:text-red-100"
          >
            Register at nasun.io &rarr;
          </a>
        </div>
      )}

      {state.kind === "error" && state.error.kind !== "not_registered" && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          Submission failed. Please try again.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="idea-title"
            className="block font-medium text-theme-text-primary"
          >
            Title
          </label>
          <input
            id="idea-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
            placeholder="Short summary"
            maxLength={MAX_TITLE}
            disabled={state.kind === "submitting"}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-theme-text-primary placeholder:text-white/30 focus:outline-none focus:border-nasun-c4 disabled:opacity-50"
          />
          <p className="text-xs text-white/40 text-right">{titleRemaining}</p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="idea-description"
            className="block font-medium text-theme-text-primary"
          >
            Description
          </label>
          <textarea
            id="idea-description"
            value={description}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, MAX_DESCRIPTION))
            }
            placeholder="What's the idea?"
            maxLength={MAX_DESCRIPTION}
            rows={8}
            disabled={state.kind === "submitting"}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-theme-text-primary placeholder:text-white/30 focus:outline-none focus:border-nasun-c4 disabled:opacity-50 resize-none"
          />
          <p className="text-xs text-white/40 text-right">{descRemaining}</p>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg bg-nasun-c4 px-4 py-2.5 text-sm font-semibold text-white hover:bg-nasun-c5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {state.kind === "submitting" ? "Submitting…" : "Submit"}
        </button>
      </form>

      <p className="text-sm text-white/60 text-center">
        Submissions are reviewed by the Nasun team. Accepted ideas earn Nasun
        ecosystem points.
      </p>
    </div>
  );
}
