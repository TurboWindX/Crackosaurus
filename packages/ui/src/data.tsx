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
  type: string;
  open: boolean;
  setOpen: (state: boolean) => void;
  validate?: () => boolean;
  onSubmit?: () => void;
  children: any;
}

export const AddDialog = ({
  type,
  open,
  setOpen,
  onSubmit,
  children,
  validate,
}: AddDialogProps) => {
  return (
    <DrawerDialog
      title={`Add ${type}`}
      open={open}
      setOpen={setOpen}
      trigger={
        <Button variant="outline">
          <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
            <PlusIcon />
            <span>Add</span>
          </div>
        </Button>
      }
    >
      <form
        className="ui-grid ui-gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        {children}
        <Button disabled={!(validate === undefined || validate())}>Add</Button>
      </form>
    </DrawerDialog>
  );
};

export interface RemoveDialogProps {
  type: string;
  pluralSuffix: string;
  open: boolean;
  count: number;
  setOpen: (state: boolean) => void;
  onSubmit?: () => void;
}

export const RemoveDialog = ({
  type,
  pluralSuffix,
  open,
  setOpen,
  count,
  onSubmit,
}: RemoveDialogProps) => {
  return (
    <DrawerDialog
      title={`Remove ${type}${pluralSuffix}`}
      open={open}
      setOpen={setOpen}
      trigger={
        <Button variant="outline" disabled={count === 0}>
          <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
            <TrashIcon />
            <span>Remove</span>
          </div>
        </Button>
      }
    >
      <div className="ui-grid ui-gap-4">
        <span>
          Do you want to remove {count} {type.toLowerCase()}({pluralSuffix})?
        </span>
        <Button onClick={() => onSubmit?.()}>Remove</Button>
      </div>
    </DrawerDialog>
  );
};

export interface DataTableProps<T> {
  type: string;
  pluralSuffix?: string;
  values: T[];
  head: (string | null)[];
  row: (value: T) => any[];
  valueKey: (value: T) => string | number;
  addDialog?: any;
  addValidate?: () => boolean;
  onAdd?: () => Promise<boolean>;
  onRemove?: (values: T[]) => Promise<boolean>;
  searchFilter?: (value: T, search: string) => boolean;
  noAdd?: boolean;
  noRemove?: boolean;
}

export function DataTable<T>({
  type,
  pluralSuffix,
  onAdd,
  addValidate,
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
  const plural = `${type}${pluralSuffix || "s"}`;

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
    <div className="ui-grid ui-gap-4">
      {searchFilter !== undefined && (
        <Input
          placeholder={`Search ${plural}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {hasButtons && (
        <div className="ui-grid ui-w-max ui-grid-flow-col ui-gap-4">
          {hasAdd && (
            <AddDialog
              type={type}
              open={addDialogOpen}
              setOpen={setAddDialogOpen}
              validate={addValidate}
              onSubmit={async () => {
                if (await onAdd?.()) setAddDialogOpen(false);
              }}
            >
              {addDialog}
            </AddDialog>
          )}
          {hasRemove && (
            <RemoveDialog
              type={type}
              pluralSuffix={pluralSuffix || "s"}
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
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {hasSelect && (
                <TableHead className="ui-w-[50px]">
                  <Checkbox
                    checked={
                      searchValues.length === selectedValues.length &&
                      searchValues.length > 0
                    }
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
              {head
                .filter((label) => label)
                .map((label) => (
                  <TableHead>{label}</TableHead>
                ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {searchValues.length === 0 ? (
              <TableRow key="none">
                {hasSelect && <TableCell />}
                <TableCell>No {plural}</TableCell>
                {new Array(head.filter((label) => label).length - 1)
                  .fill(0)
                  .map((_) => (
                    <TableCell />
                  ))}
              </TableRow>
            ) : (
              searchValues.map((value) => (
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
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
