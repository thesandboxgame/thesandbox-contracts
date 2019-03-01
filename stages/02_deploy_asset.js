const rocketh = require('rocketh');
const Web3 = require('web3');
const web3 = new Web3(ethereum);
const {deployAndRegister, getDeployedContract} = require('../lib');

// const SandInfo = rocketh.contractInfo('Sand');
const AssetInfo = rocketh.contractInfo('Asset');

module.exports = async ({accounts, registerDeployment, artifact}) => {
  const networkId = await web3.eth.net.getId();
  const sandContract = getDeployedContract('Sand');
  await deployAndRegister(
    web3,
    accounts,
    registerDeployment,
    'Asset',
    AssetInfo,
    sandContract.options.address,
    networkId
  );
};
