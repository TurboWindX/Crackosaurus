import {
  CpuIcon,
  FolderIcon,
  LockIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { PermissionType } from "@repo/api";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@repo/shadcn/components/ui/navigation-menu";
import { Separator } from "@repo/shadcn/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/shadcn/components/ui/sheet";

import { useAuth } from "./auth";

interface HeaderLinkProps {
  text: string;
  path: string;
  icon: any;
  permission?: PermissionType;
}

const LINKS: readonly HeaderLinkProps[] = [
  {
    text: "Crackosaurus",
    path: "/",
    icon: LockIcon,
  },
  {
    text: "Projects",
    path: "/projects",
    icon: FolderIcon,
  },
  {
    text: "Instances",
    path: "/instances",
    icon: CpuIcon,
    permission: "instances:get",
  },
  {
    text: "Users",
    path: "/users",
    icon: UsersIcon,
    permission: "users:get",
  },
] as const;

export const Header = () => {
  const { uid, username, hasPermission, isLoading } = useAuth();

  if (isLoading) return <></>;

  return (
    <div>
      <div className="ui-flex">
        <div className="ui-hidden ui-flex-grow md:ui-block">
          <NavigationMenu>
            <NavigationMenuList>
              {LINKS.map(
                (link) =>
                  (!link.permission || hasPermission(link.permission)) && (
                    <NavigationMenuItem key={link.path}>
                      <Link
                        className={navigationMenuTriggerStyle()}
                        to={link.path}
                      >
                        <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
                          <link.icon />
                          <span className="ui-hidden md:ui-block">
                            {link.text}
                          </span>
                        </div>
                      </Link>
                    </NavigationMenuItem>
                  )
              )}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="ui-block ui-flex-grow md:ui-hidden">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <Sheet>
                  <SheetTrigger asChild>
                    <NavigationMenuLink
                      className={
                        navigationMenuTriggerStyle() + " ui-cursor-pointer"
                      }
                    >
                      <LockIcon />
                    </NavigationMenuLink>
                  </SheetTrigger>
                  <SheetContent side="left">
                    <SheetHeader>
                      <SheetTitle>Crackosaurus</SheetTitle>
                      <SheetDescription></SheetDescription>
                    </SheetHeader>
                    <div className="ui-grid ui-gap-2">
                      {[...LINKS].map(
                        (link) =>
                          (!link.permission ||
                            hasPermission(link.permission)) && (
                            <SheetClose key={link.path} asChild>
                              <Link to={link.path}>
                                {link.text === "Crackosaurus"
                                  ? "Home"
                                  : link.text}
                              </Link>
                            </SheetClose>
                          )
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="ui-grid ui-flex-grow-0 ui-justify-end">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <Link
                  className={navigationMenuTriggerStyle()}
                  to={`/users/${uid}`}
                >
                  <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
                    <UserIcon />
                    <span className="ui-hidden md:ui-block">{username}</span>
                  </div>
                </Link>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>
      <Separator />
    </div>
  );
};
