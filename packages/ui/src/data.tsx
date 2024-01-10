import { PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@repo/shadcn/components/ui/button";
import { Card } from "@repo/shadcn/components/ui/card";
import { Checkbox } from "@repo/shadcn/components/ui/checkbox";
import { Input } from "@repo/shadcn/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/shadcn/components/ui/table";

import { DrawerDialog } from "./dialog";

export interface AddDialogProps {
  typeSingular: string;
  open: boolean;
  setOpen: (state: boolean) => void;
  onSubmit?: () => void;
  children: any;
}

export const AddDialog = ({
  typeSingular,
  open,
  setOpen,
  onSubmit,
  children,
}: AddDialogProps) => {
  return (
    <DrawerDialog
      title={`Add ${typeSingular}`}
      open={open}
      setOpen={setOpen}
      trigger={
        <Button variant="outline">
          <div className="grid gap-2 grid-flow-col items-center">
            <PlusIcon />
            <span>Add</span>
          </div>
        </Button>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        {children}
        <Button>Add</Button>
      </form>
    </DrawerDialog>
  );
};

export interface RemoveDialogProps {
  typePlural: string;
  open: boolean;
  count: number;
  setOpen: (state: boolean) => void;
  onSubmit?: () => void;
}

export const RemoveDialog = ({
  typePlural,
  open,
  setOpen,
  count,
  onSubmit,
}: RemoveDialogProps) => {
  return (
    <DrawerDialog
      title={`Remove ${typePlural}`}
      open={open}
      setOpen={setOpen}
      trigger={
        <Button variant="outline" disabled={count === 0}>
          <div className="grid gap-2 grid-flow-col items-center">
            <TrashIcon />
            <span>Remove</span>
          </div>
        </Button>
      }
    >
      <div className="grid gap-4">
        <span>
          Do you want to remove {count} {typePlural.toLowerCase()}?
        </span>
        <Button onClick={() => onSubmit?.()}>Remove</Button>
      </div>
    </DrawerDialog>
  );
};

export interface DataTableProps<T> {
  typeSingular: string;
  typePlural?: string;
  values: T[];
  head: string[];
  row: (value: T) => any[];
  valueKey: (value: T) => string | number;
  addDialog?: any;
  onAdd?: () => Promise<boolean>;
  onRemove?: (values: T[]) => Promise<boolean>;
  searchFilter?: (value: T, search: string) => boolean;
  noAdd?: boolean;
  noRemove?: boolean;
}

export function DataTable<T>({
  typeSingular,
  typePlural,
  onAdd,
  onRemove,
  row,
  valueKey,
  addDialog,
  values,
  head,
  searchFilter,
  noAdd,
  noRemove,
}: DataTableProps<T>) {
  const plural = typePlural ?? `${typeSingular}s`;

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selects, setSelects] = useState<Record<string | number, boolean>>({});
  const [search, setSearch] = useState("");

  const searchValues = values.filter(
    (value) => searchFilter?.(value, search) ?? true
  );
  const selectedValues = searchValues.filter(
    (value) => selects[valueKey(value)]
  );

  const hasAdd = addDialog !== undefined && onAdd !== undefined && !noAdd;
  const hasRemove = onRemove !== undefined && !noRemove;
  const hasButtons = hasAdd || hasRemove;
  const hasSelect = hasRemove;

  return (
    <div className="grid gap-4">
      {searchFilter !== undefined && (
        <Input
          placeholder={`Search ${plural}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {hasButtons && (
        <div className="grid gap-4 w-max grid-flow-col">
          {hasAdd && (
            <AddDialog
              typeSingular={typeSingular}
              open={addDialogOpen}
              setOpen={setAddDialogOpen}
              onSubmit={async () => {
                if (await onAdd?.()) setAddDialogOpen(false);
              }}
            >
              {addDialog}
            </AddDialog>
          )}
          {hasRemove && (
            <RemoveDialog
              typePlural={plural}
              open={removeDialogOpen}
              setOpen={setRemoveDialogOpen}
              count={selectedValues.length}
              onSubmit={async () => {
                if (await onRemove?.(selectedValues))
                  setRemoveDialogOpen(false);
              }}
            />
          )}
        </div>
      )}
      {searchValues.length === 0 ? (
        <Card className="p-4 grid justify-center">No {plural} Found</Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                {hasSelect && (
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={searchValues.length === selectedValues.length}
                      onCheckedChange={(state) => {
                        const val = !!state.valueOf();

                        setSelects({
                          ...selects,
                          ...Object.fromEntries(
                            searchValues.map(
                              (value) => [valueKey(value), val] as const
                            )
                          ),
                        });
                      }}
                    />
                  </TableHead>
                )}
                {head.map((label) => (
                  <TableHead>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {searchValues.map((value) => (
                <TableRow key={valueKey(value)}>
                  {hasSelect && (
                    <TableCell>
                      <Checkbox
                        checked={selects[valueKey(value)]}
                        onCheckedChange={(state) =>
                          setSelects({
                            ...selects,
                            [valueKey(value)]: !!state.valueOf(),
                          })
                        }
                      />
                    </TableCell>
                  )}
                  {row(value)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
