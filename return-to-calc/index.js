const inquirer = require('inquirer');
const csvtojson = require('csvtojson/v2');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const { USERS_TABLE, TAX_REFUNDS_TABLE } = require('@fibotax/pi-db/models/consts/tables');
const { T15_CALC_CONFIRM, T12_5, T17 } = require('@fibotax/pi-db/models/consts/tasks');
const PiDB = require('@fibotax/pi-db');
const db = new PiDB(process.env.PI_REST_URL);
const input = require('./input.json');

const getInputData = async () => {
  const answer = await inquirer.prompt([
    { type: 'list', name: 'input-type', message: 'What is your input source type?', choices: ['json', 'csv'] },
  ]);

  if (answer['input-type'] === 'json') {
    return input;
  }

  return await csvtojson({ noheader: true })
    .fromStream(fs.createReadStream(path.resolve(__dirname, 'input.csv')))
    .then((data) => {
      return _.map(data, (r) => _.values(r)[0]);
    });
};

const getPartners = async (input_users_ids) => {
  const users_ids = [];

  const chunked = _.chunk(input_users_ids, process.env.CHUNK_TO_GET_SIZE);
  for (const chunk of chunked) {
    const users = await db.get(USERS_TABLE, `id=in.(${chunk.join(',')})`);
    _.forEach(users, (user) => {
      users_ids.push(user.id);
      if (!_.isNil(user.partner_uuid)) {
        users_ids.push(user.partner_uuid);
      }
    });
  }
  return _.uniq(users_ids);
};

const getTaxRefundsToUpdate = async (users) => {
  let tax_refunds = [];
  const chunked = _.chunk(users, process.env.CHUNK_TO_GET_SIZE);
  for (const chunk of chunked) {
    const query = `task=in.(${encodeURI(T15_CALC_CONFIRM)},${encodeURI(T17)})&user_id=in.(${chunk.join(',')})`;
    tax_refunds = _.concat(tax_refunds, await db.get(TAX_REFUNDS_TABLE, query));
  }
  return _.unionBy(tax_refunds, 'id');
};

const getTaxRefundsAfterUpdate = async (tax_refunds) => {
  let data = [];
  const chunked = _.chunk(tax_refunds, process.env.CHUNK_TO_GET_SIZE);
  for (const chunk of chunked) {
    data = _.concat(data, await db.get(TAX_REFUNDS_TABLE, `id=in.(${_.map(chunk, (t) => t.id).join(',')})`));
  }
  data = _.unionBy(data, 'id');
  await fs.promises.writeFile(path.resolve(__dirname, 'output.json'), JSON.stringify(data));
  console.log(`${data.length} years affected in total`);
};

const updateTaxRefund = async (tax_refunds, actionContext) => {
  const chunked = _.chunk(tax_refunds, process.env.CHUNK_TO_UPDATE_SIZE);
  for (const chunk of chunked) {
    try {
      await Promise.all(
        _.map(chunk, (item) =>
          db.update(
            TAX_REFUNDS_TABLE,
            { ...actionContext, effected_user_id: item.user_id, effected_resource_id: item.id },
            `id=eq.${item.id}`,
            {
              task: T12_5,
            }
          )
        )
      );
      console.log(`update ${chunk.length} years`);
    } catch (error) {
      console.error(error);
    }
  }
};

const askForApprove = async (message) => {
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'approve',
      message: `
      ${message}
      `,
      choices: ['no', 'yes'],
    },
  ]);
  if (answer['approve'] === 'yes') {
    return true;
  }
  return false;
};

exports.handler = async (actionContext) => {
  const input_users_ids = await getInputData();
  console.log('input users, found =', input_users_ids.length);

  const users = await getPartners(input_users_ids);
  console.log('users to update (include partners), found =', users.length);

  const tax_refunds = await getTaxRefundsToUpdate(users);
  if (!tax_refunds.length) {
    console.log('not found any tax refunds to update');
    return;
  }
  console.log('tax refunds to update, found =', tax_refunds.length);

  const message = `You chose ${tax_refunds.length} years to update to 12.5, with ${actionContext.client_id} audit log name, Are you sure?`;
  if (!(await askForApprove(message))) {
    return;
  }
  if (!(await askForApprove(`Once again, are you sure?`))) {
    return;
  }

  console.log('May the lord be with you...');

  await updateTaxRefund(tax_refunds, actionContext);
  await getTaxRefundsAfterUpdate(tax_refunds);

  console.log(`It's too late to regret, you can view what you've done in output.json`);
};
