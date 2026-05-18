const schedule = require('node-schedule');
const { EmbedBuilder } = require('discord.js');
const { loadBosses, loadKills, removeKillEntry } = require('./data');

const activeJobs = new Map();
const TIMEZONE = process.env.TIMEZONE || 'UTC';

function cancelBossJobs(bossId) {
  for (const key of [`${bossId}:warn`, `${bossId}:spawn`]) {
    const job = activeJobs.get(key);
    if (job) {
      job.cancel();
      activeJobs.delete(key);
    }
  }
}

async function sendBossAlert(client, boss, type, spawnTimestamp) {
  const channel = await client.channels.fetch(process.env.ALERT_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const roleTag = `<@&${process.env.GIGAMU_ROLE_ID}>`;
  const timeTag = `<t:${spawnTimestamp}:F>`;

  const embed = new EmbedBuilder()
    .setTitle(type === 'warn' ? `⚠️ ${boss.name} spawning soon!` : `🔴 ${boss.name} is NOW spawning!`)
    .setColor(type === 'warn' ? 0xFFA500 : 0xFF0000)
    .setDescription(
      type === 'warn'
        ? `**${boss.name}** spawns at ${timeTag} (in ~5 minutes)`
        : `**${boss.name}** spawns NOW — ${timeTag}`
    )
    .setTimestamp();

  await channel.send({ content: roleTag, embeds: [embed] });
}

function scheduleIntervalBoss(client, boss, respawnAt) {
  cancelBossJobs(boss.id);

  const now = new Date();
  const warnAt = new Date(respawnAt.getTime() - 5 * 60 * 1000);
  const spawnTs = Math.floor(respawnAt.getTime() / 1000);

  if (warnAt > now) {
    const warnJob = schedule.scheduleJob(warnAt, async () => {
      await sendBossAlert(client, boss, 'warn', spawnTs);
    });
    if (warnJob) activeJobs.set(`${boss.id}:warn`, warnJob);
  }

  if (respawnAt > now) {
    const spawnJob = schedule.scheduleJob(respawnAt, async () => {
      await sendBossAlert(client, boss, 'spawn', spawnTs);
      await removeKillEntry(boss.id);
      activeJobs.delete(`${boss.id}:warn`);
      activeJobs.delete(`${boss.id}:spawn`);
    });
    if (spawnJob) activeJobs.set(`${boss.id}:spawn`, spawnJob);
  }
}

function scheduleFixedBoss(client, boss) {
  cancelBossJobs(boss.id);

  for (const timeStr of boss.schedules || []) {
    const [hour, minute] = timeStr.split(':').map(Number);

    const spawnRule = new schedule.RecurrenceRule();
    spawnRule.tz = TIMEZONE;
    spawnRule.hour = hour;
    spawnRule.minute = minute;
    spawnRule.second = 0;

    const warnRule = new schedule.RecurrenceRule();
    warnRule.tz = TIMEZONE;
    const warnMinutes = (hour * 60 + minute - 5 + 1440) % 1440;
    warnRule.hour = Math.floor(warnMinutes / 60);
    warnRule.minute = warnMinutes % 60;
    warnRule.second = 0;

    const spawnJob = schedule.scheduleJob(spawnRule, async () => {
      const spawnTs = Math.floor(Date.now() / 1000);
      await sendBossAlert(client, boss, 'spawn', spawnTs);
    });
    if (spawnJob) activeJobs.set(`${boss.id}:spawn`, spawnJob);

    const warnJob = schedule.scheduleJob(warnRule, async () => {
      const next = spawnJob?.nextInvocation();
      const spawnTs = next ? Math.floor(next.getTime() / 1000) : Math.floor(Date.now() / 1000) + 300;
      await sendBossAlert(client, boss, 'warn', spawnTs);
    });
    if (warnJob) activeJobs.set(`${boss.id}:warn`, warnJob);
  }
}

async function initScheduler(client) {
  const { bosses } = loadBosses();

  for (const boss of bosses) {
    if (boss.type === 'fixed') {
      scheduleFixedBoss(client, boss);
    }
  }

  const { activeTimers } = loadKills();
  const now = new Date();
  const bossMap = Object.fromEntries(bosses.map(b => [b.id, b]));

  for (const timer of activeTimers) {
    const boss = bossMap[timer.bossId];
    if (!boss) {
      await removeKillEntry(timer.bossId);
      continue;
    }

    const respawnAt = new Date(timer.respawnAt);

    if (respawnAt <= now) {
      const channel = await client.channels.fetch(process.env.ALERT_CHANNEL_ID).catch(() => null);
      if (channel) {
        const roleTag = `<@&${process.env.GIGAMU_ROLE_ID}>`;
        const embed = new EmbedBuilder()
          .setTitle(`⚠️ Missed spawn: ${boss.name}`)
          .setColor(0xFFFF00)
          .setDescription(`Bot was offline. **${boss.name}** may have spawned at <t:${Math.floor(respawnAt.getTime() / 1000)}:F>.`)
          .setTimestamp();
        await channel.send({ content: roleTag, embeds: [embed] });
      }
      await removeKillEntry(timer.bossId);
      continue;
    }

    scheduleIntervalBoss(client, boss, respawnAt);
  }
}

module.exports = { initScheduler, scheduleFixedBoss, scheduleIntervalBoss, cancelBossJobs };
