const BN = require('bn.js');
const tap = require('tap');
const assert = require('assert');
const rocketh = require('rocketh');
const accounts = rocketh.accounts;

const {
    getEventsFromReceipt,
    encodeEventSignature,
    tx,
    gas,
    call,
    expectThrow
} = require('./utils');

// const {
//     TransferSingleEvent,
//     TransferBatchEvent,
//     URIEvent
// } = require('./erc1155')

const {
    TransferEvent
} = require('./erc721')

const creator = accounts[0];
const user1 = accounts[1];
const operator = accounts[2];

function runDualERC1155ERC721tests(title, resetContract, mintDual) {
    tap.test(title, async (t)=> {
        let contract;
        let assetsId;
        t.beforeEach(async () => {
            contract = await resetContract();
            assetsId = [];
            assetsId.push(await mintDual(contract, creator, 10));
            assetsId.push(await mintDual(contract, creator, 1));
            assetsId.push(await mintDual(contract, creator, 5));
            assetsId.push(await mintDual(contract, creator, 1));
            assetsId.push(await mintDual(contract, creator, 15));
            assetsId.push(await mintDual(contract, creator, 1));
        });     
  
        t.test('transfers', async (t) => {
            t.test('transfering one NFT via ERC1155 transfer method results in one erc721 transfer event', async () => {
                const receipt = await tx(contract, 'transferFrom', {from: creator, gas}, creator, user1, assetsId[1], 1);
                const eventsMatching = await getEventsFromReceipt(contract, TransferEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });

            t.test('transfering one MFT via ERC1155 transfer method should result in no erc721 transfer event', async () => {
                const receipt = await tx(contract, 'transferFrom', {from: creator, gas}, creator, user1, assetsId[0], 1);
                const eventsMatching = await getEventsFromReceipt(contract, TransferEvent, receipt);
                assert.equal(eventsMatching.length, 0);
            });

            t.test('transfering one MFT via ERC721 transfer should fails', async () => {
                await expectThrow(tx(contract, 'transferFrom', {from: creator, gas}, creator, user1, assetsId[0]));
            });
        });

        t.test('NFT batch transfers', async (t) => {
            t.test('transfering one NFT via batch transfer results in one erc721 transfer event', async () => {
                const receipt = await tx(contract, 'batchTransferFrom', {from: creator, gas}, 
                    creator, user1, [assetsId[1], assetsId[0], assetsId[4]], [1, 5, 10]);
                const eventsMatching = await getEventsFromReceipt(contract, TransferEvent, receipt);
                assert.equal(eventsMatching.length, 1);         
            });
            t.test('transfering 2 NFT via batch transfer results in 2 erc721 transfer events', async () => {
                const receipt = await tx(contract, 'batchTransferFrom', {from: creator, gas}, 
                    creator, user1, [assetsId[1], assetsId[3], assetsId[4]], [1, 1, 10]);
                const eventsMatching = await getEventsFromReceipt(contract, TransferEvent, receipt);
                assert.equal(eventsMatching.length, 2);
            });
        });
        
        t.test('NFT approvalForAll', async (t) => {
            t.test('without approval, operator should not be able to transfer', async () => {
                await expectThrow(tx(contract, 'transferFrom', {from: operator, gas}, creator, user1, assetsId[1]));
            });
            t.test('after operator setApprovalForAll, operator should be able to transfer', async () => {
                await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, true);
                const receipt = await tx(contract, 'transferFrom', {from: operator, gas}, creator, user1, assetsId[1]);
                const eventsMatching = await getEventsFromReceipt(contract, TransferEvent, receipt);
                assert.equal(eventsMatching.length, 1);
            });
            t.test('after removing setApprovalForAll, operator should not be able to transfer', async () => {
                await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, true);
                await tx(contract, 'setApprovalForAll', {from: creator, gas}, operator, false);
                await expectThrow(tx(contract, 'transferFrom', {from: operator, gas}, creator, user1, assetsId[1], 1));
            });
        });
    });
}

module.exports = {
    runDualERC1155ERC721tests
}