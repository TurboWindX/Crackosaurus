import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { APIError } from "@repo/api";
import { Input } from "@repo/shadcn/components/ui/input";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { useErrors } from "@repo/ui/errors";
import { RelativeTime } from "@repo/ui/time";
import { MemorySize } from "@repo/ui/wordlists";

export const WordlistsPage = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const fileRef = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);

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

  return (
    <div className="p-4">
      <DataTable
        type="Wordlist"
        head={["Wordlist", "Size", "Checksum", "Last Updated"]}
        values={wordlists ?? []}
        rowClick={({ WID }) => navigate(`/wordlists/${WID}`)}
        row={({ WID, name, size, checksum, updatedAt }) => [
          name ?? WID,
          <MemorySize value={size} />,
          checksum,
          <RelativeTime time={updatedAt} />,
        ]}
        isLoading={isLoading}
        valueKey={({ WID }) => WID}
        searchFilter={({ WID, name }, search) =>
          (name ?? WID).toLowerCase().includes(search.toLowerCase())
        }
        sort={(a, b) => (a.updatedAt <= b.updatedAt ? 1 : -1)}
        addValidate={() => hasFile}
        addDialog={
          <>
            <Input
              type="file"
              ref={fileRef}
              onChange={(e) => {
                setHasFile((e.target?.files?.length ?? 0) > 0);
              }}
            />
          </>
        }
        noAdd={!hasPermission("wordlists:add")}
        onAdd={async () => {
          const formData = new FormData();

          formData.set("data", fileRef.current?.files?.[0] ?? "");

          await createWordlist(formData as any);

          return true;
        }}
      />
    </div>
  );
};
