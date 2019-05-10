const Web3 = require('web3');
const rocketh = require('rocketh');
const {
  tx,
  getDeployedContract,
  call,
} = require('rocketh-web3')(rocketh, Web3); 

const gas = 6500000;

module.exports = async ({namedAccounts, initialRun}) => {
  const {
    deployer,
    sandAdmin,
  } = namedAccounts; 

  const sandContract = getDeployedContract('Sand');
  const currentAdmin = await call(sandContract, "admin");
  if(currentAdmin.toLowerCase() != sandAdmin.toLowerCase()) {
    if(initialRun) {
      console.log('setting sand admin', currentAdmin, sandAdmin);
    }
    await tx({from: deployer, gas}, sandContract, "changeAdmin", sandAdmin);
  }
  
}
