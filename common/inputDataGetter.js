const inquirer = require('inquirer');
const csvtojson = require('csvtojson/v2');
const fs = require('fs');
const path = require('path');
const input = require('./../input.json');
const _ = require('lodash');

const getInputData = async (noheader = true) => {
    const answer = await inquirer.prompt([
      { type: 'list', name: 'input-type', message: 'What is your input source type?', choices: ['csv', 'json'] },
    ]);
  
    if (answer['input-type'] === 'json') {
      return input;
    }
  
    return await csvtojson({ noheader: noheader })
      .fromStream(fs.createReadStream(path.resolve(__dirname, '../input.csv')))
      .then((data) => {
        return _.map(data, (r) => _.values(r));
      });
};

exports.getInputData = getInputData;