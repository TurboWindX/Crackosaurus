import { PlusIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";

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
        className="ui-flex ui-flex-col ui-gap-4 md:ui-max-w-[380px]"
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
  isLoading?: boolean;
  sort?: (a: T, b: T) => number;
  rowClick?: (value: T) => void;
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
  rowClick,
  sort,
  valueKey,
  addDialog,
  values,
  head,
  searchFilter,
  noAdd,
  noRemove,
  isLoading,
}: DataTableProps<T>) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selects, setSelects] = useState<Record<string | number, boolean>>({});
  const [search, setSearch] = useState("");

  const plural = useMemo(
    () => `${type}${pluralSuffix || "s"}`,
    [type, pluralSuffix]
  );

  const sortedValues = useMemo(
    () => (sort ? values.sort(sort) : values),
    [values, sort]
  );

  const searchValues = useMemo(
    () => sortedValues.filter((value) => searchFilter?.(value, search) ?? true),
    [search, sortedValues, searchFilter]
  );

  const selectedValues = useMemo(
    () => searchValues.filter((value) => selects[valueKey(value)]),
    [selects, searchValues, valueKey]
  );

  const hasAdd = useMemo(
    () => addDialog !== undefined && onAdd !== undefined && !noAdd,
    [addDialog, onAdd, noAdd]
  );

  const hasRemove = useMemo(
    () => onRemove !== undefined && !noRemove,
    [onRemove, noRemove]
  );

  const hasButtons = useMemo(() => hasAdd || hasRemove, [hasAdd, hasRemove]);

  const hasSelect = useMemo(() => hasRemove, [hasRemove]);

  return (
    <div className="ui-grid ui-gap-4">
      {searchFilter !== undefined && (
        <Input
          key="search"
          placeholder={`Search ${plural}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {hasButtons && (
        <div
          key="buttons"
          className="ui-grid ui-w-max ui-grid-flow-col ui-gap-4"
        >
          {hasAdd && (
            <AddDialog
              key="add"
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
              key="remove"
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
      <div className="ui-max-w-[100vw] ui-overflow-x-hidden">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                {hasSelect && (
                  <TableHead key="select" className="ui-w-[50px]">
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
                    <TableHead key={label}>{label}</TableHead>
                  ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <DataTableBody
                values={searchValues}
                head={head}
                row={row}
                rowClick={rowClick}
                hasSelect={hasSelect}
                plural={plural}
                valueKey={valueKey}
                selects={selects}
                setSelects={setSelects}
                isLoading={isLoading}
              />
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

export interface DataTableBodyProps<T> {
  values: T[];
  head: (string | null)[];
  hasSelect: boolean;
  plural: string;
  valueKey: (value: T) => string | number;
  selects: Record<string | number, boolean>;
  setSelects: (data: Record<string | number, boolean>) => void;
  row: (value: T) => any[];
  rowClick?: (value: T) => void;
  isLoading?: boolean;
}

const DataTableBody = <T,>({
  values,
  hasSelect,
  plural,
  head,
  valueKey,
  selects,
  setSelects,
  row,
  rowClick,
  isLoading,
}: DataTableBodyProps<T>) => {
  if (isLoading)
    return (
      <TableRow key="loading">
        {hasSelect && <TableCell />}
        <TableCell>Loading</TableCell>
        {new Array(head.filter((label) => label).length - 1)
          .fill(0)
          .map((_, index) => (
            <TableCell key={index} />
          ))}
      </TableRow>
    );

  if (values.length === 0)
    return (
      <TableRow key="none">
        {hasSelect && <TableCell />}
        <TableCell>No {plural}</TableCell>
        {new Array(head.filter((label) => label).length - 1)
          .fill(0)
          .map((_, index) => (
            <TableCell key={index} />
          ))}
      </TableRow>
    );

  return values.map((value) => (
    <TableRow key={valueKey(value)}>
      {hasSelect && (
        <TableCell key="select">
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
      {row(value).map((column, index) =>
        column !== undefined && column !== null ? (
          <TableCell
            key={index}
            className={`${index === 0 ? "ui-font-medium" : ""} ${
              rowClick ? "ui-cursor-pointer" : ""
            }`}
            onClick={() => rowClick?.(value)}
          >
            {column}
          </TableCell>
        ) : null
      )}
    </TableRow>
  ));
};
