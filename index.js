const inquirer = require('inquirer');
const { handler: returnToCalcHandler } = require('./return-to-calc');

const handler = async () => {
  console.log('start');

  const scriptTypeAnswer = await inquirer.prompt([
    { type: 'list', name: 'script-type', message: 'Which script do you want to run?', choices: ['return-to-calc'] },
  ]);
  const retroNameAnswer = await inquirer.prompt([
    { type: 'input', name: 'retor-name', message: 'What is the retro audit log name?' },
  ]);
  const actionContext = {
    client_id: retroNameAnswer['retor-name'],
    client_display_name: retroNameAnswer['retor-name'],
  };

  switch (scriptTypeAnswer['script-type']) {
    case 'return-to-calc':
      await returnToCalcHandler(actionContext);

    default:
      break;
  }

  console.log('finish');
};

handler();
