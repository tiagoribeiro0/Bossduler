const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadBosses, loadKills } = require('../data');

const TIMEZONE = process.env.TIMEZONE || 'UTC';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function nextFixedSpawnTs(scheduleTime, days) {
  const [h, m] = scheduleTime.split(':').map(Number);
  const now = new Date();

  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setSeconds(0, 0);

    const localParts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short',
    }).formatToParts(candidate);

    const get = type => localParts.find(p => p.type === type).value;
    const localDayName = get('weekday'); // "Mon", "Tue", etc.
    const localDayNum = DAY_NAMES.indexOf(localDayName);

    if (days && !days.includes(localDayNum)) continue;

    const year = get('year');
    const month = get('month');
    const day = get('day');

    const localISO = `${year}-${month}-${day}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
    const fakeUTC = new Date(localISO + 'Z');
    const utcStr = fakeUTC.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = fakeUTC.toLocaleString('en-US', { timeZone: TIMEZONE });
    const offsetMs = (new Date(utcStr) - new Date(localStr));
    const spawnDate = new Date(fakeUTC.getTime() - offsetMs);

    if (spawnDate > now) return Math.floor(spawnDate.getTime() / 1000);
  }
  return null;
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
      const daysLabel = boss.days ? boss.days.map(d => DAY_NAMES[d]).join(', ') : 'Every day';
      const scheduleLines = (boss.schedules || []).map(s => {
        const ts = nextFixedSpawnTs(s, boss.days || null);
        return ts ? `\`${s}\` → <t:${ts}:F> (<t:${ts}:R>)` : `\`${s}\``;
      }).join('\n') || 'No schedules set';
      const importantTag = boss.important ? ' ⭐' : '';
      embed.addFields({ name: `🗓️ ${boss.name}${importantTag}`, value: `**Days:** ${daysLabel}\n${scheduleLines}` });
    } else {
      const timer = timerMap[boss.id];
      let value = `Respawns **${boss.respawnHours}h** after kill`;
      if (timer) {
        const ts = Math.floor(new Date(timer.respawnAt).getTime() / 1000);
        value += `\n⏳ Next spawn: <t:${ts}:F> (<t:${ts}:R>)`;
      } else {
        value += '\nNo active timer — use `/killed` after a kill';
      }
      const importantTag = boss.important ? ' ⭐' : '';
      embed.addFields({ name: `⚔️ ${boss.name}${importantTag}`, value });
    }
  }

  await interaction.reply({ embeds: [embed] });
}

module.exports = { data, execute };
