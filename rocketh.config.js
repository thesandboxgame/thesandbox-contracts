
module.exports = {
    accounts: {
        default: {
            type: "mnemonic",
            num: 10,
        },
        4: {
            type: 'bitski'
        }
    },
    namedAccounts : {
        deployer: 0, // when a number specify fro default the index in accounts
        metaTransactionFundOwner: 0, // TODO
        metaTransactionExecutor: 0,  // TODO
        test : {
            default : "", // empty so not availabe in default mode  // equiavlent to undefined in case of default ?
            deployments: "", // empty means it should not be set (can be used to conditionally create a multi sig for example)
            42: "0x7a5623b0d2d84fd38d84cf5e7b66caba4722456c" // just as an example
        },
        mintingFeeCollector: "sandOwner",
        sandBeneficiary : "sandOwner", // means equal the same as identifier
        sandOwner: {
            default: 0,
            4: 0, // TODO
        },
        others: {
            default: "from:3",
            deployments: ""
        }
    }
}