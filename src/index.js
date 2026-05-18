require('dotenv').config();

const REQUIRED_ENV = ['BOT_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'ALERT_CHANNEL_ID', 'GIGAMU_ROLE_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const { createClient } = require('./bot');
const { initScheduler } = require('./scheduler');

const client = createClient();

client.once('ready', async () => {
  console.log(`Ready as ${client.user.tag}`);
  await initScheduler(client);
});

client.login(process.env.BOT_TOKEN);
