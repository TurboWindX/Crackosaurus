import { createContext, useContext, useMemo } from "react";

import { type APIType } from "@repo/api/server";
import { makeAPI } from "@repo/api/server/client/web";

const APIContext = createContext<APIType>(undefined as any);

export const useAPI = () => {
  return useContext(APIContext);
};

export const APIProvider = ({
  url,
  children,
}: {
  url: string;
  children: any;
}) => {
  const API = useMemo(() => makeAPI(url), [url]);

  return <APIContext.Provider value={API}>{children}</APIContext.Provider>;
};
