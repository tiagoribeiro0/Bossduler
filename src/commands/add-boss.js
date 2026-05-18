const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadBosses, saveBosses } = require('../data');
const { scheduleFixedBoss } = require('../scheduler');

const data = new SlashCommandBuilder()
  .setName('add-boss')
  .setDescription('Add a boss or invasion to the tracker')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt.setName('name').setDescription('Boss name').setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('type')
      .setDescription('Schedule type')
      .setRequired(true)
      .addChoices(
        { name: 'Fixed daily time', value: 'fixed' },
        { name: 'Interval after kill', value: 'interval' },
      )
  )
  .addStringOption(opt =>
    opt.setName('schedule')
      .setDescription('Spawn time HH:MM in server timezone (required for fixed type)')
      .setRequired(false)
  )
  .addNumberOption(opt =>
    opt.setName('respawn_hours')
      .setDescription('Hours until respawn after kill (required for interval type)')
      .setRequired(false)
      .setMinValue(0.1)
  );

async function execute(interaction) {
  const name = interaction.options.getString('name');
  const type = interaction.options.getString('type');
  const scheduleTime = interaction.options.getString('schedule');
  const respawnHours = interaction.options.getNumber('respawn_hours');

  if (type === 'fixed' && !scheduleTime) {
    return interaction.reply({ content: 'Fixed bosses require a `schedule` time (HH:MM).', ephemeral: true });
  }
  if (type === 'interval' && !respawnHours) {
    return interaction.reply({ content: 'Interval bosses require `respawn_hours`.', ephemeral: true });
  }
  if (type === 'fixed' && !/^\d{1,2}:\d{2}$/.test(scheduleTime)) {
    return interaction.reply({ content: 'Invalid schedule format. Use `HH:MM`.', ephemeral: true });
  }

  const bossData = loadBosses();
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  if (bossData.bosses.find(b => b.id === id)) {
    return interaction.reply({ content: `Boss \`${id}\` already exists. Remove it first or use a different name.`, ephemeral: true });
  }

  const newBoss = { id, name };
  if (type === 'fixed') {
    newBoss.type = 'fixed';
    newBoss.schedules = [scheduleTime];
  } else {
    newBoss.type = 'interval';
    newBoss.respawnHours = respawnHours;
  }

  bossData.bosses.push(newBoss);
  await saveBosses(bossData);

  if (type === 'fixed') {
    scheduleFixedBoss(interaction.client, newBoss);
  }

  const embed = new EmbedBuilder()
    .setTitle(`✅ Boss added: ${name}`)
    .setColor(0x57F287)
    .addFields(
      { name: 'Type', value: type === 'fixed' ? 'Fixed daily' : 'Interval after kill', inline: true },
      type === 'fixed'
        ? { name: 'Schedule', value: `${scheduleTime} (${process.env.TIMEZONE || 'UTC'})`, inline: true }
        : { name: 'Respawn', value: `${respawnHours}h after kill`, inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

module.exports = { data, execute };
