require('dotenv').config();

const { REST, Routes } = require('@discordjs/rest');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');

for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const { data } = require(path.join(commandsPath, file));
  commands.push(data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash commands...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log('Commands registered successfully.');
  } catch (err) {
    console.error(err);
  }
})();
