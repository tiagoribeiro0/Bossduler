const schedule = require('node-schedule');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadBosses, loadKills, addKillEntry, removeKillEntry } = require('./data');

const activeJobs = new Map();
const TIMEZONE = process.env.TIMEZONE || 'UTC';

function cancelBossJobs(bossId) {
  for (const [key, job] of activeJobs) {
    if (key.startsWith(`${bossId}:`)) {
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

  const config = {
    early: { title: `⭐ ${boss.name} spawning in 1 hour!`, color: 0x5865F2, desc: `**${boss.name}** spawns at ${timeTag} — in 1 hour` },
    warn:  { title: `⚠️ ${boss.name} spawning soon!`,      color: 0xFFA500, desc: `**${boss.name}** spawns at ${timeTag} (in ~5 minutes)` },
    spawn: { title: `🔴 ${boss.name} is NOW spawning!`,    color: 0xFF0000, desc: `**${boss.name}** spawns NOW — ${timeTag}` },
  }[type];

  const embed = new EmbedBuilder()
    .setTitle(config.title)
    .setColor(config.color)
    .setDescription(config.desc)
    .setTimestamp();

  const components = boss.type === 'interval'
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`killed:${boss.id}`)
          .setLabel('✅ Killed Now')
          .setStyle(ButtonStyle.Danger)
      )]
    : [];

  await channel.send({ content: roleTag, embeds: [embed], components });

  if (type === 'spawn' && boss.type === 'interval') {
    setTimeout(async () => {
      const { activeTimers } = loadKills();
      if (activeTimers.some(t => t.bossId === boss.id)) return;

      const killedAt = new Date(spawnTimestamp * 1000);
      const respawnAt = new Date(killedAt.getTime() + boss.respawnHours * 3600 * 1000);
      const nextSpawnTs = Math.floor(respawnAt.getTime() / 1000);

      await addKillEntry({ bossId: boss.id, killedAt: killedAt.toISOString(), respawnAt: respawnAt.toISOString() });
      scheduleIntervalBoss(client, boss, respawnAt);

      const autoEmbed = new EmbedBuilder()
        .setTitle(`⏱️ ${boss.name} — timer auto-started`)
        .setColor(0x808080)
        .setDescription(`No kill confirmed after 10 min. Timer started from spawn time.\nNext spawn: <t:${nextSpawnTs}:F> (<t:${nextSpawnTs}:R>)`)
        .setTimestamp();
      await channel.send({ embeds: [autoEmbed] });
    }, 10 * 60 * 1000);
  }
}

function scheduleIntervalBoss(client, boss, respawnAt) {
  cancelBossJobs(boss.id);

  const now = new Date();
  const spawnTs = Math.floor(respawnAt.getTime() / 1000);

  if (boss.important) {
    const earlyAt = new Date(respawnAt.getTime() - 60 * 60 * 1000);
    if (earlyAt > now) {
      const earlyJob = schedule.scheduleJob(earlyAt, async () => {
        await sendBossAlert(client, boss, 'early', spawnTs);
      });
      if (earlyJob) activeJobs.set(`${boss.id}:early`, earlyJob);
    }
  }

  const warnAt = new Date(respawnAt.getTime() - 5 * 60 * 1000);
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
      activeJobs.delete(`${boss.id}:early`);
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
    const jobKey = `${timeStr}`;

    const spawnRule = new schedule.RecurrenceRule();
    spawnRule.tz = TIMEZONE;
    spawnRule.hour = hour;
    spawnRule.minute = minute;
    spawnRule.second = 0;
    if (boss.days) spawnRule.dayOfWeek = boss.days;

    const warnRule = new schedule.RecurrenceRule();
    warnRule.tz = TIMEZONE;
    const warnMinutes = (hour * 60 + minute - 5 + 1440) % 1440;
    warnRule.hour = Math.floor(warnMinutes / 60);
    warnRule.minute = warnMinutes % 60;
    warnRule.second = 0;
    if (boss.days) {
      // warn may cross midnight — adjust days if warn time is next day
      warnRule.dayOfWeek = (hour * 60 + minute - 5) < 0
        ? boss.days.map(d => (d + 6) % 7)
        : boss.days;
    }

    const spawnJob = schedule.scheduleJob(spawnRule, async () => {
      const spawnTs = Math.floor(Date.now() / 1000);
      await sendBossAlert(client, boss, 'spawn', spawnTs);
    });
    if (spawnJob) activeJobs.set(`${boss.id}:${jobKey}:spawn`, spawnJob);

    const warnJob = schedule.scheduleJob(warnRule, async () => {
      const next = spawnJob?.nextInvocation();
      const spawnTs = next ? Math.floor(next.getTime() / 1000) : Math.floor(Date.now() / 1000) + 300;
      await sendBossAlert(client, boss, 'warn', spawnTs);
    });
    if (warnJob) activeJobs.set(`${boss.id}:${jobKey}:warn`, warnJob);

    if (boss.important) {
      const earlyRule = new schedule.RecurrenceRule();
      earlyRule.tz = TIMEZONE;
      const earlyMinutes = (hour * 60 + minute - 60 + 1440) % 1440;
      earlyRule.hour = Math.floor(earlyMinutes / 60);
      earlyRule.minute = earlyMinutes % 60;
      earlyRule.second = 0;
      if (boss.days) {
        earlyRule.dayOfWeek = (hour * 60 + minute - 60) < 0
          ? boss.days.map(d => (d + 6) % 7)
          : boss.days;
      }
      const earlyJob = schedule.scheduleJob(earlyRule, async () => {
        const next = spawnJob?.nextInvocation();
        const spawnTs = next ? Math.floor(next.getTime() / 1000) : Math.floor(Date.now() / 1000) + 3600;
        await sendBossAlert(client, boss, 'early', spawnTs);
      });
      if (earlyJob) activeJobs.set(`${boss.id}:${jobKey}:early`, earlyJob);
    }
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
