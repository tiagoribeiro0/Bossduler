const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadBosses, loadKills } = require('../data');

const data = new SlashCommandBuilder()
  .setName('buttons')
  .setDescription('Show kill buttons for all active boss timers');

async function execute(interaction) {
  const { bosses } = loadBosses();
  const { activeTimers } = loadKills();

  const active = activeTimers
    .map(t => ({ timer: t, boss: bosses.find(b => b.id === t.bossId && b.type === 'interval') }))
    .filter(({ boss }) => boss);

  if (active.length === 0) {
    return interaction.reply({ content: 'No active boss timers.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('🔴 Active Boss Timers')
    .setColor(0x5865F2)
    .addFields(active.map(({ boss, timer }) => {
      const spawnTs = Math.floor(new Date(timer.respawnAt).getTime() / 1000);
      return { name: boss.name, value: `Spawns <t:${spawnTs}:F> — <t:${spawnTs}:R>`, inline: false };
    }))
    .setTimestamp();

  const rows = [];
  for (let i = 0; i < Math.min(active.length, 25); i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      active.slice(i, i + 5).map(({ boss }) =>
        new ButtonBuilder()
          .setCustomId(`killed:${boss.id}`)
          .setLabel(`✅ ${boss.name}`)
          .setStyle(ButtonStyle.Danger)
      )
    ));
  }

  await interaction.reply({ embeds: [embed], components: rows });
}

module.exports = { data, execute };
