import { REST, Routes } from "discord.js";
import { commandDefinitions } from "./commands.js";

async function main(): Promise<void> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not set");
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const me = (await rest.get(Routes.user("@me"))) as { id: string };

  const guildId = process.env["DISCORD_GUILD_ID"];
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(me.id, guildId), {
      body: commandDefinitions,
    });
    console.log(
      `Registered ${commandDefinitions.length} guild commands for ${guildId} (instant).`,
    );
  } else {
    await rest.put(Routes.applicationCommands(me.id), {
      body: commandDefinitions,
    });
    console.log(
      `Registered ${commandDefinitions.length} global commands. May take up to 1 hour to appear.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
