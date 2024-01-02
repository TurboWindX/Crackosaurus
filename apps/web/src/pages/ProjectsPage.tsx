import { Badge } from "@repo/shadcn/components/ui/badge";
import { Card } from "@repo/shadcn/components/ui/card";
import { Input } from "@repo/shadcn/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@repo/shadcn/components/ui/table";
import { Header } from "@repo/ui/header";
import { RelativeTime } from "@repo/ui/time";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@repo/shadcn/components/ui/pagination";

export interface ProjectStatusBadgeProps {
  status: "complete" | "crack" | "open";
};

export const ProjectStatusBadge = ({ status }: ProjectStatusBadgeProps) => {
  switch (status) {
    case "complete":
      return <Badge style={{ backgroundColor: "green", color: "white" }}>Complete</Badge>;
    case "crack":
      return <Badge style={{ backgroundColor: "yellow" }}>Cracking</Badge>;
    case "open":
      return <Badge style={{ backgroundColor: "blue", color: "white" }}>Open</Badge>;
  }
}

export const ProjectsPage = () => {
  return <div>
    <Header />
    <div className="grid gap-4 p-4">
      <Input
        placeholder="Search"
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Collaborators</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Modified</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">PRJ001</TableCell>
              <TableCell>
                <div className="grid gap-2 grid-flow-col max-w-max">
                  <Badge variant="secondary">Person</Badge>
                  <Badge variant="secondary">Team</Badge>
                </div>
              </TableCell>
              <TableCell>
                <ProjectStatusBadge
                  status="crack"
                />
              </TableCell>
              <TableCell>
                <RelativeTime
                  epoch={Date.now() - Math.random() * 10000000}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive>1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">2</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">3</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  </div>;
};
