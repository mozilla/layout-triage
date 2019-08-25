const fs = require('fs');
const ical = require('ical-toolkit');
const ghpages = require('gh-pages');

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
  const day = date.getDay() || 7;  
  if (day !== 1) {
    date.setHours(-24 * (day - 1)); 
  }

  return date;
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

  if (!fs.existsSync(DIST_DIR)){
    fs.mkdirSync(DIST_DIR);
  }

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

function generateICALFile({ dutyCycleHistory, components }) {
  const builder = ical.createIcsFileBuilder();

  builder.calname = 'Layout Triage';
  builder.timezone = 'America/Los_Angeles';
  builder.tzid = 'America/Los_Angeles';
  builder.additionalTags = {
    'REFRESH-INTERVAL': 'VALUE=DURATION:P1H',
    'X-WR-CALDESC': 'Layout Triage'
  };

  for (let dutyCycleDate in dutyCycleHistory) {
    const dutyCycle = dutyCycleHistory[dutyCycleDate];
    const triagerNames = Object.keys(dutyCycle);
    const dutyCycleDateMs = new Date(dutyCycleDate).getTime();

    const triager0Components = Array.prototype.concat.apply([], dutyCycle[triagerNames[0]].map(component => components[component])).join(', ');
    const triager1Components = Array.prototype.concat.apply([], dutyCycle[triagerNames[1]].map(component => components[component])).join(', ');

    builder.events.push({
      start: new Date(dutyCycleDateMs),
      end: new Date(dutyCycleDateMs + CYCLE_LENGTH_MS),
      summary: `Triage Duty: ${triagerNames.join(', ')}`,
      description: `${triagerNames[0]}: ${triager0Components}\n${triagerNames[1]}: ${triager1Components}`,
      allDay: true
    });
  }

  const data = builder.toString();
  fs.writeFileSync(`${DIST_DIR}/${ICAL_FILE}`, data);
}

function generateDutyCycle({ dutyCycleHistory, triagers, components }) {
  let { lastDutyDate, lastTriagePair } = getLastDutyCycle({ dutyCycleHistory })
  let lastTriagerIdx = -1;
  const triagerNames = Object.keys(triagers);
  const componentNames = Object.keys(components);
  const createDateString = date => {
    return date.toISOString().replace(/T.*$/, '');
  }

  if (!lastDutyDate || !Array.isArray(lastTriagePair) || lastTriagePair.length !== 2) {
    console.warn('No existing duty cycle history. Generating first cycle.');
    lastDutyDate = createDateString(getLastMonday(new Date()));
  } else {
    lastTriagerIdx = triagerNames.indexOf(lastTriagePair[1]);
    if (lastTriagerIdx === -1) {
      console.warn(`Unable to find triager named ${lastTriagePair[1]} in config. Starting over from first triager.`);
    }
  }

  const nextTriagerIdx = (lastTriagerIdx + 1) % triagerNames.length;
  const nextDutyDateMS = new Date(lastDutyDate).getTime() + CYCLE_LENGTH_MS;
  const nextTriagePair = [triagerNames[nextTriagerIdx], triagerNames[(nextTriagerIdx +1 ) % triagerNames.length]];
  const nextDutyDate = createDateString(new Date(nextDutyDateMS));
  const firstComponentSet = selectRandom(componentNames, Math.floor(componentNames.length / 2));
  const secondComponentSet = componentNames.filter(c => firstComponentSet.indexOf(c) === -1);
  const dutyCycle = {};
  dutyCycle[nextTriagePair[0]] = firstComponentSet;
  dutyCycle[nextTriagePair[1]] = secondComponentSet;

  return {
    date: nextDutyDate,
    dutyCycle
  };
}

function runUpdate() {
  const { triagers, components } = readConfig();
  const { dutyCycleHistory } = JSON.parse(fs.readFileSync(HISTORY_FILE));
  const { date, dutyCycle } = generateDutyCycle({ dutyCycleHistory, triagers, components });

  function updateJSONCalendars() {
    const newDutyCycleTriagers = Object.keys(dutyCycle);
    newDutyCycleTriagers.forEach(triagerName => {
      const components = dutyCycle[triagerName];
      components.forEach(component => {
        appendDutyCycle({ component, date, triagerName, triagerData: triagers[triagerName] });
      });
    });
  }

  dutyCycleHistory[date] = dutyCycle;

  updateJSONCalendars();
  writeToHistory({ dutyCycleHistory });
  generateICALFile({ dutyCycleHistory, components });
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

  if (!fs.existsSync(DIST_DIR)){
    fs.mkdirSync(DIST_DIR);
  }

  Object.keys(components).forEach(component => {
    const filePath = `${DIST_DIR}/${component}.json`;
    fs.writeFileSync(filePath, resetDataString);
  });

  writeToHistory({ dutyCycleHistory: {} });
  generateICALFile({ dutyCycleHistory: {} });
}

function runPublish() {
  ghpages.publish(DIST_DIR, function (err) {
    if (err) {
      console.error('There was an error during publishing.');
    } else {
      console.log('Publish to GitHub was successful.');
    }
  });
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

  case 'publish': {
    runPublish();
    break;
  }
}