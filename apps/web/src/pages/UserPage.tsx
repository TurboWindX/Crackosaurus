import { LogOutIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { GetUserResponse } from "@repo/api";
import { Button } from "@repo/shadcn/components/ui/button";
import { TableCell } from "@repo/shadcn/components/ui/table";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { useUsers } from "@repo/ui/users";

interface ProjectDataTableProps {
  values: GetUserResponse["response"]["projects"];
}

const ProjectDataTable = ({ values }: ProjectDataTableProps) => {
  const navigate = useNavigate();

  return (
    <DataTable
      type="Project"
      values={values ?? []}
      head={["Project"]}
      row={({ PID, name }) => [
        <TableCell
          className="cursor-pointer"
          onClick={() => navigate(`/projects/${PID}`)}
        >
          {name}
        </TableCell>,
      ]}
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
  const { one, loadOne, remove } = useUsers();
  const navigate = useNavigate();

  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    loadOne(parseInt(userID ?? "-1"));
  }, []);

  return (
    <div className="grid gap-8 p-4">
      <div className="grid grid-cols-2 gap-4">
        <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {one.username}
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

                    if (await remove(parseInt(userID ?? "-1")))
                      navigate("/users");
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
      <ProjectDataTable values={one?.projects} />
    </div>
  );
};
