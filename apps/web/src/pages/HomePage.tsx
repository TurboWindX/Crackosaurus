import { useTranslation } from "react-i18next";
import { Button } from "@repo/shadcn/components/ui/button";

export const HomePage = () => {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      {/* Hero */}
      <section className="mx-auto max-w-5xl py-10">
        <div className="grid items-center gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Crackosaurus 🦖
            </h1>
            <p className="text-muted-foreground">
              Password recovery built for practitioners. Organize targets, add hashes,
              upload big wordlists, and run cracking jobs with a clean, simple workflow.
            </p>
            <div className="flex gap-3">
              <a href="/projects">
                <Button>Create Project</Button>
              </a>
              <a href="/instances">
                <Button variant="outline">Launch Instance</Button>
              </a>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <ul className="grid gap-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-green-500" />
                <div>
                  <div className="font-medium">Prepare</div>
                  <div className="text-muted-foreground">Create a project, add hashes, and upload your wordlists.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                <div>
                  <div className="font-medium">Deploy</div>
                  <div className="text-muted-foreground">Pick an instance, queue jobs, and assign members.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-amber-500" />
                <div>
                  <div className="font-medium">Launch</div>
                  <div className="text-muted-foreground">Start cracking and watch results update live.</div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};
