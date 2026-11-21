import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/features/auth/lib/password";
import { track } from "@/features/funnel/service";
import { db } from "@/lib/db";

/**
 * The account of this number (digits, country code first), made on its first WhatsApp message or phone sign-in (`via`):
 * placeholder email, a password nobody knows. One number, one account, whichever way she comes in.
 */
export async function accountOf(phone: string, name: string | null, via: "whatsapp" | "phone" = "whatsapp") {
  const found = await db.user.findUnique({ where: { phone } });
  if (found) return found;
  try {
    const user = await db.user.create({
      data: { phone, email: `wa-${phone}@whatsapp.seatora.co.in`, name: name?.slice(0, 80) || "Doctor", passwordHash: await hashPassword(randomBytes(32).toString("hex")), createdVia: via },
    });
    await track("signup_done", { userId: user.id, aid: null, meta: { via } }); // a new account, as a web sign-up
    return user;
  } catch (e) {
    // Two first messages at once: the other made it.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return db.user.findUniqueOrThrow({ where: { phone } });
    throw e;
  }
}
