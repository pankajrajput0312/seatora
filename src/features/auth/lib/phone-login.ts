// Sign-in with a mobile number: Firebase sends and checks the SMS code in the browser, our server checks the ID token
// it returns (./phone-token.ts) and signs her in to the account of that number (the same one WhatsApp uses).

/** The Firebase web app (public by design; Firebase console, project seatora-c296c). Unset: no phone sign-in. */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const phoneLoginOn = () => !!(firebaseConfig.apiKey && firebaseConfig.projectId);

/** What she typed as an E.164 number: an Indian mobile ("98765 43210", "098…", "+91 98…") or any "+<country>…"; else null. */
export function toE164(input: string): string | null {
  const t = input.replace(/[\s\-().]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(t)) return t.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(t) ? null : t;
  const d = t.replace(/^(?:0|91)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** Firebase's error codes in her words. */
export function phoneError(code: string | undefined): string {
  switch (code) {
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return "Enter a valid 10-digit mobile number.";
    case "auth/invalid-verification-code":
    case "auth/missing-verification-code":
      return "That code is not right. Check the SMS and try again.";
    case "auth/code-expired":
      return "That code has expired. Tap Resend code.";
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return "Too many attempts. Please wait a few minutes, or sign in with email.";
    case "auth/network-request-failed":
      return "No connection. Check your internet and try again.";
    default:
      return "Couldn't send or check the code. Please try again, or sign in with email.";
  }
}
