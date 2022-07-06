const { UserFiles, ArchiveCalc, RentedApartments, CalcResults, AdditionalInfoFiles } = require('@fibotax/pi-dynamodb');
const userFilesModel = new UserFiles();
const archiveCalcModel = new ArchiveCalc();
const rentedApartmentsModel = new RentedApartments();
const calcResultsModel = new CalcResults();
const additionalInfoFilesModel = new AdditionalInfoFiles(process.env.ENV);
const _ = require('lodash');

const FILES_TABLE_NAME = process.env.FilesTable;
const ARCHIVE_TABLE_NAME = process.env.ArchiveTable;
const RESULTS_TABLE_NAME = process.env.ResultsTable;
const RENTED_APARTMENTS_TABLE_NAME = process.env.RentedApartmentsTable;
const INVESTMENTS_TABLE_NAME = process.env.InvestmentsTable;

const getUserFiles = async (userId, tableName = FILES_TABLE_NAME) => {
  return await userFilesModel.getFiles(tableName, userId);
};

const getRentedApartments = async (userId) => {
  return await getUserFiles(userId, RENTED_APARTMENTS_TABLE_NAME);
};

const getCalcData = async (calcId) => {
  return await archiveCalcModel.getByCalcId(ARCHIVE_TABLE_NAME, calcId);
};

const getUserFilesByYears = async (userId, years, tableName = FILES_TABLE_NAME) => {
  const userFiles = await getUserFiles(userId, tableName);
  const usersFilesByYears = {};
  _.forEach(years, (year) => {
    usersFilesByYears[year] = _.filter(
      userFiles,
      (item) => item && item.year && item.year.toString() === year.toString()
    );
  });

  return usersFilesByYears;
};

const getUserInvestmentsFilesByYear = async (userId, years) => {
  return await getUserFilesByYears(userId, years, INVESTMENTS_TABLE_NAME);
};

const getLatestMatch = (...args) => {
  return userFilesModel.getLatestMatch.apply(this, args);
};

const archiveCalcData = async (userId, calcDataObj, calcDataId) => {
  try {
    await archiveCalcModel.create(ARCHIVE_TABLE_NAME, {
      id: calcDataId,
      user_id: userId,
      calc_object: calcDataObj,
    });
  } catch (error) {
    console.warn({
      message: `${ARCHIVE_CALC_DATA_FAILED}`,
      userId,
      calcDataId,
      error,
    });
    throw `archiveCalcData error - ${error}`;
  }
};

const updateCalcDataStatus = async (calcDataId, newStatus) => {
  try {
    await archiveCalcModel.updateStatus(ARCHIVE_TABLE_NAME, calcDataId, newStatus);
  } catch (error) {
    console.warn({
      message: `${UPDATE_CALC_DATA_STATUS_FAILED}`,
      calcDataId,
      error,
    });
    throw `updateCalcDataStatus error - ${error}`;
  }
};

const getLatestCalculated = async (userId) => {
  return await archiveCalcModel.getLatestCalculated(ARCHIVE_TABLE_NAME, userId);
};

const writeCalcResult = async (userId, userData) => {
  try {
    const { calc_data_id } = userData;
    await calcResultsModel.create(RESULTS_TABLE_NAME, {
      result_object: userData,
      user_id: userId,
      calc_id: calc_data_id,
      resource_type: 'omega',
    });
  } catch (error) {
    console.warn({
      message: `${WRITE_RESULT_DATA_FAILED}`,
      userId,
      calcDataId,
      error,
    });
    throw `writeCalcResult error - ${error}`;
  }
};

module.exports = {
  MODELS: {
    USER_FILES_MODEL: userFilesModel,
    ARCHIVE_CALC_MODEL: archiveCalcModel,
    RENTED_APARTMENTS_MODEL: rentedApartmentsModel,
    CALC_RESULTS_MODEL: calcResultsModel,
    ADDI_INFO_MODEL: additionalInfoFilesModel,
  },
  archiveCalcData,
  getUserFiles,
  getUserFilesByYears,
  updateCalcDataStatus,
  getLatestMatch,
  getCalcData,
  getLatestCalculated,
  writeCalcResult,
  getRentedApartments,
  getUserInvestmentsFilesByYear,
};
