import {
  ALargeSmallIcon,
  CpuIcon,
  FolderIcon,
  LockIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { PermissionType } from "@repo/api";
import {
  NavigationMenu,
  NavigationMenuItem,
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
  label: string;
  path: string;
  icon: ReactNode;
  permission?: PermissionType;
}

const LINKS: readonly HeaderLinkProps[] = [
  {
    label: "app",
    path: "/",
    icon: <LockIcon />,
  },
  {
    label: "item.project.plural",
    path: "/projects",
    icon: <FolderIcon />,
  },
  {
    label: "item.instance.plural",
    path: "/instances",
    icon: <CpuIcon />,
    permission: "instances:get",
  },
  {
    label: "item.wordlist.plural",
    path: "/wordlists",
    icon: <ALargeSmallIcon />,
    permission: "wordlists:get",
  },
  {
    label: "item.user.plural",
    path: "/users",
    icon: <UsersIcon />,
    permission: "users:get",
  },
] as const;

export const Header = () => {
  const { uid, username, hasPermission, isLoading, isAuthenticated } =
    useAuth();
  const { t } = useTranslation();

  if (isLoading || !isAuthenticated) return <></>;

  return (
    <div>
      <div className="ui-flex">
        <div className="ui-hidden ui-flex-grow lg:ui-block">
          <NavigationMenu>
            <NavigationMenuList>
              {LINKS.map(
                (link) =>
                  (!link.permission || hasPermission(link.permission)) && (
                    <NavigationMenuItem key={link.path}>
                      <Link to={link.path}>
                        <div className={navigationMenuTriggerStyle()}>
                          <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
                            {link.icon}
                            <span className="ui-hidden md:ui-block">
                              {t(link.label)}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </NavigationMenuItem>
                  )
              )}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="ui-block ui-flex-grow lg:ui-hidden">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <Sheet>
                  <SheetTrigger asChild>
                    <Link to="#">
                      <div className={navigationMenuTriggerStyle()}>
                        <LockIcon />
                      </div>
                    </Link>
                  </SheetTrigger>
                  <SheetContent side="left">
                    <SheetHeader>
                      <SheetTitle>{t("app")}</SheetTitle>
                      <SheetDescription></SheetDescription>
                    </SheetHeader>
                    <div className="ui-grid ui-gap-2">
                      {[...LINKS].map(
                        (link) =>
                          (!link.permission ||
                            hasPermission(link.permission)) && (
                            <SheetClose key={link.path} asChild>
                              <Link to={link.path}>
                                {link.label === "app"
                                  ? t("page.home.title")
                                  : t(link.label)}
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
                <Link to={`/users/${uid}`}>
                  <div className={navigationMenuTriggerStyle()}>
                    <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
                      <UserIcon />
                      <span className="ui-hidden md:ui-block">{username}</span>
                    </div>
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
