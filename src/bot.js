const { Client, GatewayIntentBits, Events, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
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
      } else if (interaction.isButton()) {
        await handleButton(interaction);
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

async function handleButton(interaction) {
  const [action, bossId] = interaction.customId.split(':');
  if (action !== 'killed') return;

  const member = interaction.member;
  if (!member.roles.cache.has(process.env.GIGAMU_ROLE_ID)) {
    return interaction.reply({ content: 'You need the **Gigamu** role to use this.', ephemeral: true });
  }

  const { loadBosses, addKillEntry } = require('./data');
  const { scheduleIntervalBoss } = require('./scheduler');

  const { bosses } = loadBosses();
  const boss = bosses.find(b => b.id === bossId);
  if (!boss) return interaction.reply({ content: 'Boss not found.', ephemeral: true });

  const killedAt = new Date();
  const respawnAt = new Date(killedAt.getTime() + boss.respawnHours * 3600 * 1000);
  const spawnTs = Math.floor(respawnAt.getTime() / 1000);

  await addKillEntry({ bossId: boss.id, killedAt: killedAt.toISOString(), respawnAt: respawnAt.toISOString() });
  scheduleIntervalBoss(interaction.client, boss, respawnAt);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`killed:${boss.id}`)
      .setLabel(`✅ Killed by ${member.displayName}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
  await interaction.update({ components: [disabledRow] });

  const embed = new EmbedBuilder()
    .setTitle(`💀 ${boss.name} killed`)
    .setColor(0x5865F2)
    .addFields(
      { name: 'Respawns at', value: `<t:${spawnTs}:F>`, inline: true },
      { name: 'Countdown', value: `<t:${spawnTs}:R>`, inline: false },
    )
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}

module.exports = { createClient };
