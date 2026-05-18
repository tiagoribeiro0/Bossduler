const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadBosses, saveBosses, removeKillEntry } = require('../data');
const { cancelBossJobs } = require('../scheduler');

const data = new SlashCommandBuilder()
  .setName('remove-boss')
  .setDescription('Remove a boss from the tracker')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt.setName('boss')
      .setDescription('Boss to remove')
      .setRequired(true)
      .setAutocomplete(true)
  );

async function execute(interaction) {
  const bossId = interaction.options.getString('boss');
  const bossData = loadBosses();
  const boss = bossData.bosses.find(b => b.id === bossId);

  if (!boss) {
    return interaction.reply({ content: 'Boss not found.', ephemeral: true });
  }

  bossData.bosses = bossData.bosses.filter(b => b.id !== bossId);
  await saveBosses(bossData);
  cancelBossJobs(bossId);
  await removeKillEntry(bossId);

  const embed = new EmbedBuilder()
    .setTitle(`🗑️ Boss removed: ${boss.name}`)
    .setColor(0xED4245)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const { bosses } = loadBosses();
  const choices = bosses
    .filter(b => b.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(b => ({ name: b.name, value: b.id }));
  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };
