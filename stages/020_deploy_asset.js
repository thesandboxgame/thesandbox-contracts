const Web3 = require('web3');
const rocketh = require('rocketh');
const {
    tx,
    deployIfDifferent,
    getDeployedContract,
    // fetchReceipt,
    deploy,
    fetchIfDifferent,
    instantiateAndRegisterContract,
    // getTransactionCount,
} = require('rocketh-web3')(rocketh, Web3);

const chainId = rocketh.chainId;

const gas = 6721975; // 7500000

module.exports = async ({namedAccounts, initialRun}) => {
    if (chainId === 1) { // || chainId == 4) { // || chainId == 18) { // TODO remove
        return;
    }
    const {
        deployer,
        assetAdmin,
        assetUpgrader,
        assetBouncerAdmin,
        genesisBouncerAdmin,
        genesisMinter,
    } = namedAccounts;

    const sandContract = getDeployedContract('Sand');

    let assetDeployResult;
    try {
        assetDeployResult = await deployIfDifferent(['data'],
            'Asset',
            {from: deployer, gas},
            'Asset',
            sandContract.options.address,
            deployer, // is set to assetAdmin in a later stage
            deployer, // is set to assetBouncerAdmin in a later stage
        );
        if (initialRun) {
            console.log('gas used for Asset : ' + assetDeployResult.receipt.gasUsed); // TODO only if actually deployed at that time
        }
    } catch (e) {
        console.error('error deploying Asset', e);
    }
    const asset = assetDeployResult.contract;

    await tx({from: deployer, gas}, sandContract, 'setSuperOperator', asset.options.address, true);

    const auctionDifferent = await fetchIfDifferent(['data'],
        'AssetSignedAuction',
        {from: deployer, gas},
        'AssetSignedAuction',
        sandContract.options.address,
        asset.options.address
    );

    if (auctionDifferent) {
        await deployIfDifferent(['data'],
            'AssetSignedAuction',
            {from: deployer, gas},
            'AssetSignedAuction',
            sandContract.options.address,
            asset.options.address
        );

        // TODO outside with if checks to make idempotent
        const assetSignedAuctionContract = getDeployedContract('AssetSignedAuction');
        await tx({from: deployer, gas}, asset, 'setSuperOperator', assetSignedAuctionContract.options.address, true);
        await tx({from: deployer, gas}, sandContract, 'setSuperOperator', assetSignedAuctionContract.options.address, true);

        await tx({from: deployer, gas}, asset, 'changeAdmin', assetAdmin);
    } else {
        const assetSignedAuctionContract = getDeployedContract('AssetSignedAuction');
        if (initialRun) {
            console.log('reusing Auction at ' + assetSignedAuctionContract.options.address);
        }
    }
};
