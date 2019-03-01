const t = require('tap');
const assert = require('assert');
const rocketh = require('rocketh');

main(rocketh.accounts);
async function main(accounts) {
  const {gas, expectThrow, toChecksumAddress, web3, deployContract} = require('../utils');
  const {
    transfer,
    getBalance
  } = require('../sand-utils');

  const creator = toChecksumAddress(accounts[0]);
  const sandOwner = creator;
  const user1 = toChecksumAddress(accounts[1]);
  const user2 = toChecksumAddress(accounts[2]);
  const user3 = toChecksumAddress(accounts[3]);

  async function deployProxyContract(contractAddress, contractABI, initData) {
    const adminUpgradeabilityProxy = await deployContract(creator, 'AdminUpgradeabilityProxy', contractAddress, initData);
    // const AdminUpgradeabilityProxyInfo = rocketh.contractInfo('AdminUpgradeabilityProxy');
    const matchingEvents = await adminUpgradeabilityProxy.getPastEvents('AdminChanged');
    const adminAddress = matchingEvents[0].returnValues.newAdmin;
    const ProxyAdminContractInfo = rocketh.contractInfo('ProxyAdmin');
    const admin = new web3.eth.Contract(ProxyAdminContractInfo.abi, adminAddress);
    const proxy = new web3.eth.Contract(contractABI, adminUpgradeabilityProxy.options.address);
    // const proxyAsAdmin = new web3.eth.Contract(AdminUpgradeabilityProxyInfo.abi, adminUpgradeabilityProxy.options.address)
    return {
      proxy,
      admin,
      proxyAsAdmin: adminUpgradeabilityProxy
    };
  }

  async function deployProxiedSand20() {
    const chainId = await web3.eth.net.getId(); // TODO use chainId instead of networkId
    const sand20 = await deployContract(creator, 'Sand20', sandOwner, chainId);
    const initData = sand20.methods.initSand(sandOwner, chainId).encodeABI();
    const result = await deployProxyContract(sand20.options.address, sand20.options.jsonInterface, initData);
    return {admin: result.admin, sand: result.proxy, proxyAsAdmin: result.proxyAsAdmin};
  }

  t.test('deploy proxxied Sand and transfer call from creator', async () => {
    const {sand} = await deployProxiedSand20();
    await transfer(sand, user1, '1000000', {from: creator, gas});
    const user1Balance = await getBalance(sand, user1);
    assert.equal(user1Balance.toString(10), '1000000');
  });

  t.test('creator can change Admin via adminProxy', async () => {
    const {admin} = await deployProxiedSand20();
    await admin.methods.changeAdmin(user2).send({from: creator, gas});
  });

  t.test('other user cannot change Admin via adminProxy', async () => {
    const {admin} = await deployProxiedSand20();
    await expectThrow(admin.methods.changeAdmin(user2).send({from: user1, gas}));
  });

  t.test('creator can change Admin via adminProxy and user can still transfer', async () => {
    const {admin, sand} = await deployProxiedSand20();
    await transfer(sand, user1, '1000000', {from: creator, gas});
    await admin.methods.changeAdmin(user2).send({from: creator, gas});
    await transfer(sand, user3, '1000', {from: user1, gas});
    const user3Balance = await getBalance(sand, user3);
    assert.equal(user3Balance.toString(10), '1000');
  });

  t.test('creator can not upgrade after changing admin to another user', async () => {
    const chainId = await web3.eth.net.getId();
    const {admin} = await deployProxiedSand20();
    await admin.methods.changeAdmin(user2).send({from: creator, gas});
    const sand777 = await deployContract(creator, 'Sand777', sandOwner, chainId);
    const initData = sand777.methods.initSand(sandOwner, chainId).encodeABI();
    await expectThrow(admin.methods.upgradeToAndCall(sand777.options.address, initData).send({from: creator, gas}));
  });

  t.test('creator cannot change admin after already doing so', async () => {
    const {admin} = await deployProxiedSand20();
    await admin.methods.changeAdmin(user2).send({from: creator, gas});
    await expectThrow(admin.methods.changeAdmin(user1).send({from: creator, gas}));
  });

  t.test('creator can upgrade', async () => {
    const chainId = await web3.eth.net.getId();
    const {admin} = await deployProxiedSand20();
    const sand777 = await deployContract(creator, 'Sand777', sandOwner, chainId);
    const initData = sand777.methods.initSand(sandOwner, chainId).encodeABI();
    await admin.methods.upgradeToAndCall(sand777.options.address, initData).send({from: creator, gas});
  });

  t.test('new admin can upgrade directly', async () => {
    const chainId = await web3.eth.net.getId();
    const {admin, proxyAsAdmin} = await deployProxiedSand20();
    await admin.methods.changeAdmin(user2).send({from: creator, gas});
    const sand777 = await deployContract(creator, 'Sand777', sandOwner, chainId);
    const initData = sand777.methods.initSand(sandOwner, chainId).encodeABI();
    await proxyAsAdmin.methods.upgradeToAndCall(sand777.options.address, initData).send({from: user2, gas});
  });

  t.test('new admin cannot transfer ', async () => {
    const {admin, sand} = await deployProxiedSand20();
    await transfer(sand, user2, '1000000', {from: creator, gas});
    await admin.methods.changeAdmin(user2).send({from: creator, gas});
    await expectThrow(transfer(sand, user1, '100', {from: user2, gas}));
  });

  t.test('new admin owner can upgrade via admin', async () => {
    const chainId = await web3.eth.net.getId();
    const {admin} = await deployProxiedSand20();
    await admin.methods.transferOwnership(user2).send({from: creator, gas});
    const sand777 = await deployContract(creator, 'Sand777', sandOwner, chainId);
    const initData = sand777.methods.initSand(sandOwner, chainId).encodeABI();
    await admin.methods.upgradeToAndCall(sand777.options.address, initData).send({from: user2, gas});
  });

  t.test('new admin can change admin', async () => {
    const {admin, proxyAsAdmin} = await deployProxiedSand20();
    await admin.methods.changeAdmin(user2).send({from: creator, gas});
    await proxyAsAdmin.methods.changeAdmin(user1).send({from: user2, gas});
  });
}
