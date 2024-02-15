import { AuthProvider } from "./auth";
import { ClusterProvider } from "./clusters";
import { ProjectsProvider } from "./projects";
import { UsersProvider } from "./users";

export const APIProvider = ({ children }: { children: any }) => {
  return (
    <AuthProvider>
      <UsersProvider>
        <ProjectsProvider>
          <ClusterProvider>{children}</ClusterProvider>
        </ProjectsProvider>
      </UsersProvider>
    </AuthProvider>
  );
};
