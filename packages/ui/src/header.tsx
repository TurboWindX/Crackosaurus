import { FolderIcon, HardHatIcon, UserIcon, UsersIcon } from "lucide-react";
import { Link } from "react-router-dom";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@repo/shadcn/components/ui/navigation-menu";
import { Separator } from "@repo/shadcn/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/shadcn/components/ui/sheet";

import { useAuth } from "./auth";

const LINKS = [
  {
    text: "Crackosaurus",
    path: "/",
    icon: HardHatIcon,
    isAdmin: false,
  },
  {
    text: "Projects",
    path: "/projects",
    icon: FolderIcon,
    isAdmin: false,
  },
  {
    text: "Users",
    path: "/users",
    icon: UsersIcon,
    isAdmin: true,
  },
] as const;

export const Header = () => {
  const { uid, username, isAdmin } = useAuth();

  return (
    <div>
      <div className="ui-grid ui-grid-cols-2">
        <div className="ui-hidden md:ui-block">
          <NavigationMenu>
            <NavigationMenuList>
              {LINKS.map(
                (link) =>
                  (isAdmin || !link.isAdmin) && (
                    <NavigationMenuItem>
                      <Link to={link.path}>
                        <NavigationMenuLink
                          className={navigationMenuTriggerStyle()}
                        >
                          <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
                            <link.icon />
                            <span className="ui-hidden md:ui-block">{link.text}</span>
                          </div>
                        </NavigationMenuLink>
                      </Link>
                    </NavigationMenuItem>
                  )
              )}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="ui-block md:ui-hidden">
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
                      <HardHatIcon />
                    </NavigationMenuLink>
                  </SheetTrigger>
                  <SheetContent side="left">
                    <SheetHeader>
                      <SheetTitle>Crackosaurus</SheetTitle>
                      <SheetDescription></SheetDescription>
                    </SheetHeader>
                    <SheetFooter>
                      {[...LINKS].reverse().map(
                        (link) =>
                          (isAdmin || !link.isAdmin) && (
                            <SheetClose asChild>
                              <Link to={link.path}>
                                {link.text === "Crackosaurus"
                                  ? "Home"
                                  : link.text}
                              </Link>
                            </SheetClose>
                          )
                      )}
                    </SheetFooter>
                  </SheetContent>
                </Sheet>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="ui-grid ui-justify-end">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <Link to={`/users/${uid}`}>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    <div className="ui-grid ui-grid-flow-col ui-items-center ui-gap-2">
                      <UserIcon />
                      <span className="ui-hidden md:ui-block">{username}</span>
                    </div>
                  </NavigationMenuLink>
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
