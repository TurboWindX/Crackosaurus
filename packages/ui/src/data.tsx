import { DownloadIcon, ImportIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@repo/shadcn/components/ui/button";
import { Card } from "@repo/shadcn/components/ui/card";
import { Checkbox } from "@repo/shadcn/components/ui/checkbox";
import { FilePicker } from "@repo/shadcn/components/ui/file-picker";
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
  const buttonDisabled = useMemo(
    () => !(validate === undefined || validate()),
    [validate]
  );

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
        className="ui-flex ui-flex-col ui-gap-2 md:ui-max-w-[380px]"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        {children}
        <Button disabled={buttonDisabled}>Add</Button>
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
  const isDisabled = useMemo(() => count === 0, [count]);

  return (
    <DrawerDialog
      title={`Remove ${type}${pluralSuffix}`}
      open={open}
      setOpen={setOpen}
      trigger={
        <Button variant="outline" disabled={isDisabled}>
          <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
            <TrashIcon />
            <span>Remove</span>
          </div>
        </Button>
      }
    >
      <div className="ui-grid ui-gap-2">
        <span>
          Do you want to remove {count} {type.toLowerCase()}({pluralSuffix})?
        </span>
        <Button onClick={onSubmit}>Remove</Button>
      </div>
    </DrawerDialog>
  );
};

export interface ImportDialogProps {
  type: string;
  pluralSuffix: string;
  open: boolean;
  file?: File | null;
  onFileChange?: (file: File | null) => void;
  setOpen: (state: boolean) => void;
  onSubmit?: () => void;
}

export const ImportDialog = ({
  type,
  pluralSuffix,
  open,
  file,
  onFileChange,
  setOpen,
  onSubmit,
}: ImportDialogProps) => {
  return (
    <DrawerDialog
      title={`Import ${type}${pluralSuffix}`}
      open={open}
      setOpen={setOpen}
      trigger={
        <Button variant="outline">
          <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
            <ImportIcon />
            <span>Import</span>
          </div>
        </Button>
      }
    >
      <div className="ui-grid ui-gap-2">
        <FilePicker
          placeholder={`${type}${pluralSuffix} JSON file`}
          accept={["application/json", ".json"]}
          file={file}
          onChange={onFileChange}
        />
        <Button onClick={onSubmit}>Import</Button>
      </div>
    </DrawerDialog>
  );
};

export interface ExportDialogProps {
  count: number;
  onSubmit?: () => void;
}

export const ExportDialog = ({ count, onSubmit }: ExportDialogProps) => {
  const isDisabled = useMemo(() => count === 0, [count]);

  return (
    <Button variant="outline" disabled={isDisabled} onClick={onSubmit}>
      <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
        <DownloadIcon />
        <span>Export</span>
      </div>
    </Button>
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
  searchFilter?: (value: T, search: string) => boolean;
  exportPrefix?: string;
  onAdd?: () => Promise<boolean>;
  onRemove?: (values: T[]) => Promise<boolean>;
  onImport?: (data: any[]) => Promise<boolean>;
  onExport?: (values: T[]) => Promise<any[]>;
  noAdd?: boolean;
  noRemove?: boolean;
  noImport?: boolean;
  noExport?: boolean;
}

export function DataTable<T>({
  type,
  pluralSuffix,
  addValidate,
  row,
  rowClick,
  sort,
  valueKey,
  addDialog,
  values,
  head,
  searchFilter,
  isLoading,
  exportPrefix,
  onAdd,
  onRemove,
  onImport,
  onExport,
  noAdd,
  noRemove,
  noImport,
  noExport,
}: DataTableProps<T>) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const [selects, setSelects] = useState<Record<string | number, boolean>>({});
  const [search, setSearch] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);

  const pluralSuffixWithS = useMemo(() => pluralSuffix || "s", [pluralSuffix]);

  const plural = useMemo(
    () => `${type}${pluralSuffixWithS}`,
    [type, pluralSuffixWithS]
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

  const hasImport = useMemo(
    () => onImport !== undefined && !noImport,
    [onImport, noImport]
  );

  const hasExport = useMemo(
    () => onExport !== undefined && !noExport,
    [onExport, noExport]
  );

  const hasButtons = useMemo(
    () => hasAdd || hasRemove || hasImport || hasExport,
    [hasAdd, hasRemove, hasImport, hasExport]
  );

  const hasSelect = useMemo(
    () => hasRemove || hasExport,
    [hasRemove, hasExport]
  );

  const selectCount = useMemo(() => selectedValues.length, [selectedValues]);

  const filePrefix = useMemo(
    () => exportPrefix || "crackosaurus",
    [exportPrefix]
  );

  return (
    <div className="ui-grid ui-gap-2">
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
          className="ui-grid ui-w-max ui-grid-flow-col ui-gap-2"
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
          {hasImport && (
            <ImportDialog
              key="import"
              type={type}
              pluralSuffix={pluralSuffixWithS}
              file={importFile}
              onFileChange={setImportFile}
              open={importDialogOpen}
              setOpen={setImportDialogOpen}
              onSubmit={async () => {
                if (onImport === undefined) return;

                let data = [];
                try {
                  const contents = await new Promise<string>((resolve) => {
                    const reader = new FileReader();

                    reader.onload = () => {
                      resolve(reader.result as string);
                    };

                    reader.readAsText(importFile!);
                  });

                  data = JSON.parse(contents);

                  if (!(data instanceof Array)) data = [];
                } catch (e) {}

                if (!(await onImport(data))) return;

                setImportDialogOpen(false);
                setImportFile(null);
              }}
            />
          )}
          {hasExport && (
            <ExportDialog
              key="export"
              count={selectCount}
              onSubmit={async () => {
                if (onExport === undefined) return;

                const data = await onExport(selectedValues);
                const json = JSON.stringify(data);

                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);

                const a = document.createElement("a");
                a.href = url;
                a.download = `${filePrefix}.json`;

                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
            />
          )}
          {hasRemove && (
            <RemoveDialog
              key="remove"
              type={type}
              pluralSuffix={pluralSuffixWithS}
              open={removeDialogOpen}
              setOpen={setRemoveDialogOpen}
              count={selectCount}
              onSubmit={async () => {
                if (onRemove === undefined) return;
                if (!(await onRemove(selectedValues))) return;

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
