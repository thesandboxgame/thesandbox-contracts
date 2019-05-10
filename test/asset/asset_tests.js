const BN = require('bn.js');
const tap = require('tap');
const assert = require('assert');
const rocketh = require('rocketh');
const accounts = rocketh.accounts;

const {
    getEventsFromReceipt,
    encodeEventSignature,
    tx,
    call,
    gas,
    expectThrow,
    zeroAddress,
    deployContract,
    emptyBytes,
} = require('../utils');

const {
    TransferSingleEvent,
    TransferBatchEvent,
    URIEvent
} = require('../erc1155');

const {
    getERC20Balance,
} = require('../erc20');

const {
    TransferEvent
} = require('../erc721');

const {
    mintAndReturnTokenId,
    mintTokensWithSameURIAndSupply,
    mintTokensIncludingNFTWithSameURI
} = require('../asset-utils');

const CreatorEvent = encodeEventSignature('Creator(uint256,address)');

const {
    sandAdmin,
    others,
    mintingFeeCollector,
} = rocketh.namedAccounts

const creator = others[0];
const user1 = others[1];
const operator = others[2];
const newFeeCollector = others[3];
const feeCollectorOwner = others[4];

const ipfsHashString = 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

function runAssetTests(title, resetContracts, fixedID = 0) {
    tap.test(title + ' specific tests', async (t)=> {
        let contracts;
        t.beforeEach(async () => {
          contracts = await resetContracts();
        });
  
        t.test('minting as erc721', async (t) => {
            t.test('minting a NFT (supply = 1) results in erc721 transfer event', async () => {
                const receipt = await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, fixedID, ipfsHashString, 1, creator, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contracts.Asset, TransferEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });

            // t.test('minting a NFT (supply = 1) results in Creator event', async () => {
            //     const receipt = await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 0, ipfsHashString, 1, creator, emptyBytes);
            //     const transferEvents = await getEventsFromReceipt(contracts.Asset, TransferEvent, receipt);
            //     const tokenId = transferEvents[0].returnValues[2];

            //     const eventsMatching = await getEventsFromReceipt(contracts.Asset, CreatorEvent, receipt);
            //     assert.equal(eventsMatching.length, 1);
            //     const eventValues = eventsMatching[0].returnValues;
            //     assert.equal(eventValues[0], tokenId);
            //     assert.equal(eventValues[1], creator);
            // });
        
            t.test('minting a MCFT (supply > 1) results in no erc721 transfer event', async () => {
                const receipt = await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, fixedID, ipfsHashString, 100, creator, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contracts.Asset, TransferEvent, receipt);
                assert.equal(eventsMatching.length, 0);
            });

            t.test('when fee are enabled minting results the fee collector getting it', async () => {
                const mintingFee = 100;
                await tx(contracts.Sand, 'transfer', {from: sandAdmin, gas}, creator, "1000");
                await tx(contracts.Asset, 'setFeeCollection', {from: mintingFeeCollector, gas}, newFeeCollector, mintingFee);
                await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 100, fixedID, ipfsHashString, 1, creator, emptyBytes);
                const balance = await getERC20Balance(contracts.Sand, newFeeCollector);
                assert.equal(balance, mintingFee);
            });

            t.test('when fee are enabled minting results the fee collector contract getting it', async () => {
                const mintingFee = 100;
                const receiverContract = await deployContract(creator, 'TestMintingFeeCollector', feeCollectorOwner, contracts.Asset.options.address);
                const receiverAddress = receiverContract.options.address;
                await tx(contracts.Sand, 'transfer', {from: sandAdmin, gas}, creator, "1000");
                await tx(contracts.Asset, 'setFeeCollection', {from: mintingFeeCollector, gas}, receiverAddress, mintingFee);
                await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 100, fixedID, ipfsHashString, 1, creator, emptyBytes);
                const balance = await getERC20Balance(contracts.Sand, receiverAddress);
                assert.equal(balance, mintingFee);
            });
        
            t.test('minting a NFT results in the uri accessible via tokenURI', async () => {
                const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator, fixedID);
                const tokenURI = await call(contracts.Asset, 'tokenURI', null, tokenId);
                assert.equal(tokenURI, ipfsHashString);
            });
        });

        t.test('minting as ERC1155', async (t) => {
            t.test('minting a MCFT (supply > 1) results in erc1155 transfer event', async () => {
                const receipt = await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, fixedID, ipfsHashString, 4, creator, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contracts.Asset, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });

            // t.test('minting a NFT (supply > 1) results in Creator event', async () => {
            //     const receipt = await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, 0, ipfsHashString, 4, creator, emptyBytes);
            //     const transferEvents = await getEventsFromReceipt(contracts.Asset, TransferSingleEvent, receipt);
            //     const tokenId = transferEvents[0].returnValues[3];

            //     const eventsMatching = await getEventsFromReceipt(contracts.Asset, CreatorEvent, receipt);
            //     assert.equal(eventsMatching.length, 1);
            //     const eventValues = eventsMatching[0].returnValues;
            //     assert.equal(eventValues[0], tokenId);
            //     assert.equal(eventValues[1], creator);
            // });
          
            t.test('minting a NFT (supply == 1) results in erc1155 transfer event', async () => {
                const receipt = await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, fixedID, ipfsHashString, 1, creator, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contracts.Asset, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
        
            t.test('after minting a MCFT I can retrieve the metadata uri via event', async () => {
                const receipt = await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, fixedID, ipfsHashString, 4, creator, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contracts.Asset, URIEvent, receipt);
                assert.equal(eventsMatching[0].returnValues._value, ipfsHashString);
            });
        
            t.test('after minting a NFT I can retrieve the metadata uri via event', async () => {
                const receipt = await tx(contracts.Asset, 'mint', {from: creator, gas}, creator, 0, fixedID, ipfsHashString, 1, creator, emptyBytes);
                const eventsMatching = await getEventsFromReceipt(contracts.Asset, URIEvent, receipt);
                assert.equal(eventsMatching[0].returnValues._value, ipfsHashString);
            });
            ////////////////
        
            t.test('after minting multiple MCFT I can retrieve the metadata uri via event', async () => {
                const receipt = await mintTokensWithSameURIAndSupply(contracts.Asset, 8, ipfsHashString, 10, creator, fixedID);
                const eventsMatching = await getEventsFromReceipt(contracts.Asset, URIEvent, receipt);
                for (let i = 0; i < eventsMatching.length; i++) {
                    assert.equal(eventsMatching[i].returnValues._value, ipfsHashString + '_' + i);
                }
            });

            t.test('minting multiple MCFT results in one TransferBatchEvent', async () => {
                const receipt = await mintTokensWithSameURIAndSupply(contracts.Asset, 8, ipfsHashString, 10, creator, fixedID);
                const eventsMatching = await getEventsFromReceipt(contracts.Asset, TransferBatchEvent, receipt);
                assert.equal(eventsMatching.length, 1);
                const eventValues = eventsMatching[0].returnValues;
                assert.equal(eventValues[0], creator);
                assert.equal(eventValues[1], zeroAddress);
                assert.equal(eventValues[2], creator);
                // TODO
                // assert.equal(eventValues[3], ids);
                // assert.equal(eventValues[4], supplies);
            });

            // t.test('minting multiple MCFT results in x CreatorEvent', async () => {
            //     const receipt = await mintTokensWithSameURIAndSupply(contracts.Asset, 8, ipfsHashString, 10, creator, fixedID);
            //     const eventsMatching = await getEventsFromReceipt(contracts.Asset, CreatorEvent, receipt);
            //     assert.equal(eventsMatching.length, 8);
            // });
        
            t.test('after minting more than 8 different MCFT and I can retrieve the metadata uri via event', async () => {
                const receipt = await mintTokensWithSameURIAndSupply(contracts.Asset, 10, ipfsHashString, 10, creator, fixedID);
                const eventsMatching = await getEventsFromReceipt(contracts.Asset, URIEvent, receipt);
                for (let i = 0; i < eventsMatching.length; i++) {
                    assert.equal(eventsMatching[i].returnValues._value, ipfsHashString + '_' + i);
                }
            });
        
            t.test('after minting a MCFT I can retrieve the creator', async () => {
                const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 10, creator, fixedID);
                const creatorSaved = await contracts.Asset.methods.creatorOf(tokenId).call();
                assert.equal(creatorSaved, creator);
            });
        
            t.test('after minting a NFT I can retrieve the creator', async () => {
                const tokenId = await mintAndReturnTokenId(contracts.Asset, ipfsHashString, 1, creator, fixedID);
                const creatorSaved = await contracts.Asset.methods.creatorOf(tokenId).call();
                assert.equal(creatorSaved, creator);
            });
        
            t.test('after minting MCFT along NFT in a multiple mint call, we should retrived their uri in events', async () => {
                const receipt = await mintTokensIncludingNFTWithSameURI(contracts.Asset, 10, ipfsHashString, 10, 6, creator, fixedID);
                const eventsMatching = await getEventsFromReceipt(contracts.Asset, URIEvent, receipt);
                assert.equal(eventsMatching.length, 10+6);
                for (let i = 0; i < eventsMatching.length; i++) {
                    assert.equal(eventsMatching[i].returnValues._value, ipfsHashString + '_' + i);
                }
            });
        });
    });
}

module.exports = {
    runAssetTests
}