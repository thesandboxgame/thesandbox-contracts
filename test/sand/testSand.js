const {
  transfer,
} = require('../erc20');

const {
  gas,
  deployContract,
  instantiateContract,
  tx,
  encodeCall,
  toChecksumAddress,
} = require('../utils');

const {
  runMetaTxExtensionTests
} = require('./meta_transaction_extension');

const {
  runERC20ApproveExtensionTests
} = require('./erc20_approve_extension');

const {
  runERC20Tests,
} = require('../erc20_tests');

const {
    runERC777Tests,
    failERC777Tests,
} = require('../erc777_tests');


const rocketh = require('rocketh');
const accounts = rocketh.accounts;

const creator = toChecksumAddress(accounts[0]);
const sandOwner = creator;
const user1 = toChecksumAddress(accounts[1]);  

async function nonUpgradeableBasicSand() {
  const contracts = {};
  contracts.Sand = await deployContract(creator, 'Sand20Basic', sandOwner, sandOwner);
  await transfer(contracts.Sand, user1, '1000000', {from: creator, gas});
  return contracts.Sand;
}

async function nonUpgradeableSand() {
  const contracts = {};
  contracts.Sand = await deployContract(creator, 'Sand20', sandOwner, sandOwner);
  await transfer(contracts.Sand, user1, '1000000', {from: creator, gas});
  return contracts.Sand;
}


async function nonUpgradeableSand777() {
  const contracts = {};
  contracts.Sand = await deployContract(creator, 'Sand777', sandOwner);
  await transfer(contracts.Sand, user1, '1000000', {from: creator, gas});
  return contracts.Sand;
}

async function upgradableBasicSand() {
  const contracts = {};
  contracts.Sand20 = await deployContract(creator, 'Sand20Basic', sandOwner, sandOwner);
  const initData = encodeCall(contracts.Sand20, 'initSand', sandOwner, sandOwner);
  contracts.AdminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', creator,  contracts.Sand20.options.address, initData);
  contracts.Sand = instantiateContract(contracts.Sand20.options.jsonInterface, contracts.AdminUpgradeabilityProxy.options.address);
  await transfer(contracts.Sand, user1, '1000000', {from: sandOwner, gas});
  return contracts.Sand;
}


async function upgradableSand() {
  const contracts = {};
  contracts.Sand20 = await deployContract(creator, 'Sand20', sandOwner, sandOwner);
  const initData = encodeCall(contracts.Sand20, 'initSand', sandOwner, sandOwner);
  contracts.AdminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', creator,  contracts.Sand20.options.address, initData);
  contracts.Sand = instantiateContract(contracts.Sand20.options.jsonInterface, contracts.AdminUpgradeabilityProxy.options.address);
  await transfer(contracts.Sand, user1, '1000000', {from: sandOwner, gas});
  return contracts.Sand;
}

async function upgradableSandWithMetaTransactions() {
  const contracts = {};
  contracts.Sand20 = await deployContract(creator, 'Sand20', sandOwner, sandOwner);
  const initData = encodeCall(contracts.Sand20, 'initSand', sandOwner, sandOwner);
  contracts.AdminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', creator,  contracts.Sand20.options.address, initData);
  contracts.Sand = instantiateContract(contracts.Sand20.options.jsonInterface, contracts.AdminUpgradeabilityProxy.options.address);
  await transfer(contracts.Sand, user1, '1000000', {from: sandOwner, gas});
  return contracts.Sand;
}

async function erc777UpgradedFrom20() {
  const contracts = {};
  contracts.Sand20 = await deployContract(creator, 'Sand20', sandOwner, sandOwner);
  const initData = encodeCall(contracts.Sand20, 'initSand', sandOwner, sandOwner);
  contracts.Sand777 = await deployContract(creator, 'Sand777', sandOwner);
  contracts.AdminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', creator, contracts.Sand20.options.address, initData);
  const matchingEvents = await contracts.AdminUpgradeabilityProxy.getPastEvents('AdminChanged');
  const adminAddress = matchingEvents[0].returnValues.newAdmin;
  const ProxyAdminContractInfo = rocketh.contractInfo('ProxyAdmin');
  contracts.ProxyAdmin = instantiateContract(ProxyAdminContractInfo.abi, adminAddress);
  contracts.Sand = instantiateContract(contracts.Sand777.options.jsonInterface, contracts.AdminUpgradeabilityProxy.options.address);
  const sand777InitData = encodeCall(contracts.Sand777, 'initSand', sandOwner);
  await tx(contracts.ProxyAdmin, 'upgradeToAndCall', {from: creator, gas}, contracts.Sand777.options.address, sand777InitData);
  await transfer(contracts.Sand, user1, '1000000', {from: sandOwner, gas});
  return contracts.Sand;
}

async function erc777UpgradedFrom20WithMetaTransactions() {
  const contracts = {};
  contracts.Sand20 = await deployContract(creator, 'Sand20', sandOwner, sandOwner);
  const initData = encodeCall(contracts.Sand20, 'initSand', sandOwner, sandOwner);
  contracts.Sand777 = await deployContract(creator, 'Sand777', sandOwner);
  contracts.AdminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', creator, contracts.Sand20.options.address, initData);
  const matchingEvents = await contracts.AdminUpgradeabilityProxy.getPastEvents('AdminChanged');
  const adminAddress = matchingEvents[0].returnValues.newAdmin;
  const ProxyAdminContractInfo = rocketh.contractInfo('ProxyAdmin');
  contracts.ProxyAdmin = instantiateContract(ProxyAdminContractInfo.abi, adminAddress);
  contracts.Sand = instantiateContract(contracts.Sand777.options.jsonInterface, contracts.AdminUpgradeabilityProxy.options.address);
  const sand777InitData = encodeCall(contracts.Sand777, 'initSand', sandOwner);
  await tx(contracts.ProxyAdmin, 'upgradeToAndCall', {from: creator, gas}, contracts.Sand777.options.address, sand777InitData);
  await transfer(contracts.Sand, user1, '1000000', {from: sandOwner, gas});
  return contracts.Sand;
}

async function upgradedTo777AndThenDowngradedTo20() {
  const contracts = {};
  contracts.Sand20 = await deployContract(creator, 'Sand20', sandOwner, sandOwner);
  const initData = encodeCall(contracts.Sand20, 'initSand', sandOwner, sandOwner);
  contracts.Sand777 = await deployContract(creator, 'Sand777', sandOwner);
  contracts.AdminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', creator, contracts.Sand20.options.address, initData);
  const matchingEvents = await contracts.AdminUpgradeabilityProxy.getPastEvents('AdminChanged');
  const adminAddress = matchingEvents[0].returnValues.newAdmin;
  const ProxyAdminContractInfo = rocketh.contractInfo('ProxyAdmin');
  contracts.ProxyAdmin = instantiateContract(ProxyAdminContractInfo.abi, adminAddress);
  contracts.Sand = instantiateContract(contracts.Sand20.options.jsonInterface, contracts.AdminUpgradeabilityProxy.options.address);
  const sand777InitData = encodeCall(contracts.Sand777, 'initSand', sandOwner);
  await tx(contracts.ProxyAdmin, 'upgradeToAndCall', {from: creator, gas}, contracts.Sand777.options.address, sand777InitData);
  await tx(contracts.ProxyAdmin, 'upgradeTo', {from: creator, gas}, contracts.Sand20.options.address);
  await transfer(contracts.Sand, user1, '1000000', {from: sandOwner, gas});
  return contracts.Sand;
}

runERC20Tests('non-upgradeable Basic SAND (with ERC777 events)', nonUpgradeableBasicSand, {shouldEmitERC777Events: true});

runERC20Tests('non-upgradeable SAND with ERC777 events', nonUpgradeableSand, {shouldEmitERC777Events: true});

runERC20Tests('upgradeable Basic SAND (with ERC777 events)', upgradableBasicSand, {shouldEmitERC777Events: true});

runERC20Tests('upgradeable SAND with ERC777 events', upgradableSand, {shouldEmitERC777Events: true});

runERC20Tests('SAND upgraded to ERC777', erc777UpgradedFrom20, {shouldEmitERC777Events: true});

runERC20Tests('SAND upgraded to ERC777 and then downgraded to ERC20', upgradedTo777AndThenDowngradedTo20, {shouldEmitERC777Events: true});

runERC20ApproveExtensionTests('non-upgradeable sand approve extenstion', nonUpgradeableSand);
runERC20ApproveExtensionTests('upgradeable sand approve extenstion', upgradableSand);
runERC20ApproveExtensionTests('erc777 upgradeable sand approve extenstion', erc777UpgradedFrom20);
runERC20ApproveExtensionTests('upgradedTo777AndThenDowngradedTo20 approve extension', upgradedTo777AndThenDowngradedTo20);

runMetaTxExtensionTests('upgradeable sand 20 meta-tx extenstion', upgradableSandWithMetaTransactions);

// TODO runMetaTxExtensionTests('upgradeable sand 777 meta-tx extenstion', erc777UpgradedFrom20WithMetaTransactions, true);

runERC777Tests('SAND upgraded to ERC777', erc777UpgradedFrom20);

runERC777Tests('non upgradeable Sand777', nonUpgradeableSand777);

failERC777Tests('SAND upgraded to ERC777 and then downgraded to ERC20', upgradedTo777AndThenDowngradedTo20);
