/**
 * The on-call agent's tools.
 *
 * A channel tool handler receives the LIVE thread, which is what makes the
 * proposal below possible: it posts a card and returns. A later click reports
 * the decision; it does not resume the agent or execute an action.
 *
 * The return value is what the *agent* reads back, not what the user sees.
 * Return raw data (it is JSON-stringified for you) or a short natural-language
 * confirmation — never `{ ok: true }`, and never hand-stringify.
 */
import {
  defineChannelTool,
  Message,
  Header,
  Section,
  Markdown,
  Context,
  Actions,
  Button,
} from "@copilotkit/channels";
import type { InteractionContext } from "@copilotkit/channels";
export { searchTheWeb } from "./search";
import { z } from "zod";
import { WebClient } from "@slack/web-api";

/**
 * Read the incident context already present in the conversation.
 */
export const readThread = defineChannelTool({
  name: "read_thread",
  description:
    "Read the recent messages in this conversation. Call this FIRST on any incident question — the thread almost certainly already says what broke, when, and what has been tried. Asking someone to re-explain an outage is the worst thing you can do here.",
  parameters: z.object({}),
  async handler(_args, { thread }) {
    const messages = await thread.getMessages();
    if (messages.length === 0) {
      return "This surface does not expose conversation history, or the thread is empty. Say that you cannot see earlier messages and ask for the shortest possible summary.";
    }
    return messages;
  },
});

/**
 * Managed delivery cannot block on awaitChoice. Post a proposal and let a later
 * interaction report the decision. This demo has no production executor.
 * Inline handlers require one listener instance that stays running until click.
 */
export const proposeAction = defineChannelTool({
  name: "propose_action",
  description:
    "Post an action proposal for human review. This returns pending immediately. Stop after posting: do not execute the action or call write tools. A later click reports a decision only; it does not execute anything or resume you.",
  parameters: z.object({
    action: z.string().describe("The proposed action, in one plain sentence."),
    blastRadius: z
      .string()
      .describe(
        "What this affects if it goes wrong. Be specific and pessimistic.",
      ),
    reversible: z
      .boolean()
      .describe("Whether this can be undone in under a minute."),
  }),
  async handler({ action, blastRadius, reversible }, { thread }) {
    // The SDK retains inline action handlers after a message replacement. Queue
    // clicks and settle only after a successful update, so stale/opposite clicks
    // cannot overwrite a decision and a failed update remains retryable.
    let settled = false;
    let previousReport = Promise.resolve();
    const reportDecision = (
      approved: boolean,
      ctx: InteractionContext<boolean>,
    ) => {
      const report = async () => {
        if (settled) return;
        const decision = approved
          ? "Approved proposal. No action was executed."
          : "Held by the responder. No action was executed. Do not take the action or offer a workaround.";
        // Use the interaction's thread, whose delivery is live now.
        await ctx.thread.update(
          ctx.message.ref,
          `${decision}\n\nProposal: ${action}`,
        );
        settled = true;
      };
      previousReport = previousReport.then(report, report);
      return previousReport;
    };
    await thread.post(
      <Message accent="#C4145F">
        <Header>Review action proposal</Header>
        <Section>
          <Markdown>{`**${action}**\n\nBlast radius: ${blastRadius}`}</Markdown>
        </Section>
        <Context>
          {reversible
            ? "Reversible in under a minute"
            : "NOT easily reversible"}
        </Context>
        <Context>
          Demo proposal only. Clicking records a decision; it executes nothing.
        </Context>
        <Actions>
          <Button
            value={true}
            style="primary"
            onClick={async (ctx) => {
              await reportDecision(true, ctx);
            }}
          >
            Approve
          </Button>
          <Button
            value={false}
            style="danger"
            onClick={async (ctx) => {
              await reportDecision(false, ctx);
            }}
          >
            Hold
          </Button>
        </Actions>
      </Message>,
    );

    return "Proposal posted; decision pending. Stop here. Do not take the action, call write tools, or offer a workaround. A later click only reports the decision; no action is executed and the agent does not automatically resume.";
  },
});

/**
 * `read_thread` only ever sees the Slack thread the current turn is running
 * in — the managed SDK scopes conversation history by Slack `thread_ts`, and
 * a top-level channel message is its own thread of one. Decisions in this
 * demo are discussed across plain channel messages and separate threads, so
 * this bypasses that scoping and reads Slack directly with the bot token,
 * merging top-level history with every thread's replies.
 */
function slackBotToken(): string | undefined {
  const code = (process.env.CHANNEL_CODE ?? "").toUpperCase().replace(/-/g, "_");
  return process.env[`INTELLIGENCE_CHANNEL_${code}_SLACK_BOT_TOKEN`];
}

/**
 * The public `Thread` type doesn't expose the Slack channel id — only the
 * internal `Thread` class carries `conversationKey` (`"<channelId>::<scope>"`,
 * per the Slack adapter's own `conversationKeyOf`/`getOrCreate` parsing). Read
 * it defensively so a future SDK change degrades to a clear message instead of
 * a runtime crash.
 */
function channelIdOf(thread: unknown): string | undefined {
  const key = (thread as { conversationKey?: unknown }).conversationKey;
  if (typeof key !== "string") return undefined;
  return key.split("::")[0] || undefined;
}

const userNameCache = new Map<string, string>();

async function resolveUserName(client: WebClient, userId: string): Promise<string> {
  if (userNameCache.has(userId)) return userNameCache.get(userId)!;
  const name = await client.users
    .info({ user: userId })
    .then((r) => r.user?.real_name || r.user?.name || userId)
    .catch(() => userId);
  userNameCache.set(userId, name);
  return name;
}

async function fetchChannelMessages(client: WebClient, channelId: string) {
  const { messages: top = [] } = await client.conversations.history({ channel: channelId, limit: 200 });
  const all = [...top];
  for (const m of top) {
    if (m.reply_count && m.ts) {
      const { messages: replies = [] } = await client.conversations
        .replies({ channel: channelId, ts: m.ts, limit: 200 })
        .catch(() => ({ messages: [] }));
      all.push(...replies.slice(1)); // [0] is the parent, already in `top`
    }
  }
  const seen = new Set<string>();
  return all
    .filter((m) => m.ts && m.text && !m.bot_id && !seen.has(m.ts) && seen.add(m.ts))
    .sort((a, b) => Number(a.ts) - Number(b.ts));
}

export const readChannel = defineChannelTool({
  name: "read_channel",
  description:
    "Read the recent messages across the WHOLE Slack channel — every thread and every top-level message, not just the one this turn is running in. Call this FIRST, instead of read_thread, whenever the decision might span more than the current thread (which is the normal case here).",
  parameters: z.object({}),
  async handler(_args, { thread }) {
    const token = slackBotToken();
    if (!token) {
      return "Channel-wide history isn't available (missing Slack bot token in this environment). Fall back to read_thread.";
    }
    const channelId = channelIdOf(thread);
    if (!channelId) {
      return "Could not resolve the Slack channel id for this conversation. Fall back to read_thread.";
    }
    const client = new WebClient(token);
    let messages: Awaited<ReturnType<typeof fetchChannelMessages>>;
    try {
      messages = await fetchChannelMessages(client, channelId);
    } catch (err) {
      // Never let a Slack API failure (rate limit, missing scope, bot not in
      // channel) throw out of a tool call — an unresolved tool call breaks the
      // model's message history ("tool results are missing"). Degrade instead.
      const reason = err instanceof Error ? err.message : String(err);
      return `Could not read the channel's history (${reason}). Fall back to read_thread.`;
    }
    if (messages.length === 0) {
      return "This channel has no readable message history yet.";
    }
    return Promise.all(
      messages.map(async (m) => ({
        author: await resolveUserName(client, m.user ?? "unknown"),
        text: m.text,
      })),
    );
  },
});
