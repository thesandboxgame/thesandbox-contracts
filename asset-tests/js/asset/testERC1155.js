const crypto = require('crypto');
const assert = require('assert');
const rocketh = require('rocketh');
const ethSigUtil = require('eth-sig-util');
const ethUtil = require('ethereumjs-util');
const Web3 = require('web3');
const {gas, expectThrow, web3, sendSignedTransaction} = require('../utils');
const {getDeployedContract} = require('../../../lib');
const {
  URIEvent,
  ERC1155TransferEvent,
  ERC1155TransferBatchEvent,
  mint,
  mintAndReturnTokenId,
  mintTokensWithSameURIAndSupply,
  mintOneAtATimeAndReturnTokenIds,
  mintMultipleAndReturnTokenIds,
  getEventsMatching,
  mintTokensIncludingNFTWithSameURI,
  OfferClaimedEvent,
  OfferCancelledEvent,
  ExtractionEvent
} = require('./utils');

describe('ERC1155', () => {
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
    it('minting a MCFT (supply > 1) results in erc1155 transfer event', async () => {
      const receipt = await mint(contracts.Asset, ipfsHashString, 4, creator);
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, ERC1155TransferEvent);
      assert.equal(eventsMatching.length, 1);
    });

    it('minting a NFT (supply == 1) results in erc1155 transfer event', async () => {
      const receipt = await mint(contracts.Asset, ipfsHashString, 1, creator);
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, ERC1155TransferEvent);
      assert.equal(eventsMatching.length, 1);
    });

    it('after minting a MCFT I can retrieve the metadata uri via event', async () => {
      const receipt = await mint(contracts.Asset, ipfsHashString, 10, creator);
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, URIEvent);
      assert.equal(eventsMatching[0].returnValues._value, ipfsHashString);
    });

    it('after minting a NFT I can retrieve the metadata uri via event', async () => {
      const receipt = await mint(contracts.Asset, ipfsHashString, 1, creator);
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, URIEvent);
      assert.equal(eventsMatching[0].returnValues._value, ipfsHashString);
    });

    it('after minting multiple MCFT I can retrieve the metadata uri via event', async () => {
      const receipt = await mintTokensWithSameURIAndSupply(contracts.Asset, 8, ipfsHashString, 10, creator);
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, URIEvent);
      for (let i = 0; i < eventsMatching.length; i++) {
        assert.equal(eventsMatching[i].returnValues._value, ipfsHashString + '_' + i);
      }
    });

    it('after minting more than 8 different MCFT and I can retrieve the metadata uri via event', async () => {
      const receipt = await mintTokensWithSameURIAndSupply(contracts.Asset, 10, ipfsHashString, 10, creator);
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, URIEvent);
      for (let i = 0; i < eventsMatching.length; i++) {
        assert.equal(eventsMatching[i].returnValues._value, ipfsHashString + '_' + i);
      }
    });

    it('after minting a MCFT I can retrieve the creator', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 10, creator);
      const creatorSaved = await contracts.Asset.methods.creatorOf(tokenId).call();
      assert.equal(creatorSaved, creator);
    });

    it('after minting a NFT I can retrieve the creator', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator);
      const creatorSaved = await contracts.Asset.methods.creatorOf(tokenId).call();
      assert.equal(creatorSaved, creator);
    });

    it('after minting MCFT along NFT in a multiple mint call, we should retrived their uri in events', async () => {
      const receipt = await mintTokensIncludingNFTWithSameURI(contracts.Asset, 10, ipfsHashString, 10, 6, creator);
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, URIEvent);
      for (let i = 0; i < eventsMatching.length; i++) {
        assert.equal(eventsMatching[i].returnValues._value, ipfsHashString + '_' + i);
      }
    });
  });

  describe('transfers', () => {
    it('transfer a NFT results in erc1155 transfer event', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator);
      const receipt = await contracts.Asset.methods.transferFrom(creator, user1, tokenId, 1).send({from: creator, gas});
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, ERC1155TransferEvent);
      assert.equal(eventsMatching.length, 1);
    });
    it('transfer a MCFT results in erc1155 transfer event', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 4, creator);
      const receipt = await contracts.Asset.methods.transferFrom(creator, user1, tokenId, 2).send({from: creator, gas});
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, ERC1155TransferEvent);
      assert.equal(eventsMatching.length, 1);
    });
    it('should not be able to transfer more MCFT than you own', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 4, creator);
      await expectThrow(contracts.Asset.methods.transferFrom(creator, user1, tokenId, 5).send({from: creator, gas}));
    });
    it('should not be able to transfer more than 1 NFT', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator);
      await expectThrow(contracts.Asset.methods.transferFrom(creator, user1, tokenId, 2).send({from: creator, gas}));
    });
  });

  describe('batch transfers', () => {
    it('transfer a NFT results in erc1155 transfer event', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator);
      const receipt = await contracts.Asset.methods.batchTransferFrom(creator, user1, [tokenId], [1]).send({from: creator, gas});
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, ERC1155TransferBatchEvent);
      assert.equal(eventsMatching.length, 1);
    });
    it('transfer a MCFT results in erc1155 transfer event', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 4, creator);
      const receipt = await contracts.Asset.methods.batchTransferFrom(creator, user1, [tokenId], [2]).send({from: creator, gas});
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, ERC1155TransferBatchEvent);
      assert.equal(eventsMatching.length, 1);
    });
    it('should not be able to transfer more MCFT than you own', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 4, creator);
      await expectThrow(contracts.Asset.methods.batchTransferFrom(creator, user1, [tokenId], [5]).send({from: creator, gas}));
    });
    it('should not be able to transfer more than 1 NFT', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator);
      await expectThrow(contracts.Asset.methods.batchTransferFrom(creator, user1, [tokenId], [2]).send({from: creator, gas}));
    });

    it('should be able to transfer NFT and MCFT at the same time', async () => {
      const tokenIds = await mintOneAtATimeAndReturnTokenIds(
        contracts.Asset,
        [ipfsHashString, ipfsHashString, ipfsHashString, ipfsHashString, ipfsHashString, ipfsHashString],
        [100, 12, 1, 12, 200, 10],
        creator);
      const tokenIdsToTransfer = tokenIds.slice(0, tokenIds.length - 2);
      const balancesToTransfer = [50, 12, 1, 6];
      await contracts.Asset.methods.batchTransferFrom(
        creator,
        user1,
        tokenIdsToTransfer,
        balancesToTransfer
      ).send({from: creator, gas});
      for (let i = 0; i < tokenIdsToTransfer.length; i++) {
        const tokenId = tokenIdsToTransfer[i];
        const expectedbalance = balancesToTransfer[i];
        const balance = await contracts.Asset.methods.balanceOf(user1, tokenId).call();
        assert.equal(balance, expectedbalance);
      }
    });

    it('should be able to get balance of batch', async () => {
      const balances = [10, 20, 30, 40, 50, 60, 70, 80];
      const tokenIds = (await mintTokensWithSameURIAndSupply(contracts.Asset, 4, ipfsHashString, balances.slice(0, 4), creator))
        .concat(await mintTokensWithSameURIAndSupply(contracts.Asset, 4, ipfsHashString, balances.slice(4, 8), user1));
      const batchBalances = await contracts.Asset.methods.balanceOfBatch(
        [creator, creator, creator, creator, user1, user1, user1, user1],
        tokenIds
      ).call({from: creator});

      for (let i = 0; i < batchBalances.length; i++) {
        assert.equal(batchBalances[i], balances[i]);
      }
    });
  });

  describe('approvalForAll', () => {
    it('without approval, operator should not be able to transfer', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 4, creator);
      await expectThrow(contracts.Asset.methods.transferFrom(creator, user1, tokenId, 2).send({from: operator, gas}));
    });
    it('after operator setApprovalForAll, operator should be able to transfer', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 4, creator);
      await contracts.Asset.methods.setApprovalForAll(operator, true).send({from: creator, gas});
      const receipt = await contracts.Asset.methods.transferFrom(creator, user1, tokenId, 2).send({from: operator, gas});
      const eventsMatching = await getEventsMatching(contracts.Asset, receipt, ERC1155TransferEvent);
      assert.equal(eventsMatching.length, 1);
    });
    it('after operator removing setApprovalForAll, operator should not be able to transfer', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 10, creator);
      await contracts.Asset.methods.setApprovalForAll(operator, true).send({from: creator, gas});
      await contracts.Asset.methods.transferFrom(creator, user1, tokenId, 2).send({from: operator, gas});
      await contracts.Asset.methods.setApprovalForAll(operator, false).send({from: creator, gas});
      await expectThrow(contracts.Asset.methods.transferFrom(creator, user1, tokenId, 2).send({from: operator, gas}));
    });
  });

  describe('signature', () => {
    const privateKey = ethUtil.sha3('cow');
    const testAddress = Web3.utils.toChecksumAddress(ethUtil.privateToAddress(privateKey).toString('hex'));

    let networkId;
    const domainType = [
      {name: 'name', type: 'string'},
      {name: 'version', type: 'string'},
      {name: 'chainId', type: 'uint256'},
      {name: 'verifyingContract', type: 'address'}
    ];
    const auctionType = [
      {name: 'token', type: 'address'},
      {name: 'offerId', type: 'uint256'},
      {name: 'startingPrice', type: 'uint256'},
      {name: 'endingPrice', type: 'uint256'},
      {name: 'startedAt', type: 'uint256'},
      {name: 'duration', type: 'uint256'},
      {name: 'packs', type: 'uint256'},
      {name: 'ids', type: 'bytes'},
      {name: 'amounts', type: 'bytes'},
    ];
    const domainTypeHash = web3.utils.soliditySha3({type: 'string', value: 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'});
    const auctionTypeHash = web3.utils.soliditySha3({type: 'string', value: 'Auction(address token,uint256 offerId,uint256 startingPrice,uint256 endingPrice,uint256 startedAt,uint256 duration,uint256 packs,bytes ids,bytes amounts)'});
    let domain;

    let ids;
    let offerId;
    let startedAt;
    let duration;
    let packs;
    let amounts;
    let buyAmount;
    let token;
    const startingPrice = web3.utils.toWei('0.25', 'ether');
    const endingPrice = web3.utils.toWei('0.50', 'ether');

    function getDomainData() {
      return {
        name: 'The Sandbox 3D',
        version: '1',
        chainId: networkId,
        verifyingContract: contracts.Asset.options.address,
        salt: '0xaff39a157310c8472aa1e1b079033d4a574d9816330ed82033265f75cf260163'
      };
    }

    function getConcatIdsAndAmounts() {
      let idsConcat = '0x';
      let amountsConcat = '0x';
      // conver to hex, add padding left, remove 0x
      for (let i = 0; i < ids.length; i++) {
        idsConcat += web3.utils.padLeft(web3.utils.toHex(ids[i]), 64).substring(2);
        amountsConcat += web3.utils.padLeft(web3.utils.toHex(amounts[i]), 64).substring(2);
      }
      return {
        ids: idsConcat,
        amounts: amountsConcat
      };
    }

    function getAuctionData() {
      const concats = getConcatIdsAndAmounts();
      return {
        token,
        offerId,
        startingPrice,
        endingPrice,
        startedAt,
        duration,
        packs,
        ids: concats.ids,
        amounts: concats.amounts
      };
    }

    function getSignature() {
      return ethSigUtil.signTypedData(privateKey, {
        data: {
          types: {
            EIP712Domain: domainType,
            Auction: auctionType
          },
          domain: getDomainData(),
          primaryType: 'Auction',
          message: getAuctionData()
        }
      });
    }

    function giveSand(to, amount) {
      return contracts.Sand.methods.transfer(to, amount).send({from: creator, gas: 4000000});
    }

    function approveAsset(from, amount) {
      return contracts.Sand.methods.approve(contracts.Asset.options.address, amount).send({from, gas: 4000000});
    }

    async function giveSandAndApproveAsset(to, amount) {
      await giveSand(to, amount);
      return approveAsset(to, amount);
    }

    beforeEach(async () => {
      networkId = await web3.eth.net.getId();
      domain = web3.utils.soliditySha3(
        {type: 'bytes32', value: domainTypeHash},
        {type: 'bytes32', value: web3.utils.soliditySha3({type: 'string', value: 'The Sandbox 3D'})},
        {type: 'bytes32', value: web3.utils.soliditySha3({type: 'string', value: '1'})},
        {type: 'uint256', value: networkId},
        {type: 'address', value: contracts.Asset.options.address},
        {type: 'bytes32', value: '0xaff39a157310c8472aa1e1b079033d4a574d9816330ed82033265f75cf260163'}
      );

      duration = 1000;
      packs = 1;
      amounts = [1, 2];
      buyAmount = 1;
      token = '0x0000000000000000000000000000000000000000';
      ids = [
        await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator),
        await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 200, creator)
      ];
      offerId = new web3.utils.BN(crypto.randomBytes(32), 16).toString(10);
      startedAt = Math.floor(Date.now() / 1000);
      await contracts.Asset.methods.batchTransferFrom(creator, testAddress, ids, [100, 200]).send({from: creator, gas});
    });

    it('verify domain type hash', async function () {
      if (!contracts.Asset.methods.getDomainTypeHash) {
        this.skip();
      }
      const recoveredDomainTypeHash = await contracts.Asset.methods.getDomainTypeHash().call({from: creator});
      assert.equal(recoveredDomainTypeHash, domainTypeHash);
    });

    it('verify domain', async function () {
      if (!contracts.Asset.methods.getDomainTypeHash) {
        this.skip();
      }
      const recoveredDomain = await contracts.Asset.methods.getDomain().call({from: creator});
      assert.equal(recoveredDomain, domain);
    });

    it('verify auction type hash', async function () {
      if (!contracts.Asset.methods.getDomainTypeHash) {
        this.skip();
      }
      const recoveredAuctionTypeHash = await contracts.Asset.methods.getAuctionTypeHash().call({from: creator});
      assert.equal(recoveredAuctionTypeHash, auctionTypeHash);
    });

    it('verify signature with contract', async function () {
      if (!contracts.Asset.methods.recover) {
        this.skip();
      }

      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];
      const signature = await getSignature();
      const recoveredAddress = await contracts.Asset.methods
        .recover(token, auctionData, ids, amounts, signature)
        .call({from: testAddress});
      assert.equal(recoveredAddress, testAddress);
    });

    it('should be able to claim seller offer in ETH', async () => {
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];
      const signature = await getSignature();
      const receipt = await contracts.Asset.methods
        .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
        .send({from: user1, value: endingPrice, gas: 4000000});
      assert.equal((await getEventsMatching(contracts.Asset, receipt, OfferClaimedEvent)).length, 1);
      const transferReceipts = await getEventsMatching(contracts.Asset, receipt, ERC1155TransferBatchEvent);
      assert.equal(transferReceipts.length, 1);
      assert.equal(transferReceipts[0].returnValues._ids.length, 2);
    });

    it('should be able to claim seller offer in SAND', async () => {
      token = contracts.Sand.options.address;
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];

      await giveSandAndApproveAsset(user1, endingPrice);

      const signature = await getSignature();
      const receipt = await contracts.Asset.methods
        .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
        .send({from: user1, value: 0, gas: 4000000});
      assert.equal((await getEventsMatching(contracts.Sand, receipt, web3.eth.abi.encodeEventSignature('Transfer(address,address,uint256)'))).length, 1);
      assert.equal((await getEventsMatching(contracts.Asset, receipt, OfferClaimedEvent)).length, 1);
      const transferReceipts = await getEventsMatching(contracts.Asset, receipt, ERC1155TransferBatchEvent);
      assert.equal(transferReceipts.length, 1);
      assert.equal(transferReceipts[0].returnValues._ids.length, 2);
    });

    it('should own the amount of tokens bought', async () => {
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];
      const signature = await getSignature();
      await contracts.Asset.methods
        .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
        .send({from: user1, value: endingPrice, gas: 4000000});

      for (let i = 0; i < ids.length; i++) {
        const tokenBalance = await contracts.Asset.methods.balanceOf(user1, ids[i]).call({from: user1});
        assert.equal(tokenBalance, buyAmount * amounts[i]);
      }
    });

    it('should seller have correct ETH balance', async () => {
      packs = 100;
      buyAmount = 5;
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];

      const balanceBefore = await web3.eth.getBalance(testAddress);
      const signature = await getSignature();
      await contracts.Asset.methods
        .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
        .send({from: user1, value: endingPrice * buyAmount, gas: 4000000});
      const balanceAfter = await web3.eth.getBalance(testAddress);
      const balance = new Web3.utils.BN(balanceAfter).sub(new Web3.utils.BN(balanceBefore));
      const packValueMin = new Web3.utils.BN(startingPrice).mul(new Web3.utils.BN(buyAmount));
      const packValueMax = new Web3.utils.BN(endingPrice).mul(new Web3.utils.BN(buyAmount));
      assert(balance.gte(packValueMin));
      assert(balance.lte(packValueMax));
    });

    it('should seller have correct SAND balance', async () => {
      packs = 100;
      buyAmount = 5;
      token = contracts.Sand.options.address;
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];

      await giveSandAndApproveAsset(user1, endingPrice * buyAmount);

      const balanceBefore = await contracts.Sand.methods.balanceOf(testAddress).call({from: user1});
      const signature = await getSignature();
      await contracts.Asset.methods
        .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
        .send({from: user1, value: 0, gas: 4000000});
      const balanceAfter = await contracts.Sand.methods.balanceOf(testAddress).call({from: user1});
      const balance = new Web3.utils.BN(balanceAfter).sub(new Web3.utils.BN(balanceBefore));
      const packValueMin = new Web3.utils.BN(startingPrice).mul(new Web3.utils.BN(buyAmount));
      const packValueMax = new Web3.utils.BN(endingPrice).mul(new Web3.utils.BN(buyAmount));
      assert(balance.gte(packValueMin));
      assert(balance.lte(packValueMax));
    });

    it('should be able to cancel offer', async () => {
      const receipt = await contracts.Asset.methods
        .cancelSellerOffer(offerId)
        .send({from: creator, gas: 4000000});
      assert.equal((await getEventsMatching(contracts.Asset, receipt, OfferCancelledEvent)).length, 1);
    });

    it('should NOT be able to claim more offers than what it was signed', async () => {
      buyAmount = 2;
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];
      const signature = await getSignature();
      await contracts.Asset.methods
        .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
        .send({from: user1, value: endingPrice, gas: 4000000})
        .then(() => assert(false, 'was able to claim offer'))
        .catch((err) => assert(err.toString().includes('Buy amount exceeds sell amount'), 'Error message does not match. ' + err.toString()));
    });

    it('should NOT be able to claim cancelled offer', async () => {
      // add balance to testAddress
      await web3.eth.sendTransaction({from: creator, to: testAddress, value: web3.utils.toWei('1', 'ether'), gas});
      // cancel offer through signed transaction
      await sendSignedTransaction(contracts.Asset.methods.cancelSellerOffer(offerId), contracts.Asset.options.address, privateKey);

      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];
      const signature = await getSignature();

      await contracts.Asset.methods
        .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
        .send({from: user1, value: endingPrice, gas: 4000000})
        .then(() => assert(false, 'was able to claim offer'))
        .catch((err) => assert(err.toString().includes('Auction cancelled'), 'Error message does not match. ' + err.toString()));
    });

    it('should NOT be able to claim offer without sending ETH', async () => {
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];
      const signature = await getSignature();
      await expectThrow(
        contracts.Asset.methods
          .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
          .send({from: user1, value: 0, gas: 4000000})
      );
    });

    it('should NOT be able to claim offer without enough SAND', async () => {
      token = contracts.Sand.options.address;
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];

      const signature = await getSignature();
      await expectThrow(
        contracts.Asset.methods
          .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
          .send({from: user1, gas: 4000000})
      );
    });

    it('should NOT be able to claim offer if signature mismatches', async () => {
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];
      const signature = await getSignature();
      auctionData[0] = '12398764192673412346';
      await contracts.Asset.methods
        .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
        .send({from: user1, gas: 4000000})
        .then(() => assert(false, 'was able to claim offer'))
        .catch((err) => assert(err.toString().includes('Signature mismatches'), 'Error message does not match. ' + err.toString()));
    });

    it('should NOT be able to claim offer if it did not start yet', async () => {
      startedAt = Math.floor(Date.now() / 1000) + 1000;
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];
      const signature = await getSignature();
      await contracts.Asset.methods
        .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
        .send({from: user1, gas: 4000000})
        .then(() => assert(false, 'was able to claim offer'))
        .catch((err) => assert(err.toString().includes('Auction didn\'t start yet'), 'Error message does not match. ' + err.toString()));
    });

    it('should NOT be able to claim offer if it already ended', async () => {
      startedAt = Math.floor(Date.now() / 1000) - 10000;
      const auctionData = [offerId, startingPrice, endingPrice, startedAt, duration, packs];
      const signature = await getSignature();
      await contracts.Asset.methods
        .claimSellerOffer(user1, testAddress, token, buyAmount, auctionData, ids, amounts, signature)
        .send({from: user1, gas: 4000000})
        .then(() => assert(false, 'was able to claim offer'))
        .catch((err) => assert(err.toString().includes('Auction finished'), 'Error message does not match. ' + err.toString()));
    });
  });

  describe('extraction', () => {
    it('should be able to extract an NFT (1 ERC1155 value -> 1 ERC721)', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator);
      const receipt = await contracts.Asset.methods.extractERC1155(tokenId, ipfsHashString).send({from: creator, gas});
      assert.equal((await getEventsMatching(contracts.Asset, receipt, ExtractionEvent)).length, 1);
    });

    it('should work with mintMultiple', async () => {
      const uris = [ipfsHashString + '_1', ipfsHashString + '_2'];
      const tokenIds = await mintMultipleAndReturnTokenIds(contracts.Asset, uris, [10, 20], creator);

      const receipt1 = await contracts.Asset.methods.extractERC1155(tokenIds[0], uris[0]).send({from: creator, gas});
      assert.equal((await getEventsMatching(contracts.Asset, receipt1, ExtractionEvent)).length, 1);

      const receipt2 = await contracts.Asset.methods.extractERC1155(tokenIds[1], uris[1]).send({from: creator, gas});
      assert.equal((await getEventsMatching(contracts.Asset, receipt2, ExtractionEvent)).length, 1);
    });

    it('should decrease balance by one', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator);
      const balanceBefore = await contracts.Asset.methods.balanceOf(creator, tokenId).call({from: creator});
      await contracts.Asset.methods.extractERC1155(tokenId, ipfsHashString).send({from: creator, gas});
      const balanceAfter = await contracts.Asset.methods.balanceOf(creator, tokenId).call({from: creator});
      assert.equal(balanceAfter, balanceBefore - 1);
    });

    it('should burn one token balance', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator);
      await contracts.Asset.methods.extractERC1155(tokenId, ipfsHashString).send({from: creator, gas});
      const balanceBurnt = await contracts.Asset.methods.balanceOf(0, tokenId).call({from: creator});
      assert.equal(balanceBurnt, 1);
    });

    it('should be owner, extractor', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator);
      const receipt = await contracts.Asset.methods.extractERC1155(tokenId, ipfsHashString).send({from: creator, gas});

      const extractionEvent = await getEventsMatching(contracts.Asset, receipt, ExtractionEvent);

      const ownerOf = await contracts.Asset.methods.ownerOf(extractionEvent[0].returnValues._toId).call({from: creator});
      assert.equal(ownerOf, creator);
    });

    it('should have same ipfsHash', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator);
      const receipt = await contracts.Asset.methods.extractERC1155(tokenId, ipfsHashString).send({from: creator, gas});

      const extractionEvent = await getEventsMatching(contracts.Asset, receipt, ExtractionEvent);

      const extractedIpfsHash = await contracts.Asset.methods.tokenURI(extractionEvent[0].returnValues._toId).call({from: creator});
      assert.equal(extractedIpfsHash, ipfsHashString);
    });

    it('should be able to extract if not creator', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator);
      await contracts.Asset.methods.transferFrom(creator, user1, tokenId, 1).send({from: creator, gas});
      const receipt = await contracts.Asset.methods.extractERC1155(tokenId, ipfsHashString).send({from: user1, gas});

      const extractionEvent = await getEventsMatching(contracts.Asset, receipt, ExtractionEvent);

      const ownerOf = await contracts.Asset.methods.ownerOf(extractionEvent[0].returnValues._toId).call({from: user1});
      assert.equal(ownerOf, user1);
    });

    it('should have same creator', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator);
      await contracts.Asset.methods.transferFrom(creator, user1, tokenId, 1).send({from: creator, gas});
      const receipt = await contracts.Asset.methods.extractERC1155(tokenId, ipfsHashString).send({from: user1, gas});

      const extractionEvent = await getEventsMatching(contracts.Asset, receipt, ExtractionEvent);

      const creatorOf = await contracts.Asset.methods.creatorOf(extractionEvent[0].returnValues._toId).call({from: user1});
      assert.equal(creatorOf, creator);
    });

    it('should NOT extract an ERC721', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator);
      await contracts.Asset.methods.extractERC1155(tokenId, ipfsHashString)
        .send({from: creator, gas})
        .then(() => assert(false, 'was able to extract NFT'))
        .catch((err) => assert(err.toString().includes('Not an ERC1155 Token'), 'Error message does not match. ' + err.toString()));
    });

    it('should NOT extract with wrong uri', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator);
      await contracts.Asset.methods.extractERC1155(tokenId, 'clearly wrong uri')
        .send({from: creator, gas})
        .then(() => assert(false, 'was able to extract NFT'))
        .catch((err) => assert(err.toString().includes('URI hash does not match'), 'Error message does not match. ' + err.toString()));
    });

    it('should NOT extract an NFT if no balance', async () => {
      const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 100, creator);
      await expectThrow(contracts.Asset.methods.extractERC1155(tokenId, ipfsHashString).send({from: user1, gas}));
    });
  });

  // TODO
  // - receiver
  // - getters :
  //   - balanceOf
  //   - supply..
  //   - isApproved...
  //   - tokenURI
});
