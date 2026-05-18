const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadBosses, loadKills } = require('../data');

const TIMEZONE = process.env.TIMEZONE || 'UTC';

function nextFixedSpawnTs(scheduleTime) {
  const [h, m] = scheduleTime.split(':').map(Number);
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now);

  const get = type => parts.find(p => p.type === type).value;
  const todayLocal = new Date(`${get('year')}-${get('month')}-${get('day')}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);

  const offsetMs = now.getTime() - new Date(new Date().toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
    + new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE })).getTime() - now.getTime();

  const candidate = new Date(todayLocal.getTime() - offsetMs);
  if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
  return Math.floor(candidate.getTime() / 1000);
}

const data = new SlashCommandBuilder()
  .setName('boss-list')
  .setDescription('List all tracked bosses and their schedules');

async function execute(interaction) {
  const { bosses } = loadBosses();
  const { activeTimers } = loadKills();

  if (bosses.length === 0) {
    return interaction.reply({ content: 'No bosses tracked yet. Use `/add-boss` to add one.', ephemeral: true });
  }

  const timerMap = Object.fromEntries(activeTimers.map(t => [t.bossId, t]));

  const embed = new EmbedBuilder()
    .setTitle('📋 Boss Tracker')
    .setColor(0x5865F2)
    .setTimestamp()
    .setFooter({ text: `Timezone: ${TIMEZONE}` });

  for (const boss of bosses) {
    if (boss.type === 'fixed') {
      const schedules = (boss.schedules || []).map(s => {
        const ts = nextFixedSpawnTs(s);
        return `\`${s}\` → <t:${ts}:F> (<t:${ts}:R>)`;
      }).join('\n') || 'No schedules set';
      embed.addFields({ name: `🗓️ ${boss.name}`, value: schedules });
    } else {
      const timer = timerMap[boss.id];
      let value = `Respawns **${boss.respawnHours}h** after kill`;
      if (timer) {
        const ts = Math.floor(new Date(timer.respawnAt).getTime() / 1000);
        value += `\n⏳ Next spawn: <t:${ts}:F> (<t:${ts}:R>)`;
      } else {
        value += '\nNo active timer — use `/killed` after a kill';
      }
      embed.addFields({ name: `⚔️ ${boss.name}`, value });
    }
  }

  await interaction.reply({ embeds: [embed] });
}

module.exports = { data, execute };
