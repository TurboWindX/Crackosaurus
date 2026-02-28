import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { PlusIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { INSTANCE_TYPES } from "@repo/app-config/instance-types";
import { Button } from "@repo/shadcn/components/ui/button";
import { Input } from "@repo/shadcn/components/ui/input";
import { useToast } from "@repo/shadcn/components/ui/use-toast";
import { useTRPC } from "@repo/ui/api";
import { useAuth } from "@repo/ui/auth";
import { DrawerDialog } from "@repo/ui/dialog";
import { useErrors } from "@repo/ui/errors";
import { MaskInput } from "@repo/ui/masks";
import { RuleSelect } from "@repo/ui/rules";
import { RelativeTime } from "@repo/ui/time";
import { WordlistSelect } from "@repo/ui/wordlists";

interface StepDraft {
  attackMode: number;
  wordlistId: string;
  ruleId: string;
  mask: string;
  instanceType: string;
}

const emptyStep = (): StepDraft => ({
  attackMode: 0,
  wordlistId: "",
  ruleId: "",
  mask: "",
  instanceType: "",
});

export const CascadesPage = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();
  const { toast } = useToast();
  const { hasPermission } = useAuth();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);

  const { data: cascades, isLoading } = trpc.cascade.getMany.useQuery();

  const queryKeys = useMemo(
    () => [getQueryKey(trpc.cascade.getMany, undefined, "any")],
    []
  );

  const { mutateAsync: createCascade } = trpc.cascade.create.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
    },
    onError: handleError,
  });

  const { mutateAsync: deleteCascade } = trpc.cascade.delete.useMutation({
    onSuccess() {
      queryKeys.forEach((key) => queryClient.invalidateQueries(key));
    },
    onError: handleError,
  });

  const instanceTypes = INSTANCE_TYPES as { value: string; label: string }[];

  const addStep = () => setSteps((s) => [...s, emptyStep()]);

  const removeStep = (index: number) =>
    setSteps((s) => s.filter((_, i) => i !== index));

  const updateStep = (index: number, partial: Partial<StepDraft>) =>
    setSteps((s) =>
      s.map((step, i) => (i === index ? { ...step, ...partial } : step))
    );

  const isFormValid = useMemo(() => {
    if (!name.trim()) return false;
    if (steps.length === 0) return false;
    return steps.every((s) => {
      if (s.attackMode === 3) return s.mask.trim().length > 0;
      return s.wordlistId.length > 0;
    });
  }, [name, steps]);

  const handleCreate = async () => {
    await createCascade({
      name: name.trim(),
      steps: steps.map((s, i) => ({
        order: i,
        attackMode: s.attackMode,
        wordlistId: s.attackMode === 0 ? s.wordlistId || undefined : undefined,
        ruleId: s.ruleId || undefined,
        mask: s.attackMode === 3 ? s.mask : undefined,
        instanceType: s.instanceType || undefined,
      })),
    });

    toast({
      title: "Cascade Created",
      description: `"${name}" with ${steps.length} step(s)`,
    });

    setName("");
    setSteps([emptyStep()]);
    setCreateOpen(false);
  };

  if (!hasPermission("instances:jobs:add")) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">
          You don't have permission to manage cascades.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🔗 Cascades</h1>
          <p className="text-muted-foreground text-sm">
            Cascade templates define multi-step attack chains. When a step
            completes, remaining uncracked hashes automatically advance to the
            next step.
          </p>
        </div>
        <DrawerDialog
          title="Create Cascade"
          open={createOpen}
          setOpen={setCreateOpen}
          trigger={
            <Button>
              <PlusIcon className="mr-2 h-4 w-4" />
              New Cascade
            </Button>
          }
        >
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              await handleCreate();
            }}
          >
            <div className="grid gap-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard 3-Phase Crack"
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Steps</label>
              {steps.map((step, index) => (
                <div
                  key={index}
                  className="relative space-y-2 rounded-md border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Step {index + 1}
                    </span>
                    {steps.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStep(index)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <select
                      className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      value={step.attackMode}
                      onChange={(e) =>
                        updateStep(index, {
                          attackMode: Number(e.target.value),
                        })
                      }
                    >
                      <option value={0}>Dictionary Attack</option>
                      <option value={3}>Mask / Brute-force</option>
                    </select>
                  </div>

                  {step.attackMode === 3 ? (
                    <MaskInput
                      value={step.mask}
                      onChange={(v) => updateStep(index, { mask: v })}
                    />
                  ) : (
                    <>
                      <WordlistSelect
                        value={step.wordlistId}
                        onValueChange={(v) =>
                          updateStep(index, { wordlistId: v })
                        }
                      />
                      <RuleSelect
                        value={step.ruleId}
                        onValueChange={(v) => updateStep(index, { ruleId: v })}
                      />
                    </>
                  )}

                  <div className="grid gap-1">
                    <label className="text-muted-foreground text-xs">
                      Instance Type (optional override)
                    </label>
                    <select
                      className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      value={step.instanceType}
                      onChange={(e) =>
                        updateStep(index, {
                          instanceType: e.target.value,
                        })
                      }
                    >
                      <option value="">Default</option>
                      {instanceTypes.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addStep}
                className="w-full"
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Step
              </Button>
            </div>

            <Button disabled={!isFormValid}>Create Cascade</Button>
          </form>
        </DrawerDialog>
      </div>

      {/* Cascade List */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : !cascades?.length ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            No cascade templates yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {cascades.map((cascade) => (
            <div
              key={cascade.CID}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div>
                <h3 className="font-medium">{cascade.name}</h3>
                <p className="text-muted-foreground text-sm">
                  {cascade.stepCount} step{cascade.stepCount !== 1 ? "s" : ""} ·
                  Created <RelativeTime time={cascade.createdAt} />
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await deleteCascade({ cascadeID: cascade.CID });
                  toast({ title: "Cascade deleted" });
                }}
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
