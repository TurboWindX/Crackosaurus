import { unwrapResponse } from "../../routing";
import { type HTTPMethod } from "../../routing";
import { type APIType, ROUTES } from "../routes";

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

async function jsonFetch<Req extends Record<string, any>, Res>(
  method: HTTPMethod,
  host: string,
  path: string,
  data: Req
): Promise<Res> {
  const params = path
    .split("/:")
    .map((section) => section.split("/")[0] as string);
  params.shift();

  const body = { ...data };

  let resolvedPath = path;
  for (let param of params) {
    resolvedPath = resolvedPath.replace(`:${param}`, data[param] ?? "invalid");
    delete body[param];
  }

  const fullPath = `${host}${resolvedPath}`;

  let res;
  if (method === "GET") {
    res = await fetch(fullPath, {
      credentials: "include",
    });
  } else {
    res = await fetch(fullPath, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

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
  Awaited<ReturnType<T>>
>;
