import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createRedmineClientFromEnv } from "./redmine/client.js";
import { createServer } from "./server.js";

void serveStdio(() => createServer(createRedmineClientFromEnv()));
