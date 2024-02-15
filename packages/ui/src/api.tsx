import { AuthProvider } from "./auth";
import { ClusterProvider } from "./clusters";
import { ProjectsProvider } from "./projects";
import { LoadingProvider } from "./requests";
import { UsersProvider } from "./users";

export const APIProvider = ({ children }: { children: any }) => {
  return (
    <LoadingProvider>
      <AuthProvider>
        <UsersProvider>
          <ProjectsProvider>
            <ClusterProvider>{children}</ClusterProvider>
          </ProjectsProvider>
        </UsersProvider>
      </AuthProvider>
    </LoadingProvider>
  );
};
