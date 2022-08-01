const inquirer = require('inquirer');
const csvtojson = require('csvtojson/v2');
const fs = require('fs');
const path = require('path');
const input = require('./../input.json');
const _ = require('lodash');

const askForHeader = async () => {
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'approve',
      message: 'Does the file have a header?',
      choices: ['no', 'yes'],
    },
  ]);
  if (answer['approve'] === 'yes') {
    return true;
  }
  return false;
};

const getInputData = async () => {
    const answer = await inquirer.prompt([
      { type: 'list', name: 'input-type', message: 'What is your input source type?', choices: ['csv', 'json'] },
    ]);
  
    if (answer['input-type'] === 'json') {
      return input;
    }
  
    const header = await askForHeader();
    return await csvtojson({ noheader: !header })
      .fromStream(fs.createReadStream(path.resolve(__dirname, '../input.csv')))
      .then((data) => {
        return _.map(data, (r) => header && r.user_id ? r.user_id : _values(r));
      });
};

exports.getInputData = getInputData;