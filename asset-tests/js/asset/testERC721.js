const assert = require('assert');
const rocketh = require('rocketh');
const Web3 = require('web3');
const {renewContracts, gas, expectThrow, web3} = require('../utils');
const {getDeployedContract} = require('../../../lib');
const {
  ERC1155TransferEvent,
  mintAndReturnTokenId,
  getEventsMatching
} = require('./utils');

describe('ERC721', () => {
  const ipfsHashString = 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
  let creator;
  let user1;
  let operator;

  before(async () => {
    const accounts = await web3.eth.getAccounts();
    creator = Web3.utils.toChecksumAddress(accounts[0]);
    user1 = Web3.utils.toChecksumAddress(accounts[1]);
    operator = Web3.utils.toChecksumAddress(accounts[3]);
  });

  let contracts = {};
  beforeEach(async () => {
    const deployments = await rocketh.runStages();
    contracts = {};
    for(let deploymentName of Object.keys(deployments)) {
        contracts[deploymentName] = getDeployedContract(deploymentName);
    }
  });
  // beforeEach(async () => {
  //   contracts = await renewContracts();
  // });

  describe('minting', () => {
    it('minting a NFT (supply = 1) results in erc721 transfer event', async () => {
      const receipt = await contracts.Asset.methods.mint(creator, ipfsHashString, 1, creator).send({from: creator, gas});
      const eventSignature = web3.eth.abi.encodeEventSignature('Transfer(address,address,uint256)');
      const eventsMatching = await contracts.Asset.getPastEvents(eventSignature, {
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber
      });
      assert.equal(eventsMatching.length, 1);
    });

    it('minting a MCFT (supply > 1) results in no erc721 transfer event', async () => {
      const receipt = await contracts.Asset.methods.mint(creator, ipfsHashString, 100, creator).send({from: creator, gas});
      const eventSignature = web3.eth.abi.encodeEventSignature('Transfer(address,address,uint256)');
      const eventsMatching = await contracts.Asset.getPastEvents(eventSignature, {
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber
      });
      assert.equal(eventsMatching.length, 0);
    });

    it('minting a NFT results in the uri accessible via tokenURI', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator);
      const tokenURI = await contracts.Asset.methods.tokenURI(tokenId).call();
      assert.equal(tokenURI, ipfsHashString);
    });
  });

  describe('transfers', () => {
    it('transfering one NFT results in one erc721 transfer event', async () => {
      const assetsId = [];
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1000, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1000, creator));
      const receipt = await contracts.Asset.methods.transferFrom(creator, user1, assetsId[2]).send({from: creator, gas});
      const eventSignature = web3.eth.abi.encodeEventSignature('Transfer(address,address,uint256)');
      const eventsMatching = await contracts.Asset.getPastEvents(eventSignature, {
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber
      });
      assert.equal(eventsMatching.length, 1);
    });

    it('transfering one NFT via ERC1155 transfer method results in one erc721 transfer event', async () => {
      const assetsId = [];
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1000, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1000, creator));
      const receipt = await contracts.Asset.methods.transferFrom(creator, user1, assetsId[2], 1).send({from: creator, gas});
      const eventSignature = web3.eth.abi.encodeEventSignature('Transfer(address,address,uint256)');
      const eventsMatching = await contracts.Asset.getPastEvents(eventSignature, {
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber
      });
      assert.equal(eventsMatching.length, 1);
    });
  });

  describe('batch transfers', () => {
    it('transfering one NFT via batch transfer results in one erc721 transfer event', async () => {
      const assetsId = [];
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1000, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1000, creator));
      const receipt = await contracts.Asset.methods.batchTransferFrom(creator, user1, [assetsId[0], assetsId[1], assetsId[4]], [1, 50, 500]).send({from: creator, gas});
      const eventSignature = web3.eth.abi.encodeEventSignature('Transfer(address,address,uint256)');
      const eventsMatching = await contracts.Asset.getPastEvents(eventSignature, {
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber
      });
      assert.equal(eventsMatching.length, 1);
    });
    it('transfering 2 NFT via batch transfer results in 2 erc721 transfer events', async () => {
      const assetsId = [];
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1000, creator));
      assetsId.push(await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1000, creator));

      const receipt = await contracts.Asset.methods.batchTransferFrom(creator, user1, [assetsId[0], assetsId[1], assetsId[2], assetsId[4]], [1, 50, 1, 500]).send({from: creator, gas});

      const eventSignature = web3.eth.abi.encodeEventSignature('Transfer(address,address,uint256)');
      const eventsMatching = await contracts.Asset.getPastEvents(eventSignature, {
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber
      });
      assert.equal(eventsMatching.length, 2);
    });
  });

  describe('approvalForAll', () => {
    it('without approval, operator should not be able to transfer', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator);
      await expectThrow(contracts.Asset.methods.transferFrom(creator, user1, tokenId).send({from: operator, gas}));
    });
    it('after operator setApprovalForAll, operator should be able to transfer', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator);
      await contracts.Asset.methods.setApprovalForAll(operator, true).send({from: creator, gas});
      const receipt = await contracts.Asset.methods.transferFrom(creator, user1, tokenId).send({from: operator, gas});
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, ERC1155TransferEvent);
      assert.equal(eventsMatching.length, 1);
    });
    it('after operator removing setApprovalForAll, operator should not be able to transfer', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator);
      await contracts.Asset.methods.setApprovalForAll(operator, true).send({from: creator, gas});
      await contracts.Asset.methods.transferFrom(creator, user1, tokenId).send({from: operator, gas});
      await contracts.Asset.methods.setApprovalForAll(operator, false).send({from: creator, gas});
      await expectThrow(contracts.Asset.methods.transferFrom(creator, user1, tokenId).send({from: operator, gas}));
    });
  });
});
