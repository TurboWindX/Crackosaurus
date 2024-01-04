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
import { useState } from "react";
import { useNavigate } from "react-router-dom";

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

export interface Project {
  name: string;
  collaborators: string[];
  status: ProjectStatusBadgeProps["status"],
  lastModified: number;
};

export const ProjectRow = ({ name, collaborators, status, lastModified }: Project) => {
  const navigate = useNavigate();

  return (
    <TableRow className="cursor-pointer" onClick={() => navigate(`/projects/${name}`)}>
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell className="hidden lg:!table-cell">
        <div className="grid gap-2 grid-flow-col max-w-max">
          {collaborators.map((collaborator) => <Badge variant="secondary">{collaborator}</Badge>)}
        </div>
      </TableCell>
      <TableCell>
        <ProjectStatusBadge status={status} />
      </TableCell>
      <TableCell className="hidden sm:!table-cell">
        <RelativeTime epoch={lastModified} />
      </TableCell>
    </TableRow>
  );
};

export const ProjectsPage = () => {
  const [projects, setProjects] = useState<Project[]>([]);

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
              <TableHead className="hidden lg:!table-cell">Collaborators</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:!table-cell">Last Modified</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => <ProjectRow {...project} />)}
          </TableBody>
        </Table>
      </Card>
      <Pagination className="!hidden">
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
