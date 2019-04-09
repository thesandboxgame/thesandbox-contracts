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
    expectThrow
} = require('../utils');

const {
    TransferSingleEvent,
    TransferBatchEvent,
    URIEvent
} = require('../erc1155')

const {
    TransferEvent
} = require('../erc721')

const {
    mintAndReturnTokenId,
    mintTokensWithSameURIAndSupply,
    mintTokensIncludingNFTWithSameURI
} = require('../asset-utils');

const creator = accounts[0];
const user1 = accounts[1];
const operator = accounts[2];

const ipfsHashString = 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

function mintERC1155(contract, creator, amount) {
    return mintAndReturnTokenId(contract, ipfsHashString, amount, creator);
}

function runAssetTests(title, resetContract) {
    tap.test(title + ' specific tests', async (t)=> {
        let contract;
        t.beforeEach(async () => {
          contract = await resetContract();
        });
  
        t.test('minting as erc721', async (t) => {
            t.test('minting a NFT (supply = 1) results in erc721 transfer event', async () => {
                const receipt = await tx(contract, 'mint', {from: creator, gas}, creator, 0, ipfsHashString, 1, creator);
                const eventsMatching = await getEventsFromReceipt(contract, TransferEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
        
            t.test('minting a MCFT (supply > 1) results in no erc721 transfer event', async () => {
                const receipt = await tx(contract, 'mint', {from: creator, gas}, creator, 0, ipfsHashString, 100, creator);
                const eventsMatching = await getEventsFromReceipt(contract, TransferEvent, receipt);
                assert.equal(eventsMatching.length, 0);
            });
        
            t.test('minting a NFT results in the uri accessible via tokenURI', async () => {
                const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 1, creator);
                const tokenURI = await call(contract, 'tokenURI', null, tokenId);
                assert.equal(tokenURI, ipfsHashString);
            });
        });

        t.test('minting as ERC1155', async (t) => {
            t.test('minting a MCFT (supply > 1) results in erc1155 transfer event', async () => {
                const receipt = await tx(contract, 'mint', {from: creator, gas}, creator, 0, ipfsHashString, 4, creator);
                const eventsMatching = await getEventsFromReceipt(contract, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
          
            t.test('minting a NFT (supply == 1) results in erc1155 transfer event', async () => {
                const receipt = await tx(contract, 'mint', {from: creator, gas}, creator, 0, ipfsHashString, 1, creator);
                const eventsMatching = await getEventsFromReceipt(contract, TransferSingleEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
        
            t.test('after minting a MCFT I can retrieve the metadata uri via event', async () => {
                const receipt = await tx(contract, 'mint', {from: creator, gas}, creator, 0, ipfsHashString, 4, creator);
                const eventsMatching = await getEventsFromReceipt(contract, URIEvent, receipt);
                assert.equal(eventsMatching[0].returnValues._value, ipfsHashString);
            });
        
            t.test('after minting a NFT I can retrieve the metadata uri via event', async () => {
                const receipt = await tx(contract, 'mint', {from: creator, gas}, creator, 0, ipfsHashString, 1, creator);
                const eventsMatching = await getEventsFromReceipt(contract, URIEvent, receipt);
                assert.equal(eventsMatching[0].returnValues._value, ipfsHashString);
            });
            ////////////////
        
            t.test('after minting multiple MCFT I can retrieve the metadata uri via event', async () => {
                const receipt = await mintTokensWithSameURIAndSupply(contract, 8, ipfsHashString, 10, creator);
                const eventsMatching = await getEventsFromReceipt(contract, URIEvent, receipt);
                for (let i = 0; i < eventsMatching.length; i++) {
                    assert.equal(eventsMatching[i].returnValues._value, ipfsHashString + '_' + i);
                }
            });
        
            t.test('after minting more than 8 different MCFT and I can retrieve the metadata uri via event', async () => {
                const receipt = await mintTokensWithSameURIAndSupply(contract, 10, ipfsHashString, 10, creator);
                const eventsMatching = await getEventsFromReceipt(contract, URIEvent, receipt);
                for (let i = 0; i < eventsMatching.length; i++) {
                    assert.equal(eventsMatching[i].returnValues._value, ipfsHashString + '_' + i);
                }
            });
        
            t.test('after minting a MCFT I can retrieve the creator', async () => {
                const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 10, creator);
                const creatorSaved = await contract.methods.creatorOf(tokenId).call();
                assert.equal(creatorSaved, creator);
            });
        
            t.test('after minting a NFT I can retrieve the creator', async () => {
                const tokenId = await mintAndReturnTokenId(contract, ipfsHashString, 1, creator);
                const creatorSaved = await contract.methods.creatorOf(tokenId).call();
                assert.equal(creatorSaved, creator);
            });
        
            t.test('after minting MCFT along NFT in a multiple mint call, we should retrived their uri in events', async () => {
                const receipt = await mintTokensIncludingNFTWithSameURI(contract, 10, ipfsHashString, 10, 6, creator);
                const eventsMatching = await getEventsFromReceipt(contract, URIEvent, receipt);
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