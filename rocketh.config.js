
module.exports = {
    contractSrcPath: ['src', 'contracts_common/src'],
    deploymentChainIds: ['1','3','4','42','18'],
    accounts: {
        default: {
            type: "mnemonic",
            num: 10,
        }
    },
    namedAccounts : {
        deployer: 0, // deploy contracts and make sure they are set up correctly
        metaTransactionFundOwner: 0, // TODO
        metaTransactionExecutor: 0,  // TODO
        mintingFeeCollector: "sandAdmin", // will receiver the fee from Asset minting
        sandBeneficiary : "sandAdmin", // will be the owner of all initial SAND
        sandUpgrader : "sandAdmin", // can upgrade the Sand smart contract and change the upgrader
        sandAdmin: 0,
        assetAdmin: "sandAdmin", // can add super operator and change admin to Asset
        others: {
            default: "from:3",
            deployments: ""
        }
    }
}