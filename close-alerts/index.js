const PiDB = require('@fibotax/pi-db');
const piDB = new PiDB(process.env.PI_REST_URL);
const inquirer = require('inquirer');
const inputDataGetter = require('./../common/inputDataGetter');
const _ = require('lodash');

const handler = async(actionContext) => {
    const inputData = await inputDataGetter.getInputData(false);
    const userIds = _.map(inputData, row => row[0]);
    const alerts = piDB.alert();
    const answer = await inquirer.prompt([
        { type: 'input', name: 'alert-message', message: 'What type of alert would you like to close? (free text)'},
      ]);
    const alertMessage = answer['alert-message'];
    for(const userId of userIds){
        try{
            const userAlerts = await alerts.getAlertsByMessage(userId, alertMessage);
            if(userAlerts.length === 0){
                console.log(`Could not find alerts for user ${userId}`);
                continue;
            }
            for(const userAlert of userAlerts){
                await alerts.setDone(userId, userAlert.id, true, actionContext);
                console.log(`Closed alert with the message: ${userAlert.message} for ${userId}`)
            }
        } catch(error){
            console.error(error);
        }
    }
};

exports.handler = handler;