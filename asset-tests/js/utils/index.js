const Web3 = require('web3');
const assert = require('assert');
const rocketh = require('rocketh');

const web3 = new Web3(rocketh.ethereum);

// const truffleConfig = require('../../truffle-config.js');

const gas = 4000000;
const deployGas = 6000000;

const gasReport = {};

const contracts = {};
const deployer = function (accounts) {
  function deployViaAccount(account, ContractInfo, ...args) {
    const Contract = new web3.eth.Contract(ContractInfo.abi, {data: ContractInfo.bytecode});
    return Contract.deploy({data: ContractInfo.bytecode, arguments: args}).send({from: account, gas: deployGas})
      .then((contract) => {
        // console.log('contract deployed', ContractInfo.contractName, ' : ', contract.options.address);
        contracts[ContractInfo.contractName] = contract;
        return contract;
      })
      .catch((error) => {
        console.error('ERRROR', error);
      });
  }
  return {
    deployViaAccount, // TODO remove as it is not used, incompatible with truffle
    deploy: (ContractInfo, ...args) => deployViaAccount(accounts[0], ContractInfo, ...args)
  };
};

function getEventsFromReceipt(contract, sig, receipt) {
  return contract.getPastEvents(sig, {
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber
  });
}

function getPastEvents(contract, sig) {
  return contract.getPastEvents(sig, {
    fromBlock: 0
  });
}

function getMigratedContract(contractName) {
  return new Promise((resolve, reject) => {
    const Artifact = artifacts.require(contractName);
    const ContractInfo = Artifact._json;
    web3.eth.net.getId()
      .then((networkId) => resolve(new web3.eth.Contract(ContractInfo.abi, Artifact.networks[networkId].address)))
      .catch((error) => reject(error));
  });
}

function showBasicGasReport() {
  console.log(JSON.stringify(gasReport, (key, value) => (key === 'gasUsed' || key === 'average') ? Math.floor(value).toLocaleString() : value, '  '));
}

function reportGas(message, _times, executeTests, only) {
  let times = 1;
  if (typeof _times === 'number') {
    times = _times;
  } else {
    only = executeTests;
    executeTests = _times;
  }
  if (times > 1) {
    message = message + ' x ' + times;
  }
  executeTests((contractNameOrContract, options, executeTest) => {
    let contractName;
    let useContractName;
    if (typeof contractNameOrContract === 'string') {
      contractName = contractNameOrContract;
      useContractName = true;
    } else {
      useContractName = false;
      contractName = contractNameOrContract.constructor.name;
    }
    let text = contractName;
    if (typeof options !== 'string') {
      executeTest = options;
      options = null;
    }
    if (options) {
      text += ' ' + options;
    }
    let contractFunc = contract;
    if (only) {
      contractFunc = contract.only;
    }
    contractFunc(text, (accounts) => {
      it(message, async () => {
        let contract;
        if (useContractName) {
          contract = await getMigratedContract(contractName);
        } else {
          contract = contractNameOrContract;
        }
        const receipt = await executeTest(contract, accounts[0], accounts.slice(1));
        if (receipt && receipt.gasUsed && receipt.gasUsed > 0) {
          let reportData;
          if (!gasReport[message]) {
            gasReport[message] = {};
          }
          if (options) {
            if (gasReport[message][contractName] && gasReport[message][contractName].gasUsed) {
              const defaultOptionsReportData = gasReport[message][contractName];
              gasReport[message][contractName] = {};
              gasReport[message][contractName].default = defaultOptionsReportData;
            }
            if (!gasReport[message][contractName]) {
              gasReport[message][contractName] = {};
            }
            if (!gasReport[message][contractName][options]) {
              gasReport[message][contractName][options] = {
                gasUsed: 0,
                times: 0
              };
            }
            reportData = gasReport[message][contractName][options];
          } else if (gasReport[message][contractName] && gasReport[message][contractName].default) {
            reportData = gasReport[message][contractName].default;
          } else if (gasReport[message][contractName]) {
            reportData = gasReport[message][contractName];
          } else {
            gasReport[message][contractName] = {
              gasUsed: 0,
              times: 0
            };
            reportData = gasReport[message][contractName];
          }
          reportData.gasUsed += receipt.gasUsed;
          reportData.times += times;
          reportData.average = reportData.gasUsed / reportData.times;
        }
      });
    });
  }, times);
}

reportGas.only = (...args) => reportGas(...args, true);

module.exports = {

  web3,

  gasReport,

  getMigratedContract,

  deployContract: (from, contractName, ...args) => {
    const ContractInfo = rocketh.contractInfo(contractName);
    const Contract = new web3.eth.Contract(ContractInfo.abi, {data: '0x' + ContractInfo.evm.bytecode.object});
    return Contract.deploy({arguments: args}).send({from, gas: deployGas});
  },

  renewContracts: async () => {
    const accounts = await web3.eth.getAccounts();
    const networkId = await web3.eth.net.getId();
    await require('../../../migrations/3_deploy_contracts')(deployer(accounts), networkId, accounts);
    return contracts;
  },

  getContract: (contractName) => {
    return contracts[contractName];
  },

  proxy: (proxyContractName, web3Contract, deployOptions) => {
    return new Promise((resolve, reject) => {
      const ProxyArtifact = artifacts.require(proxyContractName);
      const ProxyContractInfo = ProxyArtifact._json;
      const Proxy = new web3.eth.Contract(ProxyContractInfo.abi, {data: ProxyContractInfo.bytecode});
      Proxy.deploy({arguments: [web3Contract.options.address]}).send(deployOptions)
        .then((deployedContract) => {
          deployedContract.options.jsonInterface = web3Contract.options.jsonInterface; // use abi of proxied contract
          resolve(deployedContract);
        })
        .catch(reject);
    });
  },

  revertToSnapshot: (id) => {
    return new Promise((resolve, reject) => {
      // console.log('reverting to snapshot ' + id + '...');
      web3.currentProvider.sendAsync({
        method: 'evm_revert',
        params: [id],
        jsonrpc: '2.0',
        id: '2'
      }, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  },

  saveSnapshot: () => {
    return new Promise((resolve, reject) => {
      // console.log('snapshot...');
      web3.currentProvider.sendAsync({
        method: 'evm_snapshot',
        params: [],
        jsonrpc: '2.0',
        id: '2'
      }, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result.result);
        }
      });
    });
  },

  increaseTime: (timeInSeconds) => {
    return new Promise((resolve, reject) => {
      web3.currentProvider.sendAsync({
        method: 'evm_increaseTime',
        params: [timeInSeconds],
        jsonrpc: '2.0',
        id: '2'
      }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  mine: () => {
    return new Promise((resolve, reject) => {
      console.log('mining...');
      web3.currentProvider.sendAsync({
        method: 'evm_mine',
        params: [],
        jsonrpc: '2.0',
        id: '2'
      }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  stopAutoMine: () => {
    return new Promise((resolve, reject) => {
      web3.currentProvider.sendAsync({
        method: 'miner_stop',
        params: [],
        jsonrpc: '2.0',
        id: '3'
      }, (err, result) => {
        if (err) {
          console.log('error while calling miner_stop', err);
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  },

  // Took this from https://github.com/OpenZeppelin/zeppelin-solidity/blob/master/test/helpers/expectThrow.js
  // Doesn't seem to work any more :(
  // Changing to use the invalid opcode error instead works
  expectThrow: async (promise) => {
    try {
      await promise;
    } catch (error) {
      // TODO: Check jump destination to destinguish between a throw
      //       and an actual invalid jump.
      const invalidOpcode = error.message.search('invalid opcode') >= 0;
      // TODO: When we contract A calls contract B, and B throws, instead
      //       of an 'invalid jump', we get an 'out of gas' error. How do
      //       we distinguish this from an actual out of gas event? (The
      //       ganache log actually show an 'invalid jump' event.)
      const outOfGas = error.message.search('out of gas') >= 0;
      const revert = error.message.search('revert') >= 0;
      const status0x0 = error.message.search('status": "0x0"') >= 0 ||  error.message.search('status":"0x0"') >= 0; // TODO better
      assert(
        invalidOpcode || outOfGas || revert || status0x0,
        'Expected throw, got \'' + error + '\' instead',
      );
      return;
    }
    if(receipt.status == "0x0") {
      return;
    }
    assert.fail('Expected throw not received');
  },
  gas,
  deployGas,
  toChecksumAddress: Web3.utils.toChecksumAddress,
  getEventsFromReceipt,
  getPastEvents,
  sendSignedTransaction(txData, to, privateKey) {
    const data = txData instanceof Object ? txData.encodeABI() : txData;
    const privateKeyHex = privateKey instanceof Buffer ? ('0x' + privateKey.toString('hex')) : privateKey;
    return web3.eth.accounts.signTransaction({data, to, gas}, privateKeyHex).then((signedTx) => {
      return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    });
  }
};
