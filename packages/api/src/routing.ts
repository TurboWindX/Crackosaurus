import { type ZodType, type z } from "zod";

export interface APIError {
  error: {
    code: number;
    message: string;
  };
}

export type APIResponse<T> = Promise<T | APIError>;

export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE";

export type PathParams<T extends string> =
  T extends `/:${infer Param}/${infer Rest}`
    ? Param | PathParams<`/${Rest}`>
    : T extends `/:${infer Param}`
      ? Param
      : T extends `/${string}/${infer Rest}`
        ? PathParams<`/${Rest}`>
        : never;

export type RouteRequest<TRoute> = TRoute extends Route<
  infer TPath,
  infer TReq,
  any
>
  ? {
      Params: { [key in PathParams<TPath>]: string };
      Body: z.infer<TReq>;
    }
  : never;

export type RouteResponse<TRoute> = TRoute extends Route<any, any, infer TRes>
  ? {
      response: z.infer<TRes>;
    }
  : never;

export interface Route<
  TPath extends string,
  TReq extends ZodType<any, any, any>,
  TRes extends ZodType<any, any, any>,
> {
  method: HTTPMethod;
  path: TPath;
  request: TReq;
  response: TRes;
}

export type APIHandler<TRoute> = TRoute extends Route<
  infer TPath,
  infer TReq,
  any
>
  ? (
      req: Record<PathParams<TPath>, string> & z.infer<TReq>
    ) => Promise<RouteResponse<TRoute>["response"]>
  : never;

export function unwrapResponse<
  TRes extends Awaited<APIResponse<TData>>,
  TData extends { response: any },
>(res: TRes): TData["response"] {
  const anyRes = res as any;

  if (anyRes.error) throw new Error(anyRes.error);

  return anyRes.response;
}
