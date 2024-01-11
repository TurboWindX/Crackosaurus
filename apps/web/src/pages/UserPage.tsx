import { TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { GetUserResponse, deleteUser, getUser } from "@repo/api";
import { Button } from "@repo/shadcn/components/ui/button";
import { TableCell } from "@repo/shadcn/components/ui/table";
import { useToast } from "@repo/shadcn/components/ui/use-toast";
import { useAuth } from "@repo/ui/auth";
import { DataTable } from "@repo/ui/data";
import { DrawerDialog } from "@repo/ui/dialog";
import { Header } from "@repo/ui/header";

interface ProjectDataTableProps {
  values: GetUserResponse["response"]["projects"];
}

const ProjectDataTable = ({ values }: ProjectDataTableProps) => {
  const navigate = useNavigate();

  return (
    <DataTable
      type="Project"
      values={values}
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
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [user, setUser] = useState<GetUserResponse["response"] | null>(null);

  const [removeOpen, setRemoveOpen] = useState(false);

  async function refreshUser() {
    const res = await getUser(parseInt(userID ?? "-1"));

    if (res.response) setUser(res.response);

    return res;
  }

  async function handleResponse({
    response,
    error,
  }: {
    response?: string;
    error?: string;
  }): Promise<boolean> {
    if (error) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: error,
      });

      return false;
    }

    await refreshUser();

    toast({
      variant: "default",
      title: "Success",
      description: response,
    });

    return true;
  }

  useEffect(() => {
    (async () => {
      const { error } = await refreshUser();
      if (error) {
        toast({
          variant: "destructive",
          title: "Failed",
          description: error,
        });

        navigate("/users");
      }
    })();
  }, []);

  return (
    <div>
      <Header />
      <div className="grid gap-8 p-4">
        <div className="grid grid-cols-2 gap-4">
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            {user?.username ?? "User"}
          </span>
          <div className="grid justify-end gap-4">
            {isAdmin && (
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

                      const res = await deleteUser(parseInt(userID ?? "-1"));
                      await handleResponse(res);

                      if (res.response) navigate("/users");
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
        <ProjectDataTable values={user?.projects ?? []} />
      </div>
    </div>
  );
};
