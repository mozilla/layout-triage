const fs = require('fs');
const ical = require('ical-toolkit');

const DIST_DIR = 'dist';
const CONFIG_FILE = 'config.json';
const HISTORY_FILE = 'history.json';
const TRIAGERS_KEY = 'triagers';
const ICAL_FILE = 'layout-triage.ics';
const INDENT = '  ';
const DUTY_START_DATES_KEY = 'duty-start-dates';
const CYCLE_LENGTH_DAYS = 7;
const DAY_TO_MS = 24 * 60 * 60 * 1000;
const CYCLE_LENGTH_MS = CYCLE_LENGTH_DAYS * DAY_TO_MS;

/**
 * Return the parsed results from the config file. Reads file synchronously.
 */
function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE));
}

/**
 * Write the given JSON object to the history file.
 * @param {*} json 
 */
function writeToHistory(json) {
  const data = JSON.stringify(json, undefined, INDENT);
  fs.writeFileSync(HISTORY_FILE, data);
}

/**
 * Given a date, return the date of the Monday preceding it.
 * @param {Date} date 
 */
function getLastMonday(date) {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date();
  monday.setDate(diff);

  return monday;
}

function appendDutyCycle({ component, date, triagerName, triagerData }) {
  const filePath = `${DIST_DIR}/${component}.json`;
  let data = fs.readFileSync(filePath);
  const calendar = JSON.parse(data);

  const triagers = calendar[TRIAGERS_KEY];
  const dutyStartDates = calendar[DUTY_START_DATES_KEY];
  if (!dutyStartDates || !triagers) {
    throw `\nFATAL ERROR: Invalid data in calendar ${component}.json`;
  }

  if (!triagers[triagerName]) {
    triagers[triagerName] = triagerData;
  }

  dutyStartDates[date] = triagerName;

  data = JSON.stringify(calendar, undefined, '  ');
  fs.writeFileSync(filePath, data);
}

/**
 * Given an array, select n random items from the array,
 * 
 * @param {} arr The array from which to select items.
 * @param {*} n The number of items to select.
 */
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

/**
 * Given a duty cycle history object, return the most recent cycle.
 * 
 * @param {*} params 
 *   @param {*} params.dutyCycleHistory The duty cycle history as formatted in the history file.
 */
function getLastDutyCycle({ dutyCycleHistory }) {
  const dutyDates = Object.keys(dutyCycleHistory).sort();
  if (dutyDates.length < 1) {
    return {};
  }

  const lastDutyDate = dutyDates.slice(-1)[0];
  if (!dutyCycleHistory[lastDutyDate]) {
    throw `\nFATAL ERROR: Invalid data in history file!`;
  }

  const lastTriagePair = Object.keys(dutyCycleHistory[lastDutyDate]);
  return {
    lastDutyDate,
    lastTriagePair
  }
}

function generateICALFile({ dutyCycleHistory }) {
  const builder = ical.createIcsFileBuilder();

  builder.calname = 'Layout Triage';
  builder.timezone = 'America/Los_Angeles';
  builder.tzid = 'America/Los_Angeles';
  builder.additionalTags = {
    'REFRESH-INTERVAL': 'VALUE=DURATION:P1H',
    'X-WR-CALDESC': 'Layout Triage'
  };

  for (let dutyCycleDate in dutyCycleHistory) {
    const triagers = Object.keys(dutyCycleHistory[dutyCycleDate]);
    const dutyCycleDateMs = new Date(dutyCycleDate).getTime();

    builder.events.push({
      start: new Date(dutyCycleDateMs),
      end: new Date(dutyCycleDateMs + CYCLE_LENGTH_MS),
      summary: `Triage Duty: ${triagers.join(', ')}`,
      description: ``,
      allDay: true
    });
  }

  const data = builder.toString();
  fs.writeFileSync(`${DIST_DIR}/${ICAL_FILE}`, data);
}

function generateDutyCycle({ dutyCycleHistory, triagersData, components }) {
  let { lastDutyDate, lastTriagePair } = getLastDutyCycle({ dutyCycleHistory })
  let lastTriagerIdx = -1;
  const triagers = Object.keys(triagersData);
  const createDateString = date => {
    return date.toISOString().replace(/T.*$/, '');
  }

  if (!lastDutyDate || !Array.isArray(lastTriagePair) || lastTriagePair.length !== 2) {
    console.warn('No existing duty cycle history. Generating first cycle.');
    lastDutyDate = createDateString(getLastMonday(new Date()));
  } else {
    lastTriagerIdx = triagers.indexOf(lastTriagePair[1]);
    if (lastTriagerIdx === -1) {
      console.warn(`Unable to find triager named ${lastTriagePair[1]} in config. Starting over from first triager.`);
    }
  }

  const nextTriagerIdx = (lastTriagerIdx + 1) % triagers.length;
  const nextDutyDateMS = new Date(lastDutyDate).getTime() + CYCLE_LENGTH_MS;
  const nextTriagePair = [triagers[nextTriagerIdx], triagers[(nextTriagerIdx +1 ) % triagers.length]];
  const nextDutyDate = createDateString(new Date(nextDutyDateMS));
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

function runUpdate() {
  const { triagers: triagersData, components } = readConfig();
  const { dutyCycleHistory } = JSON.parse(fs.readFileSync(HISTORY_FILE));
  const { date, dutyCycle } = generateDutyCycle({ dutyCycleHistory, triagersData, components });

  function updateJSONCalendars() {
    const newDutyCycleTriagers = Object.keys(dutyCycle);
    newDutyCycleTriagers.forEach(triager => {
      const components = dutyCycle[triager];
      components.forEach(component => {
        appendDutyCycle({ component, date, triagerName: triager, triagerData: triagersData[triager] });
      });
    });
  }

  dutyCycleHistory[date] = dutyCycle;

  updateJSONCalendars();
  writeToHistory({ dutyCycleHistory });
  generateICALFile({ dutyCycleHistory });
}

/**
 * Reset all existing data, leaving one duty cycle in the history to serve as a
 * seed for the next cycle.
 */
function runReset() {
  const { components } = readConfig();
  const resetData = {};
  resetData[TRIAGERS_KEY] = {};
  resetData[DUTY_START_DATES_KEY] = {};
  const resetDataString = JSON.stringify(resetData, undefined, INDENT);

  components.forEach(component => {
    const filePath = `${DIST_DIR}/${component}.json`;
    fs.writeFileSync(filePath, resetDataString);
  });

  writeToHistory({ dutyCycleHistory: {} });
  generateICALFile({ dutyCycleHistory: {} });
}

let args = process.argv.slice(2);
let command = args.shift();

switch (command) {
  case 'update': {
    runUpdate();
    break;
  }

  case 'reset': {
    runReset();
    break;
  }
}