import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createProductionServer } from "./server.js";

void serveStdio(() => createProductionServer());
