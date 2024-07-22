import { useContext } from "react";

import { UploadContext, UploadInterface } from "./contexts";

async function uploadFile(url: string, file: File): Promise<string> {
  const formData = new FormData();

  formData.set("file", file);

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  return await res.text();
}

export function UploadProvider({
  url,
  children,
}: {
  url: string;
  children: any;
}) {
  const value: UploadInterface = {
    wordlist: async (file) => uploadFile(`${url}/upload/wordlist`, file),
  };

  return (
    <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
  );
}

export function useUpload() {
  return useContext(UploadContext);
}
