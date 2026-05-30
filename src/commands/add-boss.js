const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadBosses, saveBosses } = require('../data');
const { scheduleFixedBoss } = require('../scheduler');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MAP = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function parseDays(input) {
  return input.split(',').map(s => {
    const token = s.trim().toLowerCase();
    if (/^\d$/.test(token)) {
      const n = parseInt(token);
      if (n >= 0 && n <= 6) return n;
    }
    if (DAY_MAP[token] !== undefined) return DAY_MAP[token];
    return null;
  });
}

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
      .setDescription('Spawn time(s) HH:MM — comma-separated for multiple (e.g. 08:00,20:00). Fixed type only.')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('days')
      .setDescription('Days of week — comma-separated (e.g. monday,friday or mon,fri). Omit for every day.')
      .setRequired(false)
  )
  .addNumberOption(opt =>
    opt.setName('respawn_hours')
      .setDescription('Hours until respawn after kill (required for interval type)')
      .setRequired(false)
      .setMinValue(0.1)
  )
  .addBooleanOption(opt =>
    opt.setName('important')
      .setDescription('Mark as important — sends an extra alert 1 hour before spawn')
      .setRequired(false)
  );

async function execute(interaction) {
  const name = interaction.options.getString('name');
  const type = interaction.options.getString('type');
  const scheduleTime = interaction.options.getString('schedule');
  const daysInput = interaction.options.getString('days');
  const respawnHours = interaction.options.getNumber('respawn_hours');
  const important = interaction.options.getBoolean('important') ?? false;

  if (type === 'fixed' && !scheduleTime) {
    return interaction.reply({ content: 'Fixed bosses require a `schedule` time (e.g. `08:00` or `08:00,20:00`).', ephemeral: true });
  }
  if (type === 'interval' && !respawnHours) {
    return interaction.reply({ content: 'Interval bosses require `respawn_hours`.', ephemeral: true });
  }

  const schedules = scheduleTime ? scheduleTime.split(',').map(s => s.trim()) : [];

  if (type === 'fixed') {
    const invalid = schedules.filter(s => !/^\d{1,2}:\d{2}$/.test(s));
    if (invalid.length) {
      return interaction.reply({ content: `Invalid time(s): \`${invalid.join(', ')}\`. Use \`HH:MM\` format.`, ephemeral: true });
    }
  }

  let days = null;
  if (daysInput) {
    const parsed = parseDays(daysInput);
    const invalid = parsed.filter(d => d === null);
    if (invalid.length) {
      return interaction.reply({ content: `Invalid day(s) in \`${daysInput}\`. Use day names (monday, tue, etc.) or numbers 0-6.`, ephemeral: true });
    }
    days = [...new Set(parsed)].sort();
  }

  const bossData = loadBosses();
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  if (bossData.bosses.find(b => b.id === id)) {
    return interaction.reply({ content: `Boss \`${id}\` already exists. Remove it first or use a different name.`, ephemeral: true });
  }

  const newBoss = { id, name };
  if (type === 'fixed') {
    newBoss.type = 'fixed';
    newBoss.schedules = schedules;
    if (days) newBoss.days = days;
  } else {
    newBoss.type = 'interval';
    newBoss.respawnHours = respawnHours;
  }
  if (important) newBoss.important = true;

  bossData.bosses.push(newBoss);
  await saveBosses(bossData);

  if (type === 'fixed') {
    scheduleFixedBoss(interaction.client, newBoss);
  }

  const daysLabel = days ? days.map(d => DAY_NAMES[d]).join(', ') : 'Every day';

  const embed = new EmbedBuilder()
    .setTitle(`✅ Boss added: ${name}`)
    .setColor(0x57F287)
    .addFields(
      { name: 'Type', value: type === 'fixed' ? 'Fixed' : 'Interval after kill', inline: true },
      type === 'fixed'
        ? { name: 'Schedule', value: `${schedules.join(', ')} (${process.env.TIMEZONE || 'UTC'})`, inline: true }
        : { name: 'Respawn', value: `${respawnHours}h after kill`, inline: true },
    )
    .setTimestamp();

  if (type === 'fixed') {
    embed.addFields({ name: 'Days', value: daysLabel, inline: true });
  }
  if (important) {
    embed.addFields({ name: 'Important', value: '⭐ 1h early alert enabled', inline: true });
  }

  await interaction.reply({ embeds: [embed] });
}

module.exports = { data, execute };
