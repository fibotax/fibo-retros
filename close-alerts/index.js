const PiDB = require('@fibotax/pi-db');
const piDB = new PiDB(process.env.PI_REST_URL);
const inquirer = require('inquirer');
const inputDataGetter = require('./../common/inputDataGetter');
const _ = require('lodash');
const CHUNK_TO_UPDATE_SIZE = parseInt(process.env.CHUNK_TO_UPDATE_SIZE);

const handler = async(actionContext) => {
    const inputData = await inputDataGetter.getInputData();
    const userIds = _.map(inputData, row => row[0]);
    const alerts = piDB.alert();
    const answer = await inquirer.prompt([
        { type: 'input', name: 'alert-message', message: 'What type of alert would you like to close? (free text)'},
      ]);
    const alertMessage = answer['alert-message'];
    const allAlerts = [];
    for(const userId of userIds){
        try{
            const userAlerts = await alerts.getAlertsByMessage(userId, alertMessage);
            if(userAlerts.length === 0){
                console.log(`Could not find alerts for user ${userId}`);
                continue;
            }
            allAlerts.push(...userAlerts);
        } catch(error){
            console.error(error);
        }
    }
    console.log(`Total of ${allAlerts.length} alerts from ${userIds.length} are going to close`);
    const chunks = _.chunk(allAlerts, CHUNK_TO_UPDATE_SIZE);
    let alertsClosed = 0;
    for(const chunk of chunks){
        try{
            await Promise.all(_.map(chunk, async(alert)=>{
                await alerts.setDone(alert.user_id, alert.id, true, actionContext);
                console.log(`Closed alert with the message: ${alert.message} for ${alert.user_id}`);
            }));
            alertsClosed += CHUNK_TO_UPDATE_SIZE;
            console.log(`Closed ${alertsClosed} of ${allAlerts.length} alerts`);
        } catch (error){
            console.error(error);
        }
    }
};

exports.handler = handler;