const inquirer = require('inquirer');
const moment = require('moment');
const csvtojson = require('csvtojson/v2');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const PiDB = require('@fibotax/pi-db');
const db = new PiDB(process.env.PI_REST_URL);
const input = require('./input.json');
const { UserFiles, ArchiveCalc, RentedApartments, CalcResults, AdditionalInfoFiles } = require('@fibotax/pi-dynamodb');
const userFilesModel = new UserFiles();

const employmentPeriodsModel = db.employmentPeriods();
const taxRefundModel = db.taxRefund();
const additionalInfoModel = db.additionalInfo();

const getInputData = async () => {
  const answer = await inquirer.prompt([
    { type: 'list', name: 'input-type', message: 'What is your input source type?', choices: ['csv', 'json'] },
  ]);

  if (answer['input-type'] === 'json') {
    return input;
  }

  return await csvtojson({ noheader: true })
    .fromStream(fs.createReadStream(path.resolve(__dirname, 'input.csv')))
    .then((data) => {
      return _.map(data, (r) => _.values(r));
    });
};

const getWorkplaces = async (userId, year) => {
  const workplaces = await employmentPeriodsModel.getUserEmployments(userId);
  if (!workplaces) {
    return [];
  }

  const currentYearWorkplaces = _.filter(Object.values(workplaces), (workplace) => workplace.year === year)[0];

  return currentYearWorkplaces.companies_name;
};

const getUserEmploymentPeriods = async (userId) => {
  const { NOT_RELEVANT_EMP_TYPES } = db.employmentPeriods().consts;
  const employmentPeriods = await db.get(db.tables.EMPLOYMENT_PERIODS_TABLE, `user_id=eq.${userId}&relevant=eq.true`);
  return _.filter(
    employmentPeriods,
    ({ type }) => !_.some(NOT_RELEVANT_EMP_TYPES, (notRelevantType) => _.includes(type, notRelevantType))
  );
};

const FILES_TABLE_NAME = process.env.FilesTable;

const getUserFiles = async (userId, tableName = FILES_TABLE_NAME) => {
  return await userFilesModel.getFiles(tableName, userId);
};
const removeCharacters = (str) =>
  str
    ? str
        .trim()
        .replace(/\./g, '')
        .replace(/["'()]/g, '')
    : str;
const getYear = (date) => moment(date).year();

const MOD_NAME_1 = 'משרד הביטחון';
const MOD_NAME_2 = 'משרד הבטחון';
const KEVA_NAME = 'חייל קבע';

const MOD_AND_KEVA_NAMES = [MOD_NAME_1, MOD_NAME_2, KEVA_NAME];
const DISPLAY_NAMES_TO_EXCLUDE_ALERT = {
  [MOD_NAME_1]: true,
  [MOD_NAME_2]: true,
  'רפאל מערכות לחימה מתקדמות בע': true,
  [KEVA_NAME]: true,
  'נס א.ט בע"מ': true,
  'משרד ראש הממשלה': true,
  'אלביט מערכות בע"מ': true,
  'המרכז לטכנולוגיה חינוכית': true,
  'קוגנייט טכנולוגיות ישראל בע"': true,
  'אלאופ - תעשיות אלקטרואופטיקה': true,
  'ה.מ.מ. אלביט מערכות-רפא"ל': true,
  'אלביט מערכות במד ול"א קרקעי': true,
  'אלביט מערכות ל"א וסיגנט-אליש': true,
  'אין מידע': true,
};

const getOnlyMissingWorkplaces = async (userId, year) => {
  const [userEmploymentPeriods, currentFiles] = await Promise.all([
    getUserEmploymentPeriods(userId),
    getUserFiles(userId),
  ]);
  let employmentPeriods = [];
  let missingFiles = [];
  const missingFilesAlerts = [];
  _.forEach(userEmploymentPeriods, ({ start_date, end_date }, index) => {
    const startYear = getYear(start_date);
    const endYear = getYear(end_date);
    if (year >= startYear && year <= endYear) {
      employmentPeriods.push(userEmploymentPeriods[index]);
    }
  });
  // let currentFiles = await getUserFiles(userId);
  const groupedEmploymentPeriods = _.groupBy(employmentPeriods, ({ deductions_file_number }) => deductions_file_number);
  _.forEach(groupedEmploymentPeriods, (groupedEmploymentPeriod) => {
    const { id, deductions_file_number, display_name } = groupedEmploymentPeriod[0]; //taking oldest employment period (more likely to appear in dynamodb)
    const found = _.some(
      currentFiles,
      (fileItem) =>
        year.toString() === fileItem.year.toString() &&
        (fileItem.employment_period_id.toString() === id.toString() ||
          (_.includes(deductions_file_number, fileItem.companyId) &&
            _.some(employmentPeriods, (ep) => ep.id.toString() == fileItem.employment_period_id.toString())) ||
          removeCharacters(display_name) === removeCharacters(fileItem.companyName))
    );
    if (!found) {
      missingFiles.push(display_name);
      if (!DISPLAY_NAMES_TO_EXCLUDE_ALERT[display_name]) {
        missingFilesAlerts.push(display_name);
      }
    }
  });
  return missingFiles;
};

const hasCncInYear = async (userId, year) => {
  const taxRefunds = await taxRefundModel.getTaxRefunds(userId);
  if (!taxRefunds) {
    return;
  }

  const hasCNC =
    _.filter(
      taxRefunds,
      (taxRefund) =>
        taxRefund.year === parseInt(year) &&
        taxRefund.calculation_not_completed === true &&
        taxRefund.calculation_not_completed_reasons.includes('106')
    ).length > 0;

  return hasCNC;
};

const add106 = async (userId, year, workplaces, actionContext) => {
  const hasCNC = await hasCncInYear(userId, year);

  if (hasCNC) {
    const aiFiles = await Promise.all([
      additionalInfoModel.getAllByUserIdAndType(userId, 6),
      additionalInfoModel.getAllByUserIdAndType(userId, 8),
      additionalInfoModel.getAllByUserIdAndType(userId, 24),
    ]);

    if (aiFiles[0].length === 0 && aiFiles[1].length === 0 && aiFiles[2].length === 0) {
      console.log('user has no ai');
      await additionalInfoModel.addMissing106IfNotExists(userId, workplaces, year, actionContext);
    }
  }
};

exports.handler = async (actionContext) => {
  const input_users_ids = await getInputData();
  console.log('input users, found =', input_users_ids.length);
  const userWorkplaces = [];

  for (let i = 0; i < input_users_ids.length; i++) {
    const user = input_users_ids[i];
    userWorkplaces.push({
      userId: user[0],
      year: user[1],
      workplaces: await getOnlyMissingWorkplaces(user[0], user[1]),
    });
  }

  // const userWorkplaces = await Promise.all(
  //   _.map(input_users_ids, async (user) => {
  //     return { userId: user[0], year: user[1], workplaces: await getOnlyMissingWorkplaces(user[0], user[1]) };
  //   })
  // );

  for (let i = 0; i < userWorkplaces.length; i++) {
    const user = userWorkplaces[i];

    await add106(user.userId, user.year, user.workplaces, actionContext);
  }

  console.log(`It's too late to regret, you can view what you've done in output.json`);
};
