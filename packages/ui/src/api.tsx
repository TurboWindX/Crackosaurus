import { useContext, useMemo } from "react";

import { makeAPI } from "@repo/api/server/client/web";

import { APIContext } from "./contexts";

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
