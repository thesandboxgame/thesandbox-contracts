const Web3 = require('web3');
const rocketh = require('rocketh');
const web3 = new Web3(ethereum);
const {deployAndRegister, deployViaProxyAndRegister} = require('../lib');

const SandInfo = rocketh.contractInfo('Sand');
const AdminUpgradeabilityProxyInfo = rocketh.contractInfo('AdminUpgradeabilityProxy');
const MetaProxyInfo = rocketh.contractInfo('MetaProxy');

module.exports = async ({accounts, registerDeployment}) => {
  const chainId = await web3.eth.net.getId();
  const sandContract = await deployViaProxyAndRegister(
    web3,
    accounts,
    registerDeployment,
    {
      name: 'Sand',
      info: SandInfo,
      proxyInfo: AdminUpgradeabilityProxyInfo,
      proxyName: 'AdminUpgradeabilityProxy'
    },
    'initSand',
    accounts[0],
    chainId
  );

  await deployAndRegister(
    web3,
    accounts,
    registerDeployment,
    'MetaProxy',
    MetaProxyInfo,
    accounts[0],
    sandContract.options.address,
    accounts[0],
    '10000000000000000',
    '200000000000000000' // 20 recharge left
  );
};
