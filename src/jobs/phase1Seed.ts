import { main } from "./cli";
await main({ types: ["index_history", "constituents", "listing"], maxCalls: 50 });
