const fs = require('fs');
const ical = require('ical-toolkit');

const CONFIG_FILE = 'config.json';
const HISTORY_FILE = 'history.json';
const CYCLE_LENGTH_DAYS = 7;
const DAY_TO_MS = 24 * 60 * 60 * 1000;
const CYCLE_LENGTH_MS = CYCLE_LENGTH_DAYS * DAY_TO_MS;

function readConfig() {
  const data = fs.readFileSync(CONFIG_FILE);
  const { triagers, components } = JSON.parse(data);
  return {
    triagers,
    components
  };
}

function readHistory() {
  const data = fs.readFileSync(HISTORY_FILE);
  const history = JSON.parse(data);
  return {
    dutyCycles: history['duty-start-dates']
  };
}

function writeHistory(json) {
  const data = JSON.stringify(json, undefined, '  ');
  fs.writeFileSync(HISTORY_FILE, data);
}

function selectRandom(arr, n) {
  const result = [];
  const taken = [];
  let len = arr.length;

  if (n > len) {
    throw `FATAL ERROR: Cannot select ${n} items from array with length ${arr.length}`;
  }

  while (n--) {
    let idx = Math.floor(Math.random() * len);
    result[n] = arr[idx in taken ? taken[idx] : idx];
    taken[idx] = --len in taken ? taken[len] : len;
  }

  return result;
}

function generateDutyCycle({ dutyCycleHistory }) {
  const { triagers: triagersData, components } = readConfig();
  const dutyDates = Object.keys(dutyCycleHistory).sort();

  if (dutyDates.length < 1) {
    throw '\nFATAL ERROR: No existing valid duty cycle history!';
  }

  const lastDutyDate = dutyDates.slice(-1)[0];
  const lastTriagePair = Object.keys(dutyCycleHistory[lastDutyDate]);

  if (!Array.isArray(lastTriagePair) || lastTriagePair.length !== 2) {
    throw '\nFATAL ERROR: Invalid triager data in duty cycle history!';
  }

  const triagers = Object.keys(triagersData);
  const lastTriagerIdx = triagers.indexOf(lastTriagePair[1]);
  if (lastTriagerIdx === -1) {
    throw `\nFATAL ERROR: Unable to find ${lastTriagePair[1]} in config.json`;
  }

  const nextTriagerIdx = (lastTriagerIdx + 1) % triagers.length;
  const nextDutyDateMS = new Date(lastDutyDate).getTime() + CYCLE_LENGTH_MS;
  const nextTriagePair = [triagers[nextTriagerIdx], triagers[(nextTriagerIdx +1 ) % triagers.length]];
  const nextDutyDate = new Date(nextDutyDateMS).toISOString().replace(/T.*$/, "");
  const firstComponentSet = selectRandom(components, Math.floor(components.length / 2));
  const secondComponentSet = components.filter(c => firstComponentSet.indexOf(c) === -1);
  const dutyCycle = {};
  dutyCycle[nextTriagePair[0]] = firstComponentSet;
  dutyCycle[nextTriagePair[1]] = secondComponentSet;

  return {
    date: nextDutyDate,
    dutyCycle
  };
}

function commandUpdate() {
  const { dutyCycles: dutyCycleHistory } = readHistory();
  const { date, dutyCycle } = generateDutyCycle({ dutyCycleHistory });

  dutyCycleHistory[date] = dutyCycle;
  writeHistory(dutyCycleHistory);
}

let args = process.argv.slice(2);
let command = args.shift();

switch (command) {
  case 'update': {
    commandUpdate();
    break;
  }
}