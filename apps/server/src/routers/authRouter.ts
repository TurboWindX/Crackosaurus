import { TRPCError } from "@trpc/server";
import bcrypt from "bcrypt";
import { z } from "zod";

import { PERMISSIONS, PermissionType } from "@repo/api";

import { permissionProcedure, publicProcedure, t } from "../plugins/trpc";
import {
  checkRecoveryCode,
  decryptSecret,
  verifyTotp,
} from "../utils/totp";

declare module "fastify" {
  interface Session {
    uid: string;
    username: string;
    permissions: string;
  }
}

export async function checkPassword(
  inputPassword: string,
  dbPassword: string
): Promise<boolean> {
  return bcrypt.compare(inputPassword, dbPassword);
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;

  return bcrypt.hash(password, saltRounds);
}

// Decoy bcrypt hash used to equalize login response time when the supplied
// username does not exist. Without it, a missing user returns immediately
// while an existing user pays the cost of a bcrypt comparison — a timing
// side-channel that lets an attacker enumerate valid usernames. Comparing the
// submitted password against this decoy makes both paths take the same time.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "invalid-account-placeholder-password",
  12
);

export const authRouter = t.router({
  get: permissionProcedure(["auth"])
    .output(
      z.object({
        uid: z.string(),
        username: z.string(),
        permissions: z.enum(PERMISSIONS).array(),
      })
    )
    .query((opts) => {
      const { request } = opts.ctx;

      return {
        uid: request.session.uid,
        username: request.session.username,
        permissions: request.session.permissions
          .split(" ")
          .filter(Boolean) as PermissionType[],
      } as const;
    }),
  login: publicProcedure
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
        // Second factor. Omitted on the first request; the server responds
        // MFA_REQUIRED and the client re-submits with the TOTP or recovery code.
        mfaCode: z.string().optional(),
      })
    )
    .output(
      z.discriminatedUnion("status", [
        z.object({ status: z.literal("OK"), uid: z.string() }),
        z.object({ status: z.literal("MFA_REQUIRED") }),
      ])
    )
    .mutation(async (opts) => {
      const { username, password, mfaCode } = opts.input;
      const { request, prisma } = opts.ctx;

      // No enclosing transaction: the bcrypt comparisons below are CPU-bound and
      // touch no DB, so wrapping them in an interactive transaction would pin a
      // pooled connection idle for the whole (potentially multi-hundred-ms)
      // duration and let a login flood exhaust the pool. The only writes are the
      // second-factor consumption updates, and each is an atomic guarded
      // `updateMany` that needs no surrounding transaction.
      const user = await prisma.user.findUnique({
        select: {
          ID: true,
          username: true,
          permissions: true,
          password: true,
          mfaEnabled: true,
          totpSecret: true,
        },
        where: {
          username: username,
        },
      });
      if (user === null) {
        // Run a comparison against the decoy hash so a non-existent user takes
        // the same time as a wrong password, preventing username enumeration
        // via response timing.
        await checkPassword(password, DUMMY_PASSWORD_HASH);
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      if (!(await checkPassword(password, user.password)))
        throw new TRPCError({ code: "BAD_REQUEST" });

      // Second factor. A user with MFA enabled must present a valid TOTP or
      // recovery code before a session is established. The password is already
      // verified at this point, so returning MFA_REQUIRED only reveals what any
      // two-step login inherently does.
      if (user.mfaEnabled) {
        if (mfaCode === undefined || mfaCode.trim() === "")
          return { status: "MFA_REQUIRED" } as const;

        let mfaOk = false;

        // Try the TOTP code first. A missing/undecryptable secret must NOT
        // bypass the factor — fall through to recovery codes instead.
        if (user.totpSecret) {
          let step: number | null = null;
          try {
            step = verifyTotp(decryptSecret(user.totpSecret), mfaCode);
          } catch {
            // Undecryptable secret — most commonly BACKEND_SECRET changed since
            // enrollment (e.g. a dev server minting an ephemeral secret each
            // restart). Log for the operator so a post-restart lockout is
            // diagnosable rather than looking like a wrong code, then fall
            // through to recovery codes. Never bypass the factor.
            console.warn(
              `[mfa] TOTP secret for user ${user.ID} failed to decrypt; ` +
                "BACKEND_SECRET may have changed since enrollment. " +
                "Falling back to recovery codes."
            );
            step = null;
          }

          if (step !== null) {
            // Atomic compare-and-advance: only accept the code if its time-step
            // is strictly newer than the last one consumed. A concurrent replay
            // of the same code re-evaluates the guard against the now-advanced
            // row, matches 0 rows, and is rejected — so a code is single-use
            // within its validity window (RFC 6238 §5.2).
            const { count } = await prisma.user.updateMany({
              where: {
                ID: user.ID,
                OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
              },
              data: { totpLastStep: step },
            });
            mfaOk = count === 1;
          }
        }

        // One-time recovery codes. The matched code is consumed with a guarded
        // compare-and-swap (`usedAt: null` in the WHERE): a concurrent second
        // use re-evaluates against the committed row, matches 0 rows, and is
        // rejected — so a single code cannot be double-spent.
        if (!mfaOk) {
          const codes = await prisma.userRecoveryCode.findMany({
            select: { RCID: true, codeHash: true },
            where: { userId: user.ID, usedAt: null },
          });
          for (const rc of codes) {
            if (await checkRecoveryCode(mfaCode, rc.codeHash)) {
              const { count } = await prisma.userRecoveryCode.updateMany({
                where: { RCID: rc.RCID, usedAt: null },
                data: { usedAt: new Date() },
              });
              if (count === 1) mfaOk = true;
              break;
            }
          }
        }

        if (!mfaOk) throw new TRPCError({ code: "BAD_REQUEST" });
      }

      await request.session.regenerate();

      request.session.uid = user.ID;
      request.session.username = user.username;
      request.session.permissions = user.permissions;

      return { status: "OK", uid: user.ID } as const;
    }),
  logout: permissionProcedure(["auth"])
    .output(z.boolean())
    .mutation(async (opts) => {
      const { request } = opts.ctx;

      await request.session.destroy();

      return true;
    }),
});

export type AuthRouter = typeof authRouter;
