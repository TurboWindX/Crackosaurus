import { DatabaseIcon, RocketIcon, ServerIcon } from "lucide-react";

import { Button } from "@repo/shadcn/components/ui/button";

import { DinoChomp } from "../components/DinoChomp";

const FEATURES = [
  {
    icon: DatabaseIcon,
    accent: "text-green-400 bg-green-500/10",
    title: "Prepare",
    body: "Create a project, add hashes, and upload your wordlists.",
  },
  {
    icon: ServerIcon,
    accent: "text-blue-400 bg-blue-500/10",
    title: "Deploy",
    body: "Pick an instance, queue jobs, and assign members.",
  },
  {
    icon: RocketIcon,
    accent: "text-amber-400 bg-amber-500/10",
    title: "Launch",
    body: "Start cracking and watch results update live.",
  },
];

export const HomePage = () => {
  return (
    <div className="p-6">
      <section className="mx-auto max-w-5xl space-y-8 py-10">
        {/* Hero */}
        <div className="space-y-4 text-center">
          <span className="inline-block rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs font-medium text-slate-300">
            Password recovery platform
          </span>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Crackosaurus{" "}
            <span className="bg-gradient-to-r from-green-400 to-emerald-600 bg-clip-text text-transparent">
              🦖
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-slate-400">
            Built for practitioners. Organize targets, add hashes, upload big
            wordlists, and run cracking jobs with a clean, simple workflow.
          </p>
          <div className="flex justify-center gap-3">
            <a href="/projects">
              <Button size="lg">Create Project</Button>
            </a>
          </div>
        </div>

        {/* Animated mascot: a dino chomping hashes into plaintext. */}
        <DinoChomp className="h-56 sm:h-64" />

        {/* Workflow steps */}
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, accent, title, body }) => (
            <div
              key={title}
              className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div
                className={`grid h-9 w-9 place-items-center rounded-md ${accent}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="font-medium">{title}</div>
              <div className="text-sm text-slate-400">{body}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
