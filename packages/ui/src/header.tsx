import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
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
import { BabyIcon, FolderIcon, HardHatIcon } from "lucide-react";

import { Link } from "react-router-dom";

export interface HeaderNavButtonProps {
  link: string;
  text: string;
  icon: any;
  textHidden?: boolean;
}

export const HeaderNavButton = ({
  link,
  text,
  icon,
  textHidden,
}: HeaderNavButtonProps) => {
  return (
    <NavigationMenuItem>
      <Link to={link}>
        <NavigationMenuLink className={navigationMenuTriggerStyle()}>
          <div className="grid gap-2 grid-flow-col items-center">
            {icon}
            <span className={textHidden ? "md:block hidden" : ""}>{text}</span>
          </div>
        </NavigationMenuLink>
      </Link>
    </NavigationMenuItem>
  );
};

export const Header = () => {
  return (
    <div>
      <div className="grid grid-cols-2">
        <div className="md:block hidden">
          <NavigationMenu>
            <NavigationMenuList>
              <HeaderNavButton
                link="/"
                icon={<HardHatIcon />}
                text="Crackosaurus"
              />
              <HeaderNavButton
                link="/projects"
                icon={<FolderIcon />}
                text="Projects"
              />
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
                      className={navigationMenuTriggerStyle()}
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
              <HeaderNavButton
                link="/account"
                icon={<BabyIcon />}
                text="Account"
                textHidden
              />
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>
      <Separator />
    </div>
  );
};
