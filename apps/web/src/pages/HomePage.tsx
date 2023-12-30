import useSWR from "swr";

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@repo/shadcn/components/ui/menubar";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/shadcn/components/ui/card";

const API_URL = "http://localhost:8080/api";

export const HomePage = () => {
  const { data, error, isLoading } = useSWR(
    `${API_URL}/ping`, 
    (...args: any) => fetch(...args).then((res) => res.text())
  );

  return (
    <>
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              New Tab <MenubarShortcut>⌘T</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>New Window</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Share</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Print</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      <br />
      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
          <CardDescription>From Server</CardDescription>
        </CardHeader>
        <CardContent>
          <p>{data}</p>
        </CardContent>
      </Card>
    </>
  )
};
