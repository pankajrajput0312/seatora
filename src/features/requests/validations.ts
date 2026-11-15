import { z } from "zod";

// Contract for "Request a feature": shared by the server actions (actions.ts), the in-app page and the public form.

export const REQUEST_KINDS = ["feature", "customization", "data", "other"] as const;
export const requestKindLabel: Record<(typeof REQUEST_KINDS)[number], string> = {
  feature: "New feature",
  customization: "Customization for me",
  data: "Data correction or missing data",
  other: "Something else",
};
export const REQUEST_STATUSES = ["new", "planned", "done", "declined"] as const;

export const featureRequestSchema = z.object({
  kind: z.enum(REQUEST_KINDS),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(2000, "Please keep it under 2,000 characters."),
  email: z.string().trim().toLowerCase().email("Enter a valid email so we can reply.").max(200).optional().or(z.literal("")),
  page: z.string().max(200).optional(), // where the request was made, e.g. "/decide/options"
  website: z.string().max(0).optional().or(z.string()), // honeypot: real people leave it empty
});
export type FeatureRequestInput = z.infer<typeof featureRequestSchema>;

export type FeatureRequestResult = { ok: true } | { ok: false; error: string };

export type FeatureRequestRow = {
  id: string;
  kind: (typeof REQUEST_KINDS)[number];
  message: string;
  email: string | null;
  page: string | null;
  status: (typeof REQUEST_STATUSES)[number];
  createdAt: string; // ISO
};
