const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const BOSSES_PATH = path.join(DATA_DIR, 'bosses.json');
const KILLS_PATH = path.join(DATA_DIR, 'kills.json');

function initDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BOSSES_PATH)) fs.writeFileSync(BOSSES_PATH, JSON.stringify({ bosses: [] }, null, 2));
  if (!fs.existsSync(KILLS_PATH)) fs.writeFileSync(KILLS_PATH, JSON.stringify({ activeTimers: [] }, null, 2));
}

initDataDir();

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function writeJSON(filePath, data) {
  const tmp = filePath + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.promises.rename(tmp, filePath);
}

function loadBosses() {
  return readJSON(BOSSES_PATH);
}

async function saveBosses(data) {
  await writeJSON(BOSSES_PATH, data);
}

function loadKills() {
  return readJSON(KILLS_PATH);
}

async function saveKills(data) {
  await writeJSON(KILLS_PATH, data);
}

async function addKillEntry(entry) {
  const data = loadKills();
  data.activeTimers = data.activeTimers.filter(t => t.bossId !== entry.bossId);
  data.activeTimers.push(entry);
  await saveKills(data);
}

async function removeKillEntry(bossId) {
  const data = loadKills();
  data.activeTimers = data.activeTimers.filter(t => t.bossId !== bossId);
  await saveKills(data);
}

module.exports = { loadBosses, saveBosses, loadKills, saveKills, addKillEntry, removeKillEntry };
