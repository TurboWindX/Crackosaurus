import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@repo/shadcn/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/shadcn/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@repo/shadcn/components/ui/drawer";
import { useMediaQuery } from "@repo/shadcn/hooks/use-media-query";

export interface DrawerDialogProps {
  title: string;
  trigger?: ReactNode;
  description?: string;
  children?: ReactNode;
  open?: boolean;
  setOpen?: (state: boolean) => void;
}

export function DrawerDialog({
  title,
  description,
  children,
  open,
  setOpen,
  trigger,
}: DrawerDialogProps) {
  const { t } = useTranslation();

  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="sm:ui-max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  } else {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="ui-text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="ui-px-4">{children}</div>
          <DrawerFooter className="ui-pt-2">
            <DrawerClose asChild>
              <Button variant="outline">{t("action.cancel.text")}</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }
}
