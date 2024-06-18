import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { APIError } from "@repo/api";
import { Button } from "@repo/shadcn/components/ui/button";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DrawerDialog } from "@repo/ui/dialog";
import { useErrors } from "@repo/ui/errors";

interface RemoveButtonProps {
  wordlistID: string;
  isLoading?: boolean;
}

const RemoveButton = ({ wordlistID, isLoading }: RemoveButtonProps) => {
  const [open, setOpen] = useState(false);

  const { hasPermission } = useAuth();

  const navigate = useNavigate();

  const API = useAPI();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();

  const { mutateAsync: deleteWordlist } = useMutation({
    mutationFn: API.deleteWordlist,
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["wordlists", "list"] });

      navigate("/wordlists");
    },
    onError: handleError,
  });

  const trigger = useMemo(
    () => (
      <Button variant="outline">
        <div className="grid grid-flow-col items-center gap-2">
          <TrashIcon />
          <span>Remove</span>
        </div>
      </Button>
    ),
    []
  );

  if (!hasPermission("wordlists:remove")) return <></>;

  if (isLoading) return trigger;

  return (
    <div className="w-max">
      <DrawerDialog
        title="Remove Wordlist"
        open={open}
        setOpen={setOpen}
        trigger={trigger}
      >
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();

            await deleteWordlist({ wordlistID });
          }}
        >
          <span>Do you want to permanently remove this wordlist?</span>
          <Button>Remove</Button>
        </form>
      </DrawerDialog>
    </div>
  );
};

export const WordlistPage = () => {
  const { wordlistID } = useParams();

  const API = useAPI();
  const { handleError } = useErrors();

  const {
    data: wordlist,
    isLoading,
    error,
    isLoadingError,
  } = useQuery({
    queryKey: ["wordlists", wordlistID],
    queryFn: async () => API.getWordlist({ wordlistID: wordlistID ?? "" }),
    retry(count, error) {
      if (error instanceof APIError && error.status === 401) return false;
      return count < 3;
    },
  });

  useEffect(() => {
    if (!isLoadingError && error) handleError(error);
  }, [isLoadingError, error]);

  return (
    <div className="grid gap-8 p-4">
      <div className="grid grid-cols-2 gap-4">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {wordlist?.name ?? wordlist?.WID ?? "Wordlist"}
        </span>
        <div className="grid grid-flow-col justify-end gap-4">
          <RemoveButton
            wordlistID={wordlist?.WID ?? ""}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
};
