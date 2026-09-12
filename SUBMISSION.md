# Submission checklist

Choose your city on the [global event page](https://aitinkerers.org/hackathons/global/agents-everywhere). Use that city's participant portal for the submission deadline and published judging criteria, and its handbook for eligibility and required deliverables. See [hackathon-rules.md](hackathon-rules.md) for the agent-readable summary.

## Build eligibility

- [x] Our submitted project is a net-new build created during the official hackathon period
- [x] Its core functionality was built during the event; we are not resubmitting or extending a pre-existing project and entering it as new
- [x] We identify inherited templates, libraries, prompts, components, and starter code separately from our event work

**What we inherited**
This starter kit (`agents-everywhere-starter-kit`, CopilotKit): the Slack Channel scaffolding (`apps/channel`), the Web scaffolding (`apps/web`), the shared agent runtime (`packages/agent-core`), the `IncidentCard`/`Timeline` reference components, the `read_thread`/`propose_action` tool implementations, and the `useHumanInTheLoop` approval-gate pattern in `generative-ui.tsx`. None of the sample on-call/incident scenario or its data is part of our submission — it was a wiring reference we replaced.

**What we built during the hackathon**
A single shared contract, `decision_card` (`estado`, `tema`, `situacion`, `aFavor`, `objeciones`, `falta`, `responsable`), implemented as a native component on both surfaces from the inherited `IncidentCard` pattern:
- `apps/channel/src/components.tsx` — `DecisionCard` for Slack (Block Kit).
- `apps/web/src/components/streamed-cards.tsx` + `generative-ui.tsx` — the same component in React.
- `packages/agent-core/src/prompt.ts` — a new `DECISION_ROLE` system prompt (replacing the on-call role) that tells the agent to read the thread, redraw the card only when the discussion's state actually changes, never insert itself into the decision, and route any save through the approval gate rather than a text confirmation.
- `apps/channel/src/channel.tsx` — registered `DecisionCard` in place of the incident components.

## Title and description

**What you built**
**Decision Tracker** — an agent that lives inside a team's Slack thread (and the web app, with the same component) and keeps one always-current card of a decision in progress: what's being decided, who supports what, what's blocking it, and what's left to close it. Mention it once; it keeps redrawing the card as the conversation moves, without being re-mentioned, and only changes the card when the discussion's actual state changes — not on every message.

**Who it is for**
A team mid-discussion in a Slack thread (e.g., "Postgres vs Mongo for this project") where the thread has grown long enough that someone eventually asks "wait, what did we decide?" — instead of someone manually re-reading and summarizing, the card is already there and current.

**Why the context matters**
The agent reads the live thread (`read_thread`) before drawing anything — it never asks people to repeat context that's already in the conversation. Copying the same thread into a standalone chatbox would lose exactly this: the agent would only ever see what someone chose to paste, not the discussion as it evolves in place.

**Sponsor technologies used**
- **CopilotKit Channels** — the managed Slack integration (`defineChannelComponent`, `defineChannelTool`, `createChannel`), no self-hosted Slack app or public URL needed.
- **CopilotKit React (`useComponent`, `useHumanInTheLoop`)** — the same `decision_card` contract rendered natively in the web app, and the approval gate for saving a decision.
- **OpenAI** — the chat model behind the agent on both surfaces.

## Evidence for the judging criteria

Judges score each of the four official criteria from 1–5. This checklist helps you gather evidence; it does not guarantee a score. A working starter is a foundation for your own project.

| Official criterion | Show in your project and demo |
|---|---|
| Core Requirements & Functionality | Run one complete workflow in the intended environment, from user request through tools to a verified result. Repeat it with live integrations; offline tests alone do not prove the deployed flow. |
| Innovation & Theme Alignment | Show the surrounding context before the prompt and explain the original interaction it enables. Compare with the context removed: what value would a standalone chatbox lose? |
| Technical Execution & Integration | Show how tools, data, and the environment connect. Demonstrate a relevant failure or cancellation path and explain recovery, state persistence, and integration limits. |
| Usefulness & Agentic Experience | Identify the user and problem, show a meaningful action in the surface, and demonstrate clear feedback and appropriate user control. Explain what work the agent saves. |

- [ ] We can point to visible evidence for every criterion
- [ ] We distinguish live services, sample data, session-only state, and standalone recipes
- [ ] Sponsor technologies contribute to the workflow; their count is not a judging criterion

## Public repository

- [ ] A new participant can run the quickstart from a clean clone
- [ ] The README lists the credentials and separate processes required
- [ ] `npm run verify` passes; optional recipe checks pass if used
- [ ] `.env`, tokens, generated traces with sensitive data, and account secrets are excluded
- [ ] Sample data, session-only state, and unimplemented integrations are clearly labeled

## Two-minute demo video

- [ ] Show the surface and existing context before the prompt
- [ ] Demonstrate one complete interaction
- [ ] Show a visible result: an actual record, local state change, or research source links
- [ ] If showing an approval, distinguish the decision from execution and demonstrate the resulting behavior
- [ ] State which sponsor technologies made the interaction possible
- [ ] Keep the video within the event's limit and check audio

See [demo prompts](dev-docs/demo-prompts.md) for a reproducible incident workflow.

## Social post and final submission

- [ ] Follow the organizer's posting and sponsor-tagging instructions
- [ ] Link the public repository and video
- [ ] Credit the sponsors you used and applicable local partners
- [ ] Check the live integration once more before recording or submitting
- [ ] Inspect the repository, video and screenshots for secrets

Prepare the post and submission for a human to publish; running the starter kit
does not publish either automatically.
