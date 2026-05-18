const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

function createClient() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.commands = new Collection();
  loadCommands(client);
  registerHandlers(client);
  return client;
}

function loadCommands(client) {
  const commandsPath = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
  }
}

function registerHandlers(client) {
  client.on(Events.InteractionCreate, async interaction => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
      } else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command?.autocomplete) return;
        await command.autocomplete(interaction);
      }
    } catch (err) {
      console.error(`Error in ${interaction.commandName}:`, err);
      const reply = { content: 'An error occurred.', ephemeral: true };
      if (interaction.isChatInputCommand()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
    }
  });
}

module.exports = { createClient };
