import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuContent,
  navigationMenuTriggerStyle,
} from "@repo/shadcn/components/ui/navigation-menu";
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
import { Separator } from "@repo/shadcn/components/ui/separator";
import { UserIcon, FolderIcon, HardHatIcon } from "lucide-react";

import { Link } from "react-router-dom";
import { useAuth } from "./auth";

const LINKS = [
  {
    text: "Crackosaurus",
    path: "/",
    icon: HardHatIcon
  },
  {
    text: "Projects",
    path: "/projects",
    icon: FolderIcon
  }
] as const;

export const Header = () => {
  const { username } = useAuth();

  return (
    <div>
      <div className="grid grid-cols-2">
        <div className="md:block hidden">
          <NavigationMenu>
            <NavigationMenuList>
              {
                LINKS.map((link) => (
                  <NavigationMenuItem>
                    <Link to={link.path}>
                      <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                        <div className="grid gap-2 grid-flow-col items-center">
                          <link.icon />
                          <span className="md:block hidden">{link.text}</span>
                        </div>
                      </NavigationMenuLink>
                    </Link>
                  </NavigationMenuItem>
                ))
              }
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="md:hidden block">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <Sheet>
                  <SheetTrigger asChild>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle() + " cursor-pointer"}
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
                      <SheetClose asChild>
                        <Link to="/projects">Projects</Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link to="/">Home</Link>
                      </SheetClose>
                    </SheetFooter>
                  </SheetContent>
                </Sheet>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="grid justify-end">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <Link to="/account">
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    <div className="grid gap-2 grid-flow-col items-center">
                      <UserIcon />
                      <span className="md:block hidden">{username}</span>
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
