import { ReactNode, useContext } from "react";

import { UploadContext, UploadInterface } from "./contexts";

async function uploadFile(
  url: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.set("file", file);

    xhr.open("POST", url);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.min((event.loaded / event.total) * 100, 99);
        onProgress(Math.floor(percent)); // cap at 99%
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100); // set to 100% once fully done
        resolve(xhr.responseText);
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));

    xhr.send(formData);
  });
}

export function UploadProvider({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  const value: UploadInterface = {
    wordlist: (file, onProgress) =>
      uploadFile(`${url}/upload/wordlist`, file, onProgress),
  };

  return (
    <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
  );
}

export function useUpload() {
  return useContext(UploadContext);
}
