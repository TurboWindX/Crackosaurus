import { TRPCError } from "@trpc/server";

// Minimum length is the real policy knob; the maximum only guards against
// absurdly large inputs (bcrypt itself truncates at 72 bytes). Enforced on
// every password-setting path: init (root bootstrap), user create, and
// password change.
const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 1024;

/**
 * Enforce the password-length policy. Throws a BAD_REQUEST TRPCError with a
 * user-facing message when the password is too short or too long; returns
 * normally when it passes.
 */
export function checkPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
    });
  }
}
