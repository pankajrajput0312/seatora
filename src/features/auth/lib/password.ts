import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// OWASP-recommended scrypt cost. Parameters are stored in the hash so they can be raised later.
const PARAMS = { N: 2 ** 17, r: 8, p: 1 };
const KEYLEN = 64;

// Each scrypt run at N=2^17 uses ~128MB, so cap concurrent runs per instance.
const MAX_CONCURRENT = 4;
let running = 0;
const queue: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

function scryptAsync(pw: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return withSlot(
    () =>
      new Promise((resolve, reject) =>
        scrypt(pw, salt, keylen, { ...opts, maxmem: 256 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
      ),
  );
}

/** Hash format: `scrypt$N$r$p$<salt hex>$<hash hex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("hex"), hash.toString("hex")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(actual, expected);
}

/** A real hash of a random password, verified when the email is unknown so both paths take equal time. */
export const dummyHash = hashPassword(randomBytes(16).toString("hex"));
