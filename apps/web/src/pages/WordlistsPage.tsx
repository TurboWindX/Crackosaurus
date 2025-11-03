import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@repo/shadcn/components/ui/button";
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

  const [progress, setProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.wordlist.getMany, undefined, "any"),
      getQueryKey(trpc.wordlist.getList, undefined, "any"),
    ],
    []
  );

  const [file, setFile] = useState<File | null>(null);

  // Cancel upload function
  const handleCancelUpload = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsUploading(false);
      setProgress(null);
    }
  };

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

  const { mutateAsync: uploadWordlist } = useMutation<
    void,
    Error,
    {
      file: File;
      onProgress?: (percent: number) => void;
      abortSignal?: AbortSignal;
    }
  >({
    mutationFn: async ({ file, onProgress, abortSignal }) => {
      await upload.wordlist(file, onProgress, abortSignal);
    },
    onSuccess() {
      setProgress(100);
      setTimeout(() => {
        queryKeys.forEach((key) => queryClient.invalidateQueries(key));
        setFile(null);
        setProgress(null);
      }, 1000);
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
              disabled={isUploading}
            />

            {progress !== null && (
              <div className="mt-4 w-full">
                <div className="h-2 rounded bg-gray-300">
                  <div
                    className="h-2 rounded bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-1 text-center text-sm text-gray-600">
                  {Math.round(progress)}% {isUploading && "(uploading...)"}
                </div>
                {isUploading && (
                  <div className="mt-2 flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelUpload}
                      className="text-red-600 hover:text-red-700"
                    >
                      Cancel Upload
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        }
        preventAddDialogClose={isUploading}
        noAdd={!hasPermission("wordlists:add")}
        onAdd={async () => {
          const controller = new AbortController();
          setAbortController(controller);
          setIsUploading(true);
          setProgress(0);
          try {
            await uploadWordlist({
              file: file!,
              onProgress: setProgress,
              abortSignal: controller.signal,
            });
            return true;
          } catch (error) {
            if (error instanceof Error && error.message === "Upload aborted") {
              // Don't show error for user-initiated cancellation
              return false;
            }
            throw error;
          } finally {
            setIsUploading(false);
            setAbortController(null);
          }
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
