import { Command } from "commander";

const program = new Command();
program.name("talkie");
program.description("agent-talkie CLI");

await program.parseAsync(process.argv);
