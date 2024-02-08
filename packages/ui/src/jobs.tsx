import { createContext, useContext, useState } from "react";
import { type ApiError, CreateProjectJobsRequest, addProjectJobs } from "@repo/api";
import { useToast } from "@repo/shadcn/components/ui/use-toast";

export interface JobsInterface {
    readonly isLoading: boolean;
}

const JobsContext = createContext<JobsInterface>({
    isLoading: true,
});

export function useJobs() {
    return useContext(JobsContext);
}

export const JobsProvider = ({ children }: { children: any }) => {
    const { toast } = useToast();
    const [isLoading, setLoading] = useState(false);

    async function handleRequests<T, R extends ApiError>(
        message: string,
        values: T[],
        callback: (value: T) => Promise<R>
      ): Promise<(readonly [T, R])[]> {
        const results = await Promise.all(
          values.map(async (value) => [value, await callback(value)] as const)
        );
        if (!handleErrors(results)) return results;
    
        handleSuccess(message);
    
        return results;
      }
    
      function handleSuccess(message: string) {
        toast({
          variant: "default",
          title: "Success",
          description: message,
        });
      }
    
      function handleErrors(results: (readonly [any, ApiError])[]): boolean {
        const errors = results
          .map(([_, { error }]) => error)
          .filter((error) => error != null);
    
        if (errors.length === 0) return true;
    
        toast({
          variant: "destructive",
          title: "Error",
          description: errors.join(", "),
        });
    
        return false;
      }

    const value: JobsInterface = {
        isLoading
    }

    return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}
