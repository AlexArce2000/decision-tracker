/**
 * Agent-rendered components for the on-call agent.
 *
 * `defineChannelComponent` turns a component into a tool the agent can call to
 * draw UI itself. During an incident, a native card is easier to scan than a
 * paragraph, but everyone reads a card.
 *
 * One tree renders as Slack Block Kit, Teams Adaptive Cards, and Discord
 * components. A surface that cannot render a node skips it rather than failing.
 */
import {
  defineChannelComponent,
  Message,
  Header,
  Section,
  Markdown,
  Fields,
  Field,
  Context,
  Divider,
  Actions,
  Button,
  Table,
  Row,
  Cell,
} from "@copilotkit/channels";
import { z } from "zod";

/** Severity drives the colour rail, so the channel can triage by glance. */
const SEVERITY = {
  sev1: { accent: "#C4145F", label: "SEV1 · customer-facing" },
  sev2: { accent: "#8A5C10", label: "SEV2 · degraded" },
  sev3: { accent: "#5B6478", label: "SEV3 · internal" },
  resolved: { accent: "#2E7D5B", label: "RESOLVED" },
} as const;

/**
 * The state of the incident, as one glanceable card.
 *
 * Deliberately has no "what happened" prose field. The thread is the narrative;
 * this is the summary a person joining at minute 40 needs.
 */
export const IncidentCard = defineChannelComponent({
  name: "incident_card",
  description:
    "Draw the current state of the incident as a card: severity, what is affected, what is known, and what is being tried. Call this once you have read the thread, and call it again when the picture changes. Prefer it over describing the incident in prose.",
  parameters: z.object({
    severity: z.enum(["sev1", "sev2", "sev3", "resolved"]),
    headline: z.string().describe("What is broken, in under ten words."),
    impact: z.string().describe("Who or what is affected, concretely."),
    started: z.string().describe("When it started, as stated in the thread. 'unknown' is a valid answer."),
    known: z.array(z.string()).max(4).default([]).describe("What the thread has established."),
    trying: z.array(z.string()).max(3).default([]).describe("What is currently being attempted."),
    owner: z.string().optional().describe("Who is driving, if the thread says."),
  }),
  render({ severity, headline, impact, started, known, trying, owner }) {
    const sev = SEVERITY[severity];
    return (
      <Message accent={sev.accent}>
        <Header>{headline}</Header>
        <Context>{sev.label}</Context>
        <Fields>
          <Field label="Impact">{impact}</Field>
          <Field label="Started">{started}</Field>
          {owner && <Field label="Driving">{owner}</Field>}
        </Fields>
        {known.length > 0 && (
          <Section>
            <Markdown>{`*What we know*\n${known.map((k) => `• ${k}`).join("\n")}`}</Markdown>
          </Section>
        )}
        {trying.length > 0 && (
          <Section>
            <Markdown>{`*Being tried*\n${trying.map((t) => `• ${t}`).join("\n")}`}</Markdown>
          </Section>
        )}
      </Message>
    );
  },
});

/**
 * The incident timeline. Handover and the postmortem both run on this, which is
 * why it is worth keeping in the thread rather than someone's notes app.
 */
export const Timeline = defineChannelComponent({
  name: "timeline",
  description:
    "Draw an ordered timeline of what happened when. Call this when there are three or more events worth ordering — it is what on-call handover and the postmortem are written from.",
  parameters: z.object({
    title: z.string().default("Timeline"),
    events: z
      .array(
        z.object({
          at: z.string().describe("Time as the thread states it, e.g. '02:14' or '~20m ago'."),
          what: z.string().describe("What happened, in one line."),
          who: z.string().optional(),
        }),
      )
      .min(1)
      .max(12),
  }),
  render({ title, events }) {
    return (
      <Message>
        <Header>{title}</Header>
        <Table
          columns={[{ header: "When" }, { header: "What" }, { header: "Who" }]}
        >
          {events.map((event) => (
            <Row>
              <Cell>{event.at}</Cell>
              <Cell>{event.what}</Cell>
              <Cell>{event.who ?? "—"}</Cell>
            </Row>
          ))}
        </Table>
        <Divider />
        <Context>{`${events.length} event(s) · newest last`}</Context>
      </Message>
    );
  },
});

/**
 * The welcome message. A bot that says nothing when invited looks broken; one
 * that says what it will do on its own gets used.
 */
export function welcomeMessage(platform: string) {
  return (
    <Message accent="#C4145F">
      <Header>Marcador de decisiones, en el hilo</Header>
      <Section>
        <Markdown>
          {"Cuando el equipo esté decidiendo algo, mencioname. Leo lo que ya se dijo en este " +
            platform +
            " hilo primero — nunca deberías tener que re-explicarme la discusión."}
        </Markdown>
      </Section>
      <Fields>
        <Field label="Hago">Resumir, trackear el estado, mostrar quién apoya qué</Field>
        <Field label="No hago">Cerrar la decisión por vos</Field>
      </Fields>
      <Actions>
        <Button
          value="catchup"
          style="primary"
          onClick={async ({ thread }) => {
            await thread.runAgent({
              prompt:
                "Leé este hilo y decime en qué quedamos. Dibujá la tarjeta.",
            });
          }}
        >
          Ponéme al día
        </Button>
      </Actions>
    </Message>
  );
}
const ESTADO = {
  decidiendo: { accent: "#5B6478", label: "DECIDIENDO" },
  trabado:    { accent: "#8A5C10", label: "TRABADO" },
  decidido:   { accent: "#2E7D5B", label: "DECIDIDO" },
} as const;

/**
 * El estado de una decisión del equipo, como una sola tarjeta.
 */
export const DecisionCard = defineChannelComponent({
  name: "decision_card",
  description:
    "Draw the current state of a team decision: status, topic, where the discussion stands, who supports what, objections raised, and what's missing to close it. Call it once you've read the thread, and again ONLY when the discussion's state changes.",
  parameters: z.object({
    estado: z.enum(["decidiendo", "trabado", "decidido"]),
    tema: z.string().describe("De qué se está hablando, en menos de diez palabras."),
    situacion: z.string().describe("Dónde está parada la discusión ahora."),
    aFavor: z.array(z.string()).max(4).default([]).describe("Quiénes apoyan y por qué."),
    objeciones: z.array(z.string()).max(3).default([]).describe("Qué se objetó, con quién lo dijo."),
    falta: z.string().describe("Qué falta para cerrar. 'nada' es válido."),
    responsable: z.string().optional().describe("Quién quedó a cargo, si el hilo lo dice."),
  }),
  render({ estado, tema, situacion, aFavor, objeciones, falta, responsable }) {
    const e = ESTADO[estado];
    return (
      <Message accent={e.accent}>
        <Header>{tema}</Header>
        <Context>{e.label}</Context>
        <Fields>
          <Field label="Situación">{situacion}</Field>
          <Field label="Falta">{falta}</Field>
          {responsable && <Field label="Responsable">{responsable}</Field>}
        </Fields>
        {aFavor.length > 0 && (
          <Section><Markdown>{`*A favor*\n${aFavor.map((a) => `• ${a}`).join("\n")}`}</Markdown></Section>
        )}
        {objeciones.length > 0 && (
          <Section><Markdown>{`*Objeciones*\n${objeciones.map((o) => `• ${o}`).join("\n")}`}</Markdown></Section>
        )}
      </Message>
    );
  },
});
