import { z } from "zod";
import raw from "./data/residents.json";
import { residentSchema } from "./schema";

const parsed = z.array(residentSchema).safeParse(raw);
// Fails the build with a readable message if the file has a bad entry.
if (!parsed.success) throw new Error(`src/features/residents/data/residents.json is invalid:\n${z.prettifyError(parsed.error)}`);

export const residents = parsed.data;
