import { Spinner } from "@repo/shadcn/components/ui/spinner";

import { AuthProvider, useAuth } from "./auth";
import { ProjectsProvider, useProjects } from "./projects";
import { UsersProvider, useUsers } from "./users";

export const LoadingProvider = ({ children }: { children: any }) => {
  const { isLoading: authLoading } = useAuth();
  const { isLoading: usersLoading } = useUsers();
  const { isLoading: projectsLoading } = useProjects();

  const isLoading = authLoading || usersLoading || projectsLoading;

  if (isLoading)
    return (
      <div className="ui-grid ui-grid-rows-3 ui-h-screen">
        <div className="ui-grid ui-justify-center ui-items-center ui-row-start-2 ui-row-end-2">
          <Spinner className="ui-w-[100%] ui-h-[100%]" />
        </div>
      </div>
    );

  return children;
};

export const APIProvider = ({ children }: { children: any }) => {
  return (
    <AuthProvider>
      <UsersProvider>
        <ProjectsProvider>
          <LoadingProvider>{children}</LoadingProvider>
        </ProjectsProvider>
      </UsersProvider>
    </AuthProvider>
  );
};
