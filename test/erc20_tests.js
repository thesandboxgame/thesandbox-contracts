const tap = require('tap');
const assert = require('assert');
const BN = require('bn.js');
const rocketh = require('rocketh');
const accounts = rocketh.accounts;

const {
    gas,
    expectThrow,
    getEventsFromReceipt,
    getPastEvents,
    toChecksumAddress,
    zeroAddress,
} = require('./utils');
  
const {
    MintedEvent,
    SentEvent,
    BurnedEvent,
} = require('./erc777');

const {
    ApproveEvent,
    transfer,
    transferFrom,
    getERC20Balance,
    getERC20Allowance,
    burn,
    approve,
    TransferEvent,
} = require('./erc20');


const creator = toChecksumAddress(accounts[0]);
const sandOwner = creator;
const user2 = toChecksumAddress(accounts[2]);
const operator = toChecksumAddress(accounts[4]);

function runERC20Tests(title, resetContract, {shouldEmitERC777Events, initialOwner, initialBalance, totalSupply, testBurn}) {
    const user1 = initialOwner || toChecksumAddress(accounts[1]);
    initialBalance = initialBalance || 1000000;
    totalSupply = totalSupply || '3000000000000000000000000000';
    tap.test(title + ' as ERC20', async (t) => {

        let contract;
        t.beforeEach(async () => {
            contract = await resetContract();
        });

        t.test('deploy should emit Transfer event', async () => {
            const contract = await resetContract();
            const events = await getPastEvents(contract, TransferEvent);
            assert.equal(events[0].returnValues[0], '0x0000000000000000000000000000000000000000');
            assert.equal(events[0].returnValues[1], sandOwner);
            assert.equal(events[0].returnValues[2], totalSupply);
        });

        t.test('transfering from user1 to user2 should adjust their balance accordingly', async () => {
            await transfer(contract, user2, '1000', {from: user1, gas});
            const user1Balance = await getERC20Balance(contract, user1);
            const user2Balance = await getERC20Balance(contract, user2);
            assert.equal(user2Balance.toString(10), '1000');
            assert.equal(user1Balance.toString(10), new BN(initialBalance).sub(new BN('1000')).toString(10));
        });

        t.test('transfering from user1 more token that it owns should fails', async () => {
            await expectThrow(transfer(contract, user2, new BN(initialBalance).add(new BN('1000')).toString(10), {from: user1, gas}));
        });

        t.test('transfering to address zero should fails', async () => {
            await expectThrow(transfer(contract, zeroAddress, '1000', {from: user1, gas}));
        });

        t.test('transfering to address zero should fails', async () => {
            await expectThrow(transfer(contract, zeroAddress, '1000', {from: user1, gas}));
        });

        t.test('transfering from user1 to user2 by user1 should adjust their balance accordingly', async () => {
            await transferFrom(contract, user1, user2, '1000', {from: user1, gas});
            const user1Balance = await getERC20Balance(contract, user1);
            const user2Balance = await getERC20Balance(contract, user2);
            assert.equal(user2Balance.toString(10), '1000');
            assert.equal(user1Balance.toString(10), new BN(initialBalance).sub(new BN('1000')).toString(10));
        });

        t.test('transfering from user1 by user2 should fails', async () => {
            await expectThrow(transferFrom(contract, user1, user2, '1000', {from: user2, gas}));
        });

        t.test('transfering from user1 to user2 should trigger a transfer event', async () => {
            const receipt = await transfer(contract, user2, '1000', {from: user1, gas});
            const events = await getEventsFromReceipt(contract, TransferEvent, receipt);
            assert.equal(events[0].returnValues[0], user1);
            assert.equal(events[0].returnValues[1], user2);
            assert.equal(events[0].returnValues[2], '1000');
        });

        t.test('transfering from user1 to user2 by operator after approval, should adjust their balance accordingly', async () => {
            await approve(contract, operator, '1000', {from: user1, gas});
            await transferFrom(contract, user1, user2, '1000', {from: operator, gas});
            const user1Balance = await getERC20Balance(contract, user1);
            const user2Balance = await getERC20Balance(contract, user2);
            assert.equal(user2Balance.toString(10), '1000');
            assert.equal(user1Balance.toString(10), new BN(initialBalance).sub(new BN('1000')).toString(10));
        });
        t.test('transfering from user1 to user2 by operator after approval and approval reset, should fail', async () => {
            await approve(contract, operator, '1000', {from: user1, gas});
            await approve(contract, operator, '0', {from: user1, gas});
            await expectThrow(transferFrom(contract, user1, user2, '1000', {from: operator, gas}));
        });
        t.test('transfering from user1 to user2 by operator after approval, should adjust the operator alowance accordingly', async () => {
            await approve(contract, operator, '1010', {from: user1, gas});
            await transferFrom(contract, user1, user2, '1000', {from: operator, gas});
            const allowance = await getERC20Allowance(contract, user1, operator);
            assert.equal(allowance.toString(10), '10');
        });
        t.test('transfering from user1 to user2 by operator after max approval (2**256-1), should NOT adjust the operator allowance', async () => {
            await approve(contract, operator, '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', {from: user1, gas});
            await transferFrom(contract, user1, user2, '1000', {from: operator, gas});
            const allowance = await getERC20Allowance(contract, user1, operator);
            assert.equal(allowance.toString('hex'), 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
        });
        t.test('transfering from user1 to user2 by operator after approval, but without enough allowance, should fails', async () => {
            await approve(contract, operator, '1010', {from: user1, gas});
            await expectThrow(transferFrom(contract, user1, user2, '2000000', {from: operator, gas}));
        });
        t.test('transfering from user1 by operators without pre-approval should fails', async () => {
            await expectThrow(transferFrom(contract, user1, user2, '1000', {from: operator, gas}));
        });
        t.test('approving operator should trigger a Approval event', async () => {
            const receipt = await approve(contract, operator, '1000', {from: user1, gas});
            const events = await getEventsFromReceipt(contract, ApproveEvent, receipt);
            assert.equal(events[0].returnValues[2], '1000');
        });
        t.test('disapproving operator (allowance to zero) should trigger a Approval event', async () => {
            const receipt = await approve(contract, operator, '0', {from: user1, gas});
            const events = await getEventsFromReceipt(contract, ApproveEvent, receipt);
            assert.equal(events[0].returnValues[2], '0');
        });

        t.test('approve to address zero should fails', async () => {
            await expectThrow(approve(contract, zeroAddress, '1000', {from: user1, gas}));
        });

        if(testBurn) {
            t.test('burn', async (t) => {
                t.test('burn should emit erc20 transfer event to zero address', async () => {
                const receipt = await burn(contract, '1000', {from: user1, gas});
                const events = await getEventsFromReceipt(contract, TransferEvent, receipt);
                assert.equal(events[0].returnValues[0], user1);
                assert.equal(events[0].returnValues[1], '0x0000000000000000000000000000000000000000');
                assert.equal(events[0].returnValues[2], '1000');
                });
    
                if(shouldEmitERC777Events) {
                    t.test('burn should emit erc777 Burned event', async () => {
                        const receipt = await burn(contract, '1000', {from: user1, gas});
                        const events = await getEventsFromReceipt(contract, BurnedEvent, receipt);
                        assert.equal(events[0].returnValues[0], user1);
                        assert.equal(events[0].returnValues[1], user1);
                        assert.equal(events[0].returnValues[2], '1000');
                        assert.equal(events[0].returnValues[3], null);
                        assert.equal(events[0].returnValues[4], null);
                    });
                }
            
                t.test('burning more token that a user owns should fails', async () => {
                await expectThrow(burn(contract, '2000000', {from: user1, gas}));
                });
            });
        }
        

        if(shouldEmitERC777Events) {
            t.test('transfering from user1 to user2 should trigger a ERC777 Sent event', async () => {
                const receipt = await transfer(contract, user2, '1000', {from: user1, gas});
                const events = await getEventsFromReceipt(contract, SentEvent, receipt);
                assert.equal(events[0].returnValues[0], user1);
                assert.equal(events[0].returnValues[1], user1);
                assert.equal(events[0].returnValues[2], user2);
                assert.equal(events[0].returnValues[3], '1000');
                assert.equal(events[0].returnValues[4], null);
                assert.equal(events[0].returnValues[5], null);
            });

        
            t.test('deploy should emit ERC777 Minted event', async () => {
                const contract = await resetContract();
                const events = await getPastEvents(contract, MintedEvent);
                assert.equal(events[0].returnValues[0], creator);
                assert.equal(events[0].returnValues[1], sandOwner);
                assert.equal(events[0].returnValues[2], totalSupply);
                assert.equal(events[0].returnValues[3], null);
            });
        }
    });
}

module.exports = {
    runERC20Tests,
}
