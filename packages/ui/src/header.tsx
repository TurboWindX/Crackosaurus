import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle
} from "@repo/shadcn/components/ui/navigation-menu";
import { Separator } from "@repo/shadcn/components/ui/separator";
import { BabyIcon, FolderIcon, HardHatIcon, SearchIcon } from "lucide-react";

import { Link } from "react-router-dom";

export interface HeaderNavButtonProps {
  link: string;
  text: string;
  icon: any;
};

export const HeaderNavButton = ({ link, text, icon }: HeaderNavButtonProps) => {
  return <NavigationMenuItem>
    <Link to={link}>
      <NavigationMenuLink className={navigationMenuTriggerStyle()}>
        <div className="grid gap-2 grid-flow-col items-center">
          {icon}
          <span>{text}</span>
        </div>
      </NavigationMenuLink>
    </Link>
  </NavigationMenuItem>;
};

export const Header = () => {
  return <div>
    <div className="grid grid-cols-2">
      <div>
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
      <div className="grid justify-end">
        <NavigationMenu>
          <NavigationMenuList>
            <HeaderNavButton 
              link="/account"
              icon={<BabyIcon />}
              text="Account"
            />
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </div>
    <Separator />
  </div>;
}
