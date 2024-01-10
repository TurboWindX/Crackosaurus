import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/shadcn/components/ui/avatar";
import { useAuth } from "@repo/ui/auth";
import { Header } from "@repo/ui/header";

export interface ProjectStatusBadgeProps {
  status: "complete" | "crack" | "open";
}

export const AccountPage = () => {
  const { username } = useAuth();

  return (
    <div>
      <Header />
      <div className="grid justify-center p-4">
        <div className="grid justify-center gap-2">
          <div className="grid justify-center">
            <Avatar>
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
          </div>
          <h1 className="text-xl font-semibold">{username}</h1>
        </div>
      </div>
    </div>
  );
};
