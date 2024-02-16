import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOutIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { type APIType } from "@repo/api/server";
import { type RES } from "@repo/api/server/client/web";
import { Button } from "@repo/shadcn/components/ui/button";
import { useAPI } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";

interface ProjectDataTableProps {
  values: RES<APIType["getUser"]>["projects"];
  isLoading?: boolean;
}

const ProjectDataTable = ({ values, isLoading }: ProjectDataTableProps) => {
  const navigate = useNavigate();

  return (
    <DataTable
      type="Project"
      values={values ?? []}
      head={["Project"]}
      rowClick={({ PID }) => navigate(`/projects/${PID}`)}
      row={({ name }) => [name]}
      isLoading={isLoading}
      valueKey={({ PID }) => PID}
      searchFilter={({ name }, search) =>
        name.toLowerCase().includes(search.toLowerCase())
      }
    />
  );
};

export const UserPage = () => {
  const { userID } = useParams();

  const { uid, hasPermission, logout } = useAuth();
  const navigate = useNavigate();

  const [removeOpen, setRemoveOpen] = useState(false);

  const API = useAPI();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["users", userID],
    queryFn: async () => API.getUser({ userID: userID ?? "" }),
  });

  const { mutateAsync: deleteUser } = useMutation({
    mutationFn: async (userID: string) => API.deleteUser({ userID }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["users", "list"] });
      user?.projects?.forEach(({ PID }) =>
        queryClient.invalidateQueries({ queryKey: ["projects", PID] })
      );

      navigate("/users");
    },
  });

  return (
    <div className="grid gap-8 p-4">
      <div className="grid grid-cols-2 gap-4">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {user?.username ?? "Username"}
        </span>
        <div className="grid grid-flow-col justify-end gap-4">
          {uid.toString() === userID && (
            <div className="w-max">
              <Button
                variant="outline"
                onClick={async () => {
                  await logout({});
                  navigate("/");
                }}
              >
                <div className="grid grid-flow-col items-center gap-2">
                  <LogOutIcon />
                  <span>Logout</span>
                </div>
              </Button>
            </div>
          )}
          {(hasPermission("users:remove") || uid.toString() === userID) && (
            <div className="w-max">
              <DrawerDialog
                title="Remove User"
                open={removeOpen}
                setOpen={setRemoveOpen}
                trigger={
                  <Button variant="outline">
                    <div className="grid grid-flow-col items-center gap-2">
                      <TrashIcon />
                      <span>Remove</span>
                    </div>
                  </Button>
                }
              >
                <form
                  className="grid gap-4"
                  onSubmit={async (e) => {
                    e.preventDefault();

                    await deleteUser(userID ?? "");
                  }}
                >
                  <span>Do you want to permanently remove this user?</span>
                  <Button>Remove</Button>
                </form>
              </DrawerDialog>
            </div>
          )}
        </div>
      </div>
      <ProjectDataTable values={user?.projects ?? []} isLoading={isLoading} />
    </div>
  );
};
