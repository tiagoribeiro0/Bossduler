const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadBosses, addKillEntry } = require('../data');
const { scheduleIntervalBoss } = require('../scheduler');

const TIMEZONE = process.env.TIMEZONE || 'UTC';

function getTZOffset(date, timezone) {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = date.toLocaleString('en-US', { timeZone: timezone });
  return (new Date(utcStr) - new Date(localStr)) / 60000;
}

function zonedToUTC(localISOString, timezone) {
  const fakeUTC = new Date(localISOString + 'Z');
  const offset = getTZOffset(fakeUTC, timezone);
  return new Date(fakeUTC.getTime() - offset * 60000);
}

function parseUserTime(input) {
  const tz = TIMEZONE;
  const now = new Date();

  if (!input) return now;

  const timeOnly = /^(\d{1,2}):(\d{2})$/;
  const dateTime = /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/;

  if (timeOnly.test(input)) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(now);
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    const [, h, m] = input.match(timeOnly);
    return zonedToUTC(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${h.padStart(2,'0')}:${m}:00`, tz);
  }

  if (dateTime.test(input)) {
    const [, day, month, h, m] = input.match(dateTime);
    const year = now.getFullYear();
    return zonedToUTC(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${h.padStart(2,'0')}:${m}:00`, tz);
  }

  throw new Error('Invalid time format. Use `HH:MM` or `dd/MM HH:MM`.');
}

const data = new SlashCommandBuilder()
  .setName('killed')
  .setDescription('Log a boss kill and schedule the respawn alert')
  .addStringOption(opt =>
    opt.setName('boss')
      .setDescription('Which boss was killed')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(opt =>
    opt.setName('time')
      .setDescription('Kill time: HH:MM or dd/MM HH:MM (default: now)')
      .setRequired(false)
  );

async function execute(interaction) {
  const member = interaction.member;
  if (!member.roles.cache.has(process.env.GIGAMU_ROLE_ID)) {
    return interaction.reply({ content: 'You need the **Gigamu** role to use this command.', ephemeral: true });
  }

  const bossId = interaction.options.getString('boss');
  const timeInput = interaction.options.getString('time');

  const { bosses } = loadBosses();
  const boss = bosses.find(b => b.id === bossId);
  if (!boss) {
    return interaction.reply({ content: 'Boss not found. Use `/boss-list` to see available bosses.', ephemeral: true });
  }

  let killedAt;
  try {
    killedAt = parseUserTime(timeInput);
  } catch (err) {
    return interaction.reply({ content: err.message, ephemeral: true });
  }

  const respawnAt = new Date(killedAt.getTime() + boss.respawnHours * 3600 * 1000);
  const spawnTs = Math.floor(respawnAt.getTime() / 1000);

  await addKillEntry({
    bossId: boss.id,
    killedAt: killedAt.toISOString(),
    respawnAt: respawnAt.toISOString(),
  });

  scheduleIntervalBoss(interaction.client, boss, respawnAt);

  const embed = new EmbedBuilder()
    .setTitle(`💀 ${boss.name} killed`)
    .setColor(0x5865F2)
    .addFields(
      { name: 'Killed at', value: `<t:${Math.floor(killedAt.getTime() / 1000)}:F>`, inline: true },
      { name: 'Respawns at', value: `<t:${spawnTs}:F>`, inline: true },
      { name: 'Respawn in', value: `<t:${spawnTs}:R>`, inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const { bosses } = loadBosses();
  const choices = bosses
    .filter(b => b.type === 'interval' && b.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(b => ({ name: b.name, value: b.id }));
  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };
