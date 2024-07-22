import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { FilePicker } from "@repo/shadcn/components/ui/file-picker";
import { useTRPC } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { useErrors } from "@repo/ui/errors";
import { RelativeTime } from "@repo/ui/time";
import { useUpload } from "@repo/ui/upload";
import { MemorySize } from "@repo/ui/wordlists";

export const WordlistsPage = () => {
  const { hasPermission } = useAuth();
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const upload = useUpload();
  const { handleError } = useErrors();

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.wordlist.getMany),
      getQueryKey(trpc.wordlist.getList),
    ],
    []
  );

  const [file, setFile] = useState<File | null>(null);

  const {
    data: wordlists,
    isLoading,
    error,
    isLoadingError,
  } = trpc.wordlist.getMany.useQuery(undefined, {
    retry(count, error) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      )
        return false;
      return count < 3;
    },
  });

  useEffect(() => {
    if (!isLoadingError && error) handleError(error);
  }, [isLoadingError, error]);

  const { mutateAsync: uploadWordlist } = useMutation({
    mutationFn: upload.wordlist,
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      setFile(null);
    },
    onError: handleError,
  });

  const { mutateAsync: deleteWordlists } = trpc.wordlist.deleteMany.useMutation(
    {
      onSuccess() {
        queryKeys.forEach((key) => queryClient.invalidateQueries(key));
      },
      onError: handleError,
    }
  );

  return (
    <div className="p-4">
      <DataTable
        singular={t("item.wordlist.singular")}
        plural={t("item.wordlist.plural")}
        head={[
          t("item.wordlist.singular"),
          t("item.size.singular"),
          t("item.checksum.singular"),
          t("item.time.update"),
        ]}
        values={wordlists ?? []}
        row={({ WID, name, size, checksum, updatedAt }) => [
          name ?? WID,
          <MemorySize value={size} />,
          <div className="max-w-32 truncate md:max-w-64 lg:max-w-[50vw]">
            {checksum}
          </div>,
          <RelativeTime time={updatedAt} />,
        ]}
        isLoading={isLoading}
        valueKey={({ WID }) => WID}
        searchFilter={({ WID, name }, search) =>
          (name ?? WID).toLowerCase().includes(search.toLowerCase())
        }
        sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
        addValidate={() => file !== null}
        addDialog={
          <>
            <FilePicker
              placeholder={t("item.wordlist.singular")}
              file={file}
              onChange={(file) => setFile(file)}
            />
          </>
        }
        noAdd={!hasPermission("wordlists:add")}
        onAdd={async () => {
          uploadWordlist(file!);

          return true;
        }}
        noRemove={!hasPermission("wordlists:remove")}
        onRemove={async (wordlists) => {
          await deleteWordlists({
            wordlistIDs: wordlists.map((wordlist) => wordlist.WID),
          });

          return true;
        }}
      />
    </div>
  );
};
