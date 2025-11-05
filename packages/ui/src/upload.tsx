import { ReactNode, useContext } from "react";

import { useTRPC } from "./api";
import { UploadContext, UploadInterface } from "./contexts";

async function uploadFile(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    // Handle abort signal
    if (abortSignal) {
      if (abortSignal.aborted) {
        reject(new Error("Upload aborted"));
        return;
      }

      abortSignal.addEventListener("abort", () => {
        xhr.abort();
        reject(new Error("Upload aborted"));
      });
    }

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
        reject(
          new Error(
            `Upload failed with status ${xhr.status}: ${xhr.responseText}`
          )
        );
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new Error("Upload aborted"));

    xhr.send(file);
  });
}

async function uploadMultipart(
  file: File,
  partUrls: Array<{ partNumber: number; url: string }>,
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal
): Promise<Array<{ partNumber: number; etag: string }>> {
  const partSize = 100 * 1024 * 1024; // 100MB per part
  const parts: Array<{ partNumber: number; etag: string }> = [];

  for (const { partNumber, url } of partUrls) {
    // Check if aborted before starting each part
    if (abortSignal?.aborted) {
      throw new Error("Upload aborted");
    }

    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, file.size);
    const chunk = file.slice(start, end);

    try {
      const response = await fetch(url, {
        method: "PUT",
        body: chunk,
        headers: {
          "Content-Type": "application/octet-stream",
        },
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(
          `Part ${partNumber} upload failed with status ${response.status}: ${await response.text()}`
        );
      }

      // Try different ways to get ETag due to browser CORS restrictions
      const etag =
        response.headers.get("ETag") ||
        response.headers.get("etag") ||
        response.headers.get("Etag");

      if (!etag) {
        console.error(
          `Part ${partNumber} upload succeeded but no ETag received. Available headers:`,
          Array.from(response.headers.entries())
        );
        throw new Error(
          `Part ${partNumber} upload succeeded but no ETag received. This may be a CORS configuration issue.`
        );
      }

      // ETags from S3 are typically quoted, keep them as-is
      parts.push({ partNumber, etag });

      // Update progress
      if (onProgress) {
        const progress = (partNumber / partUrls.length) * 100;
        onProgress(progress);
      }
    } catch (error) {
      console.error(`Failed to upload part ${partNumber}:`, error);
      throw error;
    }
  }

  return parts;
}

async function getPresignedUrl(
  mutate: (input: {
    fileName: string;
    fileSize: number;
    checksum: string;
  }) => Promise<{
    uploadUrl?: string;
    uploadId?: string;
    partUrls?: Array<{ partNumber: number; url: string }>;
    s3Key: string;
    wordlistId: string;
    isMultipart: boolean;
  }>,
  file: File
): Promise<{
  uploadUrl?: string;
  uploadId?: string;
  partUrls?: Array<{ partNumber: number; url: string }>;
  s3Key: string;
  wordlistId: string;
  isMultipart: boolean;
}> {
  try {
    // Calculate checksum on client side (simplified - in production you might want to chunk this)
    const checksum = await calculateChecksum(file);

    return await mutate({
      fileName: file.name,
      fileSize: file.size,
      checksum,
    });
  } catch (error) {
    console.error("Failed to get presigned URL:", error);
    throw error;
  }
}

async function calculateChecksum(file: File): Promise<string> {
  try {
    // Check if we're in a secure context
    if (typeof window !== "undefined") {
      if (!window.isSecureContext) {
        console.warn("Not in secure context, using fallback hash");
        throw new Error("Not in secure context");
      }

      if (!crypto || !crypto.subtle) {
        console.warn("Web Crypto API not available, using fallback hash");
        throw new Error("Web Crypto API not available");
      }
    }

    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);

    if (!hashBuffer) {
      throw new Error("Hash calculation failed");
    }

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    console.warn("Using fallback hash calculation:");
    // Fallback: generate a simple hash based on file metadata
    const fallbackHash = `${file.name}-${file.size}-${file.lastModified}`
      .split("")
      .reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0);
    return Math.abs(fallbackHash).toString(16);
  }
}

async function completeUpload(
  url: string,
  wordlistId: string,
  s3Key: string
): Promise<string> {
  const response = await fetch(`${url}/upload/wordlist/complete`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      wordlistId,
      s3Key,
    }),
  });

  if (!response.ok) {
    throw new Error(`Upload completion failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.wordlistID;
}

// Helper for rules: server returns ruleId instead of wordlistId, adapt shape
async function getPresignedUrlRules(
  mutate: (input: { fileName: string; fileSize: number; checksum: string }) =>
    | Promise<any>
    | any,
  file: File
): Promise<{
  uploadUrl?: string;
  uploadId?: string;
  partUrls?: Array<{ partNumber: number; url: string }>;
  s3Key: string;
  wordlistId: string; // we reuse the shape and map ruleId -> wordlistId
  isMultipart: boolean;
}> {
  const checksum = await calculateChecksum(file);
  const resp = await mutate({ fileName: file.name, fileSize: file.size, checksum });

  // Map ruleId to wordlistId so caller can reuse logic
  return {
    uploadUrl: resp.uploadUrl,
    uploadId: resp.uploadId,
    partUrls: resp.partUrls,
    s3Key: resp.s3Key,
    wordlistId: resp.ruleId ?? resp.ruleID ?? resp.ruleid,
    isMultipart: resp.isMultipart,
  };
}

async function completeUploadRules(
  url: string,
  ruleId: string,
  s3Key: string
): Promise<string> {
  const response = await fetch(`${url}/upload/rules/complete`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ruleId,
      s3Key,
    }),
  });

  if (!response.ok) {
    throw new Error(`Upload completion failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.ruleID ?? result.ruleId ?? result.ruleid;
}

function isSecureProtocol(): boolean {
  if (typeof window === "undefined") return true; // SSR safe
  return (
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname.includes("elb.amazonaws.com")
  ); // Temporary for AWS testing
}

export function UploadProvider({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const getUploadUrlMutation = trpc.wordlist.getUploadUrl.useMutation();
  const completeMultipartMutation =
    trpc.wordlist.completeMultipartUpload.useMutation();
  const getUploadUrlMutationRules = trpc.rules.getUploadUrl.useMutation();
  const completeMultipartMutationRules =
    trpc.rules.completeMultipartUpload.useMutation();
  const value: UploadInterface = {
    wordlist: async (file, onProgress, abortSignal) => {
      try {
        // Check protocol first
        if (!isSecureProtocol()) {
          console.warn(
            "⚠️ Upload feature requires HTTPS. Using HTTP may cause issues with checksum calculation."
          );
        }

        // Step 1: Get presigned URL(s) from server
        onProgress?.(5);
        const uploadInfo = await getPresignedUrl(
          getUploadUrlMutation.mutateAsync,
          file
        );
        const {
          uploadUrl,
          uploadId,
          partUrls,
          s3Key,
          wordlistId,
          isMultipart,
        } = uploadInfo;

        if (isMultipart && partUrls && uploadId) {
          // Multipart upload for large files
          onProgress?.(10);

          const parts = await uploadMultipart(
            file,
            partUrls,
            (percent) => {
              // Scale progress from 10% to 90%
              onProgress?.(10 + percent * 0.8);
            },
            abortSignal
          );

          // Complete multipart upload
          onProgress?.(90);
          await completeMultipartMutation.mutateAsync({
            uploadId,
            s3Key,
            wordlistId,
            parts,
          });
        } else if (uploadUrl) {
          // Single-part upload for smaller files
          onProgress?.(10);
          await uploadFile(
            uploadUrl,
            file,
            (percent) => {
              // Scale progress from 10% to 90%
              onProgress?.(10 + percent * 0.8);
            },
            abortSignal
          );
        } else {
          throw new Error("Invalid upload configuration received from server");
        }

        // Step 3: Notify server that upload is complete
        onProgress?.(95);
        const finalWordlistId = await completeUpload(url, wordlistId, s3Key);

        onProgress?.(100);
        return finalWordlistId;
      } catch (error) {
        console.error("Upload failed:", error);
        throw error;
      }
    },
    rules: async (file, onProgress, abortSignal) => {
      try {
        // Check protocol first
        if (!isSecureProtocol()) {
          console.warn(
            "⚠️ Upload feature requires HTTPS. Using HTTP may cause issues with checksum calculation."
          );
        }

        // Step 1: Get presigned URL(s) from server
        onProgress?.(5);
        const uploadInfo = await getPresignedUrlRules(
          getUploadUrlMutationRules.mutateAsync,
          file
        );
        const {
          uploadUrl,
          uploadId,
          partUrls,
          s3Key,
          wordlistId: ruleId,
          isMultipart,
        } = uploadInfo as any;

        if (isMultipart && partUrls && uploadId) {
          // Multipart upload for large files
          onProgress?.(10);

          const parts = await uploadMultipart(
            file,
            partUrls,
            (percent) => {
              // Scale progress from 10% to 90%
              onProgress?.(10 + percent * 0.8);
            },
            abortSignal
          );

          // Complete multipart upload
          onProgress?.(90);
          await completeMultipartMutationRules.mutateAsync({
            uploadId,
            s3Key,
            wordlistId: ruleId,
            parts,
          } as any);
        } else if (uploadUrl) {
          // Single-part upload for smaller files
          onProgress?.(10);
          await uploadFile(
            uploadUrl,
            file,
            (percent) => {
              // Scale progress from 10% to 90%
              onProgress?.(10 + percent * 0.8);
            },
            abortSignal
          );
        } else {
          throw new Error("Invalid upload configuration received from server");
        }

        // Step 3: Notify server that upload is complete
        onProgress?.(95);
        const finalRuleId = await completeUploadRules(url, ruleId, s3Key);

        onProgress?.(100);
        return finalRuleId;
      } catch (error) {
        console.error("Upload failed:", error);
        throw error;
      }
    },
  };

  return (
    <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
  );
}

export function useUpload() {
  return useContext(UploadContext);
}
