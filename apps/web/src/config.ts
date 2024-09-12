import { type WebConfig } from "@repo/app-config/web";

// @ts-expect-error: global defined by Vite
export default PACKAGE_WEB_CONFIG as WebConfig;
