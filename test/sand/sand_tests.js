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
    getERC20Balance,
} = require('../erc20');


const {
    sandAdmin,
    others,
} = rocketh.namedAccounts


function runSandTests(title, resetContract) {
    tap.test(title + ' specific tests', async (t)=> {
        let contract;
        t.beforeEach(async () => {
            contract = await resetContract();
        });

        t.test('can initSand after being constructed', async (t) => {
            const newAdminProvided = others[0];
            const oldAdmin = await call(contract, 'admin', {});
            await tx(contract, 'initSand', {from: sandAdmin, gas}, newAdminProvided, newAdminProvided);
            const newAdmin = await call(contract, 'admin', {});
            assert.notEqual(newAdminProvided.toLowerCase(), newAdmin.toLowerCase());
            assert.equal(oldAdmin.toLowerCase(), newAdmin.toLowerCase());
        });
    });
}

module.exports = {
    runSandTests
}
