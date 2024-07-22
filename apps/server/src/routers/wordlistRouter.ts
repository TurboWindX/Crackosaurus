import { z } from "zod";

import { permissionProcedure, t } from "../plugins/trpc";

export const wordlistRouter = t.router({
  get: permissionProcedure(["wordlists:get"])
    .input(
      z.object({
        wordlistID: z.string(),
      })
    )
    .output(
      z.object({
        WID: z.string(),
        name: z.string().nullable(),
        size: z.number().int().min(0),
        checksum: z.string(),
        updatedAt: z.date(),
      })
    )
    .query(async (opts) => {
      const { wordlistID } = opts.input;

      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx) => {
        return tx.wordlist.findUniqueOrThrow({
          select: {
            WID: true,
            name: true,
            size: true,
            checksum: true,
            updatedAt: true,
          },
          where: {
            WID: wordlistID,
          },
        });
      });
    }),
  getMany: permissionProcedure(["wordlists:get"])
    .output(
      z
        .object({
          WID: z.string(),
          name: z.string().nullable(),
          size: z.number().int().min(0),
          checksum: z.string(),
          updatedAt: z.date(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx) => {
        return tx.wordlist.findMany({
          select: {
            WID: true,
            name: true,
            size: true,
            checksum: true,
            updatedAt: true,
          },
        });
      });
    }),
  getList: permissionProcedure(["wordlists:get"])
    .output(
      z
        .object({
          WID: z.string(),
          name: z.string().nullable(),
        })
        .array()
    )
    .query(async (opts) => {
      const { prisma } = opts.ctx;

      return await prisma.$transaction(async (tx) => {
        return tx.wordlist.findMany({
          select: {
            WID: true,
            name: true,
          },
        });
      });
    }),
  // create: permissionProcedure(["wordlists:add"]).mutation(async (opts) => {
  //   const { prisma, cluster } = opts.ctx;

  //   if (multipart === undefined) throw new APIError("input");

  //   const buffer = await streamToBuffer(multipart.file);
  //   const size = buffer.length;
  //   const checksum = crypto.createHash("md5").update(buffer).digest("hex");

  //   const wordlistID = await cluster.createWordlist(buffer);
  //   if (wordlistID === null) throw new APIError("internal");

  //   return prisma.$transaction(async (tx) => {
  //     const fileName = path.basename(multipart.filename);

  //     await tx.wordlist.create({
  //       data: {
  //         WID: wordlistID,
  //         name: fileName,
  //         size,
  //         checksum,
  //       },
  //     });

  //     return wordlistID;
  //   });
  // }),
  deleteMany: permissionProcedure(["wordlists:remove"])
    .input(
      z.object({
        wordlistIDs: z.string().array(),
      })
    )
    .output(z.number().int().min(0))
    .mutation(async (opts) => {
      const { wordlistIDs } = opts.input;

      const { prisma, cluster } = opts.ctx;

      return await prisma.$transaction(async (tx) => {
        const result = await cluster.wordlist.deleteMany.mutate({
          wordlistIDs,
        });

        const deletedIDs = wordlistIDs.filter((_, index) => result[index]);

        const { count } = await tx.wordlist.deleteMany({
          where: {
            WID: {
              in: deletedIDs,
            },
          },
        });

        return count;
      });
    }),
});

export type WordlistRouter = typeof wordlistRouter;
