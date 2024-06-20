import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { APIError } from "@repo/api";
import { FilePicker } from "@repo/shadcn/components/ui/file-picker";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { useErrors } from "@repo/ui/errors";
import { RelativeTime } from "@repo/ui/time";
import { MemorySize } from "@repo/ui/wordlists";

export const WordlistsPage = () => {
  const { hasPermission } = useAuth();

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const [file, setFile] = useState<File | null>(null);

  const {
    data: wordlists,
    isLoading,
    error,
    isLoadingError,
  } = useQuery({
    queryKey: ["wordlists", "list", "page"],
    queryFn: API.getWordlists,
    retry(count, error) {
      if (error instanceof APIError && error.status === 401) return false;
      return count < 3;
    },
  });

  useEffect(() => {
    if (!isLoadingError && error) handleError(error);
  }, [isLoadingError, error]);

  const { mutateAsync: createWordlist } = useMutation({
    mutationFn: API.createWordlist,
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["wordlists", "list"],
      });
    },
    onError: handleError,
  });

  const { mutateAsync: deleteWordlists } = useMutation({
    mutationFn: (wordlistIDs: string[]) => API.deleteWordlists({ wordlistIDs }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["wordlists", "list"],
      });
    },
    onError: handleError,
  });

  return (
    <div className="p-4">
      <DataTable
        type="Wordlist"
        head={["Wordlist", "Size", "Checksum", "Last Updated"]}
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
              placeholder={"Wordlist file"}
              file={file}
              onChange={(file) => setFile(file)}
            />
          </>
        }
        noAdd={!hasPermission("wordlists:add")}
        onAdd={async () => {
          const formData = new FormData();

          formData.set("data", file!);

          await createWordlist(formData as any);

          return true;
        }}
        noRemove={!hasPermission("wordlists:remove")}
        onRemove={async (wordlists) => {
          await deleteWordlists(wordlists.map((wordlist) => wordlist.WID));

          return true;
        }}
      />
    </div>
  );
};
