import { LogOutIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { GetUserResponse } from "@repo/api";
import { Button } from "@repo/shadcn/components/ui/button";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useLoading } from "@repo/ui/requests";
import { useUsers } from "@repo/ui/users";

interface ProjectDataTableProps {
  values: GetUserResponse["response"]["projects"];
  loading?: boolean;
}

const ProjectDataTable = ({ values, loading }: ProjectDataTableProps) => {
  const navigate = useNavigate();

  return (
    <DataTable
      type="Project"
      values={values ?? []}
      head={["Project"]}
      rowClick={({ PID }) => navigate(`/projects/${PID}`)}
      row={({ name }) => [name]}
      loading={loading}
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
  const { user: one, loadUser: loadOne, removeUsers: remove } = useUsers();
  const navigate = useNavigate();

  const [removeOpen, setRemoveOpen] = useState(false);

  const { getLoading } = useLoading();
  const loading = getLoading("user-one");

  useEffect(() => {
    loadOne(userID ?? "");
  }, [userID]);

  return (
    <div className="grid gap-8 p-4">
      <div className="grid grid-cols-2 gap-4">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {one?.username ?? "Username"}
        </span>
        <div className="grid grid-flow-col justify-end gap-4">
          {uid.toString() === userID && (
            <div className="w-max">
              <Button
                variant="outline"
                onClick={async () => {
                  await logout();
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

                    if (await remove(userID ?? "")) navigate("/users");
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
      <ProjectDataTable values={one?.projects} loading={loading} />
    </div>
  );
};
