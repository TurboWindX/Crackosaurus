import http from "node:http";
import url from "node:url";

import { HTTPMethod, unwrapResponse } from "../../routing";
import { type APIType, ROUTES } from "../routes";

interface Response {
  status: number;
  json: () => Promise<any>;
}

async function handleRes<Res>(res: Response): Promise<Res> {
  let json = await res.json();

  if (json.error) {
    json.error = {
      code: res.status,
      message: json.error,
    };
  }

  return json;
}

async function fetch<TReq, TRes>(
  target: string,
  {
    method,
    body,
  }: {
    method: string;
    body?: string;
  }
): Promise<Response> {
  const urlParse = new url.URL(target);

  return new Promise((resolve, reject) => {
    let output = "";

    const req = http.request(
      {
        host: urlParse.hostname,
        port: urlParse.port,
        path: urlParse.pathname,
        method,
        headers:
          body === undefined
            ? undefined
            : {
                "Content-Type": "application/json",
                "Content-Length": body.length,
              },
      },
      (res) => {
        res.on("data", (chunk) => (output += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 200,
            json: async () => JSON.parse(output),
          });
        });
      }
    );

    req.on("error", () =>
      resolve({
        status: 400,
        json: async () => ({
          error: "Connection error",
        }),
      })
    );

    if (body) req.write(body);

    req.end();
  });
}

async function jsonFetch<Req extends Record<string, any>, Res>(
  method: HTTPMethod,
  host: string,
  path: string,
  data: Req
): Promise<Res> {
  const params = path.split("/:").map((section) => section.split("/")[0] ?? "");
  params.shift();

  const body = { ...data };

  let resolvedPath = path;
  for (let param of params) {
    resolvedPath = resolvedPath.replace(`:${param}`, data[param] ?? "invalid");
    delete body[param];
  }

  const fullPath = `${host}${resolvedPath}`;

  const res = await fetch(fullPath, {
    method,
    body: JSON.stringify(body),
  });

  return handleRes(res);
}

export const makeAPI = (url: string) =>
  Object.fromEntries(
    Object.entries(ROUTES).map(([key, route]) => [
      key,
      async (req: any) =>
        unwrapResponse(
          await jsonFetch<any, any>(route.method, url, route.path, req)
        ),
    ])
  ) as APIType;

export type REQ<T extends (req: any) => any> = Parameters<T>[0];
export type RES<T extends (req: any) => Promise<any>> = NonNullable<
  Awaited<ReturnType<T>>[0]
>;
