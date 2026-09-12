import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import {
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";

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

interface CascadeFormProps {
  name: string;
  setName: (value: string) => void;
  steps: StepDraft[];
  setSteps: Dispatch<SetStateAction<StepDraft[]>>;
  onSubmit: () => void | Promise<void>;
  submitLabel: string;
}

/** Shared step-editor form used by both the create and edit dialogs so the
 * two stay in sync. Each caller owns its own name/steps state. */
const CascadeForm = ({
  name,
  setName,
  steps,
  setSteps,
  onSubmit,
  submitLabel,
}: CascadeFormProps) => {
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

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit();
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
              <span className="text-sm font-medium">Step {index + 1}</span>
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
                  onValueChange={(v) => updateStep(index, { wordlistId: v })}
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

      <Button disabled={!isFormValid}>{submitLabel}</Button>
    </form>
  );
};

export const CascadesPage = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { handleError } = useErrors();
  const { toast } = useToast();
  const { hasPermission } = useAuth();

  // Deletion is destructive on a shared, unowned template, so it stays gated
  // on instances:jobs:add. Create/read/update are open to any authenticated
  // user (mirrors the server-side `auth` gate on the cascade router).
  const canDelete = hasPermission("instances:jobs:add");

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);

  const [editCID, setEditCID] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSteps, setEditSteps] = useState<StepDraft[]>([emptyStep()]);

  const { data: cascades, isLoading } = trpc.cascade.getMany.useQuery();

  const queryKeys = useMemo(
    () => [
      getQueryKey(trpc.cascade.getMany, undefined, "any"),
      getQueryKey(trpc.cascade.get, undefined, "any"),
    ],
    []
  );

  const invalidate = () =>
    queryKeys.forEach((key) => queryClient.invalidateQueries(key));

  const { mutateAsync: createCascade } = trpc.cascade.create.useMutation({
    onSuccess: invalidate,
    onError: handleError,
  });

  const { mutateAsync: updateCascade } = trpc.cascade.update.useMutation({
    onSuccess: invalidate,
    onError: handleError,
  });

  const { mutateAsync: deleteCascade } = trpc.cascade.delete.useMutation({
    onSuccess: invalidate,
    onError: handleError,
  });

  // Load the selected cascade's full definition into the edit form.
  const { data: editData } = trpc.cascade.get.useQuery(
    { cascadeID: editCID ?? "" },
    { enabled: !!editCID }
  );

  useEffect(() => {
    if (!editData || editData.CID !== editCID) return;
    setEditName(editData.name);
    setEditSteps(
      [...editData.steps]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          attackMode: s.attackMode,
          wordlistId: s.wordlistId ?? "",
          ruleId: s.ruleId ?? "",
          mask: s.mask ?? "",
          instanceType: s.instanceType ?? "",
        }))
    );
  }, [editData, editCID]);

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

  const openEdit = (cid: string) => {
    setEditCID(cid);
    setEditName("");
    setEditSteps([emptyStep()]);
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editCID) return;

    await updateCascade({
      cascadeID: editCID,
      name: editName.trim(),
      steps: editSteps.map((s, i) => ({
        order: i,
        attackMode: s.attackMode,
        wordlistId: s.attackMode === 0 ? s.wordlistId || undefined : undefined,
        ruleId: s.ruleId || undefined,
        mask: s.attackMode === 3 ? s.mask : undefined,
        instanceType: s.instanceType || undefined,
      })),
    });

    toast({
      title: "Cascade Updated",
      description: `"${editName}" with ${editSteps.length} step(s)`,
    });

    setEditOpen(false);
    setEditCID(null);
  };

  if (!hasPermission("auth")) {
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
          <CascadeForm
            name={name}
            setName={setName}
            steps={steps}
            setSteps={setSteps}
            onSubmit={handleCreate}
            submitLabel="Create Cascade"
          />
        </DrawerDialog>
      </div>

      {/* Edit dialog — opened programmatically from a row's edit button */}
      <DrawerDialog
        title="Edit Cascade"
        open={editOpen}
        setOpen={(open) => {
          setEditOpen(open);
          if (!open) setEditCID(null);
        }}
      >
        <CascadeForm
          name={editName}
          setName={setEditName}
          steps={editSteps}
          setSteps={setEditSteps}
          onSubmit={handleUpdate}
          submitLabel="Save Changes"
        />
      </DrawerDialog>

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
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Edit cascade"
                  onClick={() => openEdit(cascade.CID)}
                >
                  <PencilIcon className="h-4 w-4" />
                </Button>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete cascade"
                    onClick={async () => {
                      await deleteCascade({ cascadeID: cascade.CID });
                      toast({ title: "Cascade deleted" });
                    }}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
